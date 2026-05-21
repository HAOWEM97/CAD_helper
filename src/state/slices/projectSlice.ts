import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { createCalibration } from '@/domain/cad-coordinate/calibration';
import type {
  CalibrationDraft,
  CalibrationSlot,
  CalibrationState,
} from '@/domain/cad-coordinate/types';
import type { Point2D } from '@/domain/geometry/types';
import {
  defaultCableSpecs,
  defaultConnectionPointPresets,
  defaultDeviceTypePresets,
} from '@/domain/library/defaultDeviceLibrary';
import type {
  CableRoute,
  CableSpec,
  ChannelCategory,
  ChannelSegment,
  ConnectionPointPreset,
  DeviceConnectionPoint,
  DeviceInstance,
  DeviceTypePreset,
  ImageMetadata,
  Project,
  TopologyNode,
} from '@/domain/project/types';
import { connectionItemsToCableIds } from '@/domain/routing/connectionValidation';

type ProjectState = {
  current: Project;
};

const createEmptyCalibrationDraft = (): CalibrationDraft => ({
  activePoint: 'A',
  pointA: {
    imagePoint: null,
    cadPoint: { x: null, y: null },
  },
  pointB: {
    imagePoint: null,
    cadPoint: { x: null, y: null },
  },
});

const initialProject: Project = {
  id: 'local-project',
  name: '未命名工程',
  image: null,
  calibrationDraft: createEmptyCalibrationDraft(),
  calibration: null,
  topology: {
    nodes: [],
    channels: [],
  },
  deviceInstances: [],
  connectionPoints: [],
  cableSpecs: defaultCableSpecs,
  connectionPointPresets: defaultConnectionPointPresets,
  deviceTypePresets: defaultDeviceTypePresets,
  routes: [],
};

const initialState: ProjectState = {
  current: initialProject,
};

function getDraftPoint(draft: CalibrationDraft, slot: CalibrationSlot) {
  return slot === 'A' ? draft.pointA : draft.pointB;
}

function cadPointIsComplete(
  point: { x: number | null; y: number | null },
): point is { x: number; y: number } {
  return typeof point.x === 'number' && typeof point.y === 'number';
}

function refreshCalibrationFromDraft(project: Project) {
  const { pointA, pointB } = project.calibrationDraft;

  if (
    !pointA.imagePoint ||
    !pointB.imagePoint ||
    !cadPointIsComplete(pointA.cadPoint) ||
    !cadPointIsComplete(pointB.cadPoint)
  ) {
    project.calibration = null;
    return;
  }

  try {
    project.calibration = createCalibration(
      pointA.imagePoint,
      pointB.imagePoint,
      { x: pointA.cadPoint.x, y: pointA.cadPoint.y },
      { x: pointB.cadPoint.x, y: pointB.cadPoint.y },
    );
    project.routes = project.routes.map((route) => ({
      ...route,
      status: 'needs-recalculation',
    }));
  } catch {
    project.calibration = null;
  }
}

function markRoutesUsingChannelsForRecalculation(project: Project, channelIds: Set<string>) {
  if (channelIds.size === 0) {
    return;
  }

  project.routes = project.routes.map((route) =>
    route.pathSegmentIds.some((segmentId) => channelIds.has(segmentId))
      ? { ...route, status: 'needs-recalculation' }
      : route,
  );
}

function rebuildChannelCableIdsFromRoutes(project: Project) {
  const pointById = new Map(project.connectionPoints.map((point) => [point.id, point]));
  const cableIdsByChannelId = new Map<string, Set<string>>();

  for (const route of project.routes) {
    const fromPoint = pointById.get(route.fromConnectionPointId);
    const cableIds = fromPoint ? connectionItemsToCableIds(fromPoint.items, project.cableSpecs) : [];
    for (const channelId of route.pathSegmentIds) {
      const channelCableIds = cableIdsByChannelId.get(channelId) ?? new Set<string>();
      for (const cableId of cableIds) {
        channelCableIds.add(cableId);
      }
      cableIdsByChannelId.set(channelId, channelCableIds);
    }
  }

  for (const channel of project.topology.channels) {
    channel.cableIds = Array.from(cableIdsByChannelId.get(channel.id) ?? []);
  }
}

