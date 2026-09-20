import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { getChartElapsedMs, type ChartSample } from './chart-history';
import { DEFAULT_SIGNAL_CONFIG } from '../signal/constants';

interface SignalChartProps {
  readonly label: string;
  readonly samples: readonly ChartSample[];
  readonly unit: string;
}

const CHART_HEIGHT = 180;
const MINIMUM_SCALE = 0.25;
const GRID_LEVELS = [0.25, 0.5, 0.75];

export function SignalChart({ label, samples, unit }: SignalChartProps) {
  const [chartWidth, setChartWidth] = useState(0);
  const visibleSamples = samples.slice(-DEFAULT_SIGNAL_CONFIG.maxChartPoints);
  const visibleValues = visibleSamples.map((sample) => sample.value);
  const elapsedMs = getChartElapsedMs(visibleSamples);
  const peak = visibleValues.reduce(
    (highest, value) => Math.max(highest, Number.isFinite(value) ? Math.abs(value) : 0),
    0,
  );
  const scale = Math.max(MINIMUM_SCALE, peak);
  const points = visibleValues.map((value, index) => {
    const safeValue = Number.isFinite(value) ? value : 0;
    const ratio = Math.max(-1, Math.min(1, safeValue / scale));
    const x =
      visibleValues.length <= 1
        ? chartWidth / 2
        : (index / (visibleValues.length - 1)) * chartWidth;
    const y = CHART_HEIGHT / 2 - ratio * (CHART_HEIGHT / 2);

    return { x, y };
  });

  return (
    <View
      accessible
      accessibilityLabel={'Realtime ' + label + ' chart in ' + unit}
      style={styles.card}
    >
      <View style={styles.headerRow}>
        <Text style={styles.label}>REALTIME {label.toUpperCase()}</Text>
        <Text style={styles.scaleLabel}>
          ±{scale.toFixed(2)} {unit}
        </Text>
      </View>

      <View
        onLayout={({ nativeEvent: { layout } }) => {
          setChartWidth((currentWidth) =>
            currentWidth === layout.width ? currentWidth : layout.width,
          );
        }}
        style={styles.chart}
      >
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          {GRID_LEVELS.flatMap((level) => [
            <View
              key={'positive-' + level}
              style={[
                styles.gridLine,
                { bottom: Math.round(CHART_HEIGHT / 2 + (CHART_HEIGHT / 2) * level) },
              ]}
            />,
            <View
              key={'negative-' + level}
              style={[
                styles.gridLine,
                { bottom: Math.round(CHART_HEIGHT / 2 - (CHART_HEIGHT / 2) * level) },
              ]}
            />,
          ])}
          <View style={[styles.gridLine, styles.zeroLine]} />
        </View>

        {chartWidth > 0 && points.length > 0 && (
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            {points.length > 1 &&
              points.slice(0, -1).map((point, index) => {
                const nextPoint = points[index + 1];
                const dx = nextPoint.x - point.x;
                const dy = nextPoint.y - point.y;
                const length = Math.sqrt(dx * dx + dy * dy);
                const angle = Math.atan2(dy, dx) * (180 / Math.PI);

                return (
                  <View
                    key={'segment-' + index}
                    style={[
                      styles.lineSegment,
                      {
                        left: (point.x + nextPoint.x) / 2 - length / 2,
                        top: (point.y + nextPoint.y) / 2 - 1,
                        transform: [{ rotate: angle + 'deg' }],
                        width: length,
                      },
                    ]}
                  />
                );
              })}
            {points.map((point, index) => (
              <View
                key={'point-' + index}
                style={[styles.linePoint, { left: point.x - 3, top: point.y - 3 }]}
              />
            ))}
          </View>
        )}

        {visibleValues.length === 0 && (
          <Text style={styles.emptyLabel}>Press Start to stream data</Text>
        )}
      </View>

      <View style={styles.footerRow}>
        <Text style={styles.footerText}>PAST {Math.round(elapsedMs / 1000)}s</Text>
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
    bottom: CHART_HEIGHT / 2,
    backgroundColor: '#31505a',
  },
  lineSegment: {
    position: 'absolute',
    height: 2,
    borderRadius: 2,
    backgroundColor: '#50e3b2',
  },
  linePoint: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#a2ffe0',
    borderWidth: 1,
    borderColor: '#50e3b2',
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
