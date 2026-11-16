/**
 * Readable song chart notation for a lyric line:
 * [G] sets a chord above the next word, {E4} or {↑} sets a melody cue,
 * and | makes an explicit breath / phrase boundary.
 *
 * A lyric line is a phrase by default. Nothing here transcribes audio or
 * invents a melody: only annotations written by the songwriter are displayed.
 */
import { h } from '../ui/dom.ts';

type Word = { word: string; chord: string; melody: string };
type Line = { words: Word[]; chordOnly: string[] };

function parseWords(source: string): Line {
  const words: Word[] = [];
  const chordOnly: string[] = [];
  let chord = '';
  let melody = '';
  const matcher = /\[([^\]]+)\]|\{([^}]+)\}|([^\s\[\]{}]+)|(\s+)/g;
  for (const match of source.matchAll(matcher)) {
    if (match[1] !== undefined) {
      chord = match[1].trim();
      chordOnly.push(chord);
    } else if (match[2] !== undefined) {
      melody = match[2].trim();
    } else if (match[3] !== undefined) {
      words.push({ word: match[3], chord, melody });
      chord = '';
      melody = '';
    }
  }
  return { words, chordOnly };
}

function lyricPhrase(line: Line, index: number): HTMLElement {
  const phrase = h('article', { class: 'sb-phrase' + (line.words.some(word => !!word.melody) ? ' has-melody' : ''), 'aria-label': 'Lyric phrase ' + index });
  const words = h('div', { class: 'sb-phrase-words' });
  for (const word of line.words) {
    words.appendChild(h('span', { class: 'sb-word-unit' },
      h('span', { class: 'sb-melody', text: word.melody || '\u00a0', title: word.melody ? 'Melody cue entered by songwriter' : '' }),
      h('span', { class: 'sb-chord', text: word.chord || '\u00a0' }),
      h('span', { class: 'sb-word', text: word.word }),
    ));
  }
  phrase.append(h('p', { class: 'sb-phrase-caption', text: 'PHRASE ' + String(index).padStart(2, '0') }), words);
  return phrase;
}

function instrumentalPhrase(chords: string[]): HTMLElement {
  const phrase = h('div', { class: 'sb-instrumental sb-phrase', 'aria-label': 'Instrumental chord progression' });
  phrase.appendChild(h('p', { class: 'sb-phrase-caption', text: 'CHORD PROGRESSION' }));
  const grid = h('div', { class: 'sb-chord-grid' });
  for (let i = 0; i < chords.length; i++) {
    grid.appendChild(h('span', { class: 'sb-chord-step' },
      h('span', { class: 'sb-step-number', text: String(i + 1).padStart(2, '0') }),
      h('span', { class: 'sb-chord', text: chords[i] ?? '' }),
    ));
  }
  phrase.appendChild(grid);
  return phrase;
}

export function renderSongChart(content: string): HTMLElement {
  const body = h('div', { class: 'sb-performance-lines' });
  let count = 0;
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('# ')) {
      body.appendChild(h('h3', { class: 'sb-section', text: line.slice(2) }));
      count = 0;
      continue;
    }
    if (line.startsWith('> ')) {
      body.appendChild(h('p', { class: 'sb-instruction', text: line.slice(2) }));
      continue;
    }
    if (!line) {
      body.appendChild(h('div', { class: 'sb-spacer', 'aria-hidden': 'true' }));
      continue;
    }
    // | is a manual breath/phrase boundary, not a chord or a sung word.
    const portions = line.split(/\s*\|\s*/).filter(Boolean);
    for (let i = 0; i < portions.length; i++) {
      const parsed = parseWords(portions[i] ?? '');
      if (parsed.words.length) {
        body.appendChild(lyricPhrase(parsed, ++count));
      } else if (parsed.chordOnly.length) {
        body.appendChild(instrumentalPhrase(parsed.chordOnly));
      }
      if (i < portions.length - 1) {
        body.appendChild(h('div', { class: 'sb-breath', text: '↳ breath / next phrase' }));
      }
    }
  }
  return body;
}
