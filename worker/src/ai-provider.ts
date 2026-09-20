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

export class AiProviderError extends Error {
  public constructor() {
    super('AI provider generation failed.');
    this.name = 'AiProviderError';
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
  if (typeof env.TOKENHARBOR_API_KEY !== 'string' || env.TOKENHARBOR_API_KEY.trim().length === 0) {
    throw new AiProviderError();
  }

  const model =
    typeof env.AI_MODEL === 'string' && env.AI_MODEL.trim().length > 0
      ? env.AI_MODEL.trim()
      : DEFAULT_AI_MODEL;

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
        stream: false,
        max_tokens: MAX_OUTPUT_TOKENS,
      }),
      signal,
    });

    const abortPromise = new Promise<never>((_, reject) => {
      const rejectOnAbort = () => reject(new AiProviderError());
      if (signal.aborted) {
        rejectOnAbort();
        return;
      }

      signal.addEventListener('abort', rejectOnAbort, { once: true });
      removeAbortListener = () => signal.removeEventListener('abort', rejectOnAbort);
    });
    response = await Promise.race([fetchPromise, abortPromise]);
  } catch {
    throw new AiProviderError();
  } finally {
    removeAbortListener?.();
  }

  if (!response.ok) {
    throw new AiProviderError();
  }

  let responseText: string;
  try {
    responseText = await readTextWithLimit(response, MAX_UPSTREAM_RESPONSE_BYTES);
  } catch {
    throw new AiProviderError();
  }

  let payload: unknown;
  try {
    payload = JSON.parse(responseText) as unknown;
  } catch {
    throw new AiProviderError();
  }

  const content = extractChatContent(payload);
  if (content === undefined || content.trim().length === 0) {
    throw new AiProviderError();
  }

  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new AiProviderError();
  }
}
