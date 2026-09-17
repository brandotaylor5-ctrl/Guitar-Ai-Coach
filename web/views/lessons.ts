/**
 * The lesson screen — a teacher choosing one thing and then sitting with you
 * while you do it.
 *
 * Two halves. Above, where you are and what is worth working on, taken from
 * what the app has heard you play rather than from a fixed order. Below, the
 * drill itself: a count-in, a click, the bar you are supposed to be on, and a
 * read on how it went the moment you stop.
 */

import type { ChordDetection } from '../audio/chordDetect.ts';
import type { Lesson } from '../../src/curriculum/plan.ts';
import { describeProgress, planLessons, progressOf } from '../../src/curriculum/plan.ts';
import { masteryMap } from '../../src/curriculum/mastery.ts';
import { CurriculumStore } from '../../src/curriculum/watch.ts';
import { buildExercise, gradeChangeDrill, gradeHoldChord, gradeProgression, observationFrom } from '../../src/curriculum/exercise.ts';
import type { Exercise, Grade, HeardChord } from '../../src/curriculum/exercise.ts';
import { h, clear, replace } from '../ui/dom.ts';
import { button, empty } from '../ui/render.ts';
import type { AppContext, View } from './context.ts';

function storage() {
  try {
    window.localStorage.setItem('__probe__', '1');
    window.localStorage.removeItem('__probe__');
    return window.localStorage;
  } catch {
    // Private browsing. Progress lasts the session and no longer.
    const memory = new Map<string, string>();
    return { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => { memory.set(k, v); } };
  }
}

