import { DEFAULT_SIGNAL_CONFIG, type SignalProcessingConfig } from '../signal/constants';
import { VibrationSignalProcessor, type ProcessedSignal } from '../signal/processor';

import type { InstrumentDefinition } from './types';

export const VIBRATION_METER_DEFINITION: InstrumentDefinition = {
  id: 'vibration-meter',
  name: 'Vibration Meter',
  sensor: 'accelerometer',
  pipeline: [
    { op: 'gravityCompensation' },
    { op: 'magnitude' },
    { op: 'movingAverage', windowSize: DEFAULT_SIGNAL_CONFIG.movingAverageWindowSize },
    { op: 'rms', windowSize: DEFAULT_SIGNAL_CONFIG.rmsWindowSize },
  ],
  display: {
    type: 'line',
    unit: 'm/s²',
    decimals: 3,
  },
};

export class VibrationMeterEngine {
  private readonly processor: VibrationSignalProcessor;

  public constructor(config: SignalProcessingConfig = DEFAULT_SIGNAL_CONFIG) {
    this.processor = new VibrationSignalProcessor(config);
  }

  public process(sample: Parameters<VibrationSignalProcessor['process']>[0]): ProcessedSignal {
    return this.processor.process(sample);
  }

  public reset(): void {
    this.processor.reset();
  }
}
