import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '@/app/store';
import { buildBomSummary, inferChannelSpecs } from '@/domain/quantity/bom';

export const selectProject = (state: RootState) => state.project.current;
export const selectProjectImage = (state: RootState) => state.project.current.image;
export const selectCalibrationDraft = (state: RootState) => state.project.current.calibrationDraft;
export const selectCalibration = (state: RootState) => state.project.current.calibration;
export const selectTopology = (state: RootState) => state.project.current.topology;
export const selectDeviceInstances = (state: RootState) => state.project.current.deviceInstances;
export const selectConnectionPoints = (state: RootState) => state.project.current.connectionPoints;
export const selectCableSpecs = (state: RootState) => state.project.current.cableSpecs;
export const selectConnectionPointPresets = (state: RootState) =>
  state.project.current.connectionPointPresets;
export const selectDeviceTypePresets = (state: RootState) =>
  state.project.current.deviceTypePresets;
export const selectRoutes = (state: RootState) => state.project.current.routes;
export const selectInferredChannelSpecs = createSelector(selectProject, inferChannelSpecs);
export const selectBomSummary = createSelector(selectProject, buildBomSummary);
