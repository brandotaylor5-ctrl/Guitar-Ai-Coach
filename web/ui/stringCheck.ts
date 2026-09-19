/**
 * "Strum it and I'll tell you which string is dead."
 *
 * The thing between a beginner and a chord that sounds right is almost never
 * knowing where the fingers go — the diagram tells them that. It is that one
 * string is choked and they cannot hear which. Every app can say "that was E
 * minor". This says "your G string is not sounding, your middle finger is
 * leaning on it."
 *
 * It keeps the best reading from the last couple of seconds rather than the
 * instant one, because a strum decays and the frame you happen to catch at the
 * end has half the chord missing through nothing but time.
 */

import { checkChordShape } from '../../src/audio/chordCheck.ts';
import type { ChordCheck, StringVerdict } from '../../src/audio/chordCheck.ts';
import { chordShape } from '../../src/music/chordShapes.ts';
import type { ChordShape } from '../../src/music/chordShapes.ts';
import type { Tuning } from '../../src/music/fretboard.ts';
import type { ChordExplanation } from '../audio/chordDetect.ts';
import { h, clear, replace } from './dom.ts';
import { button } from './render.ts';

const MARK: Record<StringVerdict, string> = {
  ringing: '●',
  missing: '✕',
  unclear: '?',
  'not-played': '×',
};

const WORD: Record<StringVerdict, string> = {
  ringing: 'ringing',
  missing: 'not sounding',
  unclear: 'cannot tell',
  'not-played': 'not in this chord',
};

export interface StringCheckPanel {
  element: HTMLElement;
  /** Feed every frame of evidence while listening. */
  update(explanation: ChordExplanation): void;
  /** Which chord is being checked, or null when idle. */
  target(): string | null;
}

export function stringCheckPanel(options: {
  chords: string[];
  tuning: Tuning;
  onNeedMic: () => void;
  listening: () => boolean;
}): StringCheckPanel {
  let shape: ChordShape | null = null;
  let best: ChordCheck | null = null;
  let bestScore = -1;
  let since = 0;

  const result = h('div', { class: 'check-result' });
  const picker = h('div', { class: 'check-picker' });

  function paint(check: ChordCheck | null): void {
    if (!check) {
      replace(result, h('p', { class: 'muted', text: 'Strum the chord a few times.' }));
      return;
    }
    const rows = h('div', { class: 'check-strings' });
    // Thinnest string at the top, the way a chord diagram is drawn.
    for (const string of [...check.strings].reverse()) {
      rows.appendChild(h('div', { class: `check-row is-${string.verdict}` },
        h('span', { class: 'check-mark', text: MARK[string.verdict] }),
        h('span', { class: 'check-string', text: `${string.stringNumber}` }),
        h('span', { class: 'check-fret', text: string.fret === 'x' ? 'x' : string.fret === 0 ? 'open' : `fret ${string.fret}` }),
        h('span', { class: 'check-word', text: WORD[string.verdict] }),
      ));
    }
    replace(result,
      h('p', { class: `check-verdict${check.clean ? ' is-good' : ''}`, text: check.advice[0] ?? '' }),
      rows,
      ...check.advice.slice(1).map((line) => h('p', { class: 'check-advice', text: line })),
    );
  }

  for (const chord of options.chords) {
    if (!chordShape(chord)) continue;
    picker.appendChild(button(chord, () => {
      shape = chordShape(chord);
      best = null;
      bestScore = -1;
      since = Date.now();
      for (const chip of picker.querySelectorAll('button')) {
        chip.classList.toggle('is-on', chip.textContent === chord);
      }
      paint(null);
      if (!options.listening()) options.onNeedMic();
    }, 'level-chip'));
  }

  const element = h('section', { class: 'panel string-check' },
    h('h4', { text: 'Is my chord clean?' }),
    h('p', { class: 'muted', text: 'Pick the chord you are holding, then strum it slowly a few times. I will tell you string by string — this is the part you cannot hear for yourself yet.' }),
    picker,
    result,
    h('div', { class: 'row-actions' },
      button('Start over', () => { best = null; bestScore = -1; since = Date.now(); paint(null); }, 'btn-quiet'),
    ),
  );
  paint(null);

  function update(explanation: ChordExplanation): void {
    if (!shape) return;
    const check = checkChordShape(explanation.perMidi, shape, options.tuning);
    // A strum decays, so the honest reading is the best one from the last
    // couple of seconds rather than whichever frame arrived most recently.
    const score = check.strings.filter((s) => s.verdict === 'ringing' || s.verdict === 'unclear').length;
    const stale = Date.now() - since > 2500;
    if (stale) { best = null; bestScore = -1; since = Date.now(); }
    if (score > bestScore) {
      bestScore = score;
      best = check;
      paint(best);
    }
  }

  return { element, update, target: () => shape?.chord ?? null };
}
