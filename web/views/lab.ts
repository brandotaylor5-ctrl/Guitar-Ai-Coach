/**
 * Riff Lab: scales, musical riff shapes, progression playback and immediate
 * listen-to-my-attempt feedback. The loop is hear -> see -> play -> feedback.
 */

import type { NoteEvent } from '../../src/types.ts';
import { midiToName } from '../../src/music/notes.ts';
import { inferFingering, renderTab } from '../../src/music/fretboard.ts';
import { practiceAttempt } from '../../src/practice/practice.ts';
import { h, clear } from '../ui/dom.ts';
import { button, fretboardDiagram, noteRow, highlightNote, tabBlock } from '../ui/render.ts';
import type { AppContext, View } from './context.ts';

const ROOTS = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

const SCALE_TYPES = [
  { id: 'minor-pent', label: 'Minor pentatonic', degrees: [0, 3, 5, 7, 10], minor: true },
  { id: 'major-pent', label: 'Major pentatonic', degrees: [0, 2, 4, 7, 9], minor: false },
  { id: 'minor', label: 'Natural minor', degrees: [0, 2, 3, 5, 7, 8, 10], minor: true },
  { id: 'major', label: 'Major', degrees: [0, 2, 4, 5, 7, 9, 11], minor: false },
  { id: 'dorian', label: 'Dorian', degrees: [0, 2, 3, 5, 7, 9, 10], minor: true },
  { id: 'mixolydian', label: 'Mixolydian', degrees: [0, 2, 4, 5, 7, 9, 10], minor: false },
  { id: 'blues', label: 'Blues', degrees: [0, 3, 5, 6, 7, 10], minor: true },
];

type Level = 'easy' | 'medium' | 'stretch';

interface RiffTemplate {
  id: string;
  name: string;
  feel: string;
  level: Level;
  lesson: string;
  degrees: number[];
  rhythm: number[];
}

interface LabChord {
  label: string;
  rootPc: number;
  minor: boolean;
}

