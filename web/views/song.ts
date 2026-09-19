/**
 * Playing a song, at the level your hands are actually at today.
 *
 * Two ideas, taken from the apps that get this right and joined together.
 *
 * From Tunefox: every part of the song has versions, and you swap them. The
 * song is never locked — only the hardest way of playing it is. You play the
 * whole thing on day one as one strum a bar, and over weeks the same screen
 * turns into the melody without you ever having "unlocked" anything.
 *
 * From Chord AI: the app is listening. The bar you are actually on lights up
 * because it heard the chord, not because a metronome assumed you kept up.
 * Getting lost is the single most common reason a beginner stops playing
 * along, and it is fixable by just showing them where they are.
 */

import type { Level, SongSection } from '../../src/songs/library.ts';
import { chordsIn, songById } from '../../src/songs/library.ts';
import {
  LEVEL_BLURBS, LEVEL_NAMES, partAt, readinessFor, suggestedLevel,
} from '../../src/songs/arrange.ts';
import { masteryMap } from '../../src/curriculum/mastery.ts';
import { CurriculumStore } from '../../src/curriculum/watch.ts';
import { chordShape, chordShapeMidis } from '../../src/music/chordShapes.ts';
import { leadChords, pitchClassOf } from '../../src/create/lead.ts';
import { leadOverProgression } from '../../src/create/lead.ts';
import { SCALES, rootPositionFret, scaleBox } from '../../src/music/scales.ts';
import { pcToName } from '../../src/music/notes.ts';
import { inferFingering, renderTab } from '../../src/music/fretboard.ts';
import type { NoteEvent } from '../../src/types.ts';
import type { ChordDetection } from '../audio/chordDetect.ts';
import { h, clear, replace } from '../ui/dom.ts';
import { button, fretboardDiagram, tabBlock } from '../ui/render.ts';
import { lickCard } from '../ui/lickCard.ts';
import { licksInKey, lickToEvents } from '../../src/music/licks.ts';
import type { AppContext, View } from './context.ts';

const LEVELS: Level[] = ['strum', 'boom-chuck', 'melody'];

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

/** Turn a section's chords into something to play along with. */
function chordBackingNotes(section: SongSection, bpm: number): NoteEvent[] {
  const beatMs = 60_000 / bpm;
  const out: NoteEvent[] = [];
  section.bars.forEach((chord, bar) => {
    const shape = chordShape(chord);
    if (!shape) return;
    const at = bar * 4 * beatMs;
    chordShapeMidis(shape).forEach((midi, string) => {
      out.push({
        midi,
        // A strum is not a block chord: the pick crosses the strings.
        startMs: at + string * 14,
        durationMs: beatMs * 3.4,
        confidence: 1,
        velocity: 0.5,
      });
    });
  });
  return out;
}

function melodyNotes(section: SongSection, level: Level, bpm: number): NoteEvent[] {
  const part = partAt(section, level);
  if (!part.notes?.length) return [];
  const beatMs = 60_000 / bpm;
  const first = Math.min(...part.notes.map((n) => n.beat));
  return part.notes.map((note) => ({
    midi: note.midi,
    startMs: (note.beat - first) * beatMs,
    durationMs: Math.max(120, note.beats * beatMs * 0.9),
    confidence: 1,
    velocity: 0.62,
  }));
}

