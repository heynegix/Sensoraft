import { compileInstrument } from '../src/instruments/runtime/compiler';
import {
  GenerationOutputError,
  GenerationRequestError,
  GenerationTimeoutError,
  GenerationUnavailableError,
  PromptValidationError,
} from '../src/ai/generation-errors';
import { LatestRequestGate } from '../src/ai/request-gate';
import {
  DEFAULT_TIMEOUT_MS,
  parseGenerationResult,
  RemoteInstrumentGenerator,
  validateGenerationPrompt,
} from '../src/ai/remote-instrument-generator';
import { getGenerationErrorMessage } from '../src/ai/generation-error-message';

const VALID_INSTRUMENT = {
  version: 1,
  id: 'generated-vibration',
  name: 'Generated Vibration',
  description: 'Measures vibration with the accelerometer.',
  sensor: { type: 'accelerometer', sampleRateHz: 20 },
  pipeline: [
    { op: 'gravityCompensation', alpha: 0.04 },
    { op: 'magnitude' },
    { op: 'movingAverage', windowSize: 4 },
    { op: 'rms', windowSize: 12 },
    { op: 'scale', factor: 9.80665 },
  ],
  display: { type: 'line', label: 'Vibration', unit: 'm/s²', precision: 3 },
} as const;

function successResult(instrument: unknown = VALID_INSTRUMENT) {
  return { status: 'success', reason: 'This is measurable with a supported sensor.', instrument };
}

function pendingFetch(_endpoint: URL | RequestInfo, init?: RequestInit): Promise<Response> {
  return new Promise<Response>((_, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('request aborted')), {
      once: true,
    });
  });
}

