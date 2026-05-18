import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { createCalibration } from '@/domain/cad-coordinate/calibration';
import type {
  CalibrationDraft,
  CalibrationSlot,
  CalibrationState,
} from '@/domain/cad-coordinate/types';
import type { Point2D } from '@/domain/geometry/types';
import type {
  ChannelCategory,
  ChannelSegment,
  ImageMetadata,
  Project,
  TopologyNode,
} from '@/domain/project/types';

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
  devices: [],
  cableTemplates: [],
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

      state.current.topology.nodes = state.current.topology.nodes.filter(
        (node) => node.id !== nodeId,
      );
      state.current.topology.channels = state.current.topology.channels.filter(
        (channel) => channel.startNodeId !== nodeId && channel.endNodeId !== nodeId,
      );
      markRoutesUsingChannelsForRecalculation(state.current, connectedChannelIds);
    },
    deleteTopologyChannel(state, action: PayloadAction<string>) {
      const channelId = action.payload;
      state.current.topology.channels = state.current.topology.channels.filter(
        (channel) => channel.id !== channelId,
      );
      markRoutesUsingChannelsForRecalculation(state.current, new Set([channelId]));
    },
    updateTopologyChannelCategory(
      state,
      action: PayloadAction<{ channelId: string; category: ChannelCategory }>,
    ) {
      const channel = state.current.topology.channels.find(
        (item) => item.id === action.payload.channelId,
      );
      if (!channel) {
        return;
      }

      channel.category = action.payload.category;
      markRoutesUsingChannelsForRecalculation(state.current, new Set([channel.id]));
    },
  },
});

export const {
  addTopologyChannel,
  addTopologyNode,
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
} = projectSlice.actions;
export default projectSlice.reducer;
