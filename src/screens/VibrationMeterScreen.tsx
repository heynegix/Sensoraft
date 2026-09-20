import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { SignalChart } from '../components/SignalChart';
import { VIBRATION_METER_DEFINITION, VibrationMeterEngine } from '../instruments/vibration-meter';
import { AccelerometerSource } from '../sensors/accelerometer';
import { SensorManager, SensorUnavailableError } from '../sensors/sensor-manager';
import type { AccelerometerSample } from '../sensors/types';
import { DEFAULT_SIGNAL_CONFIG } from '../signal/constants';
import type { ProcessedSignal } from '../signal/processor';

type MeterStatus = 'stopped' | 'starting' | 'running' | 'error';

const INITIAL_READING: ProcessedSignal = {
  timestamp: 0,
  x: 0,
  y: 0,
  z: 0,
  magnitude: 0,
  vibration: 0,
};

export function VibrationMeterScreen() {
  const sensorManager = useMemo(
    () =>
      new SensorManager<AccelerometerSample>(
        new AccelerometerSource(DEFAULT_SIGNAL_CONFIG.sensorIntervalMs),
        'Accelerometer',
      ),
    [],
  );
  const engine = useMemo(() => new VibrationMeterEngine(), []);
  const [status, setStatus] = useState<MeterStatus>('stopped');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reading, setReading] = useState<ProcessedSignal>(INITIAL_READING);
  const [history, setHistory] = useState<number[]>([]);
  const mountedRef = useRef(true);
  const listeningRef = useRef(false);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      listeningRef.current = false;
      sensorManager.stop();
    };
  }, [sensorManager]);

  const stopMeasurement = useCallback(() => {
    listeningRef.current = false;
    sensorManager.stop();
    engine.reset();
    setStatus('stopped');
    setErrorMessage(null);
    setReading(INITIAL_READING);
    setHistory([]);
  }, [engine, sensorManager]);

  const startMeasurement = useCallback(async () => {
    if (status === 'running' || status === 'starting') {
      return;
    }

    setStatus('starting');
    setErrorMessage(null);
    engine.reset();
    setReading(INITIAL_READING);
    setHistory([]);
    listeningRef.current = true;

    try {
      const started = await sensorManager.start((sample) => {
        if (!mountedRef.current || !listeningRef.current) {
          return;
        }

        const nextReading = engine.process(sample);
        setReading(nextReading);
        setHistory((current) => {
          const nextHistory = [...current, nextReading.vibration];
          return nextHistory.slice(-DEFAULT_SIGNAL_CONFIG.maxChartPoints);
        });
      });

      if (started && mountedRef.current && listeningRef.current) {
        setStatus('running');
      }
    } catch (error) {
      sensorManager.stop();
      listeningRef.current = false;

      if (!mountedRef.current) {
        return;
      }

      setStatus('error');
      setErrorMessage(
        error instanceof SensorUnavailableError
          ? 'No accelerometer is available on this device.'
          : 'Unable to access the accelerometer. Try again on a physical Android device.',
      );
    }
  }, [engine, sensorManager, status]);

  const isActive = status === 'running' || status === 'starting';
  const statusLabel =
    status === 'running' ? 'LIVE' : status === 'starting' ? 'STARTING' : 'STOPPED';

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>SENSOR INSTRUMENT / 001</Text>
            <Text style={styles.title}>Vibration Meter</Text>
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
          <Text style={styles.statusMeta}>ACCELEROMETER</Text>
        </View>

        <View style={styles.readingCard}>
          <Text style={styles.readingLabel}>CURRENT VIBRATION</Text>
          <View style={styles.readingRow}>
            <Text style={styles.readingValue}>{reading.vibration.toFixed(3)}</Text>
            <Text style={styles.readingUnit}>m/s² RMS</Text>
          </View>
          <Text style={styles.readingHint}>Gravity compensated · short-term signal energy</Text>
        </View>

        <SignalChart values={history} unit={VIBRATION_METER_DEFINITION.display.unit} />

        <View style={styles.axesCard}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardLabel}>AXIS SNAPSHOT</Text>
            <Text style={styles.cardMeta}>RAW / g</Text>
          </View>
          <View style={styles.axisRow}>
            <AxisValue axis="X" value={reading.x} />
            <AxisValue axis="Y" value={reading.y} />
            <AxisValue axis="Z" value={reading.z} />
          </View>
        </View>

        {errorMessage !== null && (
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>SENSOR UNAVAILABLE</Text>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            isActive ? 'Stop vibration measurement' : 'Start vibration measurement'
          }
          onPress={isActive ? stopMeasurement : startMeasurement}
          style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
        >
          <Text style={styles.actionButtonText}>{isActive ? 'Stop' : 'Start measuring'}</Text>
          <Text style={styles.actionButtonArrow}>{isActive ? '■' : '→'}</Text>
        </Pressable>

        <Text style={styles.footerNote}>
          Place the phone on a stable surface, then tap the desk or move the phone to see the signal
          respond.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
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
