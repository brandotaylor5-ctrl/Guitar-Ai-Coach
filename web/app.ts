/**
 * The app shell: owns the session, routes between views, and connects the
 * microphone to the live musical views.
 */

import { SketchbookSession } from '../src/session/session.ts';
import { noiseGate } from '../src/audio/calibration.ts';
import { RiffLibrary } from '../src/library/riffLibrary.ts';
import { LocalStorageRiffStore } from '../src/library/localStorageStore.ts';
import { STANDARD_TUNING, DROP_D_TUNING, HALF_STEP_DOWN, DADGAD_TUNING, customTuning, withCapo } from '../src/music/fretboard.ts';
import type { Tuning } from '../src/music/fretboard.ts';
import { MicCapture } from './audio/capture.ts';
import { RiffPlayer } from './audio/playback.ts';
import { ClipStore } from './audio/clipStore.ts';
import { h, clear, qs, replace } from './ui/dom.ts';
import { sessionView } from './views/session.ts';
import { labView } from './views/lab.ts';
import { todayView } from './views/today.ts';
import { lessonsView } from './views/lessons.ts';
import { libraryView } from './views/library.ts';
import { songsView } from './views/songs.ts';
import { fingerprintView } from './views/fingerprint.ts';
import type { AppContext, View, ViewName } from './views/context.ts';

const TUNINGS: Tuning[] = [STANDARD_TUNING, DROP_D_TUNING, HALF_STEP_DOWN, DADGAD_TUNING];

const state = {
  session: new SketchbookSession(),
  library: new RiffLibrary(),
  listening: false,
  view: 'today' as ViewName,
  params: {} as Record<string, string>,
  tuning: STANDARD_TUNING,
  sampleRate: 0,
};

let current: View | null = null;
let stoppedAt: number | null = null;
let stoppedClock = 0;
let pausedElapsed = 0;
let changingCapture = false;
let calibrationLevels: number[] | null = null;
const player = new RiffPlayer();
const clips = new ClipStore();

