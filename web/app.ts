/**
 * The app shell: owns the session, routes between views, and connects the
 * microphone to everything else.
 */

import { SketchbookSession } from '../src/session/session.ts';
import { RiffLibrary } from '../src/library/riffLibrary.ts';
import { LocalStorageRiffStore } from '../src/library/localStorageStore.ts';
import { STANDARD_TUNING, DROP_D_TUNING, HALF_STEP_DOWN } from '../src/music/fretboard.ts';
import type { Tuning } from '../src/music/fretboard.ts';
import { MicCapture } from './audio/capture.ts';
import { RiffPlayer } from './audio/playback.ts';
import { ClipStore } from './audio/clipStore.ts';
import { h, clear, qs, replace } from './ui/dom.ts';
import { sessionView } from './views/session.ts';
import { libraryView } from './views/library.ts';
import { songsView } from './views/songs.ts';
import { fingerprintView } from './views/fingerprint.ts';
import type { AppContext, View, ViewName } from './views/context.ts';

const TUNINGS: Tuning[] = [STANDARD_TUNING, DROP_D_TUNING, HALF_STEP_DOWN];

const state = {
  session: new SketchbookSession(),
  library: new RiffLibrary(),
  listening: false,
  view: 'session' as ViewName,
  params: {} as Record<string, string>,
  tuning: STANDARD_TUNING,
  sampleRate: 0,
};

let current: View | null = null;
const player = new RiffPlayer();
const clips = new ClipStore();

function storage(): Storage | null {
  try {
    const probe = '__riff_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    // Private browsing, or storage blocked. The app still works; it just
    // forgets when the tab closes, and it should say so rather than crash.
    return null;
  }
}

/**
 * The session can only be built once the audio hardware has told us its sample
 * rate, so it starts without audio and is rebuilt on the first listen.
 */
function ensureSessionFor(sampleRate: number): void {
  if (state.sampleRate === sampleRate) return;
  state.sampleRate = sampleRate;
  state.session = new SketchbookSession({
    library: state.library,
    tuning: state.tuning,
    audio: { sampleRate, retainAudio: true, detect: false },
  });
}

const capture = new MicCapture({
  onNotes(notes, timeMs) {
    state.session.addNotes(notes);
    state.session.memory.tick(timeMs);
    current?.onNotes?.();
  },
  onAudio(chunk) {
    if (state.sampleRate) state.session.feedAudio(chunk);
  },
  onFrame(frame) {
    current?.onFrame?.(frame);
  },
  onError(error) {
    say(error.message, 'error');
  },
});

function say(message: string, kind: 'info' | 'error' = 'info'): void {
  const bar = qs('#status');
  replace(bar, h('p', { class: `status-message is-${kind}`, text: message }));
  bar.classList.add('is-visible');
  window.clearTimeout(Number(bar.dataset.timer ?? 0));
  bar.dataset.timer = String(window.setTimeout(() => {
    bar.classList.remove('is-visible');
  }, kind === 'error' ? 9000 : 5000));
}

const context: AppContext = {
  get session() { return state.session; },
  get library() { return state.library; },
  get listening() { return state.listening; },
  get sampleRate() { return state.sampleRate; },
  player,
  clips,

  async keepClipFor(audioRef) {
    if (!audioRef) return;
    const clip = state.session.getClip(audioRef);
    if (!clip || clip.length === 0) return;
    const kept = await clips.put(audioRef, clip, state.sampleRate);
    if (!kept) say('Saved the riff, but this browser would not keep the recording.', 'error');
  },

  async startListening() {
    try {
      await capture.start();
      ensureSessionFor(capture.sampleRate);
      state.listening = true;
      say('Listening. Nothing is being recorded — play something.');
    } catch (err) {
      const error = err as Error;
      say(
        error.name === 'NotAllowedError'
          ? 'Microphone access was declined. The app cannot hear anything without it.'
          : `Could not start listening: ${error.message}`,
        'error',
      );
      state.listening = false;
    }
    render();
  },

  async stopListening() {
    await capture.stop();
    state.listening = false;
    say('Stopped. What you played is still in memory for a minute.');
    render();
  },

  refresh() { render(); },

  navigate(view, params = {}) {
    state.view = view;
    state.params = params;
    window.location.hash = view === 'session' ? '' : `#${view}`;
    render();
  },

  say,
};

function buildView(): View {
  switch (state.view) {
    case 'library': return libraryView(context, state.params);
    case 'songs': return songsView(context);
    case 'fingerprint': return fingerprintView(context);
    default: return sessionView(context);
  }
}

function render(): void {
  current?.dispose?.();
  current = buildView();
  const main = qs('#view');
  clear(main);
  main.appendChild(current.element);

  for (const tab of document.querySelectorAll<HTMLButtonElement>('.nav-tab')) {
    tab.classList.toggle('is-active', tab.dataset.view === state.view);
    tab.setAttribute('aria-current', tab.dataset.view === state.view ? 'page' : 'false');
  }
  qs('#live-dot').classList.toggle('is-live', state.listening);
}

function mountChrome(): void {
  const nav = qs('#nav');
  const tabs: Array<[ViewName, string]> = [
    ['session', 'Session'], ['library', 'Riff Library'], ['songs', 'Songs'], ['fingerprint', 'Fingerprint'],
  ];
  for (const [view, label] of tabs) {
    nav.appendChild(h('button', {
      class: 'nav-tab', type: 'button', text: label, dataset: { view },
      onClick: () => context.navigate(view),
    }));
  }

  const select = qs<HTMLSelectElement>('#tuning');
  for (const tuning of TUNINGS) {
    select.appendChild(h('option', { value: tuning.name, text: tuning.name }));
  }
  select.addEventListener('change', () => {
    state.tuning = TUNINGS.find((t) => t.name === select.value) ?? STANDARD_TUNING;
    // The session holds the tuning, so rebuild it — but keep what was played.
    const heard = state.session.memory.all();
    state.sampleRate = 0;
    if (capture.running) ensureSessionFor(capture.sampleRate);
    else state.session = new SketchbookSession({ library: state.library, tuning: state.tuning });
    state.session.addNotes(heard);
    say(`Reading the fretboard as ${state.tuning.name}.`);
    render();
  });

  window.addEventListener('hashchange', () => {
    const view = window.location.hash.replace('#', '') as ViewName;
    state.view = ['library', 'songs', 'fingerprint'].includes(view) ? view : 'session';
    render();
  });

  // A note still ringing when the tab closes should not be lost mid-session.
  window.addEventListener('beforeunload', () => { void capture.stop(); });
}

function start(): void {
  const store = storage();
  state.library = new RiffLibrary(store ? new LocalStorageRiffStore(store) : undefined);
  state.session = new SketchbookSession({ library: state.library, tuning: state.tuning });

  mountChrome();
  const hash = window.location.hash.replace('#', '') as ViewName;
  if (['library', 'songs', 'fingerprint'].includes(hash)) state.view = hash;
  render();

  if (!store) {
    say('Browser storage is unavailable, so saved riffs will not survive closing this tab.', 'error');
  }
  if (!window.AudioWorkletNode) {
    say('This browser is missing the audio features the app needs. Try a recent Chrome, Edge, Firefox or Safari.', 'error');
  }
}

start();
