import {
  DEFAULT_GEMINI_MODEL,
  GEMINI_RESPONSE_FORMAT,
  MAX_UPSTREAM_RESPONSE_BYTES,
  SYSTEM_INSTRUCTION,
  type WorkerEnv,
} from './schema';
import { buildGeminiInput } from './prompt';

const GEMINI_INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';

export class GeminiUpstreamError extends Error {
  public constructor() {
    super('Gemini generation failed.');
    this.name = 'GeminiUpstreamError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readTextStep(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  if (typeof value.text === 'string') {
    return value.text;
  }

  if (Array.isArray(value.content)) {
    const text = value.content
      .map((part) => readTextStep(part))
      .find((part): part is string => part !== undefined);
    if (text !== undefined) {
      return text;
    }
  }

  return undefined;
}

function extractOutputText(payload: unknown): string | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  for (const key of ['output_text', 'text']) {
    if (typeof payload[key] === 'string') {
      return payload[key] as string;
    }
  }

  for (const key of ['steps', 'outputs', 'output']) {
    const collection = payload[key];
    if (Array.isArray(collection)) {
      const text = collection
        .map((item) => readTextStep(item))
        .find((item): item is string => item !== undefined);
      if (text !== undefined) {
        return text;
      }
    } else {
      const text = readTextStep(collection);
      if (text !== undefined) {
        return text;
      }
    }
  }

  return undefined;
}

export async function generateWithGemini(
  env: WorkerEnv,
  prompt: string,
  repairIssues: readonly string[] | undefined,
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  if (typeof env.GEMINI_API_KEY !== 'string' || env.GEMINI_API_KEY.trim().length === 0) {
    throw new GeminiUpstreamError();
  }

  const model =
    typeof env.GEMINI_MODEL === 'string' && env.GEMINI_MODEL.trim().length > 0
      ? env.GEMINI_MODEL.trim()
      : DEFAULT_GEMINI_MODEL;

  let response: Response;
  let removeAbortListener: (() => void) | undefined;
  try {
    const fetchPromise = fetchImpl(GEMINI_INTERACTIONS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        model,
        input: buildGeminiInput(prompt, repairIssues),
        system_instruction: SYSTEM_INSTRUCTION,
        response_format: GEMINI_RESPONSE_FORMAT,
        generation_config: { max_output_tokens: 1000 },
        store: false,
      }),
      signal,
    });

    const abortPromise = new Promise<never>((_, reject) => {
      const rejectOnAbort = () => reject(new GeminiUpstreamError());
      if (signal.aborted) {
        rejectOnAbort();
        return;
      }

      signal.addEventListener('abort', rejectOnAbort, { once: true });
      removeAbortListener = () => signal.removeEventListener('abort', rejectOnAbort);
    });
    response = await Promise.race([fetchPromise, abortPromise]);
  } catch {
    throw new GeminiUpstreamError();
  } finally {
    removeAbortListener?.();
  }

  if (!response.ok) {
    throw new GeminiUpstreamError();
  }

  let responseText: string;
  try {
    responseText = await response.text();
  } catch {
    throw new GeminiUpstreamError();
  }

  if (responseText.length > MAX_UPSTREAM_RESPONSE_BYTES) {
    throw new GeminiUpstreamError();
  }

  let payload: unknown;
  try {
    payload = JSON.parse(responseText) as unknown;
  } catch {
    throw new GeminiUpstreamError();
  }

  const outputText = extractOutputText(payload);
  if (outputText === undefined || outputText.length > MAX_UPSTREAM_RESPONSE_BYTES) {
    throw new GeminiUpstreamError();
  }

  try {
    return JSON.parse(outputText) as unknown;
  } catch {
    throw new GeminiUpstreamError();
  }
}
