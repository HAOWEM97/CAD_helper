import type { Point2D } from '@/domain/geometry/types';

export type CadPoint = Point2D;

export type CalibrationSlot = 'A' | 'B';

export type DraftCadPoint = {
  x: number | null;
  y: number | null;
};

export type CalibrationDraftPoint = {
  imagePoint: Point2D | null;
  cadPoint: DraftCadPoint;
};

export type CalibrationDraft = {
  activePoint: CalibrationSlot;
  pointA: CalibrationDraftPoint;
  pointB: CalibrationDraftPoint;
};

export type CalibrationTransform = {
  originImagePoint: Point2D;
  originCadPoint: CadPoint;
  imageYAxis: 'down';
  scaleX: number;
  scaleY: number;
};

export type CalibrationState = {
  imagePointA: Point2D;
  imagePointB: Point2D;
  cadPointA: CadPoint;
  cadPointB: CadPoint;
  scaleX: number;
  scaleY: number;
  transform: CalibrationTransform;
  updatedAt: string;
};
