import { readTextWithLimit } from './body';
import { DEFAULT_AI_MODEL, MAX_UPSTREAM_RESPONSE_BYTES, type WorkerEnv } from './schema';

const TOKENHARBOR_CHAT_COMPLETIONS_URL = 'https://tokenharbor.ai/v1/chat/completions';
const TOKENHARBOR_MODELS_URL = 'https://tokenharbor.ai/v1/models';
const MINIMAL_PROMPT = 'Return exactly: {"status":"ok"}';
const SAFE_TRACE_HEADERS = ['x-request-id', 'x-trace-id', 'trace-id', 'cf-ray'] as const;

export type DebugProviderTarget = 'minimal' | 'models';

export interface DebugProviderResult {
  readonly ok: boolean;
  readonly providerStatus: number;
  readonly bodyBytes: number;
}

export class DebugProviderTimeoutError extends Error {
  public constructor() {
    super('Provider debug request timed out.');
    this.name = 'DebugProviderTimeoutError';
  }
}

export class DebugProviderError extends Error {
  public constructor() {
    super('Provider debug request failed.');
    this.name = 'DebugProviderError';
  }
}

function writeTimingLog(target: DebugProviderTarget, message: string): void {
  const label = target === 'minimal' ? 'debug-minimal' : 'debug-models';
  console.log('[ai-timing] ' + label + ' ' + message);
}

function getSafeTraceHeader(headers: Headers): string | undefined {
  for (const name of SAFE_TRACE_HEADERS) {
    const value = headers.get(name)?.trim();
    if (value !== undefined && /^[-A-Za-z0-9._:]{1,128}$/.test(value)) {
      return name + '=' + value;
    }
  }

  return undefined;
}

async function raceWithAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  let removeAbortListener: (() => void) | undefined;
  const abortPromise = new Promise<never>((_, reject) => {
    const rejectOnAbort = () => reject(new DebugProviderTimeoutError());
    if (signal.aborted) {
      rejectOnAbort();
      return;
    }

    signal.addEventListener('abort', rejectOnAbort, { once: true });
    removeAbortListener = () => signal.removeEventListener('abort', rejectOnAbort);
  });

  try {
    return await Promise.race([operation, abortPromise]);
  } finally {
    removeAbortListener?.();
  }
}

function getConfiguredModel(env: WorkerEnv): string {
  return typeof env.AI_MODEL === 'string' && env.AI_MODEL.trim().length > 0
    ? env.AI_MODEL.trim()
    : DEFAULT_AI_MODEL;
}

function createRequest(
  target: DebugProviderTarget,
  env: WorkerEnv,
  signal: AbortSignal,
): { url: string; init: RequestInit } {
  const headers: Record<string, string> = {
    Authorization: 'Bearer ' + env.TOKENHARBOR_API_KEY,
  };
  if (target === 'minimal') {
    return {
      url: TOKENHARBOR_CHAT_COMPLETIONS_URL,
      init: {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: getConfiguredModel(env),
          messages: [{ role: 'user', content: MINIMAL_PROMPT }],
          stream: false,
          max_tokens: 100,
        }),
        signal,
      },
    };
  }

  return {
    url: TOKENHARBOR_MODELS_URL,
    init: { method: 'GET', headers, signal },
  };
}

export async function runDebugProvider(
  env: WorkerEnv,
  target: DebugProviderTarget,
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<DebugProviderResult> {
  const startedAt = Date.now();
  let stage: 'fetch' | 'body' = 'fetch';
  let timeoutLogged = false;
  const onAbort = () => {
    if (timeoutLogged) {
      return;
    }

    timeoutLogged = true;
    writeTimingLog(target, 'timeout after ' + (Date.now() - startedAt) + 'ms stage=' + stage);
  };
  signal.addEventListener('abort', onAbort, { once: true });
  if (signal.aborted) {
    onAbort();
  }

  try {
    if (
      typeof env.TOKENHARBOR_API_KEY !== 'string' ||
      env.TOKENHARBOR_API_KEY.trim().length === 0
    ) {
      throw new DebugProviderError();
    }

    const request = createRequest(target, env, signal);
    writeTimingLog(target, 'fetch-start');

    let response: Response;
    try {
      response = await raceWithAbort(fetchImpl(request.url, request.init), signal);
    } catch (error) {
      if (error instanceof DebugProviderTimeoutError || signal.aborted) {
        throw new DebugProviderTimeoutError();
      }
      throw new DebugProviderError();
    }

    const traceHeader = getSafeTraceHeader(response.headers);
    writeTimingLog(
      target,
      'headers ' +
        (Date.now() - startedAt) +
        'ms status=' +
        response.status +
        (traceHeader === undefined ? '' : ' ' + traceHeader),
    );

    stage = 'body';
    let responseText: string;
    try {
      responseText = await raceWithAbort(
        readTextWithLimit(response, MAX_UPSTREAM_RESPONSE_BYTES),
        signal,
      );
    } catch (error) {
      if (error instanceof DebugProviderTimeoutError || signal.aborted) {
        throw new DebugProviderTimeoutError();
      }
      throw new DebugProviderError();
    }

    const bodyBytes = new TextEncoder().encode(responseText).byteLength;
    writeTimingLog(target, 'body ' + (Date.now() - startedAt) + 'ms bytes=' + bodyBytes);
    return { ok: response.ok, providerStatus: response.status, bodyBytes };
  } finally {
    signal.removeEventListener('abort', onAbort);
    writeTimingLog(target, 'total ' + (Date.now() - startedAt) + 'ms');
  }
}
