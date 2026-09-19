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
  gradeProgression, gradeScale, observationFrom,
} from '../../src/curriculum/exercise.ts';
import { repertoireFor } from '../../src/curriculum/repertoire.ts';
import { SKILLS, getSkill } from '../../src/curriculum/skills.ts';
import { chordShape } from '../../src/music/chordShapes.ts';
import { midiToName } from '../../src/music/notes.ts';
import { levelOf, WORKABLE } from '../../src/curriculum/mastery.ts';
import { loadProgress as loadPathProgress, saveDone as savePathDone } from '../../src/curriculum/path.ts';
import type { Exercise, Grade, HeardChord } from '../../src/curriculum/exercise.ts';
import { audioContext, audioOutput, unlockAudio } from '../audio/context.ts';
import { chordTeachingCard } from '../ui/chordCard.ts';
import { scaleLessonCard } from './scaleLesson.ts';
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
    /** Notes heard during a scale attempt, which is graded as a sequence. */
    notes: Array<{ midi: number; at: number }>;
    /** Session clock at the moment the attempt began, to ignore earlier notes. */
    fromSessionMs: number;
    scalePcs: number[];
    feed?: HTMLElement;
    stop: () => void;
  } | null = null;

  /** Keep the fixed beginner course and adaptive mastery from drifting apart. */
  function markCourseStepDone(): void {
    const pathId = params.path;
    if (!pathId) return;
    const progress = loadPathProgress(storage());
    progress.done.add(pathId);
    savePathDone(storage(), progress.done);
  }

  let techniqueStop: (() => void) | null = null;

  async function startTechniqueGuide(skill: (typeof SKILLS)[number]): Promise<void> {
    stopDrill();
    techniqueStop?.();
    await unlockAudio();

    const totalSeconds = 45;
    let remaining = totalSeconds;
    const timer = h('div', { class: 'drill-count', text: '0:45' });
    const feedback = h('div', { class: 'drill-result' });
    const steps = skill.teach?.length
      ? h('ol', { class: 'guided-steps' }, ...skill.teach.map((step) => h('li', { text: step })))
      : h('p', { text: skill.goal });

    let interval = 0;
    let clickInterval = 0;
    const stop = () => {
      if (interval) window.clearInterval(interval);
      if (clickInterval) window.clearInterval(clickInterval);
      interval = 0;
      clickInterval = 0;
      techniqueStop = null;
    };
    techniqueStop = stop;

    const click = () => {
      const ctx = audioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 1000;
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.05);
      osc.connect(gain); gain.connect(audioOutput()); osc.start(); osc.stop(ctx.currentTime + 0.06);
    };

    const finish = () => {
      stop();
      timer.textContent = 'Done';
      replace(feedback,
        h('div', { class: 'coaching' },
          h('p', { text: 'The microphone cannot honestly grade the physical motion here. You can.' }),
          h('p', { class: 'muted', text: skill.goal }),
        ),
        h('div', { class: 'practice-actions' },
          button('Yes — that movement held together', () => {
            store.record([{ skillId: skill.id, quality: 1, at: Date.now(), source: 'lesson' }]);
            markCourseStepDone();
            if (params.path) context.navigate('path');
            else render();
          }, 'btn-primary'),
          button('Again', () => { void startTechniqueGuide(skill); }, 'btn-quiet'),
        ),
      );
    };

    replace(drillHost, h('section', { class: 'panel drill' },
      h('p', { class: 'eyebrow', text: 'GUIDED PRACTICE' }),
      h('h3', { text: skill.name }),
      h('p', { class: 'lede', text: skill.goal }),
      steps,
      h('p', { class: 'muted', text: 'The click is 60 bpm. Stay relaxed and keep the movement continuous; clean and slow beats fast and tense.' }),
      timer,
      h('div', { class: 'practice-actions' },
        button('Stop', finish, 'btn-quiet'),
      ),
      feedback,
    ));
    drillHost.scrollIntoView({ behavior: 'smooth', block: 'start' });

    click();
    clickInterval = window.setInterval(click, 1000);
    interval = window.setInterval(() => {
      remaining -= 1;
      timer.textContent = `0:${String(Math.max(0, remaining)).padStart(2, '0')}`;
      if (remaining <= 0) finish();
    }, 1000);
  }

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

    // A scale is taught here now rather than handed off to Riff Lab: the
    // shape, what each note does, and riffs built from it that can be played
    // today. Riff Lab is a sandbox, which is the right tool only once you
    // already have ideas of your own to put in it.
    if (skill.kind === 'scale' && skill.scale) {
      const card = scaleLessonCard(context, lesson, {
        practice: (exercise, scalePcs) => {
          const run = () => { void startDrill(exercise, run, scalePcs); };
          run();
        },
      });
      if (card) return card;

      const scaleId = skill.scale.name === 'minor pentatonic' ? 'minor-pent'
        : skill.scale.name === 'major pentatonic' ? 'major-pent'
          : skill.scale.name;
      return h('article', { class: `lesson-card is-${lesson.reason}` },
        h('header', { class: 'lesson-head' }, h('h3', { text: skill.name }), h('span', { class: 'badge', text: 'lead + fretboard' })),
        h('p', { class: 'lesson-because', text: lesson.because }),
        h('p', { class: 'lesson-goal', text: skill.goal }),
        h('p', { class: 'muted', text: 'I do not have a drawn shape for this scale yet, so I will not pretend to teach it. The workbench will still show you the notes and play them.' }),
        button('Show me the notes', () => context.navigate('lab', {
          root: String(skill.scale!.tonicPc),
          scale: scaleId,
          skill: skill.id,
        }), 'btn-primary'),
      );
    }

    // Do not fake-score techniques that the current detector cannot honestly
    // measure yet. Let Live Coach observe while the learner practises instead.
    if (skill.kind === 'technique') {
      const destination = skill.practice ?? 'session';
      const fromCourse = Boolean(params.path);
      const practiceLabel = fromCourse ? 'Start guided practice'
        : destination === 'lab' ? 'Practice this on the workbench'
          : destination === 'songs' ? 'Use this in Song Workshop'
            : 'Start a guided 45-second practice';
      const practiceView = destination === 'lab' ? 'lab' : destination === 'songs' ? 'songs' : 'session';
      const steps = skill.teach?.length
        ? h('ol', { class: 'guided-steps' }, ...skill.teach.map((step) => h('li', { text: step })))
        : h('p', { class: 'muted', text: 'I will keep this practical: one small move, then use it in music.' });

      return h('article', { class: `lesson-card is-${lesson.reason}` },
        h('header', { class: 'lesson-head' }, h('h3', { text: skill.name }), h('span', { class: 'badge', text: 'guided skill' })),
        h('p', { class: 'lesson-because', text: lesson.because }),
        h('p', { class: 'lesson-goal', text: skill.goal }),
        steps,
        h('details', { class: 'theory' }, h('summary', { text: 'Why this is worth your time' }), h('p', { text: skill.why })),
        h('div', { class: 'practice-actions' },
          button(practiceLabel, () => {
            if (fromCourse || practiceView === 'session') void startTechniqueGuide(skill);
            else context.navigate(practiceView, { skill: skill.id });
          }, 'btn-primary'),
          button('I understand the move — keep me going', () => {
            store.record([{ skillId: skill.id, quality: 1, at: Date.now(), source: 'lesson' }]);
            markCourseStepDone();
            if (params.path) context.navigate('path');
            else {
              render();
              element.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }, 'btn-quiet'),
        ),
        h('p', { class: 'muted' }, 'That second button means “I understand what I am practising,” not “I mastered it.” The app can bring it back later.'),
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

  async function startDrill(exercise: Exercise, again: () => void, scalePcs: number[] = []): Promise<void> {
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
    const notes: Array<{ midi: number; at: number }> = [];
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
      osc.connect(gain); gain.connect(audioOutput()); osc.start(); osc.stop(ctx.currentTime + 0.06);
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
      const grade: Grade = exercise.kind === 'play-scale'
        ? gradeScale(exercise, notes, scalePcs, elapsed)
        : exercise.kind === 'play-progression'
          ? gradeProgression(exercise, heard, startedAt)
          : exercise.kind === 'change-drill'
            ? gradeChangeDrill(exercise, heard, elapsed)
            : gradeHoldChord(exercise, heard, elapsed);

      store.record([observationFrom(exercise, grade)]);
      if (grade.passed) markCourseStepDone();
      const actions = h('div', { class: 'practice-actions' });
      if (grade.passed) {
        const next = planLessons(masteryMap(store.load()), { count: 1 })[0];
        actions.append(
          params.path
            ? button('Back to course · next lesson', () => {
                stopDrill();
                context.navigate('path');
              }, 'btn-primary')
            : button(next ? `Next: ${next.skill.name}` : 'Show me what this unlocked', () => {
                stopDrill();
                render();
                element.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }, 'btn-primary'),
          button('Do it again', again, 'btn-quiet'),
          button('Use it in a song', () => context.navigate('songs'), 'btn-quiet'),
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

    running = {
      exercise, startedAt: 0, heard, notes, scalePcs,
      fromSessionMs: context.session.currentTimeMs,
      feed: heardFeed,
      stop: () => { stopAudio(); running = null; },
    };

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
          if (running) running.fromSessionMs = context.session.currentTimeMs;
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

  function stopDrill(): void {
    running?.stop();
    running = null;
    techniqueStop?.();
    techniqueStop = null;
    clear(drillHost);
  }

  function onChord(chord: ChordDetection): void {
    if (!running || running.startedAt === 0) return;
    running.heard.push({ label: chord.label.replace('♯', '#'), at: Date.now() });
    const feed = running.feed;
    if (feed) {
      feed.appendChild(h('span', { class: 'chip', text: chord.label }));
      while (feed.children.length > 16) feed.firstElementChild?.remove();
    }
  }

  /**
   * Collect notes for a scale attempt.
   *
   * Chords arrive as decisions; notes arrive as a stream that has to be read
   * out of session memory and de-duplicated, because the same note stays in
   * the rolling window across several ticks.
   */
  function onNotes(): void {
    if (!running || running.startedAt === 0 || running.exercise.kind !== 'play-scale') return;
    const seen = running.notes;
    for (const note of context.session.memory.all()) {
      if (note.startMs <= running.fromSessionMs) continue;
      if (seen.some((n) => n.at === note.startMs && n.midi === note.midi)) continue;
      seen.push({ midi: note.midi, at: note.startMs });
      const feed = running.feed;
      if (feed) {
        feed.appendChild(h('span', { class: 'chip', text: midiToName(note.midi) }));
        while (feed.children.length > 16) feed.firstElementChild?.remove();
      }
    }
  }

  function learningMap(mastery: ReturnType<typeof masteryMap>): HTMLElement {
    const tracks = [
      {
        name: 'Chords & songs',
        subtitle: 'Open chords, useful changes and progressions.',
        skills: SKILLS.filter((s) => s.kind === 'chord' || s.kind === 'change' || s.kind === 'progression'),
      },
      {
        name: 'Rhythm & feel',
        subtitle: 'Pulse, up-strums, dynamics and different time feels.',
        skills: SKILLS.filter((s) => s.id.startsWith('technique.') && ['steady-strum','up-strum','eighth-strum','dynamics','six-eight','clean-notes'].some((part) => s.id.endsWith(part))),
      },
      {
        name: 'Lead & riffs',
        subtitle: 'Scales, picking, phrasing and guitar vocabulary.',
        skills: SKILLS.filter((s) => s.kind === 'scale' || ['alternate-picking','hammer-on','pull-off','slide','vibrato','riff-motif','call-response'].some((part) => s.id.endsWith(part))),
      },
      {
        name: 'Fingerstyle',
        subtitle: 'Thumb independence and repeating picking patterns.',
        skills: SKILLS.filter((s) => s.id.includes('fingerstyle')),
      },
      {
        name: 'Songwriting',
        subtitle: 'Turn your own riffs and progressions into sections.',
        skills: SKILLS.filter((s) => s.id.includes('song-sections') || s.kind === 'progression'),
      },
    ];

    return h('section', { class: 'panel learning-map' },
      h('h2', { text: 'The road ahead' }),
      h('p', { class: 'muted', text: 'This is not a fixed level system. I unlock from what you demonstrate, but these are the skills currently available in the course so you can see there is somewhere to go.' }),
      h('div', { class: 'learning-track-grid' },
        ...tracks.map((track) => {
          const usable = track.skills.filter((skill) => levelOf(mastery, skill.id) >= WORKABLE).length;
          return h('article', { class: 'learning-track' },
            h('strong', { text: track.name }),
            h('span', { class: 'learning-track-count', text: `${usable} / ${track.skills.length} introduced` }),
            h('p', { class: 'muted', text: track.subtitle }),
          );
        }),
      ),
    );
  }

  function render(): void {
    const mastery = masteryMap(store.load());
    const progress = progressOf(mastery);
    const requestedSkill = params.skill ? getSkill(params.skill) : null;
    const lessons: Lesson[] = requestedSkill
      ? [{
          skill: requestedSkill,
          reason: 'next-step',
          priority: 1,
          because: 'This is the exact lesson you opened from the course. Learn this one thing, then go back and keep moving.',
        }]
      : planLessons(mastery, { count: 6 });

    clear(element);
    if (requestedSkill) {
      element.appendChild(h('section', { class: 'panel' },
        h('p', { class: 'eyebrow', text: 'COURSE LESSON' }),
        h('h2', { text: requestedSkill.name }),
        h('p', { class: 'lede', text: 'One skill. See it, hear it, try it, then go back to the course.' }),
        button('‹ Back to course', () => context.navigate('path'), 'btn-quiet'),
      ));
    } else element.appendChild(h('section', { class: 'panel' },
      h('h2', { text: 'Where you are' }),
      h('p', { class: 'lede', text: describeProgress(mastery) }),
      h('div', { class: 'progress-bar' }, h('span', { class: 'progress-fill', style: `width:${Math.round(progress.fraction * 100)}%` })),
      h('p', { class: 'muted', text: `${progress.mastered} solid · ${progress.inProgress} under way · ${progress.total} in the whole course` }),
      h('p', { class: 'muted', text: 'Passing one lesson unlocks the next useful branches immediately. Mastery comes from returning to things over time, not being trapped on one card.' }),
    ));

    if (!requestedSkill) element.appendChild(learningMap(mastery));

    element.appendChild(h('div', { class: 'learn-sequence', 'aria-label': 'How a new skill is learned' },
      h('span', { class: 'is-current', text: '1 · See it' }), h('span', { text: '2 · Hear it' }), h('span', { text: '3 · Try it' }), h('span', { text: '4 · Use it' }),
    ));

    element.appendChild(h('section', { class: 'panel' },
      h('h2', { text: requestedSkill ? 'Do this now' : 'What I would work on next' }),
      h('p', { class: 'muted', text: requestedSkill
        ? 'This practice is tied to the course step you opened. Passing it advances that course step.'
        : 'The first few are the most useful from what I know about your playing. You are also allowed to wander — guitar is not a checklist.' }),
      lessons.length === 0
        ? h('div', {}, empty('Nothing is queued from the curriculum right now — that should not leave you stranded.'),
          h('div', { class: 'practice-actions' },
            button('Play a song', () => context.navigate('songs'), 'btn-primary'),
            button('Create a song idea', () => context.navigate('songs'), 'btn-quiet'),
            button('Just play and let me listen', () => context.navigate('session'), 'btn-quiet'),
          ))
        : h('div', { class: 'lesson-list' }, ...lessons.map(lessonCard)),
    ));

    element.appendChild(drillHost);
  }

  render();
  startRequestedProgression();

  return { element, onChord, onNotes, update: () => { if (!running) render(); }, dispose: stopDrill };
}