export function songView(context: AppContext, params: Record<string, string> = {}): View {
  const store = new CurriculumStore(storage());
  const mastery = masteryMap(store.load());
  const element = h('div', { class: 'view view-song' });

  const song = params.song ? songById(params.song) : null;
  if (!song) {
    element.appendChild(h('p', { class: 'muted', text: 'That song is not here.' }));
    element.appendChild(button('Back to songs', () => context.navigate('songs'), 'btn-primary'));
    return { element };
  }

  const readiness = readinessFor(song, mastery);
  // One chosen level per section, remembered while the view is open.
  const chosen = new Map<string, Level>(
    song.sections.map((section) => [section.id, suggestedLevel(section, mastery)]),
  );

  let playing = false;
  let currentBar = -1;
  const barCells = new Map<string, HTMLElement[]>();

  function highlight(sectionId: string, bar: number): void {
    const cells = barCells.get(sectionId) ?? [];
    cells.forEach((cell, i) => cell.classList.toggle('is-here', i === bar));
  }

  /**
   * The bar the player is actually on, worked out from the chord they just
   * played rather than from the clock. Only moves forward, and only to a bar
   * that is close by, so one misheard chord cannot throw them across the song.
   */
  function onChord(chord: ChordDetection): void {
    if (!playing) return;
    const label = chord.label.replace('♯', '#');
    for (const section of song!.sections) {
      const bars = section.bars;
      for (let step = 1; step <= 2; step++) {
        const candidate = (currentBar + step) % bars.length;
        if (bars[candidate] === label) {
          currentBar = candidate;
          highlight(section.id, currentBar);
          return;
        }
      }
    }
  }

  function sectionCard(section: SongSection): HTMLElement {
    const level = chosen.get(section.id)!;
    const part = partAt(section, level);
    const body = h('div', { class: 'song-part-body' });

    const levelRow = h('div', { class: 'level-switch' },
      ...LEVELS.filter((l) => section.parts.some((p) => p.level === l)).map((l) =>
        button(LEVEL_NAMES[l], () => {
          chosen.set(section.id, l);
          render();
        }, `level-chip${l === level ? ' is-on' : ''}`)),
    );

    // The chart. Four bars to a line reads like a chart a person would write.
    const cells: HTMLElement[] = [];
    const chart = h('div', { class: 'song-chart' });
    for (const chord of section.bars) {
      const cell = h('div', { class: 'song-bar', text: chord });
      cells.push(cell);
      chart.appendChild(cell);
    }
    barCells.set(section.id, cells);

    body.append(
      h('p', { class: 'song-how', text: part.how }),
      chart,
    );

    if (part.notes?.length) {
      const notes = melodyNotes(section, level, song!.bpm);
      const positions = inferFingering(notes.map((n) => n.midi), { tuning: context.session.tuning, maxFret: 9 });
      body.append(
        tabBlock(renderTab(positions, context.session.tuning)),
        h('div', { class: 'row-actions' },
          button('Hear the melody', () => { void context.player.play(notes); }, 'btn-quiet'),
          button('Half speed', () => { void context.player.play(notes, { speed: 0.5 }); }, 'btn-quiet'),
        ),
      );
    }

    return h('section', { class: 'panel song-part' },
      h('header', { class: 'song-part-head' },
        h('h3', { text: section.name }),
        h('span', { class: 'muted', text: `${section.bars.length} bars` }),
      ),
      levelRow,
      h('p', { class: 'muted level-blurb', text: LEVEL_BLURBS[level] }),
      body,
    );
  }

  async function playAlong(): Promise<void> {
    if (playing) {
      context.player.stop();
      playing = false;
      render();
      return;
    }
    playing = true;
    currentBar = -1;
    render();
    if (!context.listening) await context.startListening();

    for (const section of song!.sections) {
      const level = chosen.get(section.id)!;
      const notes = level === 'melody'
        ? melodyNotes(section, level, song!.bpm)
        : chordBackingNotes(section, song!.bpm);
      if (!notes.length) continue;
      const beatMs = 60_000 / song!.bpm;
      // Follow the clock as a fallback; the microphone overrides it when it
      // hears something, so a player who is behind is not dragged along.
      const ticker = window.setInterval(() => {
        if (!playing) return;
        currentBar = Math.min(section.bars.length - 1, currentBar + 1);
        highlight(section.id, currentBar);
      }, beatMs * 4);
      await context.player.play(notes);
      window.clearInterval(ticker);
    }
    playing = false;
    render();
  }

  /**
   * Soloing, attached to a song instead of stranded in a sandbox.
   *
   * The Riff Lab had this and nobody could see the point, because improvising
   * over an abstract loop is a puzzle rather than music. Over the changes of a
   * song you have just been playing it is the obvious next thing to try.
   */
  function soloCard(): HTMLElement {
    const chords = leadChords(song!.sections.flatMap((section) => section.bars));
    const host = h('div', { class: 'solo-host' });
    const tonicPc = pitchClassOf(song!.key) ?? 0;
    const minor = song!.key.endsWith('m');
    const scale = SCALES.find((s) => s.id === (minor ? 'minor-pent' : 'major-pent'))!;
    const box = scaleBox(tonicPc, scale, context.session.tuning, rootPositionFret(tonicPc, context.session.tuning));
    const scaleNotes = box.positions.map((p) => p.midi).sort((a, b) => a - b);
    let variant = 0;

    const draw = (): void => {
      const lead = leadOverProgression(chords, scaleNotes, variant, 60_000 / song!.bpm * 4);
      const positions = inferFingering(lead.map((n) => n.midi), { tuning: context.session.tuning, maxFret: 12 });
      replace(host,
        tabBlock(renderTab(positions, context.session.tuning)),
        h('div', { class: 'row-actions' },
          button('Hear it', () => { void context.player.play(lead); }, 'btn-quiet'),
          button('Half speed', () => { void context.player.play(lead, { speed: 0.5 }); }, 'btn-quiet'),
          button('Another one', () => { variant = (variant + 1) % 3; draw(); }, 'btn-quiet'),
          button('Keep it', () => {
            void context.library
              .saveRiff(lead, { comment: `Lead over ${song!.title}` })
              .then(() => context.say('Saved to You. It came out of a real song, so it will sound like one.'))
              .catch(() => context.say('Could not save that.', 'error'));
          }, 'btn-quiet'),
        ),
      );
    };
    draw();

    return h('section', { class: 'panel' },
      h('h4', { text: 'Take a solo over it' }),
      h('p', { class: 'muted', text: `Built from ${pcToName(tonicPc)} ${scale.name}, landing on a note that belongs to whichever chord is underneath. That one habit is most of what makes a solo sound like the song rather than a scale played over it.` }),
      host,
    );
  }

  function render(): void {
    clear(element);

    const chords = chordsIn(song!);
    element.append(
      h('header', { class: 'song-head' },
        button('‹ Songs', () => context.navigate('songs'), 'btn-back'),
        h('h2', { text: song!.title }),
        h('p', { class: 'muted', text: `${song!.key} · ${song!.bpm} bpm · ${song!.origin}` }),
      ),

      h('section', { class: 'panel song-why' }, h('p', { text: song!.why })),

      readiness.ready
        ? h('div', { class: 'row-actions song-transport' },
            button(playing ? 'Stop' : 'Play along', () => { void playAlong(); }, 'btn-primary btn-big'),
          )
        : h('section', { class: 'panel song-blocked' },
            h('p', { text: `You need ${readiness.missing.join(' and ')} for this one. Everything else in it you already have.` }),
            button(`Learn ${readiness.missing[0]}`, () => context.navigate('lessons'), 'btn-primary'),
          ),

      h('section', { class: 'panel song-chords' },
        h('h4', { text: 'The chords' }),
        h('div', { class: 'chord-shapes' }, ...chords.map((chord) => {
          const shape = chordShape(chord);
          return h('div', { class: 'chord-shape' },
            h('span', { class: 'chord-shape-name', text: chord }),
            shape
              ? fretboardDiagram(
                  inferFingering(chordShapeMidis(shape), { tuning: context.session.tuning, maxFret: 5 }),
                  context.session.tuning,
                )
              : h('span', { class: 'muted', text: 'shape not stored' }),
          );
        })),
      ),

      ...song!.sections.map(sectionCard),
    );
    // Soloing over changes you cannot yet play is not a lesson, it is a taunt.
    if (readiness.ready) {
      element.appendChild(soloCard());

      const tonicPc = pitchClassOf(song!.key) ?? 0;
      const minor = song!.key.endsWith('m');
      const licks = licksInKey(tonicPc, minor).slice(0, 3);
      if (licks.length) {
        const host = h('section', { class: 'panel' },
          h('h4', { text: 'Licks that fit this song' }),
          h('p', { class: 'muted', text: `Moved into ${song!.key}, so they sit over these chords without you having to work anything out. Play one at the end of a line and the song stops sounding like practice.` }),
        );
        for (const lick of licks) {
          host.appendChild(lickCard(lick, {
            tuning: context.session.tuning, player: context.player, bpm: song!.bpm,
            onKeep: (kept) => {
              void context.library
                .saveRiff(lickToEvents(kept, song!.bpm), { comment: `${kept.name} · from ${song!.title}` })
                .then(() => context.say(`Saved ${kept.name} to You.`))
                .catch(() => context.say('Could not save that one.', 'error'));
            },
          }));
        }
        element.appendChild(host);
      }
    }
  }

  render();
  return { element, onChord, dispose: () => { playing = false; context.player.stop(); } };
}