function extractTypeNumber(name: string, prefix: string) {
  if (!name.startsWith(prefix)) {
    return null;
  }

  const suffix = name.slice(prefix.length);
  if (!/^[1-9]\d*$/.test(suffix)) {
    return null;
  }

  return Number(suffix);
}

export function createDefaultDeviceName(
  devices: DeviceInstance[],
  namePrefix: string,
  excludeDeviceId?: string,
) {
  const trimmedPrefix = namePrefix.trim() || '设备';
  const usedNumbers = new Set<number>();

  for (const device of devices) {
    if (device.id === excludeDeviceId) {
      continue;
    }

    const number = extractTypeNumber(device.name, trimmedPrefix);
    if (number !== null) {
      usedNumbers.add(number);
    }
  }

  let nextNumber = 1;
  while (usedNumbers.has(nextNumber)) {
    nextNumber += 1;
  }

  return `${trimmedPrefix}${nextNumber}`;
}

function channelConnectsSameNodes(
  channel: ChannelSegment,
  startNodeId: string,
  endNodeId: string,
) {
  return (
    (channel.startNodeId === startNodeId && channel.endNodeId === endNodeId) ||
    (channel.startNodeId === endNodeId && channel.endNodeId === startNodeId)
  );
}

function upsertById<T extends { id: string }>(items: T[], nextItem: T) {
  const index = items.findIndex((item) => item.id === nextItem.id);
  if (index >= 0) {
    items[index] = nextItem;
  } else {
    items.push(nextItem);
  }
}

