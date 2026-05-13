import type { RootState } from '@/app/store';

export const selectActiveStep = (state: RootState) => state.ui.activeStep;
export const selectLayerVisibility = (state: RootState) => state.ui.layerVisibility;
export const selectStatusBarState = (state: RootState) => ({
  activeStep: state.ui.activeStep,
  orthogonalLock: state.ui.orthogonalLock,
  snappingEnabled: state.ui.snappingEnabled,
  zoomPercent: state.ui.zoomPercent,
  mouseCadPosition: state.ui.mouseCadPosition,
});
