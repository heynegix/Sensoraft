import type { InstrumentDefinition } from '../dsl/types';
import { MAGNETIC_FIELD_METER_DEFINITION } from './magnetic-field-meter';
import { ROTATION_METER_DEFINITION } from './rotation-meter';
import { VIBRATION_METER_DEFINITION } from './vibration-meter';

export const BUILT_IN_INSTRUMENTS: readonly InstrumentDefinition[] = [
  VIBRATION_METER_DEFINITION,
  ROTATION_METER_DEFINITION,
  MAGNETIC_FIELD_METER_DEFINITION,
];

export { MAGNETIC_FIELD_METER_DEFINITION, ROTATION_METER_DEFINITION, VIBRATION_METER_DEFINITION };
