/**
 * Riff School.
 *
 * Not a lick vending machine. This view connects ear -> fretboard -> phrase ->
 * another position -> variation -> song. The teaching material is original and
 * built from scale functions, so the reusable skill is the point.
 */

import type { NoteEvent, Riff } from '../../src/types.ts';
import { midiToName, pcToName } from '../../src/music/notes.ts';
import {
  SCALES, scaleById, scaleBox, scaleNoteNames, scaleRun,
} from '../../src/music/scales.ts';
import { renderTab, inferFingering } from '../../src/music/fretboard.ts';
import { practiceAttempt } from '../../src/practice/practice.ts';
import { CurriculumStore } from '../../src/curriculum/watch.ts';
import {
  PlayerModelStore, buildPlayerProfile, practiceObservation, recommendAdaptiveTask,
} from '../../src/coach/playerModel.ts';
import {
  RIFF_LESSONS, buildRiffStudy, developStudy, neckZones, rootLocations,
} from '../../src/curriculum/riffSchool.ts';
import type {
  DevelopedRiff, NeckZone, RiffLesson, RiffStudy,
} from '../../src/curriculum/riffSchool.ts';
import { leadOverProgression } from '../../src/create/lead.ts';
import type { LeadChord } from '../../src/create/lead.ts';
import { h, clear, replace } from '../ui/dom.ts';
import {
  button, fretboardDiagram, highlightNote, noteRow, scaleDiagram, tabBlock,
} from '../ui/render.ts';
import type { AppContext, View } from './context.ts';

const ROOTS = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
type LabChord = LeadChord;
type LessonLevel = 'all' | RiffLesson['level'];

function eventFromPosition(midi: number, startMs: number, durationMs: number): NoteEvent {
  return { midi, startMs, durationMs, confidence: 1, velocity: .6 };
}

function eventsFromRun(positions: ReturnType<typeof scaleRun>, bpm = 92): NoteEvent[] {
  const step = 60_000 / bpm / 2;
  return positions.map((position, index) =>
    eventFromPosition(position.midi, index * step, step * .82));
}

function currentRiffNotes(riff: Riff): NoteEvent[] {
  return riff.versions.find((version) => version.id === riff.currentVersionId)?.notes
    ?? riff.versions[0]?.notes
    ?? [];
}

function makeChord(rootPc: number, minor: boolean): LabChord {
  return { rootPc, minor, label: `${ROOTS[rootPc]}${minor ? 'm' : ''}` };
}

function parseProgression(raw: string | undefined): LabChord[] {
  if (!raw) return [];
  return raw.split(',').map((token) => {
    const [rootText, minorText] = token.split(':');
    const rootPc = Number(rootText);
    if (!Number.isInteger(rootPc) || rootPc < 0 || rootPc > 11) return null;
    return makeChord(rootPc, minorText === '1');
  }).filter((chord): chord is LabChord => chord !== null).slice(0, 8);
}

function nearestMidiForPc(pitchClass: number, around: number): number {
  let best = around;
  let distance = Infinity;
  for (let midi = 40; midi <= 84; midi++) {
    if (((midi % 12) + 12) % 12 !== pitchClass) continue;
    const next = Math.abs(midi - around);
    if (next < distance) { best = midi; distance = next; }
  }
  return best;
}

function progressionNotes(chords: LabChord[], barMs = 1050): NoteEvent[] {
  const out: NoteEvent[] = [];
  chords.forEach((chord, index) => {
    const root = nearestMidiForPc(chord.rootPc, 50);
    for (const midi of [root, root + (chord.minor ? 3 : 4), root + 7]) {
      out.push({
        midi,
        startMs: index * barMs,
        durationMs: barMs * .84,
        confidence: 1,
        velocity: .43,
      });
    }
  });
  return out;
}

