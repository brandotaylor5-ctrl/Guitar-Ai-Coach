/**
 * The Riff Library — a library of your own ideas.
 *
 * The version history is the point of this screen. A riff is never a single
 * thing that got edited; it is a tree of everything you tried, and the branch
 * you abandoned is as easy to reach as the one you kept.
 */

import type { Riff, RiffVersion } from '../../src/types.ts';
import type { VersionNode } from '../../src/library/riffLibrary.ts';
import { analyzeNotes } from '../../src/phrase/analyze.ts';
import { explainPhrase } from '../../src/explain/explain.ts';
import { diffTakes } from '../../src/phrase/diff.ts';
import { midiToName } from '../../src/music/notes.ts';
import { clipUrl } from '../audio/wav.ts';
import { h, clear, relativeTime, replace } from '../ui/dom.ts';
import {
  analysisFacts, button, explanationBlock, fretboardDiagram, highlightNote, noteRow, tabBlock, empty,
} from '../ui/render.ts';
import { practicePanel } from './practice.ts';
import type { AppContext, View } from './context.ts';

export function libraryView(context: AppContext, params: Record<string, string> = {}): View {
  let practice: ReturnType<typeof practicePanel> | null = null;
  const list = h('div', { class: 'riff-list' });
  const detail = h('div', { class: 'riff-detail' });

  /** Your ideas should never be locked inside someone else's app. */
  const fileInput = h('input', {
    type: 'file', accept: 'application/json,.json', class: 'hidden-file',
    onChange: async (event: Event) => {
      const input = event.target as HTMLInputElement;
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;
      try {
        const result = await context.library.import(await file.text());
        context.say(
          `Brought in ${result.riffs} riff${result.riffs === 1 ? '' : 's'}` +
          `${result.songs ? ` and ${result.songs} song idea${result.songs === 1 ? '' : 's'}` : ''}` +
          `${result.skipped ? `, skipping ${result.skipped} already here` : ''}.`,
        );
        void render();
      } catch (err) {
        context.say((err as Error).message, 'error');
      }
    },
  });

  const dataRow = h('div', { class: 'data-row' },
    button('Export everything', async () => {
      const json = await context.library.export();
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      const link = h('a', {
        href: url,
        download: `riff-library-${new Date().toISOString().slice(0, 10)}.json`,
      });
      link.click();
      // Give the download a moment to start before releasing the URL.
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    }, 'btn-quiet'),
    button('Import a library', () => fileInput.click(), 'btn-quiet'),
    fileInput,
    h('p', { class: 'muted', text: 'Riffs live in this browser. Export keeps a copy you own; importing adds to what is here without overwriting it. Recordings are not included.' }),
  );
  const element = h('div', { class: 'view view-library' },
    h('section', { class: 'panel' },
      h('h2', { text: 'Your riffs' }),
      h('p', { class: 'muted', text: 'Riffs you played, plus any lick or line you kept.' }),
      list,
      dataRow,
    ),
    detail,
  );

  let selectedId: string | null = params.riff ?? null;

  async function renderList(): Promise<void> {
    const riffs = await context.library.listRiffs();
    clear(list);
    if (riffs.length === 0) {
      list.appendChild(empty('Nothing here yet. Play something with Coach listening and it will catch it — or keep a lick from a scale lesson or a song.'));
      return;
    }
    riffs.forEach((riff, index) => {
      const current = riff.versions.find((v) => v.id === riff.currentVersionId) ?? riff.versions[0]!;
      list.appendChild(h('button', {
        class: `riff-card${riff.id === selectedId ? ' is-selected' : ''}`,
        type: 'button',
        onClick: () => { selectedId = riff.id; void render(); },
      },
        h('span', { class: 'riff-index', text: `Riff ${String(index + 1).padStart(2, '0')}` }),
        h('span', { class: 'riff-name', text: riff.name ?? 'unnamed' }),
        h('span', { class: 'riff-notes', text: current.notes.map((n) => midiToName(n.midi)).join(' ') }),
        h('span', { class: 'riff-meta', text: `${riff.versions.length} version${riff.versions.length === 1 ? '' : 's'} · ${relativeTime(riff.createdAt)}` }),
      ));
    });
  }

  function versionTreeNode(riff: Riff, node: VersionNode, depth = 0): HTMLElement {
    const version = node.version;
    const isCurrent = version.id === riff.currentVersionId;
    const row = h('div', { class: `version${isCurrent ? ' is-current' : ''}`, style: `--depth:${depth}` },
      h('div', { class: 'version-head' },
        h('strong', { text: version.label }),
        isCurrent ? h('span', { class: 'badge', text: 'open' }) : null,
        h('span', { class: 'muted', text: relativeTime(version.createdAt) }),
      ),
      versionNotes(version),
      version.comment ? h('p', { class: 'muted', text: version.comment }) : null,
      h('div', { class: 'version-actions' },
        !isCurrent ? button('Keep this one', async () => {
          await context.library.setCurrentVersion(riff.id, version.id);
          context.say(`${version.label} is now the version this riff opens on. Nothing was deleted.`);
          void render();
        }, 'btn-quiet') : null,
        button('Practise this', () => {
          practice?.dispose();
          practice = practicePanel(context, riff, version);
          replace(practiceHost, practice);
          practiceHost.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 'btn-quiet'),
      ),
    );

    const wrapper = h('div', { class: 'version-branch' }, row);
    for (const child of node.children) wrapper.appendChild(versionTreeNode(riff, child, depth + 1));
    return wrapper;
  }

  function versionNotes(version: RiffVersion): HTMLElement {
    const row = noteRow(version.notes);
    return h('div', { class: 'playable' },
      button('Play', async () => {
        await context.player.play(version.notes, {
          onNote: (index) => highlightNote(row, index),
          onEnd: () => highlightNote(row, null),
        });
      }, 'btn-play'),
      row,
    );
  }

  const practiceHost = h('div', { class: 'practice-host' });

  async function renderDetail(): Promise<void> {
    clear(detail);
    clear(practiceHost);
    if (!selectedId) return;

    const riff = await context.library.getRiff(selectedId);
    if (!riff) { selectedId = null; return; }

    const current = riff.versions.find((v) => v.id === riff.currentVersionId) ?? riff.versions[0]!;
    const analysis = analyzeNotes(current.notes, { tuning: context.session.tuning });

    const title = h('h2', { class: 'riff-title', text: riff.name ?? 'unnamed' });
    const panel = h('section', { class: 'panel' },
      h('header', { class: 'riff-head' },
        title,
        button(riff.name ? 'Rename' : 'Give it a name', async () => {
          const name = window.prompt('What do you want to call it?', riff.name ?? '');
          if (name === null) return;
          await context.library.rename(riff.id, name.trim() || null);
          void render();
        }, 'btn-quiet'),
        button('Delete', async () => {
          if (!window.confirm(`Delete "${riff.name ?? 'this riff'}" and all ${riff.versions.length} of its versions? This cannot be undone.`)) return;
          await context.clips.deleteAll(riff.versions.map((v) => v.audioRef));
          await context.library.deleteRiff(riff.id);
          selectedId = null;
          context.say('Deleted.');
          void render();
        }, 'btn-quiet btn-danger'),
      ),
      h('p', { class: 'muted', text: `First played ${relativeTime(riff.createdAt)}.` }),
    );

    // The recording may still be in this session's memory, or it may have been
    // written to the clip store on a previous visit. Either is fine; neither
    // existing is also fine, and the riff itself is unaffected.
    if (current.audioRef) {
      const host = h('div', { class: 'original-audio' });
      panel.appendChild(host);
      void (async () => {
        const live = context.session.getClip(current.audioRef!);
        const stored = live ? null : await context.clips.get(current.audioRef!);
        const samples = live ?? stored?.samples ?? null;
        if (!samples || samples.length === 0) return;
        const rate = live ? context.sampleRate : stored?.sampleRate ?? context.sampleRate;
        const url = clipUrl(samples, rate);
        host.appendChild(h('h3', { text: 'The original recording' }));
        host.appendChild(h('audio', { controls: true, src: url }));
      })();
    }

    panel.appendChild(h('h3', { text: 'Where your fingers probably went' }));
    panel.appendChild(fretboardDiagram(analysis.positions, context.session.tuning));
    panel.appendChild(tabBlock(analysis.tab));
    panel.appendChild(analysisFacts(analysis));
    panel.appendChild(explanationBlock(explainPhrase(analysis, context.session.tuning)));

    const tree = await context.library.versionTree(riff.id);
    const versions = h('section', { class: 'panel' },
      h('h3', { text: 'How this idea developed' }),
      h('p', { class: 'muted', text: 'Versions branch from the one they grew out of. Nothing here is ever overwritten.' }),
      ...tree.map((node) => versionTreeNode(riff, node)),
    );

    if (riff.versions.length >= 2) {
      const first = riff.versions[0]!;
      const last = riff.versions[riff.versions.length - 1]!;
      versions.appendChild(h('details', { class: 'section' },
        h('summary', { text: `What changed between ${first.label} and ${last.label}` }),
        h('p', { text: diffTakes(first.notes, last.notes).summary }),
        button('Combine them', async () => {
          const combined = await context.library.combineVersions(riff.id, first.id, last.id);
          context.say(`Made ${combined.label} from the opening of ${first.label} and the ending of ${last.label}.`);
          void render();
        }, 'btn-quiet'),
      ));
    }

    const related = await context.library.relatedRiffs(riff.id);
    if (related.length) {
      versions.appendChild(h('details', { class: 'section' },
        h('summary', { text: 'Riffs that might belong with this one' }),
        h('ul', { class: 'related' },
          ...related.map((entry) => h('li', {},
            h('button', {
              class: 'link', type: 'button',
              text: entry.riff.name ?? 'unnamed',
              onClick: () => { selectedId = entry.riff.id; void render(); },
            }),
            ` — ${Math.round(entry.similarity * 100)}% the same idea`,
          )),
        ),
      ));
    }

    detail.appendChild(panel);
    detail.appendChild(versions);
    detail.appendChild(practiceHost);
  }

  async function render(): Promise<void> {
    practice?.dispose();
    practice = null;
    await renderList();
    await renderDetail();
  }

  void render();
  return { element, update: () => { void render(); }, dispose() { practice?.dispose(); } };
}
