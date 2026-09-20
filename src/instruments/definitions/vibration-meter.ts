import { METERS_PER_SECOND_SQUARED_PER_G } from '../../signal/constants';
import type { InstrumentDefinition } from '../dsl/types';

export const VIBRATION_METER_DEFINITION: InstrumentDefinition = {
  version: 1,
  id: 'vibration-meter',
  name: 'Vibration Meter',
  description: 'Measures short-term vibration using the accelerometer.',
  sensor: {
    type: 'accelerometer',
    sampleRateHz: 20,
  },
  pipeline: [
    { op: 'gravityCompensation', alpha: 0.04 },
    { op: 'magnitude' },
    { op: 'movingAverage', windowSize: 4 },
    { op: 'rms', windowSize: 12 },
    { op: 'scale', factor: METERS_PER_SECOND_SQUARED_PER_G },
  ],
  display: {
    type: 'line',
    label: 'Vibration',
    unit: 'm/s²',
    precision: 3,
  },
};
