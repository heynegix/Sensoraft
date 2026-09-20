import { getChartElapsedMs, type ChartSample } from '../src/components/chart-history';

describe('chart history timing', () => {
  it('uses the timestamps of samples actually added to the UI history', () => {
    const samples: ChartSample[] = [
      { timestamp: 1000, value: 1 },
      { timestamp: 1040, value: 2 },
      { timestamp: 1080, value: 3 },
    ];

    expect(getChartElapsedMs(samples)).toBe(80);
  });

  it('returns zero when fewer than two samples are available', () => {
    expect(getChartElapsedMs([])).toBe(0);
    expect(getChartElapsedMs([{ timestamp: 1000, value: 1 }])).toBe(0);
  });

  it('does not report negative or non-finite elapsed time', () => {
    expect(
      getChartElapsedMs([
        { timestamp: 1100, value: 1 },
        { timestamp: 1000, value: 2 },
      ]),
    ).toBe(0);
    expect(
      getChartElapsedMs([
        { timestamp: Number.NaN, value: 1 },
        { timestamp: Number.POSITIVE_INFINITY, value: 2 },
      ]),
    ).toBe(0);
  });
});