export function lessonsView(context: AppContext): View {
  const store = new CurriculumStore(storage());
  const element = h('div', { class: 'view view-lessons' });
  const drillHost = h('div', { class: 'drill-host' });

  let running: {
    exercise: Exercise;
    startedAt: number;
    heard: HeardChord[];
    stop: () => void;
  } | null = null;

  function lessonCard(lesson: Lesson): HTMLElement {
    return h('article', { class: `lesson-card is-${lesson.reason}` },
      h('header', { class: 'lesson-head' },
        h('h3', { text: lesson.skill.name }),
        h('span', { class: 'badge', text: lesson.reason.replace('-', ' ') }),
      ),
      h('p', { class: 'lesson-because', text: lesson.because }),
      h('p', { class: 'lesson-goal', text: lesson.skill.goal }),
      h('details', { class: 'theory' },
        h('summary', { text: 'Why this is worth your time' }),
        h('p', { text: lesson.skill.why }),
      ),
      button('Work on this', () => startDrill(lesson), 'btn-primary'),
    );
  }

  function startDrill(lesson: Lesson): void {
    stopDrill();
    const exercise = buildExercise(lesson.skill);
    const heard: HeardChord[] = [];

    const barLabel = h('div', { class: 'drill-bar', text: '—' });
    const nextLabel = h('div', { class: 'drill-next muted', text: '' });
    const countLabel = h('div', { class: 'drill-count', text: 'Ready…' });
    const heardFeed = h('div', { class: 'drill-heard' });
    const resultHost = h('div', { class: 'drill-result' });

    const beatMs = 60_000 / exercise.bpm;
    const barMs = beatMs * 4;
    let beat = 0;
    let startedAt = 0;

    // A count-in, because nobody can start on beat one from silence.
    let countIn = 4;
    const ctx = new AudioContext();
    const click = (strong: boolean) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = strong ? 1600 : 1000;
      gain.gain.setValueAtTime(strong ? 0.25 : 0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.05);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.06);
    };

    const tick = window.setInterval(() => {
      if (countIn > 0) {
        click(countIn === 4);
        countLabel.textContent = `${countIn}…`;
        countIn--;
        if (countIn === 0) { startedAt = Date.now(); countLabel.textContent = 'Go'; }
        return;
      }
      click(beat % 4 === 0);
      const elapsed = Date.now() - startedAt;
      if (exercise.chords?.length) {
        const index = Math.floor(elapsed / barMs) % exercise.chords.length;
        barLabel.textContent = exercise.chords[index]!;
        nextLabel.textContent = exercise.chords.length > 1
          ? `next: ${exercise.chords[(index + 1) % exercise.chords.length]}`
          : '';
      }
      beat++;
      if (elapsed >= exercise.durationMs) finish();
    }, beatMs);

    function stopAudio(): void {
      window.clearInterval(tick);
      void ctx.close().catch(() => {});
    }

    function finish(): void {
      stopAudio();
      const elapsed = Math.max(1, Date.now() - startedAt);
      const grade: Grade = exercise.kind === 'play-progression'
        ? gradeProgression(exercise, heard, startedAt)
        : exercise.kind === 'change-drill'
          ? gradeChangeDrill(exercise, heard, elapsed)
          : gradeHoldChord(exercise, heard, elapsed);

      store.record([observationFrom(exercise, grade)]);
      replace(resultHost,
        h('div', { class: `coaching${grade.passed ? ' is-nailed' : ''}` },
          ...grade.feedback.map((line) => h('p', { text: line })),
        ),
        h('div', { class: 'practice-actions' },
          button('Again', () => startDrill(lesson), 'btn-primary'),
          button('Something else', () => { stopDrill(); render(); }, 'btn-quiet'),
        ),
      );
      running = null;
      countLabel.textContent = 'Done';
      render();
    }

    running = {
      exercise, startedAt: Date.now(), heard,
      stop: () => { stopAudio(); running = null; },
    };

    replace(drillHost, h('section', { class: 'panel drill' },
      h('h3', { text: exercise.title }),
      h('p', { class: 'lede', text: exercise.instructions }),
      h('p', { class: 'muted', text: `Target: ${exercise.target}` }),
      h('div', { class: 'drill-stage' }, countLabel, barLabel, nextLabel),
      heardFeed,
      h('div', { class: 'practice-actions' },
        button('Stop', () => { finish(); }, 'btn-quiet'),
      ),
      resultHost,
    ));

    if (!context.listening) {
      context.say('Start listening first — I need to hear you to grade this.');
    }
    drillHost.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Keep the chord feed visible so it is obvious what is being heard.
    running.heard = heard;
    (running as { feed?: HTMLElement }).feed = heardFeed;
  }

  function stopDrill(): void {
    running?.stop();
    running = null;
    clear(drillHost);
  }

  function onChord(chord: ChordDetection): void {
    if (!running) return;
    running.heard.push({ label: chord.label.replace('♯', '#'), at: Date.now() });
    const feed = (running as { feed?: HTMLElement }).feed;
    if (feed) {
      feed.appendChild(h('span', { class: 'chip', text: chord.label }));
      while (feed.children.length > 16) feed.firstElementChild?.remove();
    }
  }

  function render(): void {
    const mastery = masteryMap(store.load());
    const progress = progressOf(mastery);
    const lessons = planLessons(mastery, { count: 3 });

    clear(element);
    element.appendChild(h('section', { class: 'panel' },
      h('h2', { text: 'Where you are' }),
      h('p', { class: 'lede', text: describeProgress(mastery) }),
      h('div', { class: 'progress-bar' },
        h('span', { class: 'progress-fill', style: `width:${Math.round(progress.fraction * 100)}%` })),
      h('p', { class: 'muted', text: `${progress.mastered} solid · ${progress.inProgress} under way · ${progress.total} in the whole course` }),
      h('p', { class: 'muted', text: 'I work this out from what I hear you play, not from a test. Play normally and it keeps up.' }),
    ));

    element.appendChild(h('section', { class: 'panel' },
      h('h2', { text: 'What I would work on' }),
      lessons.length === 0
        ? empty('Nothing queued — play something and I will find the next thing.')
        : h('div', { class: 'lesson-list' }, ...lessons.map(lessonCard)),
    ));

    element.appendChild(drillHost);
  }

  render();
  return { element, onChord, update: () => render(), dispose: stopDrill };
}
