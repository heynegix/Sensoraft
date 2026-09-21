import {
  DEFAULT_AI_MODEL,
  MAX_UPSTREAM_RESPONSE_BYTES,
  SYSTEM_INSTRUCTION,
  type WorkerEnv,
} from './schema';
import { readTextWithLimit } from './body';
import { buildGenerationPrompt } from './prompt';

const TOKENHARBOR_CHAT_COMPLETIONS_URL = 'https://tokenharbor.ai/v1/chat/completions';
const MAX_OUTPUT_TOKENS = 1000;
type TimingStage = 'setup' | 'fetch' | 'body' | 'provider-json' | 'content' | 'model-json';

const SAFE_TRACE_HEADERS = ['x-request-id', 'x-trace-id', 'trace-id', 'cf-ray'] as const;

function writeTimingLog(message: string): void {
  console.log('[ai-timing] ' + message);
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

export class AiProviderError extends Error {
  public constructor() {
    super('AI provider generation failed.');
    this.name = 'AiProviderError';
  }
}

export class AiProviderTimeoutError extends AiProviderError {
  public constructor() {
    super();
    this.name = 'AiProviderTimeoutError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractChatContent(payload: unknown): string | undefined {
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    return undefined;
  }

  const firstChoice = payload.choices[0];
  if (!isRecord(firstChoice) || !isRecord(firstChoice.message)) {
    return undefined;
  }

  return typeof firstChoice.message.content === 'string' ? firstChoice.message.content : undefined;
}

export async function generateWithProvider(
  env: WorkerEnv,
  prompt: string,
  repairIssues: readonly string[] | undefined,
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const startedAt = Date.now();
  let stage: TimingStage = 'setup';
  let timeoutLogged = false;
  const onAbort = () => {
    if (timeoutLogged) {
      return;
    }

    timeoutLogged = true;
    writeTimingLog('timeout after ' + (Date.now() - startedAt) + 'ms stage=' + stage);
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
      throw new AiProviderError();
    }

    const model =
      typeof env.AI_MODEL === 'string' && env.AI_MODEL.trim().length > 0
        ? env.AI_MODEL.trim()
        : DEFAULT_AI_MODEL;

    stage = 'fetch';
    writeTimingLog('fetch-start');

    let response: Response;
    let removeAbortListener: (() => void) | undefined;
    try {
      const fetchPromise = fetchImpl(TOKENHARBOR_CHAT_COMPLETIONS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + env.TOKENHARBOR_API_KEY,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: SYSTEM_INSTRUCTION },
            { role: 'user', content: buildGenerationPrompt(prompt, repairIssues) },
          ],
          thinking: { type: 'disabled' },
          stream: false,
          max_tokens: MAX_OUTPUT_TOKENS,
        }),
        signal,
      });

      const abortPromise = new Promise<never>((_, reject) => {
        const rejectOnAbort = () => reject(new AiProviderTimeoutError());
        if (signal.aborted) {
          rejectOnAbort();
          return;
        }

        signal.addEventListener('abort', rejectOnAbort, { once: true });
        removeAbortListener = () => signal.removeEventListener('abort', rejectOnAbort);
      });
      response = await Promise.race([fetchPromise, abortPromise]);
    } catch (error) {
      if (error instanceof AiProviderTimeoutError || signal.aborted) {
        throw new AiProviderTimeoutError();
      }
      throw new AiProviderError();
    } finally {
      removeAbortListener?.();
    }

    const traceHeader = getSafeTraceHeader(response.headers);
    writeTimingLog(
      'headers ' +
        (Date.now() - startedAt) +
        'ms status=' +
        response.status +
        (traceHeader === undefined ? '' : ' ' + traceHeader),
    );
    if (!response.ok) {
      throw new AiProviderError();
    }

    stage = 'body';
    let responseText: string;
    try {
      responseText = await readTextWithLimit(response, MAX_UPSTREAM_RESPONSE_BYTES);
    } catch {
      throw new AiProviderError();
    }
    const responseBytes = new TextEncoder().encode(responseText).byteLength;
    writeTimingLog('body ' + (Date.now() - startedAt) + 'ms bytes=' + responseBytes);

    stage = 'provider-json';
    let payload: unknown;
    try {
      payload = JSON.parse(responseText) as unknown;
    } catch {
      throw new AiProviderError();
    }
    writeTimingLog('provider-json ' + (Date.now() - startedAt) + 'ms');

    stage = 'content';
    const content = extractChatContent(payload);
    writeTimingLog('content ' + (Date.now() - startedAt) + 'ms');
    if (content === undefined || content.trim().length === 0) {
      throw new AiProviderError();
    }

    stage = 'model-json';
    try {
      const result = JSON.parse(content) as unknown;
      writeTimingLog('model-json ' + (Date.now() - startedAt) + 'ms');
      return result;
    } catch {
      throw new AiProviderError();
    }
  } finally {
    signal.removeEventListener('abort', onAbort);
    writeTimingLog('total ' + (Date.now() - startedAt) + 'ms');
  }
}
