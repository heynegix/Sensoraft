import { useState } from 'react';

import { BUILT_IN_INSTRUMENTS } from './src/instruments/definitions';
import { InstrumentPickerScreen } from './src/screens/InstrumentPickerScreen';
import { InstrumentScreen } from './src/screens/InstrumentScreen';

export default function App() {
  const [selectedInstrumentId, setSelectedInstrumentId] = useState<string | null>(null);
  const selectedInstrument =
    selectedInstrumentId === null
      ? undefined
      : BUILT_IN_INSTRUMENTS.find((definition) => definition.id === selectedInstrumentId);

  if (selectedInstrument !== undefined) {
    return (
      <InstrumentScreen
        definition={selectedInstrument}
        onBack={() => setSelectedInstrumentId(null)}
      />
    );
  }

  return (
    <InstrumentPickerScreen
      definitions={BUILT_IN_INSTRUMENTS}
      onSelect={(definition) => setSelectedInstrumentId(definition.id)}
    />
  );
}
