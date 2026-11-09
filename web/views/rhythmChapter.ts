/**
 * A teaching-first chapter, not a collection of tools.
 *
 * An understanding check can be scored objectively. Actual playing cannot
 * reliably be verified from a button or the current chord detector. Keep
 * those two kinds of evidence separate in the interface and in storage.
 */
import {
  RHYTHM_CHAPTER, RHYTHM_STORAGE_KEY, BARRE_RECOVERY,
  parseChapterProgress, recordEvidence, recommendRhythmLesson,
  chapterCounts, rhythmEvents,
} from '../../src/curriculum/rhythmChapter.ts';
import type { ChapterLesson, ChapterProgress, RhythmLevel, Difficulty, EvidenceAction } from '../../src/curriculum/rhythmChapter.ts';
import { chordShape, chordShapeMidis } from '../../src/music/chordShapes.ts';
import { chordDiagram } from '../ui/chordCard.ts';
import { h, clear } from '../ui/dom.ts';
import { button } from '../ui/render.ts';
import type { AppContext, View } from './context.ts';

const BARRE_KEY = 'guitar-academy.barre-practice.v1';
const COUNTS = ['1','&','2','&','3','&','4','&'];
const VALID_DIFFICULTIES: Difficulty[] = ['shape','transition','rhythm','whole'];

function safeStorage(): Storage | null {
  try {
    const storage = window.localStorage;
    storage.setItem('__academy_test__', '1');
    storage.removeItem('__academy_test__');
    return storage;
  } catch { return null; }
}
function rowActions(...actions: HTMLElement[]): HTMLElement {
  return h('div', { class: 'academy-actions' }, ...actions);
}

