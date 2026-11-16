/**
 * Songbook: chord-over-lyric writing and hands-free scroll for original songs.
 * Standalone local library, deliberately independent of Workbench audio projects.
 * No mic, recognition, server, or paid account necessary.
 */
import { h, clear } from '../ui/dom.ts';
import type { View } from './context.ts';
import { renderSongChart } from '../songbook/notation.ts';

type Song = {
  id: string;
  title: string;
  content: string;
  capo: number;
  bpm: number;
  timeSignature: string;
  notes: string;
  updated: number;
};

const STORAGE_KEY = 'guitar-workbench-original-songbook-v1';
const DEMO_ID = '__songbook-v2-lyric-demo__';
const LYRIC_DEMO: Song = {
  id: DEMO_ID,
  title: 'How to Read a Song · Demo',
  capo: 0,
  bpm: 76,
  timeSignature: '4/4',
  notes: 'Practice example, not one of your originals. The note names and arrows are demonstration cues, not automatically detected melody.',
  content: [
    '# Verse · demonstration',
    '> Gold chords go above the exact words. Blue notes show a melody cue you entered. A breath separates the phrases.',
    '[G]{G3}Porch lights [C]{A3}fade | [Em]{↑}one by one',
    '[G]{B3}The morning [D]{↓}comes | [C]{G3}before I am done',
    '',
    '# Chorus · demonstration',
    '> The words, chords, melody notes and breaths are all visible together.',
    '[C]{→}Sing this [G]{↑}line | [Em]{↓}then breathe',
  ].join('\n'),
  updated: 0,
};
const SEED: Song = {
  id: 'but-i-digress-demo',
  title: 'But I Digress',
  capo: 0,
  bpm: 78,
  timeSignature: '4/4',
  notes: 'Arrangement sketch, not a finished performance. One pass means the entire four-chord progression. Keep the underlying beat steady while changing strumming density.',
  content: [
    '# Introduction · 2 passes',
    '> Quiet, sparse strumming near the neck.',
    '[Cmaj7/G] [Em] [G] [Cmaj7]',
    '',
    '# Find the Pulse · 2 passes',
    '> Gentle, steady rhythm over the soundhole.',
    '[Cmaj7/G] [Em] [G] [Cmaj7]',
    '',
    '# The Build · 2 passes',
    '> More downstrokes and upstrokes. Move gradually toward the bridge.',
    '[Cmaj7/G] [Em] [G] [Cmaj7]',
    '',
    '# The Suspense · 1 pass',
    '> Hold EACH chord for eight beats; keep the strumming busy near the bridge.',
    '[Cmaj7/G] [Em] [G] [Cmaj7]',
    '',
    '# The Release · 2 passes',
    '> Full, confident strumming over the soundhole.',
    '[Cmaj7/G] [Em] [G] [Cmaj7]',
    '',
    '# The Afterthought · 1 pass',
    '> Return to soft playing near the neck. Let Cmaj7 ring.',
    '[Cmaj7/G] [Em] [G] [Cmaj7]',
  ].join('\n'),
  updated: Date.now(),
};

function newSong(): Song {
  return {
    id: crypto.randomUUID(),
    title: 'Untitled original',
    content: '# Verse 1\n> Example only. Replace these words and cues with your own.\n[G]{E4}Put your [Em]{↑}lyrics here | [C]{↓}and breathe\n\n# Chorus\n[G]Place each [C]chord on its word',
    capo: 0,
    bpm: 78,
    timeSignature: '4/4',
    notes: '',
    updated: Date.now(),
  };
}

function validSong(value: unknown): value is Song {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Song>;
  return typeof candidate.id === 'string'
    && typeof candidate.title === 'string'
    && typeof candidate.content === 'string'
    && typeof candidate.notes === 'string'
    && typeof candidate.capo === 'number'
    && Number.isFinite(candidate.capo)
    && typeof candidate.bpm === 'number'
    && Number.isFinite(candidate.bpm)
    && typeof candidate.timeSignature === 'string'
    && typeof candidate.updated === 'number';
}

function loadSongs(): Song[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === null) return [{ ...SEED }];
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(validSong).slice(0, 500) : [];
  } catch {
    return [{ ...SEED }];
  }
}

function button(text: string, onClick: () => void, kind = ''): HTMLButtonElement {
  return h('button', { type: 'button', class: 'sb-button ' + kind, text, onClick });
}

function heading(text: string): HTMLElement {
  return h('h2', { class: 'sb-title', text });
}

function field(labelText: string, input: HTMLElement): HTMLElement {
  return h('label', { class: 'sb-field' }, h('span', { text: labelText }), input);
}

