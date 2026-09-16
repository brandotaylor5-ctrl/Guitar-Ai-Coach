/**
 * A small, local conversation layer for the current riff.
 *
 * This deliberately does not need an API key or an LLM. It routes the common
 * things a guitarist actually asks to the musical operations that already
 * exist in the app. The player's phrase remains the source material.
 */

import type { PhraseAnalysis } from '../../src/types.ts';
import { explainMood, explainPhrase } from '../../src/explain/explain.ts';
import { pcToName } from '../../src/music/notes.ts';
import { suggestAnswer, suggestChords, suggestEndings } from '../../src/create/suggest.ts';
import type { Suggestion } from '../../src/create/suggest.ts';
import { h } from '../ui/dom.ts';
import {
  button, explanationBlock, fretboardDiagram, highlightNote, noteRow, tabBlock,
} from '../ui/render.ts';
import type { AppContext } from './context.ts';

function playable(context: AppContext, suggestion: Suggestion): HTMLElement {
  const row = noteRow(suggestion.notes);
  return h('div', { class: 'playable' },
    button('Hear it', async () => {
      await context.player.play(suggestion.notes, {
        onNote: (index) => highlightNote(row, index),
        onEnd: () => highlightNote(row, null),
      });
    }, 'btn-play'),
    row,
  );
}

function suggestionCard(context: AppContext, suggestion: Suggestion): HTMLElement {
  return h('article', { class: 'suggestion riff-chat-suggestion' },
    h('h4', { text: suggestion.label }),
    playable(context, suggestion),
    h('p', { class: 'muted', text: suggestion.description }),
    button('Hear it on my riff', async () => { await context.player.play(suggestion.full); }, 'btn-quiet'),
    button('Keep this version', async () => {
      const riff = await context.library.saveRiff(suggestion.full, {
        comment: `your phrase with the ${suggestion.label.toLowerCase()} idea`,
      });
      context.say('Kept it as a new riff. Your original phrase is untouched.');
      context.navigate('library', { riff: riff.id });
    }, 'btn-quiet'),
  );
}

function turn(who: 'you' | 'coach', ...children: (Node | string)[]): HTMLElement {
  return h('div', { class: `riff-chat-turn is-${who}` },
    h('strong', { text: who === 'you' ? 'You' : 'Coach' }),
    h('div', { class: 'riff-chat-body' }, ...children),
  );
}

function scaleAnswer(analysis: PhraseAnalysis): string {
  if (analysis.scale.confidence >= 0.6) {
    return `This fits ${analysis.scale.label}. Your ear keeps treating ${pcToName(analysis.homePc)} like home.`;
  }
  if (analysis.scale.confidence >= 0.35) {
    return `This leans toward ${analysis.scale.label}, but I would not pretend it is certain from this phrase alone. ${pcToName(analysis.homePc)} is still acting like home.`;
  }
  return `There is not enough information in this phrase to name a scale confidently yet. ${pcToName(analysis.homePc)} is the note you keep treating like home.`;
}

