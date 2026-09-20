import type { InstrumentDefinition } from '../dsl/types';

export const ROTATION_METER_DEFINITION: InstrumentDefinition = {
  version: 1,
  id: 'rotation-meter',
  name: 'Rotation Meter',
  description: 'Measures angular velocity using the phone gyroscope.',
  sensor: {
    type: 'gyroscope',
    sampleRateHz: 20,
  },
  pipeline: [
    { op: 'magnitude' },
    { op: 'movingAverage', windowSize: 3 },
    { op: 'rms', windowSize: 5 },
  ],
  display: {
    type: 'line',
    label: 'Angular velocity',
    unit: 'rad/s',
    precision: 3,
  },
};