const TEMPLATES: RiffTemplate[] = [
  { id: 'drone', name: 'Drone & Answer', feel: 'Low home note, then a little reply above it.', level: 'easy', lesson: 'Hear a bass note as a floor while the melody moves.', degrees: [0, 2, 0, 3, 2, 0], rhythm: [1, .5, .5, .75, .75, 1.5] },
  { id: 'three', name: 'Three-Step Hook', feel: 'A compact shape that sounds like a hook, not an exercise.', level: 'easy', lesson: 'Repeat a small shape before adding more notes.', degrees: [0, 1, 2, 1, 0, 4, 2, 0], rhythm: [.5, .5, 1, .5, .5, 1, .5, 1.5] },
  { id: 'pedal', name: 'Pedal Tone', feel: 'Home keeps returning while an upper note changes.', level: 'easy', lesson: 'A repeated note can glue a riff together.', degrees: [0, 3, 0, 4, 0, 2, 0, 1, 0], rhythm: [.5, .5, .5, .5, .5, .5, .5, .5, 1] },
  { id: 'space', name: 'Open-Space Climb', feel: 'Leaves room between notes so the guitar can ring.', level: 'easy', lesson: 'Silence is part of the riff.', degrees: [0, 1, 3, 2, 4, 3, 5], rhythm: [1, .5, 1, .5, 1, .5, 1.5] },
  { id: 'descend', name: 'Descending Turn', feel: 'Starts high, folds inward, then lands without sounding too neat.', level: 'medium', lesson: 'A line can resolve by contour, not only by hitting home.', degrees: [5, 4, 2, 3, 1, 2, 0], rhythm: [.5, .5, .75, .25, .5, .5, 1.5] },
  { id: 'call', name: 'Call / Response', feel: 'Two short ideas that sound like they are talking.', level: 'medium', lesson: 'Think in sentences instead of endless scales.', degrees: [0, 2, 3, 2, 5, 4, 2, 0], rhythm: [.5, .5, 1, 1, .5, .5, .75, 1.25] },
  { id: 'late', name: 'Late-Night Loop', feel: 'A darker repeating cell with one color-changing note.', level: 'medium', lesson: 'Change one note and keep the rhythm recognizable.', degrees: [0, 2, 4, 2, 1, 2, 4, 2], rhythm: [.75, .25, .5, .5, .75, .25, .5, 1] },
  { id: 'shuffle', name: 'Lopsided Shuffle', feel: 'A little bounce that gets addictive when repeated.', level: 'medium', lesson: 'Uneven rhythm can create identity before pitch does.', degrees: [0, 1, 2, 0, 3, 2, 1, 0], rhythm: [.5, .25, .75, .5, .5, .25, .75, 1] },
  { id: 'skip', name: 'String-Skip Shape', feel: 'Leaps away from home and snaps back.', level: 'medium', lesson: 'Bigger interval jumps make a line feel less scalar.', degrees: [0, 4, 1, 5, 2, 4, 0], rhythm: [.5, .5, .5, .75, .25, .5, 1.5] },
  { id: 'push', name: 'Push the Downbeat', feel: 'Starts the thought early so the landing feels bigger.', level: 'medium', lesson: 'Where a note starts matters as much as which note it is.', degrees: [1, 2, 0, 3, 2, 4, 2, 0], rhythm: [.25, .25, 1, .5, .5, .5, .5, 1.5] },
  { id: 'wide', name: 'Wide-Open Fifths', feel: 'Big, plain-spoken movement with room around it.', level: 'stretch', lesson: 'Wide intervals can sound strong without many notes.', degrees: [0, 4, 0, 5, 2, 5, 1, 0], rhythm: [.75, .75, .5, .5, .75, .25, .5, 1.5] },
  { id: 'question', name: 'Question Mark', feel: 'Refuses to settle where you expect.', level: 'stretch', lesson: 'An unresolved ending can make you want the next bar.', degrees: [0, 2, 3, 4, 2, 5, 4, 3], rhythm: [.5, .5, .5, .5, .75, .25, .5, 1.5] },
  { id: 'mirror', name: 'Mirror Phrase', feel: 'Climbs, then answers with the contour turned around.', level: 'stretch', lesson: 'Reuse a contour instead of inventing eight new notes.', degrees: [0, 1, 3, 4, 4, 3, 1, 0], rhythm: [.5, .5, .75, .75, .5, .5, .75, 1.25] },
  { id: 'octave', name: 'Octave Lift', feel: 'Repeats the idea higher so the second half feels larger.', level: 'stretch', lesson: 'Register can create development without changing the idea.', degrees: [0, 1, 2, 0, 5, 6, 7, 5], rhythm: [.5, .5, .75, 1, .5, .5, .75, 1.5] },
  { id: 'threebeat', name: 'Three-Beat Cell', feel: 'A repeating cell that keeps crossing the bar line.', level: 'stretch', lesson: 'A phrase length that fights the bar can create momentum.', degrees: [0, 2, 1, 0, 2, 1, 3, 2, 1], rhythm: [.5, .5, .5, .5, .5, .5, .5, .5, 1] },
  { id: 'resolve-late', name: 'Late Resolution', feel: 'Keeps dodging home until the last possible second.', level: 'stretch', lesson: 'Delay the obvious answer to make it matter more.', degrees: [2, 3, 4, 2, 5, 3, 1, 2, 0], rhythm: [.5, .5, .5, .5, .75, .25, .5, .5, 1.5] },
];

function scaleMidis(rootPc: number, degrees: number[], tuningLow: number): number[] {
  let root = tuningLow;
  while (((root % 12) + 12) % 12 !== rootPc) root++;
  const out: number[] = [];
  for (let octave = 0; octave < 3; octave++) {
    for (const degree of degrees) out.push(root + degree + octave * 12);
  }
  return out;
}

