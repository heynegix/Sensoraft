export class BodyTooLargeError extends Error {
  public constructor() {
    super('Body is too large.');
    this.name = 'BodyTooLargeError';
  }
}

interface TextBodySource {
  readonly body: ReadableStream<Uint8Array> | null;
  text(): Promise<string>;
}

export async function readTextWithLimit(source: TextBodySource, maxBytes: number): Promise<string> {
  if (source.body === null) {
    const text = await source.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      throw new BodyTooLargeError();
    }
    return text;
  }

  const reader = source.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = '';

  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }

      totalBytes += chunk.value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new BodyTooLargeError();
      }

      text += decoder.decode(chunk.value, { stream: true });
    }

    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}
