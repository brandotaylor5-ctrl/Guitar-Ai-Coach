/**
 * What the conversation is allowed to do.
 *
 * The model does not write music here. Every tool routes to a musical
 * operation that already exists and is already tested — the same scale
 * estimator, the same ending generator, the same fretboard reasoning the rest
 * of the app uses. The model's job is to work out which one the player meant
 * and to say what came back in their language.
 *
 * That boundary is the whole design. It is what stops a language model from
 * hallucinating a riff and handing it back as though the player had played it.
 */

import type { NoteEvent } from '../types.ts';
import type { RiffLibrary } from '../library/riffLibrary.ts';
import type { SketchbookSession } from '../session/session.ts';
import type { ConversationWorkspace } from './workspace.ts';
import { midiToName, nameToMidi, pcToName } from '../music/notes.ts';
import { positionsFor } from '../music/fretboard.ts';
import { explainMood, explainPhrase, explainRelation } from '../explain/explain.ts';
import { suggestAnswer, suggestChords, suggestEndings } from '../create/suggest.ts';
import { diffTakes } from '../phrase/diff.ts';
import { dropTail, setNoteAt, spliceNotes, transpose } from '../phrase/edit.ts';

export interface ToolContext {
  workspace: ConversationWorkspace;
  library: RiffLibrary;
  /** Present when there is a live session to look back through. */
  session?: SketchbookSession;
  /** Called when the model wants the player to actually hear something. */
  onPlay?: (notes: NoteEvent[], label: string) => void;
  /** Called whenever the working phrase changes, so the UI can follow along. */
  onChange?: (notes: NoteEvent[], description: string) => void;
}

/** A tool definition in the shape the Messages API expects. */
export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties: false;
  };
}

