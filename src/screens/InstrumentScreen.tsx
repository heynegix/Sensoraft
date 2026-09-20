import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { SignalChart } from '../components/SignalChart';
import { InstrumentCompileError, InstrumentValidationError } from '../instruments/dsl/errors';
import { InstrumentRuntime } from '../instruments/runtime/runtime';
import type { InstrumentMeasurement } from '../instruments/runtime/compiler';
import type { InstrumentDefinition } from '../instruments/dsl/types';
import { SensorUnavailableError } from '../sensors/sensor-manager';
import { SENSOR_METADATA } from '../sensors/types';
import { DEFAULT_SIGNAL_CONFIG } from '../signal/constants';

type InstrumentStatus = 'stopped' | 'starting' | 'running' | 'error';

const INITIAL_MEASUREMENT: InstrumentMeasurement = {
  timestamp: 0,
  value: 0,
  raw: {
    x: 0,
    y: 0,
    z: 0,
    timestamp: 0,
  },
};

interface InstrumentScreenProps {
  readonly definition: InstrumentDefinition;
  readonly onBack?: () => void;
}

export function InstrumentScreen({ definition, onBack }: InstrumentScreenProps) {
  return (
    <InstrumentScreenContent
      key={definition.id + ':' + JSON.stringify(definition)}
      definition={definition}
      onBack={onBack}
    />
  );
}

