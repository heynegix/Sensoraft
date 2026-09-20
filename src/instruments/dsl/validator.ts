import { getOperationDefinition } from '../runtime/operation-registry';
import { InstrumentValidationError } from './errors';
import type {
  DisplayType,
  InstrumentDefinition,
  InstrumentDisplayDefinition,
  InstrumentSensorDefinition,
  PipelineOperation,
  PipelineValueType,
} from './types';

const MAX_PIPELINE_LENGTH = 20;

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function own(object: JsonObject, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(object, key) ? object[key] : undefined;
}

function addUnknownFieldIssues(
  object: JsonObject,
  allowedKeys: readonly string[],
  path: string,
  issues: string[],
): void {
  for (const key of Object.keys(object)) {
    if (!allowedKeys.includes(key)) {
      issues.push('Unknown field: ' + path + '.' + key);
    }
  }
}

function readNonEmptyString(
  value: unknown,
  path: string,
  issues: string[],
  required = true,
): string | undefined {
  if (value === undefined && !required) {
    return undefined;
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    issues.push(path + ' must be a non-empty string.');
    return undefined;
  }

  return value.trim();
}

function readFiniteNumber(value: unknown, path: string, issues: string[]): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    issues.push(path + ' must be a finite number.');
    return undefined;
  }

  return value;
}

function parseSensor(value: unknown, issues: string[]): InstrumentSensorDefinition | undefined {
  if (!isObject(value)) {
    issues.push('sensor must be an object.');
    return undefined;
  }

  addUnknownFieldIssues(value, ['type', 'sampleRateHz'], 'sensor', issues);
  const sensorType = own(value, 'type');
  if (sensorType !== 'accelerometer') {
    issues.push(
      typeof sensorType === 'string'
        ? 'Unsupported sensor type: ' + sensorType
        : 'sensor.type must be accelerometer.',
    );
  }

  const sampleRateHz = readFiniteNumber(own(value, 'sampleRateHz'), 'sensor.sampleRateHz', issues);
  if (
    sampleRateHz !== undefined &&
    (!Number.isInteger(sampleRateHz) || sampleRateHz < 1 || sampleRateHz > 100)
  ) {
    issues.push('sensor.sampleRateHz must be an integer between 1 and 100 Hz.');
  }

  if (sensorType !== 'accelerometer' || sampleRateHz === undefined) {
    return undefined;
  }

  return { type: 'accelerometer', sampleRateHz };
}

function parsePipeline(value: unknown, issues: string[]): PipelineOperation[] {
  if (!Array.isArray(value)) {
    issues.push('pipeline must be an array.');
    return [];
  }

  if (value.length === 0) {
    issues.push('pipeline must contain at least one operation.');
  }
  if (value.length > MAX_PIPELINE_LENGTH) {
    issues.push('pipeline must contain at most ' + MAX_PIPELINE_LENGTH + ' operations.');
  }

  const operations: PipelineOperation[] = [];
  value.slice(0, MAX_PIPELINE_LENGTH).forEach((rawOperation, index) => {
    const path = 'pipeline[' + index + ']';
    if (!isObject(rawOperation)) {
      issues.push(path + ' must be an object.');
      return;
    }

    const operationName = own(rawOperation, 'op');
    if (typeof operationName !== 'string') {
      issues.push(path + '.op must be a supported operation name.');
      return;
    }

    const definition = getOperationDefinition(operationName);
    if (definition === undefined) {
      issues.push('Unknown operation: ' + operationName);
      return;
    }

    try {
      operations.push(definition.normalize(rawOperation, path));
    } catch (error) {
      if (error instanceof InstrumentValidationError) {
        issues.push(...error.issues);
      } else {
        issues.push(path + ' is invalid.');
      }
    }
  });

  return operations;
}

function parseDisplay(value: unknown, issues: string[]): InstrumentDisplayDefinition | undefined {
  if (!isObject(value)) {
    issues.push('display must be an object.');
    return undefined;
  }

  addUnknownFieldIssues(value, ['type', 'label', 'unit', 'precision'], 'display', issues);
  const displayType = own(value, 'type');
  if (displayType !== 'line' && displayType !== 'number') {
    issues.push('display.type must be line or number.');
  }

  const label = readNonEmptyString(own(value, 'label'), 'display.label', issues);
  const unit = readNonEmptyString(own(value, 'unit'), 'display.unit', issues);
  const precision =
    own(value, 'precision') === undefined
      ? 3
      : readFiniteNumber(own(value, 'precision'), 'display.precision', issues);

  if (precision !== undefined && (!Number.isInteger(precision) || precision < 0 || precision > 9)) {
    issues.push('display.precision must be an integer between 0 and 9.');
  }

  if (
    (displayType !== 'line' && displayType !== 'number') ||
    label === undefined ||
    unit === undefined ||
    precision === undefined
  ) {
    return undefined;
  }

  return {
    type: displayType as DisplayType,
    label,
    unit,
    precision,
  };
}

function displayType(type: PipelineValueType): string {
  return type === 'vector3' ? 'Vector3' : 'Scalar';
}

function validatePipelineTypes(
  sensor: InstrumentSensorDefinition | undefined,
  pipeline: readonly PipelineOperation[],
  issues: string[],
): void {
  if (sensor === undefined || pipeline.length === 0) {
    return;
  }

  let currentType: PipelineValueType = 'vector3';
  pipeline.forEach((operation, index) => {
    const definition = getOperationDefinition(operation.op);
    if (definition === undefined) {
      return;
    }

    if (definition.inputType !== currentType) {
      issues.push(
        'Pipeline type mismatch: ' +
          operation.op +
          ' expects ' +
          displayType(definition.inputType) +
          ' but received ' +
          displayType(currentType) +
          '.',
      );
    }

    currentType = definition.outputType;

    if (index === pipeline.length - 1 && currentType !== 'scalar') {
      issues.push('Pipeline must produce Scalar for the selected display.');
    }
  });
}

export function validateInstrumentDefinition(input: unknown): InstrumentDefinition {
  const issues: string[] = [];
  if (!isObject(input)) {
    throw new InstrumentValidationError('Instrument definition must be an object.');
  }

  addUnknownFieldIssues(
    input,
    ['version', 'id', 'name', 'description', 'sensor', 'pipeline', 'display'],
    'instrument',
    issues,
  );

  if (own(input, 'version') !== 1) {
    issues.push('version must be 1.');
  }

  const id = readNonEmptyString(own(input, 'id'), 'id', issues);
  const name = readNonEmptyString(own(input, 'name'), 'name', issues);
  const description =
    own(input, 'description') === undefined
      ? ''
      : typeof own(input, 'description') === 'string'
        ? (own(input, 'description') as string).trim()
        : (issues.push('description must be a string.'), '');
  const sensor = parseSensor(own(input, 'sensor'), issues);
  const pipeline = parsePipeline(own(input, 'pipeline'), issues);
  const display = parseDisplay(own(input, 'display'), issues);
  validatePipelineTypes(sensor, pipeline, issues);

  if (
    issues.length > 0 ||
    id === undefined ||
    name === undefined ||
    sensor === undefined ||
    display === undefined
  ) {
    throw new InstrumentValidationError(issues);
  }

  return {
    version: 1,
    id,
    name,
    description,
    sensor,
    pipeline,
    display,
  };
}
