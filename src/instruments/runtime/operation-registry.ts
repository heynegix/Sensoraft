import { VectorBaselineCompensator } from '../../signal/gravity-compensation';
import { magnitude, type Vector3 } from '../../signal/magnitude';
import { MovingAverageFilter } from '../../signal/moving-average';
import { RmsFilter } from '../../signal/rms';
import { SUPPORTED_SENSOR_TYPES } from '../../sensors/types';
import { InstrumentCompileError, InstrumentValidationError } from '../dsl/errors';
import type {
  GravityCompensationOperation,
  MagnitudeOperation,
  MovingAverageOperation,
  PipelineOperation,
  PipelineValueType,
  RmsOperation,
  SensorType,
  ScaleOperation,
  TransformType,
} from '../dsl/types';

export type PipelineValue = Vector3 | number;

export interface CompiledOperation {
  readonly inputType: PipelineValueType;
  readonly outputType: PipelineValueType;
  process(value: PipelineValue): PipelineValue;
  reset(): void;
}

export interface OperationDefinition {
  readonly name: TransformType;
  readonly inputType: PipelineValueType;
  readonly outputType: PipelineValueType;
  readonly supportedSensors: readonly SensorType[];
  normalize(raw: Readonly<Record<string, unknown>>, path: string): PipelineOperation;
  createProcessor(operation: PipelineOperation): CompiledOperation;
}

const MAX_WINDOW_SIZE = 500;
export const MAX_SCALE_FACTOR = 1000;

function assertKnownKeys(
  raw: Readonly<Record<string, unknown>>,
  allowedKeys: readonly string[],
  path: string,
): void {
  const prototype = Object.getPrototypeOf(raw);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new InstrumentValidationError(path + ' must be a plain object.');
  }

  const unknownKey = Object.keys(raw).find((key) => !allowedKeys.includes(key));
  if (unknownKey !== undefined) {
    throw new InstrumentValidationError('Unknown field: ' + path + '.' + unknownKey);
  }
}

function own(raw: Readonly<Record<string, unknown>>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(raw, key) ? raw[key] : undefined;
}

function readFiniteNumber(raw: unknown, path: string): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    throw new InstrumentValidationError(path + ' must be a finite number.');
  }

  return raw;
}

function readWindowSize(raw: unknown, path: string): number {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1 || raw > MAX_WINDOW_SIZE) {
    throw new InstrumentValidationError(
      path + ' must be an integer between 1 and ' + MAX_WINDOW_SIZE + '.',
    );
  }

  return raw;
}

function ensureVector(value: PipelineValue, operation: TransformType): Vector3 {
  if (typeof value === 'number') {
    throw new InstrumentCompileError(operation + ' received Scalar at runtime.');
  }

  return value;
}

function ensureScalar(value: PipelineValue, operation: TransformType): number {
  if (typeof value !== 'number') {
    throw new InstrumentCompileError(operation + ' received Vector3 at runtime.');
  }

  return value;
}

function operationWithProcessor(
  inputType: PipelineValueType,
  outputType: PipelineValueType,
  process: (value: PipelineValue) => PipelineValue,
  reset: () => void = () => undefined,
): CompiledOperation {
  return { inputType, outputType, process, reset };
}

const gravityCompensation: OperationDefinition = {
  name: 'gravityCompensation',
  inputType: 'vector3',
  outputType: 'vector3',
  supportedSensors: ['accelerometer'],
  normalize(raw, path): GravityCompensationOperation {
    assertKnownKeys(raw, ['op', 'alpha'], path);
    if (own(raw, 'alpha') === undefined) {
      throw new InstrumentValidationError(path + '.alpha is required.');
    }
    const alpha = readFiniteNumber(own(raw, 'alpha'), path + '.alpha');

    if (alpha <= 0 || alpha > 1) {
      throw new InstrumentValidationError(path + '.alpha must be greater than 0 and at most 1.');
    }

    return { op: 'gravityCompensation', alpha };
  },
  createProcessor(operation): CompiledOperation {
    if (operation.op !== 'gravityCompensation') {
      throw new InstrumentCompileError('Operation registry configuration mismatch.');
    }

    const compensator = new VectorBaselineCompensator(operation.alpha);
    return operationWithProcessor(
      'vector3',
      'vector3',
      (value) => compensator.process(ensureVector(value, operation.op)),
      () => compensator.reset(),
    );
  },
};