export function riffConversation(context: AppContext, analysis: PhraseAnalysis): HTMLElement {
  const history = h('div', { class: 'riff-chat-history', 'aria-live': 'polite' },
    turn('coach', 'Ask me about this riff. I can use what you actually played — no API key needed.'),
  );
  const input = h('input', {
    class: 'riff-chat-input', type: 'text', autocomplete: 'off',
    placeholder: 'Try “make the ending darker” or “what chord goes under this?”',
    'aria-label': 'Ask about this riff',
  }) as HTMLInputElement;
  const send = button('Ask', () => { void submit(); }, 'btn-primary') as HTMLButtonElement;

  async function answer(raw: string): Promise<void> {
    const q = raw.toLowerCase().replace(/[^a-z0-9\s']/g, ' ').replace(/\s+/g, ' ').trim();

    if (/\bsave\b|\bkeep that\b|\bkeep this\b/.test(q)) {
      const riff = await context.session.saveRiff(analysis.phrase);
      await context.keepClipFor(riff.versions[0]!.audioRef);
      history.appendChild(turn('coach', 'Saved it as a riff. I kept the detected notes and the recording when the browser had it.'));
      return;
    }

    if (/\b(play|hear)\b.*\b(back|riff|it|this)\b|\bplay it\b/.test(q)) {
      await context.player.play(analysis.phrase.notes);
      history.appendChild(turn('coach', 'Played it back exactly from the notes I heard.'));
      return;
    }

    if (/\b(tab|tablature)\b/.test(q)) {
      history.appendChild(turn('coach', 'Here is the probable tab:', tabBlock(analysis.tab)));
      return;
    }

    if (/\b(finger|fingers|fret|fretboard|where.*play)\b/.test(q)) {
      history.appendChild(turn('coach', 'These are the most likely places your fingers went:', fretboardDiagram(analysis.positions, context.session.tuning)));
      return;
    }

    if (/\b(chord|chords|underneath|under this)\b/.test(q)) {
      const chords = suggestChords(analysis);
      if (!chords.length) {
        history.appendChild(turn('coach', 'I do not have enough notes to suggest a chord honestly yet.'));
        return;
      }
      history.appendChild(turn('coach',
        'These fit what you already played. They are options, not a ranking:',
        h('ul', { class: 'chords' }, ...chords.map((chord) => h('li', {},
          h('strong', { text: chord.label }), ` — ${chord.description}`,
        ))),
      ));
      return;
    }

    if (/\b(answer|reply|respond)\b/.test(q)) {
      const suggestion = suggestAnswer(analysis, { tuning: context.session.tuning });
      history.appendChild(suggestion
        ? turn('coach', 'Here is a phrase shaped like a reply to yours:', suggestionCard(context, suggestion))
        : turn('coach', 'This phrase is too short for me to make an answering idea without guessing.'));
      return;
    }

    if (/\b(finish|ending|end it|darker|resolved|unresolved)\b/.test(q)) {
      let endings = suggestEndings(analysis, { tuning: context.session.tuning });
      if (/\bdark|darker\b/.test(q)) endings = endings.filter((item) => item.kind === 'darker');
      else if (/\bunresolved\b/.test(q)) endings = endings.filter((item) => item.kind === 'unresolved');
      else if (/\bresolved\b/.test(q)) endings = endings.filter((item) => item.kind === 'resolved');
      history.appendChild(endings.length
        ? turn('coach',
          endings.length === 1 ? 'Try this change:' : 'Here are a few different directions. None is the “right” one:',
          h('div', { class: 'suggestions' }, ...endings.map((item) => suggestionCard(context, item))),
        )
        : turn('coach', 'I need a little more of the phrase before I can make a useful ending.'));
      return;
    }

    if (/\b(scale|key)\b/.test(q)) {
      history.appendChild(turn('coach', scaleAnswer(analysis)));
      return;
    }

    if (/\bwhy\b.*\b(sad|dark|moody|feel|sound)\b|\bwhy does this\b/.test(q)) {
      history.appendChild(turn('coach', explanationBlock(explainMood(analysis, context.session.tuning))));
      return;
    }

    if (/\b(what is this|explain|theory|what did i play|what.*playing|notes)\b/.test(q)) {
      history.appendChild(turn('coach',
        noteRow(analysis.phrase.notes),
        explanationBlock(explainPhrase(analysis, context.session.tuning)),
      ));
      return;
    }

    if (/\bblues|bluesy\b/.test(q)) {
      history.appendChild(turn('coach',
        'I do not want to fake a “bluesy” rewrite by throwing random notes into your riff. Right now I can make the ending darker, give you an answering phrase, or show chords that already fit what you played.',
      ));
      return;
    }

    history.appendChild(turn('coach',
      'I did not quite map that yet. Try asking: “why does this sound sad?”, “what scale is this?”, “show me the tab”, “what chord goes under this?”, “make the ending darker”, “give me three endings”, “play it back”, or “save this”.',
    ));
  }

  async function submit(): Promise<void> {
    const raw = input.value.trim();
    if (!raw) return;
    input.value = '';
    history.appendChild(turn('you', raw));
    input.disabled = true;
    send.disabled = true;
    try {
      await answer(raw);
      history.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (error) {
      history.appendChild(turn('coach', `I hit a problem doing that: ${(error as Error).message}`));
    } finally {
      input.disabled = false;
      send.disabled = false;
      input.focus();
    }
  }

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); void submit(); }
  });

  const examples = [
    'Why does this sound sad?',
    'Make the ending darker',
    'What chord goes under this?',
    'Show me the tab',
  ];

  return h('details', { class: 'section riff-conversation', open: true },
    h('summary', { text: 'Ask this riff' }),
    h('p', { class: 'muted', text: 'Talk to the idea you just played. Common questions run locally on your device.' }),
    h('div', { class: 'riff-chat-examples' },
      ...examples.map((example) => button(example, () => { input.value = example; void submit(); }, 'btn-quiet')),
    ),
    history,
    h('div', { class: 'riff-chat-compose' }, input, send),
  );
}
