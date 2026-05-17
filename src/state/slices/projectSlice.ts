import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { createCalibration } from '@/domain/cad-coordinate/calibration';
import type {
  CalibrationDraft,
  CalibrationSlot,
  CalibrationState,
} from '@/domain/cad-coordinate/types';
import type { Point2D } from '@/domain/geometry/types';
import type { ImageMetadata, Project } from '@/domain/project/types';

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
  },
});

export const {
  renameProject,
  setActiveCalibrationPoint,
  setCalibration,
  setCalibrationCadCoordinate,
  setCalibrationImagePoint,
  setImageMetadata,
} = projectSlice.actions;
export default projectSlice.reducer;
