import { AiProviderTimeoutError, generateWithProvider } from './ai-provider';
import { BodyTooLargeError, readTextWithLimit } from './body';
import {
  DebugProviderTimeoutError,
  runDebugProvider,
  type DebugProviderTarget,
} from './debug-provider';
import {
  AI_TIMEOUT_MS,
  MAX_PROMPT_LENGTH,
  MAX_REASON_LENGTH,
  MAX_REPAIR_ISSUES,
  MAX_REQUEST_BODY_BYTES,
  type RateLimitBinding,
  type WorkerEnv,
} from './schema';

type JsonObject = Record<string, unknown>;
type PipelineType = 'vector3' | 'scalar';

interface WorkerDependencies {
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}

class ModelOutputInvalidError extends Error {
  public readonly issues: readonly string[];

  public constructor(issues: readonly string[]) {
    super('The model output did not pass the Worker allowlist.');
    this.name = 'ModelOutputInvalidError';
    this.issues = issues;
  }
}

function isPlainObject(value: unknown): value is JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function own(object: JsonObject, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(object, key) ? object[key] : undefined;
}

function addUnknownKeys(
  object: JsonObject,
  allowed: readonly string[],
  path: string,
  issues: string[],
) {
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) {
      issues.push('Unknown field: ' + path + '.' + key);
    }
  }
}

function readString(
  value: unknown,
  path: string,
  issues: string[],
  maxLength: number,
  required = true,
): string | undefined {
  if (value === undefined && !required) {
    return undefined;
  }

  if (typeof value !== 'string' || (required && value.trim().length === 0)) {
    issues.push(path + ' must be a non-empty string.');
    return undefined;
  }

  const normalized = value.trim();
  if (normalized.length > maxLength) {
    issues.push(path + ' is too long.');
    return undefined;
  }

  return normalized;
}

function readFiniteNumber(value: unknown, path: string, issues: string[]): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    issues.push(path + ' must be a finite number.');
    return undefined;
  }

  return value;
}

function readWindowSize(value: unknown, path: string, issues: string[]): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 500) {
    issues.push(path + ' must be an integer between 1 and 500.');
    return undefined;
  }

  return value;
}

function validateOperation(
  value: unknown,
  index: number,
  sensorType: string,
  currentType: PipelineType,
  issues: string[],
): PipelineType {
  const path = 'pipeline[' + index + ']';
  if (!isPlainObject(value)) {
    issues.push(path + ' must be an object.');
    return currentType;
  }

  const operation = own(value, 'op');
  if (typeof operation !== 'string') {
    issues.push(path + '.op must be a supported operation name.');
    return currentType;
  }

  const inputType: PipelineType =
    operation === 'gravityCompensation' || operation === 'magnitude' ? 'vector3' : 'scalar';
  const outputType: PipelineType = operation === 'gravityCompensation' ? 'vector3' : 'scalar';
  if (!['gravityCompensation', 'magnitude', 'movingAverage', 'rms', 'scale'].includes(operation)) {
    issues.push('Unknown operation: ' + operation);
    return currentType;
  }

  if (operation === 'gravityCompensation') {
    addUnknownKeys(value, ['op', 'alpha'], path, issues);
    if (sensorType !== 'accelerometer') {
      issues.push(
        'Operation gravityCompensation is not supported for sensor type ' + sensorType + '.',
      );
    }
    const alpha = readFiniteNumber(own(value, 'alpha'), path + '.alpha', issues);
    if (alpha !== undefined && (alpha <= 0 || alpha > 1)) {
      issues.push(path + '.alpha must be greater than 0 and at most 1.');
    }
  } else if (operation === 'magnitude') {
    addUnknownKeys(value, ['op'], path, issues);
  } else if (operation === 'movingAverage' || operation === 'rms') {
    addUnknownKeys(value, ['op', 'windowSize'], path, issues);
    readWindowSize(own(value, 'windowSize'), path + '.windowSize', issues);
  } else {
    addUnknownKeys(value, ['op', 'factor'], path, issues);
    const factor = readFiniteNumber(own(value, 'factor'), path + '.factor', issues);
    if (factor !== undefined && Math.abs(factor) > 1000) {
      issues.push(path + '.factor must be between -1000 and 1000.');
    }
  }

  if (inputType !== currentType) {
    issues.push(
      'Pipeline type mismatch: ' +
        operation +
        ' expects ' +
        inputType +
        ' but received ' +
        currentType +
        '.',
    );
  }

  return outputType;
}

