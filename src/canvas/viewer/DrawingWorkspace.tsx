import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent,
} from 'react';
import OpenSeadragon from 'openseadragon';
import { pixelToCad } from '@/domain/cad-coordinate/calibration';
import type { CalibrationSlot } from '@/domain/cad-coordinate/types';
import type { Point2D } from '@/domain/geometry/types';
import { useAppDispatch } from '@/hooks/useAppDispatch';
import { useAppSelector } from '@/hooks/useAppSelector';
import {
  selectCalibration,
  selectCalibrationDraft,
  selectProjectImage,
} from '@/state/selectors/projectSelectors';
import { selectActiveStep } from '@/state/selectors/uiSelectors';
import {
  setActiveCalibrationPoint,
  setCalibrationImagePoint,
  setImageMetadata,
} from '@/state/slices/projectSlice';
import { setMouseCadPosition, setZoomPercent } from '@/state/slices/uiSlice';

type MarkerPosition = {
  slot: CalibrationSlot;
  left: number;
  top: number;
};

type PanState = {
  pointerId: number;
  lastX: number;
  lastY: number;
} | null;

type LeftPressState = {
  x: number;
  y: number;
} | null;

type ViewerOptions = OpenSeadragon.Options & {
  drawer?: 'canvas' | 'webgl' | 'html' | Array<'canvas' | 'webgl' | 'html'>;
};

const stepHints = {
  calibration: '导入 PNG 底图后，左键标记两个 CAD 基准点；右键或中键按住拖拽可随时平移图纸。',
  drawing: '绘制通道拓扑前，先完成底图导入与坐标校准。',
  devices: '设备放置将在拓扑绘制完成后使用。',
  routing: '路由规划将在设备与拓扑完成后使用。',
  quantity: '算量将在路由与规格推演完成后使用。',
  export: '导出将在校准、绘制和算量完成后使用。',
};

function createImageId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `image-${Date.now()}`;
}

function pointIsInsideImage(point: Point2D, image: { width: number; height: number }) {
  return point.x >= 0 && point.y >= 0 && point.x <= image.width && point.y <= image.height;
}

export function DrawingWorkspace() {
  const dispatch = useAppDispatch();
  const image = useAppSelector(selectProjectImage);
  const activeStep = useAppSelector(selectActiveStep);
  const calibration = useAppSelector(selectCalibration);
  const calibrationDraft = useAppSelector(selectCalibrationDraft);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const viewerElementRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<OpenSeadragon.Viewer | null>(null);
  const imageUrlRef = useRef<string | null>(null);
  const panStateRef = useRef<PanState>(null);
  const leftPressRef = useRef<LeftPressState>(null);
  const markerPointsRef = useRef<Array<{ slot: CalibrationSlot; point: Point2D | null }>>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [markerPositions, setMarkerPositions] = useState<MarkerPosition[]>([]);
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

  const getImagePointFromPointer = useCallback((event: PointerEvent) => {
    const viewer = viewerRef.current;
    const viewerElement = viewerElementRef.current;

    if (!viewer?.viewport || !viewerElement) {
      return null;
    }

    const rect = viewerElement.getBoundingClientRect();
    const viewerPoint = new OpenSeadragon.Point(event.clientX - rect.left, event.clientY - rect.top);
    const imagePoint = viewer.viewport.viewerElementToImageCoordinates(viewerPoint);

    return {
      x: imagePoint.x,
      y: imagePoint.y,
    };
  }, []);

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
      dispatch(
        setImageMetadata({
          id: createImageId(),
          name: file.name,
          width: probe.naturalWidth,
          height: probe.naturalHeight,
        }),
      );
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

    if (!panState || !viewer?.viewport || panState.pointerId !== event.pointerId) {
      return;
    }

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
    updateViewportStatus();
  };

  const handlePointerUp = (event: PointerEvent<HTMLElement>) => {
    const panState = panStateRef.current;
    if (panState?.pointerId === event.pointerId) {
      panStateRef.current = null;
      setIsPanning(false);
      event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }

    if (event.button !== 0 || activeStep !== 'calibration' || !image) {
      leftPressRef.current = null;
      return;
    }

    const press = leftPressRef.current;
    leftPressRef.current = null;

    if (!press || Math.hypot(event.clientX - press.x, event.clientY - press.y) > 5) {
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
  }, [imageUrl, updateMarkerPositions, updateViewportStatus]);

  useEffect(
    () => () => {
      if (imageUrlRef.current) {
        URL.revokeObjectURL(imageUrlRef.current);
        imageUrlRef.current = null;
      }
    },
    [],
  );

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
            <h2>{image ? image.name : '尚未导入 PNG 底图'}</h2>
            <p>{stepHints[activeStep]}</p>
            <button
              className="primary-button"
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              导入 PNG 底图
            </button>
            {importError && <p className="import-error">{importError}</p>}
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
