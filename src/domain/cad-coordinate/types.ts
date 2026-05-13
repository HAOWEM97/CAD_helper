import type { Point2D } from '@/domain/geometry/types';

export type CadPoint = Point2D;

export type CalibrationState = {
  imagePointA: Point2D;
  imagePointB: Point2D;
  cadPointA: CadPoint;
  cadPointB: CadPoint;
  scale: number;
  offsetX: number;
  offsetY: number;
  updatedAt: string;
};