function storage(): Storage | null {
  try {
    const probe = '__riff_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

function ensureSessionFor(sampleRate: number): void {
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
    calibrationLevels?.push(frame.rms);
    current?.onFrame?.(frame);
  },
  onChord(chord) {
    current?.onChord?.(chord);
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
    if (changingCapture || state.listening) return;
    changingCapture = true;
    try {
      await capture.start();
      ensureSessionFor(capture.sampleRate);
      stoppedAt = null;
      state.listening = true;
      qs<HTMLSelectElement>('#microphone').disabled = true;
      await listMicrophones();
      say('Live Coach is listening. Play naturally — notes and chord guesses stay on this device.');
    } catch (err) {
      const error = err as Error;
      say(
        error.name === 'NotAllowedError'
          ? 'Microphone access was declined. Live Coach cannot hear the guitar without it.'
          : `Could not start listening: ${error.message}`,
        'error',
      );
      state.listening = false;
    } finally {
      changingCapture = false;
    }
    render();
  },

  async stopListening() {
    if (changingCapture || !state.listening) return;
    changingCapture = true;
    await capture.stop();
    state.listening = false;
    qs<HTMLSelectElement>('#microphone').disabled = false;
    changingCapture = false;
    stoppedAt = performance.now();
    stoppedClock = state.session.currentTimeMs;
    pausedElapsed = 0;
    say('Stopped. Your recent playing is still in memory for a minute.');
    render();
  },

  refresh() { render(); },

  navigate(view, params = {}) {
    state.view = view;
    state.params = params;
    window.location.hash = view === 'today' ? '' : `#${view}`;
    render();
  },

  say,
};

function buildView(): View {
  switch (state.view) {
    case 'lab': return labView(context, state.params);
    case 'lessons': return lessonsView(context);
    case 'session': return sessionView(context);
    case 'library': return libraryView(context, state.params);
    case 'songs': return songsView(context);
    case 'fingerprint': return fingerprintView(context);
    default: return todayView(context);
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
  const input = qs<HTMLSelectElement>('#microphone');
  input.addEventListener('change', () => { capture.deviceId = input.value; });
  const gate = qs<HTMLInputElement>('#noise-gate');
  gate.addEventListener('change', () => {
    try { capture.setSensitivity(Number(gate.value)); }
    catch (error) { say((error as Error).message, 'error'); gate.value = String(capture.minRms); }
  });
  const calibrate = qs<HTMLButtonElement>('#calibrate');
  calibrate.addEventListener('click', async () => {
    if (!state.listening) { say('Start listening first, then mute your strings.'); return; }
    calibrate.disabled = true;
    calibrationLevels = [];
    say('Keep your strings muted for two seconds.');
    await new Promise((resolve) => window.setTimeout(resolve, 2000));
    try {
      if (!state.listening) throw new Error('Listening stopped. Start again before calibrating.');
      const threshold = noiseGate(calibrationLevels);
      capture.setSensitivity(threshold);
      gate.value = String(Number(threshold.toFixed(4)));
      say('Room noise calibrated. Play normally now.');
    } catch (error) { say((error as Error).message, 'error'); }
    finally { calibrationLevels = null; calibrate.disabled = false; }
  });

  const nav = qs('#nav');
  const tabs: Array<[ViewName, string]> = [
    ['today', 'Today'],
    ['session', 'Play'],
    ['lessons', 'Lessons'],
    ['lab', 'Riff Lab'],
    ['library', 'My Riffs'],
    ['songs', 'Songs'],
    ['fingerprint', 'Fingerprint'],
  ];
  for (const [view, label] of tabs) {
    nav.appendChild(h('button', {
      class: 'nav-tab', type: 'button', text: label, dataset: { view },
      onClick: () => context.navigate(view),
    }));
  }

  const select = qs<HTMLSelectElement>('#tuning');
  for (const tuning of TUNINGS) select.appendChild(h('option', { value: tuning.name, text: tuning.name }));
  select.appendChild(h('option', { value: 'custom', text: 'Custom' }));
  const custom = qs<HTMLInputElement>('#custom-tuning');
  const capo = qs<HTMLInputElement>('#capo');
  function applyTuning(): void {
    custom.hidden = select.value !== 'custom';
    try {
      const base = select.value === 'custom' ? customTuning(custom.value)
        : TUNINGS.find((t) => t.name === select.value) ?? STANDARD_TUNING;
      state.tuning = withCapo(base, Number(capo.value));
      state.session.tuning = state.tuning;
      say(`Reading the guitar as ${state.tuning.name}.`);
      render();
    } catch (error) { say((error as Error).message, 'error'); }
  }
  select.addEventListener('change', applyTuning);
  custom.addEventListener('change', applyTuning);
  capo.addEventListener('change', applyTuning);

  window.addEventListener('hashchange', () => {
    const view = window.location.hash.replace('#', '') as ViewName;
    state.view = ['session', 'lessons', 'lab', 'library', 'songs', 'fingerprint'].includes(view) ? view : 'today';
    render();
  });
  window.addEventListener('beforeunload', () => { void capture.stop(); });
}

async function listMicrophones(): Promise<void> {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const input = qs<HTMLSelectElement>('#microphone');
    replace(input, h('option', { value: '', text: 'Default microphone' }),
      ...devices.filter((d) => d.kind === 'audioinput').map((d, i) =>
        h('option', { value: d.deviceId, text: d.label || `Microphone ${i + 1}` })));
    input.value = capture.deviceId;
  } catch { say('This browser could not list microphones. The active input still works.'); }
}

function start(): void {
  const store = storage();
  state.library = new RiffLibrary(store ? new LocalStorageRiffStore(store) : undefined);
  state.session = new SketchbookSession({ library: state.library, tuning: state.tuning });

  mountChrome();
  const hash = window.location.hash.replace('#', '') as ViewName;
  if (['session', 'lessons', 'lab', 'library', 'songs', 'fingerprint'].includes(hash)) state.view = hash;
  render();

  window.setInterval(() => {
    if (stoppedAt === null) return;
    const elapsed = performance.now() - stoppedAt;
    state.session.memory.tick(stoppedClock + elapsed);
    if (elapsed >= state.session.memory.windowMs) {
      state.session = new SketchbookSession({ library: state.library, tuning: state.tuning });
      state.sampleRate = 0;
      stoppedAt = null;
      render();
    } else {
      if (state.sampleRate) {
        state.session.feedAudio(new Float32Array(
          Math.max(0, Math.floor((elapsed - pausedElapsed) * state.sampleRate / 1000))));
      }
      pausedElapsed = elapsed;
      current?.onNotes?.();
    }
  }, 250);

  if (!store) say('Browser storage is unavailable, so saved riffs will not survive closing this tab.', 'error');
  if (!window.AudioWorkletNode) say('This browser is missing audio features the app needs. Try a recent Safari, Chrome, Edge or Firefox.', 'error');
}

start();