import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import type Anthropic from '@anthropic-ai/sdk';
import { Conversation, SYSTEM_PROMPT } from '../src/converse/conversation.ts';
import type { CompletionRequest, Transport } from '../src/converse/conversation.ts';
import { ConversationWorkspace } from '../src/converse/workspace.ts';
import { TOOL_DEFINITIONS, runTool } from '../src/converse/tools.ts';
import type { ToolContext } from '../src/converse/tools.ts';
import { RiffLibrary } from '../src/library/riffLibrary.ts';
import { midiToName } from '../src/music/notes.ts';
import { seq } from './helpers.ts';

const RIFF = ['E2', 'G2', 'A2', 'B2', 'G2', 'E2'];

/** A model that says exactly what the test tells it to, in order. */
function scriptedModel(turns: Array<Partial<Anthropic.Message>>): Transport & { seen: CompletionRequest[] } {
  let index = 0;
  const seen: CompletionRequest[] = [];
  return {
    seen,
    async complete(request) {
      seen.push(request);
      const turn = turns[index++];
      if (!turn) throw new Error(`The model was asked ${index} times but only ${turns.length} turns were scripted`);
      return {
        id: `msg_${index}`, type: 'message', role: 'assistant',
        model: 'claude-opus-5', content: [], stop_reason: 'end_turn',
        stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 },
        ...turn,
      } as Anthropic.Message;
    },
  };
}

const says = (text: string): Partial<Anthropic.Message> => ({
  content: [{ type: 'text', text, citations: null }] as Anthropic.ContentBlock[],
  stop_reason: 'end_turn',
});

const calls = (name: string, input: Record<string, unknown> = {}): Partial<Anthropic.Message> => ({
  content: [{ type: 'tool_use', id: `tu_${name}`, name, input }] as Anthropic.ContentBlock[],
  stop_reason: 'tool_use',
});

function setup(notes = seq(RIFF, 400)) {
  const workspace = new ConversationWorkspace();
  workspace.open(notes, 'phr_test');
  const library = new RiffLibrary();
  const played: Array<{ notes: string[]; label: string }> = [];
  const context: ToolContext = {
    workspace,
    library,
    onPlay: (toPlay, label) => played.push({ notes: toPlay.map((n) => midiToName(n.midi)), label }),
  };
  return { workspace, library, context, played };
}

const parse = (json: string) => JSON.parse(json) as Record<string, unknown>;

