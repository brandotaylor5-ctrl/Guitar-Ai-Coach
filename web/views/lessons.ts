/**
 * The lesson screen — a teacher choosing one thing and then sitting with you
 * while you do it.
 *
 * A beginner must never be tested on a physical shape they have not first
 * been shown. New chord lessons therefore have two distinct states:
 * teach the hand, then listen to the attempt.
 */

import type { ChordDetection } from '../audio/chordDetect.ts';
import type { Lesson } from '../../src/curriculum/plan.ts';
import { describeProgress, planLessons, progressOf } from '../../src/curriculum/plan.ts';
import { masteryMap } from '../../src/curriculum/mastery.ts';
import { CurriculumStore } from '../../src/curriculum/watch.ts';
import {
  buildExercise, exerciseFromProgression, gradeChangeDrill, gradeHoldChord,
  gradeProgression, observationFrom,
} from '../../src/curriculum/exercise.ts';
import { repertoireFor } from '../../src/curriculum/repertoire.ts';
import { SKILLS } from '../../src/curriculum/skills.ts';
import { chordShape } from '../../src/music/chordShapes.ts';
import { levelOf, WORKABLE } from '../../src/curriculum/mastery.ts';
import type { Exercise, Grade, HeardChord } from '../../src/curriculum/exercise.ts';
import { audioContext, unlockAudio } from '../audio/context.ts';
import { chordTeachingCard } from '../ui/chordCard.ts';
import { h, clear, replace } from '../ui/dom.ts';
import { button, empty } from '../ui/render.ts';
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

