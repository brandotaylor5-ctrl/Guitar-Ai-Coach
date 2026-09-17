/**
 * The phrase a conversation is currently about.
 *
 * A conversation needs somewhere to stand. "Make the ending darker" then "play
 * it" then "save that" only make sense if all three refer to the same evolving
 * thing — so the workspace holds one working phrase, remembers how it got
 * there, and can always hand back the player's untouched original.
 *
 * Nothing here is destructive. The original is kept separately and every step
 * is recorded, because the player's own phrase stays the centre of this.
 */

import type { NoteEvent, Phrase, PhraseAnalysis } from '../types.ts';
import { analyzeNotes } from '../phrase/analyze.ts';
import { midiToName } from '../music/notes.ts';
import type { Tuning } from '../music/fretboard.ts';
import { STANDARD_TUNING } from '../music/fretboard.ts';

export interface WorkspaceStep {
  /** What was done, in the app's own words. */
  description: string;
  notes: NoteEvent[];
}

export class ConversationWorkspace {
  readonly tuning: Tuning;
  private original: NoteEvent[] = [];
  private current: NoteEvent[] = [];
  private steps: WorkspaceStep[] = [];
  /** The phrase this workspace was opened on, if it came from a session. */
  sourcePhraseId: string | null = null;

  constructor(tuning: Tuning = STANDARD_TUNING) {
    this.tuning = tuning;
  }

  /** Point the conversation at a phrase. Discards any previous working state. */
  open(notes: NoteEvent[], phraseId: string | null = null): void {
    this.original = notes.map((note) => ({ ...note }));
    this.current = notes.map((note) => ({ ...note }));
    this.steps = [];
    this.sourcePhraseId = phraseId;
  }

  openPhrase(phrase: Phrase): void {
    this.open(phrase.notes, phrase.id);
  }

  get isOpen(): boolean {
    return this.current.length > 0;
  }

  /** What the conversation is talking about right now. */
  get notes(): NoteEvent[] {
    return this.current.map((note) => ({ ...note }));
  }

  /** What the player actually played, before anything was suggested. */
  get originalNotes(): NoteEvent[] {
    return this.original.map((note) => ({ ...note }));
  }

  get edited(): boolean {
    return this.steps.length > 0;
  }

  get history(): WorkspaceStep[] {
    return this.steps.map((step) => ({ ...step, notes: step.notes.map((n) => ({ ...n })) }));
  }

  /** Record a change. Every edit is a step, so any of them can be gone back to. */
  apply(notes: NoteEvent[], description: string): void {
    this.current = notes.map((note) => ({ ...note }));
    this.steps.push({ description, notes: this.notes });
  }

  /** Step back one change. Returns false when there is nothing to undo. */
  undo(): boolean {
    if (this.steps.length === 0) return false;
    this.steps.pop();
    const previous = this.steps[this.steps.length - 1];
    this.current = previous ? previous.notes.map((n) => ({ ...n })) : this.originalNotes;
    return true;
  }

  /** Throw away every suggestion and go back to what was played. */
  revert(): void {
    this.current = this.originalNotes;
    this.steps = [];
  }

  analyze(): PhraseAnalysis {
    return analyzeNotes(this.current, { tuning: this.tuning });
  }

  /** Note names, for anything that has to be said out loud. */
  describe(notes: NoteEvent[] = this.current): string {
    return notes.map((note) => midiToName(note.midi)).join(' → ');
  }
}
