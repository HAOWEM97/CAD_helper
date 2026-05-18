import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { LayerVisibility, WorkflowStep } from '@/domain/project/types';

export type TopologyToolMode = 'draw' | 'select';

export type SelectedTopologyObject = {
  type: 'node' | 'channel';
  id: string;
} | null;

type MouseCadPosition = {
  x: number;
  y: number;
} | null;

type UiState = {
  activeStep: WorkflowStep;
  topologyToolMode: TopologyToolMode;
  selectedTopologyObject: SelectedTopologyObject;
  activeDrawingNodeId: string | null;
  leftPanelCollapsed: boolean;
  rightPanelCollapsed: boolean;
  orthogonalLock: boolean;
  snappingEnabled: boolean;
  zoomPercent: number;
  mouseCadPosition: MouseCadPosition;
  layerVisibility: LayerVisibility;
};

const initialState: UiState = {
  activeStep: 'calibration',
  topologyToolMode: 'draw',
  selectedTopologyObject: null,
  activeDrawingNodeId: null,
  leftPanelCollapsed: false,
  rightPanelCollapsed: false,
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
};

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
    setActiveDrawingNodeId(state, action: PayloadAction<string | null>) {
      state.activeDrawingNodeId = action.payload;
    },
    toggleLeftPanelCollapsed(state) {
      state.leftPanelCollapsed = !state.leftPanelCollapsed;
    },
    toggleRightPanelCollapsed(state) {
      state.rightPanelCollapsed = !state.rightPanelCollapsed;
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
  setSelectedTopologyObject,
  setTopologyToolMode,
  setZoomPercent,
  toggleLayer,
  toggleLeftPanelCollapsed,
  toggleOrthogonalLock,
  toggleRightPanelCollapsed,
  toggleSnappingEnabled,
} = uiSlice.actions;
export default uiSlice.reducer;
