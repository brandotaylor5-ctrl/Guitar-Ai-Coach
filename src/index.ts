/**
 * Guitar AI Coach — an intelligent musical sketchbook.
 *
 * The layering, bottom to top:
 *   audio/      samples in, discrete notes out. The only DSP in the project.
 *   music/      note, scale, rhythm and fretboard reasoning.
 *   phrase/     carving notes into ideas, and comparing those ideas.
 *   memory/     what the session remembers, and for how long.
 *   library/    the player's own riffs, versioned and never overwritten.
 *   explain/    saying what was found, beginner-first.
 *   create/     suggestions, always generated from the player's own material.
 *   practice/   playing your own riff back to you and coaching the attempt.
 *   fingerprint/ what the player's habits look like over time.
 *   session/    the thing that behaves like another musician in the room.
 */

export type * from './types.ts';

export * from './music/notes.ts';
export * from './music/fretboard.ts';
export * from './music/key.ts';
export * from './music/rhythm.ts';

export * from './audio/pitchDetect.ts';
export * from './audio/noteTracker.ts';
export * from './audio/stream.ts';

export * from './phrase/align.ts';
export * from './phrase/segment.ts';
export * from './phrase/similarity.ts';
export * from './phrase/diff.ts';
export * from './phrase/motif.ts';
export * from './phrase/quality.ts';
export * from './phrase/analyze.ts';
export * from './phrase/edit.ts';

export * from './memory/rollingMemory.ts';
export * from './memory/audioRing.ts';

export * from './library/store.ts';
export * from './library/riffLibrary.ts';
export * from './library/localStorageStore.ts';

export * from './explain/explain.ts';
export * from './create/suggest.ts';
export * from './practice/practice.ts';
export * from './fingerprint/fingerprint.ts';
export * from './session/session.ts';