export function lessonsView(context: AppContext, params: Record<string, string> = {}): View {
  const store = new CurriculumStore(storage());
  const element = h('div', { class: 'view view-lessons' });
  const drillHost = h('div', { class: 'drill-host' });

  let running: {
    exercise: Exercise;
    startedAt: number;
    heard: HeardChord[];
    feed?: HTMLElement;
    stop: () => void;
  } | null = null;

  function lessonCard(lesson: Lesson): HTMLElement {
    const skill = lesson.skill;

    if (skill.kind === 'chord' && skill.chord && chordShape(skill.chord)) {
      const card = chordTeachingCard(skill.chord, context.player, {
        heading: skill.name,
        onReady: () => { void startLesson(lesson); },
      });
      card.classList.add(`is-${lesson.reason}`);
      const head = card.querySelector('.chord-teach-head');
      if (head) head.appendChild(h('span', { class: 'badge', text: lesson.reason.replace('-', ' ') }));
      const why = h('div', { class: 'teach-first-callout' },
        h('strong', { text: 'Why I picked this' }),
        h('span', { text: lesson.because }),
      );
      const actions = card.querySelector('.chord-sound-actions');
      if (actions) card.insertBefore(why, actions);
      return card;
    }

    if (skill.kind === 'chord' && skill.chord) {
      return h('article', { class: `lesson-card is-${lesson.reason}` },
        h('header', { class: 'lesson-head' }, h('h3', { text: skill.name }), h('span', { class: 'badge', text: 'not ready to teach' })),
        h('p', { class: 'new-skill-warning', text: `I have not built a safe finger map for ${skill.name} yet, so I am not going to ask you to play it.` }),
      );
    }

    // Scale practice needs note-by-note listening, not the chord grader. Riff
    // Lab already owns that loop, so scale lessons go there deliberately.
    if (skill.kind === 'scale' && skill.scale) {
      const mode = skill.scale.name.toLowerCase().includes('minor') ? 'minor' : 'major';
      return h('article', { class: `lesson-card is-${lesson.reason}` },
        h('header', { class: 'lesson-head' }, h('h3', { text: skill.name }), h('span', { class: 'badge', text: 'riff + scale lesson' })),
        h('p', { class: 'lesson-because', text: lesson.because }),
        h('p', { class: 'lesson-goal', text: skill.goal }),
        h('p', { class: 'muted', text: 'I will show the fretboard, play the notes, give you small riffs made from the scale, then listen to your attempt.' }),
        button('Open this in Riff Lab', () => context.navigate('lab', { root: String(skill.scale!.tonicPc), mode }), 'btn-primary'),
      );
    }

    // Do not fake-score techniques that the current detector cannot honestly
    // measure yet. Let Live Coach observe while the learner practises instead.
    if (skill.kind === 'technique') {
      return h('article', { class: `lesson-card is-${lesson.reason}` },
        h('header', { class: 'lesson-head' }, h('h3', { text: skill.name }), h('span', { class: 'badge', text: 'guided practice' })),
        h('p', { class: 'lesson-because', text: lesson.because }),
        h('p', { class: 'lesson-goal', text: skill.goal }),
        h('details', { class: 'theory' }, h('summary', { text: 'Why this is worth your time' }), h('p', { text: skill.why })),
        h('p', { class: 'muted', text: 'I can listen while you work on this, but I will not give you a fake pass/fail score for something I cannot measure reliably yet.' }),
        button('Practice it with Live Coach', () => context.navigate('session'), 'btn-primary'),
      );
    }

    return h('article', { class: `lesson-card is-${lesson.reason}` },
      h('header', { class: 'lesson-head' }, h('h3', { text: skill.name }), h('span', { class: 'badge', text: lesson.reason.replace('-', ' ') })),
      h('p', { class: 'lesson-because', text: lesson.because }),
      h('p', { class: 'lesson-goal', text: skill.goal }),
      h('details', { class: 'theory' }, h('summary', { text: 'Why this is worth your time' }), h('p', { text: skill.why })),
      button('Work on this', () => { void startLesson(lesson); }, 'btn-primary'),
    );
  }

  async function startLesson(lesson: Lesson): Promise<void> {
    await startDrill(buildExercise(lesson.skill), () => { void startLesson(lesson); });
  }

  function knownChords(): string[] {
    const mastery = masteryMap(store.load());
    return SKILLS.filter((s) => s.kind === 'chord' && s.chord && levelOf(mastery, s.id) >= WORKABLE).map((s) => s.chord!);
  }

  function startRequestedProgression(): boolean {
    const wanted = params.progression;
    const key = params.key;
    if (!wanted || !key) return false;
    const entry = repertoireFor(knownChords()).find((p) => p.template.id === wanted && p.key === key);
    if (!entry) return false;
    const run = () => { void startDrill(exerciseFromProgression(entry.template.id, entry.template.name, entry.key, entry.chords), run); };
    run();
    return true;
  }

  async function startDrill(exercise: Exercise, again: () => void): Promise<void> {
    stopDrill();
    replace(drillHost, h('section', { class: 'panel drill' }, h('h3', { text: exercise.title }), h('p', { class: 'lede', text: 'Getting the microphone ready…' })));
    drillHost.scrollIntoView({ behavior: 'smooth', block: 'start' });

    if (!context.listening) {
      context.say('Turning on the microphone so I can hear this attempt.');
      await context.startListening();
    }
    if (!context.listening) {
      replace(drillHost, h('section', { class: 'panel drill' },
        h('h3', { text: exercise.title }),
        h('p', { class: 'lede', text: 'I still cannot hear the guitar.' }),
        h('p', { class: 'muted', text: 'Allow microphone access, then try the drill again. Nothing was scored.' }),
        button('Try again', again, 'btn-primary'),
      ));
      return;
    }

    const heard: HeardChord[] = [];
    const barLabel = h('div', { class: 'drill-bar', text: exercise.chords?.[0] ?? '—' });
    const nextLabel = h('div', { class: 'drill-next muted', text: '' });
    const countLabel = h('div', { class: 'drill-count', text: 'Get ready' });
    const heardFeed = h('div', { class: 'drill-heard' });
    const resultHost = h('div', { class: 'drill-result' });

    const reminderChord = exercise.kind === 'hold-chord' ? exercise.chords?.[0] : undefined;
    const reminder = reminderChord && chordShape(reminderChord)
      ? h('details', { class: 'theory drill-shape-reminder' }, h('summary', { text: 'Need the finger shape again?' }), chordTeachingCard(reminderChord, context.player, { compact: true }))
      : null;

    const beatMs = 60_000 / exercise.bpm;
    const barMs = beatMs * 4;
    let beat = 0;
    let startedAt = 0;
    let finished = false;
    let countIn = 4;
    const ctx = audioContext();
    const click = (strong: boolean) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = strong ? 1600 : 1000;
      gain.gain.setValueAtTime(strong ? 0.25 : 0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.05);
      osc.connect(gain); gain.connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + 0.06);
    };

    await unlockAudio();
    let tick = 0;
    const stopAudio = () => { if (tick) window.clearInterval(tick); tick = 0; };

    function showStoppedBeforeStart(): void {
      replace(resultHost,
        h('div', { class: 'coaching' }, h('p', { text: 'Stopped before the count-in finished. Nothing was scored.' })),
        h('div', { class: 'practice-actions' }, button('Again', again, 'btn-primary'), button('Back to lessons', () => { stopDrill(); render(); }, 'btn-quiet')),
      );
      running = null;
      countLabel.textContent = 'Stopped';
    }

    function finish(): void {
      if (finished) return;
      finished = true;
      stopAudio();
      if (startedAt === 0) { showStoppedBeforeStart(); return; }

      const elapsed = Math.max(1, Date.now() - startedAt);
      const grade: Grade = exercise.kind === 'play-progression'
        ? gradeProgression(exercise, heard, startedAt)
        : exercise.kind === 'change-drill'
          ? gradeChangeDrill(exercise, heard, elapsed)
          : gradeHoldChord(exercise, heard, elapsed);

      store.record([observationFrom(exercise, grade)]);
      const actions = h('div', { class: 'practice-actions' });
      if (grade.passed) {
        actions.append(
          button('Show me what this unlocked', () => {
            stopDrill();
            render();
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 'btn-primary'),
          button('Do it again', again, 'btn-quiet'),
          button('Make music with it', () => context.navigate('lab'), 'btn-quiet'),
        );
      } else {
        actions.append(button('Try it again', again, 'btn-primary'), button('Back to lessons', () => { stopDrill(); render(); }, 'btn-quiet'));
      }

      replace(resultHost,
        h('div', { class: `coaching${grade.passed ? ' is-nailed' : ''}` },
          ...grade.feedback.map((line) => h('p', { text: line })),
          grade.passed ? h('p', { class: 'muted', text: 'Good. That is enough to build on. You can keep learning now and let repetition turn it into mastery over time.' }) : null,
        ),
        actions,
      );
      running = null;
      countLabel.textContent = 'Done';
    }

    running = { exercise, startedAt: 0, heard, feed: heardFeed, stop: () => { stopAudio(); running = null; } };

    replace(drillHost, h('section', { class: 'panel drill' },
      h('p', { class: 'eyebrow', text: 'NOW I LISTEN' }),
      h('h3', { text: exercise.title }),
      h('p', { class: 'lede', text: exercise.instructions }),
      h('p', { class: 'muted', text: `Target: ${exercise.target}` }),
      reminder,
      h('div', { class: 'drill-stage' }, countLabel, barLabel, nextLabel),
      heardFeed,
      h('div', { class: 'practice-actions' }, button('Stop', finish, 'btn-quiet')),
      resultHost,
    ));

    tick = window.setInterval(() => {
      if (countIn > 0) {
        click(countIn === 4);
        countLabel.textContent = `${countIn}`;
        countIn--;
        if (countIn === 0) {
          startedAt = Date.now();
          if (running) running.startedAt = startedAt;
          countLabel.textContent = 'Go';
          if (exercise.chords?.length) {
            barLabel.textContent = exercise.chords[0]!;
            nextLabel.textContent = exercise.chords.length > 1 ? `next: ${exercise.chords[1]}` : '';
          }
        }
        return;
      }
      click(beat % 4 === 0);
      const elapsed = Date.now() - startedAt;
      if (exercise.chords?.length) {
        const index = Math.floor(elapsed / barMs) % exercise.chords.length;
        barLabel.textContent = exercise.chords[index]!;
        nextLabel.textContent = exercise.chords.length > 1 ? `next: ${exercise.chords[(index + 1) % exercise.chords.length]}` : '';
      }
      beat++;
      if (elapsed >= exercise.durationMs) finish();
    }, beatMs);
  }

  function stopDrill(): void { running?.stop(); running = null; clear(drillHost); }

  function onChord(chord: ChordDetection): void {
    if (!running || running.startedAt === 0) return;
    running.heard.push({ label: chord.label.replace('♯', '#'), at: Date.now() });
    const feed = running.feed;
    if (feed) {
      feed.appendChild(h('span', { class: 'chip', text: chord.label }));
      while (feed.children.length > 16) feed.firstElementChild?.remove();
    }
  }

  function render(): void {
    const mastery = masteryMap(store.load());
    const progress = progressOf(mastery);
    const lessons = planLessons(mastery, { count: 6 });

    clear(element);
    element.appendChild(h('section', { class: 'panel' },
      h('h2', { text: 'Where you are' }),
      h('p', { class: 'lede', text: describeProgress(mastery) }),
      h('div', { class: 'progress-bar' }, h('span', { class: 'progress-fill', style: `width:${Math.round(progress.fraction * 100)}%` })),
      h('p', { class: 'muted', text: `${progress.mastered} solid · ${progress.inProgress} under way · ${progress.total} in the whole course` }),
      h('p', { class: 'muted', text: 'Passing one lesson unlocks the next useful branches immediately. Mastery comes from returning to things over time, not being trapped on one card.' }),
    ));

    element.appendChild(h('div', { class: 'learn-sequence', 'aria-label': 'How a new skill is learned' },
      h('span', { class: 'is-current', text: '1 · See it' }), h('span', { text: '2 · Hear it' }), h('span', { text: '3 · Try it' }), h('span', { text: '4 · Use it' }),
    ));

    element.appendChild(h('section', { class: 'panel' },
      h('h2', { text: 'What I would work on next' }),
      h('p', { class: 'muted', text: 'The first few are the most useful from what I know about your playing. You are also allowed to wander — guitar is not a checklist.' }),
      lessons.length === 0
        ? h('div', {}, empty('Nothing is queued from the curriculum right now — that should not leave you stranded.'),
          h('div', { class: 'practice-actions' },
            button('Explore Riff Lab', () => context.navigate('lab'), 'btn-primary'),
            button('Create a song idea', () => context.navigate('songs'), 'btn-quiet'),
            button('Just play and let me listen', () => context.navigate('session'), 'btn-quiet'),
          ))
        : h('div', { class: 'lesson-list' }, ...lessons.map(lessonCard)),
    ));

    element.appendChild(drillHost);
  }

  render();
  startRequestedProgression();

  return { element, onChord, update: () => { if (!running) render(); }, dispose: stopDrill };
}
