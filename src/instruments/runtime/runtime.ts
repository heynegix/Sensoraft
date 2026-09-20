import type { SensorController, SensorSample } from '../../sensors/types';
import { SensorUnavailableError } from '../../sensors/sensor-manager';
import { InstrumentRuntimeError } from '../dsl/errors';
import { compileInstrument, type CompiledInstrument, type InstrumentMeasurement } from './compiler';
import { createSensorController } from './sensor-factory';

export type InstrumentMeasurementListener = (measurement: InstrumentMeasurement) => void;
export type InstrumentRuntimeErrorListener = (error: Error) => void;

export interface InstrumentRuntimeDependencies {
  readonly sensorController?: SensorController<SensorSample>;
}

export class InstrumentRuntime {
  private readonly compiledInstrument: CompiledInstrument;
  private readonly sensorController: SensorController<SensorSample>;
  private requestId = 0;
  private disposed = false;

  public constructor(input: unknown, dependencies: InstrumentRuntimeDependencies = {}) {
    this.compiledInstrument = compileInstrument(input);
    this.sensorController =
      dependencies.sensorController ?? createSensorController(this.compiledInstrument.definition);
  }

  public get definition() {
    return this.compiledInstrument.definition;
  }

  public get isRunning(): boolean {
    return !this.disposed && this.sensorController.isRunning;
  }

  public async start(
    listener: InstrumentMeasurementListener,
    onError?: InstrumentRuntimeErrorListener,
  ): Promise<boolean> {
    if (this.disposed) {
      throw new InstrumentRuntimeError('Cannot start a disposed instrument runtime.');
    }

    const requestId = ++this.requestId;
    this.compiledInstrument.reset();

    try {
      const started = await this.sensorController.start((sample) => {
        if (this.disposed || requestId !== this.requestId) {
          return;
        }

        try {
          listener(this.compiledInstrument.process(sample));
        } catch (error) {
          const runtimeError =
            error instanceof InstrumentRuntimeError
              ? error
              : new InstrumentRuntimeError('Instrument processing failed.', { cause: error });
          this.sensorController.stop();
          this.compiledInstrument.reset();
          this.requestId += 1;
          onError?.(runtimeError);
        }
      });

      return started && !this.disposed && requestId === this.requestId;
    } catch (error) {
      if (this.disposed || requestId !== this.requestId) {
        return false;
      }

      if (error instanceof SensorUnavailableError) {
        throw error;
      }

      throw error;
    }
  }

  public stop(): void {
    this.requestId += 1;
    this.sensorController.stop();
    this.compiledInstrument.reset();
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }

    this.stop();
    this.disposed = true;
  }
}
