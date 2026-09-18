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
import { chordShape } from '../../src/music/chordShapes.ts';
import { describeRepertoire, mostValuableNextChord, repertoireFor } from '../../src/curriculum/repertoire.ts';
import { h, clear } from '../ui/dom.ts';
import { button, empty } from '../ui/render.ts';
import { chordTeachingCard } from '../ui/chordCard.ts';
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
      h('h2', { text: 'Before we start — what can you already put your fingers on?' }),
      h('p', { class: 'muted', text: 'Tap a chord only if you know where your fingers go without looking it up. It does not need to sound perfect. If you only recognize the name, leave it off — I will teach it before I ever test you on it.' }),
      grid,
      h('div', { class: 'practice-actions' },
        button('That is me', () => {
          store.record(declareKnownChords([...chosen]));
          context.say(chosen.size
            ? `Good — ${chosen.size} chord${chosen.size === 1 ? '' : 's'} to build on.`
            : 'No problem. We can start from the beginning and build this properly.');
          render();
        }, 'btn-primary'),
        button('I am starting from nothing', () => {
          store.record(declareKnownChords([]));
          render();
        }, 'btn-quiet'),
      ),
    );
  }

  function todayLessonCard(lesson: ReturnType<typeof planLessons>[number], payoff: string | null): HTMLElement {
    const chord = lesson.skill.chord;
    if (lesson.skill.kind === 'chord' && chord && chordShape(chord)) {
      const card = chordTeachingCard(chord, context.player, {
        heading: `Today: ${lesson.skill.name}`,
        onReady: () => context.navigate('lessons'),
      });
      const why = h('div', { class: 'teach-first-callout' },
        h('strong', { text: 'Why this is next' }),
        h('span', { text: payoff ?? lesson.because }),
      );
      const actions = card.querySelector('.chord-sound-actions');
      if (actions) card.insertBefore(why, actions);
      return card;
    }

    return h('section', { class: 'panel panel-hero' },
      h('p', { class: 'eyebrow', text: 'Today' }),
      h('div', {},
        h('h2', { text: lesson.skill.name }),
        h('p', { class: 'lede', text: lesson.skill.goal }),
        h('p', { class: 'muted', text: payoff ?? lesson.because }),
        h('div', { class: 'practice-actions' },
          button('Start this', () => context.navigate('lessons'), 'btn-primary'),
          button('Just let me play', () => context.navigate('session'), 'btn-quiet'),
        ),
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

    // The one thing to do now. A new chord is taught physically before there is
    // any button that can grade it. "Next" and "known" are not the same state.
    if (lesson) element.appendChild(todayLessonCard(lesson, payoff));
    else {
      element.appendChild(h('section', { class: 'panel panel-hero' },
        h('p', { class: 'eyebrow', text: 'Today' }),
        h('h2', { text: 'Play something' }),
        h('p', { class: 'lede', text: 'Nothing is queued. Play for a few minutes and I will find the next thing worth working on.' }),
        h('div', { class: 'practice-actions' }, button('Start playing', () => context.navigate('session'), 'btn-primary')),
      ));
    }

    element.appendChild(h('div', { class: 'teacher-rule' },
      h('strong', { text: 'Teacher rule: ' }),
      'I do not get to say “play this” until I have shown you where your fingers go, what strings to hit, and what it should sound like.',
    ));

    // What those chords are already enough for.
    const playable = repertoireFor(known);
    const repertoire = h('section', { class: 'panel' },
      h('h2', { text: 'What you can already play' }),
      h('p', { class: 'lede', text: describeRepertoire(known) }),
      known.length
        ? h('div', { class: 'known-skill-strip' }, ...known.map((chord) => h('span', { class: 'badge', text: chord })))
        : null,
    );

    if (playable.length === 0) {
      repertoire.appendChild(empty('Once you have a few chords that fit together, whole songs open up. I will teach the shapes before expecting the progression.'));
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
          button('Play it with me', () => {
            context.navigate('lessons', { progression: entry.template.id, key: entry.key });
          }, 'btn-quiet'),
        )),
      ));

      const next = mostValuableNextChord(known);
      if (next && next.chord !== lesson?.skill.chord) {
        const departure = h('div', { class: 'departure next-chord-preview' },
          h('h3', { text: `${next.chord} would unlock more music next` }),
          h('p', { text: `It would add ${next.unlocks} more progressions. That does not mean you are supposed to know it already.` }),
        );
        const shape = chordShape(next.chord);
        if (shape) {
          const details = h('details', { class: 'theory' }, h('summary', { text: `Show me how to play ${next.chord}` }));
          details.appendChild(chordTeachingCard(next.chord, context.player, { compact: true }));
          departure.appendChild(details);
        }
        repertoire.appendChild(departure);
      }
    }
    element.appendChild(repertoire);

    element.appendChild(h('section', { class: 'panel' },
      h('h2', { text: 'Or do your own thing' }),
      h('div', { class: 'today-links' },
        button('Play and be listened to', () => context.navigate('session'), 'btn-quiet'),
        button('Songs', () => context.navigate('songs'), 'btn-quiet'),
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