const noteNameSchema = {
  type: 'string',
  description: 'A note name with an octave, such as "E2", "G#3" or "Bb4".',
};

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'look_at_phrase',
    description:
      'Read everything the app knows about the phrase currently being discussed: its notes, ' +
      'the tab, where the fingers probably went, the estimated key and tempo, and how cleanly ' +
      'it was played. Call this before answering almost any question about the music.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'explain_phrase',
    description:
      'Get the app\'s own beginner-first explanation of the phrase — its home note, what makes ' +
      'it sound the way it does, and where to find those notes on the neck.',
    input_schema: {
      type: 'object',
      properties: {
        about: {
          type: 'string',
          enum: ['general', 'mood'],
          description: 'Use "mood" for questions like "why does this sound sad?".',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'suggest_endings',
    description:
      'Get three ways to finish the phrase — resolved, unresolved and darker — generated from ' +
      'the player\'s own scale, register and rhythm. Returns options to offer, not one answer.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'suggest_answer',
    description:
      'Get a second phrase that answers this one: the same rhythm with the shape inverted, so ' +
      'the two sound like halves of one thought.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'suggest_chords',
    description: 'Get the chords that fit underneath the phrase, scored by how much of it they already contain.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'change_note',
    description:
      'Change one note of the working phrase, leaving everything else as played. This is the ' +
      'smallest and most useful edit: "try the final A as a G". Position 1 is the first note; ' +
      'negative counts back from the end, so -1 is the last note.',
    input_schema: {
      type: 'object',
      properties: {
        position: { type: 'integer', description: '1-based. Use -1 for the last note.' },
        to: noteNameSchema,
        why: { type: 'string', description: 'One short phrase saying what this change does to the sound.' },
      },
      required: ['position', 'to', 'why'],
      additionalProperties: false,
    },
  },
  {
    name: 'trim_phrase',
    description: 'Drop notes from the end of the working phrase — "keep everything except the last three notes".',
    input_schema: {
      type: 'object',
      properties: { count: { type: 'integer', description: 'How many notes to remove from the end.' } },
      required: ['count'],
      additionalProperties: false,
    },
  },
  {
    name: 'extend_phrase',
    description:
      'Add notes to the end of the working phrase. Use this to apply an ending you have already ' +
      'fetched with suggest_endings, or a short continuation you can justify from the phrase\'s ' +
      'own scale — which you should check with look_at_phrase first.',
    input_schema: {
      type: 'object',
      properties: {
        notes: { type: 'array', items: noteNameSchema, description: 'The notes to add, in order.' },
        why: { type: 'string', description: 'One short phrase saying what this does to the sound.' },
      },
      required: ['notes', 'why'],
      additionalProperties: false,
    },
  },
  {
    name: 'transpose_phrase',
    description: 'Move the whole working phrase up or down by a number of semitones.',
    input_schema: {
      type: 'object',
      properties: { semitones: { type: 'integer', description: 'Positive moves up, negative moves down.' } },
      required: ['semitones'],
      additionalProperties: false,
    },
  },
  {
    name: 'undo_change',
    description:
      'Step back the last change made to the working phrase, or throw away every change and ' +
      'return to exactly what the player played.',
    input_schema: {
      type: 'object',
      properties: { all: { type: 'boolean', description: 'True to go all the way back to the original.' } },
      additionalProperties: false,
    },
  },
  {
    name: 'compare_with_original',
    description:
      'Show what has changed between what the player actually played and the working phrase, ' +
      'note by note. Use this before claiming any change has been made.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'play_phrase',
    description:
      'Play something to the player through their speakers so they can hear it.',
    input_schema: {
      type: 'object',
      properties: {
        which: {
          type: 'string',
          enum: ['working', 'original'],
          description: 'The phrase as it now stands, or what they originally played.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'find_similar_riffs',
    description:
      'Check the player\'s saved riffs for anything close to the working phrase — they may be ' +
      'circling back to an old idea without realising.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_riffs',
    description: 'List the riffs the player has saved, with their versions.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'save_phrase',
    description:
      'Save the working phrase. Saving onto an existing riff adds a new version and never ' +
      'overwrites anything. Only call this when the player has asked for it.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'A name, only if the player gave one. Leave out otherwise.' },
        onto_riff_id: {
          type: 'string',
          description: 'To add this as a new version of an existing riff, its id from list_riffs.',
        },
        comment: { type: 'string', description: 'A short note about what makes this version different.' },
      },
      additionalProperties: false,
    },
  },
];

function ok(payload: Record<string, unknown>): string {
  return JSON.stringify(payload);
}

function fail(message: string): string {
  return JSON.stringify({ error: message });
}

function notesPayload(notes: NoteEvent[]): string[] {
  return notes.map((note) => midiToName(note.midi));
}

/** Reject anything that cannot be played on the instrument in front of them. */
function parseNoteName(name: string, tuningLow: number, tuningHigh: number): number {
  const midi = nameToMidi(name);
  if (midi < tuningLow || midi > tuningHigh) {
    throw new Error(`${name} is outside the range of the guitar being played.`);
  }
  return midi;
}

export async function runTool(name: string, rawInput: unknown, ctx: ToolContext): Promise<string> {
  const input = (rawInput ?? {}) as Record<string, unknown>;
  const { workspace, library } = ctx;

  if (!workspace.isOpen && name !== 'list_riffs') {
    return fail('There is no phrase open yet. The player needs to play something first.');
  }

  const tuning = workspace.tuning;
  const lowest = Math.min(...tuning.strings);
  const highest = Math.max(...tuning.strings) + 22;

  const change = (notes: NoteEvent[], description: string) => {
    workspace.apply(notes, description);
    ctx.onChange?.(workspace.notes, description);
    return ok({
      changed: true,
      description,
      phrase_now: notesPayload(workspace.notes),
      note: 'This is a suggestion on top of what the player played. Their original is kept.',
    });
  };

  try {
    switch (name) {
      case 'look_at_phrase': {
        const analysis = workspace.analyze();
        return ok({
          notes: analysis.noteNames,
          intervals: analysis.intervals,
          tab: analysis.tab,
          fingering: analysis.positions.map((p, i) => ({
            order: i + 1, string: p.string + 1, fret: p.fret,
          })),
          home_note: pcToName(analysis.homePc),
          scale: analysis.scale.label,
          scale_confidence: Number(analysis.scale.confidence.toFixed(2)),
          tempo_bpm: analysis.rhythm.bpm > 0 ? Math.round(analysis.rhythm.bpm) : null,
          ends_by_moving: analysis.resolution,
          take_quality: Number(analysis.quality.score.toFixed(2)),
          has_been_edited: workspace.edited,
          edits_so_far: workspace.history.map((step) => step.description),
        });
      }

      case 'explain_phrase': {
        const analysis = workspace.analyze();
        const explanation = input.about === 'mood'
          ? explainMood(analysis, tuning)
          : explainPhrase(analysis, tuning);
        return ok({
          headline: explanation.headline,
          plain_language: explanation.plain,
          theory_terms: explanation.theory,
          reminder: 'Say the plain-language version first. Only reach for the theory terms if they ask.',
        });
      }

      case 'suggest_endings': {
        const endings = suggestEndings(workspace.analyze(), { tuning });
        if (endings.length === 0) return fail('This phrase is too short to suggest an ending for.');
        return ok({
          endings: endings.map((ending) => ({
            kind: ending.kind,
            notes: notesPayload(ending.notes),
            what_it_does: ending.description,
          })),
          reminder: 'Offer all three. None of them is the right one — that is the player\'s call.',
        });
      }

      case 'suggest_answer': {
        const answer = suggestAnswer(workspace.analyze(), { tuning });
        if (!answer) return fail('This phrase is too short to build an answering phrase from.');
        return ok({ notes: notesPayload(answer.notes), what_it_does: answer.description });
      }

      case 'suggest_chords': {
        const chords = suggestChords(workspace.analyze());
        return ok({
          chords: chords.map((chord) => ({
            chord: chord.label,
            how_much_of_the_riff_it_contains: `${Math.round(chord.fit * 100)}%`,
            why: chord.description,
          })),
        });
      }

      case 'change_note': {
        const position = Number(input.position);
        const to = String(input.to);
        if (!Number.isInteger(position) || position === 0) {
          return fail('Position must be a whole number. 1 is the first note, -1 is the last.');
        }
        const index = position > 0 ? position - 1 : position;
        const midi = parseNoteName(to, lowest, highest);
        const before = workspace.notes;
        const updated = setNoteAt(before, index, midi);
        const target = index < 0 ? before.length + index : index;
        const was = midiToName(before[target]!.midi);
        return change(updated, `${was} → ${to} (${String(input.why ?? 'a change')})`);
      }

      case 'trim_phrase': {
        const count = Number(input.count);
        if (!Number.isInteger(count) || count < 1) return fail('Count must be a whole number of at least 1.');
        if (count >= workspace.notes.length) return fail('That would remove the whole phrase.');
        return change(dropTail(workspace.notes, count), `dropped the last ${count} note${count === 1 ? '' : 's'}`);
      }

      case 'extend_phrase': {
        const names = Array.isArray(input.notes) ? (input.notes as unknown[]).map(String) : [];
        if (names.length === 0) return fail('No notes were given to add.');
        if (names.length > 8) return fail('Add at most eight notes at a time — this is meant to be a suggestion, not a new riff.');
        const existing = workspace.notes;
        const step = existing.length > 1
          ? existing[1]!.startMs - existing[0]!.startMs
          : 400;
        const additions: NoteEvent[] = names.map((noteName, i) => ({
          midi: parseNoteName(noteName, lowest, highest),
          startMs: i * step,
          durationMs: step * 0.8,
          confidence: 1,
        }));
        return change(spliceNotes(existing, additions), `added ${names.join(' → ')} (${String(input.why ?? 'a continuation')})`);
      }

      case 'transpose_phrase': {
        const semitones = Number(input.semitones);
        if (!Number.isInteger(semitones) || semitones === 0) return fail('Give a non-zero whole number of semitones.');
        const moved = transpose(workspace.notes, semitones);
        for (const note of moved) {
          if (positionsFor(note.midi, tuning).length === 0) {
            return fail(`Moving it ${semitones} semitones would put ${midiToName(note.midi)} off the neck.`);
          }
        }
        return change(moved, `moved the whole phrase ${Math.abs(semitones)} semitone${Math.abs(semitones) === 1 ? '' : 's'} ${semitones > 0 ? 'up' : 'down'}`);
      }

      case 'undo_change': {
        if (input.all === true) {
          workspace.revert();
          ctx.onChange?.(workspace.notes, 'back to the original');
          return ok({ reverted: true, phrase_now: notesPayload(workspace.notes) });
        }
        if (!workspace.undo()) return ok({ reverted: false, message: 'There were no changes to undo.' });
        ctx.onChange?.(workspace.notes, 'undid the last change');
        return ok({ reverted: true, phrase_now: notesPayload(workspace.notes) });
      }

      case 'compare_with_original': {
        const diff = diffTakes(workspace.originalNotes, workspace.notes);
        const relation = explainRelation(workspace.originalNotes, workspace.notes);
        return ok({
          they_played: notesPayload(workspace.originalNotes),
          it_now_reads: notesPayload(workspace.notes),
          unchanged: diff.identical,
          summary: diff.summary,
          how_they_relate: relation?.plain ?? [],
        });
      }

      case 'play_phrase': {
        const which = input.which === 'original' ? 'original' : 'working';
        const notes = which === 'original' ? workspace.originalNotes : workspace.notes;
        if (!ctx.onPlay) return fail('There is no way to play audio in this context.');
        ctx.onPlay(notes, which === 'original' ? 'what you played' : 'the phrase as it stands');
        return ok({ playing: notesPayload(notes), which });
      }

      case 'find_similar_riffs': {
        const matches = await library.findSimilar(workspace.notes);
        return ok({
          matches: matches.map((match) => ({
            riff_id: match.riffId,
            name: match.riffName ?? 'unnamed',
            how_alike: `${Math.round(match.similarity * 100)}%`,
            days_ago: Math.round((Date.now() - match.createdAt) / 86_400_000),
          })),
        });
      }

      case 'list_riffs': {
        const riffs = await library.listRiffs();
        return ok({
          riffs: riffs.map((riff) => ({
            riff_id: riff.id,
            name: riff.name ?? 'unnamed',
            versions: riff.versions.map((version) => ({
              label: version.label, notes: notesPayload(version.notes),
            })),
            days_ago: Math.round((Date.now() - riff.createdAt) / 86_400_000),
          })),
        });
      }

      case 'save_phrase': {
        const comment = typeof input.comment === 'string' ? input.comment : undefined;
        if (typeof input.onto_riff_id === 'string' && input.onto_riff_id) {
          const version = await library.addVersion(input.onto_riff_id, workspace.notes, { ...(comment ? { comment } : {}) });
          return ok({
            saved: true, as: version.label,
            note: 'Added as a new version. Nothing was overwritten.',
          });
        }
        const riff = await library.saveRiff(workspace.notes, {
          name: typeof input.name === 'string' && input.name ? input.name : null,
          ...(comment ? { comment } : {}),
        });
        return ok({
          saved: true, riff_id: riff.id, as: 'Version A',
          name: riff.name ?? 'unnamed',
        });
      }

      default:
        return fail(`There is no tool called ${name}.`);
    }
  } catch (err) {
    return fail((err as Error).message);
  }
}
