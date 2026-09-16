/**
 * Generic sequence alignment.
 *
 * Nearly every question this product answers reduces to lining two musical
 * sequences up against each other: is this the same riff, what changed between
 * takes, which note did you fluff. One aligner serves all of them.
 */

export type AlignOpKind = 'match' | 'substitute' | 'insert' | 'delete';

export interface AlignOp {
  kind: AlignOpKind;
  /** Index into the first sequence, or null for an insertion. */
  aIndex: number | null;
  /** Index into the second sequence, or null for a deletion. */
  bIndex: number | null;
  /** 0 for a perfect match, up to 1 for a total mismatch. */
  cost: number;
}

export interface Alignment {
  ops: AlignOp[];
  /** Total cost. 0 means the sequences are identical under `substitutionCost`. */
  distance: number;
  /** 0..1, where 1 is identical. Normalised by the longer sequence. */
  similarity: number;
}

export interface AlignOptions<T> {
  /** 0 (identical) .. 1 (unrelated). */
  substitutionCost: (a: T, b: T) => number;
  /** Cost of a note being added or missing. Defaults to 0.9. */
  gapCost?: number;
  /** Below this, a substitution is reported as a match. Defaults to 0.001. */
  matchThreshold?: number;
}

/** Global (Needleman-Wunsch) alignment of two sequences. */
export function align<T>(a: T[], b: T[], options: AlignOptions<T>): Alignment {
  const gap = options.gapCost ?? 0.9;
  const matchThreshold = options.matchThreshold ?? 0.001;
  const n = a.length;
  const m = b.length;

  if (n === 0 && m === 0) return { ops: [], distance: 0, similarity: 1 };

  // d[i][j] = best cost aligning a[0..i) with b[0..j).
  const d: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0) as number[]);
  for (let i = 1; i <= n; i++) d[i]![0] = i * gap;
  for (let j = 1; j <= m; j++) d[0]![j] = j * gap;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const sub = d[i - 1]![j - 1]! + options.substitutionCost(a[i - 1]!, b[j - 1]!);
      const del = d[i - 1]![j]! + gap;
      const ins = d[i]![j - 1]! + gap;
      d[i]![j] = Math.min(sub, del, ins);
    }
  }

  const ops: AlignOp[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const cost = options.substitutionCost(a[i - 1]!, b[j - 1]!);
      if (Math.abs(d[i]![j]! - (d[i - 1]![j - 1]! + cost)) < 1e-9) {
        ops.push({
          kind: cost <= matchThreshold ? 'match' : 'substitute',
          aIndex: i - 1, bIndex: j - 1, cost,
        });
        i--; j--;
        continue;
      }
    }
    if (i > 0 && Math.abs(d[i]![j]! - (d[i - 1]![j]! + gap)) < 1e-9) {
      ops.push({ kind: 'delete', aIndex: i - 1, bIndex: null, cost: gap });
      i--;
      continue;
    }
    ops.push({ kind: 'insert', aIndex: null, bIndex: j - 1, cost: gap });
    j--;
  }
  ops.reverse();

  const distance = d[n]![m]!;
  const worst = Math.max(n, m) || 1;
  return { ops, distance, similarity: Math.max(0, 1 - distance / worst) };
}
