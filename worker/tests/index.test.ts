import { afterEach, describe, expect, it, vi } from 'vitest';

import worker, {
  handleDebugProviderFullSystemMinimal,
  handleDebugProviderMinimal,
  handleDebugProviderModels,
  handleDebugProviderShortSystemReal,
  handleGenerate,
} from '../src/index';
import { AI_TIMEOUT_MS, SYSTEM_INSTRUCTION } from '../src/schema';

const env = {
  TOKENHARBOR_API_KEY: 'test-key',
  AI_MODEL: 'deepseek-v4.1-flash:free',
  AI_CLIENT_RATE_LIMITER: {
    limit: vi.fn().mockResolvedValue({ success: true }),
  },
  AI_GLOBAL_RATE_LIMITER: {
    limit: vi.fn().mockResolvedValue({ success: true }),
  },
};

const validInstrument = {
  version: 1,
  id: 'desk-vibration',
  name: 'Desk Vibration',
  description: 'Measures desk vibration.',
  sensor: { type: 'accelerometer', sampleRateHz: 20 },
  pipeline: [
    { op: 'gravityCompensation', alpha: 0.04 },
    { op: 'magnitude' },
    { op: 'movingAverage', windowSize: 4 },
    { op: 'rms', windowSize: 12 },
    { op: 'scale', factor: 9.80665 },
  ],
  display: { type: 'line', label: 'Vibration', unit: 'm/s²', precision: 3 },
};

const GENERATED_ID_PATTERN = /^generated-[a-z0-9]+(?:-[a-z0-9]+)*$/;

function tokenHarborFetch(output: unknown, responseHeaders: HeadersInit = {}) {
  return vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        choices: [{ message: { role: 'assistant', content: JSON.stringify(output) } }],
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...responseHeaders },
      },
    ),
  );
}