function validateInstrument(value: unknown): string[] {
  const issues: string[] = [];
  if (!isPlainObject(value)) {
    return ['instrument must be an object.'];
  }

  addUnknownKeys(
    value,
    ['version', 'id', 'name', 'description', 'sensor', 'pipeline', 'display'],
    'instrument',
    issues,
  );
  if (own(value, 'version') !== 1) {
    issues.push('version must be 1.');
  }

  const id = readString(own(value, 'id'), 'id', issues, 64);
  if (id !== undefined && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    issues.push('id must contain only lowercase letters, numbers, and single hyphens.');
  }
  readString(own(value, 'name'), 'name', issues, 80);
  if (!Object.prototype.hasOwnProperty.call(value, 'description')) {
    issues.push('description must be a string.');
  } else {
    readString(own(value, 'description'), 'description', issues, 240, false);
  }

  const sensorValue = own(value, 'sensor');
  let sensorType: string | undefined;
  if (!isPlainObject(sensorValue)) {
    issues.push('sensor must be an object.');
  } else {
    addUnknownKeys(sensorValue, ['type', 'sampleRateHz'], 'sensor', issues);
    const type = own(sensorValue, 'type');
    if (type !== 'accelerometer' && type !== 'gyroscope' && type !== 'magnetometer') {
      issues.push('Unsupported sensor type: ' + String(type));
    } else {
      sensorType = type;
    }
    const sampleRateHz = readFiniteNumber(
      own(sensorValue, 'sampleRateHz'),
      'sensor.sampleRateHz',
      issues,
    );
    if (
      sampleRateHz !== undefined &&
      (!Number.isInteger(sampleRateHz) || sampleRateHz < 1 || sampleRateHz > 100)
    ) {
      issues.push('sensor.sampleRateHz must be an integer between 1 and 100 Hz.');
    }
  }

  const pipeline = own(value, 'pipeline');
  let lastType: PipelineType = 'vector3';
  if (!Array.isArray(pipeline)) {
    issues.push('pipeline must be an array.');
  } else {
    if (pipeline.length === 0) {
      issues.push('pipeline must contain at least one operation.');
    }
    if (pipeline.length > 20) {
      issues.push('pipeline must contain at most 20 operations.');
    }
    if (sensorType !== undefined) {
      for (const [index, operation] of pipeline.slice(0, 20).entries()) {
        lastType = validateOperation(operation, index, sensorType, lastType, issues);
      }
      if (lastType !== 'scalar') {
        issues.push('Pipeline must produce Scalar for the selected display.');
      }
    }
  }

  const display = own(value, 'display');
  if (!isPlainObject(display)) {
    issues.push('display must be an object.');
  } else {
    addUnknownKeys(display, ['type', 'label', 'unit', 'precision'], 'display', issues);
    if (own(display, 'type') !== 'line' && own(display, 'type') !== 'number') {
      issues.push('display.type must be line or number.');
    }
    readString(own(display, 'label'), 'display.label', issues, 80);
    readString(own(display, 'unit'), 'display.unit', issues, 24);
    const precision = readFiniteNumber(own(display, 'precision'), 'display.precision', issues);
    if (
      precision !== undefined &&
      (!Number.isInteger(precision) || precision < 0 || precision > 9)
    ) {
      issues.push('display.precision must be an integer between 0 and 9.');
    }
  }

  return issues;
}

function replaceGeneratedInstrumentId(value: JsonObject): JsonObject {
  if (own(value, 'status') !== 'success') {
    return value;
  }

  const instrument = own(value, 'instrument');
  if (!isPlainObject(instrument)) {
    return value;
  }

  return {
    ...value,
    instrument: {
      ...instrument,
      id: 'generated-' + crypto.randomUUID().toLowerCase(),
    },
  };
}

function validateGenerationResult(value: unknown): JsonObject {
  const issues: string[] = [];
  if (!isPlainObject(value)) {
    throw new ModelOutputInvalidError(['Generation result must be an object.']);
  }

  addUnknownKeys(value, ['status', 'reason', 'instrument'], 'result', issues);
  const status = own(value, 'status');
  if (status !== 'success' && status !== 'unsupported') {
    issues.push('status must be success or unsupported.');
  }
  readString(own(value, 'reason'), 'reason', issues, MAX_REASON_LENGTH);

  const normalizedValue = replaceGeneratedInstrumentId(value);
  if (status === 'unsupported') {
    if (own(value, 'instrument') !== null) {
      issues.push('Unsupported results must set instrument to null.');
    }
  } else if (status === 'success') {
    issues.push(...validateInstrument(own(normalizedValue, 'instrument')));
  }

  if (issues.length > 0) {
    throw new ModelOutputInvalidError(issues);
  }

  return normalizedValue;
}

