/**
 * Teaching a scale, rather than pointing at one.
 *
 * Scales used to hand the player off to Riff Lab, which is a sandbox: it shows
 * you the notes and leaves you to it. That is fine once you can already make
 * something up, and useless before — which is the point in learning where
 * people actually are when they finish their first few chords and ask "and
 * then what?".
 *
 * So this is the missing middle. The shape under the hand, what every note in
 * it is doing, real phrases built out of it that can be played today, and a
 * way to change one of them into something of your own. The last step is the
 * whole product: a player who has never invented a riff needs one handed to
 * them before the sketchbook has anything to remember.
 */

import type { Skill } from '../../src/curriculum/skills.ts';
import type { Lesson } from '../../src/curriculum/plan.ts';
import type { Exercise } from '../../src/curriculum/exercise.ts';
import { buildExercise } from '../../src/curriculum/exercise.ts';
import { inventRiff, riffToEvents, varyRiff } from '../../src/curriculum/riffs.ts';
import type { Riff } from '../../src/curriculum/riffs.ts';
import {
  degreeRole, rootPositionFret, scaleBox, scaleById, scaleRun, SCALES,
} from '../../src/music/scales.ts';
import type { Scale } from '../../src/music/scales.ts';
import { pcToName } from '../../src/music/notes.ts';
import { inferFingering, renderTab } from '../../src/music/fretboard.ts';
import { h, replace } from '../ui/dom.ts';
import { button, scaleDiagram, tabBlock } from '../ui/render.ts';
import type { AppContext } from './context.ts';

/** Match a curriculum skill's scale to one this module knows how to teach. */
export function scaleForSkill(skill: Skill): Scale | null {
  if (!skill.scale) return null;
  const byName = SCALES.find((s) => s.name === skill.scale!.name);
  return byName ?? scaleById(skill.scale.name);
}

function riffCard(
  context: AppContext,
  riff: Riff,
  scale: Scale,
  tonicPc: number,
  lowMidi: number,
  onReplace: (next: Riff) => void,
): HTMLElement {
  const events = riffToEvents(riff);
  const positions = inferFingering(events.map((e) => e.midi), { tuning: context.session.tuning, maxFret: 12 });

  return h('article', { class: 'riff-card' },
    h('h4', { text: riff.name }),
    h('p', { class: 'muted', text: riff.idea }),
    tabBlock(renderTab(positions, context.session.tuning)),

    h('ul', { class: 'note-roles' }, ...riff.notes.map((note) => h('li', {},
      h('span', { class: 'pitch', text: note.name.replace(/\d/g, '') }),
      h('span', { class: 'why', text: note.role }),
    ))),

    h('ul', { class: 'riff-why' }, ...riff.why.map((line) => h('li', { text: line }))),

    h('div', { class: 'practice-actions' },
      button('Hear it', () => { void context.player.play(events); }, 'btn-primary'),
      button('Slowly', () => { void context.player.play(events, { speed: 0.6 }); }, 'btn-quiet'),
      button('Change one thing', () => {
        onReplace(varyRiff(riff, scale, tonicPc, lowMidi, Date.now() % 100_000));
      }, 'btn-quiet'),
      button('A different riff', () => {
        onReplace(inventRiff(scale, tonicPc, lowMidi, Date.now() % 100_000));
      }, 'btn-quiet'),
      button('Keep this one', () => {
        void context.library
          .saveRiff(events, { comment: `${pcToName(tonicPc)} ${scale.name} · ${riff.idea}` })
          .then(() => context.say('Saved to My Riffs. It is yours now — play it, change it, come back to it.'))
          .catch(() => context.say('Could not save that one.', 'error'));
      }, 'btn-quiet'),
    ),
  );
}

export interface ScaleLessonHandlers {
  /** Start the listening drill for this scale. */
  practice: (exercise: Exercise, scalePcs: number[]) => void;
}

export function scaleLessonCard(
  context: AppContext,
  lesson: Lesson,
  handlers: ScaleLessonHandlers,
): HTMLElement | null {
  const skill = lesson.skill;
  const scale = scaleForSkill(skill);
  if (!scale || !skill.scale) return null;

  const tonicPc = skill.scale.tonicPc;
  const tuning = context.session.tuning;
  const startFret = rootPositionFret(tonicPc, tuning);
  const box = scaleBox(tonicPc, scale, tuning, startFret);
  const run = scaleRun(tonicPc, scale, tuning, startFret);
  const lowMidi = Math.min(...box.positions.map((p) => p.midi));
  const scalePcs = scale.degrees.map((d) => (tonicPc + d) % 12);

  const runEvents = run.map((position, i) => ({
    midi: position.midi,
    startMs: i * 340,
    durationMs: 300,
    confidence: 1,
    velocity: 0.6,
  }));

  // The roles are listed once per scale degree, lowest first, because that is
  // the order a player meets them going up the shape.
  const riffHost = h('div', { class: 'riff-host' });
  const showRiff = (riff: Riff): void => {
    replace(riffHost, riffCard(context, riff, scale, tonicPc, lowMidi, showRiff));
  };
  showRiff(inventRiff(scale, tonicPc, lowMidi, tonicPc * 7919 + 13));

  return h('article', { class: `lesson-card scale-lesson is-${lesson.reason}` },
    h('header', { class: 'lesson-head' },
      h('h3', { text: skill.name }),
      h('span', { class: 'badge', text: 'shape, notes, riffs' }),
    ),
    h('p', { class: 'lesson-because', text: lesson.because }),
    h('p', { class: 'lesson-goal', text: skill.goal }),
    h('p', { text: scale.sound }),

    h('h4', { text: 'The shape' }),
    scaleDiagram(box, tuning),
    h('p', { class: 'muted', text: 'Filled circles are home — the note the whole shape is named after. Start there and end there and it will sound right.' }),

    h('h4', { text: 'What each note does' }),
    h('ul', { class: 'note-roles' }, ...scale.degrees.map((degree) => h('li', {},
      h('span', { class: 'pitch', text: pcToName((tonicPc + degree) % 12) }),
      h('span', { class: 'why', text: `${degreeRole(degree).short} — ${degreeRole(degree).role}` }),
    ))),

    h('div', { class: 'practice-actions' },
      button('Hear the shape', () => { void context.player.play(runEvents); }, 'btn-primary'),
      button('Slowly', () => { void context.player.play(runEvents, { speed: 0.6 }); }, 'btn-quiet'),
      button('Play it with me', () => {
        handlers.practice(buildExercise(skill), scalePcs);
      }, 'btn-primary'),
    ),

    h('h4', { text: 'Now make something out of it' }),
    h('p', { class: 'muted', text: 'These are built from the five notes above, so they cannot sound wrong. Play one, then change something and see if you like yours better.' }),
    riffHost,

    h('details', { class: 'theory' },
      h('summary', { text: 'Why this is worth your time' }),
      h('p', { text: skill.why }),
    ),
  );
}