function request(body: string, method = 'POST', path = '/generate'): Request {
  return new Request('https://worker.test' + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'GET' ? undefined : body,
  });
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Worker /generate boundary', () => {
  it('uses a 45-second provider timeout budget', () => {
    expect(AI_TIMEOUT_MS).toBe(45_000);
  });

  it('rejects invalid method and path without calling the provider', async () => {
    const fetchImpl = tokenHarborFetch({});

    await expect(worker.fetch(request('', 'GET'), env)).resolves.toMatchObject({ status: 405 });
    await expect(worker.fetch(request('', 'POST', '/other'), env)).resolves.toMatchObject({
      status: 404,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects unsupported methods for temporary provider debug endpoints', async () => {
    const fetchImpl = tokenHarborFetch({});

    await expect(
      worker.fetch(request('', 'GET', '/debug/provider-minimal'), env),
    ).resolves.toMatchObject({ status: 405 });
    await expect(
      worker.fetch(request('', 'POST', '/debug/provider-models'), env),
    ).resolves.toMatchObject({ status: 405 });
    await expect(
      worker.fetch(request('', 'GET', '/debug/provider-full-system-minimal'), env),
    ).resolves.toMatchObject({ status: 405 });
    await expect(
      worker.fetch(request('', 'GET', '/debug/provider-short-system-real'), env),
    ).resolves.toMatchObject({ status: 405 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('sends only the fixed minimal chat request to the provider', async () => {
    const timingLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('not-an-instrument', {
        status: 200,
        headers: { 'Content-Type': 'text/plain', 'X-Request-Id': 'debug-trace-1' },
      }),
    );
    const response = await handleDebugProviderMinimal(
      request(JSON.stringify({ prompt: 'do not forward this prompt' })),
      env,
      { fetchImpl },
    );

    expect(response.status).toBe(200);
    expect(await readJson(response)).toMatchObject({
      ok: true,
      providerStatus: 200,
      bodyBytes: expect.any(Number),
    });
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe('https://tokenharbor.ai/v1/chat/completions');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer test-key',
    });
    const providerBody = JSON.parse((init as RequestInit).body as string) as Record<
      string,
      unknown
    >;
    expect(providerBody).toEqual({
      model: 'deepseek-v4.1-flash:free',
      messages: [{ role: 'user', content: 'Return exactly: {"status":"ok"}' }],
      stream: false,
      max_tokens: 100,
    });
    const lines = timingLog.mock.calls.map(([message]) => String(message));
    expect(lines).toEqual(
      expect.arrayContaining([
        '[ai-timing] debug-minimal fetch-start',
        expect.stringMatching(
          /^\[ai-timing\] debug-minimal headers \d+ms status=200 x-request-id=debug-trace-1$/,
        ),
        expect.stringMatching(/^\[ai-timing\] debug-minimal body \d+ms bytes=\d+$/),
        expect.stringMatching(/^\[ai-timing\] debug-minimal total \d+ms$/),
      ]),
    );
    const joinedLogs = lines.join('\n');
    expect(joinedLogs).not.toContain('do not forward this prompt');
    expect(joinedLogs).not.toContain('not-an-instrument');
    expect(joinedLogs).not.toContain('test-key');
  });

  it('probes provider models without sending a chat body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('{"data":[]}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const response = await handleDebugProviderModels(
      request('', 'GET', '/debug/provider-models'),
      env,
      { fetchImpl },
    );

    expect(response.status).toBe(200);
    expect(await readJson(response)).toMatchObject({
      ok: true,
      providerStatus: 200,
      bodyBytes: expect.any(Number),
    });
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe('https://tokenharbor.ai/v1/models');
    expect((init as RequestInit).method).toBe('GET');
    expect((init as RequestInit).body).toBeUndefined();
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer test-key',
    });
  });

  it('sends the full system instruction with the minimal user message', async () => {
    const timingLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('not-an-instrument', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      }),
    );
    const response = await handleDebugProviderFullSystemMinimal(
      request(JSON.stringify({ prompt: 'ignored diagnostic input' })),
      env,
      { fetchImpl },
    );

    expect(response.status).toBe(200);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe('https://tokenharbor.ai/v1/chat/completions');
    const providerBody = JSON.parse((init as RequestInit).body as string) as Record<
      string,
      unknown
    >;
    expect(providerBody).toEqual({
      model: 'deepseek-v4.1-flash:free',
      messages: [
        { role: 'system', content: SYSTEM_INSTRUCTION },
        { role: 'user', content: 'Return exactly: {"status":"ok"}' },
      ],
      thinking: { type: 'disabled' },
      stream: false,
      max_tokens: 100,
    });
    const lines = timingLog.mock.calls.map(([message]) => String(message));
    expect(lines).toEqual(
      expect.arrayContaining([
        '[ai-timing] debug-full-system-minimal fetch-start',
        expect.stringMatching(/^\[ai-timing\] debug-full-system-minimal headers \d+ms status=200$/),
        expect.stringMatching(/^\[ai-timing\] debug-full-system-minimal body \d+ms bytes=\d+$/),
        expect.stringMatching(/^\[ai-timing\] debug-full-system-minimal total \d+ms$/),
      ]),
    );
    const joinedLogs = lines.join('\n');
    expect(joinedLogs).not.toContain('ignored diagnostic input');
    expect(joinedLogs).not.toContain('not-an-instrument');
    expect(joinedLogs).not.toContain('test-key');
  });

  it('sends the short system instruction with the real measurement prompt', async () => {
    const timingLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response('not-an-instrument', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      }),
    );
    const response = await handleDebugProviderShortSystemReal(
      request('', 'POST', '/debug/provider-short-system-real'),
      env,
      { fetchImpl },
    );

    expect(response.status).toBe(200);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe('https://tokenharbor.ai/v1/chat/completions');
    const providerBody = JSON.parse((init as RequestInit).body as string) as Record<
      string,
      unknown
    >;
    expect(providerBody).toEqual({
      model: 'deepseek-v4.1-flash:free',
      messages: [
        { role: 'system', content: 'You generate valid Sensoraft Instrument JSON only.' },
        { role: 'user', content: 'How shaky is this desk?' },
      ],
      thinking: { type: 'disabled' },
      stream: false,
      max_tokens: 100,
    });
    const lines = timingLog.mock.calls.map(([message]) => String(message));
    expect(lines).toEqual(
      expect.arrayContaining([
        '[ai-timing] debug-short-system-real fetch-start',
        expect.stringMatching(/^\[ai-timing\] debug-short-system-real headers \d+ms status=200$/),
        expect.stringMatching(/^\[ai-timing\] debug-short-system-real body \d+ms bytes=\d+$/),
        expect.stringMatching(/^\[ai-timing\] debug-short-system-real total \d+ms$/),
      ]),
    );
    const joinedLogs = lines.join('\n');
    expect(joinedLogs).not.toContain('How shaky is this desk?');
    expect(joinedLogs).not.toContain('not-an-instrument');
    expect(joinedLogs).not.toContain('test-key');
  });

  it('rejects invalid JSON, blank prompts, oversized prompts, and unknown fields', async () => {
    const fetchImpl = tokenHarborFetch({});
    const invalidJson = await handleGenerate(request('{'), env, { fetchImpl });
    const blank = await handleGenerate(request(JSON.stringify({ prompt: '  ' })), env, {
      fetchImpl,
    });
    const oversized = await handleGenerate(
      request(JSON.stringify({ prompt: 'x'.repeat(501) })),
      env,
      { fetchImpl },
    );
    const unknown = await handleGenerate(
      request(JSON.stringify({ prompt: 'measure', extra: true })),
      env,
      { fetchImpl },
    );
    const oversizedBody = await handleGenerate(request('x'.repeat(20_000)), env, { fetchImpl });

    expect(invalidJson.status).toBe(400);
    expect(blank.status).toBe(400);
    expect(oversized.status).toBe(400);
    expect(unknown.status).toBe(400);
    expect(oversizedBody.status).toBe(413);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns a validated success result and sends the configured model and secret header upstream', async () => {
    const fetchImpl = tokenHarborFetch({
      status: 'success',
      reason: 'The accelerometer can measure desk vibration.',
      instrument: validInstrument,
    });
    const response = await handleGenerate(
      request(JSON.stringify({ prompt: 'How shaky is this desk?' })),
      env,
      { fetchImpl },
    );

    expect(response.status).toBe(200);
    expect(await readJson(response)).toMatchObject({
      status: 'success',
      instrument: {
        ...validInstrument,
        id: expect.stringMatching(GENERATED_ID_PATTERN),
      },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe('https://tokenharbor.ai/v1/chat/completions');
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer test-key',
    });
    const providerBody = JSON.parse((init as RequestInit).body as string) as Record<
      string,
      unknown
    >;
    expect(providerBody.model).toBe('deepseek-v4.1-flash:free');
    expect(providerBody.stream).toBe(false);
    expect(providerBody.thinking).toEqual({ type: 'disabled' });
    expect(providerBody.response_format).toBeUndefined();
    expect(providerBody.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'system',
          content: expect.stringContaining('untrusted data'),
        }),
      ]),
    );
  });

  it('logs provider timing stages without logging request or response content', async () => {
    const timingLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const privatePrompt = 'private prompt must stay out of logs';
    const privateReason = 'private model response must stay out of logs';
    const fetchImpl = tokenHarborFetch(
      {
        status: 'success',
        reason: privateReason,
        instrument: validInstrument,
      },
      { 'X-Request-Id': 'trace-abc-123' },
    );

    const response = await handleGenerate(request(JSON.stringify({ prompt: privatePrompt })), env, {
      fetchImpl,
    });

    expect(response.status).toBe(200);
    const lines = timingLog.mock.calls.map(([message]) => String(message));
    expect(lines).toEqual(
      expect.arrayContaining([
        '[ai-timing] fetch-start',
        expect.stringMatching(
          /^\[ai-timing\] headers \d+ms status=200 x-request-id=trace-abc-123$/,
        ),
        expect.stringMatching(/^\[ai-timing\] body \d+ms bytes=\d+$/),
        expect.stringMatching(/^\[ai-timing\] provider-json \d+ms$/),
        expect.stringMatching(/^\[ai-timing\] content \d+ms$/),
        expect.stringMatching(/^\[ai-timing\] model-json \d+ms$/),
        expect.stringMatching(/^\[ai-timing\] total \d+ms$/),
      ]),
    );
    const joinedLogs = lines.join('\n');
    expect(joinedLogs).not.toContain(privatePrompt);
    expect(joinedLogs).not.toContain(privateReason);
    expect(joinedLogs).not.toContain(env.TOKENHARBOR_API_KEY);
  });

  it.each(['Desk Vibration', 'DESK_VIBRATION', 'desk--vibration'])(
    'replaces unsafe generated id %s without a repair request',
    async (id) => {
      const fetchImpl = tokenHarborFetch({
        status: 'success',
        reason: 'Candidate.',
        instrument: { ...validInstrument, id },
      });
      const response = await handleGenerate(
        request(JSON.stringify({ prompt: 'Make an instrument.' })),
        env,
        { fetchImpl },
      );

      expect(response.status).toBe(200);
      expect(await readJson(response)).toMatchObject({
        status: 'success',
        instrument: { id: expect.stringMatching(GENERATED_ID_PATTERN) },
      });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    },
  );

  it('does not auto-correct an invalid pipeline while replacing the id', async () => {
    const fetchImpl = tokenHarborFetch({
      status: 'success',
      reason: 'Candidate.',
      instrument: {
        ...validInstrument,
        id: 'Desk Vibration',
        pipeline: [{ op: 'fooOperation' }],
      },
    });
    const response = await handleGenerate(
      request(JSON.stringify({ prompt: 'Make an instrument.' })),
      env,
      { fetchImpl },
    );

    expect(response.status).toBe(422);
    expect(await readJson(response)).toMatchObject({
      error: {
        code: 'MODEL_OUTPUT_INVALID',
        issues: expect.arrayContaining(['Unknown operation: fooOperation']),
      },
    });
  });

  it('returns unsupported without creating an instrument', async () => {
    const fetchImpl = tokenHarborFetch({
      status: 'unsupported',
      reason: 'Ambient temperature is not available.',
      instrument: null,
    });
    const response = await handleGenerate(
      request(JSON.stringify({ prompt: 'What is the room temperature?' })),
      env,
      { fetchImpl },
    );

    expect(response.status).toBe(200);
    expect(await readJson(response)).toMatchObject({ status: 'unsupported', instrument: null });
  });

  it('rejects a request when either rate limit is exceeded before the provider is called', async () => {
    const fetchImpl = tokenHarborFetch({});
    const limitedEnv = {
      ...env,
      AI_CLIENT_RATE_LIMITER: {
        limit: vi.fn().mockResolvedValue({ success: false }),
      },
    };
    const response = await handleGenerate(
      request(JSON.stringify({ prompt: 'measure motion' })),
      limitedEnv,
      { fetchImpl },
    );

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails closed when rate limiting bindings are not configured', async () => {
    const fetchImpl = tokenHarborFetch({});
    const response = await handleGenerate(
      request(JSON.stringify({ prompt: 'measure motion' })),
      { TOKENHARBOR_API_KEY: 'test-key' },
      { fetchImpl },
    );

    expect(response.status).toBe(503);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ['unknown sensor', { ...validInstrument, sensor: { type: 'barometer', sampleRateHz: 20 } }],
    ['unknown operation', { ...validInstrument, pipeline: [{ op: 'fooOperation' }] }],
    [
      'zero alpha',
      {
        ...validInstrument,
        pipeline: [{ op: 'gravityCompensation', alpha: 0 }, { op: 'magnitude' }],
      },
    ],
    [
      'large scale factor',
      {
        ...validInstrument,
        pipeline: [{ op: 'magnitude' }, { op: 'scale', factor: 1000.001 }],
      },
    ],
    [
      'incompatible operation',
      {
        ...validInstrument,
        sensor: { type: 'magnetometer', sampleRateHz: 20 },
        pipeline: [{ op: 'gravityCompensation', alpha: 0.04 }, { op: 'magnitude' }],
      },
    ],
  ])('rejects model output with %s', async (_name, instrument) => {
    const fetchImpl = tokenHarborFetch({
      status: 'success',
      reason: 'Candidate.',
      instrument,
    });
    const response = await handleGenerate(
      request(JSON.stringify({ prompt: 'Make an instrument.' })),
      env,
      { fetchImpl },
    );

    expect(response.status).toBe(422);
    expect(await readJson(response)).toMatchObject({
      error: { code: 'MODEL_OUTPUT_INVALID' },
    });
  });

  it('explicitly restricts display types in the planner instruction', () => {
    expect(SYSTEM_INSTRUCTION).toContain('display.type must be exactly "line" or "number".');
    expect(SYSTEM_INSTRUCTION).toContain(
      'Never use "gauge", "chart", "meter", "graph", or any other display type.',
    );
    expect(SYSTEM_INSTRUCTION).toContain(
      'Prefer "line" for continuously changing sensor measurements.',
    );
    expect(SYSTEM_INSTRUCTION).toContain(
      'Use "number" only when a single current value is appropriate.',
    );
  });

  it('rejects a gauge display type from model output', async () => {
    const fetchImpl = tokenHarborFetch({
      status: 'success',
      reason: 'Candidate.',
      instrument: { ...validInstrument, display: { ...validInstrument.display, type: 'gauge' } },
    });
    const response = await handleGenerate(
      request(JSON.stringify({ prompt: 'Make an instrument.' })),
      env,
      { fetchImpl },
    );

    expect(response.status).toBe(422);
    expect(await readJson(response)).toMatchObject({
      error: { code: 'MODEL_OUTPUT_INVALID' },
    });
  });

  it('accepts a line display type from model output', async () => {
    const fetchImpl = tokenHarborFetch({
      status: 'success',
      reason: 'Candidate.',
      instrument: validInstrument,
    });
    const response = await handleGenerate(
      request(JSON.stringify({ prompt: 'Make an instrument.' })),
      env,
      { fetchImpl },
    );

    expect(response.status).toBe(200);
    expect(await readJson(response)).toMatchObject({
      status: 'success',
      instrument: { display: { type: 'line' } },
    });
  });

  it.each([401, 429, 500])('maps provider HTTP %s to a generic error', async (status) => {
    const upstreamFailure = vi.fn().mockResolvedValue(new Response('nope', { status }));
    const failed = await handleGenerate(
      request(JSON.stringify({ prompt: 'measure motion' })),
      env,
      { fetchImpl: upstreamFailure },
    );

    expect(failed.status).toBe(502);
    expect(await readJson(failed)).toEqual({
      error: {
        code: 'UPSTREAM_UNAVAILABLE',
        message: 'Instrument generation is temporarily unavailable.',
      },
    });
  });

  it.each([
    ['malformed JSON', new Response('not-json', { status: 200 })],
    [
      'missing choices',
      new Response(JSON.stringify({ choices: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ],
    [
      'empty content',
      new Response(
        JSON.stringify({ choices: [{ message: { role: 'assistant', content: '  ' } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    ],
    [
      'oversized response',
      new Response(
        JSON.stringify({
          choices: [{ message: { role: 'assistant', content: 'x'.repeat(128_001) } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    ],
  ])('rejects %s provider responses', async (_name, providerResponse) => {
    const failed = await handleGenerate(
      request(JSON.stringify({ prompt: 'measure motion' })),
      env,
      { fetchImpl: vi.fn().mockResolvedValue(providerResponse) },
    );

    expect(failed.status).toBe(502);
    expect(await readJson(failed)).toEqual({
      error: {
        code: 'UPSTREAM_UNAVAILABLE',
        message: 'Instrument generation is temporarily unavailable.',
      },
    });
  });

  it('maps provider timeouts to a distinct timeout error', async () => {
    const timingLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const slow = vi.fn(() => new Promise<Response>(() => undefined));
    const timedOut = await handleGenerate(
      request(JSON.stringify({ prompt: 'measure motion' })),
      env,
      { fetchImpl: slow, timeoutMs: 5 },
    );

    expect(timedOut.status).toBe(504);
    expect(await readJson(timedOut)).toEqual({
      error: {
        code: 'AI_TIMEOUT',
        message: 'Instrument generation took too long. Please try again.',
      },
    });
    const lines = timingLog.mock.calls.map(([message]) => String(message));
    expect(lines).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^\[ai-timing\] timeout after \d+ms stage=fetch$/),
        expect.stringMatching(/^\[ai-timing\] total \d+ms$/),
      ]),
    );
  });

  it('maps provider debug timeouts and logs the fetch stage', async () => {
    const timingLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const slow = vi.fn(() => new Promise<Response>(() => undefined));
    const timedOut = await handleDebugProviderMinimal(
      request('', 'POST', '/debug/provider-minimal'),
      env,
      { fetchImpl: slow, timeoutMs: 5 },
    );

    expect(timedOut.status).toBe(504);
    expect(await readJson(timedOut)).toEqual({
      error: {
        code: 'DEBUG_PROVIDER_TIMEOUT',
        message: 'Provider debug request took too long.',
      },
    });
    const lines = timingLog.mock.calls.map(([message]) => String(message));
    expect(lines).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^\[ai-timing\] debug-minimal timeout after \d+ms stage=fetch$/),
        expect.stringMatching(/^\[ai-timing\] debug-minimal total \d+ms$/),
      ]),
    );
  });
});
