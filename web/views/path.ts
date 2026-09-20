/**
 * The course, on screen.
 *
 * The rule this screen exists to enforce: never ask the player a question
 * before you have taught them something. Every other screen in this app used
 * to open by asking what they already knew, which is a reasonable question to
 * ask a guitarist and a useless one to ask a beginner — and a beginner is who
 * opens a learn-the-guitar app.
 *
 * So the whole course is here from the first second, numbered, including the
 * parts that are months away. Seeing that minor pentatonic is step fourteen is
 * what makes step one worth doing.
 */

import { PATH, loadProgress, saveDone } from '../../src/curriculum/path.ts';
import { JOURNEY_STAGES, journeyStatus, stageForStep } from '../../src/coach/journey.ts';
import { chooseTeacherLesson } from '../../src/coach/teacher.ts';
import {
  PlacementStore, effectiveProgress, evidenceForPlacement, placementStepIds,
} from '../../src/coach/placement.ts';
import { WORKABLE, levelOf, masteryMap } from '../../src/curriculum/mastery.ts';
import { CurriculumStore } from '../../src/curriculum/watch.ts';
import type { PathStep } from '../../src/curriculum/path.ts';
import { chordShape, chordShapeMidis } from '../../src/music/chordShapes.ts';
import { chordDiagram } from '../ui/chordCard.ts';
import { SCALES, rootPositionFret, scaleBox, scaleRun } from '../../src/music/scales.ts';
import { degreeRole } from '../../src/music/scales.ts';
import { pcToName } from '../../src/music/notes.ts';
import { h, clear } from '../ui/dom.ts';
import { button, scaleDiagram } from '../ui/render.ts';
import type { AppContext, View } from './context.ts';

function storage() {
  try {
    window.localStorage.setItem('__probe__', '1');
    window.localStorage.removeItem('__probe__');
    return window.localStorage;
  } catch {
    const memory = new Map<string, string>();
    return {
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => { memory.set(k, v); },
      removeItem: (k: string) => { memory.delete(k); },
    };
  }
}

const KIND_LABEL: Record<PathStep['kind'], string> = {
  know: 'Know this',
  chord: 'Chord',
  technique: 'Technique',
  scale: 'Scale',
  song: 'Song',
  create: 'Make something',
};