const projectSlice = createSlice({
  name: 'project',
  initialState,
  reducers: {
    renameProject(state, action: PayloadAction<string>) {
      state.current.name = action.payload.trim() || initialProject.name;
    },
    setImageMetadata(state, action: PayloadAction<ImageMetadata>) {
      state.current.image = action.payload;
      state.current.calibrationDraft = createEmptyCalibrationDraft();
      state.current.calibration = null;
    },
    setActiveCalibrationPoint(state, action: PayloadAction<CalibrationSlot>) {
      state.current.calibrationDraft.activePoint = action.payload;
    },
    setCalibrationImagePoint(
      state,
      action: PayloadAction<{ slot: CalibrationSlot; point: Point2D }>,
    ) {
      getDraftPoint(state.current.calibrationDraft, action.payload.slot).imagePoint =
        action.payload.point;
      refreshCalibrationFromDraft(state.current);
    },
    setCalibrationCadCoordinate(
      state,
      action: PayloadAction<{
        slot: CalibrationSlot;
        axis: 'x' | 'y';
        value: number | null;
      }>,
    ) {
      getDraftPoint(state.current.calibrationDraft, action.payload.slot).cadPoint[
        action.payload.axis
      ] = action.payload.value;
      refreshCalibrationFromDraft(state.current);
    },
    setCalibration(state, action: PayloadAction<CalibrationState>) {
      state.current.calibration = action.payload;
      state.current.routes = state.current.routes.map((route) => ({
        ...route,
        status: 'needs-recalculation',
      }));
    },
    addTopologyNode(state, action: PayloadAction<TopologyNode>) {
      if (state.current.topology.nodes.some((node) => node.id === action.payload.id)) {
        return;
      }

      state.current.topology.nodes.push(action.payload);
    },
    addTopologyChannel(
      state,
      action: PayloadAction<{
        id: string;
        startNodeId: string;
        endNodeId: string;
        category?: ChannelCategory;
      }>,
    ) {
      const { id, startNodeId, endNodeId, category = 'tray' } = action.payload;
      if (startNodeId === endNodeId) {
        return;
      }

      const nodeIds = new Set(state.current.topology.nodes.map((node) => node.id));
      if (!nodeIds.has(startNodeId) || !nodeIds.has(endNodeId)) {
        return;
      }

      const duplicate = state.current.topology.channels.some((channel) =>
        channelConnectsSameNodes(channel, startNodeId, endNodeId),
      );

      if (duplicate) {
        return;
      }

      state.current.topology.channels.push({
        id,
        startNodeId,
        endNodeId,
        category,
        cableIds: [],
      });
    },
    moveTopologyNode(
      state,
      action: PayloadAction<{ nodeId: string; position: TopologyNode['position'] }>,
    ) {
      const node = state.current.topology.nodes.find((item) => item.id === action.payload.nodeId);
      if (!node) {
        return;
      }

      node.position = action.payload.position;
      const connectedChannelIds = new Set(
        state.current.topology.channels
          .filter(
            (channel) =>
              channel.startNodeId === action.payload.nodeId ||
              channel.endNodeId === action.payload.nodeId,
          )
          .map((channel) => channel.id),
      );
      markRoutesUsingChannelsForRecalculation(state.current, connectedChannelIds);
    },
    deleteTopologyNode(state, action: PayloadAction<string>) {
      const nodeId = action.payload;
      const connectedChannelIds = new Set(
        state.current.topology.channels
          .filter((channel) => channel.startNodeId === nodeId || channel.endNodeId === nodeId)
          .map((channel) => channel.id),
      );
      const deletedPointIds = new Set(
        state.current.connectionPoints
          .filter((point) => point.nodeId === nodeId)
          .map((point) => point.id),
      );

      state.current.topology.nodes = state.current.topology.nodes.filter(
        (node) => node.id !== nodeId,
      );
      state.current.topology.channels = state.current.topology.channels.filter(
        (channel) => channel.startNodeId !== nodeId && channel.endNodeId !== nodeId,
      );
      state.current.connectionPoints = state.current.connectionPoints.filter(
        (point) => point.nodeId !== nodeId,
      );
      state.current.routes = state.current.routes.filter(
        (route) =>
          !deletedPointIds.has(route.fromConnectionPointId) &&
          !deletedPointIds.has(route.toConnectionPointId) &&
          !route.pathSegmentIds.some((segmentId) => connectedChannelIds.has(segmentId)),
      );
      rebuildChannelCableIdsFromRoutes(state.current);
    },
    deleteTopologyChannel(state, action: PayloadAction<string>) {
      const channelId = action.payload;
      state.current.topology.channels = state.current.topology.channels.filter(
        (channel) => channel.id !== channelId,
      );
      markRoutesUsingChannelsForRecalculation(state.current, new Set([channelId]));
      rebuildChannelCableIdsFromRoutes(state.current);
    },
    updateTopologyChannelCategory(
      state,
      action: PayloadAction<{
        channelId?: string;
        channelIds?: string[];
        category: ChannelCategory;
      }>,
    ) {
      const targetChannelIds = new Set(
        [
          ...(action.payload.channelId ? [action.payload.channelId] : []),
          ...(action.payload.channelIds ?? []),
        ].filter(Boolean),
      );

      if (targetChannelIds.size === 0) {
        return;
      }

      const updatedChannelIds = new Set<string>();
      for (const channel of state.current.topology.channels) {
        if (!targetChannelIds.has(channel.id)) {
          continue;
        }

        channel.category = action.payload.category;
        updatedChannelIds.add(channel.id);
      }

      markRoutesUsingChannelsForRecalculation(state.current, updatedChannelIds);
    },
    upsertCableSpec(state, action: PayloadAction<CableSpec>) {
      const spec = action.payload;
      if (!spec.usage.trim() || !spec.model.trim()) {
        return;
      }
      const duplicate = state.current.cableSpecs.find(
        (item) => item.usage === spec.usage && item.model === spec.model,
      );
      upsertById(state.current.cableSpecs, duplicate ? { ...spec, id: duplicate.id } : spec);
    },
    upsertConnectionPointPreset(state, action: PayloadAction<ConnectionPointPreset>) {
      const preset = action.payload;
      if (!preset.name.trim() || preset.items.length === 0) {
        return;
      }
      const duplicate = state.current.connectionPointPresets.find(
        (item) => item.name === preset.name,
      );
      upsertById(
        state.current.connectionPointPresets,
        duplicate ? { ...preset, id: duplicate.id } : preset,
      );
    },
    upsertDeviceTypePreset(state, action: PayloadAction<DeviceTypePreset>) {
      const preset = action.payload;
      if (!preset.deviceType.trim() || preset.ports.length === 0) {
        return;
      }
      const duplicate = state.current.deviceTypePresets.find(
        (item) => item.deviceType === preset.deviceType,
      );
      upsertById(
        state.current.deviceTypePresets,
        duplicate ? { ...preset, id: duplicate.id } : preset,
      );
    },
    upsertDeviceInstance(state, action: PayloadAction<DeviceInstance>) {
      const device = action.payload;
      if (!device.name.trim() || !device.deviceType.trim()) {
        return;
      }
      upsertById(state.current.deviceInstances, device);
    },
    upsertConnectionPoint(state, action: PayloadAction<DeviceConnectionPoint>) {
      const point = action.payload;
      const nodeExists = state.current.topology.nodes.some((node) => node.id === point.nodeId);
      const deviceExists =
        point.mode === 'custom' ||
        state.current.deviceInstances.some((device) => device.id === point.deviceId);
      if (!nodeExists || !deviceExists || !point.portType.trim() || point.items.length === 0) {
        return;
      }

      const existing = state.current.connectionPoints.find((item) => item.nodeId === point.nodeId);
      const nextPoint = existing ? { ...point, id: existing.id } : point;
      upsertById(state.current.connectionPoints, nextPoint);
      state.current.routes = state.current.routes.map((route) =>
        route.fromConnectionPointId === nextPoint.id || route.toConnectionPointId === nextPoint.id
          ? { ...route, status: 'needs-recalculation' }
          : route,
      );
      rebuildChannelCableIdsFromRoutes(state.current);
    },
    deleteConnectionPoint(state, action: PayloadAction<string>) {
      const pointId = action.payload;
      const deletedPoint = state.current.connectionPoints.find((point) => point.id === pointId);
      state.current.connectionPoints = state.current.connectionPoints.filter(
        (point) => point.id !== pointId,
      );
      state.current.routes = state.current.routes.filter(
        (route) =>
          route.fromConnectionPointId !== pointId && route.toConnectionPointId !== pointId,
      );
      if (
        deletedPoint?.deviceId &&
        !state.current.connectionPoints.some((point) => point.deviceId === deletedPoint.deviceId)
      ) {
        state.current.deviceInstances = state.current.deviceInstances.filter(
          (device) => device.id !== deletedPoint.deviceId,
        );
      }
      rebuildChannelCableIdsFromRoutes(state.current);
    },
    clearConnectionPointAssignments(state) {
      state.current.connectionPoints = [];
      state.current.deviceInstances = [];
      state.current.routes = [];
      rebuildChannelCableIdsFromRoutes(state.current);
    },
    createCableRoute(state, action: PayloadAction<CableRoute>) {
      const route = {
        ...action.payload,
        pathSegmentIds: Array.from(new Set(action.payload.pathSegmentIds)),
      };
      const pointIds = new Set(state.current.connectionPoints.map((point) => point.id));
      const channelIds = new Set(state.current.topology.channels.map((channel) => channel.id));
      if (
        !pointIds.has(route.fromConnectionPointId) ||
        !pointIds.has(route.toConnectionPointId) ||
        route.fromConnectionPointId === route.toConnectionPointId ||
        route.pathSegmentIds.length === 0 ||
        route.pathSegmentIds.some((segmentId) => !channelIds.has(segmentId))
      ) {
        return;
      }

      state.current.routes = [
        ...state.current.routes.filter((item) => item.id !== route.id),
        { ...route, status: 'valid' },
      ];
      rebuildChannelCableIdsFromRoutes(state.current);
    },
    deleteCableRoute(state, action: PayloadAction<string>) {
      state.current.routes = state.current.routes.filter((route) => route.id !== action.payload);
      rebuildChannelCableIdsFromRoutes(state.current);
    },
  },
});

export const {
  addTopologyChannel,
  addTopologyNode,
  clearConnectionPointAssignments,
  createCableRoute,
  deleteCableRoute,
  deleteConnectionPoint,
  deleteTopologyChannel,
  deleteTopologyNode,
  moveTopologyNode,
  renameProject,
  setActiveCalibrationPoint,
  setCalibration,
  setCalibrationCadCoordinate,
  setCalibrationImagePoint,
  setImageMetadata,
  updateTopologyChannelCategory,
  upsertCableSpec,
  upsertConnectionPoint,
  upsertConnectionPointPreset,
  upsertDeviceInstance,
  upsertDeviceTypePreset,
} = projectSlice.actions;
export default projectSlice.reducer;
