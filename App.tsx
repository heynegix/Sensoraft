import { useMemo, useState } from 'react';

import { BUILT_IN_INSTRUMENTS } from './src/instruments/definitions';
import { RemoteInstrumentGenerator } from './src/ai/remote-instrument-generator';
import type { InstrumentDefinition } from './src/instruments/dsl/types';
import { GenerateInstrumentScreen } from './src/screens/GenerateInstrumentScreen';
import { InstrumentPickerScreen } from './src/screens/InstrumentPickerScreen';
import { InstrumentScreen } from './src/screens/InstrumentScreen';

type AppScreen =
  | { readonly kind: 'picker' }
  | { readonly kind: 'generate' }
  | {
      readonly kind: 'instrument';
      readonly definition: InstrumentDefinition;
      readonly originPrompt?: string;
    };

export default function App() {
  const [screen, setScreen] = useState<AppScreen>({ kind: 'picker' });
  const generator = useMemo(() => new RemoteInstrumentGenerator(), []);

  if (screen.kind === 'instrument') {
    return (
      <InstrumentScreen
        definition={screen.definition}
        originPrompt={screen.originPrompt}
        onBack={() => setScreen({ kind: 'picker' })}
      />
    );
  }

  if (screen.kind === 'generate') {
    return (
      <GenerateInstrumentScreen
        generator={generator}
        onBack={() => setScreen({ kind: 'picker' })}
        onGenerated={(definition, prompt) =>
          setScreen({ kind: 'instrument', definition, originPrompt: prompt })
        }
      />
    );
  }

  return (
    <InstrumentPickerScreen
      definitions={BUILT_IN_INSTRUMENTS}
      onBuildWithAi={() => setScreen({ kind: 'generate' })}
      onSelect={(definition) => setScreen({ kind: 'instrument', definition })}
    />
  );
}
