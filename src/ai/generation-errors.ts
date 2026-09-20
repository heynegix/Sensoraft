export class PromptValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'PromptValidationError';
  }
}

export class GenerationConfigurationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'GenerationConfigurationError';
  }
}

export class GenerationOutputError extends Error {
  public readonly issues: readonly string[];

  public constructor(issues: readonly string[] | string) {
    const normalizedIssues = typeof issues === 'string' ? [issues] : [...issues];
    super('The generated instrument was not safe to run.');
    this.name = 'GenerationOutputError';
    this.issues = normalizedIssues;
  }
}

export class GenerationRequestError extends Error {
  public constructor(message = 'The instrument generation request failed.') {
    super(message);
    this.name = 'GenerationRequestError';
  }
}
