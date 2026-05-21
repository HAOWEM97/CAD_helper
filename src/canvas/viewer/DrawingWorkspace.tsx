import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent,
} from 'react';
import OpenSeadragon from 'openseadragon';
import { cadToPixel, pixelToCad } from '@/domain/cad-coordinate/calibration';
import type { CadPoint, CalibrationState } from '@/domain/cad-coordinate/types';
import type { CalibrationSlot } from '@/domain/cad-coordinate/types';
import type { Point2D } from '@/domain/geometry/types';
import { channelExistsBetween, getPointToSegmentDistance } from '@/domain/topology/topologyGeometry';
import { useAppDispatch } from '@/hooks/useAppDispatch';
import { useAppSelector } from '@/hooks/useAppSelector';
import {
  selectCalibration,
  selectCalibrationDraft,
  selectConnectionPoints,
  selectProjectImage,
  selectRoutes,
  selectTopology,
} from '@/state/selectors/projectSelectors';
import {
  selectActiveDrawingNodeId,
  selectActiveStep,
  selectLayerVisibility,
  selectSelectedRouteId,
  selectSelectedTopologyObject,
  selectTopologyToolMode,
} from '@/state/selectors/uiSelectors';
import {
  addTopologyChannel,
  addTopologyNode,
  deleteTopologyChannel,
  deleteTopologyNode,
  moveTopologyNode,
  setActiveCalibrationPoint,
  setCalibrationImagePoint,
  setImageMetadata,
} from '@/state/slices/projectSlice';
import {
  setActiveDrawingNodeId,
  setMouseCadPosition,
  setSelectedTopologyObject,
  setZoomPercent,
} from '@/state/slices/uiSlice';
import { loadDraftImageBlob, saveDraftImageBlob } from '@/services/draft/draftPersistence';
import type { ChannelSegment, TopologyGraph, TopologyNode } from '@/domain/project/types';

type MarkerPosition = {
  slot: CalibrationSlot;
  left: number;
  top: number;
};

type OverlayPoint = {
  left: number;
  top: number;
};

type OverlayNodePosition = OverlayPoint & {
  id: string;
};

type OverlayChannelPosition = {
  id: string;
  category: ChannelSegment['category'];
  start: OverlayPoint;
  end: OverlayPoint;
};

type PanState = {
  pointerId: number;
  lastX: number;
  lastY: number;
} | null;

type DragNodeState = {
  pointerId: number;
  nodeId: string;
  startX: number;
  startY: number;
  dragged: boolean;
} | null;

type LeftPressState = {
  x: number;
  y: number;
} | null;

type PreviewState = {
  point: CadPoint;
  axis: 'horizontal' | 'vertical' | null;
  snappedNodeId: string | null;
} | null;

type PreviewAxis = NonNullable<PreviewState>['axis'];

type ViewerOptions = OpenSeadragon.Options & {
  drawer?: 'canvas' | 'webgl' | 'html' | Array<'canvas' | 'webgl' | 'html'>;
};

const stepHints = {
  calibration: '导入 PNG 底图后，左键标记两个 CAD 基准点；右键或中键按住拖拽可随时平移图纸。',
  drawing: '绘制模式下连续点击生成通道网络；选择模式下点击对象并可拖动节点。',
  devices: '设备页用于把拓扑节点设置为设备接线孔。',
  routing: '路由规划将在设备与拓扑完成后使用。',
  quantity: '算量将在路由与规格推演完成后使用。',
  export: '导出将在校准、绘制和算量完成后使用。',
};

function createImageId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `image-${Date.now()}`;
}