export function rhythmChapterView(context: AppContext, params: Record<string, string> = {}): View {
  const element = h('div', { class: 'view rhythm-chapter' });
  const storage = safeStorage();
  let progress: ChapterProgress = parseChapterProgress(storage?.getItem(RHYTHM_STORAGE_KEY) ?? null);
  const requested = RHYTHM_CHAPTER.find(l => l.id === params.lesson);
  let active: ChapterLesson = requested ?? recommendRhythmLesson(progress);
  let answerMessage = '';
  let needHelp = false;
  let showMap = false;
  let showClinic = params.clinic === '1';
  let difficulty: Difficulty = 'transition';
  let barreAttempts = 0;
  try {
    const value = storage?.getItem(BARRE_KEY);
    const parsed: unknown = value ? JSON.parse(value) : null;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const state = parsed as Record<string, unknown>;
      if (VALID_DIFFICULTIES.includes(state.focus as Difficulty)) difficulty = state.focus as Difficulty;
      if (typeof state.attempts === 'number' && Number.isSafeInteger(state.attempts) && state.attempts > 0) barreAttempts = Math.min(state.attempts, 10000);
    }
  } catch { /* Malformed practice data must not block learning. */ }

  function saveProgress(action: EvidenceAction): void {
    progress = recordEvidence(progress, active.id, action, Date.now());
    try { storage?.setItem(RHYTHM_STORAGE_KEY, JSON.stringify(progress)); }
    catch { context.say('This browser could not save chapter progress. Keep a personal note of this practice.', 'error'); }
    render();
  }

  function notesForChord(chord: string): readonly number[] {
    const shape = chordShape(chord);
    return shape ? chordShapeMidis(shape) : [];
  }

  function playExample(simpler = false, slower = false): void {
    const events = rhythmEvents(active, notesForChord, simpler);
    if (!events.length) {
      context.say('A reference chord is unavailable. Continue with the written exercise.', 'error');
      return;
    }
    void context.player.play(events, { speed: slower ? 0.7 : 1 })
      .catch(() => context.say('Audio could not play. Check sound permission and try again.', 'error'));
  }

  function markBarrePractice(): void {
    barreAttempts++;
    try { storage?.setItem(BARRE_KEY, JSON.stringify({ focus: difficulty, attempts: barreAttempts, lastPracticedAt: Date.now() })); }
    catch { context.say('This browser could not save the barre practice note.', 'error'); }
    render();
  }

  function selectLesson(lesson: ChapterLesson): void {
    active = lesson;
    answerMessage = '';
    needHelp = false;
    showMap = false;
    render();
    element.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function lessonStatus(lesson: ChapterLesson): string {
    const p = progress[lesson.id];
    if (p?.selfReportedIndependentAt) return 'Independent · self-report';
    if (p?.needsWork) return 'Needs another session';
    if ((p?.practiceAttempts ?? 0) > 0) return 'Practiced · not verified';
    if (p?.conceptCheckedAt) return 'Concept understood';
    return 'Not started';
  }

  function renderMap(): HTMLElement {
    return h('section', { class: 'panel rhythm-roadmap' },
      h('div', { class: 'rhythm-split-head' },
        h('h3', { text: 'All eight lessons' }),
        button('Hide lesson map', () => { showMap = false; render(); }, 'btn-quiet'),
      ),
      h('p', { class: 'muted', text: 'Follow the sequence for a complete chapter, or reopen a skill that needs more practice. Nothing is falsely marked mastered.' }),
      h('div', { class: 'rhythm-lesson-map' },
        ...RHYTHM_CHAPTER.map((lesson, index) =>
          h('button', { type: 'button', class: 'rhythm-map-item' + (lesson.id === active.id ? ' is-current' : ''),
            onClick: () => selectLesson(lesson),
            'aria-current': lesson.id === active.id ? 'step' : undefined,
          },
          h('span', { class: 'rhythm-map-number', text: String(index + 1) }),
          h('span', { class: 'rhythm-map-copy' },
            h('strong', { text: lesson.title }),
            h('small', { text: lessonStatus(lesson) }),
          ),
          ),
        ),
      ),
    );
  }

  function beatGrid(lesson: ChapterLesson): HTMLElement {
    return h('div', { class: 'rhythm-beat-grid', role: 'img', 'aria-label': 'Eight subdivisions of one four-beat bar. Down, up, and silent strokes are labeled.' },
      ...lesson.pattern.map((stroke, i) => h('div', { class: 'rhythm-beat' + (lesson.accents.includes(i) ? ' is-accent' : '') },
        h('small', { text: COUNTS[i] }),
        h('strong', { text: stroke === '.' ? '·' : stroke }),
      )),
    );
  }

  function lessonCard(): HTMLElement {
    const index = RHYTHM_CHAPTER.findIndex(l => l.id === active.id);
    const evidence = progress[active.id];
    const understood = !!evidence?.conceptCheckedAt;
    const attempted = (evidence?.practiceAttempts ?? 0) > 0;
    const next = RHYTHM_CHAPTER[index + 1];
    const card = h('section', { class: 'panel rhythm-active-lesson' },
      h('p', { class: 'academy-eyebrow', text: 'RHYTHM FOUNDATIONS · LESSON ' + (index + 1) + ' OF ' + RHYTHM_CHAPTER.length }),
      h('div', { class: 'rhythm-split-head' },
        h('h2', { text: active.title }),
        h('span', { class: 'rhythm-duration', text: 'About ' + active.minutes + ' min' }),
      ),
      h('p', { class: 'rhythm-lede', text: active.outcome }),
      h('p', { class: 'muted', text: active.why }),
      h('h3', { text: '1. Hear and notice' }),
      h('p', { text: active.hear }),
      beatGrid(active),
      h('p', { class: 'rhythm-legend', text: 'D = downstroke   U = upstroke   · = move your hand without striking the strings. Accent = slightly stronger stroke.' }),
      h('p', { class: 'muted', text: 'Example: ' + active.chords.join(' → ') + ' · ' + active.bpm + ' beats/min · synthesized chord tones, not a recorded guitar.' }),
      rowActions(
        button('Hear the example', () => playExample(), 'btn-primary'),
        button('Hear it slower', () => playExample(false, true), 'btn-quiet'),
        button('Simplest sound', () => playExample(true), 'btn-quiet'),
      ),
      h('h3', { text: '2. Put it under your fingers' }),
      h('ol', { class: 'rhythm-instructions' }, ...active.teach.map(step => h('li', { text: step }))),
      h('div', { class: 'rhythm-practice-brief' },
        h('strong', { text: 'Practice assignment' }),
        h('p', { text: active.practice }),
      ),
      h('details', { class: 'rhythm-chord-details' },
        h('summary', { text: 'Show the chord fingerings (' + active.chords.join(', ') + ')' }),
        h('div', { class: 'rhythm-chord-grid' },
          ...active.chords.map(chord =>
            h('div', { class: 'rhythm-chord' }, h('strong', { text: chord }), chordDiagram(chord)),
          ),
        ),
      ),
      h('h3', { text: '3. Check the idea' }),
      h('p', { text: active.check.question }),
    );

    if (understood) {
      card.appendChild(h('p', { class: 'rhythm-good', text: 'Concept check passed. ' + active.check.explanation }));
    } else {
      card.appendChild(h('div', { class: 'rhythm-answers' }, ...active.check.options.map((option, i) =>
        button(option, () => {
          if (i === active.check.correct) {
            answerMessage = '';
            saveProgress('concept-check');
          } else {
            answerMessage = 'Not quite. ' + active.check.explanation + ' Try again.';
            render();
          }
        }, 'btn-quiet'),
      )));
      if (answerMessage) card.appendChild(h('p', { class: 'rhythm-feedback', role: 'status', text: answerMessage }));
    }

    card.append(
      h('h3', { text: '4. Play and decide what happens next' }),
      h('p', { text: 'Try the exercise on your guitar. These buttons record your report; the app is not grading your audio or verifying your technique.' }),
      rowActions(
        button('I practiced this', () => saveProgress('practiced'), 'btn-primary'),
        button('I played it without the guide', () => saveProgress('independent'), 'btn-quiet'),
        button('I am stuck on this', () => { needHelp = true; saveProgress('needs-work'); }, 'btn-quiet'),
      ),
      !attempted ? h('p', { class: 'muted', text: 'Independent playing can only be recorded after a practice attempt. It remains your self-assessment.' }) : h('span'),
      attempted ? h('p', { class: 'rhythm-evidence', text: 'Practice attempts reported: ' + evidence!.practiceAttempts +
        (evidence?.selfReportedIndependentAt ? ' · Independent performance self-reported; not microphone verified.' : ' · Physical fluency not established.') }) : h('span'),
    );
    // Disable the independent claim until the learner reports an attempt.
    const allButtons = card.querySelectorAll<HTMLButtonElement>('button');
    for (const control of allButtons) {
      if (control.textContent === 'I played it without the guide' && !attempted) control.disabled = true;
    }

    if (needHelp || evidence?.needsWork) {
      card.appendChild(h('section', { class: 'rhythm-recovery' },
        h('h4', { text: 'Reduce one difficulty, not the goal' }),
        h('p', { text: active.simplify }),
        h('p', { text: 'Keep this skill marked as developing. You can also work on the next lesson and revisit this one.' }),
        rowActions(
          button('Hear the simplified version', () => playExample(true), 'btn-quiet'),
          next ? button('Explore lesson ' + (index + 2), () => selectLesson(next), 'btn-primary') : button('Revisit chapter', () => { showMap = true; render(); }, 'btn-quiet'),
        ),
      ));
    }

    card.appendChild(h('details', { class: 'rhythm-transfer' },
      h('summary', { text: 'Try it somewhere else (transfer challenge)' }),
      h('p', { text: active.apply }),
    ));
    if (next) {
      card.appendChild(rowActions(button('Next lesson: ' + next.title, () => selectLesson(next), 'btn-quiet')));
    } else {
      card.appendChild(rowActions(button('Return to the lesson map', () => { showMap = true; render(); }, 'btn-quiet')));
    }
    return card;
  }

  function clinicCard(): HTMLElement {
    const exercise = BARRE_RECOVERY[difficulty];
    return h('section', { class: 'panel rhythm-clinic' },
      h('div', { class: 'rhythm-split-head' },
        h('h3', { text: 'Parallel skill: barre-chord clinic' }),
        button('Close clinic', () => { showClinic = false; render(); }, 'btn-quiet'),
      ),
      h('p', { text: 'A difficult technique stays on your practice list without blocking other guitar skills. This clinic does not mark barre chords mastered.' }),
      h('div', { class: 'rhythm-clinic-picks' }, ...VALID_DIFFICULTIES.map(k =>
        button(({ shape: 'Chord sounds muted', transition: 'Changing shapes', rhythm: 'Rhythm collapses', whole: 'Four-chord song' } as Record<Difficulty,string>)[k],
          () => { difficulty = k; render(); }, difficulty === k ? 'btn-primary' : 'btn-quiet'),
      )),
      h('div', { class: 'rhythm-practice-brief' },
        h('h4', { text: exercise.title }),
        h('p', { text: exercise.first }),
        h('ol', {}, ...exercise.steps.map(step => h('li', { text: step }))),
        h('strong', { text: 'Work toward: ' + exercise.target }),
      ),
      rowActions(button('I worked on this today', markBarrePractice, 'btn-quiet')),
      h('p', { class: 'muted', text: barreAttempts
        ? 'Barre practice sessions noted: ' + barreAttempts + '. These are self-reported practices, not passed performance tests.'
        : 'No barre practice logged yet. You can return whenever you want; rhythm lessons remain open.' }),
    );
  }

  function render(): void {
    clear(element);
    const counts = chapterCounts(progress);
    element.append(
      h('header', { class: 'view-head rhythm-head' },
        h('p', { class: 'academy-eyebrow', text: 'GUITAR ACADEMY · FIRST COMPLETE CHAPTER' }),
        h('h2', { text: 'Make chords become music' }),
        h('p', { text: 'Eight connected rhythm lessons, using chords you already know. Understand it, hear it, play it, and then use it without the guide.' }),
        h('p', { class: 'muted', text: 'This is an early curriculum chapter, not the full academy. No lesson requires four barre chords, and a struggle never locks other lessons.' }),
      ),
      h('section', { class: 'panel rhythm-overview' },
        h('div', { class: 'rhythm-summary' },
          h('div', {}, h('strong', { text: String(counts.understood) + '/8' }), h('small', { text: 'Concepts checked' })),
          h('div', {}, h('strong', { text: String(counts.practiced) + '/8' }), h('small', { text: 'Practiced' })),
          h('div', {}, h('strong', { text: String(counts.independentClaims) + '/8' }), h('small', { text: 'Independence self-reported' })),
        ),
        h('p', { class: 'muted', text: 'Only concept questions are checked by the app. Playing reports come from you and are never represented as verified skill.' }),
        rowActions(
          button('Suggested: ' + recommendRhythmLesson(progress).title, () => selectLesson(recommendRhythmLesson(progress)), 'btn-primary'),
          button(showMap ? 'Hide all lessons' : 'See all eight lessons', () => { showMap = !showMap; render(); }, 'btn-quiet'),
          button('Back to Learn', () => context.navigate('path'), 'btn-quiet'),
        ),
      ),
      showMap ? renderMap() : h('span'),
      lessonCard(),
      h('section', { class: 'panel rhythm-clinic-entry' },
        h('h3', { text: 'A hard technique should not end your learning' }),
        h('p', { text: 'Still developing barre chords? Keep that work separate from this rhythm chapter. Try a focused recovery exercise and return to it on another day.' }),
        !showClinic ? button('Open barre-chord clinic', () => { showClinic = true; render(); }, 'btn-quiet') : null,
      ),
      showClinic ? clinicCard() : h('span'),
      h('p', { class: 'academy-footer', text: storage
        ? 'Progress stays in this browser, not synced between devices. Use your own judgment and listen to your playing.'
        : 'Private browsing or blocked storage: progress may not survive closing this page.' }),
    );
  }
  render();
  return { element, dispose() { context.player.stop(); } };
}
