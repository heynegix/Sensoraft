export class InstrumentValidationError extends Error {
  public readonly issues: readonly string[];

  public constructor(issues: readonly string[] | string) {
    const normalizedIssues = typeof issues === 'string' ? [issues] : [...issues];
    super(
      'Instrument validation failed:\n' + normalizedIssues.map((issue) => '- ' + issue).join('\n'),
    );
    this.name = 'InstrumentValidationError';
    this.issues = normalizedIssues;
  }
}

export class InstrumentCompileError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'InstrumentCompileError';
  }
}

export class InstrumentRuntimeError extends Error {
  public constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'InstrumentRuntimeError';
  }
}
