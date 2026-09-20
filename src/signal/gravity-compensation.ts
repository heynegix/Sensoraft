import type { Vector3 } from './magnitude';

/**
 * Tracks gravity and other slow-changing acceleration independently on each
 * axis. Removing the vector baseline before magnitude preserves transverse
 * motion instead of hiding it inside the 1 g gravity magnitude.
 */
export class VectorBaselineCompensator {
  private baseline: Vector3 | undefined;

  public constructor(private readonly alpha: number) {
    if (alpha <= 0 || alpha > 1) {
      throw new Error('Baseline compensation alpha must be greater than 0 and at most 1.');
    }
  }

  public process(value: Vector3): Vector3 {
    if (this.baseline === undefined) {
      this.baseline = value;
      return { x: 0, y: 0, z: 0 };
    }

    const residual = {
      x: value.x - this.baseline.x,
      y: value.y - this.baseline.y,
      z: value.z - this.baseline.z,
    };
    this.baseline = {
      x: this.baseline.x + this.alpha * residual.x,
      y: this.baseline.y + this.alpha * residual.y,
      z: this.baseline.z + this.alpha * residual.z,
    };

    return residual;
  }

  public reset(): void {
    this.baseline = undefined;
  }
}