function jsonResponse(
  body: JsonObject,
  status: number,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}

function errorResponse(
  code: string,
  message: string,
  status: number,
  issues?: readonly string[],
  extraHeaders: Record<string, string> = {},
) {
  const error: JsonObject = { code, message };
  if (issues !== undefined) {
    error.issues = issues;
  }
  return jsonResponse({ error }, status, extraHeaders);
}

async function enforceRateLimits(request: Request, env: WorkerEnv): Promise<Response | null> {
  const clientLimiter: RateLimitBinding | undefined = env.AI_CLIENT_RATE_LIMITER;
  const globalLimiter: RateLimitBinding | undefined = env.AI_GLOBAL_RATE_LIMITER;
  if (clientLimiter === undefined || globalLimiter === undefined) {
    return errorResponse('RATE_LIMIT_UNAVAILABLE', 'Instrument generation is not configured.', 503);
  }

  const clientKey = request.headers.get('cf-connecting-ip')?.trim() || 'anonymous';
  try {
    const [clientResult, globalResult] = await Promise.all([
      clientLimiter.limit({ key: clientKey }),
      globalLimiter.limit({ key: 'all-generations' }),
    ]);
    if (!clientResult.success || !globalResult.success) {
      return errorResponse(
        'RATE_LIMITED',
        'Too many instrument generation requests. Try again later.',
        429,
        undefined,
        { 'Retry-After': '60' },
      );
    }
  } catch {
    return errorResponse(
      'RATE_LIMIT_UNAVAILABLE',
      'Instrument generation is temporarily unavailable.',
      503,
    );
  }

  return null;
}

