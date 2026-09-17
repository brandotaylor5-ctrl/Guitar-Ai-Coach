/**
 * Today — one clear thing to do, and proof you can already play more than you
 * think.
 *
 * The app had six tabs and no front door, which left a player who had just
 * opened it with a choice to make before they had played a note. A teacher
 * does not do that. They say: here is what we are doing today, and here is
 * what you can already play. So that is what this is.
 */

import { CurriculumStore, declareKnownChords } from '../../src/curriculum/watch.ts';
import { masteryMap, levelOf, WORKABLE } from '../../src/curriculum/mastery.ts';
import { planLessons } from '../../src/curriculum/plan.ts';
import { SKILLS } from '../../src/curriculum/skills.ts';
import { describeRepertoire, mostValuableNextChord, repertoireFor } from '../../src/curriculum/repertoire.ts';
import { h, clear } from '../ui/dom.ts';
import { button, empty } from '../ui/render.ts';
import type { AppContext, View } from './context.ts';

/** The chords worth asking about — the ones a self-taught player tends to have. */
const ASKABLE = ['E', 'Em', 'A', 'Am', 'D', 'Dm', 'G', 'C', 'F'];

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

export function todayView(context: AppContext): View {
  const store = new CurriculumStore(storage());
  const element = h('div', { class: 'view view-today' });

  /** Chords the app believes the player has, from anything it has learned. */
  function knownChords(): string[] {
    const mastery = masteryMap(store.load());
    return SKILLS
      .filter((s) => s.kind === 'chord' && s.chord && levelOf(mastery, s.id) >= WORKABLE)
      .map((s) => s.chord!);
  }

  function setupCard(): HTMLElement {
    const chosen = new Set<string>();
    const grid = h('div', { class: 'chord-picker' },
      ...ASKABLE.map((chord) => {
        const control = h('button', {
          class: 'chord-pick', type: 'button', text: chord,
          onClick: () => {
            if (chosen.has(chord)) chosen.delete(chord);
            else chosen.add(chord);
            control.classList.toggle('is-on', chosen.has(chord));
          },
        });
        return control;
      }),
    );

    return h('section', { class: 'panel panel-hero' },
      h('h2', { text: 'Before we start — what can you already play?' }),
      h('p', { class: 'muted', text: 'Tap any chord you can get through without stopping. Rough is fine. This just saves me waiting to overhear them, and you can change it later by playing.' }),
      grid,
      h('div', { class: 'practice-actions' },
        button('That is me', () => {
          store.record(declareKnownChords([...chosen]));
          context.say(chosen.size
            ? `Good — ${chosen.size} chord${chosen.size === 1 ? '' : 's'} to build on.`
            : 'No problem. Play anything and I will work it out.');
          render();
        }, 'btn-primary'),
        button('I am starting from nothing', () => {
          store.record(declareKnownChords([]));
          render();
        }, 'btn-quiet'),
      ),
    );
  }

  function render(): void {
    clear(element);
    const observations = store.load();

    // First run: ask, rather than guess or stall.
    if (observations.length === 0) {
      element.appendChild(setupCard());
      return;
    }

    const mastery = masteryMap(observations);
    const known = knownChords();
    // Prefer the lesson the repertoire recommends, so the two halves of this
    // screen never contradict each other. Falls back to the graph's own
    // ordering when there is no chord that would unlock anything.
    const worthMost = mostValuableNextChord(known);
    const plan = planLessons(mastery, { count: 6 });
    const lesson = plan.find((l) => l.skill.chord && l.skill.chord === worthMost?.chord) ?? plan[0];
    const payoff = lesson && worthMost && lesson.skill.chord === worthMost.chord
      ? `Learning it adds ${worthMost.unlocks} more progressions you can play — more than any other chord from where you are.`
      : null;

    // The one thing to do now.
    element.appendChild(h('section', { class: 'panel panel-hero' },
      h('p', { class: 'eyebrow', text: 'Today' }),
      lesson
        ? h('div', {},
          h('h2', { text: lesson.skill.name }),
          h('p', { class: 'lede', text: lesson.skill.goal }),
          h('p', { class: 'muted', text: payoff ?? lesson.because }),
          h('div', { class: 'practice-actions' },
            button('Start this', () => context.navigate('lessons'), 'btn-primary'),
            button('Just let me play', () => context.navigate('session'), 'btn-quiet'),
          ),
        )
        : h('div', {},
          h('h2', { text: 'Play something' }),
          h('p', { class: 'lede', text: 'Nothing is queued. Play for a few minutes and I will find the next thing worth working on.' }),
          h('div', { class: 'practice-actions' }, button('Start playing', () => context.navigate('session'), 'btn-primary')),
        ),
    ));

    // What those chords are already enough for.
    const playable = repertoireFor(known);
    const repertoire = h('section', { class: 'panel' },
      h('h2', { text: 'What you can already play' }),
      h('p', { class: 'lede', text: describeRepertoire(known) }),
    );

    if (playable.length === 0) {
      repertoire.appendChild(empty('Once you have three chords that fit together, whole songs open up. That is closer than it sounds.'));
    } else {
      repertoire.appendChild(h('div', { class: 'prog-list' },
        ...playable.slice(0, 6).map((entry) => h('article', { class: 'prog-card' },
          h('header', { class: 'prog-head' },
            h('h3', { text: entry.template.name }),
            h('span', { class: 'badge', text: `in ${entry.key}` }),
          ),
          h('p', { class: 'prog-chords', text: entry.chords.join('  →  ') }),
          h('p', { class: 'muted', text: entry.template.character }),
          h('details', { class: 'theory' },
            h('summary', { text: 'Why this one matters' }),
            h('p', { text: entry.template.note }),
          ),
          button('Play it with me', async () => {
            context.say(`${entry.chords.join(' → ')} — one bar each, round and round.`);
            context.navigate('lessons');
          }, 'btn-quiet'),
        )),
      ));

      const next = mostValuableNextChord(known);
      if (next) {
        repertoire.appendChild(h('div', { class: 'departure' },
          h('h3', { text: `The chord worth learning next is ${next.chord}` }),
          h('p', { text: `It would add ${next.unlocks} more progressions to what you can play — more than any other single chord from where you are.` }),
        ));
      }
    }
    element.appendChild(repertoire);

    element.appendChild(h('section', { class: 'panel' },
      h('h2', { text: 'Or do your own thing' }),
      h('div', { class: 'today-links' },
        button('Play and be listened to', () => context.navigate('session'), 'btn-quiet'),
        button('Riff Lab', () => context.navigate('lab'), 'btn-quiet'),
        button('My riffs', () => context.navigate('library'), 'btn-quiet'),
        button('Start over', () => {
          if (!window.confirm('Forget everything I have learned about your playing and ask again?')) return;
          try { window.localStorage.removeItem('guitar-ai-coach.curriculum.v1'); } catch { /* nothing to clear */ }
          render();
        }, 'btn-quiet'),
      ),
    ));
  }

  render();
  return { element, update: render };
}
