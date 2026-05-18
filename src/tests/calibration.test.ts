import { describe, expect, it } from 'vitest';
import { cadToPixel, createCalibration, pixelToCad } from '@/domain/cad-coordinate/calibration';

describe('axis-aligned CAD calibration', () => {
  it('derives independent X and Y scales from two reference points', () => {
    const calibration = createCalibration(
      { x: 10, y: 20 },
      { x: 110, y: 220 },
      { x: 1000, y: 5000 },
      { x: 1500, y: 4200 },
    );

    expect(calibration.scaleX).toBeCloseTo(5);
    expect(calibration.scaleY).toBeCloseTo(4);
    expect(pixelToCad(calibration.imagePointA, calibration)).toEqual(calibration.cadPointA);
    expect(pixelToCad(calibration.imagePointB, calibration)).toEqual(calibration.cadPointB);
    expect(pixelToCad({ x: 60, y: 120 }, calibration)).toEqual({ x: 1250, y: 4600 });
  });

  it('round-trips between pixel and CAD coordinates', () => {
    const calibration = createCalibration(
      { x: 10, y: 20 },
      { x: 110, y: 220 },
      { x: 1000, y: 5000 },
      { x: 1500, y: 4200 },
    );
    const imagePoint = { x: 42.25, y: 87.5 };
    const cadPoint = pixelToCad(imagePoint, calibration);

    expect(cadToPixel(cadPoint, calibration).x).toBeCloseTo(imagePoint.x);
    expect(cadToPixel(cadPoint, calibration).y).toBeCloseTo(imagePoint.y);
  });

  it('keeps small decimals and signed direction relationships usable', () => {
    const calibration = createCalibration(
      { x: -10.5, y: 40.25 },
      { x: 9.5, y: 50.25 },
      { x: -100.125, y: 0.001 },
      { x: -60.125, y: -0.499 },
    );

    expect(calibration.scaleX).toBeCloseTo(2);
    expect(calibration.scaleY).toBeCloseTo(0.05);
    const cadPoint = pixelToCad({ x: -5.5, y: 45.25 }, calibration);
    expect(cadPoint.x).toBeCloseTo(-90.125);
    expect(cadPoint.y).toBeCloseTo(-0.249);
  });

  it('supports negative scales when a CAD axis runs opposite to the image axis assumption', () => {
    const calibration = createCalibration(
      { x: 0, y: 0 },
      { x: 10, y: -10 },
      { x: 0, y: 0 },
      { x: -100, y: -50 },
    );

    expect(calibration.scaleX).toBeCloseTo(-10);
    expect(calibration.scaleY).toBeCloseTo(-5);
    expect(pixelToCad({ x: 4, y: -6 }, calibration)).toEqual({ x: -40, y: -30 });
  });

  it('rejects reference points that cannot determine both axis scales', () => {
    expect(() =>
      createCalibration({ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 0, y: 0 }, { x: 10, y: 10 }),
    ).toThrow(/image reference points must differ on the X axis/);
    expect(() =>
      createCalibration({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 10 }),
    ).toThrow(/image reference points must differ on the Y axis/);
    expect(() =>
      createCalibration({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 0 }, { x: 0, y: 10 }),
    ).toThrow(/CAD reference points must differ on the X axis/);
    expect(() =>
      createCalibration({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 0 }, { x: 10, y: 0 }),
    ).toThrow(/CAD reference points must differ on the Y axis/);
  });
});
