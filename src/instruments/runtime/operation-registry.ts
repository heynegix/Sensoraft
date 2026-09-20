import { DEFAULT_SIGNAL_CONFIG } from '../../signal/constants';
import { VectorBaselineCompensator } from '../../signal/gravity-compensation';
import { magnitude, type Vector3 } from '../../signal/magnitude';
import { MovingAverageFilter } from '../../signal/moving-average';
import { RmsFilter } from '../../signal/rms';
import { InstrumentCompileError, InstrumentValidationError } from '../dsl/errors';
import type {
  GravityCompensationOperation,
  MagnitudeOperation,
  MovingAverageOperation,
  PipelineOperation,
  PipelineValueType,
  RmsOperation,
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
  normalize(raw: Readonly<Record<string, unknown>>, path: string): PipelineOperation;
  createProcessor(operation: PipelineOperation): CompiledOperation;
}

const MAX_WINDOW_SIZE = 500;

function assertKnownKeys(
  raw: Readonly<Record<string, unknown>>,
  allowedKeys: readonly string[],
  path: string,
): void {
  const unknownKey = Object.keys(raw).find((key) => !allowedKeys.includes(key));
  if (unknownKey !== undefined) {
    throw new InstrumentValidationError('Unknown field: ' + path + '.' + unknownKey);
  }
}

function readFiniteNumber(raw: unknown, path: string): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    throw new InstrumentValidationError(path + ' must be a finite number.');
  }

  return raw;
}

function readWindowSize(raw: unknown, path: string, fallback: number): number {
  if (raw === undefined) {
    return fallback;
  }

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
  normalize(raw, path): GravityCompensationOperation {
    assertKnownKeys(raw, ['op', 'alpha'], path);
    const alpha =
      raw.alpha === undefined
        ? DEFAULT_SIGNAL_CONFIG.gravityCompensationAlpha
        : readFiniteNumber(raw.alpha, path + '.alpha');

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
  normalize(raw, path): MovingAverageOperation {
    assertKnownKeys(raw, ['op', 'windowSize'], path);
    return {
      op: 'movingAverage',
      windowSize: readWindowSize(
        raw.windowSize,
        path + '.windowSize',
        DEFAULT_SIGNAL_CONFIG.movingAverageWindowSize,
      ),
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
  normalize(raw, path): RmsOperation {
    assertKnownKeys(raw, ['op', 'windowSize'], path);
    return {
      op: 'rms',
      windowSize: readWindowSize(
        raw.windowSize,
        path + '.windowSize',
        DEFAULT_SIGNAL_CONFIG.rmsWindowSize,
      ),
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
  normalize(raw, path): ScaleOperation {
    assertKnownKeys(raw, ['op', 'factor'], path);
    return {
      op: 'scale',
      factor: readFiniteNumber(raw.factor, path + '.factor'),
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
