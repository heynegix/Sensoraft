import { compileInstrument } from '../src/instruments/runtime/compiler';
import { InstrumentRuntime } from '../src/instruments/runtime/runtime';
import { VIBRATION_METER_DEFINITION } from '../src/instruments/definitions/vibration-meter';
import { parseInstrumentDefinition } from '../src/instruments/dsl/parser';
import { validateInstrumentDefinition } from '../src/instruments/dsl/validator';
import type { AccelerometerSample, SensorController } from '../src/sensors/types';

const VALID_PIPELINE = [
  { op: 'gravityCompensation', alpha: 0.04 },
  { op: 'magnitude' },
  { op: 'movingAverage', windowSize: 1 },
  { op: 'rms', windowSize: 1 },
  { op: 'scale', factor: 9.80665 },
];

const VALID_DEFINITION_JSON = JSON.stringify({
  version: 1,
  id: 'test-vibration',
  name: 'Test Vibration',
  description: 'A test instrument.',
  sensor: {
    type: 'accelerometer',
    sampleRateHz: 20,
  },
  pipeline: VALID_PIPELINE,
  display: {
    type: 'line',
    label: 'Vibration',
    unit: 'm/s²',
    precision: 3,
  },
});

function withPipeline(pipeline: readonly unknown[]): string {
  const base = JSON.parse(VALID_DEFINITION_JSON) as Record<string, unknown>;
  return JSON.stringify({ ...base, pipeline });
}

function withSensor(sensor: unknown): string {
  const base = JSON.parse(VALID_DEFINITION_JSON) as Record<string, unknown>;
  return JSON.stringify({ ...base, sensor });
}

describe('Instrument DSL validation and compilation', () => {
  it('parses JSON, validates, compiles, and runs a declarative pipeline', () => {
    const definition = parseInstrumentDefinition(VALID_DEFINITION_JSON);
    const instrument = compileInstrument(definition);

    instrument.process({ x: 0, y: 0, z: 1, timestamp: 0 });
    const measurement = instrument.process({ x: 0.1, y: 0, z: 1, timestamp: 1 });

    expect(definition.id).toBe('test-vibration');
    expect(measurement.value).toBeCloseTo(0.1 * 9.80665, 8);
  });

  it('preserves lateral acceleration after vector gravity compensation', () => {
    const instrument = compileInstrument(parseInstrumentDefinition(VALID_DEFINITION_JSON));

    instrument.process({ x: 0, y: 0, z: 1, timestamp: 0 });
    const measurement = instrument.process({ x: 0.1, y: 0, z: 1, timestamp: 1 });

    expect(measurement.value).toBeCloseTo(0.1 * 9.80665, 8);
  });

  it('keeps the declarative Vibration Meter responsive to lateral motion', () => {
    const instrument = compileInstrument(VIBRATION_METER_DEFINITION);

    instrument.process({ x: 0, y: 0, z: 1, timestamp: 0 });
    let measurement = instrument.process({ x: 0.1, y: 0, z: 1, timestamp: 1 });
    for (let timestamp = 2; timestamp <= 12; timestamp += 1) {
      measurement = instrument.process({ x: 0.1, y: 0, z: 1, timestamp });
    }

    expect(measurement.value).toBeGreaterThan(0.5);
  });

  it('rejects unknown operations', () => {
    expect(() => parseInstrumentDefinition(withPipeline([{ op: 'fooBar' }]))).toThrow(
      'Unknown operation: fooBar',
    );
  });

  it('rejects unsupported versions', () => {
    const base = JSON.parse(VALID_DEFINITION_JSON) as Record<string, unknown>;

    expect(() => parseInstrumentDefinition(JSON.stringify({ ...base, version: 2 }))).toThrow(
      'version must be 1',
    );
  });

  it('rejects invalid operation parameters', () => {
    expect(() =>
      parseInstrumentDefinition(
        withPipeline([{ op: 'gravityCompensation', alpha: 0 }, ...VALID_PIPELINE.slice(1)]),
      ),
    ).toThrow('alpha must be greater than 0');

    expect(() =>
      validateInstrumentDefinition({
        ...JSON.parse(VALID_DEFINITION_JSON),
        pipeline: [...VALID_PIPELINE.slice(0, -1), { op: 'scale', factor: Infinity }],
      }),
    ).toThrow('finite number');

    expect(() =>
      parseInstrumentDefinition(
        withPipeline([
          { op: 'gravityCompensation', alpha: 0.04 },
          { op: 'magnitude' },
          { op: 'movingAverage', windowSize: 501 },
          { op: 'rms', windowSize: 1 },
          { op: 'scale', factor: 9.80665 },
        ]),
      ),
    ).toThrow('windowSize must be an integer between 1 and 500');

    const base = JSON.parse(VALID_DEFINITION_JSON) as Record<string, unknown>;
    expect(() =>
      parseInstrumentDefinition(
        JSON.stringify({
          ...base,
          sensor: { type: 'accelerometer', sampleRateHz: 101 },
        }),
      ),
    ).toThrow('sampleRateHz must be an integer between 1 and 100');

    expect(() =>
      parseInstrumentDefinition(
        withPipeline([{ op: 'gravityCompensation' }, ...VALID_PIPELINE.slice(1)]),
      ),
    ).toThrow('alpha is required');
  });

  it('rejects incompatible pipeline types with a clear error', () => {
    expect(() =>
      parseInstrumentDefinition(
        withPipeline([
          { op: 'magnitude' },
          { op: 'gravityCompensation', alpha: 0.04 },
          { op: 'magnitude' },
        ]),
      ),
    ).toThrow('Pipeline type mismatch: gravityCompensation expects Vector3 but received Scalar.');
  });

  it('rejects invalid sensors and empty pipelines', () => {
    expect(() =>
      parseInstrumentDefinition(withSensor({ type: 'gyroscope', sampleRateHz: 20 })),
    ).toThrow('Unsupported sensor type: gyroscope');

    expect(() => parseInstrumentDefinition(withPipeline([]))).toThrow(
      'pipeline must contain at least one operation',
    );
  });

  it('rejects non-finite sensor samples at runtime', () => {
    const instrument = compileInstrument(parseInstrumentDefinition(VALID_DEFINITION_JSON));

    expect(() => instrument.process({ x: Number.NaN, y: 0, z: 1, timestamp: 0 })).toThrow(
      'non-finite',
    );
  });

  it('rejects definitions and operations with inherited fields', () => {
    const inheritedDefinition = Object.create({
      version: 1,
      id: 'inherited',
      name: 'Inherited',
      sensor: { type: 'accelerometer', sampleRateHz: 20 },
      pipeline: VALID_PIPELINE,
      display: { type: 'line', label: 'Value', unit: 'g', precision: 3 },
    }) as object;

    expect(() => validateInstrumentDefinition(inheritedDefinition)).toThrow(
      'Instrument definition must be an object',
    );

    const base = JSON.parse(VALID_DEFINITION_JSON) as Record<string, unknown>;
    const inheritedOperation = Object.create({
      op: 'gravityCompensation',
      alpha: 0.04,
    }) as object;

    expect(() =>
      validateInstrumentDefinition({
        ...base,
        pipeline: [inheritedOperation, ...VALID_PIPELINE.slice(1)],
      }),
    ).toThrow('pipeline[0] must be an object');
  });
});

