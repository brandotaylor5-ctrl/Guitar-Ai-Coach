/**
 * The answer to "what did I just play?"
 *
 * This is the screen the whole product exists for, so it leads with the notes
 * and the takes — not with analysis. Theory, suggestions and everything else
 * sit underneath, available but never in the way.
 */

import type { Recall, RecallTake } from '../../src/session/session.ts';
import { describeAgo } from '../../src/session/session.ts';
import { explainMood, explainPhrase } from '../../src/explain/explain.ts';
import { suggestAnswer, suggestChords, suggestEndings } from '../../src/create/suggest.ts';
import type { Suggestion } from '../../src/create/suggest.ts';
import { h, relativeTime } from '../ui/dom.ts';
import {
  analysisFacts, button, explanationBlock, fretboardDiagram, highlightNote, noteRow, tabBlock,
} from '../ui/render.ts';
import type { AppContext } from './context.ts';

function playable(context: AppContext, notes: Parameters<AppContext['player']['play']>[0], label = 'Play'): HTMLElement {
  const row = noteRow(notes);
  const control = button(label, async () => {
    await context.player.play(notes, {
      onNote: (index) => highlightNote(row, index),
      onEnd: () => highlightNote(row, null),
    });
  }, 'btn-play');
  return h('div', { class: 'playable' }, control, row);
}

function takeCard(context: AppContext, take: RecallTake, index: number, recall: Recall): HTMLElement {
  const ordinals = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];
  const card = h('article', { class: `take${take.isCleanest ? ' is-cleanest' : ''}` },
    h('header', { class: 'take-head' },
      h('h4', { text: `The ${ordinals[index] ?? `${index + 1}th`} version` }),
      take.isCleanest ? h('span', { class: 'badge', text: 'cleanest' }) : null,
      h('span', { class: 'take-when', text: describeAgo(take.secondsAgo) }),
    ),
    playable(context, take.phrase.notes),
  );

  if (take.diffFromFirst && !take.diffFromFirst.identical) {
    card.appendChild(h('p', { class: 'take-diff', text: take.diffFromFirst.summary }));
  }

  card.appendChild(h('div', { class: 'take-actions' },
    button('Save as riff', async () => {
      const riff = await context.session.saveRiff(take.phrase);
      await context.keepClipFor(riff.versions[0]!.audioRef);
      context.say(`Saved as a new riff — ${take.phrase.notes.length} notes, Version A.`);
      context.navigate('library', { riff: riff.id });
    }),
    button('Add to a riff…', async () => {
      const riffs = await context.library.listRiffs();
      if (riffs.length === 0) {
        context.say('There are no riffs yet to add this to. Save it as a new one first.');
        return;
      }
      const choice = window.prompt(
        `Add this take as a new version of which riff?\n\n${
          riffs.map((r, i) => `${i + 1}. ${r.name ?? 'unnamed'}`).join('\n')}`,
        '1',
      );
      const picked = riffs[Number(choice) - 1];
      if (!picked) return;
      const version = await context.session.saveAsVersion(picked.id, take.phrase);
      await context.keepClipFor(version.audioRef);
      context.say(`Added as ${version.label} of ${picked.name ?? 'that riff'}.`);
      context.navigate('library', { riff: picked.id });
    }, 'btn-quiet'),
  ));

  if (recall.takes.length > 1 && index > 0) {
    card.appendChild(h('details', { class: 'compare' },
      h('summary', { text: 'Compare with the first take' }),
      playable(context, recall.takes[0]!.phrase.notes, 'Play first'),
      playable(context, take.phrase.notes, 'Play this'),
    ));
  }

  return card;
}

function suggestionCard(context: AppContext, suggestion: Suggestion, hearLabel: string): HTMLElement {
  return h('article', { class: 'suggestion' },
    h('h4', { text: suggestion.label }),
    playable(context, suggestion.notes, hearLabel),
    h('p', { class: 'muted', text: suggestion.description }),
    button('Hear it on the end of the riff', async () => {
      await context.player.play(suggestion.full);
    }, 'btn-quiet'),
    // Auditioning is only half of it. If one of these is the one, it has to be
    // possible to keep it — as the player's own riff, not the app's suggestion.
    button('Keep this one', async () => {
      const riff = await context.library.saveRiff(suggestion.full, {
        comment: `your phrase with the ${suggestion.label.toLowerCase()} ending`,
      });
      context.say('Kept as a riff of your own. The original is untouched.');
      context.navigate('library', { riff: riff.id });
    }, 'btn-quiet'),
  );
}

export function recallPanel(context: AppContext, recall: Recall): HTMLElement {
  const { analysis } = recall;

  const panel = h('section', { class: 'panel recall' },
    h('h2', { text: 'What you just played' }),
    h('p', { class: 'lede', text: `This is the phrase from ${describeAgo(recall.secondsAgo)}.` }),
    playable(context, recall.phrase.notes, 'Play it back'),
  );

  if (recall.matches.length) {
    const match = recall.matches[0]!;
    panel.appendChild(h('p', { class: 'recognised' },
      `You played something very close to `,
      h('strong', { text: match.riffName ?? 'a riff you saved' }),
      ` ${relativeTime(match.createdAt)} — ${Math.round(match.similarity * 100)}% the same idea.`,
    ));
  }

  if (recall.takes.length > 1) {
    panel.appendChild(h('p', { class: 'lede', text: `You played a variation of it ${recall.takes.length} times.` }));
  }

  panel.appendChild(h('div', { class: 'takes' },
    ...recall.takes.map((take, index) => takeCard(context, take, index, recall)),
  ));

  panel.appendChild(h('details', { class: 'section', open: true },
    h('summary', { text: 'Where your fingers probably went' }),
    fretboardDiagram(analysis.positions, context.session.tuning),
    tabBlock(analysis.tab),
  ));

  panel.appendChild(h('details', { class: 'section', open: true },
    h('summary', { text: 'What this actually is' }),
    analysisFacts(analysis),
    explanationBlock(explainPhrase(analysis, context.session.tuning)),
  ));

  panel.appendChild(h('details', { class: 'section' },
    h('summary', { text: 'Why does this sound the way it does?' }),
    explanationBlock(explainMood(analysis, context.session.tuning)),
  ));

  const endings = suggestEndings(analysis, { tuning: context.session.tuning });
  if (endings.length) {
    panel.appendChild(h('details', { class: 'section' },
      h('summary', { text: 'Three ways to finish this' }),
      h('p', { class: 'muted', text: 'None of these is the right one. Listen and see which you like.' }),
      h('div', { class: 'suggestions' }, ...endings.map((e) => suggestionCard(context, e, 'Hear the ending'))),
    ));
  }

  const answer = suggestAnswer(analysis, { tuning: context.session.tuning });
  const chords = suggestChords(analysis);
  if (answer || chords.length) {
    const more = h('details', { class: 'section' }, h('summary', { text: 'Ideas that go with this' }));
    if (answer) {
      more.appendChild(h('h4', { text: 'A phrase that answers it' }));
      more.appendChild(h('div', { class: 'suggestions' },
        suggestionCard(context, answer, 'Hear the answer')));
    }
    if (chords.length) {
      more.appendChild(h('h4', { text: 'Chords that could sit underneath' }));
      more.appendChild(h('ul', { class: 'chords' },
        ...chords.map((chord) => h('li', {},
          h('strong', { text: chord.label }), ' — ', chord.description,
        )),
      ));
    }
    panel.appendChild(more);
  }

  return panel;
}
