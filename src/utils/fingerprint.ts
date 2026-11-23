import { FP_COLS, FP_LENGTH, FP_ROWS, type FingerprintPattern } from '../types.ts';

export function createEmptyMatrix(): number[] {
  return new Array<number>(FP_LENGTH).fill(0);
}

export function cloneMatrix(matrix: number[]): number[] {
  const result = createEmptyMatrix();
  for (let i = 0; i < FP_LENGTH; i++) {
    result[i] = matrix[i] ?? 0;
  }
  return result;
}

/**
 * Generates realistic, visually distinct 16x20 pixel biometric ridge patterns
 * using deterministic math + optional seed variation so each suspect has a unique print.
 */
export function generateFingerprintPreset(
  pattern: FingerprintPattern,
  seed = 1
): number[] {
  const m = createEmptyMatrix();
  const cx = (FP_COLS - 1) / 2 + ((seed % 3) - 1) * 0.6;
  const cy = (FP_ROWS - 1) / 2 + (((seed >> 1) % 3) - 1) * 0.8;

  for (let y = 0; y < FP_ROWS; y++) {
    for (let x = 0; x < FP_COLS; x++) {
      const dx = x - cx;
      const dy = (y - cy) * 0.78;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Oval outer fingertip mask
      const normX = dx / (FP_COLS * 0.48);
      const normY = (y - cy) / (FP_ROWS * 0.48);
      if (normX * normX + normY * normY > 1.04) {
        continue;
      }

      let ridge = false;

      if (pattern === 'Kring') {
        const angle = Math.atan2(dy, dx);
        const wobble = Math.sin(angle * 2 + seed) * 0.45;
        const ring = (dist + wobble) % 2.55;
        ridge = ring < 1.18;
      } else if (pattern === 'Lus') {
        const tilt = (seed % 2 === 0 ? 1 : -1) * 0.45;
        const shiftedX = dx + Math.max(0, dy) * tilt;
        const loopDist = Math.sqrt(shiftedX * shiftedX + Math.min(0, dy) * Math.min(0, dy) * 1.4);
        const wave = Math.sin((y + seed) * 0.25) * 0.3;
        ridge = ((loopDist + wave) % 2.45) < 1.15;
      } else if (pattern === 'Boog') {
        const arch = y - Math.exp(-(dx * dx) / 22) * (4.2 + (seed % 3) * 0.7);
        ridge = (((arch + 20) % 2.5) < 1.15);
      } else {
        // Samengesteld (twin loop / delta)
        const d1 = Math.sqrt((dx - 2.2) ** 2 + (dy + 1.5) ** 2);
        const d2 = Math.sqrt((dx + 2.2) ** 2 + (dy - 1.5) ** 2);
        const blended = Math.min(d1, d2) + Math.sin(dx * 0.6 + seed) * 0.35;
        ridge = (blended % 2.5) < 1.15;
      }

      // Add deterministic minutiae breaks / scar variation based on seed
      const hash = ((x * 73 + y * 139 + seed * 37) % 29);
      if (ridge && hash === 0 && dist > 2.5) {
        m[y * FP_COLS + x] = 2; // faint ridge / minutia break
      } else if (ridge) {
        m[y * FP_COLS + x] = 1;
      }
    }
  }

  return m;
}

/**
 * Creates a partial/smudged crime scene trace from a full fingerprint matrix.
 * Ideal for creating realistic lifted evidence prints that players match against suspects.
 */
export function createSmudgedTrace(
  source: number[],
  smudgePercent: number,
  cropSide: 'full' | 'left' | 'right' | 'top' | 'bottom' = 'full',
  seed = 7
): number[] {
  const out = createEmptyMatrix();
  for (let y = 0; y < FP_ROWS; y++) {
    for (let x = 0; x < FP_COLS; x++) {
      if (cropSide === 'left' && x > FP_COLS * 0.62) continue;
      if (cropSide === 'right' && x < FP_COLS * 0.38) continue;
      if (cropSide === 'top' && y > FP_ROWS * 0.62) continue;
      if (cropSide === 'bottom' && y < FP_ROWS * 0.38) continue;

      const idx = y * FP_COLS + x;
      const val = source[idx] ?? 0;
      if (val === 0) continue;

      const pseudoRand = ((x * 41 + y * 83 + seed * 19) % 100);
      if (pseudoRand < smudgePercent * 0.65) {
        // dropped ridge pixel
        continue;
      } else if (pseudoRand < smudgePercent) {
        out[idx] = 2; // faint smudge
      } else {
        out[idx] = val;
      }
    }
  }
  return out;
}

export interface FingerprintComparison {
  overlapScore: number; // 0..100 percentage of trace active pixels matched in suspect
  iouScore: number; // 0..100 intersection over union of active pixels
  matchedPixels: number;
  traceActiveCount: number;
  suspectActiveCount: number;
  extraTracePixels: number;
}

/**
 * Compares a lifted trace (from evidence or player input) against a suspect's stored print.
 * Uses active-pixel recall + structural IoU so partial prints from a crime scene still score accurately!
 */
export function compareFingerprints(
  trace: number[],
  suspect: number[]
): FingerprintComparison {
  let traceActiveCount = 0;
  let suspectActiveCount = 0;
  let matchedPixels = 0;
  let extraTracePixels = 0;
  let unionCount = 0;

  for (let i = 0; i < FP_LENGTH; i++) {
    const t = (trace[i] ?? 0) > 0;
    const s = (suspect[i] ?? 0) > 0;
    if (t) traceActiveCount++;
    if (s) suspectActiveCount++;
    if (t || s) unionCount++;
    if (t && s) matchedPixels++;
    if (t && !s) extraTracePixels++;
  }

  if (traceActiveCount === 0) {
    return {
      overlapScore: 0,
      iouScore: 0,
      matchedPixels: 0,
      traceActiveCount: 0,
      suspectActiveCount,
      extraTracePixels: 0,
    };
  }

  const recall = matchedPixels / traceActiveCount;
  const iou = unionCount > 0 ? matchedPixels / unionCount : 0;
  // Blend recall (for partial prints) with precision penalty for wrong extra pixels
  const precision = matchedPixels / traceActiveCount;
  const overlapScore = Math.round(Math.max(0, Math.min(100, (recall * 0.72 + iou * 0.28 + precision * 0.0) * 100)));

  return {
    overlapScore,
    iouScore: Math.round(iou * 100),
    matchedPixels,
    traceActiveCount,
    suspectActiveCount,
    extraTracePixels,
  };
}
