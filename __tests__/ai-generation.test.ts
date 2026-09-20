import { compileInstrument } from '../src/instruments/runtime/compiler';
import { GenerationOutputError, PromptValidationError } from '../src/ai/generation-errors';
import { LatestRequestGate } from '../src/ai/request-gate';
import {
  parseGenerationResult,
  RemoteInstrumentGenerator,
  validateGenerationPrompt,
} from '../src/ai/remote-instrument-generator';

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

describe('natural-language instrument generation', () => {
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
