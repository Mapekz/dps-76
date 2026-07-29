/** A single (x, y) point on a curve. */
export interface CurvePoint {
  x: number;
  y: number;
}

/** A curve table file containing an array of points. Matches the on-disk shape. */
export interface CurveFile {
  curve: CurvePoint[];
}