function InstrumentScreenContent({ definition, onBack }: InstrumentScreenProps) {
  const runtimeState = useMemo(() => {
    try {
      return {
        runtime: new InstrumentRuntime(definition),
        errorMessage: null,
      };
    } catch (error) {
      return {
        runtime: null,
        errorMessage: getDefinitionErrorMessage(error),
      };
    }
  }, [definition]);
  const runtime = runtimeState.runtime;
  const [status, setStatus] = useState<InstrumentStatus>('stopped');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [measurement, setMeasurement] = useState<InstrumentMeasurement>(INITIAL_MEASUREMENT);
  const [history, setHistory] = useState<number[]>([]);
  const mountedRef = useRef(true);
  const startTokenRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      startTokenRef.current += 1;
      runtime?.dispose();
    };
  }, [runtime, runtimeState.errorMessage]);

  const stopMeasurement = useCallback(() => {
    startTokenRef.current += 1;
    runtime?.stop();
    setStatus('stopped');
    setErrorMessage(null);
    setMeasurement(INITIAL_MEASUREMENT);
    setHistory([]);
  }, [runtime]);

  const startMeasurement = useCallback(async () => {
    if (runtime === null) {
      return;
    }

    if (status === 'running' || status === 'starting') {
      return;
    }

    const startToken = startTokenRef.current + 1;
    startTokenRef.current = startToken;
    setStatus('starting');
    setErrorMessage(null);
    setMeasurement(INITIAL_MEASUREMENT);
    setHistory([]);

    try {
      const started = await runtime.start(
        (nextMeasurement) => {
          if (!mountedRef.current || startToken !== startTokenRef.current) {
            return;
          }

          setMeasurement(nextMeasurement);
          setHistory((current) => {
            const nextHistory = [...current, nextMeasurement.value];
            return nextHistory.slice(-DEFAULT_SIGNAL_CONFIG.maxChartPoints);
          });
        },
        () => {
          if (!mountedRef.current || startToken !== startTokenRef.current) {
            return;
          }

          setStatus('error');
          setErrorMessage('Unable to process instrument data. Try starting the measurement again.');
        },
      );

      if (started && mountedRef.current && startToken === startTokenRef.current) {
        setStatus('running');
      }
    } catch (error) {
      if (!mountedRef.current || startToken !== startTokenRef.current) {
        return;
      }

      runtime.stop();
      setStatus('error');
      setErrorMessage(getStartErrorMessage(error));
    }
  }, [runtime, status]);

  const displayedStatus = runtime === null ? 'error' : status;
  const isActive = displayedStatus === 'running' || displayedStatus === 'starting';
  const statusLabel =
    displayedStatus === 'running'
      ? 'LIVE'
      : displayedStatus === 'starting'
        ? 'STARTING'
        : 'STOPPED';
  const precision = definition.display.precision;
  const sampleIntervalMs = 1000 / definition.sensor.sampleRateHz;
  const sensorMetadata = SENSOR_METADATA[definition.sensor.type];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View>
            {onBack !== undefined && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back to instrument list"
                onPress={onBack}
                style={styles.backButton}
              >
                <Text style={styles.backText}>← ALL INSTRUMENTS</Text>
              </Pressable>
            )}
            <Text style={styles.eyebrow}>INSTRUMENT / {definition.id.toUpperCase()}</Text>
            <Text style={styles.title}>{definition.name}</Text>
          </View>
          <View style={styles.signalMark}>
            <View style={styles.signalMarkBar} />
            <View style={[styles.signalMarkBar, styles.signalMarkBarTall]} />
            <View style={styles.signalMarkBar} />
          </View>
        </View>

        <View style={styles.statusRow}>
          <View style={[styles.statusDot, isActive && styles.statusDotLive]} />
          <Text style={[styles.statusText, isActive && styles.statusTextLive]}>{statusLabel}</Text>
          <Text style={styles.statusDivider}>•</Text>
          <Text style={styles.statusMeta}>{definition.sensor.type.toUpperCase()}</Text>
        </View>

        <View style={styles.readingCard}>
          <Text style={styles.readingLabel}>{definition.display.label.toUpperCase()}</Text>
          <View style={styles.readingRow}>
            <Text style={styles.readingValue}>{measurement.value.toFixed(precision)}</Text>
            <Text style={styles.readingUnit}>{definition.display.unit}</Text>
          </View>
          <Text style={styles.readingHint}>
            {definition.description || 'Compiled instrument output'}
          </Text>
        </View>

        {definition.display.type === 'line' && (
          <SignalChart
            label={definition.display.label}
            sampleIntervalMs={sampleIntervalMs}
            unit={definition.display.unit}
            values={history}
          />
        )}

        <View style={styles.axesCard}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardLabel}>RAW SENSOR DATA</Text>
            <Text style={styles.cardMeta}>
              {sensorMetadata.label.toUpperCase()} / {sensorMetadata.axisUnit}
            </Text>
          </View>
          <View style={styles.axisRow}>
            <AxisValue axis="X" value={measurement.raw.x} />
            <AxisValue axis="Y" value={measurement.raw.y} />
            <AxisValue axis="Z" value={measurement.raw.z} />
          </View>
        </View>

        {(runtimeState.errorMessage ?? errorMessage) !== null && (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>
              {runtime === null ? 'INVALID DEFINITION' : 'INSTRUMENT UNAVAILABLE'}
            </Text>
            <Text style={styles.errorText}>{runtimeState.errorMessage ?? errorMessage}</Text>
          </View>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isActive ? 'Stop instrument' : 'Start instrument'}
          disabled={runtime === null}
          onPress={isActive ? stopMeasurement : startMeasurement}
          style={({ pressed }) => [
            styles.actionButton,
            runtime === null && styles.actionButtonDisabled,
            pressed && runtime !== null && styles.actionButtonPressed,
          ]}
        >
          <Text style={styles.actionButtonText}>{isActive ? 'Stop' : 'Start measuring'}</Text>
          <Text style={styles.actionButtonArrow}>{isActive ? '■' : '→'}</Text>
        </Pressable>

        <Text style={styles.footerNote}>
          Start the instrument, then move the phone or interact with the physical environment to see
          the compiled signal respond.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function getStartErrorMessage(error: unknown): string {
  if (error instanceof SensorUnavailableError) {
    return error.sensorName + ' is not available on this device.';
  }

  return 'Unable to access the instrument. Try again on a physical Android device.';
}

function getDefinitionErrorMessage(error: unknown): string {
  if (error instanceof InstrumentValidationError) {
    return error.issues[0] ?? 'The instrument definition is invalid.';
  }

  if (error instanceof InstrumentCompileError) {
    return 'The instrument pipeline could not be compiled. Check its operations.';
  }

  return 'The instrument definition could not be loaded.';
}

function AxisValue({ axis, value }: { axis: string; value: number }) {
  return (
    <View style={styles.axisValue}>
      <Text style={styles.axisName}>{axis}</Text>
      <Text style={styles.axisNumber}>{value.toFixed(3)}</Text>
    </View>
  );
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
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    marginBottom: 10,
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
    marginBottom: 8,
  },
  title: {
    color: '#f2f7f6',
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  signalMark: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1e3840',
    backgroundColor: '#0e1e25',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  signalMarkBar: {
    width: 3,
    height: 12,
    borderRadius: 2,
    backgroundColor: '#50e3b2',
  },
  signalMarkBarTall: {
    height: 24,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: -4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#53656c',
  },
  statusDotLive: {
    backgroundColor: '#50e3b2',
  },
  statusText: {
    color: '#93a4a8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  statusTextLive: {
    color: '#50e3b2',
  },
  statusDivider: {
    color: '#35505a',
    fontSize: 14,
  },
  statusMeta: {
    color: '#607680',
    fontSize: 10,
    letterSpacing: 1.2,
  },
  readingCard: {
    borderRadius: 20,
    backgroundColor: '#11262a',
    borderWidth: 1,
    borderColor: '#214841',
    padding: 20,
    marginTop: 6,
  },
  readingLabel: {
    color: '#82b6a9',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  readingRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 14,
  },
  readingValue: {
    color: '#f2f7f6',
    fontSize: 48,
    fontWeight: '300',
    letterSpacing: -1.4,
    fontVariant: ['tabular-nums'],
  },
  readingUnit: {
    color: '#9ac6bc',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 10,
  },
  readingHint: {
    color: '#70918f',
    fontSize: 12,
    marginTop: 6,
  },
  axesCard: {
    borderWidth: 1,
    borderColor: '#1e303a',
    borderRadius: 20,
    backgroundColor: '#0e1a21',
    padding: 16,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardLabel: {
    color: '#8fa6b0',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  cardMeta: {
    color: '#607680',
    fontSize: 10,
    letterSpacing: 1,
  },
  axisRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  axisValue: {
    flex: 1,
    borderLeftWidth: 2,
    borderLeftColor: '#50e3b2',
    paddingLeft: 10,
  },
  axisName: {
    color: '#607680',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  axisNumber: {
    color: '#d7e5e4',
    fontSize: 17,
    fontVariant: ['tabular-nums'],
    marginTop: 5,
  },
  errorCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#704b4b',
    backgroundColor: '#28191c',
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
    marginTop: 2,
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
    textAlign: 'center',
    paddingHorizontal: 12,
  },
});
