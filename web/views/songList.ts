/**
 * The front door: what to play right now.
 *
 * Not a catalogue. A catalogue shows eighty songs and lets you fail at most of
 * them, and a beginner cannot tell which failures are their fault. This shows
 * the songs your chords already cover, then the ones you are a single chord
 * away from — because "learn C and these four songs open up" is a reason a
 * person can feel, and "C comes next in the list" is not.
 */

import { masteryMap } from '../../src/curriculum/mastery.ts';
import { CurriculumStore } from '../../src/curriculum/watch.ts';
import { almostThere, chordThatUnlocksMost, playableNow } from '../../src/songs/arrange.ts';
import type { Readiness } from '../../src/songs/arrange.ts';
import { chordsIn } from '../../src/songs/library.ts';
import { h, clear } from '../ui/dom.ts';
import { button } from '../ui/render.ts';
import type { AppContext, View } from './context.ts';

function storage() {
  try {
    window.localStorage.setItem('__probe__', '1');
    window.localStorage.removeItem('__probe__');
    return window.localStorage;
  } catch {
    const memory = new Map<string, string>();
    return { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => { memory.set(k, v); } };
  }
}

const HARDNESS = ['', 'Easy', 'Getting there', 'A real tune'];

export function songListView(context: AppContext): View {
  const element = h('div', { class: 'view view-songs' });

  function songRow(readiness: Readiness, locked: boolean): HTMLElement {
    const song = readiness.song;
    const row = h('button', {
      class: `song-row${locked ? ' is-locked' : ''}`,
      type: 'button',
      onClick: () => context.navigate('song', { song: song.id }),
    },
      h('span', { class: 'song-row-main' },
        h('span', { class: 'song-row-title', text: song.title }),
        h('span', { class: 'song-row-sub', text: locked
          ? `One chord away — needs ${readiness.missing.join(' and ')}`
          : `${song.key} · ${chordsIn(song).join(' ')}` }),
      ),
      h('span', { class: 'song-row-tag', text: HARDNESS[song.difficulty] ?? '' }),
    );
    return row;
  }

  function render(): void {
    clear(element);
    const mastery = masteryMap(new CurriculumStore(storage()).load());
    const ready = playableNow(mastery);
    const close = almostThere(mastery);
    const unlock = chordThatUnlocksMost(mastery);

    element.appendChild(h('header', { class: 'view-head' },
      h('h2', { text: 'Songs' }),
      h('p', { class: 'muted', text: 'Traditional tunes, playable at whatever level your hands are at today. Nothing is locked — the simplest version is still the real song.' }),
    ));

    if (ready.length === 0) {
      element.appendChild(h('section', { class: 'panel' },
        h('p', { text: 'Tell me which chords you already have and I will show you what you can play.' }),
        button('Set that up', () => context.navigate('lessons'), 'btn-primary'),
      ));
    } else {
      element.appendChild(h('section', { class: 'panel' },
        h('h4', { text: `You can play ${ready.length === 1 ? 'this' : `these ${ready.length}`} now` }),
        h('div', { class: 'song-list' }, ...ready.map((r) => songRow(r, false))),
      ));
    }

    if (unlock) {
      element.appendChild(h('section', { class: 'panel unlock-card' },
        h('h4', { text: 'One chord from here' }),
        h('p', {},
          h('strong', { text: `Learn ${unlock.chord}` }),
          h('span', { text: ` and ${unlock.unlocks.length === 1 ? 'this opens up' : `these ${unlock.unlocks.length} open up`}: ${unlock.unlocks.map((s) => s.title).join(', ')}.` }),
        ),
        button(`Teach me ${unlock.chord}`, () => context.navigate('lessons'), 'btn-primary'),
      ));
    }

    if (close.length) {
      element.appendChild(h('section', { class: 'panel' },
        h('h4', { text: 'Almost there' }),
        h('div', { class: 'song-list' }, ...close.map((r) => songRow(r, true))),
      ));
    }
  }

  render();
  return { element, update: render };
}
