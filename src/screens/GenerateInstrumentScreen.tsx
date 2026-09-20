import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

import {
  GenerationConfigurationError,
  GenerationOutputError,
  GenerationRequestError,
  PromptValidationError,
} from '../ai/generation-errors';
import { LatestRequestGate } from '../ai/request-gate';
import { MAX_PROMPT_LENGTH, type InstrumentGenerator } from '../ai/types';
import type { InstrumentDefinition } from '../instruments/dsl/types';

type GenerationStatus = 'idle' | 'generating' | 'success' | 'unsupported' | 'error';

interface GenerateInstrumentScreenProps {
  readonly generator: InstrumentGenerator;
  readonly onBack: () => void;
  readonly onGenerated: (definition: InstrumentDefinition, prompt: string) => void;
}

const EXAMPLE_PROMPTS = [
  'How shaky is this desk?',
  'How fast am I rotating my phone?',
  'How strong is this magnet?',
];

export function GenerateInstrumentScreen({
  generator,
  onBack,
  onGenerated,
}: GenerateInstrumentScreenProps) {
  const [prompt, setPrompt] = useState('');
  const [status, setStatus] = useState<GenerationStatus>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const requestGate = useMemo(() => new LatestRequestGate(), []);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestGate.invalidate();
    };
  }, [requestGate]);

  const generate = async () => {
    if (status === 'generating') {
      return;
    }

    const requestId = requestGate.begin();
    setStatus('generating');
    setMessage(null);

    try {
      const result = await generator.generate(prompt);
      if (!mountedRef.current || !requestGate.isCurrent(requestId)) {
        return;
      }

      if (result.status === 'unsupported') {
        setStatus('unsupported');
        setMessage(null);
        return;
      }

      setStatus('success');
      onGenerated(result.instrument, prompt.trim());
    } catch (error) {
      if (!mountedRef.current || !requestGate.isCurrent(requestId)) {
        return;
      }

      setStatus('error');
      setMessage(getGenerationErrorMessage(error));
    }
  };

  const isGenerating = status === 'generating';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to instrument list"
          onPress={onBack}
          style={styles.backButton}
        >
          <Text style={styles.backText}>← ALL INSTRUMENTS</Text>
        </Pressable>

        <Text style={styles.eyebrow}>NATURAL LANGUAGE / INSTRUMENT BUILDER</Text>
        <Text style={styles.title}>Build an instrument</Text>
        <Text style={styles.subtitle}>Tell Sensoraft what you want to measure.</Text>

        <TextInput
          accessibilityLabel="Measurement request"
          editable={!isGenerating}
          maxLength={MAX_PROMPT_LENGTH}
          multiline
          onChangeText={setPrompt}
          placeholder="How shaky is this desk?"
          placeholderTextColor="#5e747b"
          style={styles.input}
          textAlignVertical="top"
          value={prompt}
        />
        <Text style={styles.characterCount}>
          {prompt.length}/{MAX_PROMPT_LENGTH}
        </Text>

        <View style={styles.examples}>
          <Text style={styles.examplesLabel}>TRY AN EXAMPLE</Text>
          <View style={styles.chipRow}>
            {EXAMPLE_PROMPTS.map((example) => (
              <Pressable
                key={example}
                accessibilityRole="button"
                accessibilityLabel={'Use example: ' + example}
                disabled={isGenerating}
                onPress={() => {
                  setPrompt(example);
                  setStatus('idle');
                  setMessage(null);
                }}
                style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
              >
                <Text style={styles.chipText}>{example}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {status === 'generating' && (
          <View style={styles.statusCard}>
            <ActivityIndicator color="#50e3b2" />
            <Text style={styles.statusText}>Building your instrument…</Text>
          </View>
        )}

        {status === 'unsupported' && (
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>CAN&apos;T MEASURE THAT YET</Text>
            <Text style={styles.infoText}>
              Sensoraft currently measures motion, rotation, and magnetic field. Try describing a
              measurement your phone can sense.
            </Text>
          </View>
        )}

        {status === 'error' && message !== null && (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>COULDN&apos;T BUILD THE INSTRUMENT</Text>
            <Text style={styles.errorText}>{message}</Text>
          </View>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Generate instrument"
          disabled={isGenerating}
          onPress={() => void generate()}
          style={({ pressed }) => [
            styles.actionButton,
            isGenerating && styles.actionButtonDisabled,
            pressed && !isGenerating && styles.actionButtonPressed,
          ]}
        >
          <Text style={styles.actionButtonText}>
            {isGenerating ? 'Building…' : 'Generate instrument'}
          </Text>
          {!isGenerating && <Text style={styles.actionButtonArrow}>→</Text>}
        </Pressable>

        <Text style={styles.footerNote}>
          AI only designs the instrument. Sensor data stays on your phone and is processed locally.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function getGenerationErrorMessage(error: unknown): string {
  if (error instanceof PromptValidationError || error instanceof GenerationConfigurationError) {
    return error.message;
  }

  if (error instanceof GenerationOutputError) {
    return 'Sensoraft could not create a safe instrument for that request. Try describing the measurement differently.';
  }

  if (error instanceof GenerationRequestError) {
    return 'Check your connection and try again.';
  }

  return 'Try again with a short description of what you want to measure.';
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#081017',
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 32,
  },
  backButton: {
    marginBottom: 28,
  },
  backText: {
    color: '#82b6a9',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  eyebrow: {
    color: '#5d8b85',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.8,
  },
  title: {
    color: '#f2f7f6',
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.8,
    marginTop: 8,
  },
  subtitle: {
    color: '#93a4a8',
    fontSize: 17,
    lineHeight: 24,
    marginTop: 8,
  },
  input: {
    minHeight: 132,
    borderWidth: 1,
    borderColor: '#2b4a50',
    borderRadius: 20,
    backgroundColor: '#0e1a21',
    color: '#f2f7f6',
    fontSize: 18,
    lineHeight: 26,
    marginTop: 28,
    padding: 18,
  },
  characterCount: {
    color: '#607680',
    fontSize: 11,
    marginTop: 8,
    textAlign: 'right',
  },
  examples: {
    marginTop: 26,
  },
  examplesLabel: {
    color: '#607680',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.3,
  },
  chipRow: {
    gap: 8,
    marginTop: 12,
  },
  chip: {
    borderWidth: 1,
    borderColor: '#1e3840',
    borderRadius: 14,
    backgroundColor: '#0e1a21',
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  chipPressed: {
    borderColor: '#50e3b2',
  },
  chipText: {
    color: '#b0c3c4',
    fontSize: 13,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 16,
    backgroundColor: '#102a2c',
    marginTop: 24,
    padding: 15,
  },
  statusText: {
    color: '#9ac6bc',
    fontSize: 13,
  },
  infoCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#385d67',
    backgroundColor: '#10212a',
    marginTop: 24,
    padding: 15,
  },
  infoTitle: {
    color: '#a9ded1',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  infoText: {
    color: '#a8bfc1',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 7,
  },
  errorCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#704b4b',
    backgroundColor: '#28191c',
    marginTop: 24,
    padding: 15,
  },
  errorTitle: {
    color: '#ffab9d',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  errorText: {
    color: '#e6b9b1',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  actionButton: {
    minHeight: 58,
    borderRadius: 18,
    backgroundColor: '#50e3b2',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 28,
  },
  actionButtonPressed: {
    opacity: 0.78,
  },
  actionButtonDisabled: {
    opacity: 0.45,
  },
  actionButtonText: {
    color: '#071813',
    fontSize: 16,
    fontWeight: '800',
  },
  actionButtonArrow: {
    color: '#071813',
    fontSize: 18,
    fontWeight: '800',
  },
  footerNote: {
    color: '#607680',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 20,
    textAlign: 'center',
  },
});
