import { StyleSheet, Text, View } from 'react-native';

import { DEFAULT_SIGNAL_CONFIG } from '../signal/constants';

interface SignalChartProps {
  readonly values: readonly number[];
  readonly unit: string;
}

const CHART_HEIGHT = 180;
const MINIMUM_SCALE = 0.25;
const GRID_LEVELS = [0.25, 0.5, 0.75];

export function SignalChart({ values, unit }: SignalChartProps) {
  const visibleValues = values.slice(-DEFAULT_SIGNAL_CONFIG.maxChartPoints);
  const peak = visibleValues.reduce((highest, value) => Math.max(highest, value), 0);
  const scale = Math.max(MINIMUM_SCALE, peak);

  return (
    <View accessible accessibilityLabel={`Realtime vibration chart in ${unit}`} style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>REALTIME SIGNAL</Text>
        <Text style={styles.scaleLabel}>
          0 — {scale.toFixed(2)} {unit}
        </Text>
      </View>

      <View style={styles.chart}>
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {GRID_LEVELS.map((level) => (
            <View
              key={level}
              style={[styles.gridLine, { bottom: Math.round(CHART_HEIGHT * level) }]}
            />
          ))}
          <View style={[styles.gridLine, styles.zeroLine]} />
        </View>

        <View style={styles.barRow}>
          {visibleValues.map((value, index) => {
            const ratio = Math.min(1, Math.max(0, value / scale));
            const height = Math.max(2, Math.round(CHART_HEIGHT * ratio));

            return (
              <View key={index} style={styles.barColumn}>
                <View style={[styles.bar, { height }]} />
              </View>
            );
          })}
        </View>

        {visibleValues.length === 0 && (
          <Text style={styles.emptyLabel}>Press Start to stream data</Text>
        )}
      </View>

      <View style={styles.footerRow}>
        <Text style={styles.footerText}>
          PAST {Math.round((visibleValues.length * DEFAULT_SIGNAL_CONFIG.sensorIntervalMs) / 1000)}s
        </Text>
        <Text style={styles.footerText}>{visibleValues.length} samples</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: '#1e303a',
    borderRadius: 20,
    backgroundColor: '#0e1a21',
    padding: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  label: {
    color: '#8fa6b0',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
  },
  scaleLabel: {
    color: '#657b85',
    fontSize: 11,
  },
  chart: {
    height: CHART_HEIGHT,
    overflow: 'hidden',
    position: 'relative',
    borderRadius: 12,
    backgroundColor: '#0a141a',
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#19303a',
  },
  zeroLine: {
    bottom: 0,
    backgroundColor: '#31505a',
  },
  barRow: {
    height: CHART_HEIGHT,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 4,
  },
  barColumn: {
    flex: 1,
    height: CHART_HEIGHT,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  bar: {
    width: 3,
    borderRadius: 3,
    backgroundColor: '#50e3b2',
  },
  emptyLabel: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    textAlign: 'center',
    color: '#607680',
    fontSize: 13,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  footerText: {
    color: '#607680',
    fontSize: 10,
    letterSpacing: 1,
  },
});
