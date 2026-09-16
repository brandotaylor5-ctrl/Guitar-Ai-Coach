/**
 * "You keep coming back to this one."
 *
 * Groups the phrases of a session into motifs — sets of takes that are all the
 * same musical idea. This is what lets the app say "you played a variation of
 * it three times" instead of handing back a wall of undifferentiated phrases.
 */

import type { MotifGroup, NoteEvent, Phrase } from '../types.ts';
import { phraseId } from './segment.ts';
import { comparePhrases } from './similarity.ts';
import { takeQuality } from './quality.ts';

export interface MotifOptions {
  /** Minimum overall similarity for two takes to count as the same idea. */
  threshold?: number;
  /** Ignore phrases shorter than this; two notes match everything. */
  minNotes?: number;
}

const DEFAULTS: Required<MotifOptions> = { threshold: 0.82, minNotes: 3 };

function meanSimilarityTo(target: Phrase, others: Phrase[]): number {
  const rest = others.filter((p) => p.id !== target.id);
  if (rest.length === 0) return 1;
  return rest.reduce((s, p) => s + comparePhrases(target, p).overall, 0) / rest.length;
}

function buildGroup(takes: Phrase[]): MotifGroup {
  const ordered = [...takes].sort((a, b) => a.startMs - b.startMs);
  let representative = ordered[0]!;
  let bestMean = -1;
  for (const p of ordered) {
    const m = meanSimilarityTo(p, ordered);
    if (m > bestMean) { bestMean = m; representative = p; }
  }
  let cleanest = ordered[0]!;
  let bestScore = -1;
  for (const p of ordered) {
    const s = takeQuality(p.notes).score;
    // Ties go to the later take: players usually settle into an idea.
    if (s >= bestScore) { bestScore = s; cleanest = p; }
  }
  let pairs = 0;
  let total = 0;
  for (let i = 0; i < ordered.length; i++) {
    for (let j = i + 1; j < ordered.length; j++) {
      total += comparePhrases(ordered[i]!, ordered[j]!).overall;
      pairs++;
    }
  }
  return {
    // Named after the take that started it, so the group keeps its identity
    // across the re-grouping that happens on every redraw.
    id: `motif_${ordered[0]!.id}`,
    takes: ordered,
    representative,
    cleanest,
    cohesion: pairs === 0 ? 1 : total / pairs,
  };
}

/**
 * Greedy single-pass clustering against each group's running representative.
 * Order-dependent by design: it mirrors how a listener hears a session unfold,
 * and it stays cheap enough to run live between phrases.
 */
export function groupMotifs(phrases: Phrase[], options: MotifOptions = {}): MotifGroup[] {
  const o = { ...DEFAULTS, ...options };
  const eligible = phrases.filter((p) => p.notes.length >= o.minNotes);
  const clusters: Phrase[][] = [];

  for (const phrase of eligible) {
    let bestCluster = -1;
    let bestScore = o.threshold;
    clusters.forEach((cluster, i) => {
      // Compare against the closest member, so a group can drift gradually
      // without a single early take gatekeeping everything after it.
      const score = Math.max(...cluster.map((p) => comparePhrases(phrase, p).overall));
      if (score >= bestScore) { bestScore = score; bestCluster = i; }
    });
    if (bestCluster >= 0) clusters[bestCluster]!.push(phrase);
    else clusters.push([phrase]);
  }

  return clusters.map(buildGroup).sort((a, b) => b.takes.length - a.takes.length);
}

/** Motifs the player actually returned to, most-repeated first. */
export function repeatedMotifs(phrases: Phrase[], options: MotifOptions = {}): MotifGroup[] {
  return groupMotifs(phrases, options).filter((g) => g.takes.length > 1);
}

/** The group containing a given phrase, if any. */
export function motifContaining(groups: MotifGroup[], phraseId: string): MotifGroup | null {
  return groups.find((g) => g.takes.some((t) => t.id === phraseId)) ?? null;
}

/** Convenience for callers holding raw notes rather than phrases. */
export function sameIdea(a: NoteEvent[], b: NoteEvent[], threshold = DEFAULTS.threshold): boolean {
  const phrase = (notes: NoteEvent[]): Phrase => ({
    id: phraseId(notes),
    notes,
    startMs: notes[0]?.startMs ?? 0,
    endMs: notes.length ? notes[notes.length - 1]!.startMs + notes[notes.length - 1]!.durationMs : 0,
  });
  return comparePhrases(phrase(a), phrase(b)).overall >= threshold;
}
