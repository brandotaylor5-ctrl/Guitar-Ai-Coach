/**
 * "Why didn't you hear that?"
 *
 * A detector that can only say nothing is impossible to debug from the other
 * end of a message. A player reported a D chord that would not register;
 * four plausible explanations — input level, the analyser's dB clamp, room
 * noise, and the label going unstable as the chord decays — were each modelled
 * and each came back clean, because the only way to test a guess about someone
 * else's guitar was to make another guess.
 *
 * So the app can be asked directly. Hold the chord, read what it saw: the
 * lowest note it found, which pitch classes are lit, which of them it believes
 * are strings rather than harmonics, what the best guesses scored, and the one
 * check that stopped it. Every failure mode above would be obvious in a second
 * from this panel.
 */

import type { ChordExplanation } from '../audio/chordDetect.ts';
import { h, clear } from './dom.ts';

const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

export interface ChordDoctor {
  element: HTMLElement;
  update(explanation: ChordExplanation): void;
}

export function chordDoctor(): ChordDoctor {
  const verdict = h('p', { class: 'doctor-verdict', text: 'Play a chord and hold it.' });
  const bass = h('span', { class: 'doctor-value', text: '—' });
  const frettedRow = h('div', { class: 'doctor-chips' });
  const chromaRow = h('div', { class: 'doctor-chroma' });
  const candidateRow = h('div', { class: 'doctor-candidates' });
  const concentration = h('span', { class: 'doctor-value', text: '—' });

  // Frames arrive eight times a second. Repainting every one of them makes the
  // numbers unreadable and the phone hot, so a successful read is held for a
  // moment and failures are only redrawn when the reason itself changes.
  let lastPaint = 0;
  let lastReason = '';

  const element = h('details', { class: 'panel chord-doctor' },
    h('summary', { text: 'Not hearing your chord? Show me what it sees' }),
    h('p', { class: 'muted', text: 'Hold the chord and strum it a few times. This is the detector thinking out loud.' }),
    verdict,
    h('div', { class: 'doctor-grid' },
      h('div', {}, h('span', { class: 'doctor-label', text: 'Lowest note found' }), bass),
      h('div', {}, h('span', { class: 'doctor-label', text: 'Focus' }), concentration),
    ),
    h('span', { class: 'doctor-label', text: 'Notes it thinks you fretted' }),
    frettedRow,
    h('span', { class: 'doctor-label', text: 'What is sounding' }),
    chromaRow,
    h('span', { class: 'doctor-label', text: 'Best guesses' }),
    candidateRow,
  );

  function update(explanation: ChordExplanation): void {
    const now = Date.now();
    const reason = explanation.rejectedBy ?? `ok:${explanation.detection?.label ?? ''}`;
    if (reason === lastReason && now - lastPaint < 400) return;
    lastReason = reason;
    lastPaint = now;

    if (explanation.detection) {
      verdict.textContent = `Heard ${explanation.detection.label} (confidence ${explanation.detection.confidence.toFixed(2)}).`;
      verdict.className = 'doctor-verdict is-good';
    } else {
      verdict.textContent = explanation.rejectedBy ?? 'No chord.';
      verdict.className = 'doctor-verdict is-blocked';
    }

    bass.textContent = explanation.bassName;
    concentration.textContent = explanation.concentration
      ? explanation.concentration.toFixed(2)
      : '—';

    clear(frettedRow);
    if (explanation.fretted.length === 0) {
      frettedRow.appendChild(h('span', { class: 'muted', text: 'none' }));
    } else {
      for (const pc of explanation.fretted) {
        frettedRow.appendChild(h('span', { class: 'chip', text: NAMES[pc]! }));
      }
    }

    clear(chromaRow);
    explanation.chroma
      .map((value, pc) => ({ value, pc }))
      .filter((x) => x.value >= 0.2)
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
      .forEach(({ value, pc }) => {
        chromaRow.appendChild(h('span', { class: 'doctor-bar' },
          h('span', { class: 'doctor-bar-name', text: NAMES[pc]! }),
          h('span', { class: 'doctor-bar-fill', style: `width:${Math.round(value * 100)}%` }),
          h('span', { class: 'doctor-bar-num', text: value.toFixed(2) }),
        ));
      });

    clear(candidateRow);
    for (const candidate of explanation.candidates) {
      candidateRow.appendChild(h('span', { class: 'chip' },
        h('strong', { text: candidate.label }),
        h('span', { text: ` ${candidate.score.toFixed(2)} · ${candidate.present}/${candidate.wanted}` }),
      ));
    }
  }

  return { element, update };
}
