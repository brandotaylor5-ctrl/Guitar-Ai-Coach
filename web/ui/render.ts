/** Shared pieces of interface: note rows, tab, fretboard diagrams, explanations. */

import type { FretPosition, NoteEvent, PhraseAnalysis } from '../../src/types.ts';
import type { Explanation } from '../../src/explain/explain.ts';
import type { Tuning } from '../../src/music/fretboard.ts';
import { STANDARD_TUNING } from '../../src/music/fretboard.ts';
import { midiToName } from '../../src/music/notes.ts';
import { h, svg } from './dom.ts';

/** A row of note names, each individually addressable so playback can light them up. */
export function noteRow(notes: NoteEvent[], className = ''): HTMLElement {
  const row = h('div', { class: `note-row ${className}`.trim() });
  notes.forEach((note, index) => {
    if (index > 0) row.appendChild(h('span', { class: 'note-arrow', text: '→' }));
    row.appendChild(h('span', { class: 'note', text: midiToName(note.midi), dataset: { index } }));
  });
  return row;
}

/** Light up one note of a row rendered by `noteRow`, clearing the rest. */
export function highlightNote(row: HTMLElement, index: number | null): void {
  for (const node of row.querySelectorAll('.note')) node.classList.remove('is-playing');
  if (index === null) return;
  row.querySelector(`.note[data-index="${index}"]`)?.classList.add('is-playing');
}

export function tabBlock(tab: string): HTMLElement {
  return h('pre', { class: 'tab', text: tab });
}

const STRING_LABELS = ['E', 'A', 'D', 'G', 'B', 'e'];

/**
 * A fretboard diagram of where the fingers probably went, numbered in playing
 * order. Beginners can read this when they cannot yet read tab.
 */
export function fretboardDiagram(positions: FretPosition[], tuning: Tuning = STANDARD_TUNING): SVGElement {
  const stringCount = tuning.strings.length;
  const fretted = positions.filter((p) => p.fret > 0).map((p) => p.fret);
  const lowest = fretted.length ? Math.max(1, Math.min(...fretted)) : 1;
  const highest = fretted.length ? Math.max(...fretted) : 4;
  // Always show a window a hand can actually cover.
  const first = Math.max(1, Math.min(lowest, highest - 3));
  const last = Math.max(first + 3, highest);
  const fretCount = last - first + 1;

  const openGutter = 22;
  const padX = 30 + openGutter;
  const padY = 18;
  const fretWidth = 46;
  const stringGap = 22;
  const width = padX + fretCount * fretWidth + 26;
  // Extra room at the bottom so a marker showing several visit numbers cannot
  // grow into the row of fret numbers.
  const height = padY * 2 + (stringCount - 1) * stringGap + 26;

  const root = svg('svg', {
    class: 'fretboard', viewBox: `0 0 ${width} ${height}`, width, height,
    role: 'img', 'aria-label': 'Fretboard diagram of the probable fingering',
  });

  // Strings run left to right, lowest-pitched at the bottom.
  for (let s = 0; s < stringCount; s++) {
    const y = padY + (stringCount - 1 - s) * stringGap;
    root.appendChild(svg('line', {
      x1: padX, y1: y, x2: padX + fretCount * fretWidth, y2: y,
      class: 'fb-string', 'stroke-width': 1 + (stringCount - 1 - s) * 0.18,
    }));
    const label = svg('text', { x: 10, y: y + 4, class: 'fb-label' });
    label.textContent = STRING_LABELS[s] ?? String(s + 1);
    root.appendChild(label);
  }

  for (let f = 0; f <= fretCount; f++) {
    const x = padX + f * fretWidth;
    root.appendChild(svg('line', {
      x1: x, y1: padY, x2: x, y2: padY + (stringCount - 1) * stringGap,
      class: f === 0 && first === 1 ? 'fb-nut' : 'fb-fret',
    }));
  }

  for (let f = 0; f < fretCount; f++) {
    const text = svg('text', {
      x: padX + f * fretWidth + fretWidth / 2,
      y: padY + (stringCount - 1) * stringGap + 24,
      class: 'fb-fretnum', 'text-anchor': 'middle',
    });
    text.textContent = String(first + f);
    root.appendChild(text);
  }

  // A riff usually returns to the same spot more than once. Drawing one marker
  // per note would stack them, hiding the earlier numbers underneath the later
  // ones — so each place gets a single marker listing every time it is played.
  const visits = new Map<string, { position: FretPosition; order: number[] }>();
  positions.forEach((position, index) => {
    const key = `${position.string}:${position.fret}`;
    const existing = visits.get(key);
    if (existing) existing.order.push(index + 1);
    else visits.set(key, { position, order: [index + 1] });
  });

  for (const { position, order } of visits.values()) {
    const y = padY + (stringCount - 1 - position.string) * stringGap;
    const label = order.join(',');
    const radius = 8 + Math.max(0, label.length - 1) * 1.7;
    const open = position.fret === 0;
    const x = open
      ? padX - openGutter / 2 - 4
      : padX + (position.fret - first) * fretWidth + fretWidth / 2;

    root.appendChild(svg('circle', { cx: x, cy: y, r: radius, class: open ? 'fb-open' : 'fb-dot' }));
    const text = svg('text', {
      x, y: y + 3.5, 'text-anchor': 'middle',
      class: `fb-dotnum${open ? ' fb-opennum' : ''}`,
      'font-size': label.length > 3 ? 8 : 10,
    });
    text.textContent = label;
    root.appendChild(text);
  }

  return root;
}

/**
 * Plain language first, theory behind a disclosure that starts closed. The
 * ordering here is the product philosophy, not a layout preference.
 */
export function explanationBlock(explanation: Explanation): HTMLElement {
  const block = h('div', { class: 'explanation' },
    h('p', { class: 'explanation-headline', text: explanation.headline }),
    ...explanation.plain.map((line) => h('p', { class: 'explanation-line', text: line })),
  );

  if (explanation.theory.length) {
    block.appendChild(h('details', { class: 'theory' },
      h('summary', { text: 'If you want the names for it' }),
      ...explanation.theory.map((line) => h('p', { text: line })),
    ));
  }
  return block;
}

/** Key, tempo and take-quality, with confidence shown rather than hidden. */
export function analysisFacts(analysis: PhraseAnalysis): HTMLElement {
  const facts: Array<[string, string]> = [];

  facts.push([
    'Sounds like',
    analysis.scale.confidence >= 0.6 ? analysis.scale.label
      : analysis.scale.confidence >= 0.35 ? `maybe ${analysis.scale.label}`
        : 'not enough to tell yet',
  ]);
  if (analysis.rhythm.bpm > 0 && analysis.rhythm.confidence > 0.5) {
    facts.push(['Tempo', `${Math.round(analysis.rhythm.bpm)} bpm`]);
  }
  facts.push(['Notes', String(analysis.phrase.notes.length)]);
  facts.push(['Take quality', `${Math.round(analysis.quality.score * 100)}%`]);

  return h('dl', { class: 'facts' },
    ...facts.flatMap(([term, value]) => [
      h('dt', { text: term }), h('dd', { text: value }),
    ]),
  );
}

export function button(label: string, onClick: () => void, className = ''): HTMLButtonElement {
  return h('button', { class: `btn ${className}`.trim(), type: 'button', onClick, text: label });
}

export function empty(message: string): HTMLElement {
  return h('p', { class: 'empty', text: message });
}