function createTopologyId(prefix: 'node' | 'channel') {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.round(Math.random() * 10000)}`;
}

function pointIsInsideImage(point: Point2D, image: { width: number; height: number }) {
  return point.x >= 0 && point.y >= 0 && point.x <= image.width && point.y <= image.height;
}

function nodeById(topology: TopologyGraph, nodeId: string | null) {
  return nodeId ? topology.nodes.find((node) => node.id === nodeId) ?? null : null;
}

export function DrawingWorkspace() {
  const dispatch = useAppDispatch();
  const image = useAppSelector(selectProjectImage);
  const activeStep = useAppSelector(selectActiveStep);
  const calibration = useAppSelector(selectCalibration);
  const calibrationDraft = useAppSelector(selectCalibrationDraft);
  const topology = useAppSelector(selectTopology);
  const routes = useAppSelector(selectRoutes);
  const connectionPoints = useAppSelector(selectConnectionPoints);
  const activeDrawingNodeId = useAppSelector(selectActiveDrawingNodeId);
  const layerVisibility = useAppSelector(selectLayerVisibility);
  const selectedTopologyObject = useAppSelector(selectSelectedTopologyObject);
  const selectedRouteId = useAppSelector(selectSelectedRouteId);
  const snappingEnabled = useAppSelector((state) => state.ui.snappingEnabled);
  const orthogonalLock = useAppSelector((state) => state.ui.orthogonalLock);
  const topologyToolMode = useAppSelector(selectTopologyToolMode);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const viewerElementRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<OpenSeadragon.Viewer | null>(null);
  const imageUrlRef = useRef<string | null>(null);
  const panStateRef = useRef<PanState>(null);
  const dragNodeRef = useRef<DragNodeState>(null);
  const leftPressRef = useRef<LeftPressState>(null);
  const markerPointsRef = useRef<Array<{ slot: CalibrationSlot; point: Point2D | null }>>([]);
  const topologyRef = useRef(topology);
  const calibrationRef = useRef<CalibrationState | null>(calibration);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [restoringImage, setRestoringImage] = useState(false);
  const [markerPositions, setMarkerPositions] = useState<MarkerPosition[]>([]);
  const [topologyNodePositions, setTopologyNodePositions] = useState<OverlayNodePosition[]>([]);
  const [topologyChannelPositions, setTopologyChannelPositions] = useState<
    OverlayChannelPosition[]
  >([]);
  const [preview, setPreview] = useState<PreviewState>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  const updateViewportStatus = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer?.viewport) {
      dispatch(setZoomPercent(100));
      return;
    }

    const imageZoom = viewer.viewport.viewportToImageZoom(viewer.viewport.getZoom(true));
    dispatch(setZoomPercent(Math.max(1, Math.round(imageZoom * 100))));
  }, [dispatch]);

  const updateMarkerPositions = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer?.viewport) {
      setMarkerPositions([]);
      return;
    }

    const nextPositions: MarkerPosition[] = [];

    for (const draftPoint of markerPointsRef.current) {
      if (!draftPoint.point) {
        continue;
      }

      const viewportPoint = viewer.viewport.imageToViewerElementCoordinates(
        new OpenSeadragon.Point(draftPoint.point.x, draftPoint.point.y),
      );
      nextPositions.push({
        slot: draftPoint.slot,
        left: viewportPoint.x,
        top: viewportPoint.y,
      });
    }

    setMarkerPositions(nextPositions);
  }, []);

  const cadToViewerElementPoint = useCallback((point: CadPoint) => {
    const viewer = viewerRef.current;
    const activeCalibration = calibrationRef.current;

    if (!viewer?.viewport || !activeCalibration) {
      return null;
    }

    const imagePoint = cadToPixel(point, activeCalibration);
    const viewerPoint = viewer.viewport.imageToViewerElementCoordinates(
      new OpenSeadragon.Point(imagePoint.x, imagePoint.y),
    );

    return {
      left: viewerPoint.x,
      top: viewerPoint.y,
    };
  }, []);

  const updateTopologyPositions = useCallback(() => {
    const activeTopology = topologyRef.current;
    const nextNodes: OverlayNodePosition[] = [];
    const nextChannels: OverlayChannelPosition[] = [];

    for (const node of activeTopology.nodes) {
      const viewerPoint = cadToViewerElementPoint(node.position);
      if (viewerPoint) {
        nextNodes.push({ id: node.id, ...viewerPoint });
      }
    }

    for (const channel of activeTopology.channels) {
      const startNode = activeTopology.nodes.find((node) => node.id === channel.startNodeId);
      const endNode = activeTopology.nodes.find((node) => node.id === channel.endNodeId);
      const start = startNode ? cadToViewerElementPoint(startNode.position) : null;
      const end = endNode ? cadToViewerElementPoint(endNode.position) : null;

      if (start && end) {
        nextChannels.push({
          id: channel.id,
          category: channel.category,
          start,
          end,
        });
      }
    }

    setTopologyNodePositions(nextNodes);
    setTopologyChannelPositions(nextChannels);
  }, [cadToViewerElementPoint]);

  const getViewerPointFromPointer = useCallback((event: PointerEvent) => {
    const viewerElement = viewerElementRef.current;

    if (!viewerElement) {
      return null;
    }

    const rect = viewerElement.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }, []);

  const getImagePointFromPointer = useCallback((event: PointerEvent) => {
    const viewer = viewerRef.current;
    const viewerPoint = getViewerPointFromPointer(event);

    if (!viewer?.viewport || !viewerPoint) {
      return null;
    }

    const imagePoint = viewer.viewport.viewerElementToImageCoordinates(
      new OpenSeadragon.Point(viewerPoint.x, viewerPoint.y),
    );

    return {
      x: imagePoint.x,
      y: imagePoint.y,
    };
  }, [getViewerPointFromPointer]);

  const viewerPointToCad = useCallback(
    (point: Point2D) => {
      const viewer = viewerRef.current;

      if (!viewer?.viewport || !calibration) {
        return null;
      }

      const imagePoint = viewer.viewport.viewerElementToImageCoordinates(
        new OpenSeadragon.Point(point.x, point.y),
      );

      if (!image || !pointIsInsideImage(imagePoint, image)) {
        return null;
      }

      return pixelToCad({ x: imagePoint.x, y: imagePoint.y }, calibration);
    },
    [calibration, image],
  );

  const getNearestNodeHit = useCallback(
    (viewerPoint: Point2D, threshold = 14) => {
      let nearest: { node: TopologyNode; distance: number } | null = null;

      for (const node of topology.nodes) {
        const point = cadToViewerElementPoint(node.position);
        if (!point) {
          continue;
        }

        const distance = Math.hypot(viewerPoint.x - point.left, viewerPoint.y - point.top);
        if (distance <= threshold && (!nearest || distance < nearest.distance)) {
          nearest = { node, distance };
        }
      }

      return nearest;
    },
    [cadToViewerElementPoint, topology.nodes],
  );

  const getChannelHit = useCallback(
    (viewerPoint: Point2D, threshold = 8) => {
      let nearest: { channel: ChannelSegment; distance: number } | null = null;

      for (const channel of topology.channels) {
        const startNode = topology.nodes.find((node) => node.id === channel.startNodeId);
        const endNode = topology.nodes.find((node) => node.id === channel.endNodeId);
        const start = startNode ? cadToViewerElementPoint(startNode.position) : null;
        const end = endNode ? cadToViewerElementPoint(endNode.position) : null;

        if (!start || !end) {
          continue;
        }

        const distance = getPointToSegmentDistance(
          viewerPoint,
          { x: start.left, y: start.top },
          { x: end.left, y: end.top },
        );

        if (distance <= threshold && (!nearest || distance < nearest.distance)) {
          nearest = { channel, distance };
        }
      }

      return nearest;
    },
    [cadToViewerElementPoint, topology.channels, topology.nodes],
  );

  const resolveDrawingPoint = useCallback(
    (event: PointerEvent, startNode: TopologyNode | null) => {
      const rawViewerPoint = getViewerPointFromPointer(event);
      if (!rawViewerPoint || !calibration) {
        return null;
      }

      let viewerPoint = rawViewerPoint;
      let axis: PreviewAxis = null;

      if (startNode) {
        const startViewerPoint = cadToViewerElementPoint(startNode.position);
        if (startViewerPoint) {
          const dx = Math.abs(rawViewerPoint.x - startViewerPoint.left);
          const dy = Math.abs(rawViewerPoint.y - startViewerPoint.top);

          if (orthogonalLock) {
            if (dx >= dy) {
              viewerPoint = { x: rawViewerPoint.x, y: startViewerPoint.top };
              axis = 'horizontal';
            } else {
              viewerPoint = { x: startViewerPoint.left, y: rawViewerPoint.y };
              axis = 'vertical';
            }
          } else if (snappingEnabled) {
            const horizontalDistance = Math.abs(rawViewerPoint.y - startViewerPoint.top);
            const verticalDistance = Math.abs(rawViewerPoint.x - startViewerPoint.left);
            if (horizontalDistance <= 10 || verticalDistance <= 10) {
              if (horizontalDistance <= verticalDistance) {
                viewerPoint = { x: rawViewerPoint.x, y: startViewerPoint.top };
                axis = 'horizontal';
              } else {
                viewerPoint = { x: startViewerPoint.left, y: rawViewerPoint.y };
                axis = 'vertical';
              }
            }
          }
        }
      }

      const nodeSnap = snappingEnabled ? getNearestNodeHit(viewerPoint) : null;
      if (nodeSnap) {
        return {
          point: nodeSnap.node.position,
          axis,
          snappedNodeId: nodeSnap.node.id,
        };
      }

      const cadPoint = viewerPointToCad(viewerPoint);
      if (!cadPoint) {
        return null;
      }

      return {
        point: cadPoint,
        axis,
        snappedNodeId: null,
      };
    },
    [
      cadToViewerElementPoint,
      calibration,
      getNearestNodeHit,
      getViewerPointFromPointer,
      orthogonalLock,
      snappingEnabled,
      viewerPointToCad,
    ],
  );

  const updateMouseCadPosition = useCallback(
    (event: PointerEvent) => {
      if (!image || !calibration) {
        dispatch(setMouseCadPosition(null));
        return;
      }

      const imagePoint = getImagePointFromPointer(event);
      if (!imagePoint || !pointIsInsideImage(imagePoint, image)) {
        dispatch(setMouseCadPosition(null));
        return;
      }

      dispatch(setMouseCadPosition(pixelToCad(imagePoint, calibration)));
    },
    [calibration, dispatch, getImagePointFromPointer, image],
  );

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    if (file.type !== 'image/png') {
      setImportError('请导入 PNG 格式的底图。');
      return;
    }

    const nextUrl = URL.createObjectURL(file);
    const probe = new Image();

    probe.onload = () => {
      if (imageUrlRef.current) {
        URL.revokeObjectURL(imageUrlRef.current);
      }

      imageUrlRef.current = nextUrl;
      setImageUrl(nextUrl);
      setImportError(null);
      const sameImage =
        image?.name === file.name &&
        image.width === probe.naturalWidth &&
        image.height === probe.naturalHeight;

      if (!sameImage) {
        dispatch(
          setImageMetadata({
            id: createImageId(),
            name: file.name,
            width: probe.naturalWidth,
            height: probe.naturalHeight,
          }),
        );
      }

      void saveDraftImageBlob(file).catch(() => {
        setImportError('底图已导入，但浏览器暂存失败；刷新后可能需要重新选择底图。');
      });
      dispatch(setMouseCadPosition(null));
    };

    probe.onerror = () => {
      URL.revokeObjectURL(nextUrl);
      setImportError('无法读取这张 PNG 底图，请检查文件是否损坏。');
    };

    probe.src = nextUrl;
  };

  const handlePointerDown = (event: PointerEvent<HTMLElement>) => {
    if (!imageUrl || !viewerRef.current) {
      return;
    }

    if (event.button === 1 || event.button === 2) {
      event.preventDefault();
      panStateRef.current = {
        pointerId: event.pointerId,
        lastX: event.clientX,
        lastY: event.clientY,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsPanning(true);
      return;
    }

    if (event.button === 0) {
      const viewerPoint = getViewerPointFromPointer(event);
      if (activeStep === 'drawing' && topologyToolMode === 'select' && viewerPoint) {
        const nodeHit = getNearestNodeHit(viewerPoint);
        if (nodeHit) {
          event.preventDefault();
          dragNodeRef.current = {
            pointerId: event.pointerId,
            nodeId: nodeHit.node.id,
            startX: event.clientX,
            startY: event.clientY,
            dragged: false,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
          dispatch(setSelectedTopologyObject({ type: 'node', id: nodeHit.node.id }));
          return;
        }
      }

      leftPressRef.current = {
        x: event.clientX,
        y: event.clientY,
      };
    }
  };

  const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
    updateMouseCadPosition(event);

    const panState = panStateRef.current;
    const viewer = viewerRef.current;

    if (panState && viewer?.viewport && panState.pointerId === event.pointerId) {
      event.preventDefault();
      const dx = event.clientX - panState.lastX;
      const dy = event.clientY - panState.lastY;
      const panDelta = viewer.viewport.deltaPointsFromPixels(
        new OpenSeadragon.Point(-dx, -dy),
        true,
      );

      viewer.viewport.panBy(panDelta);
      viewer.viewport.applyConstraints();
      panStateRef.current = {
        pointerId: event.pointerId,
        lastX: event.clientX,
        lastY: event.clientY,
      };
      updateMarkerPositions();
      updateTopologyPositions();
      updateViewportStatus();
      return;
    }

    const dragState = dragNodeRef.current;
    if (dragState?.pointerId === event.pointerId) {
      event.preventDefault();
      const viewerPoint = getViewerPointFromPointer(event);
      const nextPosition = viewerPoint ? viewerPointToCad(viewerPoint) : null;

      if (nextPosition) {
        dispatch(moveTopologyNode({ nodeId: dragState.nodeId, position: nextPosition }));
        dragNodeRef.current = {
          ...dragState,
          dragged:
            dragState.dragged ||
            Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY) > 3,
        };
      }
      return;
    }

    if (activeStep !== 'drawing' && activeStep !== 'devices') {
      return;
    }

    const viewerPoint = getViewerPointFromPointer(event);
    if (!viewerPoint) {
      setHoveredNodeId(null);
      setPreview(null);
      return;
    }

    if (activeStep === 'devices') {
      const nodeHit = getNearestNodeHit(viewerPoint);
      setHoveredNodeId(nodeHit?.node.id ?? null);
      setPreview(null);
      return;
    }

    if (topologyToolMode === 'draw') {
      const startNode = nodeById(topology, activeDrawingNodeId);
      const resolvedPoint = resolveDrawingPoint(event, startNode);
      setPreview(startNode && resolvedPoint ? resolvedPoint : null);
      setHoveredNodeId(resolvedPoint?.snappedNodeId ?? getNearestNodeHit(viewerPoint)?.node.id ?? null);
      return;
    }

    const nodeHit = getNearestNodeHit(viewerPoint);
    setHoveredNodeId(nodeHit?.node.id ?? null);
  };

  const handlePointerUp = (event: PointerEvent<HTMLElement>) => {
    const panState = panStateRef.current;
    if (panState?.pointerId === event.pointerId) {
      panStateRef.current = null;
      setIsPanning(false);
      event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }

    const dragState = dragNodeRef.current;
    if (dragState?.pointerId === event.pointerId) {
      dragNodeRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }

    if (event.button !== 0 || !image) {
      leftPressRef.current = null;
      return;
    }

    const press = leftPressRef.current;
    leftPressRef.current = null;

    if (!press || Math.hypot(event.clientX - press.x, event.clientY - press.y) > 5) {
      return;
    }

    if (activeStep === 'devices') {
      const viewerPoint = getViewerPointFromPointer(event);
      if (!viewerPoint || !calibration) {
        return;
      }

      const nodeHit = getNearestNodeHit(viewerPoint);
      dispatch(setSelectedTopologyObject(nodeHit ? { type: 'node', id: nodeHit.node.id } : null));
      return;
    }

    if (activeStep === 'drawing') {
      const viewerPoint = getViewerPointFromPointer(event);
      if (!viewerPoint || !calibration) {
        return;
      }

      if (topologyToolMode === 'select') {
        const nodeHit = getNearestNodeHit(viewerPoint);
        if (nodeHit) {
          dispatch(setSelectedTopologyObject({ type: 'node', id: nodeHit.node.id }));
          return;
        }

        const channelHit = getChannelHit(viewerPoint);
        dispatch(
          setSelectedTopologyObject(
            channelHit ? { type: 'channel', id: channelHit.channel.id } : null,
          ),
        );
        return;
      }

      const startNode = nodeById(topology, activeDrawingNodeId);
      const resolvedPoint = resolveDrawingPoint(event, startNode);
      if (!resolvedPoint) {
        return;
      }

      const endNodeId = resolvedPoint.snappedNodeId ?? createTopologyId('node');
      if (!resolvedPoint.snappedNodeId) {
        dispatch(addTopologyNode({ id: endNodeId, position: resolvedPoint.point }));
      }

      if (!startNode) {
        dispatch(setActiveDrawingNodeId(endNodeId));
        dispatch(setSelectedTopologyObject({ type: 'node', id: endNodeId }));
        setPreview(null);
        return;
      }

      if (
        startNode.id !== endNodeId &&
        !channelExistsBetween(topology.channels, startNode.id, endNodeId)
      ) {
        const channelId = createTopologyId('channel');
        dispatch(
          addTopologyChannel({
            id: channelId,
            startNodeId: startNode.id,
            endNodeId,
          }),
        );
        dispatch(setSelectedTopologyObject({ type: 'channel', id: channelId }));
      } else {
        dispatch(setSelectedTopologyObject({ type: 'node', id: endNodeId }));
      }

      dispatch(setActiveDrawingNodeId(endNodeId));
      setPreview(null);
      return;
    }

    if (activeStep !== 'calibration') {
      return;
    }

    const imagePoint = getImagePointFromPointer(event);
    if (!imagePoint || !pointIsInsideImage(imagePoint, image)) {
      return;
    }

    const activeSlot = calibrationDraft.activePoint;
    dispatch(setCalibrationImagePoint({ slot: activeSlot, point: imagePoint }));

    if (activeSlot === 'A' && !calibrationDraft.pointB.imagePoint) {
      dispatch(setActiveCalibrationPoint('B'));
    }
  };

  const handlePointerCancel = (event: PointerEvent<HTMLElement>) => {
    if (panStateRef.current?.pointerId === event.pointerId) {
      panStateRef.current = null;
      setIsPanning(false);
    }
    if (dragNodeRef.current?.pointerId === event.pointerId) {
      dragNodeRef.current = null;
    }
    leftPressRef.current = null;
  };

  useEffect(() => {
    markerPointsRef.current = [
      { slot: 'A', point: calibrationDraft.pointA.imagePoint },
      { slot: 'B', point: calibrationDraft.pointB.imagePoint },
    ];
    updateMarkerPositions();
  }, [calibrationDraft.pointA.imagePoint, calibrationDraft.pointB.imagePoint, updateMarkerPositions]);

  useEffect(() => {
    calibrationRef.current = calibration;
    updateTopologyPositions();
  }, [calibration, updateTopologyPositions]);

  useEffect(() => {
    topologyRef.current = topology;
    updateTopologyPositions();

    if (activeDrawingNodeId && !topology.nodes.some((node) => node.id === activeDrawingNodeId)) {
      dispatch(setActiveDrawingNodeId(null));
      setPreview(null);
    }
  }, [activeDrawingNodeId, dispatch, topology, updateTopologyPositions]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (activeStep !== 'drawing') {
        return;
      }

      if (event.key === 'Escape') {
        dispatch(setActiveDrawingNodeId(null));
        setPreview(null);
        return;
      }

      if (event.key !== 'Delete' && event.key !== 'Backspace') {
        return;
      }

      if (!selectedTopologyObject) {
        return;
      }

      event.preventDefault();
      if (selectedTopologyObject.type === 'node') {
        dispatch(deleteTopologyNode(selectedTopologyObject.id));
      } else {
        dispatch(deleteTopologyChannel(selectedTopologyObject.id));
      }
      dispatch(setSelectedTopologyObject(null));
      setPreview(null);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeStep, dispatch, selectedTopologyObject]);

  useEffect(() => {
    let cancelled = false;

    if (!image || imageUrl || imageUrlRef.current) {
      return () => {
        cancelled = true;
      };
    }

    setRestoringImage(true);
    void loadDraftImageBlob()
      .then((blob) => {
        if (cancelled || !blob) {
          return;
        }

        const nextUrl = URL.createObjectURL(blob);
        if (imageUrlRef.current) {
          URL.revokeObjectURL(imageUrlRef.current);
        }

        imageUrlRef.current = nextUrl;
        setImageUrl(nextUrl);
      })
      .finally(() => {
        if (!cancelled) {
          setRestoringImage(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [image, imageUrl]);

  useEffect(() => {
    if (!imageUrl || !viewerElementRef.current) {
      return undefined;
    }

    const viewerOptions: ViewerOptions = {
      element: viewerElementRef.current,
      showNavigator: true,
      navigatorPosition: 'BOTTOM_LEFT',
      navigatorHeight: '124px',
      navigatorWidth: '176px',
      showNavigationControl: false,
      drawer: 'canvas',
      visibilityRatio: 1,
      constrainDuringPan: true,
      minZoomImageRatio: 0.08,
      maxZoomPixelRatio: 8,
      immediateRender: true,
      blendTime: 0,
      alwaysBlend: false,
      gestureSettingsMouse: {
        clickToZoom: false,
        dblClickToZoom: false,
        dragToPan: false,
        scrollToZoom: true,
      },
      tileSources: new OpenSeadragon.ImageTileSource({
        url: imageUrl,
        buildPyramid: false,
      }),
    };

    const viewer = OpenSeadragon(viewerOptions);

    viewerRef.current = viewer;
    const refreshViewState = () => {
      updateMarkerPositions();
      updateTopologyPositions();
      updateViewportStatus();
    };

    viewer.addHandler('open', refreshViewState);
    viewer.addHandler('animation', refreshViewState);
    viewer.addHandler('resize', refreshViewState);
    viewer.addHandler('zoom', refreshViewState);
    viewer.addHandler('pan', refreshViewState);

    return () => {
      viewer.removeHandler('open', refreshViewState);
      viewer.removeHandler('animation', refreshViewState);
      viewer.removeHandler('resize', refreshViewState);
      viewer.removeHandler('zoom', refreshViewState);
      viewer.removeHandler('pan', refreshViewState);
      viewer.destroy();
      viewerRef.current = null;
      setMarkerPositions([]);
    };
  }, [imageUrl, updateMarkerPositions, updateTopologyPositions, updateViewportStatus]);

  useEffect(
    () => () => {
      if (imageUrlRef.current) {
        URL.revokeObjectURL(imageUrlRef.current);
        imageUrlRef.current = null;
      }
    },
    [],
  );

  const activeDrawingNode = nodeById(topology, activeDrawingNodeId);
  const previewStart = activeDrawingNode ? cadToViewerElementPoint(activeDrawingNode.position) : null;
  const previewEnd = preview ? cadToViewerElementPoint(preview.point) : null;
  const previewAxis = preview?.axis ?? null;
  const drawingBlocked = activeStep === 'drawing' && (!imageUrl || !calibration);
  const highlightedRouteChannelIds = new Set(
    routes
      .filter((route) => route.status === 'valid' && (!selectedRouteId || route.id === selectedRouteId))
      .flatMap((route) => route.pathSegmentIds),
  );
  const connectionNodeIds = new Set(connectionPoints.map((point) => point.nodeId));

  return (
    <main
      className={isPanning ? 'drawing-workspace is-panning' : 'drawing-workspace'}
      onAuxClick={(event) => event.preventDefault()}
      onContextMenu={(event) => event.preventDefault()}
      onPointerCancel={handlePointerCancel}
      onPointerDown={handlePointerDown}
      onPointerLeave={() => dispatch(setMouseCadPosition(null))}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div className="canvas-stage">
        <div className="grid-backdrop" />
        <div className="osd-viewer" ref={viewerElementRef} />

        {layerVisibility.topology && topologyNodePositions.length + topologyChannelPositions.length > 0 && (
          <svg className="topology-overlay" aria-hidden="true">
            {topologyChannelPositions.map((channel) => (
              <line
                className={[
                  'topology-channel',
                  `topology-channel-${channel.category}`,
                  layerVisibility.cableRoutes && highlightedRouteChannelIds.has(channel.id)
                    ? 'route-highlight'
                    : '',
                  selectedTopologyObject?.type === 'channel' &&
                  selectedTopologyObject.id === channel.id
                    ? 'selected'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                key={channel.id}
                x1={channel.start.left}
                x2={channel.end.left}
                y1={channel.start.top}
                y2={channel.end.top}
              />
            ))}

            {previewStart && previewEnd && (
              <line
                className={previewAxis ? 'topology-preview axis-snapped' : 'topology-preview'}
                x1={previewStart.left}
                x2={previewEnd.left}
                y1={previewStart.top}
                y2={previewEnd.top}
              />
            )}

            {topologyNodePositions.map((node) => (
              <g
                className={[
                  'topology-node',
                  selectedTopologyObject?.type === 'node' && selectedTopologyObject.id === node.id
                    ? 'selected'
                    : '',
                  connectionNodeIds.has(node.id) ? 'connection-point' : '',
                  hoveredNodeId === node.id || preview?.snappedNodeId === node.id ? 'snapped' : '',
                  activeDrawingNodeId === node.id ? 'active-start' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                key={node.id}
                transform={`translate(${node.left} ${node.top})`}
              >
                <circle r="6" />
              </g>
            ))}
          </svg>
        )}

        {markerPositions.length > 0 && (
          <div className="calibration-overlay" aria-hidden="true">
            {markerPositions.map((marker) => (
              <span
                className={
                  marker.slot === calibrationDraft.activePoint
                    ? 'calibration-marker active'
                    : 'calibration-marker'
                }
                key={marker.slot}
                style={{ left: marker.left, top: marker.top }}
              >
                <span className="calibration-marker-label">{marker.slot}</span>
              </span>
            ))}
          </div>
        )}

        {!imageUrl && (
          <div className="workspace-empty-card">
            <span className="stage-label">图纸交互区</span>
            <h2>
              {restoringImage
                ? '正在恢复暂存底图'
                : image
                  ? `${image.name}（需要重新选择底图）`
                  : '尚未导入 PNG 底图'}
            </h2>
            <p>
              {restoringImage
                ? '正在从浏览器本地暂存中恢复 PNG 底图和工程草稿。'
                : stepHints[activeStep]}
            </p>
            <button
              className="primary-button"
              disabled={restoringImage}
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              导入 PNG 底图
            </button>
            {importError && <p className="import-error">{importError}</p>}
          </div>
        )}

        {drawingBlocked && imageUrl && (
          <div className="workspace-blocking-card">
            <span className="stage-label">通道绘制</span>
            <h2>先完成坐标校准</h2>
            <p>拓扑节点会保存为 CAD 坐标；完成两个参考点校准后即可开始绘制通道网络。</p>
          </div>
        )}

        {imageUrl && (
          <div className="viewer-hud">
            <div>
              <strong>{image?.name}</strong>
              <span>
                {image?.width} x {image?.height}px
              </span>
            </div>
            <button
              className="ghost-button compact"
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              更换底图
            </button>
          </div>
        )}

        <input
          accept="image/png"
          className="file-input"
          onChange={handleFileChange}
          ref={fileInputRef}
          type="file"
        />
      </div>
    </main>
  );
}