async function handleDebugProvider(
  request: Request,
  env: WorkerEnv,
  target: DebugProviderTarget,
  dependencies: WorkerDependencies = {},
): Promise<Response> {
  const rateLimitResponse = await enforceRateLimits(request, env);
  if (rateLimitResponse !== null) {
    return rateLimitResponse;
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(
    () => controller.abort(),
    dependencies.timeoutMs ?? AI_TIMEOUT_MS,
  );
  try {
    const result = await runDebugProvider(env, target, controller.signal, dependencies.fetchImpl);
    return jsonResponse(
      {
        ok: result.ok,
        providerStatus: result.providerStatus,
        bodyBytes: result.bodyBytes,
      },
      result.ok ? 200 : 502,
    );
  } catch (error) {
    if (error instanceof DebugProviderTimeoutError) {
      return errorResponse('DEBUG_PROVIDER_TIMEOUT', 'Provider debug request took too long.', 504);
    }

    return errorResponse(
      'DEBUG_PROVIDER_UNAVAILABLE',
      'Provider debug request is unavailable.',
      502,
    );
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function handleDebugProviderMinimal(
  request: Request,
  env: WorkerEnv,
  dependencies: WorkerDependencies = {},
): Promise<Response> {
  return handleDebugProvider(request, env, 'minimal', dependencies);
}

async function handleDebugProviderModels(
  request: Request,
  env: WorkerEnv,
  dependencies: WorkerDependencies = {},
): Promise<Response> {
  return handleDebugProvider(request, env, 'models', dependencies);
}

function parseRequestBody(value: unknown): { prompt: string; repairIssues?: string[] } {
  if (!isPlainObject(value)) {
    throw new Error('invalid_body');
  }

  addUnknownKeys(value, ['prompt', 'repair'], 'request', []);
  const keys = Object.keys(value);
  if (keys.some((key) => key !== 'prompt' && key !== 'repair')) {
    throw new Error('invalid_body');
  }

  const promptValue = own(value, 'prompt');
  if (typeof promptValue !== 'string') {
    throw new Error('invalid_prompt');
  }
  const prompt = promptValue.trim();
  if (prompt.length === 0 || prompt.length > MAX_PROMPT_LENGTH) {
    throw new Error('invalid_prompt');
  }

  const repair = own(value, 'repair');
  if (repair === undefined) {
    return { prompt };
  }
  if (!isPlainObject(repair) || Object.keys(repair).some((key) => key !== 'issues')) {
    throw new Error('invalid_repair');
  }

  const issues = own(repair, 'issues');
  if (
    !Array.isArray(issues) ||
    issues.length === 0 ||
    issues.length > MAX_REPAIR_ISSUES ||
    issues.some(
      (issue) => typeof issue !== 'string' || issue.trim().length === 0 || issue.length > 240,
    )
  ) {
    throw new Error('invalid_repair');
  }

  return { prompt, repairIssues: issues.map((issue) => issue.trim()) };
}

async function handleGenerate(
  request: Request,
  env: WorkerEnv,
  dependencies: WorkerDependencies = {},
): Promise<Response> {
  const declaredLength = request.headers.get('content-length');
  if (declaredLength !== null && Number(declaredLength) > MAX_REQUEST_BODY_BYTES) {
    return errorResponse('REQUEST_TOO_LARGE', 'Request is too large.', 413);
  }

  let bodyText: string;
  try {
    bodyText = await readTextWithLimit(request, MAX_REQUEST_BODY_BYTES);
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return errorResponse('REQUEST_TOO_LARGE', 'Request is too large.', 413);
    }
    return errorResponse('INVALID_JSON', 'Request must contain valid JSON.', 400);
  }
  if (bodyText.length > MAX_REQUEST_BODY_BYTES) {
    return errorResponse('REQUEST_TOO_LARGE', 'Request is too large.', 413);
  }
  if (bodyText.length === 0) {
    return errorResponse('INVALID_JSON', 'Request must contain valid JSON.', 400);
  }

  let body: unknown;
  try {
    body = JSON.parse(bodyText) as unknown;
  } catch {
    return errorResponse('INVALID_JSON', 'Request must contain valid JSON.', 400);
  }

  let parsedRequest: { prompt: string; repairIssues?: string[] };
  try {
    parsedRequest = parseRequestBody(body);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'invalid_body';
    if (code === 'invalid_prompt') {
      return errorResponse('INVALID_PROMPT', 'Prompt must contain 1 to 500 characters.', 400);
    }
    if (code === 'invalid_repair') {
      return errorResponse('INVALID_REPAIR', 'Repair issues are invalid.', 400);
    }
    return errorResponse('INVALID_BODY', 'Request body is invalid.', 400);
  }

  const rateLimitResponse = await enforceRateLimits(request, env);
  if (rateLimitResponse !== null) {
    return rateLimitResponse;
  }

  const controller = new AbortController();
  const timeoutHandle = setTimeout(
    () => controller.abort(),
    dependencies.timeoutMs ?? AI_TIMEOUT_MS,
  );
  try {
    const generated = await generateWithProvider(
      env,
      parsedRequest.prompt,
      parsedRequest.repairIssues,
      controller.signal,
      dependencies.fetchImpl,
    );
    const safeResult = validateGenerationResult(generated);
    return jsonResponse(safeResult, 200);
  } catch (error) {
    if (error instanceof AiProviderTimeoutError) {
      return errorResponse(
        'AI_TIMEOUT',
        'Instrument generation took too long. Please try again.',
        504,
      );
    }

    if (error instanceof ModelOutputInvalidError) {
      return errorResponse(
        'MODEL_OUTPUT_INVALID',
        'The generated instrument did not pass validation.',
        422,
        error.issues,
      );
    }

    return errorResponse(
      'UPSTREAM_UNAVAILABLE',
      'Instrument generation is temporarily unavailable.',
      502,
    );
  } finally {
    clearTimeout(timeoutHandle);
  }
}

const worker = {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/debug/provider-minimal') {
      if (request.method !== 'POST') {
        return errorResponse('METHOD_NOT_ALLOWED', 'Use POST /debug/provider-minimal.', 405);
      }

      return handleDebugProviderMinimal(request, env);
    }
    if (url.pathname === '/debug/provider-models') {
      if (request.method !== 'GET') {
        return errorResponse('METHOD_NOT_ALLOWED', 'Use GET /debug/provider-models.', 405);
      }

      return handleDebugProviderModels(request, env);
    }
    if (url.pathname !== '/generate') {
      return errorResponse('NOT_FOUND', 'Not found.', 404);
    }
    if (request.method !== 'POST') {
      return errorResponse('METHOD_NOT_ALLOWED', 'Use POST /generate.', 405);
    }

    return handleGenerate(request, env);
  },
};

export {
  handleDebugProviderMinimal,
  handleDebugProviderModels,
  handleGenerate,
  validateGenerationResult,
};
export default worker;
