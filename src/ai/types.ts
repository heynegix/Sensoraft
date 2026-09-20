import type { InstrumentDefinition } from '../instruments/dsl/types';

export const MAX_PROMPT_LENGTH = 500;

export type GenerationResult =
  | {
      readonly status: 'success';
      readonly reason: string;
      readonly instrument: InstrumentDefinition;
    }
  | {
      readonly status: 'unsupported';
      readonly reason: string;
      readonly instrument: null;
    };

export interface InstrumentGenerator {
  generate(prompt: string): Promise<GenerationResult>;
}
