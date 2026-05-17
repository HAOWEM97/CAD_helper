import type { Point2D } from '@/domain/geometry/types';
import type { CadPoint, CalibrationState } from '@/domain/cad-coordinate/types';

const MIN_VECTOR_LENGTH_SQUARED = 1e-9;

export function createCalibration(
  imagePointA: Point2D,
  imagePointB: Point2D,
  cadPointA: CadPoint,
  cadPointB: CadPoint,
): CalibrationState {
  const imageVector = {
    x: imagePointB.x - imagePointA.x,
    y: -(imagePointB.y - imagePointA.y),
  };
  const cadVector = {
    x: cadPointB.x - cadPointA.x,
    y: cadPointB.y - cadPointA.y,
  };
  const imageLengthSquared = imageVector.x * imageVector.x + imageVector.y * imageVector.y;

  if (imageLengthSquared <= MIN_VECTOR_LENGTH_SQUARED) {
    throw new Error('Calibration image reference points must be distinct.');
  }

  const a =
    (cadVector.x * imageVector.x + cadVector.y * imageVector.y) / imageLengthSquared;
  const b =
    (cadVector.y * imageVector.x - cadVector.x * imageVector.y) / imageLengthSquared;

  return {
    imagePointA,
    imagePointB,
    cadPointA,
    cadPointB,
    scale: Math.hypot(a, b),
    rotationRadians: Math.atan2(b, a),
    transform: {
      originImagePoint: imagePointA,
      originCadPoint: cadPointA,
      imageYAxis: 'down',
      a,
      b,
    },
    updatedAt: new Date().toISOString(),
  };
}

export function pixelToCad(point: Point2D, calibration: CalibrationState): CadPoint {
  const { a, b, originCadPoint, originImagePoint } = calibration.transform;
  const dx = point.x - originImagePoint.x;
  const dy = -(point.y - originImagePoint.y);

  return {
    x: originCadPoint.x + a * dx - b * dy,
    y: originCadPoint.y + b * dx + a * dy,
  };
}

export function cadToPixel(point: CadPoint, calibration: CalibrationState): Point2D {
  const { a, b, originCadPoint, originImagePoint } = calibration.transform;
  const determinant = a * a + b * b;

  if (determinant <= MIN_VECTOR_LENGTH_SQUARED) {
    throw new Error('Calibration transform is not invertible.');
  }

  const vx = point.x - originCadPoint.x;
  const vy = point.y - originCadPoint.y;
  const dx = (a * vx + b * vy) / determinant;
  const dy = (-b * vx + a * vy) / determinant;

  return {
    x: originImagePoint.x + dx,
    y: originImagePoint.y - dy,
  };
}