describe('the tools the conversation can reach', () => {
  test('looking at a phrase reports what the app actually knows', async () => {
    const { context } = setup();
    const result = parse(await runTool('look_at_phrase', {}, context));
    assert.deepEqual(result.notes, RIFF);
    assert.equal(result.scale, 'E minor pentatonic');
    assert.equal(result.home_note, 'E');
    assert.equal(result.ends_by_moving, 'down');
    assert.ok(String(result.tab).includes('E |'));
    assert.equal(result.has_been_edited, false);
  });

  test('explanations come back plain first, theory separately', async () => {
    const { context } = setup();
    const result = parse(await runTool('explain_phrase', { about: 'mood' }, context));
    const plain = (result.plain_language as string[]).join(' ');
    assert.match(plain, /\bG\b/);
    assert.match(plain, /3rd fret/);
    assert.ok(!/minor third/i.test(plain), 'theory must not be in the plain half');
    assert.match((result.theory_terms as string[]).join(' '), /minor third/i);
  });

  test('changing one note edits the working phrase and keeps the original', async () => {
    const { context, workspace } = setup();
    const result = parse(await runTool('change_note', { position: -1, to: 'G2', why: 'leaves it unresolved' }, context));
    assert.equal(result.changed, true);
    assert.deepEqual(result.phrase_now, ['E2', 'G2', 'A2', 'B2', 'G2', 'G2']);
    assert.deepEqual(workspace.originalNotes.map((n) => midiToName(n.midi)), RIFF);
  });

  test('a position that does not exist is an error, not a silent no-op', async () => {
    const { context } = setup();
    assert.match(String(parse(await runTool('change_note', { position: 99, to: 'G2', why: 'x' }, context)).error), /no note 99 — this phrase has 6/);
    assert.match(String(parse(await runTool('change_note', { position: 0, to: 'G2', why: 'x' }, context)).error), /whole number/);
  });

  test('it will not put a note somewhere the guitar cannot reach', async () => {
    const { context } = setup();
    assert.match(String(parse(await runTool('change_note', { position: 1, to: 'C0', why: 'x' }, context)).error), /outside the range/);
    assert.match(String(parse(await runTool('extend_phrase', { notes: ['A0'], why: 'x' }, context)).error), /outside the range/);
    assert.match(String(parse(await runTool('transpose_phrase', { semitones: -40 }, context)).error), /off the neck/);
  });

  test('extending adds notes after the phrase, not on top of it', async () => {
    const { context, workspace } = setup();
    const result = parse(await runTool('extend_phrase', { notes: ['G2', 'E2'], why: 'walks it home' }, context));
    assert.deepEqual(result.phrase_now, [...RIFF, 'G2', 'E2']);
    const notes = workspace.notes;
    for (let i = 1; i < notes.length; i++) assert.ok(notes[i]!.startMs > notes[i - 1]!.startMs);
  });

  test('it will not let the model write a whole new riff through extend', async () => {
    const { context } = setup();
    const tooMany = ['E2', 'G2', 'A2', 'B2', 'D3', 'E3', 'G3', 'A3', 'B3'];
    assert.match(String(parse(await runTool('extend_phrase', { notes: tooMany, why: 'x' }, context)).error), /at most eight/);
  });

  test('endings are offered as options, never ranked', async () => {
    const { context } = setup();
    const result = parse(await runTool('suggest_endings', {}, context));
    const endings = result.endings as Array<{ kind: string }>;
    assert.deepEqual(endings.map((e) => e.kind), ['resolved', 'unresolved', 'darker']);
    assert.match(String(result.reminder), /player's call/);
  });

  test('comparing tells the truth about what changed', async () => {
    const { context } = setup();
    let result = parse(await runTool('compare_with_original', {}, context));
    assert.equal(result.unchanged, true);

    await runTool('change_note', { position: -1, to: 'G2', why: 'darker' }, context);
    result = parse(await runTool('compare_with_original', {}, context));
    assert.equal(result.unchanged, false);
    assert.match(String(result.summary), /G2/);
  });

  test('undo steps back, and undo-all returns what they played', async () => {
    const { context, workspace } = setup();
    await runTool('change_note', { position: -1, to: 'G2', why: 'a' }, context);
    await runTool('change_note', { position: 1, to: 'G2', why: 'b' }, context);
    assert.deepEqual(parse(await runTool('undo_change', {}, context)).phrase_now, ['E2', 'G2', 'A2', 'B2', 'G2', 'G2']);
    await runTool('undo_change', { all: true }, context);
    assert.deepEqual(workspace.notes.map((n) => midiToName(n.midi)), RIFF);
  });

  test('saving creates a riff, and saving onto one adds a version', async () => {
    const { context, library } = setup();
    const saved = parse(await runTool('save_phrase', { name: 'Late Night Thing' }, context));
    assert.equal(saved.saved, true);
    assert.equal(saved.name, 'Late Night Thing');

    await runTool('change_note', { position: -1, to: 'G2', why: 'darker' }, context);
    const version = parse(await runTool('save_phrase', { onto_riff_id: saved.riff_id, comment: 'darker ending' }, context));
    assert.equal(version.as, 'Version B');

    const riff = await library.getRiff(String(saved.riff_id));
    assert.equal(riff!.versions.length, 2);
    assert.deepEqual(riff!.versions[0]!.notes.map((n) => midiToName(n.midi)), RIFF, 'Version A must be untouched');
  });

  test('playing hands the notes to the speakers, not to the model', async () => {
    const { context, played } = setup();
    await runTool('change_note', { position: -1, to: 'G2', why: 'x' }, context);
    await runTool('play_phrase', { which: 'original' }, context);
    await runTool('play_phrase', { which: 'working' }, context);
    assert.deepEqual(played[0]!.notes, RIFF);
    assert.deepEqual(played[1]!.notes, ['E2', 'G2', 'A2', 'B2', 'G2', 'G2']);
  });

  test('an unknown tool fails rather than doing something surprising', async () => {
    const { context } = setup();
    assert.match(String(parse(await runTool('delete_everything', {}, context)).error), /no tool called/);
  });

  test('with nothing played, tools say so instead of inventing a phrase', async () => {
    const workspace = new ConversationWorkspace();
    const context: ToolContext = { workspace, library: new RiffLibrary() };
    assert.match(String(parse(await runTool('look_at_phrase', {}, context)).error), /needs to play something/);
  });
});

describe('the conversation loop', () => {
  test('answers without tools when no tool is needed', async () => {
    const { context } = setup();
    const transport = scriptedModel([says('Play me something and I will tell you what it was.')]);
    const turn = await new Conversation({ transport, tools: context }).ask('hello');
    assert.match(turn.text, /Play me something/);
    assert.deepEqual(turn.toolsUsed, []);
  });

  test('runs the vision\'s exchange end to end', async () => {
    const { context, workspace } = setup();
    const transport = scriptedModel([
      calls('look_at_phrase'),
      calls('change_note', { position: -1, to: 'G2', why: 'the ending stops feeling settled' }),
      calls('compare_with_original'),
      says('Try changing that final E to a G. Want to keep this as a new version?'),
    ]);

    const turn = await new Conversation({ transport, tools: context }).ask('make that darker');
    assert.deepEqual(turn.toolsUsed, ['look_at_phrase', 'change_note', 'compare_with_original']);
    assert.match(turn.text, /final E to a G/);
    assert.deepEqual(workspace.notes.map((n) => midiToName(n.midi)), ['E2', 'G2', 'A2', 'B2', 'G2', 'G2']);
    assert.deepEqual(workspace.originalNotes.map((n) => midiToName(n.midi)), RIFF, 'their own phrase survives');
  });

  test('a failed tool comes back flagged as an error', async () => {
    const { context } = setup();
    const transport = scriptedModel([
      calls('change_note', { position: 99, to: 'G2', why: 'x' }),
      says('That phrase only has six notes.'),
    ]);
    await new Conversation({ transport, tools: context }).ask('change the 99th note');

    const followUp = transport.seen[1]!;
    const results = followUp.messages[followUp.messages.length - 1]!.content as Anthropic.ToolResultBlockParam[];
    assert.equal(results[0]!.is_error, true, 'or the model will narrate the failure as a success');
  });

  test('all results for one turn go back in a single message', async () => {
    const { context } = setup();
    const transport = scriptedModel([
      {
        content: [
          { type: 'tool_use', id: 'a', name: 'look_at_phrase', input: {} },
          { type: 'tool_use', id: 'b', name: 'suggest_chords', input: {} },
        ] as Anthropic.ContentBlock[],
        stop_reason: 'tool_use',
      },
      says('E minor sits underneath it.'),
    ]);
    await new Conversation({ transport, tools: context }).ask('what chord goes under this?');

    const followUp = transport.seen[1]!;
    const last = followUp.messages[followUp.messages.length - 1]!;
    assert.equal((last.content as unknown[]).length, 2, 'splitting results trains the model out of parallel calls');
  });

  test('stops rather than looping forever', async () => {
    const { context } = setup();
    const transport = scriptedModel(new Array(12).fill(calls('look_at_phrase')));
    const turn = await new Conversation({ transport, tools: context, maxToolRounds: 3 }).ask('go');
    assert.equal(turn.stopReason, 'tool_limit');
    assert.ok(turn.toolsUsed.length <= 4);
  });

  test('says something useful when the model declines', async () => {
    const { context } = setup();
    const transport = scriptedModel([{ content: [], stop_reason: 'refusal' }]);
    const turn = await new Conversation({ transport, tools: context }).ask('something out of bounds');
    assert.equal(turn.stopReason, 'refusal');
    assert.ok(turn.text.length > 0, 'an empty bubble is not an answer');
  });

  test('keeps the transcript so follow-ups have context', async () => {
    const { context } = setup();
    const transport = scriptedModel([says('It is centred on E.'), says('Yes, still E.')]);
    const conversation = new Conversation({ transport, tools: context });
    await conversation.ask('what key is this?');
    await conversation.ask('are you sure?');

    assert.equal(transport.seen[1]!.messages.length, 3);
    assert.equal(transport.seen[1]!.messages[0]!.role, 'user');
    assert.equal(transport.seen[1]!.messages[1]!.role, 'assistant');
  });

  test('sends the model the right request shape', async () => {
    const { context } = setup();
    const transport = scriptedModel([says('ok')]);
    await new Conversation({ transport, tools: context }).ask('hi');
    const request = transport.seen[0]!;
    assert.equal(request.model, 'claude-opus-5');
    assert.equal(request.system, SYSTEM_PROMPT);
    assert.equal(request.tools.length, TOOL_DEFINITIONS.length);
    assert.ok(request.max_tokens >= 1024);
  });
});

describe('the instructions the model is given', () => {
  test('state the product philosophy rather than assuming it', () => {
    assert.match(SYSTEM_PROMPT, /own playing is the curriculum/i);
    assert.match(SYSTEM_PROMPT, /Plain language first/i);
    assert.match(SYSTEM_PROMPT, /Offer, never prescribe/i);
    assert.match(SYSTEM_PROMPT, /never invent music/i);
    assert.match(SYSTEM_PROMPT, /Only save when they ask/i);
  });

  test('every tool tells the model what it is for', () => {
    for (const tool of TOOL_DEFINITIONS) {
      assert.ok(tool.description.length > 40, `${tool.name} needs a real description`);
      assert.equal(tool.input_schema.additionalProperties, false, `${tool.name} should reject stray fields`);
      for (const required of tool.input_schema.required ?? []) {
        assert.ok(required in tool.input_schema.properties, `${tool.name} requires undeclared "${required}"`);
      }
    }
  });
});
