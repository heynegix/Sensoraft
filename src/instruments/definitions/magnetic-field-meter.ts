import type { InstrumentDefinition } from '../dsl/types';

export const MAGNETIC_FIELD_METER_DEFINITION: InstrumentDefinition = {
  version: 1,
  id: 'magnetic-field-meter',
  name: 'Magnetic Field Meter',
  description: 'Measures magnetic field strength using the phone magnetometer.',
  sensor: {
    type: 'magnetometer',
    sampleRateHz: 20,
  },
  pipeline: [{ op: 'magnitude' }, { op: 'movingAverage', windowSize: 3 }],
  display: {
    type: 'line',
    label: 'Magnetic field',
    unit: 'μT',
    precision: 1,
  },
};
