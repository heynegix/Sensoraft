import type { AccelerometerSample } from '../../sensors/types';
import { InstrumentCompileError, InstrumentRuntimeError } from '../dsl/errors';
import { validateInstrumentDefinition } from '../dsl/validator';
import type { InstrumentDefinition, PipelineValueType } from '../dsl/types';
import {
  getOperationDefinition,
  type CompiledOperation,
  type PipelineValue,
} from './operation-registry';

export interface InstrumentMeasurement {
  readonly timestamp: number;
  readonly value: number;
  readonly raw: AccelerometerSample;
}

export class CompiledInstrument {
  public constructor(
    public readonly definition: InstrumentDefinition,
    private readonly operations: readonly CompiledOperation[],
  ) {}

  public process(sample: AccelerometerSample): InstrumentMeasurement {
    if (
      !Number.isFinite(sample.x) ||
      !Number.isFinite(sample.y) ||
      !Number.isFinite(sample.z) ||
      !Number.isFinite(sample.timestamp)
    ) {
      throw new InstrumentRuntimeError('Accelerometer sample contains a non-finite value.');
    }

    let value: PipelineValue = { x: sample.x, y: sample.y, z: sample.z };
    for (const operation of this.operations) {
      value = operation.process(value);
    }

    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new InstrumentRuntimeError('Instrument pipeline produced a non-finite scalar.');
    }

    return {
      timestamp: sample.timestamp,
      value,
      raw: sample,
    };
  }

  public reset(): void {
    for (const operation of this.operations) {
      operation.reset();
    }
  }
}

function compileValidatedInstrument(definition: InstrumentDefinition): CompiledInstrument {
  let currentType: PipelineValueType = 'vector3';
  const operations: CompiledOperation[] = [];

  for (const [index, operation] of definition.pipeline.entries()) {
    const operationDefinition = getOperationDefinition(operation.op);
    if (operationDefinition === undefined) {
      throw new InstrumentCompileError('Unknown operation: ' + operation.op);
    }

    if (operationDefinition.inputType !== currentType) {
      throw new InstrumentCompileError(
        'Pipeline type mismatch at operation ' +
          index +
          ': ' +
          operation.op +
          ' expects ' +
          operationDefinition.inputType +
          ' but received ' +
          currentType +
          '.',
      );
    }

    operations.push(operationDefinition.createProcessor(operation));
    currentType = operationDefinition.outputType;
  }

  if (currentType !== 'scalar') {
    throw new InstrumentCompileError('Pipeline must produce a scalar measurement.');
  }

  return new CompiledInstrument(definition, operations);
}

export function compileInstrument(input: unknown): CompiledInstrument {
  return compileValidatedInstrument(validateInstrumentDefinition(input));
}
