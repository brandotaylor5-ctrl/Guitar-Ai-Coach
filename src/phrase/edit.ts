/**
 * Non-destructive edits on a take.
 *
 * Every one of these returns new notes and leaves the original untouched,
 * because the player's original phrase is the centre of the process and must
 * always survive whatever the app suggests doing to it.
 */

import type { NoteEvent } from '../types.ts';
import { interOnsetIntervals } from '../music/rhythm.ts';

export function transpose(notes: NoteEvent[], semitones: number): NoteEvent[] {
  return notes.map((n) => ({ ...n, midi: n.midi + semitones }));
}

/** Slow a take down (factor > 1) or speed it up, without touching pitch. */
export function timeScale(notes: NoteEvent[], factor: number): NoteEvent[] {
  if (factor <= 0) throw new Error('timeScale factor must be positive');
  const origin = notes[0]?.startMs ?? 0;
  return notes.map((n) => ({
    ...n,
    startMs: origin + (n.startMs - origin) * factor,
    durationMs: n.durationMs * factor,
  }));
}

/** Shift a take so it begins at `startMs`. */
export function rebase(notes: NoteEvent[], startMs = 0): NoteEvent[] {
  const origin = notes[0]?.startMs ?? 0;
  return notes.map((n) => ({ ...n, startMs: n.startMs - origin + startMs }));
}

/** The typical gap between onsets — used to place notes the app suggests. */
export function typicalStepMs(notes: NoteEvent[]): number {
  const iois = interOnsetIntervals(notes).slice(0, -1);
  if (iois.length === 0) return notes[0]?.durationMs ?? 400;
  const sorted = [...iois].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

/** Join two takes end to end, re-timing the second to follow the first. */
export function spliceNotes(head: NoteEvent[], tail: NoteEvent[]): NoteEvent[] {
  if (head.length === 0) return rebase(tail);
  if (tail.length === 0) return [...head];
  const last = head[head.length - 1]!;
  const gap = typicalStepMs(head);
  const resumeAt = last.startMs + Math.max(gap, last.durationMs);
  return [...head, ...rebase(tail, resumeAt)];
}

/** "Keep everything except the last three notes." */
export function dropTail(notes: NoteEvent[], count: number): NoteEvent[] {
  return notes.slice(0, Math.max(0, notes.length - count));
}

/** "Keep everything except the last three notes — try these instead." */
export function replaceTail(notes: NoteEvent[], count: number, replacement: NoteEvent[]): NoteEvent[] {
  return spliceNotes(dropTail(notes, count), replacement);
}

/**
 * Take the opening of one version and the ending of another. This is the
 * "combine them" answer when a player likes half of each take.
 */
export function combineTakes(a: NoteEvent[], b: NoteEvent[], splitRatio = 0.5): NoteEvent[] {
  const cut = Math.max(1, Math.round(a.length * splitRatio));
  return spliceNotes(a.slice(0, cut), b.slice(Math.min(b.length - 1, cut)));
}
