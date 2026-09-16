/**
 * Song Seed — a workspace for arranging your own riffs into something longer.
 *
 * The app organises and observes. It does not write the song: it will tell you
 * that two of your riffs share a home note and several notes, and leave the
 * decision about whether they belong together entirely to you.
 */

import type { Riff, SongSeed } from '../../src/types.ts';
import { explainRelation } from '../../src/explain/explain.ts';
import { midiToName } from '../../src/music/notes.ts';
import { h, clear, relativeTime } from '../ui/dom.ts';
import { button, empty, explanationBlock } from '../ui/render.ts';
import type { AppContext, View } from './context.ts';

/** Section names a player would actually reach for, in rough song order. */
const ROLES = ['intro', 'verse', 'pre-chorus', 'chorus', 'bridge', 'transition', 'solo', 'outro'];

export function songsView(context: AppContext): View {
  const element = h('div', { class: 'view view-songs' });
  let openSongId: string | null = null;

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

    const list = h('section', { class: 'panel' },
      h('h2', { text: 'Song ideas' }),
      h('p', { class: 'muted', text: 'Group your riffs into something longer. Nothing here changes the riffs themselves.' }),
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
