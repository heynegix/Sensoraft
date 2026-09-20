import { InstrumentScreen } from './src/screens/InstrumentScreen';
import { VIBRATION_METER_DEFINITION } from './src/instruments/definitions/vibration-meter';

export default function App() {
  return <InstrumentScreen definition={VIBRATION_METER_DEFINITION} />;
}
