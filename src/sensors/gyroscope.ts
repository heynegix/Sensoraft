import { Gyroscope } from 'expo-sensors';

import { Vector3SensorSource } from './vector3-source';

export class GyroscopeSource extends Vector3SensorSource {
  public constructor(updateIntervalMs: number) {
    super(Gyroscope, updateIntervalMs);
  }
}