export function pathView(context: AppContext): View {
  const store = storage();
  const element = h('div', { class: 'view view-path' });

  /**
   * Show the shape, and let them hear it.
   *
   * A step that says "your first chord is E minor" and then describes it in
   * five sentences of prose is asking a beginner to build a picture in their
   * head from words. That is the hardest possible way to learn a shape, and it
   * is what made this course read as basic — the app already knew how to draw
   * every one of these and was not doing it.
   */
  function chordBlock(chord: string): HTMLElement {
    const shape = chordShape(chord);
    if (!shape) return h('span');
    const midis = chordShapeMidis(shape);
    const strum = midis.map((midi, i) => ({
      midi, startMs: i * 55, durationMs: 1800, confidence: 1, velocity: 0.55,
    }));
    return h('div', { class: 'step-shape' },
      h('span', { class: 'step-shape-name', text: chord }),
      chordDiagram(chord),
      h('div', { class: 'row-actions' },
        button('Hear it', () => { void context.player.play(strum); }, 'btn-quiet'),
        button('One string at a time', () => {
          void context.player.play(midis.map((midi, i) => ({
            midi, startMs: i * 650, durationMs: 600, confidence: 1, velocity: 0.55,
          })));
        }, 'btn-quiet'),
      ),
    );
  }

  function scaleBlock(tonicPc: number, scaleId: string): HTMLElement {
    const scale = SCALES.find((item) => item.id === scaleId);
    if (!scale) return h('span');
    const tuning = context.session.tuning;
    const startFret = rootPositionFret(tonicPc, tuning);
    const box = scaleBox(tonicPc, scale, tuning, startFret);
    const run = scaleRun(tonicPc, scale, tuning, startFret).map((position, i) => ({
      midi: position.midi, startMs: i * 330, durationMs: 300, confidence: 1, velocity: 0.6,
    }));
    return h('div', { class: 'step-shape' },
      h('span', { class: 'step-shape-name', text: `${pcToName(tonicPc)} ${scale.name}` }),
      scaleDiagram(box, tuning),
      h('ul', { class: 'note-roles' }, ...scale.degrees.map((degree) => h('li', {},
        h('span', { class: 'pitch', text: pcToName((tonicPc + degree) % 12) }),
        h('span', { class: 'why', text: degreeRole(degree).role }),
      ))),
      h('div', { class: 'row-actions' },
        button('Hear it', () => { void context.player.play(run); }, 'btn-quiet'),
        button('Slowly', () => { void context.player.play(run, { speed: 0.55 }); }, 'btn-quiet'),
      ),
    );
  }

  function stepCard(step: PathStep, index: number, state: 'done' | 'placed' | 'verified' | 'current' | 'ahead'): HTMLElement {
    const number = h('span', { class: 'step-number', text: String(index + 1) });
    const head = h('button', {
      class: 'step-head', type: 'button',
      onClick: () => {
        const card = head.closest('.step-card');
        card?.classList.toggle('is-open');
      },
    },
      number,
      h('span', { class: 'step-head-text' },
        h('span', { class: 'step-title', text: step.title }),
        h('span', { class: 'step-kind', text: KIND_LABEL[step.kind] }),
        state === 'placed' ? h('span', { class:'step-placement', text:'From your starting point · not verified yet' }) : null,
        state === 'verified' ? h('span', { class:'step-placement is-verified', text:'Verified from your playing' }) : null,
      ),
    );

    const shapes = h('div', { class: 'step-shapes' });
    for (const chord of step.chords ?? (step.chord ? [step.chord] : [])) {
      shapes.appendChild(chordBlock(chord));
    }
    if (step.scale) shapes.appendChild(scaleBlock(step.scale.tonicPc, step.scale.scaleId));

    const body = h('div', { class: 'step-body' },
      h('p', { class: 'step-outcome', text: step.outcome }),
      shapes,

      h('h4', { text: 'Do this' }),
      h('ol', { class: 'step-steps' }, ...step.steps.map((line) => h('li', { text: line }))),

      h('div', { class: 'step-check' },
        h('strong', { text: 'You have got it when: ' }),
        h('span', { text: step.check }),
      ),

      step.watchFor
        ? h('div', { class: 'step-watch' },
            h('strong', { text: 'Most common mistake: ' }),
            h('span', { text: step.watchFor }),
          )
        : h('span'),

      h('p', { class: 'muted step-expect' }, h('strong', { text: 'How long: ' }), h('span', { text: step.expect })),

      h('details', { class: 'theory' },
        h('summary', { text: 'Why this is worth your time' }),
        h('p', { text: step.why }),
      ),

      h('div', { class: 'practice-actions' },
        step.practice
          ? button(step.practice.label, () => {
              context.navigate(step.practice!.view, step.practice!.params ?? {});
            }, 'btn-primary')
          : h('span'),
        button(state === 'done' ? 'Not done after all' : state === 'placed' || state === 'verified' ? 'Confirm this lesson' : 'I can do this', () => {
          const progress = loadProgress(store);
          if (progress.done.has(step.id)) progress.done.delete(step.id);
          else progress.done.add(step.id);
          saveDone(store, progress.done);
          render();
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 'btn-quiet'),
      ),
    );

    const card = h('article', { class: `step-card is-${state}${state === 'current' ? ' is-open' : ''}` }, head, body);
    return card;
  }

  function render(): void {
    clear(element);
    const placement = new PlacementStore(store).load();
    const rawProgress = loadProgress(store);
    const progress = effectiveProgress(rawProgress, placement);
    const observations = new CurriculumStore(store).load();
    const mastery = masteryMap(evidenceForPlacement(observations, placement));
    const placed = placementStepIds(placement, new Set(observations.map((item) => item.skillId)));
    const choice = chooseTeacherLesson(progress, mastery);
    const currentStep = choice.step;
    const currentIndex = choice.index;

    const status = journeyStatus(rawProgress, currentStep);
    element.append(
      h('header', { class: 'view-head' },
        h('p', { class: 'eyebrow', text: 'YOUR GUITAR ROADMAP' }),
        h('h2', { text: status.stage.name }),
        h('p', { text: status.stage.promise }),
        h('p', { class: 'muted', text: `Lesson ${status.lessonNumber} of ${status.totalLessons} · ${status.stageCompleted} of ${status.stageTotal} finished in this stage.` }),
      ),
      h('div', { class: 'roadmap-stages' },
        ...JOURNEY_STAGES.map((stage, index) => {
          const complete = PATH
            .filter((item) => stageForStep(item).id === stage.id)
            .every((item) => rawProgress.done.has(item.id));
          return h('div', {
            class: `roadmap-stage${complete ? ' is-done' : index === status.stageIndex ? ' is-current' : ''}`,
          },
            h('span', { text: complete ? '✓' : String(index + 1) }),
            h('div', {}, h('strong', { text: stage.name }), h('small', { text: stage.promise })),
          );
        }),
      ),
      h('section', { class: 'panel roadmap-now' },
        h('p', { class: 'eyebrow', text: 'RIGHT NOW' }),
        h('h3', { text: currentStep.title }),
        h('p', { text: currentStep.outcome }),
        button('Let Coach teach this', () => context.navigate('session'), 'btn-primary'),
      ),
    );

    const roadmap = h('details', { class: 'panel course-roadmap' },
      h('summary', { text: 'See every lesson in the journey' }),
      h('p', { class: 'muted', text: 'This is a map, not a menu. Coach still decides what you should do next.' }),
    );
    for (const stage of JOURNEY_STAGES) {
      const group = h('section', { class: `roadmap-group${stage.id === status.stage.id ? ' is-current' : ''}` },
        h('header', {}, h('strong', { text:stage.name }), h('span', { class:'muted', text:stage.promise })),
      );
      const list = h('div', { class: 'step-list' });
      PATH.forEach((step, index) => {
        if (stageForStep(step).id !== stage.id) return;
        if (step.id === currentStep.id) return;
        const verified = step.kind === 'chord'
          && step.chord
          && levelOf(mastery, `chord.${step.chord}`) >= WORKABLE;
        const state = rawProgress.done.has(step.id)
          ? 'done'
          : placed.has(step.id)
            ? 'placed'
            : verified
              ? 'verified'
              : 'ahead';
        list.appendChild(stepCard(step, index, state));
      });
      group.appendChild(list);
      roadmap.appendChild(group);
    }
    roadmap.append(
      h('div', { class: 'practice-actions' },
        button('Start the course over', () => {
          if (!window.confirm('Start the course over from lesson 1? This resets lesson progress and your starting point. It does not delete saved riffs.')) return;
          new PlacementStore(store).save({
            experience:'new', knownChords:[], knownSteps:[], completedAt:Date.now(),
          });
          saveDone(store, new Set());
          render();
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 'btn-quiet'),
      ),
    );
    element.appendChild(roadmap);

    element.appendChild(h('section', { class: 'panel' },
      h('strong', { text: 'What the app will and will not pretend to know' }),
      h('p', { class: 'muted', text: 'It can hear notes, chord guesses, note sequences and chord changes. It can guide rhythm with a click. It cannot reliably see your wrist, pick angle or finger pressure through a microphone, so those lessons use concrete physical checks instead of fake scores.' }),
    ));
  }

  render();
  return { element, update: render };
}
