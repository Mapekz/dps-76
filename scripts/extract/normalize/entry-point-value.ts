import type { CurveInput, ModOp, ModifierValue, ValueCurve } from '../../../src/types/modifiers';
import type { EsmSource } from '../esm-client';

/** The value-bearing fields of one perk entry point, already parsed by the caller. */
export interface EntryPointValueInput {
  functionName: string;
  /** The flat `Float`; 0 when absent. */
  float: number;
  /** EP-level Curve Table points, or null when none is attached. */
  curvePoints: Array<{ x: number; y: number }> | null;
  /** `Function Parameter 4 (Actor Value)`: the curve's input axis. */
  curveInputAv: string | null;
}

export interface EntryPointValueDeps {
  client: Pick<EsmSource, 'resolveEdid'>;
  /** Shared formid → editor-id cache; successful lookups are written back. */
  edidByFormId: Map<string, string>;
  /** Curve-input registry (normalize/mgef.ts's CURVE_INPUT_AVS), passed in to avoid an import cycle. */
  curveInputAvs: Readonly<Record<string, CurveInput>>;
}

export type EntryPointValue =
  /** Add/Set/Multiply Value, converted to its Modifier IR op and payload. */
  | { kind: 'modifier'; op: ModOp; payload: ModifierValue }
  /** A multi-point curve whose input AV maps to no CurveInput; `inputLabel` names it for the note. */
  | { kind: 'unmappedCurveInput'; inputLabel: string }
  /** A function shape this helper does not convert; the caller decides what else to try. */
  | { kind: 'unsupportedFunction' };

/**
 * Generic value normalization shared by direct perk entry points
 * (extract-perks.ts) and granted perks (translateGrantedPerk in mgef.ts).
 *
 * An attached Curve Table always beats the flat Float (docs/assumptions.md
 * "Curve tables override flat values"; Lone Wanderer's Mod Incoming Weapon
 * Damage carries Float null with its real ×0.99→×0.8 values in a curve). A
 * single-point curve is an authored constant and collapses into the float. A
 * multi-point curve reads its x from the EP's own Function Parameter 4 AV
 * (Lone Wanderer: Charisma, USER-CORRECTED 2026-08-20), resolved through the
 * curve-input registry. Failing that, an `LGND_*` piece counter with a domain
 * of at most 5 is an armor legendary's authored stacking table: x = worn
 * pieces, y = the total effect at that count (Hunter's 1−0.85ⁿ,
 * USER-CONFIRMED 2026-08-20), resolved at armor assembly
 * (armor-roster.ts's scaleModifier). Any other axis is unmapped: a missing
 * modifier is honest, a mislabeled axis is not.
 *
 * The curve is resolved before the function shape is checked, so an unmapped
 * axis wins over an unsupported function. Each Y runs through the function's
 * own transform: Multiply Value folds as MUL_ADD of y−1.
 */
export async function normalizeEntryPointValue(
  input: EntryPointValueInput,
  deps: EntryPointValueDeps,
): Promise<EntryPointValue> {
  const { functionName, curvePoints, curveInputAv } = input;
  let float = input.float;
  let curve: ValueCurve | undefined;
  if (curvePoints && curvePoints.length === 1) {
    float = curvePoints[0].y;
  } else if (curvePoints) {
    const axis = await resolveCurveAxis(curveInputAv, curvePoints, deps);
    if (!axis) {
      const { edidByFormId } = deps;
      return {
        kind: 'unmappedCurveInput',
        inputLabel: curveInputAv ? (edidByFormId.get(curveInputAv) ?? curveInputAv) : 'none',
      };
    }
    curve = { input: axis, points: curvePoints };
  }

  switch (functionName) {
    case 'Add Value':
      return { kind: 'modifier', op: 'ADD', payload: curvePayload(curve) ?? { value: float } };
    case 'Set Value':
      return { kind: 'modifier', op: 'SET', payload: curvePayload(curve) ?? { value: float } };
    case 'Multiply Value':
      return {
        kind: 'modifier',
        op: 'MUL_ADD',
        payload: curve
          ? {
              curve: { ...curve, points: curve.points.map((p) => ({ x: p.x, y: p.y - 1 })) },
              curveScale: 1,
            }
          : { value: float - 1 },
      };
    default:
      return { kind: 'unsupportedFunction' };
  }
}

function curvePayload(curve: ValueCurve | undefined): ModifierValue | undefined {
  return curve ? { curve, curveScale: 1 } : undefined;
}

async function resolveCurveAxis(
  curveInputAv: string | null,
  points: ReadonlyArray<{ x: number; y: number }>,
  { client, edidByFormId, curveInputAvs }: EntryPointValueDeps,
): Promise<CurveInput | undefined> {
  if (!curveInputAv) return undefined;
  const mapped = curveInputAvs[curveInputAv];
  if (mapped) return mapped;
  let avEdid = edidByFormId.get(curveInputAv);
  if (avEdid === undefined) {
    try {
      avEdid = await client.resolveEdid(curveInputAv);
      edidByFormId.set(curveInputAv, avEdid);
    } catch {
      avEdid = curveInputAv;
    }
  }
  const maxX = Math.max(...points.map((p) => p.x));
  return avEdid.startsWith('LGND_') && maxX <= 5 ? 'wornPieces' : undefined;
}
