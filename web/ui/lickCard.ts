/**
 * One lick, ready to play.
 *
 * Tab, because a lick is a shape under the hand and prose cannot carry that.
 * The sound, because you have to hear it before you will bother learning it.
 * And what makes it work, because the point is not to collect licks — it is
 * to steal the idea inside one and use it on your own lines.
 */

import type { Lick } from '../../src/music/licks.ts';
import { lickToEvents } from '../../src/music/licks.ts';
import { inferFingering, renderTab } from '../../src/music/fretboard.ts';
import type { Tuning } from '../../src/music/fretboard.ts';
import type { RiffPlayer } from '../audio/playback.ts';
import { pcToName } from '../../src/music/notes.ts';
import { h } from './dom.ts';
import { button, tabBlock } from './render.ts';

const TRADITION: Record<Lick['tradition'], string> = {
  bluegrass: 'Bluegrass',
  blues: 'Blues',
  rock: 'Rock',
  country: 'Country',
  folk: 'Folk',
};

export interface LickCardOptions {
  tuning: Tuning;
  player: RiffPlayer;
  bpm?: number;
  /** Called when the player wants to keep it. Omit to hide the button. */
  onKeep?: (lick: Lick) => void;
}

export function lickCard(lick: Lick, options: LickCardOptions): HTMLElement {
  const events = lickToEvents(lick, options.bpm ?? 96);
  const positions = inferFingering(events.map((event) => event.midi), {
    tuning: options.tuning,
    maxFret: 12,
  });

  return h('article', { class: 'lick-card' },
    h('header', { class: 'lick-head' },
      h('h4', { text: lick.name }),
      h('span', { class: 'lick-tag', text: `${TRADITION[lick.tradition]} · in ${pcToName(lick.tonicPc)} · ${'●'.repeat(lick.difficulty)}` }),
    ),
    h('p', { class: 'lick-use', text: lick.useWhen }),
    tabBlock(renderTab(positions, options.tuning)),
    h('p', { class: 'lick-why' }, h('strong', { text: 'Why it works: ' }), h('span', { text: lick.why })),
    h('div', { class: 'row-actions' },
      button('Hear it', () => { void options.player.play(events); }, 'btn-primary'),
      button('Half speed', () => { void options.player.play(events, { speed: 0.5 }); }, 'btn-quiet'),
      options.onKeep
        ? button('Keep it', () => options.onKeep!(lick), 'btn-quiet')
        : h('span'),
    ),
  );
}
