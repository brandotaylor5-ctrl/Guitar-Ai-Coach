/** A physical, beginner-first explanation of a chord shape. */

import { chordShape, chordShapeMidis } from '../../src/music/chordShapes.ts';
import type { RiffPlayer } from '../audio/playback.ts';
import { h } from './dom.ts';
import { button } from './render.ts';

const STRING_NAMES = ['low E', 'A', 'D', 'G', 'B', 'high E'];
const SHORT_NAMES = ['E', 'A', 'D', 'G', 'B', 'e'];

function diagram(chord: string): HTMLElement {
  const shape = chordShape(chord);
  if (!shape) return h('div', { class: 'chord-shape-missing', text: `No finger map for ${chord} yet.` });

  const markerRow = h('div', { class: 'chord-diagram-row chord-diagram-markers' });
  shape.frets.forEach((fret) => markerRow.appendChild(h('span', {
    class: 'chord-marker',
    text: fret === 'x' ? '×' : fret === 0 ? '○' : '',
  })));

  const board = h('div', { class: 'chord-board', role: 'img', 'aria-label': `${shape.name} chord diagram` });
  board.appendChild(markerRow);
  for (let fret = 1; fret <= 3; fret++) {
    const row = h('div', { class: 'chord-diagram-row' });
    shape.frets.forEach((value, stringIndex) => {
      const finger = shape.fingers[stringIndex]!;
      const active = value === fret;
      row.appendChild(h('span', {
        class: `chord-cell${active ? ' has-finger' : ''}`,
        title: active ? `${STRING_NAMES[stringIndex]}, fret ${fret}, finger ${finger}` : `${STRING_NAMES[stringIndex]}, fret ${fret}`,
      }, active ? h('b', { class: 'finger-dot', text: finger }) : null));
    });
    board.appendChild(row);
  }
  board.appendChild(h('div', { class: 'chord-diagram-row chord-string-names' },
    ...SHORT_NAMES.map((name) => h('span', { text: name })),
  ));
  return board;
}

function notesForPlayback(chord: string, arpeggio = false) {
  const shape = chordShape(chord);
  if (!shape) return [];
  const notes = chordShapeMidis(shape);
  return notes.map((midi, index) => ({
    midi,
    startMs: arpeggio ? index * 260 : 0,
    durationMs: arpeggio ? 650 : 1100,
    confidence: 1,
    velocity: 0.65,
  }));
}

export interface ChordCardOptions {
  compact?: boolean;
  heading?: string;
  /** Called after the learner says the shape makes sense and wants to practise it. */
  onReady?: () => void;
}

/**
 * The invariant for beginner teaching: no chord name without a physical map.
 * This card deliberately gives redundant ways to understand the same thing —
 * picture, string/fret language, sound, then a concrete listening cue.
 */
export function chordTeachingCard(
  chord: string,
  player: RiffPlayer,
  options: ChordCardOptions = {},
): HTMLElement {
  const shape = chordShape(chord);
  if (!shape) {
    return h('section', { class: 'panel chord-teach-card' },
      h('h3', { text: options.heading ?? chord }),
      h('p', { class: 'muted', text: `I know I want you to use ${chord}, but I do not have a safe beginner finger map for it yet. I will not test you on it.` }),
    );
  }

  const actions = h('div', { class: 'practice-actions chord-sound-actions' },
    button('Hear the whole chord', () => { void player.play(notesForPlayback(chord)); }, 'btn-quiet'),
    button('Hear each string', () => { void player.play(notesForPlayback(chord, true)); }, 'btn-quiet'),
  );
  if (options.onReady) actions.appendChild(button('I have the shape — let me try it', options.onReady, 'btn-primary'));

  return h('section', { class: `panel chord-teach-card${options.compact ? ' is-compact' : ''}` },
    h('div', { class: 'chord-teach-head' },
      h('div', {},
        h('p', { class: 'eyebrow', text: 'FIRST: PUT YOUR HAND HERE' }),
        h('h2', { text: options.heading ?? shape.name }),
        shape.beginnerVoicing ? h('span', { class: 'badge', text: 'beginner voicing' }) : null,
      ),
      h('div', { class: 'chord-strum-cue', text: `Strum from string ${shape.strumFrom}` }),
    ),
    h('div', { class: 'chord-teach-layout' },
      diagram(chord),
      h('div', { class: 'chord-instructions' },
        h('ol', {}, ...shape.steps.map((step) => h('li', { text: step }))),
        h('p', { class: 'chord-listen-for' }, h('strong', { text: 'Listen for: ' }), shape.listenFor),
        shape.connection ? h('p', { class: 'muted chord-connection', text: shape.connection }) : null,
      ),
    ),
    actions,
  );
}