export function labView(context: AppContext, params: Record<string, string> = {}): View {
  const requestedRoot = Number(params.root);
  let rootPc = Number.isInteger(requestedRoot) && requestedRoot >= 0 && requestedRoot <= 11
    ? requestedRoot
    : 9; // A minor pentatonic puts the classic first home under the hand at fret 5.

  let scale = (params.scale ? scaleById(params.scale) : null)
    ?? scaleById(params.mode === 'major' ? 'major-pent' : 'minor-pent')!;
  let zones = neckZones(rootPc, scale, context.session.tuning);
  const requestedZone = Number(params.zone);
  let zoneIndex = Number.isInteger(requestedZone) && requestedZone >= 0 && requestedZone < zones.length
    ? requestedZone
    : 0;
  let selectedLessonId = params.lesson && RIFF_LESSONS.some((lesson) => lesson.id === params.lesson)
    ? params.lesson
    : RIFF_LESSONS[0]!.id;
  const adaptiveKind = params.adaptive ?? '';
  const adaptiveBpmRaw = Number(params.bpm);
  const adaptiveBpm = Number.isFinite(adaptiveBpmRaw) && adaptiveBpmRaw >= 40 && adaptiveBpmRaw <= 240
    ? Math.round(adaptiveBpmRaw)
    : null;
  let lessonLevel: LessonLevel = 'all';
  let attemptStartMs: number | null = null;
  let attemptTarget: NoteEvent[] | null = null;
  let attemptLabel = '';
  let attemptMeta: {
    source: 'riff-school' | 'my-riff';
    targetId: string;
    lessonId?: string;
    zoneIndex?: number;
    startFret?: number;
  } | null = null;
  let revealStudy = false;
  let selectedMyRiffId = params.riff ?? '';
  let disposed = false;

  const incomingProgression = parseProgression(params.progression);
  const linkedSkillId = params.skill;
  let curriculum: CurriculumStore | null = null;
  try {
    window.localStorage.setItem('__riff_school_probe__', '1');
    window.localStorage.removeItem('__riff_school_probe__');
    curriculum = new CurriculumStore(window.localStorage);
  } catch {
    curriculum = null;
  }

  const playerModel = new PlayerModelStore(
    (() => {
      try {
        window.localStorage.setItem('__riff_model_probe__', '1');
        window.localStorage.removeItem('__riff_model_probe__');
        return window.localStorage;
      } catch {
        const memory = new Map<string, string>();
        return {
          getItem: (k: string) => memory.get(k) ?? null,
          setItem: (k: string, v: string) => { memory.set(k, v); },
        };
      }
    })(),
  );

  // ---- controls -----------------------------------------------------------

  const rootSelect = h('select', { class: 'select' }) as HTMLSelectElement;
  ROOTS.forEach((name, pc) =>
    rootSelect.appendChild(h('option', { value: pc, text: name, selected: pc === rootPc })));

  const scaleSelect = h('select', { class: 'select' }) as HTMLSelectElement;
  const featuredScales = [
    'minor-pent', 'major-pent', 'blues', 'dorian-pent', 'dominant-pent',
    'major', 'minor', 'dorian', 'mixolydian',
  ];
  for (const id of featuredScales) {
    const item = scaleById(id);
    if (!item) continue;
    scaleSelect.appendChild(h('option', {
      value: item.id,
      text: item.name,
      selected: item.id === scale.id,
    }));
  }

  const levelSelect = h('select', { class: 'select' }) as HTMLSelectElement;
  [
    ['all', 'All phrase skills'],
    ['start', 'Start · make a phrase'],
    ['connect', 'Connect · stop playing boxes'],
    ['create', 'Create · develop ideas'],
  ].forEach(([value, label]) =>
    levelSelect.appendChild(h('option', { value, text: label })));

  const zoneHost = h('div', { class: 'riff-zone-strip' });
  const mapHost = h('div', { class: 'riff-map-host' });
  const lessonHost = h('div', { class: 'riff-school-lessons' });
  const studyHost = h('div', { class: 'riff-study-host' });
  const feedbackHost = h('div', { class: 'riff-attempt-feedback' });
  const myRiffsHost = h('div', { class: 'my-riff-trainer-host' });
  const liveHarmonyHost = h('div', { class: 'live-harmony-riff-host' });

  const adaptivePanel = adaptiveKind
    ? h('section', { class: 'panel riff-adaptive-assignment' },
        h('p', { class: 'eyebrow', text: 'COACH SENT YOU HERE' }),
        h('h3', { text: adaptiveKind === 'timing'
          ? 'This one is about your pulse.'
          : adaptiveKind === 'position'
            ? `This one is about Zone ${zoneIndex + 1}.`
            : adaptiveKind === 'interval'
              ? 'This one is about expanding your melodic vocabulary.'
              : adaptiveKind === 'register'
                ? 'This one is about getting out of one register.'
                : adaptiveKind === 'resolution'
                  ? 'This one is about tension and where you land.'
                  : 'This one is about developing an idea.' }),
        h('p', { class: 'muted', text: adaptiveBpm
          ? `Coach chose this from your playing history. The target pulse is about ${adaptiveBpm} BPM; accuracy first, speed later.`
          : 'Coach chose this from patterns across your playing history, not because this lesson happened to be next in a list.' }),
      )
    : h('span');

  const element = h('div', { class: 'view view-lab riff-school-view' },
    h('section', { class: 'panel riff-school-hero' },
      h('div', {},
        h('p', { class: 'lab-kicker', text: 'RIFF SCHOOL' }),
        h('h2', { text: 'Learn the neck by making music on it.' }),
        h('p', { class: 'muted', text: 'Hear it → find it → play it → move it → change it → keep the version that becomes yours.' }),
      ),
      h('div', { class: 'lab-controls' },
        h('label', {}, 'Home ', rootSelect),
        h('label', {}, 'Sound ', scaleSelect),
        h('label', {}, 'Focus ', levelSelect),
      ),
    ),

    adaptivePanel,

    h('section', { class: 'panel riff-map-panel' },
      h('div', { class: 'lab-section-head' },
        h('div', {},
          h('p', { class: 'eyebrow', text: '1 · MAP THE NECK' }),
          h('h3', { text: 'One sound. Connected neighborhoods.' }),
          h('p', { class: 'muted', text: 'These are hand-sized zones, not magic boxes. Roots and shared notes are the landmarks that let you move between them.' }),
        ),
      ),
      zoneHost,
      mapHost,
    ),

    h('section', { class: 'panel riff-school-panel' },
      h('div', { class: 'lab-section-head' },
        h('div', {},
          h('p', { class: 'eyebrow', text: '2 · BUILD VOCABULARY' }),
          h('h3', { text: 'Original phrases that teach one musical move.' }),
          h('p', { class: 'muted', text: 'No famous-riff database. These studies teach reusable devices: motif, space, contour, call-and-response, rhythmic identity and delayed resolution.' }),
        ),
      ),
      lessonHost,
      studyHost,
      h('div', { class: 'lab-practice-box riff-feedback-box' },
        h('h4', { text: 'LIVE ATTEMPT' }),
        feedbackHost,
      ),
    ),

    h('section', { class: 'panel my-riff-panel' },
      h('div', { class: 'lab-section-head' },
        h('div', {},
          h('p', { class: 'eyebrow', text: '3 · MY RIFF TRAINER' }),
          h('h3', { text: 'Bring your own musical problem.' }),
          h('p', { class: 'muted', text: 'Anything you captured in Coach can become a slow-down, replay and live-comparison exercise here.' }),
        ),
      ),
      myRiffsHost,
    ),

    h('section', { class: 'panel live-riff-harmony-panel' },
      h('div', { class: 'lab-section-head' },
        h('div', {},
          h('p', { class: 'eyebrow', text: '4 · PLAY THE CHANGES' }),
          h('h3', { text: incomingProgression.length >= 2 ? 'Build a line over the chords you just played.' : 'Harmony becomes the next layer.' }),
          h('p', { class: 'muted', text: incomingProgression.length >= 2
            ? 'This is your Live Coach progression — not a stock backing loop.'
            : 'Play a progression in Coach and choose “Build a riff over these.” Riff School will use those exact chord changes.' }),
        ),
      ),
      liveHarmonyHost,
    ),
  );

  // ---- state / refresh ----------------------------------------------------

  rootSelect.addEventListener('change', () => {
    rootPc = Number(rootSelect.value);
    resetSound();
  });
  scaleSelect.addEventListener('change', () => {
    scale = scaleById(scaleSelect.value) ?? scaleById('minor-pent')!;
    resetSound();
  });
  levelSelect.addEventListener('change', () => {
    lessonLevel = levelSelect.value as LessonLevel;
    const pool = filteredLessons();
    if (!pool.some((lesson) => lesson.id === selectedLessonId)) {
      selectedLessonId = pool[0]?.id ?? RIFF_LESSONS[0]!.id;
    }
    renderLessons();
    renderStudy();
  });

  function resetSound(): void {
    zones = neckZones(rootPc, scale, context.session.tuning);
    zoneIndex = 0;
    revealStudy = false;
    renderMap();
    renderLessons();
    renderStudy();
  }

  function filteredLessons(): RiffLesson[] {
    return lessonLevel === 'all'
      ? RIFF_LESSONS
      : RIFF_LESSONS.filter((lesson) => lesson.level === lessonLevel);
  }

  function activeZone(): NeckZone {
    return zones[Math.max(0, Math.min(zones.length - 1, zoneIndex))] ?? {
      index: 0,
      id: 'zone-1',
      startFret: 0,
      highFret: 4,
      anchorDegree: 0,
      anchorName: pcToName(rootPc),
      box: scaleBox(rootPc, scale, context.session.tuning, 0, 4),
    };
  }

  function activeLesson(): RiffLesson {
    return RIFF_LESSONS.find((lesson) => lesson.id === selectedLessonId)
      ?? RIFF_LESSONS[0]!;
  }

  function activeStudy(): RiffStudy {
    return buildRiffStudy(activeLesson(), activeZone(), rootPc, scale, adaptiveBpm ?? 88);
  }

  // ---- neck map -----------------------------------------------------------

  function renderMap(): void {
    clear(zoneHost);
    clear(mapHost);

    if (!zones.length) {
      mapHost.appendChild(h('p', { class: 'muted', text: 'I could not build a useful neck map in this tuning.' }));
      return;
    }

    zones.forEach((zone, index) => {
      zoneHost.appendChild(button(
        `Zone ${index + 1} · fret ${zone.startFret}`,
        () => {
          zoneIndex = index;
          revealStudy = false;
          renderMap();
          renderStudy();
        },
        `riff-zone-btn${index === zoneIndex ? ' is-on' : ''}`,
      ));
    });

    const zone = activeZone();
    const roots = rootLocations(rootPc, context.session.tuning, 12);
    const noteNames = scaleNoteNames(rootPc, scale);

    const run = scaleRun(rootPc, scale, context.session.tuning, zone.startFret, 4);
    const runEvents = eventsFromRun(run);

    mapHost.append(
      h('div', { class: 'riff-map-copy' },
        h('div', {},
          h('span', { class: 'badge', text: `${ROOTS[rootPc]} ${scale.name}` }),
          h('h3', { text: `Zone ${zone.index + 1}: frets ${zone.startFret}–${zone.highFret}` }),
          h('p', { text: scale.sound }),
          h('p', { class: 'muted', text: `Notes: ${noteNames.join(' · ')}. The highlighted roots are ${ROOTS[rootPc]} — your “home” landmarks.` }),
        ),
        h('div', { class: 'riff-root-locations' },
          h('strong', { text: `${ROOTS[rootPc]} roots through fret 12` }),
          h('div', { class: 'known-skill-strip' },
            ...roots.map((root) =>
              h('span', { class: 'badge', text: `string ${root.stringNumber} · fret ${root.fret}` })),
          ),
        ),
      ),
      h('div', { class: 'riff-zone-diagram' }, scaleDiagram(zone.box, context.session.tuning)),
      h('div', { class: 'practice-actions' },
        button('Hear this zone up + down', () => { void context.player.play(runEvents); }, 'btn-primary'),
        button('Previous zone', () => {
          zoneIndex = (zoneIndex - 1 + zones.length) % zones.length;
          revealStudy = false;
          renderMap();
          renderStudy();
        }, 'btn-quiet'),
        button('Move one zone up →', () => {
          zoneIndex = (zoneIndex + 1) % zones.length;
          revealStudy = false;
          renderMap();
          renderStudy();
        }, 'btn-quiet'),
      ),
      h('details', { class: 'section riff-whole-neck' },
        h('summary', { text: 'Show the whole first 12 frets' }),
        h('p', { class: 'muted', text: 'Do not memorize this as one giant picture. Use it to notice how the small zones overlap and where the roots repeat.' }),
        scaleDiagram(scaleBox(rootPc, scale, context.session.tuning, 0, 12), context.session.tuning),
      ),
    );
  }

  // ---- original phrase curriculum ----------------------------------------

  function renderLessons(): void {
    clear(lessonHost);
    const pool = filteredLessons();
    lessonHost.appendChild(h('div', { class: 'riff-lesson-strip' },
      ...pool.map((lesson) =>
        h('button', {
          class: `riff-lesson-chip${lesson.id === selectedLessonId ? ' is-on' : ''}`,
          type: 'button',
          onClick: () => {
            selectedLessonId = lesson.id;
            revealStudy = false;
            renderLessons();
            renderStudy();
          },
        },
        h('span', { class: 'riff-lesson-level', text: lesson.level }),
        h('strong', { text: lesson.name }),
        h('span', { text: lesson.focus }))),
    ));
  }

  function playWithRow(events: NoteEvent[], row: HTMLElement, speed = 1): void {
    void context.player.play(events, {
      speed,
      onNote: (index) => highlightNote(row, index),
      onEnd: () => highlightNote(row, null),
    });
  }

  async function startAttempt(
    target: NoteEvent[],
    label: string,
    meta: {
      source: 'riff-school' | 'my-riff';
      targetId: string;
      lessonId?: string;
      zoneIndex?: number;
      startFret?: number;
    } = { source: 'riff-school', targetId: label },
  ): Promise<void> {
    if (!context.listening) await context.startListening();
    attemptStartMs = context.session.currentTimeMs;
    attemptTarget = target;
    attemptLabel = label;
    attemptMeta = meta;
    replace(feedbackHost,
      h('p', { class: 'coaching', text: `Listening for ${label}. Play it once, leave a short pause, then press Check my take.` }),
    );
  }

  function practiceSlice(notes: NoteEvent[], center: number): NoteEvent[] {
    const from = Math.max(0, center - 1);
    const to = Math.min(notes.length, center + 2);
    const slice = notes.slice(from, to);
    if (!slice.length) return [];
    const origin = slice[0]!.startMs;
    return slice.map((note) => ({ ...note, startMs: note.startMs - origin }));
  }

  function checkAttempt(): void {
    if (attemptStartMs === null || !attemptTarget) {
      replace(feedbackHost, h('p', { class: 'muted', text: 'Start an attempt first.' }));
      return;
    }

    const attempt = context.session.memory.all()
      .filter((note) => note.startMs >= attemptStartMs!);
    const result = practiceAttempt(attemptTarget, attempt, {
      requiredAccuracy: .82,
      tempoTolerance: .28,
    });
    const passed = result.accuracy >= .82 && Math.abs(result.tempoRatio - 1) <= .32;

    const meta = attemptMeta ?? { source: 'riff-school' as const, targetId: attemptLabel || 'unknown' };
    playerModel.recordPractice(practiceObservation({
      source: meta.source,
      targetId: meta.targetId,
      ...(meta.lessonId ? { lessonId: meta.lessonId } : {}),
      scaleId: scale.id,
      rootPc,
      ...(typeof meta.zoneIndex === 'number' ? { zoneIndex: meta.zoneIndex } : {}),
      ...(typeof meta.startFret === 'number' ? { startFret: meta.startFret } : {}),
      reference: attemptTarget,
      attempt,
      accuracy: result.accuracy,
      tempoRatio: result.tempoRatio,
      passed,
      firstMistakeIndex: result.firstMistakeIndex,
    }));
    const nextAdaptive = recommendAdaptiveTask(buildPlayerProfile(playerModel.load()));

    clear(feedbackHost);
    feedbackHost.append(
      h('p', { class: `coaching${passed ? ' is-nailed' : ''}`,
        text: `${Math.round(result.accuracy * 100)}% note match. ${result.feedback.join(' ')}` }),
    );

    if (passed) {
      feedbackHost.appendChild(h('p', { class: 'muted', text: 'Good. Do not grind it to death — now move it, change it, or use it. Coach remembered this attempt.' }));
      if (linkedSkillId && curriculum) {
        curriculum.record([{
          skillId: linkedSkillId,
          quality: Math.max(.82, result.accuracy),
          at: Date.now(),
          source: 'drill',
        }]);
      }
    }

    feedbackHost.appendChild(h('div', { class: 'riff-model-update' },
      h('span', { class: 'eyebrow', text: 'COACH UPDATE' }),
      h('strong', { text: nextAdaptive.title }),
      h('p', { class: 'muted', text: nextAdaptive.reason }),
    ));

    if (!passed && result.firstMistakeIndex !== null) {
      const hard = practiceSlice(attemptTarget, result.firstMistakeIndex);
      if (hard.length >= 2) {
        const hardRow = noteRow(hard);
        feedbackHost.append(
          h('div', { class: 'riff-hard-part' },
            h('strong', { text: 'Stop restarting the whole riff.' }),
            h('p', { class: 'muted', text: 'Loop the note before the first miss, the miss, and the note after it. Fix the transition, then put it back into the phrase.' }),
            hardRow,
            h('div', { class: 'practice-actions' },
              button('Hear hard part · 50%', () => playWithRow(hard, hardRow, .5), 'btn-quiet'),
              button('Hear hard part · 75%', () => playWithRow(hard, hardRow, .75), 'btn-quiet'),
              button('Practice only this chunk', () => {
                void startAttempt(hard, `${attemptLabel || 'riff'} · hard part`, {
                  ...meta,
                  targetId: `${meta.targetId}:hard-${result.firstMistakeIndex}`,
                });
              }, 'btn-primary'),
            ),
          ),
        );
      }
    }

    attemptStartMs = null;
    attemptTarget = null;
    attemptLabel = '';
    attemptMeta = null;
  }

  function variationCard(variant: DevelopedRiff, source: RiffStudy): HTMLElement {
    const row = noteRow(variant.events);
    return h('article', { class: 'riff-development-card' },
      h('strong', { text: variant.label }),
      h('p', { class: 'muted', text: variant.why }),
      row,
      h('div', { class: 'practice-actions' },
        button('Hear it', () => playWithRow(variant.events, row), 'btn-quiet'),
        button('Practice this version', () => { void startAttempt(variant.events, variant.label, {
          source: 'riff-school',
          targetId: `${source.lesson.id}:${variant.kind}`,
          lessonId: source.lesson.id,
          zoneIndex: source.zone.index,
          startFret: source.zone.startFret,
        }); }, 'btn-quiet'),
        button('Save as my riff', async () => {
          const riff = await context.library.saveRiff(variant.events, {
            name: null,
            comment: `Riff School · ${ROOTS[rootPc]} ${scale.name} · ${source.lesson.name} → ${variant.label}`,
            tags: ['riff-school', scale.id],
          });
          playerModel.recordCreative(
            variant.kind === 'ending' ? 'ending' : variant.kind,
            'riff-school',
          );
          context.say('Saved the changed version. That is the point: keep the branch you actually like.');
          selectedMyRiffId = riff.id;
          void renderMyRiffs();
        }, 'btn-primary'),
        button('Make A/B song seed', async () => {
          const a = await context.library.saveRiff(source.events, {
            comment: `Riff School · A section · ${source.lesson.name}`,
            tags: ['riff-school', scale.id],
          });
          const b = await context.library.saveRiff(variant.events, {
            comment: `Riff School · B section · ${variant.label}`,
            tags: ['riff-school', scale.id],
          });
          const name = window.prompt('Name the song seed?', 'New two-section idea');
          if (name === null || !name.trim()) return;
          const song = await context.library.createSong(name.trim());
          await context.library.addToSong(song.id, 'A section', a.id, a.currentVersionId);
          await context.library.addToSong(song.id, 'B section', b.id, b.currentVersionId);
          playerModel.recordCreative(
            variant.kind === 'ending' ? 'ending' : variant.kind,
            'riff-school',
          );
          playerModel.recordCreative('song-seed', 'riff-school');
          context.say('Made a two-section song seed from one motif and one deliberate change.');
          context.navigate('seeds');
        }, 'btn-quiet'),
      ),
    );
  }

  function renderStudy(): void {
    clear(studyHost);
    const study = activeStudy();
    const zone = activeZone();
    if (!study.events.length) return;

    const row = noteRow(study.events);
    const tab = renderTab(study.positions, context.session.tuning);
    const nextZone = zones[(zoneIndex + 1) % zones.length];
    const moved = nextZone
      ? buildRiffStudy(study.lesson, nextZone, rootPc, scale, adaptiveBpm ?? 88)
      : null;
    const variants = developStudy(study, scale, rootPc);

    const reveal = h('div', { class: 'riff-reveal-host' });
    const drawReveal = () => {
      clear(reveal);
      if (!revealStudy) {
        reveal.appendChild(h('div', { class: 'riff-ear-first' },
          h('strong', { text: 'Ear first.' }),
          h('p', { class: 'muted', text: 'Hear it a few times, try to find the first couple notes yourself, then reveal the route. This is how sound starts connecting to the neck.' }),
          button('Reveal exact route', () => { revealStudy = true; drawReveal(); }, 'btn-quiet'),
        ));
        return;
      }
      reveal.append(
        h('p', { class: 'muted', text: 'This is the exact route for this study. The microphone can verify the pitches; it cannot prove which duplicate fret you used.' }),
        fretboardDiagram(study.positions, context.session.tuning),
        tabBlock(tab),
        h('div', { class: 'riff-role-row' },
          ...study.noteNames.map((name, index) =>
            h('span', { class: 'riff-role-chip', text: `${name} · ${study.roles[index] ?? 'color'}` })),
        ),
      );
    };
    drawReveal();

    const movedHost = h('div', { class: 'riff-moved-host' });

    studyHost.appendChild(h('article', { class: 'riff-study-card' },
      h('div', { class: 'riff-study-head' },
        h('div', {},
          h('span', { class: 'badge', text: `${study.lesson.level} · Zone ${zone.index + 1}` }),
          h('h3', { text: study.lesson.name }),
          h('p', { class: 'lede', text: study.lesson.focus }),
        ),
        h('span', { class: 'riff-fret-badge', text: `frets ${zone.startFret}–${zone.highFret}` }),
      ),
      h('div', { class: 'riff-teacher-copy' },
        h('p', {}, h('strong', { text: 'Do this: ' }), study.lesson.instruction),
        h('p', {}, h('strong', { text: 'Listen for: ' }), study.lesson.listenFor),
      ),
      row,
      h('div', { class: 'practice-actions riff-hear-actions' },
        button('Hear it', () => playWithRow(study.events, row), 'btn-primary'),
        button('75%', () => playWithRow(study.events, row, .75), 'btn-quiet'),
        button('50%', () => playWithRow(study.events, row, .5), 'btn-quiet'),
        button('Try it by ear', () => { void startAttempt(study.events, study.lesson.name, {
          source: 'riff-school',
          targetId: study.lesson.id,
          lessonId: study.lesson.id,
          zoneIndex: zone.index,
          startFret: zone.startFret,
        }); }, 'btn-quiet'),
        button('Check my take', checkAttempt, 'btn-quiet'),
      ),
      reveal,
      nextZone ? h('div', { class: 'riff-connect-callout' },
        h('p', { class: 'eyebrow', text: 'CONNECT THE NECK' }),
        h('h4', { text: `Now move the same musical idea to Zone ${nextZone.index + 1}.` }),
        h('p', { class: 'muted', text: `Same concept, new neighborhood around fret ${nextZone.startFret}. This is how a box turns into a fretboard.` }),
        h('div', { class: 'practice-actions' },
          button(`Show Zone ${nextZone.index + 1} version`, () => {
            clear(movedHost);
            if (!moved) return;
            const movedRow = noteRow(moved.events);
            movedHost.append(
              scaleDiagram(nextZone.box, context.session.tuning),
              fretboardDiagram(moved.positions, context.session.tuning),
              tabBlock(renderTab(moved.positions, context.session.tuning)),
              movedRow,
              h('div', { class: 'practice-actions' },
                button('Hear moved version', () => playWithRow(moved.events, movedRow), 'btn-primary'),
                button('Practice moved version', () => { void startAttempt(moved.events, `${study.lesson.name} in Zone ${nextZone.index + 1}`, {
                  source: 'riff-school',
                  targetId: study.lesson.id,
                  lessonId: study.lesson.id,
                  zoneIndex: nextZone.index,
                  startFret: nextZone.startFret,
                }); }, 'btn-quiet'),
                button('Make this my active zone', () => {
                  zoneIndex = nextZone.index;
                  revealStudy = true;
                  renderMap();
                  renderStudy();
                }, 'btn-quiet'),
              ),
            );
          }, 'btn-primary'),
        ),
        movedHost,
      ) : null,
      h('div', { class: 'riff-development' },
        h('p', { class: 'eyebrow', text: 'SONGWRITING MOVE' }),
        h('h4', { text: 'Change one thing. Keep the identity.' }),
        h('p', { class: 'muted', text: 'This is motif development: rhythm, ending, space, or register. Audition the branches instead of generating a totally unrelated riff.' }),
        h('div', { class: 'riff-development-grid' },
          ...variants.map((variant) => variationCard(variant, study)),
        ),
      ),
    ));
  }

  // ---- player's own riffs -------------------------------------------------

  async function renderMyRiffs(): Promise<void> {
    clear(myRiffsHost);
    const riffs = await context.library.listRiffs();
    if (disposed) return;

    if (!riffs.length) {
      myRiffsHost.append(
        h('p', { class: 'muted', text: 'No saved riffs yet. In Coach, play an idea and use “Practice this riff,” or save one of the original studies above.' }),
        button('Go play into Coach', () => context.navigate('session'), 'btn-primary'),
      );
      return;
    }

    if (!selectedMyRiffId || !riffs.some((riff) => riff.id === selectedMyRiffId)) {
      selectedMyRiffId = riffs[0]!.id;
    }

    const select = h('select', { class: 'select my-riff-select' }) as HTMLSelectElement;
    riffs.forEach((riff) => select.appendChild(h('option', {
      value: riff.id,
      text: riff.name ?? `unnamed riff · ${riff.versions.length} version${riff.versions.length === 1 ? '' : 's'}`,
      selected: riff.id === selectedMyRiffId,
    })));
    select.value = selectedMyRiffId;
    select.addEventListener('change', () => {
      selectedMyRiffId = select.value;
      void renderMyRiffs();
    });

    const riff = riffs.find((item) => item.id === selectedMyRiffId)!;
    const notes = currentRiffNotes(riff);
    const positions = inferFingering(notes.map((note) => note.midi), {
      tuning: context.session.tuning,
      maxFret: 18,
    });
    const row = noteRow(notes);

    myRiffsHost.append(
      h('div', { class: 'my-riff-picker' },
        h('label', { class: 'field' }, 'Practice ', select),
        h('span', { class: 'badge', text: `${notes.length} notes` }),
      ),
      h('div', { class: 'my-riff-workbench' },
        row,
        h('div', { class: 'practice-actions' },
          button('Hear it', () => playWithRow(notes, row), 'btn-primary'),
          button('75%', () => playWithRow(notes, row, .75), 'btn-quiet'),
          button('50%', () => playWithRow(notes, row, .5), 'btn-quiet'),
          button('Start my attempt', () => { void startAttempt(notes, riff.name ?? 'your saved riff', {
            source: 'my-riff',
            targetId: riff.id,
          }); }, 'btn-quiet'),
          button('Check my take', checkAttempt, 'btn-quiet'),
        ),
        h('details', { class: 'section' },
          h('summary', { text: 'Show a probable low-travel fingering + tab' }),
          h('p', { class: 'muted', text: 'Pitch alone cannot reveal the exact string you originally used. This is one playable route for practicing the phrase.' }),
          fretboardDiagram(positions, context.session.tuning),
          tabBlock(renderTab(positions, context.session.tuning)),
        ),
        button('Open version history', () => context.navigate('library', { riff: riff.id }), 'btn-quiet'),
      ),
    );
  }

  // ---- progression from Live Coach ---------------------------------------

  function renderLiveHarmony(): void {
    clear(liveHarmonyHost);
    if (incomingProgression.length < 2) {
      liveHarmonyHost.append(
        h('div', { class: 'riff-coach-bridge' },
          h('p', { text: 'This section stays empty on purpose until the harmony comes from your own playing.' }),
          button('Open Live Coach', () => context.navigate('session'), 'btn-primary'),
        ),
      );
      return;
    }

    const labels = incomingProgression.map((chord) => chord.label).join(' → ');
    const scaleMidis = scaleBox(rootPc, scale, context.session.tuning, activeZone().startFret, 7)
      .positions
      .map((position) => position.midi)
      .filter((midi, index, all) => all.indexOf(midi) === index)
      .sort((a, b) => a - b);

    const leadHost = h('div', { class: 'riff-live-lead' });
    let variant = 0;

    const drawLead = () => {
      clear(leadHost);
      const lead = leadOverProgression(incomingProgression, scaleMidis, variant);
      const row = noteRow(lead);
      const positions = inferFingering(lead.map((note) => note.midi), {
        tuning: context.session.tuning,
        maxFret: 18,
      });
      leadHost.append(
        h('div', { class: 'riff-live-lead-head' },
          h('strong', { text: `Lead idea ${String.fromCharCode(65 + variant)}` }),
          h('span', { class: 'muted', text: variant === 0
            ? 'Targets roots and strong chord notes.'
            : variant === 1
              ? 'Starts higher and leans into chord color.'
              : 'Uses more space and answers downward.' }),
        ),
        row,
        h('div', { class: 'practice-actions' },
          button('Hear progression', () => { void context.player.play(progressionNotes(incomingProgression)); }, 'btn-quiet'),
          button('Hear lead', () => playWithRow(lead, row), 'btn-primary'),
          button('Another lead', () => { variant = (variant + 1) % 3; drawLead(); }, 'btn-quiet'),
          button('Practice this lead', () => { void startAttempt(lead, `lead over ${labels}`, {
            source: 'riff-school',
            targetId: `harmony:${labels}`,
          }); }, 'btn-quiet'),
          button('Save this lead', async () => {
            const riff = await context.library.saveRiff(lead, {
              comment: `Riff School · written over ${labels}`,
              tags: ['riff-school', 'harmony'],
            });
            selectedMyRiffId = riff.id;
            playerModel.recordCreative('harmony', 'riff-school');
            context.say('Saved the lead. Now change it until it stops sounding like the app and starts sounding like you.');
            void renderMyRiffs();
          }, 'btn-quiet'),
        ),
        h('details', { class: 'section' },
          h('summary', { text: 'Show a playable route' }),
          fretboardDiagram(positions, context.session.tuning),
          tabBlock(renderTab(positions, context.session.tuning)),
        ),
      );
    };

    liveHarmonyHost.append(
      h('div', { class: 'riff-live-progression' },
        h('strong', { text: labels }),
        h('p', { class: 'muted', text: `Using ${ROOTS[rootPc]} ${scale.name} as the current melodic palette.` }),
      ),
      leadHost,
    );
    drawLead();
  }

  // ---- initial render -----------------------------------------------------

  replace(feedbackHost,
    h('p', { class: 'muted', text: 'Choose a phrase, hear it, then start an attempt when you want the microphone to compare your take.' }),
  );
  renderMap();
  renderLessons();
  renderStudy();
  void renderMyRiffs();
  renderLiveHarmony();

  return {
    element,
    update() {},
    onNotes() {},
    dispose() { disposed = true; },
  };
}
