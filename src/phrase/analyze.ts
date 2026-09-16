/** Everything the app can work out about one musical idea, in one call. */

import type { NoteEvent, Phrase, PhraseAnalysis } from '../types.ts';
import { intervalsOf, midiToName } from '../music/notes.ts';
import { estimateScale, homePitchClass } from '../music/key.ts';
import { estimateRhythm } from '../music/rhythm.ts';
import { inferFingering, renderTab, STANDARD_TUNING } from '../music/fretboard.ts';
import type { FingeringOptions } from '../music/fretboard.ts';
import { takeQuality } from './quality.ts';
import { phraseId } from './segment.ts';

export function notesToPhrase(notes: NoteEvent[], id = phraseId(notes)): Phrase {
  const last = notes[notes.length - 1];
  return {
    id,
    notes,
    startMs: notes[0]?.startMs ?? 0,
    endMs: last ? last.startMs + last.durationMs : 0,
  };
}

export function analyzePhrase(phrase: Phrase, options: FingeringOptions = {}): PhraseAnalysis {
  const { notes } = phrase;
  const midis = notes.map((n) => n.midi);
  const intervals = intervalsOf(midis);
  const positions = inferFingering(midis, options);
  const lastInterval = intervals[intervals.length - 1] ?? 0;

  return {
    phrase,
    noteNames: midis.map((m) => midiToName(m)),
    intervals,
    positions,
    tab: renderTab(positions, options.tuning ?? STANDARD_TUNING),
    scale: estimateScale(notes),
    rhythm: estimateRhythm(notes),
    quality: takeQuality(notes),
    homePc: homePitchClass(notes),
    resolution: lastInterval > 0 ? 'up' : lastInterval < 0 ? 'down' : 'static',
  };
}

export function analyzeNotes(notes: NoteEvent[], options: FingeringOptions = {}): PhraseAnalysis {
  return analyzePhrase(notesToPhrase(notes), options);
}