class FakeSensorController implements SensorController<AccelerometerSample> {
  public isRunning = false;
  public startCalls = 0;
  public stopCalls = 0;
  private listener: ((sample: AccelerometerSample) => void) | null = null;

  public start(listener: (sample: AccelerometerSample) => void): Promise<boolean> {
    this.startCalls += 1;
    this.listener = listener;
    this.isRunning = true;
    return Promise.resolve(true);
  }

  public stop(): void {
    this.stopCalls += 1;
    this.listener = null;
    this.isRunning = false;
  }

  public emit(sample: AccelerometerSample): void {
    this.listener?.(sample);
  }
}

class DeferredSensorController implements SensorController<AccelerometerSample> {
  public isRunning = false;
  public release: ((started: boolean) => void) | null = null;

  public start(listener: (sample: AccelerometerSample) => void): Promise<boolean> {
    void listener;
    return new Promise((resolve) => {
      this.release = resolve;
    });
  }

  public stop(): void {
    this.isRunning = false;
  }
}

describe('InstrumentRuntime lifecycle', () => {
  it('starts, stops, starts again, and disposes without retaining a stream', async () => {
    const controller = new FakeSensorController();
    const runtime = new InstrumentRuntime(parseInstrumentDefinition(VALID_DEFINITION_JSON), {
      sensorController: controller,
    });
    const listener = jest.fn();

    await expect(runtime.start(listener)).resolves.toBe(true);
    expect(runtime.isRunning).toBe(true);
    controller.emit({ x: 0, y: 0, z: 1, timestamp: 0 });
    expect(listener).toHaveBeenCalledTimes(1);

    runtime.stop();
    expect(runtime.isRunning).toBe(false);
    expect(controller.stopCalls).toBe(1);

    await expect(runtime.start(listener)).resolves.toBe(true);
    expect(controller.startCalls).toBe(2);
    runtime.dispose();
    expect(runtime.isRunning).toBe(false);
    expect(controller.stopCalls).toBe(2);
    await expect(runtime.start(listener)).rejects.toThrow('disposed');
  });

  it('ignores a stale asynchronous start after stop', async () => {
    const controller = new DeferredSensorController();
    const runtime = new InstrumentRuntime(parseInstrumentDefinition(VALID_DEFINITION_JSON), {
      sensorController: controller,
    });
    const startPromise = runtime.start(jest.fn());

    runtime.stop();
    controller.release?.(true);

    await expect(startPromise).resolves.toBe(false);
    expect(runtime.isRunning).toBe(false);
  });
});
