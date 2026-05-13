import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { CalibrationState } from '@/domain/cad-coordinate/types';
import type { ImageMetadata, Project } from '@/domain/project/types';

type ProjectState = {
  current: Project;
};

const initialProject: Project = {
  id: 'local-project',
  name: '未命名工程',
  image: null,
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

const projectSlice = createSlice({
  name: 'project',
  initialState,
  reducers: {
    renameProject(state, action: PayloadAction<string>) {
      state.current.name = action.payload.trim() || initialProject.name;
    },
    setImageMetadata(state, action: PayloadAction<ImageMetadata>) {
      state.current.image = action.payload;
    },
    setCalibration(state, action: PayloadAction<CalibrationState>) {
      state.current.calibration = action.payload;
      state.current.routes = state.current.routes.map((route) => ({
        ...route,
        status: 'needs-recalculation',
      }));
    },
  },
});

export const { renameProject, setImageMetadata, setCalibration } = projectSlice.actions;
export default projectSlice.reducer;
