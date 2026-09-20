import { compileInstrument } from '../instruments/runtime/compiler';
import { InstrumentCompileError, InstrumentValidationError } from '../instruments/dsl/errors';
import { validateInstrumentDefinition } from '../instruments/dsl/validator';
import { getConfiguredAiEndpoint } from './config';
import {
  GenerationConfigurationError,
  GenerationOutputError,
  GenerationRequestError,
  PromptValidationError,
} from './generation-errors';
import { MAX_PROMPT_LENGTH, type GenerationResult, type InstrumentGenerator } from './types';

const MAX_REASON_LENGTH = 240;
const MAX_RESPONSE_LENGTH = 64_000;
const MAX_REPAIR_ISSUES = 10;
const DEFAULT_TIMEOUT_MS = 18_000;

interface RemoteInstrumentGeneratorOptions {
  readonly endpoint?: string;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}

interface WorkerErrorPayload {
  readonly error?: {
    readonly code?: unknown;
    readonly issues?: unknown;
  };
}

interface JsonObject {
  readonly [key: string]: unknown;
}

function isPlainObject(value: unknown): value is JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOnlyKeys(object: JsonObject, keys: readonly string[]): boolean {
  return Object.keys(object).every((key) => keys.includes(key));
}

function readReason(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const reason = value.trim();
  return reason.length > 0 && reason.length <= MAX_REASON_LENGTH ? reason : undefined;
}

export function validateGenerationPrompt(prompt: string): string {
  if (typeof prompt !== 'string') {
    throw new PromptValidationError('Describe what you want to measure.');
  }

  const normalizedPrompt = prompt.trim();
  if (normalizedPrompt.length === 0) {
    throw new PromptValidationError('Describe what you want to measure.');
  }

  if (normalizedPrompt.length > MAX_PROMPT_LENGTH) {
    throw new PromptValidationError(
      'Keep the measurement request to ' + MAX_PROMPT_LENGTH + ' characters or fewer.',
    );
  }

  return normalizedPrompt;
}

export function parseGenerationResult(input: unknown): GenerationResult {
  if (!isPlainObject(input) || !hasOnlyKeys(input, ['status', 'reason', 'instrument'])) {
    throw new GenerationOutputError('The generation response has an invalid shape.');
  }

  const reason = readReason(input.reason);
  if (reason === undefined) {
    throw new GenerationOutputError('The generation response needs a short reason.');
  }

  if (input.status === 'unsupported') {
    if (input.instrument !== null) {
      throw new GenerationOutputError('Unsupported results must not contain an instrument.');
    }

    return { status: 'unsupported', reason, instrument: null };
  }

  if (input.status !== 'success' || !isPlainObject(input.instrument)) {
    throw new GenerationOutputError(
      'The generation response does not contain a supported instrument.',
    );
  }

  try {
    const validatedDefinition = validateInstrumentDefinition(input.instrument);
    compileInstrument(validatedDefinition);
    return { status: 'success', reason, instrument: validatedDefinition };
  } catch (error) {
    if (error instanceof InstrumentValidationError) {
      throw new GenerationOutputError(error.issues);
    }

    if (error instanceof InstrumentCompileError) {
      throw new GenerationOutputError(error.message);
    }

    throw new GenerationOutputError('The generated instrument could not be verified.');
  }
}

function resolveEndpoint(endpoint: string | undefined): string {
  const rawEndpoint = endpoint ?? getConfiguredAiEndpoint();
  if (rawEndpoint === undefined || rawEndpoint.trim().length === 0) {
    throw new GenerationConfigurationError('AI generation is not configured.');
  }

  let parsed: URL;
  try {
    parsed = new URL(rawEndpoint.trim());
  } catch {
    throw new GenerationConfigurationError('AI generation is not configured.');
  }

  const isLocalHttp =
    parsed.protocol === 'http:' &&
    (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
  if (parsed.protocol !== 'https:' && !isLocalHttp) {
    throw new GenerationConfigurationError('AI generation is not configured.');
  }

  const normalized = rawEndpoint.trim().replace(/\/+$/, '');
  return normalized.endsWith('/generate') ? normalized : normalized + '/generate';
}

function safeRepairIssues(issues: readonly string[]): string[] {
  return issues
    .filter((issue): issue is string => typeof issue === 'string' && issue.trim().length > 0)
    .map((issue) => issue.trim().slice(0, 240))
    .slice(0, MAX_REPAIR_ISSUES);
}

function parseJsonText(text: string): unknown {
  if (text.length > MAX_RESPONSE_LENGTH) {
    throw new GenerationRequestError('The generation response was too large.');
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new GenerationRequestError('The generation service returned an invalid response.');
  }
}

function getWorkerError(payload: unknown): WorkerErrorPayload['error'] | undefined {
  if (!isPlainObject(payload) || !isPlainObject(payload.error)) {
    return undefined;
  }

  return payload.error;
}

export class RemoteInstrumentGenerator implements InstrumentGenerator {
  private readonly endpoint: string | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  public constructor(options: RemoteInstrumentGeneratorOptions = {}) {
    this.endpoint = options.endpoint;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  public async generate(prompt: string): Promise<GenerationResult> {
    const normalizedPrompt = validateGenerationPrompt(prompt);
    let repairIssues: string[] | undefined;

    for (let attempt = 0; attempt <= 1; attempt += 1) {
      try {
        return await this.request(normalizedPrompt, repairIssues);
      } catch (error) {
        if (!(error instanceof GenerationOutputError) || attempt === 1) {
          throw error;
        }

        repairIssues = safeRepairIssues(error.issues);
        if (repairIssues.length === 0) {
          repairIssues = ['Return only a valid instrument definition for the supported schema.'];
        }
      }
    }

    throw new GenerationOutputError('The generated instrument could not be verified.');
  }

  private async request(
    prompt: string,
    repairIssues?: readonly string[],
  ): Promise<GenerationResult> {
    const endpoint = resolveEndpoint(this.endpoint);
    const controller = new AbortController();
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    const body: Record<string, unknown> = { prompt };
    if (repairIssues !== undefined) {
      body.repair = { issues: safeRepairIssues(repairIssues) };
    }

    const requestPromise = this.fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        controller.abort();
        reject(new GenerationRequestError('The generation request timed out.'));
      }, this.timeoutMs);
    });

    let response: Response;
    try {
      response = await Promise.race([requestPromise, timeoutPromise]);
    } catch (error) {
      if (error instanceof GenerationRequestError) {
        throw error;
      }

      throw new GenerationRequestError();
    } finally {
      if (timeoutHandle !== undefined) {
        clearTimeout(timeoutHandle);
      }
      controller.abort();
    }

    const responseText = await response.text();
    const payload = parseJsonText(responseText);
    if (!response.ok) {
      const workerError = getWorkerError(payload);
      if (response.status === 422 && workerError?.code === 'MODEL_OUTPUT_INVALID') {
        const issues = Array.isArray(workerError.issues)
          ? workerError.issues.filter((issue): issue is string => typeof issue === 'string')
          : [];
        throw new GenerationOutputError(
          issues.length > 0 ? issues : 'The generated instrument is invalid.',
        );
      }

      throw new GenerationRequestError();
    }

    return parseGenerationResult(payload);
  }
}
