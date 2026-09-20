import { magnitude } from '../src/signal/magnitude';
import { movingAverage } from '../src/signal/moving-average';
import { DEFAULT_SIGNAL_CONFIG } from '../src/signal/constants';
import { VibrationSignalProcessor } from '../src/signal/processor';
import { rootMeanSquare } from '../src/signal/rms';

describe('signal processing primitives', () => {
  it('calculates vector magnitude', () => {
    expect(magnitude({ x: 3, y: 4, z: 12 })).toBe(13);
  });

  it('calculates a moving average', () => {
    expect(movingAverage([1, 2, 3, 6])).toBe(3);
    expect(movingAverage([])).toBe(0);
  });

  it('calculates root mean square', () => {
    expect(rootMeanSquare([3, 4])).toBe(3.5355339059327378);
    expect(rootMeanSquare([])).toBe(0);
  });

  it('preserves transverse acceleration after vector gravity compensation', () => {
    const processor = new VibrationSignalProcessor({
      ...DEFAULT_SIGNAL_CONFIG,
      movingAverageWindowSize: 1,
      rmsWindowSize: 1,
    });

    processor.process({ x: 0, y: 0, z: 1, timestamp: 0 });
    const result = processor.process({ x: 0.1, y: 0, z: 1, timestamp: 1 });

    expect(result.vibration).toBeCloseTo(0.1 * 9.80665, 5);
  });
});
