import { AccelerometerSource } from '../../sensors/accelerometer';
import { SensorManager } from '../../sensors/sensor-manager';
import type { AccelerometerSample, SensorController } from '../../sensors/types';
import { InstrumentRuntimeError } from '../dsl/errors';
import type { InstrumentDefinition } from '../dsl/types';

export function createSensorController(
  definition: InstrumentDefinition,
): SensorController<AccelerometerSample> {
  if (definition.sensor.type !== 'accelerometer') {
    throw new InstrumentRuntimeError('Sensor ' + definition.sensor.type + ' is not implemented.');
  }

  const intervalMs = Math.max(1, Math.round(1000 / definition.sensor.sampleRateHz));
  return new SensorManager(new AccelerometerSource(intervalMs), 'Accelerometer');
}