describe('natural-language instrument generation', () => {
  it('keeps the app timeout longer than the Worker timeout budget', () => {
    expect(DEFAULT_TIMEOUT_MS).toBe(50_000);
  });

  it('rejects blank and oversized prompts before making a request', () => {
    expect(() => validateGenerationPrompt('   ')).toThrow(PromptValidationError);
    expect(() => validateGenerationPrompt('x'.repeat(501))).toThrow(PromptValidationError);
  });

  it('parses, validates, compiles, and returns a successful generated instrument', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      new Response(JSON.stringify(successResult()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const generator = new RemoteInstrumentGenerator({
      endpoint: 'https://example.test',
      fetchImpl,
    });

    const result = await generator.generate('How shaky is this desk?');

    expect(result.status).toBe('success');
    if (result.status === 'success') {
      expect(result.instrument.id).toBe('generated-vibration');
      expect(() => compileInstrument(result.instrument)).not.toThrow();
    }
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchImpl.mock.calls[0]?.[1]?.body as string)).toEqual({
      prompt: 'How shaky is this desk?',
    });
  });

  it('passes unsupported results through without creating a runtime', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'unsupported',
          reason: 'The current sensors cannot measure ambient temperature.',
          instrument: null,
        }),
        { status: 200 },
      ),
    );
    const generator = new RemoteInstrumentGenerator({
      endpoint: 'https://example.test',
      fetchImpl,
    });

    await expect(generator.generate('What is the room temperature?')).resolves.toEqual({
      status: 'unsupported',
      reason: 'The current sensors cannot measure ambient temperature.',
      instrument: null,
    });
  });

  it.each([
    ['invalid sensor', { ...VALID_INSTRUMENT, sensor: { type: 'barometer', sampleRateHz: 20 } }],
    ['unknown operation', { ...VALID_INSTRUMENT, pipeline: [{ op: 'fooOperation' }] }],
    [
      'incompatible operation',
      {
        ...VALID_INSTRUMENT,
        sensor: { type: 'gyroscope', sampleRateHz: 20 },
        pipeline: [{ op: 'gravityCompensation', alpha: 0.04 }, { op: 'magnitude' }],
      },
    ],
  ])('rejects %s at the app trust boundary', (_name, instrument) => {
    expect(() => parseGenerationResult(successResult(instrument))).toThrow(GenerationOutputError);
  });

  it('repairs one invalid result and then accepts the corrected result', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify(
            successResult({ ...VALID_INSTRUMENT, sensor: { type: 'barometer', sampleRateHz: 20 } }),
          ),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(successResult()), { status: 200 }));
    const generator = new RemoteInstrumentGenerator({
      endpoint: 'https://example.test',
      fetchImpl,
    });

    await expect(generator.generate('How shaky is this desk?')).resolves.toMatchObject({
      status: 'success',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchImpl.mock.calls[1]?.[1]?.body as string)).toMatchObject({
      prompt: 'How shaky is this desk?',
      repair: { issues: expect.arrayContaining([expect.stringContaining('Unsupported sensor')]) },
    });
  });

  it('stops after one failed repair and never retries forever', async () => {
    const invalid = successResult({ ...VALID_INSTRUMENT, pipeline: [{ op: 'fooOperation' }] });
    const fetchImpl = jest
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify(invalid), { status: 200 })),
      );
    const generator = new RemoteInstrumentGenerator({
      endpoint: 'https://example.test',
      fetchImpl,
    });

    await expect(generator.generate('Build a meter')).rejects.toThrow(GenerationOutputError);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('classifies a local request timeout separately from a network failure', async () => {
    const fetchImpl = jest.fn(pendingFetch);
    const generator = new RemoteInstrumentGenerator({
      endpoint: 'https://example.test',
      fetchImpl,
      timeoutMs: 5,
    });

    await expect(generator.generate('Build a meter')).rejects.toBeInstanceOf(
      GenerationTimeoutError,
    );
  });

  it('applies the timeout to the repair request while keeping repair to one retry', async () => {
    const invalid = successResult({ ...VALID_INSTRUMENT, pipeline: [{ op: 'fooOperation' }] });
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(invalid), { status: 200 }))
      .mockImplementationOnce(pendingFetch);
    const generator = new RemoteInstrumentGenerator({
      endpoint: 'https://example.test',
      fetchImpl,
      timeoutMs: 5,
    });

    await expect(generator.generate('Build a meter')).rejects.toBeInstanceOf(
      GenerationTimeoutError,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('distinguishes Worker timeout and provider unavailability from network errors', async () => {
    const timeoutResponse = new Response(
      JSON.stringify({
        error: {
          code: 'AI_TIMEOUT',
          message: 'Instrument generation took too long. Please try again.',
        },
      }),
      { status: 504 },
    );
    const unavailableResponse = new Response(
      JSON.stringify({
        error: {
          code: 'UPSTREAM_UNAVAILABLE',
          message: 'Instrument generation is temporarily unavailable.',
        },
      }),
      { status: 502 },
    );

    await expect(
      new RemoteInstrumentGenerator({
        endpoint: 'https://example.test',
        fetchImpl: jest.fn().mockResolvedValue(timeoutResponse),
      }).generate('Build a meter'),
    ).rejects.toBeInstanceOf(GenerationTimeoutError);

    await expect(
      new RemoteInstrumentGenerator({
        endpoint: 'https://example.test',
        fetchImpl: jest.fn().mockResolvedValue(unavailableResponse),
      }).generate('Build a meter'),
    ).rejects.toBeInstanceOf(GenerationUnavailableError);

    await expect(
      new RemoteInstrumentGenerator({
        endpoint: 'https://example.test',
        fetchImpl: jest.fn().mockRejectedValue(new Error('network down')),
      }).generate('Build a meter'),
    ).rejects.toBeInstanceOf(GenerationRequestError);
  });

  it('shows distinct user-facing messages for timeout, provider, and network errors', () => {
    expect(getGenerationErrorMessage(new GenerationTimeoutError())).toBe(
      'Instrument generation took too long. Please try again.',
    );
    expect(getGenerationErrorMessage(new GenerationUnavailableError())).toBe(
      'AI generation is temporarily unavailable. Please try again.',
    );
    expect(getGenerationErrorMessage(new GenerationRequestError())).toBe(
      'Check your connection and try again.',
    );
  });
});

describe('generation request freshness', () => {
  it('marks an older request stale when a newer request begins', () => {
    const gate = new LatestRequestGate();
    const first = gate.begin();
    const second = gate.begin();

    expect(gate.isCurrent(first)).toBe(false);
    expect(gate.isCurrent(second)).toBe(true);
    gate.invalidate();
    expect(gate.isCurrent(second)).toBe(false);
  });
});
