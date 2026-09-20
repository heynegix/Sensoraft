import { Accelerometer } from 'expo-sensors';

import { Vector3SensorSource } from './vector3-source';

export class AccelerometerSource extends Vector3SensorSource {
  public constructor(updateIntervalMs: number) {
    super(Accelerometer, updateIntervalMs);
  }
}