function riffFromTemplate(template: RiffTemplate, notes: number[], beatMs = 430): NoteEvent[] {
  let cursor = 0;
  return template.degrees.map((degree, index) => {
    const midi = notes[Math.max(0, Math.min(notes.length - 1, degree))]!;
    const duration = template.rhythm[index] ?? .5;
    const event: NoteEvent = {
      midi,
      startMs: cursor,
      durationMs: Math.max(130, beatMs * duration * .78),
      confidence: 1,
      velocity: .62,
    };
    cursor += beatMs * duration;
    return event;
  });
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

function progressions(rootPc: number, minor: boolean): LabChord[][] {
  const c = (offset: number, isMinor = false) => makeChord((rootPc + offset) % 12, isMinor);
  return minor
    ? [
        [c(0, true), c(8), c(3), c(10)],
        [c(0, true), c(5, true), c(8), c(7)],
        [c(0, true), c(10), c(8), c(10)],
      ]
    : [
        [c(0), c(7), c(9, true), c(5)],
        [c(0), c(5), c(9, true), c(7)],
        [c(9, true), c(5), c(0), c(7)],
      ];
}

function nearestMidiForPc(pitchClass: number, around: number): number {
  let best = around;
  let distance = 99;
  for (let midi = 40; midi <= 84; midi++) {
    if (midi % 12 !== pitchClass) continue;
    const next = Math.abs(midi - around);
    if (next < distance) {
      best = midi;
      distance = next;
    }
  }
  return best;
}

function progressionNotes(chords: LabChord[], barMs = 1050): NoteEvent[] {
  const out: NoteEvent[] = [];
  chords.forEach((chord, index) => {
    const root = nearestMidiForPc(chord.rootPc, 50);
    const third = root + (chord.minor ? 3 : 4);
    const fifth = root + 7;
    for (const midi of [root, third, fifth]) {
      out.push({ midi, startMs: index * barMs, durationMs: barMs * .84, confidence: 1, velocity: .45 });
    }
  });
  return out;
}

function leadOverProgression(chords: LabChord[], scale: number[], variant = 0, barMs = 1050): NoteEvent[] {
  const out: NoteEvent[] = [];
  const scalePitchClasses = new Set(scale.map((midi) => midi % 12));
  let around = variant === 1 ? 64 : variant === 2 ? 52 : 57;

  const pick = (pitchClass: number): number => {
    const candidates = scale.filter((midi) => midi % 12 === pitchClass);
    const pool = candidates.length ? candidates : scale;
    const midi = pool.slice().sort((a, b) => Math.abs(a - around) - Math.abs(b - around))[0]!;
    around = midi;
    return midi;
  };

  chords.forEach((chord, index) => {
    const third = (chord.rootPc + (chord.minor ? 3 : 4)) % 12;
    const fifth = (chord.rootPc + 7) % 12;
    const chordTone = scalePitchClasses.has(third) ? third : fifth;
    const targets = variant === 1
      ? [chordTone, fifth]
      : variant === 2
        ? [fifth, chord.rootPc]
        : [chord.rootPc, chordTone];

    targets.forEach((pitchClass, targetIndex) => {
      const offset = variant === 2 && targetIndex === 1 ? .68 : targetIndex * .5;
      out.push({
        midi: pick(pitchClass),
        startMs: index * barMs + offset * barMs,
        durationMs: barMs * (variant === 2 ? .26 : .38),
        confidence: 1,
        velocity: .62,
      });
    });
  });
  return out;
}

export function labView(context: AppContext, params: Record<string, string> = {}): View {
  const requestedRoot = Number(params.root);
  let rootPc = Number.isInteger(requestedRoot) && requestedRoot >= 0 && requestedRoot <= 11 ? requestedRoot : 4;
  let scale = params.mode === 'minor'
    ? SCALE_TYPES.find((item) => item.id === 'minor')!
    : params.mode === 'major'
      ? SCALE_TYPES.find((item) => item.id === 'major')!
      : SCALE_TYPES[0]!;
  const incomingProgression = parseProgression(params.progression);
  let level: 'all' | Level = 'all';
  let selectedId = TEMPLATES[0]!.id;
  let practiceStartMs: number | null = null;
  let currentRiffs = new Map<string, NoteEvent[]>();

  const rootSelect = h('select', { class: 'select' }) as HTMLSelectElement;
  ROOTS.forEach((name, pc) => rootSelect.appendChild(h('option', { value: pc, text: name, selected: pc === rootPc })));

  const scaleSelect = h('select', { class: 'select' }) as HTMLSelectElement;
  SCALE_TYPES.forEach((item) => scaleSelect.appendChild(h('option', { value: item.id, text: item.label, selected: item.id === scale.id })));

  const levelSelect = h('select', { class: 'select' }) as HTMLSelectElement;
  [['all', 'All levels'], ['easy', 'Easy'], ['medium', 'Medium'], ['stretch', 'Stretch me']]
    .forEach(([value, label]) => levelSelect.appendChild(h('option', { value, text: label })));

  const scaleHost = h('div', { class: 'lab-scale-host' });
  const riffsHost = h('div', { class: 'lab-riffs' });
  const detailHost = h('div', { class: 'lab-detail' });
  const progressionsHost = h('div', { class: 'lab-progressions' });
  const practiceHost = h('div', { class: 'lab-practice-feedback muted', text: 'Pick a riff, hear it, then let the app listen to your attempt.' });

  const incomingPanel = incomingProgression.length >= 2
    ? h('section', { class: 'panel live-next-panel' },
        h('span', { class: 'live-hearing-label', text: 'FROM LIVE COACH' }),
        h('h3', { text: 'That progression you just played is here.' }),
        h('p', { class: 'muted', text: `${incomingProgression.map((chord) => chord.label).join(' → ')} · I’ll use these exact chords below instead of swapping in a stock loop.` }),
      )
    : h('div', {});

  const element = h('div', { class: 'view view-lab' },
    h('section', { class: 'panel lab-hero' },
      h('div', {},
        h('p', { class: 'lab-kicker', text: 'RIFF LAB' }),
        h('h2', { text: 'Turn theory into something your fingers can hear.' }),
        h('p', { class: 'muted', text: 'Choose a sound, steal a musical shape, build leads over chord loops, slow them down, and have the app check your take.' }),
      ),
      h('div', { class: 'lab-controls' },
        h('label', {}, 'Key ', rootSelect),
        h('label', {}, 'Scale ', scaleSelect),
        h('label', {}, 'Shelf ', levelSelect),
      ),
    ),
    incomingPanel,
    h('section', { class: 'panel' },
      h('h3', { text: 'Scale explorer' }),
      h('p', { class: 'muted', text: 'Tap a note to hear it. The fretboard shows practical places to find the sound in your current tuning.' }),
      scaleHost,
    ),
    h('section', { class: 'panel' },
      h('div', { class: 'lab-section-head' },
        h('div', {}, h('h3', { text: 'Riff shelf' }), h('p', { class: 'muted', text: 'Musical shapes grouped by how much they ask of your hands and ears.' })),
        button('Surprise me', () => {
          const pool = filteredTemplates();
          selectedId = pool[Math.floor(Math.random() * pool.length)]?.id ?? TEMPLATES[0]!.id;
          renderRiffs();
        }, 'btn-quiet'),
      ),
      riffsHost,
      detailHost,
      h('div', { class: 'lab-practice-box' }, h('h4', { text: 'PLAY IT BACK TO ME' }), practiceHost),
    ),
    h('section', { class: 'panel' },
      h('h3', { text: 'Progression → riff playground' }),
      h('p', { class: 'muted', text: 'Hear the harmony first. Then make different lead ideas that target notes inside those chords while staying in your chosen scale.' }),
      progressionsHost,
    ),
  );

  rootSelect.addEventListener('change', () => { rootPc = Number(rootSelect.value); render(); });
  scaleSelect.addEventListener('change', () => { scale = SCALE_TYPES.find((item) => item.id === scaleSelect.value) ?? SCALE_TYPES[0]!; render(); });
  levelSelect.addEventListener('change', () => {
    level = levelSelect.value as 'all' | Level;
    const pool = filteredTemplates();
    if (!pool.some((item) => item.id === selectedId)) selectedId = pool[0]?.id ?? TEMPLATES[0]!.id;
    renderRiffs();
  });

  function filteredTemplates(): RiffTemplate[] {
    return level === 'all' ? TEMPLATES : TEMPLATES.filter((template) => template.level === level);
  }

  function renderScale(): void {
    clear(scaleHost);
    const midis = scaleMidis(rootPc, scale.degrees, context.session.tuning.strings[0]!);
    const firstOctave = midis.slice(0, scale.degrees.length + 1);
    scaleHost.appendChild(h('div', { class: 'lab-note-buttons' },
      ...firstOctave.map((midi, index) => button(`${midiToName(midi)}${index === 0 ? ' · HOME' : ''}`, () => { void context.player.playNote(midi); }, index === 0 ? 'btn-primary' : 'btn-quiet')),
    ));
    scaleHost.appendChild(fretboardDiagram(inferFingering(firstOctave, { tuning: context.session.tuning, maxFret: 12 }), context.session.tuning));
  }

  function renderRiffs(): void {
    const midis = scaleMidis(rootPc, scale.degrees, context.session.tuning.strings[0]!);
    currentRiffs = new Map(TEMPLATES.map((template) => [template.id, riffFromTemplate(template, midis)]));
    const pool = filteredTemplates();
    if (!pool.some((item) => item.id === selectedId)) selectedId = pool[0]?.id ?? TEMPLATES[0]!.id;
    clear(riffsHost);
    const grid = h('div', { class: 'lab-riff-grid' });
    pool.forEach((template) => {
      grid.appendChild(h('button', {
        class: `lab-riff-card${template.id === selectedId ? ' is-active' : ''}`,
        type: 'button',
        onClick: () => { selectedId = template.id; renderRiffs(); },
      },
      h('span', { class: 'lab-level', text: template.level }),
      h('strong', { text: template.name }),
      h('span', { text: template.feel })));
    });
    riffsHost.appendChild(grid);
    renderDetail();
  }

  function renderDetail(): void {
    const template = TEMPLATES.find((item) => item.id === selectedId) ?? TEMPLATES[0]!;
    const notes = currentRiffs.get(template.id);
    if (!notes) return;
    clear(detailHost);
    const row = noteRow(notes);
    const positions = inferFingering(notes.map((note) => note.midi), { tuning: context.session.tuning });
    const hear = async (speed = 1) => {
      await context.player.play(notes, { speed, onNote: (index) => highlightNote(row, index), onEnd: () => highlightNote(row, null) });
    };

    detailHost.appendChild(h('article', { class: 'lab-selected-riff' },
      h('div', { class: 'lab-selected-copy' },
        h('h3', { text: template.name }),
        h('p', { class: 'muted', text: template.feel }),
        h('p', {}, h('strong', { text: 'What this teaches: ' }), template.lesson),
      ),
      row,
      h('div', { class: 'lab-riff-actions' },
        button('Hear it', () => { void hear(1); }, 'btn-primary'),
        button('75%', () => { void hear(.75); }, 'btn-quiet'),
        button('50%', () => { void hear(.5); }, 'btn-quiet'),
        button('Save to my library', async () => {
          const riff = await context.library.saveRiff(notes, { comment: `Riff Lab · ${ROOTS[rootPc]} ${scale.label} · ${template.name}` });
          context.say('Saved. Change it until it becomes yours.');
          context.navigate('library', { riff: riff.id });
        }, 'btn-quiet'),
      ),
      h('details', { class: 'section' },
        h('summary', { text: 'Show tab + fingering' }),
        fretboardDiagram(positions, context.session.tuning),
        tabBlock(renderTab(positions, context.session.tuning)),
      ),
      h('div', { class: 'lab-riff-actions' },
        button('Start my attempt', async () => {
          if (!context.listening) await context.startListening();
          practiceStartMs = context.session.currentTimeMs;
          practiceHost.textContent = 'Listening now. Play the riff once, then press Check my take.';
        }, 'btn-primary'),
        button('Check my take', () => {
          if (practiceStartMs === null) { practiceHost.textContent = 'Press Start my attempt first.'; return; }
          const attempt = context.session.memory.all().filter((note) => note.startMs >= practiceStartMs!);
          const result = practiceAttempt(notes, attempt, { requiredAccuracy: .85, tempoTolerance: .18 });
          practiceHost.textContent = `${Math.round(result.accuracy * 100)}% note match. ${result.feedback.join(' ')}`;
          practiceStartMs = null;
        }, 'btn-quiet'),
      ),
    ));
  }

  function progressionCard(chords: LabChord[], label: string, fromLive: boolean, scaleNotes: number[]): HTMLElement {
    const chordLabels = chords.map((item) => item.label).join(' → ');
    const leadHost = h('div', { class: 'lab-generated-lead' });
    let variant = 0;

    const drawLead = (): void => {
      clear(leadHost);
      const lead = leadOverProgression(chords, scaleNotes, variant);
      const leadRow = noteRow(lead);
      leadHost.append(
        h('p', {}, h('strong', { text: `Lead ${String.fromCharCode(65 + variant)}: ` }), variant === 0 ? 'aim for roots and chord color.' : variant === 1 ? 'start higher and lean on chord tones.' : 'leave more space and answer downward.'),
        leadRow,
        h('div', { class: 'lab-progression-actions' },
          button('Hear lead', () => { void context.player.play(lead, { onNote: (noteIndex) => highlightNote(leadRow, noteIndex), onEnd: () => highlightNote(leadRow, null) }); }, 'btn-quiet'),
          button('Another lead', () => { variant = (variant + 1) % 3; drawLead(); }, 'btn-quiet'),
          button('Save this lead', async () => {
            await context.library.saveRiff(lead, { comment: `Built over ${chordLabels} · ${ROOTS[rootPc]} ${scale.label}` });
            context.say('That progression-based lead is in My Riffs now.');
          }, 'btn-quiet'),
        ),
      );
    };
    drawLead();

    return h('article', { class: 'lab-progression-card' },
      h('span', { class: 'muted', text: fromLive ? 'FROM LIVE COACH · WHAT YOU PLAYED' : label }),
      h('strong', { text: chordLabels }),
      h('p', { class: 'muted', text: fromLive ? 'These are the chord roots the app heard from you. Now use them as the harmony under a riff.' : 'Hear the chords first, then hear how a lead can target chord tones without leaving the scale.' }),
      h('div', { class: 'lab-progression-actions' },
        button('Hear chords', () => { void context.player.play(progressionNotes(chords)); }, 'btn-primary'),
        button('Hear chords → lead', async () => {
          const lead = leadOverProgression(chords, scaleNotes, variant);
          await context.player.play(progressionNotes(chords));
          await context.player.play(lead);
        }, 'btn-quiet'),
      ),
      leadHost,
    );
  }

  function renderProgressions(): void {
    clear(progressionsHost);
    const scaleNotes = scaleMidis(rootPc, scale.degrees, context.session.tuning.strings[0]!);
    const labels = ['Big familiar loop', 'A little heavier', 'Keep it moving'];
    const grid = h('div', { class: 'lab-progression-grid' });

    if (incomingProgression.length >= 2) {
      grid.appendChild(progressionCard(incomingProgression, 'What you played', true, scaleNotes));
    }
    progressions(rootPc, scale.minor).forEach((chords, index) => {
      grid.appendChild(progressionCard(chords, labels[index] ?? 'Progression', false, scaleNotes));
    });
    progressionsHost.appendChild(grid);
  }

  function render(): void {
    renderScale();
    renderRiffs();
    renderProgressions();
  }

  render();
  return { element, update: render };
}
