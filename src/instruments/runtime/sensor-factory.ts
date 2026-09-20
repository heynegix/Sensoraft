import { AccelerometerSource } from '../../sensors/accelerometer';
import { GyroscopeSource } from '../../sensors/gyroscope';
import { MagnetometerSource } from '../../sensors/magnetometer';
import { SensorManager } from '../../sensors/sensor-manager';
import {
  SENSOR_METADATA,
  type SensorAdapter,
  type SensorController,
  type SensorType,
  type Vector3SensorSample,
} from '../../sensors/types';
import { InstrumentRuntimeError } from '../dsl/errors';
import type { InstrumentDefinition } from '../dsl/types';

export function createSensorAdapter(
  sensorType: SensorType,
  intervalMs: number,
): SensorAdapter<Vector3SensorSample> {
  switch (sensorType) {
    case 'accelerometer':
      return new AccelerometerSource(intervalMs);
    case 'gyroscope':
      return new GyroscopeSource(intervalMs);
    case 'magnetometer':
      return new MagnetometerSource(intervalMs);
    default:
      throw new InstrumentRuntimeError('Sensor ' + sensorType + ' is not implemented.');
  }
}

export function toSensorIntervalMs(sampleRateHz: number): number {
  return Math.max(1, Math.round(1000 / sampleRateHz));
}

export function createSensorController(
  definition: InstrumentDefinition,
): SensorController<Vector3SensorSample> {
  const intervalMs = toSensorIntervalMs(definition.sensor.sampleRateHz);
  return new SensorManager(
    createSensorAdapter(definition.sensor.type, intervalMs),
    SENSOR_METADATA[definition.sensor.type].label,
  );
}
