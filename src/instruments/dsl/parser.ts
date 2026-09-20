import { InstrumentValidationError } from './errors';
import { validateInstrumentDefinition, type ValidatedInstrumentDefinition } from './validator';

export function parseInstrumentDefinition(json: string): ValidatedInstrumentDefinition {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown JSON parse error';
    throw new InstrumentValidationError('Invalid instrument JSON: ' + reason);
  }

  return validateInstrumentDefinition(parsed);
}
