import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { LayerVisibility, WorkflowStep } from '@/domain/project/types';

export type TopologyToolMode = 'draw' | 'select';

export const RIGHT_PANEL_WIDTH_DEFAULT = 320;
export const RIGHT_PANEL_WIDTH_MIN = 300;
export const RIGHT_PANEL_WIDTH_MAX = 640;

export function clampRightPanelWidth(width: number) {
  if (!Number.isFinite(width)) {
    return RIGHT_PANEL_WIDTH_DEFAULT;
  }

  return Math.min(RIGHT_PANEL_WIDTH_MAX, Math.max(RIGHT_PANEL_WIDTH_MIN, Math.round(width)));
}

export type SelectedTopologyObject = {
  type: 'node' | 'channel';
  id: string;
} | null;

type MouseCadPosition = {
  x: number;
  y: number;
} | null;

export type UiState = {
  activeStep: WorkflowStep;
  topologyToolMode: TopologyToolMode;
  selectedTopologyObject: SelectedTopologyObject;
  selectedRouteId: string | null;
  activeDrawingNodeId: string | null;
  leftPanelCollapsed: boolean;
  rightPanelCollapsed: boolean;
  rightPanelWidth: number;
  orthogonalLock: boolean;
  snappingEnabled: boolean;
  zoomPercent: number;
  mouseCadPosition: MouseCadPosition;
  layerVisibility: LayerVisibility;
};

export const createInitialUiState = (): UiState => ({
  activeStep: 'calibration',
  topologyToolMode: 'draw',
  selectedTopologyObject: null,
  selectedRouteId: null,
  activeDrawingNodeId: null,
  leftPanelCollapsed: false,
  rightPanelCollapsed: false,
  rightPanelWidth: RIGHT_PANEL_WIDTH_DEFAULT,
  orthogonalLock: false,
  snappingEnabled: true,
  zoomPercent: 100,
  mouseCadPosition: null,
  layerVisibility: {
    baseImage: true,
    topology: true,
    cableRoutes: true,
    channelOutlines: true,
    annotations: true,
  },
});

const initialState: UiState = createInitialUiState();

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setActiveStep(state, action: PayloadAction<WorkflowStep>) {
      state.activeStep = action.payload;
      state.selectedTopologyObject = null;
      if (action.payload !== 'drawing') {
        state.activeDrawingNodeId = null;
      }
      if (action.payload !== 'routing') {
        state.selectedRouteId = null;
      }
    },
    setTopologyToolMode(state, action: PayloadAction<TopologyToolMode>) {
      state.topologyToolMode = action.payload;
      state.selectedTopologyObject = null;
      if (action.payload === 'select') {
        state.activeDrawingNodeId = null;
      }
    },
    setSelectedTopologyObject(state, action: PayloadAction<SelectedTopologyObject>) {
      state.selectedTopologyObject = action.payload;
    },
    setSelectedRouteId(state, action: PayloadAction<string | null>) {
      state.selectedRouteId = action.payload;
    },
    setActiveDrawingNodeId(state, action: PayloadAction<string | null>) {
      state.activeDrawingNodeId = action.payload;
    },
    toggleLeftPanelCollapsed(state) {
      state.leftPanelCollapsed = !state.leftPanelCollapsed;
    },
    toggleRightPanelCollapsed(state) {
      state.rightPanelCollapsed = !state.rightPanelCollapsed;
    },
    setRightPanelWidth(state, action: PayloadAction<number>) {
      state.rightPanelWidth = clampRightPanelWidth(action.payload);
    },
    toggleLayer(state, action: PayloadAction<keyof LayerVisibility>) {
      const layer = action.payload;
      state.layerVisibility[layer] = !state.layerVisibility[layer];
    },
    toggleOrthogonalLock(state) {
      state.orthogonalLock = !state.orthogonalLock;
    },
    toggleSnappingEnabled(state) {
      state.snappingEnabled = !state.snappingEnabled;
    },
    setMouseCadPosition(state, action: PayloadAction<MouseCadPosition>) {
      state.mouseCadPosition = action.payload;
    },
    setZoomPercent(state, action: PayloadAction<number>) {
      state.zoomPercent = action.payload;
    },
  },
});

export const {
  setActiveStep,
  setActiveDrawingNodeId,
  setMouseCadPosition,
  setSelectedRouteId,
  setSelectedTopologyObject,
  setRightPanelWidth,
  setTopologyToolMode,
  setZoomPercent,
  toggleLayer,
  toggleLeftPanelCollapsed,
  toggleOrthogonalLock,
  toggleRightPanelCollapsed,
  toggleSnappingEnabled,
} = uiSlice.actions;
export default uiSlice.reducer;
