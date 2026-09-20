import type { AccelerometerSample } from '../sensors/types';

import {
  DEFAULT_SIGNAL_CONFIG,
  METERS_PER_SECOND_SQUARED_PER_G,
  type SignalProcessingConfig,
} from './constants';
import { VectorBaselineCompensator } from './gravity-compensation';
import { magnitude } from './magnitude';
import { MovingAverageFilter } from './moving-average';
import { RmsFilter } from './rms';

export interface ProcessedSignal {
  readonly timestamp: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Raw vector magnitude, converted from g to m/s². */
  readonly magnitude: number;
  /** RMS vibration amplitude after baseline compensation and smoothing. */
  readonly vibration: number;
}

export class VibrationSignalProcessor {
  private readonly baselineCompensator: VectorBaselineCompensator;
  private readonly movingAverageFilter: MovingAverageFilter;
  private readonly rmsFilter: RmsFilter;

  public constructor(config: SignalProcessingConfig = DEFAULT_SIGNAL_CONFIG) {
    this.baselineCompensator = new VectorBaselineCompensator(config.gravityCompensationAlpha);
    this.movingAverageFilter = new MovingAverageFilter(config.movingAverageWindowSize);
    this.rmsFilter = new RmsFilter(config.rmsWindowSize);
  }

  public process(sample: AccelerometerSample): ProcessedSignal {
    const magnitudeInG = magnitude(sample);
    const gravityCompensatedInG = magnitude(this.baselineCompensator.process(sample));
    const averagedInG = this.movingAverageFilter.add(gravityCompensatedInG);
    const rmsInG = this.rmsFilter.add(averagedInG);

    return {
      timestamp: sample.timestamp,
      x: sample.x,
      y: sample.y,
      z: sample.z,
      magnitude: magnitudeInG * METERS_PER_SECOND_SQUARED_PER_G,
      vibration: rmsInG * METERS_PER_SECOND_SQUARED_PER_G,
    };
  }

  public reset(): void {
    this.baselineCompensator.reset();
    this.movingAverageFilter.reset();
    this.rmsFilter.reset();
  }
}
