export interface Vector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export function magnitude(vector: Vector3): number {
  return Math.sqrt(vector.x ** 2 + vector.y ** 2 + vector.z ** 2);
}
