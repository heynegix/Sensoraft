import { afterEach, describe, expect, it, vi } from 'vitest';

import worker, { handleGenerate } from '../src/index';

const env = {
  GEMINI_API_KEY: 'test-key',
  GEMINI_MODEL: 'gemini-3.5-flash-lite',
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

function geminiFetch(output: unknown) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ output_text: JSON.stringify(output) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
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
  it('rejects invalid method and path without calling Gemini', async () => {
    const fetchImpl = geminiFetch({});

    await expect(worker.fetch(request('', 'GET'), env)).resolves.toMatchObject({ status: 405 });
    await expect(worker.fetch(request('', 'POST', '/other'), env)).resolves.toMatchObject({
      status: 404,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects invalid JSON, blank prompts, oversized prompts, and unknown fields', async () => {
    const fetchImpl = geminiFetch({});
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

    expect(invalidJson.status).toBe(400);
    expect(blank.status).toBe(400);
    expect(oversized.status).toBe(400);
    expect(unknown.status).toBe(400);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns a validated success result and sends the configured model and secret header upstream', async () => {
    const fetchImpl = geminiFetch({
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
      instrument: validInstrument,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toContain('/v1beta/interactions');
    expect((init as RequestInit).headers).toMatchObject({ 'x-goog-api-key': 'test-key' });
    const geminiBody = JSON.parse((init as RequestInit).body as string) as Record<string, unknown>;
    expect(geminiBody.model).toBe('gemini-3.5-flash-lite');
    expect(geminiBody.system_instruction).toContain('untrusted data');
    expect(geminiBody.store).toBe(false);
  });

  it('returns unsupported without creating an instrument', async () => {
    const fetchImpl = geminiFetch({
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

  it.each([
    ['unknown sensor', { ...validInstrument, sensor: { type: 'barometer', sampleRateHz: 20 } }],
    ['unknown operation', { ...validInstrument, pipeline: [{ op: 'fooOperation' }] }],
    [
      'incompatible operation',
      {
        ...validInstrument,
        sensor: { type: 'magnetometer', sampleRateHz: 20 },
        pipeline: [{ op: 'gravityCompensation', alpha: 0.04 }, { op: 'magnitude' }],
      },
    ],
  ])('rejects model output with %s', async (_name, instrument) => {
    const fetchImpl = geminiFetch({
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

  it('maps Gemini failures and timeouts to generic errors', async () => {
    const upstreamFailure = vi.fn().mockResolvedValue(new Response('nope', { status: 500 }));
    const failed = await handleGenerate(
      request(JSON.stringify({ prompt: 'measure motion' })),
      env,
      { fetchImpl: upstreamFailure },
    );

    const slow = vi.fn(() => new Promise<Response>(() => undefined));
    const timedOut = await handleGenerate(
      request(JSON.stringify({ prompt: 'measure motion' })),
      env,
      { fetchImpl: slow, timeoutMs: 5 },
    );

    expect(failed.status).toBe(502);
    expect(timedOut.status).toBe(502);
    expect(await readJson(failed)).toEqual({
      error: {
        code: 'UPSTREAM_UNAVAILABLE',
        message: 'Instrument generation is temporarily unavailable.',
      },
    });
  });
});
