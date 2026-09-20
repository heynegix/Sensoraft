import { magnitude } from '../src/signal/magnitude';
import { movingAverage } from '../src/signal/moving-average';
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
});