const magnitudeOperation: OperationDefinition = {
  name: 'magnitude',
  inputType: 'vector3',
  outputType: 'scalar',
  supportedSensors: SUPPORTED_SENSOR_TYPES,
  normalize(raw, path): MagnitudeOperation {
    assertKnownKeys(raw, ['op'], path);
    return { op: 'magnitude' };
  },
  createProcessor(operation): CompiledOperation {
    if (operation.op !== 'magnitude') {
      throw new InstrumentCompileError('Operation registry configuration mismatch.');
    }

    return operationWithProcessor('vector3', 'scalar', (value) =>
      magnitude(ensureVector(value, operation.op)),
    );
  },
};

const movingAverageOperation: OperationDefinition = {
  name: 'movingAverage',
  inputType: 'scalar',
  outputType: 'scalar',
  supportedSensors: SUPPORTED_SENSOR_TYPES,
  normalize(raw, path): MovingAverageOperation {
    assertKnownKeys(raw, ['op', 'windowSize'], path);
    return {
      op: 'movingAverage',
      windowSize: readWindowSize(own(raw, 'windowSize'), path + '.windowSize'),
    };
  },
  createProcessor(operation): CompiledOperation {
    if (operation.op !== 'movingAverage') {
      throw new InstrumentCompileError('Operation registry configuration mismatch.');
    }

    const filter = new MovingAverageFilter(operation.windowSize);
    return operationWithProcessor(
      'scalar',
      'scalar',
      (value) => filter.add(ensureScalar(value, operation.op)),
      () => filter.reset(),
    );
  },
};

const rmsOperation: OperationDefinition = {
  name: 'rms',
  inputType: 'scalar',
  outputType: 'scalar',
  supportedSensors: SUPPORTED_SENSOR_TYPES,
  normalize(raw, path): RmsOperation {
    assertKnownKeys(raw, ['op', 'windowSize'], path);
    return {
      op: 'rms',
      windowSize: readWindowSize(own(raw, 'windowSize'), path + '.windowSize'),
    };
  },
  createProcessor(operation): CompiledOperation {
    if (operation.op !== 'rms') {
      throw new InstrumentCompileError('Operation registry configuration mismatch.');
    }

    const filter = new RmsFilter(operation.windowSize);
    return operationWithProcessor(
      'scalar',
      'scalar',
      (value) => filter.add(ensureScalar(value, operation.op)),
      () => filter.reset(),
    );
  },
};

const scaleOperation: OperationDefinition = {
  name: 'scale',
  inputType: 'scalar',
  outputType: 'scalar',
  supportedSensors: SUPPORTED_SENSOR_TYPES,
  normalize(raw, path): ScaleOperation {
    assertKnownKeys(raw, ['op', 'factor'], path);
    const factor = readFiniteNumber(own(raw, 'factor'), path + '.factor');
    if (Math.abs(factor) > MAX_SCALE_FACTOR) {
      throw new InstrumentValidationError(
        path + '.factor must be between -' + MAX_SCALE_FACTOR + ' and ' + MAX_SCALE_FACTOR + '.',
      );
    }
    return {
      op: 'scale',
      factor,
    };
  },
  createProcessor(operation): CompiledOperation {
    if (operation.op !== 'scale') {
      throw new InstrumentCompileError('Operation registry configuration mismatch.');
    }

    return operationWithProcessor(
      'scalar',
      'scalar',
      (value) => ensureScalar(value, operation.op) * operation.factor,
    );
  },
};

const operationRegistry = new Map<TransformType, OperationDefinition>([
  ['gravityCompensation', gravityCompensation],
  ['magnitude', magnitudeOperation],
  ['movingAverage', movingAverageOperation],
  ['rms', rmsOperation],
  ['scale', scaleOperation],
]);

export const OPERATION_REGISTRY: ReadonlyMap<TransformType, OperationDefinition> =
  operationRegistry;

export function getOperationDefinition(name: string): OperationDefinition | undefined {
  return operationRegistry.get(name as TransformType);
}