function downloadBackup(songs: Song[]): void {
  const payload = JSON.stringify({ format: STORAGE_KEY, exportedAt: new Date().toISOString(), songs }, null, 2);
  const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
  const link = h('a', { href: url, download: 'guitar-songbook-backup.json' });
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function songbookView(): View {
  const element = h('section', { class: 'sb-root' });
  let songs = loadSongs();
  let selectedId = songs[0]?.id ?? '';
  let page: 'library' | 'edit' | 'play' = 'library';
  let searchText = '';
  let playing = false;
  let speed = 34;
  let fontSize = 24;
  let scroller: HTMLElement | null = null;
  let playToggle: HTMLButtonElement | null = null;
  let frame = 0;
  let lastFrame = 0;

  function chosen(): Song | undefined {
    return selectedId === DEMO_ID ? LYRIC_DEMO : songs.find(song => song.id === selectedId);
  }
  function copyDemo(): void {
    const song: Song = { ...LYRIC_DEMO, id: crypto.randomUUID(), title: 'My lyric chart', updated: Date.now() };
    songs.unshift(song);
    selectedId = song.id;
    save();
    show('edit');
  }
  function status(text: string, error = false): void {
    const node = element.querySelector<HTMLElement>('.sb-save-status');
    if (node) {
      node.textContent = text;
      node.classList.toggle('sb-error', error);
    }
  }
  function save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(songs));
      status('Saved on this device');
    } catch {
      status('Could not save. Export a backup before leaving.', true);
    }
  }
  function touched(song: Song): void { song.updated = Date.now(); save(); }
  function stop(): void {
    playing = false;
    cancelAnimationFrame(frame);
    frame = 0;
    lastFrame = 0;
    if (playToggle) playToggle.textContent = '▶ Auto-scroll';
  }
  function tick(now: number): void {
    if (!playing) return;
    if (lastFrame && scroller) {
      const dt = Math.min(80, now - lastFrame);
      scroller.scrollTop += speed * dt / 1000;
      const end = scroller.scrollHeight - scroller.clientHeight;
      if (end > 0 && scroller.scrollTop >= end - 2) {
        stop();
        return;
      }
    }
    lastFrame = now;
    frame = requestAnimationFrame(tick);
  }
  function togglePlay(): void {
    if (playing) { stop(); return; }
    if (!scroller) return;
    playing = true;
    lastFrame = 0;
    if (playToggle) playToggle.textContent = 'Ⅱ Pause';
    frame = requestAnimationFrame(tick);
  }
  function show(next: 'library' | 'edit' | 'play'): void {
    stop();
    page = next;
    render();
  }
  function add(): void {
    const song = newSong();
    songs.unshift(song);
    selectedId = song.id;
    save();
    show('edit');
  }
  function removeSong(song: Song): void {
    if (!confirm('Delete "' + song.title + '" from this device? Export a backup first if you want to keep it.')) return;
    songs = songs.filter(item => item.id !== song.id);
    selectedId = songs[0]?.id ?? '';
    save();
    show('library');
  }

  function tools(): HTMLElement {
    const picker = h('input', {
      type: 'file', accept: '.json,application/json', class: 'sb-file',
      'aria-label': 'Import Songbook JSON backup',
    });
    picker.addEventListener('change', () => {
      const file = picker.files?.[0];
      if (!file) return;
      void file.text().then(value => {
        const parsed: unknown = JSON.parse(value);
        const record = parsed as { format?: string; songs?: unknown };
        if (record.format !== STORAGE_KEY || !Array.isArray(record.songs)
          || !record.songs.every(validSong) || record.songs.length > 500) {
          throw new Error('Not a valid Songbook backup');
        }
        if (!confirm('Import ' + record.songs.length + ' song(s)? Songs with matching IDs will be updated.')) return;
        const incoming = record.songs as Song[];
        const map = new Map(songs.map(song => [song.id, song]));
        for (const song of incoming) map.set(song.id, song);
        songs = [...map.values()];
        selectedId = songs[0]?.id ?? '';
        save();
        render();
      }).catch(() => status('Import failed: choose a Songbook JSON backup.', true));
      picker.value = '';
    });
    return h('div', { class: 'sb-tools' },
      button('＋ New song', add, 'sb-primary'),
      button('↓ Export backup', () => downloadBackup(songs)),
      h('label', { class: 'sb-button sb-import' }, '↑ Import backup', picker),
    );
  }

  function library(): HTMLElement {
    const list = h('div', { class: 'sb-song-list' });
    function updateList(): void {
      clear(list);
      const matching = songs.filter(song => song.title.toLowerCase().includes(searchText.trim().toLowerCase()))
        .sort((a, b) => b.updated - a.updated);
      if (!matching.length) list.appendChild(h('p', { class: 'sb-muted', text: songs.length ? 'No matching songs.' : 'No songs yet. Start one above.' }));
      for (const song of matching) {
        const row = h('article', { class: 'sb-song-card' },
          h('div', { class: 'sb-song-detail' },
            h('strong', { text: song.title }),
            h('span', { class: 'sb-muted', text: 'Capo ' + song.capo + '  ·  ' + song.bpm + ' BPM  ·  ' + song.timeSignature })),
          h('div', { class: 'sb-song-actions' },
            button('Edit', () => { selectedId = song.id; show('edit'); }),
            button('Play', () => { selectedId = song.id; show('play'); }, 'sb-primary')));
        list.appendChild(row);
      }
    }
    const search = h('input', {
      type: 'search', placeholder: 'Search your originals', value: searchText,
      'aria-label': 'Search original songs',
    });
    search.addEventListener('input', () => { searchText = search.value; updateList(); });
    updateList();
    return h('div', {},
      h('p', { class: 'sb-muted', text: 'Your private, on-device library. The backup download matters: clearing browser data can erase local songs.' }),
      h('div', { class: 'sb-whats-new' },
        h('div', { class: 'sb-whats-new-label', text: 'SONGBOOK 2 · NEW CHART VIEW' }),
        h('h3', { text: 'See the words, chords, melody and breathing together' }),
        h('p', { text: 'The instrumental below still has no lyrics. Open this separate example to see what changed, without touching your saved songs.' }),
        button('▶ View lyric & melody example', () => { selectedId = DEMO_ID; show('play'); }, 'sb-primary'),
      ),
      tools(),
      h('div', { class: 'sb-search' }, search),
      list);
  }

  function editor(song: Song): HTMLElement {
    const title = h('input', { type: 'text', value: song.title, maxlength: '120', 'aria-label': 'Song title' });
    const bpm = h('input', { type: 'number', value: song.bpm, min: '30', max: '240', step: '1', inputmode: 'numeric' });
    const capo = h('input', { type: 'number', value: song.capo, min: '0', max: '12', step: '1', inputmode: 'numeric' });
    const meter = h('input', { type: 'text', value: song.timeSignature, maxlength: '12' });
    const notes = h('textarea', { rows: '3', value: song.notes, placeholder: 'Key, tuning, performance notes…' });
    const contents = h('textarea', {
      class: 'sb-content-input', rows: '16', value: song.content,
      autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false',
      'aria-label': 'Lyrics and chord chart',
    });
    title.addEventListener('input', () => { song.title = title.value; touched(song); });
    bpm.addEventListener('change', () => { song.bpm = Math.min(240, Math.max(30, Number(bpm.value) || 78)); bpm.value = String(song.bpm); touched(song); });
    capo.addEventListener('change', () => { song.capo = Math.min(12, Math.max(0, Number(capo.value) || 0)); capo.value = String(song.capo); touched(song); });
    meter.addEventListener('input', () => { song.timeSignature = meter.value; touched(song); });
    notes.addEventListener('input', () => { song.notes = notes.value; touched(song); });
    const preview = h('div', { class: 'sb-editor-preview' });
    function updatePreview(): void {
      clear(preview);
      preview.appendChild(renderSongChart(song.content));
    }
    contents.addEventListener('input', () => { song.content = contents.value; touched(song); updatePreview(); });
    function insert(text: string, selectInside = false): void {
      const start = contents.selectionStart;
      const end = contents.selectionEnd;
      contents.setRangeText(text, start, end, 'end');
      if (selectInside) contents.setSelectionRange(start + 1, start + text.length - 1);
      contents.focus();
      song.content = contents.value;
      touched(song);
      updatePreview();
    }
    const inserts = h('div', { class: 'sb-annotation-toolbar' },
      button('＋ Chord', () => insert('[G]', true)),
      button('＋ Melody cue', () => insert('{↑}', true)),
      button('＋ Breath', () => insert(' | ')),
      button('＋ Section', () => insert('\n# Chorus\n')),
    );
    updatePreview();

    return h('div', { class: 'sb-editor' },
      h('div', { class: 'sb-actionbar' },
        button('← Library', () => show('library')),
        button('▶ Performance view', () => show('play'), 'sb-primary'),
        button('Delete song', () => removeSong(song), 'sb-danger')),
      h('div', { class: 'sb-fields' },
        field('Title', title), field('BPM', bpm), field('Capo fret', capo), field('Time', meter)),
      field('Notes', notes),
      field('Chords and lyrics', contents),
      inserts,
      h('p', { class: 'sb-help', text: 'One lyric line is one sung phrase. Place [G] before a word for its chord; add {E4} before a word for a melody note or {↑}, {→}, {↓} for a rise, level, or fall cue. Use | for a breath or phrase break. Start a section with # Verse or # Chorus, or use > for playing instructions. Your melody cues are written by you, not guessed from audio.' }),
      h('div', { class: 'sb-preview-block' },
        h('div', { class: 'sb-preview-heading' }, h('strong', { text: 'Live chart preview' }), h('span', { class: 'sb-muted', text: 'Exactly how your phrases, chords, and melody cues will appear' })),
        preview,
      ),
      h('div', { class: 'sb-save-status', role: 'status', text: 'Changes save automatically on this device.' }),
    );
  }

  function performance(song: Song): HTMLElement {
    const body = renderSongChart(song.content);
    const readArea = h('div', { class: 'sb-scroll', tabindex: '0', 'aria-label': 'Song lyrics and chords, scrollable' }, body);
    scroller = readArea;
    const toggle = button('▶ Auto-scroll', togglePlay, 'sb-primary');
    playToggle = toggle;
    const sizeControl = h('input', { type: 'range', min: '17', max: '36', step: '1', value: String(fontSize), 'aria-label': 'Text size' });
    const speedControl = h('input', { type: 'range', min: '10', max: '100', step: '2', value: String(speed), 'aria-label': 'Scroll speed' });
    const sizeValue = h('span', { text: String(fontSize) + 'px' });
    const speedValue = h('span', { text: String(speed) + 'px/s' });
    body.style.fontSize = String(fontSize) + 'px';
    sizeControl.addEventListener('input', () => { fontSize = Number(sizeControl.value); sizeValue.textContent = String(fontSize) + 'px'; body.style.fontSize = String(fontSize) + 'px'; });
    speedControl.addEventListener('input', () => { speed = Number(speedControl.value); speedValue.textContent = String(speed) + 'px/s'; });
    const restart = button('↺ Start over', () => { stop(); readArea.scrollTop = 0; });
    const nextPhrase = button('Next phrase ↓', () => {
      const phrases = [...readArea.querySelectorAll<HTMLElement>('.sb-phrase')];
      const current = readArea.scrollTop;
      const nextTarget = phrases.find(item => item.offsetTop - readArea.offsetTop > current + 16);
      if (nextTarget) readArea.scrollTop = nextTarget.offsetTop - readArea.offsetTop;
    });
    const next = button('Next section ↓', () => {
      const nextHeading = [...readArea.querySelectorAll<HTMLElement>('.sb-section')]
        .find(section => section.offsetTop > readArea.scrollTop + readArea.offsetTop + 12);
      if (nextHeading) readArea.scrollTop = nextHeading.offsetTop - readArea.offsetTop;
    });
    const tapToPause = (event: KeyboardEvent): void => {
      if (event.code === 'Space' && event.target === readArea) { event.preventDefault(); togglePlay(); }
    };
    readArea.addEventListener('keydown', tapToPause);
    return h('div', { class: 'sb-performance' },
      h('div', { class: 'sb-actionbar' },
        selectedId === DEMO_ID
          ? button('＋ Copy this example to edit', copyDemo, 'sb-primary')
          : button('← Edit song', () => show('edit')),
        button('Library', () => show('library'))),
      h('h2', { class: 'sb-performing-title', text: song.title }),
      h('p', { class: 'sb-performance-meta', text: 'Capo ' + song.capo + '  ·  ' + song.bpm + ' BPM  ·  ' + song.timeSignature }),
      h('div', { class: 'sb-transport' }, toggle, restart, nextPhrase, next),
      h('div', { class: 'sb-controls' },
        field('Scroll speed', h('span', { class: 'sb-control' }, speedControl, speedValue)),
        field('Text size', h('span', { class: 'sb-control' }, sizeControl, sizeValue))),
      h('p', { class: 'sb-muted', text: 'Auto-scroll moves at your chosen pace. It does not listen to the guitar or automatically follow your playing. You can also swipe to scroll.' }),
      readArea,
      song.notes ? h('p', { class: 'sb-bottom-notes', text: song.notes }) : null,
    );
  }

  function render(): void {
    stop();
    clear(element);
    element.appendChild(h('header', { class: 'sb-page-header' },
      h('div', {}, h('p', { class: 'sb-overline', text: 'ORIGINAL MUSIC · v2 PHRASES' }), heading('Songbook'),
        h('a', { class: 'sb-update-link', href: '../repair.html', text: 'Still seeing the old app? Update safely' })),
      h('span', { class: 'sb-save-status', role: 'status', text: 'Saved on this device' })));
    const song = chosen();
    if (page === 'library') element.appendChild(library());
    else if (!song) { page = 'library'; element.appendChild(library()); }
    else element.appendChild(page === 'edit' ? editor(song) : performance(song));
  }
  render();
  return { element, dispose: stop };
}
