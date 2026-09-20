import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import type { InstrumentDefinition } from '../instruments/dsl/types';
import { SENSOR_METADATA } from '../sensors/types';

interface InstrumentPickerScreenProps {
  readonly definitions: readonly InstrumentDefinition[];
  readonly onSelect: (definition: InstrumentDefinition) => void;
}

export function InstrumentPickerScreen({ definitions, onSelect }: InstrumentPickerScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>SENSOR / INSTRUMENT BUILDER</Text>
        <Text style={styles.title}>Sensoraft</Text>
        <Text style={styles.subtitle}>Choose an instrument</Text>

        <View style={styles.list}>
          {definitions.map((definition) => {
            const metadata = SENSOR_METADATA[definition.sensor.type];

            return (
              <Pressable
                key={definition.id}
                accessibilityRole="button"
                accessibilityLabel={'Open ' + definition.name}
                onPress={() => onSelect(definition)}
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.cardCopy}>
                    <Text style={styles.cardTitle}>{definition.name}</Text>
                    <Text style={styles.cardDescription}>{definition.description}</Text>
                  </View>
                  <Text style={styles.cardArrow}>→</Text>
                </View>
                <View style={styles.metaRow}>
                  <Text style={styles.metaText}>{metadata.label.toUpperCase()}</Text>
                  <Text style={styles.metaDivider}>•</Text>
                  <Text style={styles.metaText}>{definition.display.unit}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.footer}>
          Every instrument uses the same validated DSL, compiled signal pipeline, and sensor
          runtime.
        </Text>
      </ScrollView>
    </SafeAreaView>
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
    paddingTop: 36,
    paddingBottom: 32,
  },
  eyebrow: {
    color: '#5d8b85',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.8,
  },
  title: {
    color: '#f2f7f6',
    fontSize: 38,
    fontWeight: '700',
    letterSpacing: -1,
    marginTop: 8,
  },
  subtitle: {
    color: '#93a4a8',
    fontSize: 18,
    marginTop: 8,
  },
  list: {
    gap: 12,
    marginTop: 30,
  },
  card: {
    borderWidth: 1,
    borderColor: '#1e3840',
    borderRadius: 20,
    backgroundColor: '#0e1a21',
    padding: 18,
  },
  cardPressed: {
    borderColor: '#50e3b2',
    backgroundColor: '#102a2c',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  cardCopy: {
    flex: 1,
    paddingRight: 12,
  },
  cardTitle: {
    color: '#f2f7f6',
    fontSize: 20,
    fontWeight: '700',
  },
  cardDescription: {
    color: '#789197',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 7,
  },
  cardArrow: {
    color: '#50e3b2',
    fontSize: 24,
    fontWeight: '300',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 18,
  },
  metaText: {
    color: '#82b6a9',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.1,
  },
  metaDivider: {
    color: '#35505a',
  },
  footer: {
    color: '#607680',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 28,
    textAlign: 'center',
  },
});
