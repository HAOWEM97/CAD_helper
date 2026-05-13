import type { RootState } from '@/app/store';

export const selectProject = (state: RootState) => state.project.current;
export const selectProjectImage = (state: RootState) => state.project.current.image;
export const selectCalibration = (state: RootState) => state.project.current.calibration;
export const selectTopology = (state: RootState) => state.project.current.topology;
