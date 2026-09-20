import { compileInstrument } from '../src/instruments/runtime/compiler';
import { InstrumentRuntime } from '../src/instruments/runtime/runtime';
import {
  BUILT_IN_INSTRUMENTS,
  MAGNETIC_FIELD_METER_DEFINITION,
  ROTATION_METER_DEFINITION,
  VIBRATION_METER_DEFINITION,
} from '../src/instruments/definitions';
import { parseInstrumentDefinition } from '../src/instruments/dsl/parser';
import { validateInstrumentDefinition } from '../src/instruments/dsl/validator';
import { AccelerometerSource } from '../src/sensors/accelerometer';
import { GyroscopeSource } from '../src/sensors/gyroscope';
import { MagnetometerSource } from '../src/sensors/magnetometer';
import { Vector3SensorSource } from '../src/sensors/vector3-source';
import { createSensorAdapter, toSensorIntervalMs } from '../src/instruments/runtime/sensor-factory';
import type { SensorController, SensorSample } from '../src/sensors/types';

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

function withSensorPipeline(
  sensorType: string,
  pipeline: readonly unknown[],
  unit: string,
): string {
  const base = JSON.parse(VALID_DEFINITION_JSON) as Record<string, unknown>;
  const display = base.display as Record<string, unknown>;

  return JSON.stringify({
    ...base,
    sensor: { type: sensorType, sampleRateHz: 20 },
    pipeline,
    display: { ...display, unit },
  });
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

  it('accepts gyroscope and magnetometer definitions', () => {
    const gyroscope = parseInstrumentDefinition(
      withSensorPipeline('gyroscope', [{ op: 'magnitude' }], 'rad/s'),
    );
    const magnetometer = parseInstrumentDefinition(
      withSensorPipeline('magnetometer', [{ op: 'magnitude' }], 'μT'),
    );

    expect(gyroscope.sensor.type).toBe('gyroscope');
    expect(magnetometer.sensor.type).toBe('magnetometer');
    expect(() => compileInstrument(gyroscope)).not.toThrow();
    expect(() => compileInstrument(magnetometer)).not.toThrow();
  });

  it('validates and compiles every built-in instrument definition', () => {
    expect(BUILT_IN_INSTRUMENTS).toHaveLength(3);

    for (const definition of BUILT_IN_INSTRUMENTS) {
      expect(() => compileInstrument(definition)).not.toThrow();
    }

    expect(ROTATION_METER_DEFINITION.sensor.type).toBe('gyroscope');
    expect(MAGNETIC_FIELD_METER_DEFINITION.sensor.type).toBe('magnetometer');
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
      validateInstrumentDefinition({
        ...JSON.parse(VALID_DEFINITION_JSON),
        pipeline: [...VALID_PIPELINE.slice(0, -1), { op: 'scale', factor: 1000.001 }],
      }),
    ).toThrow('between -1000 and 1000');

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
      parseInstrumentDefinition(withSensor({ type: 'barometer', sampleRateHz: 20 })),
    ).toThrow('Unsupported sensor type: barometer');

    expect(() => parseInstrumentDefinition(withPipeline([]))).toThrow(
      'pipeline must contain at least one operation',
    );
  });

  it('rejects gravity compensation for gyroscope and magnetometer', () => {
    for (const sensorType of ['gyroscope', 'magnetometer']) {
      expect(() =>
        parseInstrumentDefinition(
          withSensorPipeline(
            sensorType,
            [{ op: 'gravityCompensation', alpha: 0.04 }, { op: 'magnitude' }],
            'unit',
          ),
        ),
      ).toThrow('Operation gravityCompensation is not supported for sensor type ' + sensorType);
    }
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

class FakeSensorController implements SensorController<SensorSample> {
  public isRunning = false;
  public startCalls = 0;
  public stopCalls = 0;
  private listener: ((sample: SensorSample) => void) | null = null;

  public start(listener: (sample: SensorSample) => void): Promise<boolean> {
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

  public emit(sample: SensorSample): void {
    this.listener?.(sample);
  }
}

class DeferredSensorController implements SensorController<SensorSample> {
  public isRunning = false;
  public release: ((started: boolean) => void) | null = null;

  public start(listener: (sample: SensorSample) => void): Promise<boolean> {
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

describe('Sensor factory and vector runtime', () => {
  it('maps each supported sensor and preserves the configured sample interval', () => {
    expect(createSensorAdapter('accelerometer', 50)).toBeInstanceOf(AccelerometerSource);
    expect(createSensorAdapter('gyroscope', 50)).toBeInstanceOf(GyroscopeSource);
    expect(createSensorAdapter('magnetometer', 50)).toBeInstanceOf(MagnetometerSource);
    expect(toSensorIntervalMs(20)).toBe(50);
    expect(toSensorIntervalMs(100)).toBe(10);
  });

  it('processes gyroscope and magnetometer vector samples through the shared runtime', async () => {
    for (const [sensorType, unit] of [
      ['gyroscope', 'rad/s'],
      ['magnetometer', 'μT'],
    ] as const) {
      const controller = new FakeSensorController();
      const runtime = new InstrumentRuntime(
        parseInstrumentDefinition(withSensorPipeline(sensorType, [{ op: 'magnitude' }], unit)),
        { sensorController: controller },
      );
      const listener = jest.fn();

      await expect(runtime.start(listener)).resolves.toBe(true);
      controller.emit({ x: 0.3, y: 0.4, z: 0, timestamp: 123 });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          value: 0.5,
          raw: { x: 0.3, y: 0.4, z: 0, timestamp: 123 },
        }),
      );
      runtime.dispose();
    }
  });

  it('normalizes Expo timestamps and removes vector sensor subscriptions', async () => {
    let emit:
      ((measurement: { x: number; y: number; z: number; timestamp: number }) => void) | undefined;
    const remove = jest.fn();
    const sensor = {
      isAvailableAsync: jest.fn().mockResolvedValue(true),
      setUpdateInterval: jest.fn(),
      addListener: jest.fn(
        (
          listener: (measurement: { x: number; y: number; z: number; timestamp: number }) => void,
        ) => {
          emit = listener;
          return { remove };
        },
      ),
    };
    const source = new Vector3SensorSource(sensor, 50);
    const samples: SensorSample[] = [];

    await expect(source.isAvailable()).resolves.toBe(true);
    const subscription = source.subscribe((sample) => samples.push(sample));
    emit?.({ x: 1, y: -2, z: 3, timestamp: 1.25 });

    expect(sensor.setUpdateInterval).toHaveBeenCalledWith(50);
    expect(samples).toEqual([{ x: 1, y: -2, z: 3, timestamp: 1250 }]);

    subscription.remove();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
