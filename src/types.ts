/**
 * Core domain vocabulary.
 *
 * The product is a musical sketchbook, not a tuner. Everything downstream of
 * pitch detection speaks in `NoteEvent`s: discrete, timestamped musical events.
 * Raw audio is deliberately kept at the edge of the system so that the musical
 * intelligence layer is pure, testable, and privacy-preserving.
 */

/** A single detected note: what was played, when, and for how long. */
export interface NoteEvent {
  /** MIDI note number. 40 = E2 = open low E in standard tuning. */
  midi: number;
  /** Onset time in milliseconds, relative to the start of the session. */
  startMs: number;
  /** Sounding duration in milliseconds. */
  durationMs: number;
  /** Detector confidence, 0..1. Used to weight analysis and pick clean takes. */
  confidence: number;
  /** Peak RMS amplitude, 0..1. Used as a stand-in for how hard it was picked. */
  velocity?: number;
}

/** Where a note was probably fretted. */
export interface FretPosition {
  /** String index, 0 = lowest-pitched string. */
  string: number;
  /** Fret number, 0 = open. */
  fret: number;
}

/** A contiguous musical idea, carved out of the stream of notes. */
export interface Phrase {
  id: string;
  notes: NoteEvent[];
  startMs: number;
  endMs: number;
}

/** How steady/clean a take was, used for "the third one was the cleanest". */
export interface TakeQuality {
  /** 0..1 overall. Higher is cleaner. */
  score: number;
  /** Mean detector confidence across the notes. */
  confidence: number;
  /** 0..1, how evenly the notes sit on an inferred pulse. */
  timingSteadiness: number;
  /** 0..1, penalises accidental blips and choked notes. */
  articulation: number;
}

/** A group of phrases that are all the "same idea" played more than once. */
export interface MotifGroup {
  id: string;
  /** Every take of this idea, in the order it was played. */
  takes: Phrase[];
  /** The take that best represents the group (the medoid). */
  representative: Phrase;
  /** The cleanest-sounding take, which is not always the representative. */
  cleanest: Phrase;
  /** Mean pairwise similarity, 0..1. How tightly the takes cohere. */
  cohesion: number;
}

export interface ScaleEstimate {
  /** Pitch class of the tonal centre, 0 = C. */
  tonicPc: number;
  /** e.g. "minor pentatonic", "major", "dorian". */
  scale: string;
  /** 0..1. Low confidence is reported honestly rather than hidden. */
  confidence: number;
  /** Human-readable, e.g. "E minor pentatonic". */
  label: string;
}

export interface RhythmEstimate {
  bpm: number;
  /** 0..1, how convincingly the notes line up to that pulse. */
  confidence: number;
  /** Note durations as multiples of the beat, e.g. [0.5, 0.5, 1, 1]. */
  beatRatios: number[];
}

/** A full read of one musical idea. Everything the app knows about it. */
export interface PhraseAnalysis {
  phrase: Phrase;
  noteNames: string[];
  /** Semitone steps between consecutive notes. */
  intervals: number[];
  positions: FretPosition[];
  tab: string;
  scale: ScaleEstimate;
  rhythm: RhythmEstimate;
  quality: TakeQuality;
  /** Pitch class the phrase keeps returning to / resting on. */
  homePc: number;
  /** Whether the phrase ends by moving up, down, or staying put. */
  resolution: 'up' | 'down' | 'static';
}

/** One saved state of a riff. Riffs branch; they are never overwritten. */
export interface RiffVersion {
  id: string;
  /** "Version A", "Version B", ... assigned in creation order. */
  label: string;
  /** The version this one grew out of, if any. Null for the root. */
  parentId: string | null;
  notes: NoteEvent[];
  createdAt: number;
  /** Optional reference to stored audio. Absent unless the user saved it. */
  audioRef?: string;
  /** Free-text, the player's own words. */
  comment?: string;
}

/** A musical idea the player chose to keep. */
export interface Riff {
  id: string;
  /** Unnamed by default — naming is the player's business, not the app's. */
  name: string | null;
  createdAt: number;
  updatedAt: number;
  versions: RiffVersion[];
  /** Which version is currently the "front door" of this riff. */
  currentVersionId: string;
  tags: string[];
  notes?: string;
}

/** A loose grouping of riffs the player is treating as one song. */
export interface SongSeed {
  id: string;
  name: string;
  createdAt: number;
  sections: Array<{ role: string; riffId: string; versionId?: string }>;
}

/** A match between something just played and something remembered. */
export interface RecognitionMatch {
  riffId: string;
  versionId: string;
  riffName: string | null;
  /** 0..1. */
  similarity: number;
  /** When the matched version was first created. */
  createdAt: number;
}
