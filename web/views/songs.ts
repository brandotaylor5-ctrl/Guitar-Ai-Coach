/**
 * Song Seed — a workspace for arranging your own riffs into something longer.
 *
 * The app organises and observes. It does not write the song: it will tell you
 * that two of your riffs share a home note and several notes, and leave the
 * decision about whether they belong together entirely to you.
 */

import type { NoteEvent, Riff, SongSeed } from '../../src/types.ts';
import { explainRelation } from '../../src/explain/explain.ts';
import { analyzeNotes } from '../../src/phrase/analyze.ts';
import { suggestAnswer, suggestChords, suggestEndings } from '../../src/create/suggest.ts';
import { chordShape, chordShapeMidis } from '../../src/music/chordShapes.ts';
import { midiToName, pcToName } from '../../src/music/notes.ts';
import { h, clear, relativeTime } from '../ui/dom.ts';
import { button, empty, explanationBlock } from '../ui/render.ts';
import type { AppContext, View } from './context.ts';

/** Section names a player would actually reach for, in rough song order. */
const ROLES = ['intro', 'verse', 'pre-chorus', 'chorus', 'bridge', 'transition', 'solo', 'outro'];

export function songsView(context: AppContext): View {
  const element = h('div', { class: 'view view-songs' });
  let openSongId: string | null = null;
  let workshopRiffId: string | null = null;

  function riffLabel(riffs: Riff[], riffId: string): string {
    const riff = riffs.find((r) => r.id === riffId);
    if (!riff) return 'a riff that has been deleted';
    return riff.name ?? 'unnamed';
  }

  function riffNotes(riffs: Riff[], songSection: SongSeed['sections'][number]): string {
    const riff = riffs.find((r) => r.id === songSection.riffId);
    if (!riff) return '';
    const version = riff.versions.find((v) => v.id === (songSection.versionId ?? riff.currentVersionId))
      ?? riff.versions[0];
    return version ? version.notes.map((n) => midiToName(n.midi)).join(' ') : '';
  }

  function sectionRow(song: SongSeed, riffs: Riff[], index: number): HTMLElement {
    const section = song.sections[index]!;
    const roleSelect = h('select', {
      class: 'select',
      onChange: async (event: Event) => {
        await context.library.setSectionRole(song.id, index, (event.target as HTMLSelectElement).value);
        void render();
      },
    }, ...ROLES.map((role) => h('option', { value: role, text: role })));
    roleSelect.value = ROLES.includes(section.role) ? section.role : ROLES[1]!;

    return h('li', { class: 'song-section' },
      h('span', { class: 'section-index', text: String(index + 1) }),
      roleSelect,
      h('span', { class: 'section-riff', text: riffLabel(riffs, section.riffId) }),
      h('span', { class: 'section-notes', text: riffNotes(riffs, section) }),
      h('div', { class: 'section-actions' },
        button('↑', async () => {
          if (index === 0) return;
          await context.library.moveSection(song.id, index, index - 1);
          void render();
        }, 'btn-quiet'),
        button('↓', async () => {
          if (index === song.sections.length - 1) return;
          await context.library.moveSection(song.id, index, index + 1);
          void render();
        }, 'btn-quiet'),
        button('Remove', async () => {
          await context.library.removeFromSong(song.id, index);
          context.say('Taken out of the song. The riff itself is untouched.');
          void render();
        }, 'btn-quiet'),
      ),
    );
  }

  /**
   * What the app noticed about consecutive sections. Observations only — it
   * never suggests a different order.
   */
  function observations(song: SongSeed, riffs: Riff[]): HTMLElement | null {
    if (song.sections.length < 2) return null;
    const block = h('details', { class: 'section' },
      h('summary', { text: 'What these have in common' }));

    let said = 0;
    for (let i = 1; i < song.sections.length; i++) {
      const before = riffs.find((r) => r.id === song.sections[i - 1]!.riffId);
      const after = riffs.find((r) => r.id === song.sections[i]!.riffId);
      if (!before || !after) continue;
      const a = before.versions.find((v) => v.id === before.currentVersionId)?.notes ?? [];
      const b = after.versions.find((v) => v.id === after.currentVersionId)?.notes ?? [];
      const relation = explainRelation(a, b);
      if (!relation) continue;
      block.appendChild(h('h4', {
        text: `${song.sections[i - 1]!.role} → ${song.sections[i]!.role}`,
      }));
      block.appendChild(explanationBlock(relation));
      said++;
    }
    return said ? block : null;
  }


  function currentRiffNotes(riff: Riff): NoteEvent[] {
    return riff.versions.find((version) => version.id === riff.currentVersionId)?.notes
      ?? riff.versions[0]?.notes
      ?? [];
  }

  function playableChord(label: string): NoteEvent[] {
    const compact = label.replace(/\s+(major|minor)$/, (_match, quality: string) => quality === 'minor' ? 'm' : '');
    const shape = chordShape(compact);
    if (!shape) return [];
    return chordShapeMidis(shape).map((midi) => ({
      midi,
      startMs: 0,
      durationMs: 1200,
      confidence: 1,
      velocity: .55,
    }));
  }

  function workshop(riffs: Riff[]): HTMLElement {
    const panel = h('section', { class: 'panel' },
      h('p', { class: 'eyebrow', text: 'SONG WORKSHOP' }),
      h('h2', { text: 'Take one thing you played and grow it.' }),
      h('p', { class: 'muted', text: 'The app starts from your riff. Suggestions are branches you can audition; your original never gets overwritten.' }),
    );

    if (riffs.length === 0) {
      panel.appendChild(empty('Save a riff first — from Coach while you play, or from any scale lesson or song. Then this becomes a songwriting workspace.'));
      panel.appendChild(button('Go and make one', () => context.navigate('path', {}), 'btn-primary'));
      return panel;
    }

    if (!workshopRiffId || !riffs.some((riff) => riff.id === workshopRiffId)) workshopRiffId = riffs[0]!.id;
    const select = h('select', { class: 'select' }) as HTMLSelectElement;
    for (const riff of riffs) {
      select.appendChild(h('option', { value: riff.id, text: riff.name ?? 'unnamed riff' }));
    }
    select.value = workshopRiffId;
    select.addEventListener('change', () => { workshopRiffId = select.value; void render(); });
    panel.appendChild(h('label', { class: 'field' }, 'Build from ', select));

    const riff = riffs.find((item) => item.id === workshopRiffId)!;
    const notes = currentRiffNotes(riff);
    if (notes.length < 2) {
      panel.appendChild(empty('This riff is too short for useful songwriting suggestions yet.'));
      return panel;
    }

    const analysis = analyzeNotes(notes, { tuning: context.session.tuning });
    const chords = suggestChords(analysis, 4);
    const answer = suggestAnswer(analysis, { tuning: context.session.tuning });
    const endings = suggestEndings(analysis, { tuning: context.session.tuning });

    panel.appendChild(h('div', { class: 'facts' },
      h('span', { class: 'pill', text: `Home: ${pcToName(analysis.homePc)}` }),
      h('span', { class: 'pill', text: analysis.scale.confidence >= .35 ? analysis.scale.label : 'scale still ambiguous' }),
      analysis.rhythm.bpm > 0 ? h('span', { class: 'pill', text: `~${Math.round(analysis.rhythm.bpm)} bpm` }) : null,
    ));
    panel.appendChild(h('p', { class: 'muted', text: `Your riff: ${analysis.noteNames.join(' → ')}` }));

    const harmony = h('div', { class: 'section' },
      h('h3', { text: '1 · Put harmony under it' }),
      h('p', { class: 'muted', text: 'These chords are suggested because they already contain a lot of the notes you played. They are auditions, not answers.' }),
    );
    if (!chords.length) {
      harmony.appendChild(h('p', { class: 'muted', text: 'I do not have enough tonal evidence to make an honest chord suggestion yet.' }));
    } else {
      const grid = h('div', { class: 'suggestions' });
      for (const chord of chords) {
        const notesForChord = playableChord(chord.label);
        const card = h('article', { class: 'suggestion' },
          h('strong', { text: chord.label }),
          h('p', { text: chord.description }),
        );
        if (notesForChord.length) {
          card.appendChild(button('Hear this chord', () => { void context.player.play(notesForChord); }, 'btn-quiet'));
        }
        grid.appendChild(card);
      }
      harmony.appendChild(grid);
    }
    panel.appendChild(harmony);

    const develop = h('div', { class: 'section' },
      h('h3', { text: '2 · Develop the phrase' }),
      h('p', { class: 'muted', text: 'Keep the identity of your riff, but hear what happens when it gets an answer or a different ending.' }),
    );

    if (answer) {
      const answerBlock = h('article', { class: 'suggestion' },
        h('strong', { text: 'ANSWER PHRASE' }),
        h('p', { text: answer.description }),
        h('p', { class: 'muted', text: answer.notes.map((note) => midiToName(note.midi)).join(' → ') }),
        h('div', { class: 'practice-actions' },
          button('Hear it after my riff', () => { void context.player.play(answer.full); }, 'btn-primary'),
          button('Keep as a new version', async () => {
            await context.library.addVersion(riff.id, answer.full, {
              parentId: riff.currentVersionId,
              comment: 'Song Workshop · call-and-response extension',
            });
            context.say('Kept as a new version. Your original is still there.');
            void render();
          }, 'btn-quiet'),
        ),
      );
      develop.appendChild(answerBlock);
    }

    if (endings.length) {
      const endingsGrid = h('div', { class: 'suggestions' });
      for (const ending of endings) {
        endingsGrid.appendChild(h('article', { class: 'suggestion' },
          h('strong', { text: ending.label }),
          h('p', { text: ending.description }),
          h('p', { class: 'muted', text: ending.notes.map((note) => midiToName(note.midi)).join(' → ') }),
          h('div', { class: 'practice-actions' },
            button('Hear it', () => { void context.player.play(ending.full); }, 'btn-quiet'),
            button('Keep version', async () => {
              await context.library.addVersion(riff.id, ending.full, {
                parentId: riff.currentVersionId,
                comment: `Song Workshop · ${ending.label.toLowerCase()} ending`,
              });
              context.say('Kept as a new version. Nothing was overwritten.');
              void render();
            }, 'btn-quiet'),
          ),
        ));
      }
      develop.appendChild(endingsGrid);
    }
    panel.appendChild(develop);

    panel.appendChild(h('div', { class: 'section' },
      h('h3', { text: '3 · Turn it into a song seed' }),
      h('p', { class: 'muted', text: 'Start with the riff as a verse, then add or develop sections from there.' }),
      button('Start a song from this riff', async () => {
        const defaultName = riff.name ? `${riff.name} · song idea` : 'New song idea';
        const name = window.prompt('Call the song idea what?', defaultName);
        if (name === null || !name.trim()) return;
        const song = await context.library.createSong(name.trim());
        await context.library.addToSong(song.id, 'verse', riff.id, riff.currentVersionId);
        openSongId = song.id;
        context.say('Song seed started with your riff as the verse.');
        void render();
      }, 'btn-primary'),
    ));

    return panel;
  }

  async function renderSong(song: SongSeed, riffs: Riff[]): Promise<HTMLElement> {
    const panel = h('section', { class: 'panel' },
      h('header', { class: 'riff-head' },
        h('h2', { class: 'riff-title', text: song.name }),
        button('Rename', async () => {
          const name = window.prompt('What do you want to call it?', song.name);
          if (name === null || !name.trim()) return;
          await context.library.renameSong(song.id, name.trim());
          void render();
        }, 'btn-quiet'),
        button('Delete', async () => {
          if (!window.confirm(`Delete "${song.name}"? The riffs in it are not affected.`)) return;
          await context.library.deleteSong(song.id);
          openSongId = null;
          void render();
        }, 'btn-quiet btn-danger'),
      ),
      h('p', { class: 'muted', text: `Started ${relativeTime(song.createdAt)}.` }),
    );

    if (song.sections.length === 0) {
      panel.appendChild(empty('Nothing in this song yet. Add a riff below.'));
    } else {
      panel.appendChild(h('ol', { class: 'song-sections' },
        ...song.sections.map((_, index) => sectionRow(song, riffs, index)),
      ));
      panel.appendChild(h('div', { class: 'practice-actions' },
        button('Play the whole thing', async () => {
          const notes = await context.library.songNotes(song.id);
          if (notes.length === 0) {
            context.say('Nothing to play — the riffs in this song have been deleted.');
            return;
          }
          await context.player.play(notes);
        }, 'btn-primary'),
      ));
      const noticed = observations(song, riffs);
      if (noticed) panel.appendChild(noticed);
    }

    // Adding a riff to the song.
    const riffSelect = h('select', { class: 'select' },
      ...riffs.map((riff) => h('option', { value: riff.id, text: riff.name ?? 'unnamed' })));
    const roleSelect = h('select', { class: 'select' },
      ...ROLES.map((role) => h('option', { value: role, text: role })));
    roleSelect.value = 'verse';

    if (riffs.length) {
      panel.appendChild(h('div', { class: 'add-section' },
        h('label', { class: 'field' }, 'Add ', riffSelect),
        h('label', { class: 'field' }, 'as a ', roleSelect),
        button('Add to the song', async () => {
          await context.library.addToSong(song.id, roleSelect.value, riffSelect.value);
          void render();
        }),
      ));
    }
    return panel;
  }

  async function render(): Promise<void> {
    clear(element);
    const [songs, riffs] = await Promise.all([context.library.listSongs(), context.library.listRiffs()]);

    element.appendChild(workshop(riffs));

    const list = h('section', { class: 'panel' },
      h('h2', { text: 'Song arrangements' }),
      h('p', { class: 'muted', text: 'Once an idea starts growing, arrange your saved riff versions into verses, choruses, bridges and other sections.' }),
    );

    if (songs.length === 0) {
      list.appendChild(empty('No song ideas yet.'));
    } else {
      list.appendChild(h('div', { class: 'riff-list' },
        ...songs.map((song) => h('button', {
          class: `riff-card${song.id === openSongId ? ' is-selected' : ''}`,
          type: 'button',
          onClick: () => { openSongId = song.id; void render(); },
        },
          h('span', { class: 'riff-name', text: song.name }),
          h('span', { class: 'riff-meta', text: `${song.sections.length} section${song.sections.length === 1 ? '' : 's'} · ${relativeTime(song.createdAt)}` }),
        )),
      ));
    }

    list.appendChild(h('div', { class: 'practice-actions' },
      button(songs.length ? 'Start another song idea' : 'Start a song idea', async () => {
        const name = window.prompt('Call it what?', `Song Idea ${String(songs.length + 1).padStart(2, '0')}`);
        if (name === null || !name.trim()) return;
        const song = await context.library.createSong(name.trim());
        openSongId = song.id;
        void render();
      }, riffs.length ? '' : 'btn-quiet'),
    ));

    if (riffs.length === 0) {
      list.appendChild(h('p', { class: 'muted', text: 'You will need some saved riffs before a song idea can hold anything.' }));
    }

    element.appendChild(list);

    const open = songs.find((song) => song.id === openSongId);
    if (open) element.appendChild(await renderSong(open, riffs));
  }

  void render();
  return { element, update: () => { void render(); } };
}
