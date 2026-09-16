/**
 * "What changed?"
 *
 * Aligns two takes on absolute pitch (not intervals) because when a player asks
 * what changed, they want to hear note names they recognise — "you added a C
 * before going back to B" — not an interval-space edit script.
 */

import type { NoteEvent } from '../types.ts';
import { midiToName } from '../music/notes.ts';
import { tempoRatio } from '../music/rhythm.ts';
import { align } from './align.ts';
import type { AlignOp } from './align.ts';

export interface NoteChange {
  kind: 'kept' | 'changed' | 'added' | 'removed';
  /** Position in the original take, if the note exists there. */
  fromIndex: number | null;
  /** Position in the new take, if the note exists there. */
  toIndex: number | null;
  fromNote: string | null;
  toNote: string | null;
}

export interface TakeDiff {
  changes: NoteChange[];
  /** Notes present and unchanged in both takes. */
  keptCount: number;
  /** >1 means the second take was faster. */
  tempoRatio: number;
  /** True when the two takes are note-for-note identical. */
  identical: boolean;
  /** A sentence a beginner can act on. */
  summary: string;
}

/**
 * Same pitch is free. Cost then grows quadratically, because a semitone slip is
 * a near-miss of the same note while a leap of a third or more is a different
 * note altogether — at that distance it reads better as a note added and
 * another dropped than as one note "becoming" the other.
 */
function pitchCost(a: NoteEvent, b: NoteEvent): number {
  const d = Math.abs(a.midi - b.midi);
  if (d === 0) return 0;
  return Math.min(1, 0.3 + (d * d) / 16);
}

/** Tuned against `pitchCost` so that distant pairs align as add/drop, not swap. */
const DIFF_GAP_COST = 0.62;

function describe(changes: NoteChange[], ratio: number): string {
  const edits = changes.filter((c) => c.kind !== 'kept');
  const parts: string[] = [];

  if (edits.length === 0) {
    parts.push('same notes in the same order');
  } else {
    for (const c of edits.slice(0, 4)) {
      if (c.kind === 'changed') parts.push(`you played ${c.toNote} instead of ${c.fromNote}`);
      else if (c.kind === 'added') parts.push(`you added ${c.toNote}`);
      else parts.push(`you dropped ${c.fromNote}`);
    }
    if (edits.length > 4) parts.push(`and ${edits.length - 4} more changes`);
  }

  const pct = Math.round(Math.abs(ratio - 1) * 100);
  if (pct >= 8) parts.push(`the new take is about ${pct}% ${ratio > 1 ? 'faster' : 'slower'}`);

  const sentence = parts.join(', ');
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + '.';
}

export function diffTakes(from: NoteEvent[], to: NoteEvent[]): TakeDiff {
  const alignment = align(from, to, { substitutionCost: pitchCost, gapCost: DIFF_GAP_COST });
  const changes: NoteChange[] = alignment.ops.map((op: AlignOp) => {
    const fromNote = op.aIndex !== null ? midiToName(from[op.aIndex]!.midi) : null;
    const toNote = op.bIndex !== null ? midiToName(to[op.bIndex]!.midi) : null;
    const kind: NoteChange['kind'] =
      op.kind === 'match' ? 'kept'
        : op.kind === 'substitute' ? 'changed'
          : op.kind === 'insert' ? 'added' : 'removed';
    return { kind, fromIndex: op.aIndex, toIndex: op.bIndex, fromNote, toNote };
  });

  const keptCount = changes.filter((c) => c.kind === 'kept').length;
  const ratio = tempoRatio(from, to);
  const identical = changes.every((c) => c.kind === 'kept');

  return { changes, keptCount, tempoRatio: ratio, identical, summary: describe(changes, ratio) };
}

/** Both takes as aligned note-name rows, for side-by-side display. */
export function renderDiff(from: NoteEvent[], to: NoteEvent[], labels: [string, string] = ['Take A', 'Take B']): string {
  const { changes, summary } = diffTakes(from, to);
  const width = (c: NoteChange) => Math.max((c.fromNote ?? '·').length, (c.toNote ?? '·').length);
  const pad = (s: string, w: number) => s.padEnd(w, ' ');
  const labelWidth = Math.max(labels[0].length, labels[1].length, 'Change'.length);

  const rowA = changes.map((c) => pad(c.fromNote ?? '·', width(c))).join(' → ');
  const rowB = changes.map((c) => pad(c.toNote ?? '·', width(c))).join(' → ');
  const marks = changes
    .map((c) => pad(c.kind === 'kept' ? ' ' : c.kind === 'changed' ? '^' : c.kind === 'added' ? '+' : '-', width(c)))
    .join('   ');

  return [
    `${pad(labels[0], labelWidth)}: ${rowA}`,
    `${pad(labels[1], labelWidth)}: ${rowB}`,
    `${pad('', labelWidth)}  ${marks}`,
    '',
    summary,
  ].join('\n');
}
