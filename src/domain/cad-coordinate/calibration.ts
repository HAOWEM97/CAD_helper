import type { Point2D } from '@/domain/geometry/types';
import type { CadPoint, CalibrationState } from '@/domain/cad-coordinate/types';

const MIN_AXIS_DELTA = 1e-9;

function assertUsableAxisDelta(delta: number, message: string) {
  if (Math.abs(delta) <= MIN_AXIS_DELTA) {
    throw new Error(message);
  }
}

export function createCalibration(
  imagePointA: Point2D,
  imagePointB: Point2D,
  cadPointA: CadPoint,
  cadPointB: CadPoint,
): CalibrationState {
  const imageDeltaX = imagePointB.x - imagePointA.x;
  const imageDeltaYUp = imagePointA.y - imagePointB.y;
  const cadDeltaX = cadPointB.x - cadPointA.x;
  const cadDeltaY = cadPointB.y - cadPointA.y;

  assertUsableAxisDelta(
    imageDeltaX,
    'Calibration image reference points must differ on the X axis.',
  );
  assertUsableAxisDelta(
    imageDeltaYUp,
    'Calibration image reference points must differ on the Y axis.',
  );
  assertUsableAxisDelta(cadDeltaX, 'Calibration CAD reference points must differ on the X axis.');
  assertUsableAxisDelta(cadDeltaY, 'Calibration CAD reference points must differ on the Y axis.');

  const scaleX = cadDeltaX / imageDeltaX;
  const scaleY = cadDeltaY / imageDeltaYUp;

  return {
    imagePointA,
    imagePointB,
    cadPointA,
    cadPointB,
    scaleX,
    scaleY,
    transform: {
      originImagePoint: imagePointA,
      originCadPoint: cadPointA,
      imageYAxis: 'down',
      scaleX,
      scaleY,
    },
    updatedAt: new Date().toISOString(),
  };
}

export function pixelToCad(point: Point2D, calibration: CalibrationState): CadPoint {
  const { scaleX, scaleY, originCadPoint, originImagePoint } = calibration.transform;
  const dx = point.x - originImagePoint.x;
  const dyUp = originImagePoint.y - point.y;

  return {
    x: originCadPoint.x + dx * scaleX,
    y: originCadPoint.y + dyUp * scaleY,
  };
}

export function cadToPixel(point: CadPoint, calibration: CalibrationState): Point2D {
  const { scaleX, scaleY, originCadPoint, originImagePoint } = calibration.transform;
  assertUsableAxisDelta(scaleX, 'Calibration X scale is not invertible.');
  assertUsableAxisDelta(scaleY, 'Calibration Y scale is not invertible.');

  const vx = point.x - originCadPoint.x;
  const vy = point.y - originCadPoint.y;

  return {
    x: originImagePoint.x + vx / scaleX,
    y: originImagePoint.y - vy / scaleY,
  };
}
