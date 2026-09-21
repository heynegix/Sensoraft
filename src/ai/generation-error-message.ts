import {
  GenerationConfigurationError,
  GenerationOutputError,
  GenerationRequestError,
  GenerationTimeoutError,
  GenerationUnavailableError,
  PromptValidationError,
} from './generation-errors';

export function getGenerationErrorMessage(error: unknown): string {
  if (error instanceof PromptValidationError || error instanceof GenerationConfigurationError) {
    return error.message;
  }

  if (error instanceof GenerationOutputError) {
    return 'Sensoraft could not create a safe instrument for that request. Try describing the measurement differently.';
  }

  if (error instanceof GenerationTimeoutError) {
    return 'Instrument generation took too long. Please try again.';
  }

  if (error instanceof GenerationUnavailableError) {
    return 'AI generation is temporarily unavailable. Please try again.';
  }

  if (error instanceof GenerationRequestError) {
    return 'Check your connection and try again.';
  }

  return 'Try again with a short description of what you want to measure.';
}
