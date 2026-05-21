import type { RootState } from '@/app/store';

export const selectActiveStep = (state: RootState) => state.ui.activeStep;
export const selectLayerVisibility = (state: RootState) => state.ui.layerVisibility;
export const selectTopologyToolMode = (state: RootState) => state.ui.topologyToolMode;
export const selectSelectedTopologyObject = (state: RootState) => state.ui.selectedTopologyObject;
export const selectSelectedRouteId = (state: RootState) => state.ui.selectedRouteId;
export const selectActiveDrawingNodeId = (state: RootState) => state.ui.activeDrawingNodeId;
export const selectLeftPanelCollapsed = (state: RootState) => state.ui.leftPanelCollapsed;
export const selectRightPanelCollapsed = (state: RootState) => state.ui.rightPanelCollapsed;
export const selectStatusBarState = (state: RootState) => ({
  activeStep: state.ui.activeStep,
  topologyToolMode: state.ui.topologyToolMode,
  orthogonalLock: state.ui.orthogonalLock,
  snappingEnabled: state.ui.snappingEnabled,
  zoomPercent: state.ui.zoomPercent,
  mouseCadPosition: state.ui.mouseCadPosition,
});
