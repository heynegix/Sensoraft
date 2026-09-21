export class LatestRequestGate {
  private currentRequestId = 0;

  public begin(): number {
    this.currentRequestId += 1;
    return this.currentRequestId;
  }

  public invalidate(): void {
    this.currentRequestId += 1;
  }

  public isCurrent(requestId: number): boolean {
    return requestId === this.currentRequestId;
  }
}
