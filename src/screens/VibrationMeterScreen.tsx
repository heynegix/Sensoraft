import { InstrumentScreen } from './InstrumentScreen';
import { VIBRATION_METER_DEFINITION } from '../instruments/definitions/vibration-meter';

export function VibrationMeterScreen() {
  return <InstrumentScreen definition={VIBRATION_METER_DEFINITION} />;
}
