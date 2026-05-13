import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { LayerVisibility, WorkflowStep } from '@/domain/project/types';

type MouseCadPosition = {
  x: number;
  y: number;
} | null;

type UiState = {
  activeStep: WorkflowStep;
  selectedObjectId: string | null;
  orthogonalLock: boolean;
  snappingEnabled: boolean;
  zoomPercent: number;
  mouseCadPosition: MouseCadPosition;
  layerVisibility: LayerVisibility;
};

const initialState: UiState = {
  activeStep: 'calibration',
  selectedObjectId: null,
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
    },
    toggleLayer(state, action: PayloadAction<keyof LayerVisibility>) {
      const layer = action.payload;
      state.layerVisibility[layer] = !state.layerVisibility[layer];
    },
    toggleOrthogonalLock(state) {
      state.orthogonalLock = !state.orthogonalLock;
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
  setMouseCadPosition,
  setZoomPercent,
  toggleLayer,
  toggleOrthogonalLock,
} = uiSlice.actions;
export default uiSlice.reducer;
