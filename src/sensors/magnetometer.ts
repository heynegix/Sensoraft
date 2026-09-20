import { Magnetometer } from 'expo-sensors';

import { Vector3SensorSource } from './vector3-source';

export class MagnetometerSource extends Vector3SensorSource {
  public constructor(updateIntervalMs: number) {
    super(Magnetometer, updateIntervalMs);
  }
}
