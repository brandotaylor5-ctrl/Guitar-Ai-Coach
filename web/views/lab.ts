/**
 * Riff Lab: an interactive playground for scales, generated practice riffs and
 * immediate play-back feedback. This is intentionally hands-on: hear it, see
 * it, try it, then get one actionable coaching note.
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
];

interface RiffTemplate {
  name: string;
  feel: string;
  degrees: number[];
  rhythm: number[];
}

const TEMPLATES: RiffTemplate[] = [
  { name: 'Drone & Answer', feel: 'Low home note, then a little reply above it.', degrees: [0, 2, 0, 3, 2, 0], rhythm: [1, .5, .5, .75, .75, 1.5] },
  { name: 'Three-Step Hook', feel: 'A compact shape that sounds like an actual hook instead of an exercise.', degrees: [0, 1, 2, 1, 0, 4, 2, 0], rhythm: [.5,.5,1,.5,.5,1,.5,1.5] },
  { name: 'Descending Turn', feel: 'Starts high, folds inward, and resolves without feeling too neat.', degrees: [5, 4, 2, 3, 1, 2, 0], rhythm: [.5,.5,.75,.25,.5,.5,1.5] },
  { name: 'Pedal Tone', feel: 'Keeps touching home while the upper note changes around it.', degrees: [0, 3, 0, 4, 0, 2, 0, 1, 0], rhythm: [.5,.5,.5,.5,.5,.5,.5,.5,1] },
  { name: 'Call / Response', feel: 'Two short ideas that feel like they are talking to each other.', degrees: [0, 2, 3, 2, 5, 4, 2, 0], rhythm: [.5,.5,1,1,.5,.5,.75,1.25] },
  { name: 'Late-Night Loop', feel: 'A darker repeating cell with one note that changes the color.', degrees: [0, 2, 4, 2, 1, 2, 4, 2], rhythm: [.75,.25,.5,.5,.75,.25,.5,1] },
  { name: 'Open-Space Climb', feel: 'Leaves room between notes so the guitar can ring.', degrees: [0, 1, 3, 2, 4, 3, 5], rhythm: [1,.5,1,.5,1,.5,1.5] },
  { name: 'Blue-Collar Shuffle', feel: 'A lopsided little bounce that is fun to repeat faster.', degrees: [0, 1, 2, 0, 3, 2, 1, 0], rhythm: [.5,.25,.75,.5,.5,.25,.75,1] },
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
  return template.degrees.map((degree, i) => {
    const midi = notes[Math.max(0, Math.min(notes.length - 1, degree))]!;
    const duration = template.rhythm[i] ?? .5;
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

function progression(rootPc: number, minor: boolean): string[][] {
  const names = ROOTS;
  const chord = (offset: number, quality: string) => `${names[(rootPc + offset) % 12]}${quality}`;
  return minor ? [
    [chord(0,'m'), chord(8,''), chord(3,''), chord(10,'')],
    [chord(0,'m'), chord(5,'m'), chord(8,''), chord(7,'')],
    [chord(0,'m'), chord(10,''), chord(8,''), chord(10,'')],
  ] : [
    [chord(0,''), chord(7,''), chord(9,'m'), chord(5,'')],
    [chord(0,''), chord(5,''), chord(9,'m'), chord(7,'')],
    [chord(9,'m'), chord(5,''), chord(0,''), chord(7,'')],
  ];
}

export function labView(context: AppContext): View {
  let rootPc = 4; // E
  let scale = SCALE_TYPES[0]!;
  let selected = 0;
  let practiceStartMs: number | null = null;
  let currentRiffs: NoteEvent[][] = [];

  const rootSelect = h('select', { class: 'select' }) as HTMLSelectElement;
  ROOTS.forEach((name, pc) => rootSelect.appendChild(h('option', { value: pc, text: name, selected: pc === rootPc })));
  const scaleSelect = h('select', { class: 'select' }) as HTMLSelectElement;
  SCALE_TYPES.forEach((item) => scaleSelect.appendChild(h('option', { value: item.id, text: item.label, selected: item.id === scale.id })));

  const scaleHost = h('div', { class: 'lab-scale-host' });
  const riffsHost = h('div', { class: 'lab-riffs' });
  const detailHost = h('div', { class: 'lab-detail' });
  const progressionsHost = h('div', { class: 'lab-progressions' });
  const practiceHost = h('div', { class: 'lab-practice-feedback muted', text: 'Pick a riff, hear it, then let the app listen to your attempt.' });

  const element = h('div', { class: 'view view-lab' },
    h('section', { class: 'panel lab-hero' },
      h('div', {},
        h('p', { class: 'lab-kicker', text: 'RIFF LAB' }),
        h('h2', { text: 'Learn the fretboard by making music with it.' }),
        h('p', { class: 'muted', text: 'Choose a sound, hear the notes, steal a riff shape, slow it down, loop it, and have the app check your take.' }),
      ),
      h('div', { class: 'lab-controls' },
        h('label', {}, 'Key ', rootSelect),
        h('label', {}, 'Scale ', scaleSelect),
      ),
    ),
    h('section', { class: 'panel' },
      h('h3', { text: 'Scale explorer' }),
      h('p', { class: 'muted', text: 'Tap any note to hear it. The diagram shows practical places your hand can find this sound in the current tuning.' }),
      scaleHost,
    ),
    h('section', { class: 'panel' },
      h('div', { class: 'lab-section-head' },
        h('div', {}, h('h3', { text: 'Riff shelf' }), h('p', { class: 'muted', text: 'These are generated from the scale you chose, not copied from songs.' })),
        button('Shuffle the shelf', () => { selected = (selected + 3) % TEMPLATES.length; render(); }, 'btn-quiet'),
      ),
      riffsHost,
      detailHost,
      h('div', { class: 'lab-practice-box' },
        h('h4', { text: 'TRY IT' }),
        practiceHost,
      ),
    ),
    h('section', { class: 'panel' },
      h('h3', { text: 'Progression playground' }),
      h('p', { class: 'muted', text: 'Common places this key can go. Use these as doors, not rules.' }),
      progressionsHost,
    ),
  );

  rootSelect.addEventListener('change', () => { rootPc = Number(rootSelect.value); render(); });
  scaleSelect.addEventListener('change', () => { scale = SCALE_TYPES.find((x) => x.id === scaleSelect.value) ?? SCALE_TYPES[0]!; render(); });

  function renderScale(): void {
    clear(scaleHost);
    const midis = scaleMidis(rootPc, scale.degrees, context.session.tuning.strings[0]!);
    const firstOctave = midis.slice(0, scale.degrees.length + 1);
    scaleHost.appendChild(h('div', { class: 'lab-note-buttons' },
      ...firstOctave.map((midi, i) => button(
        `${midiToName(midi)}${i === 0 ? ' · HOME' : ''}`,
        () => { void context.player.playNote(midi); },
        i === 0 ? 'btn-primary' : 'btn-quiet',
      )),
    ));
    const positions = inferFingering(firstOctave, { tuning: context.session.tuning, maxFret: 12 });
    scaleHost.appendChild(fretboardDiagram(positions, context.session.tuning));
  }

  function renderRiffs(): void {
    const midis = scaleMidis(rootPc, scale.degrees, context.session.tuning.strings[0]!);
    currentRiffs = TEMPLATES.map((template) => riffFromTemplate(template, midis));
    clear(riffsHost);
    riffsHost.appendChild(h('div', { class: 'lab-riff-grid' },
      ...TEMPLATES.map((template, i) => h('button', {
        class: `lab-riff-card${i === selected ? ' is-active' : ''}`,
        type: 'button',
        onClick: () => { selected = i; renderDetail(); renderRiffs(); },
      }, h('strong', { text: template.name }), h('span', { text: template.feel }))),
    ));
    renderDetail();
  }

  function renderDetail(): void {
    const notes = currentRiffs[selected];
    if (!notes) return;
    const template = TEMPLATES[selected]!;
    clear(detailHost);
    const row = noteRow(notes);
    const positions = inferFingering(notes.map((n) => n.midi), { tuning: context.session.tuning });
    const hear = async (speed = 1) => {
      await context.player.play(notes, {
        speed,
        onNote: (index) => highlightNote(row, index),
        onEnd: () => highlightNote(row, null),
      });
    };
    detailHost.appendChild(h('article', { class: 'lab-selected-riff' },
      h('div', { class: 'lab-selected-copy' }, h('h3', { text: template.name }), h('p', { class: 'muted', text: template.feel })),
      row,
      h('div', { class: 'lab-riff-actions' },
        button('Hear it', () => { void hear(1); }, 'btn-primary'),
        button('75%', () => { void hear(.75); }, 'btn-quiet'),
        button('50%', () => { void hear(.5); }, 'btn-quiet'),
        button('Save to my library', async () => {
          const riff = await context.library.saveRiff(notes, { comment: `Riff Lab · ${ROOTS[rootPc]} ${scale.label} · ${template.name}` });
          context.say('Saved to your library. Change it until it becomes yours.');
          context.navigate('library', { riff: riff.id });
        }, 'btn-quiet'),
      ),
      h('details', { class: 'section' }, h('summary', { text: 'Show tab + fingering' }),
        fretboardDiagram(positions, context.session.tuning),
        tabBlock(renderTab(positions, context.session.tuning)),
      ),
      h('div', { class: 'lab-riff-actions' },
        button('Start my attempt', async () => {
          if (!context.listening) await context.startListening();
          practiceStartMs = context.session.currentTimeMs;
          practiceHost.textContent = 'Listening to your attempt now. Play the riff once, then press Check my take.';
        }, 'btn-primary'),
        button('Check my take', () => {
          if (practiceStartMs === null) { practiceHost.textContent = 'Press Start my attempt first.'; return; }
          const attempt = context.session.memory.all().filter((n) => n.startMs >= practiceStartMs!);
          const result = practiceAttempt(notes, attempt, { requiredAccuracy: .85, tempoTolerance: .18 });
          practiceHost.textContent = `${Math.round(result.accuracy * 100)}% note match. ${result.feedback.join(' ')}`;
          practiceStartMs = null;
        }, 'btn-quiet'),
      ),
    ));
  }

  function renderProgressions(): void {
    clear(progressionsHost);
    progressionsHost.appendChild(h('div', { class: 'lab-progression-grid' },
      ...progression(rootPc, scale.minor).map((chords, i) => h('article', { class: 'lab-progression-card' },
        h('span', { class: 'muted', text: ['Big familiar loop', 'A little heavier', 'Keep it moving'][i] ?? 'Progression' }),
        h('strong', { text: chords.join('  →  ') }),
        h('p', { class: 'muted', text: 'Strum this, then improvise with the scale above and listen for which notes feel settled over each chord.' }),
      )),
    ));
  }

  function render(): void {
    renderScale();
    renderRiffs();
    renderProgressions();
  }

  render();
  return { element, update: render };
}
