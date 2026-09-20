export const METERS_PER_SECOND_SQUARED_PER_G = 9.80665;

export interface SignalProcessingConfig {
  readonly sensorIntervalMs: number;
  /** A small alpha keeps gravity and slow orientation drift out of the signal. */
  readonly gravityCompensationAlpha: number;
  readonly movingAverageWindowSize: number;
  readonly rmsWindowSize: number;
  readonly maxChartPoints: number;
}

export const DEFAULT_SIGNAL_CONFIG: Readonly<SignalProcessingConfig> = {
  sensorIntervalMs: 50,
  gravityCompensationAlpha: 0.04,
  movingAverageWindowSize: 4,
  rmsWindowSize: 12,
  maxChartPoints: 90,
};
