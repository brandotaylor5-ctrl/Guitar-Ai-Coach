/**
 * The app shell: owns the session, routes between views, and connects the
 * microphone to the live musical views.
 */

import { SketchbookSession } from '../src/session/session.ts';
import { analyzeNotes } from '../src/phrase/analyze.ts';
import { PlayerModelStore, phraseObservation } from '../src/coach/playerModel.ts';
import { noiseGate } from '../src/audio/calibration.ts';
import { RiffLibrary } from '../src/library/riffLibrary.ts';
import { LocalStorageRiffStore } from '../src/library/localStorageStore.ts';
import { STANDARD_TUNING, DROP_D_TUNING, HALF_STEP_DOWN, DADGAD_TUNING, customTuning, withCapo } from '../src/music/fretboard.ts';
import type { Tuning } from '../src/music/fretboard.ts';
import { MicCapture } from './audio/capture.ts';
import { armAudioUnlock, audioBlocked, onAudioStateChange, unlockAudio } from './audio/context.ts';
import { RiffPlayer } from './audio/playback.ts';
import { ClipStore } from './audio/clipStore.ts';
import { h, clear, qs, replace } from './ui/dom.ts';
import { coachView } from './views/coach.ts';
import { labView } from './views/lab.ts';
import { todayView } from './views/today.ts';
import { lessonsView } from './views/lessons.ts';
import { libraryView } from './views/library.ts';
import { songsView } from './views/songs.ts';
import { songListView } from './views/songList.ts';
import { pathView } from './views/path.ts';
import { practiceTodayView } from './views/practiceToday.ts';
import { songView } from './views/song.ts';
import { fingerprintView } from './views/fingerprint.ts';
import type { AppContext, View, ViewName } from './views/context.ts';

const TUNINGS: Tuning[] = [STANDARD_TUNING, DROP_D_TUNING, HALF_STEP_DOWN, DADGAD_TUNING];

const state = {
  session: new SketchbookSession(),
  library: new RiffLibrary(),
  listening: false,
  view: 'session' as ViewName,
  params: {} as Record<string, string>,
  tuning: STANDARD_TUNING,
  sampleRate: 0,
};

/**
 * Four places, and each one is a different question.
 *
 * Songs is what you came to do. Learn is how you get better at it. Coach is
 * the app listening to you. You is what it has heard and what you have made.
 * Everything else that used to have a tab of its own is reachable from inside
 * the one it belongs to — seven tabs is not a front page, it is a filing
 * cabinet, and nobody picks up a guitar to file.
 */
const PRIMARY_TABS: Array<[ViewName, string]> = [];

/**
 * Secondary places support the four musical front doors without competing
 * with them. Riff School is primary now because fretboard vocabulary and
 * creation are a core part of the product rather than a hidden sandbox.
 */
const MORE_TABS: Array<[ViewName, string]> = [
  ['library', 'Saved ideas'],
  ['path', 'Roadmap'],
];

/**
 * Every routable view, which is not the same as every tab. A single song has
 * its own address so it can be linked and reloaded, but it is reached by
 * choosing one rather than from the navigation.
 */
const VIEW_NAMES: string[] = [
  'session',
  'library',
  'path',
  'song',
  'songs',
  'fingerprint',
  'practice',
  'lab',
  'lessons',
  'today',
  'seeds',
];

let moreOpen = false;
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

async function backfillPlayerModel(store: Storage): Promise<void> {
  const model = new PlayerModelStore(store);
  try {
    const riffs = await state.library.listRiffs();
    for (const riff of riffs) {
      for (const version of riff.versions) {
        if (version.notes.length < 3) continue;
        const analysis = analyzeNotes(version.notes, { tuning: state.tuning });
        model.recordPhrase(phraseObservation(
          `library:${riff.id}:${version.id}`,
          analysis,
          version.createdAt,
        ));
      }
    }
  } catch {
    // Historical backfill is an enhancement, never a reason to block the app.
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
  onChordExplain(explanation) {
    current?.onChordExplain?.(explanation);
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

/**
 * Starting/stopping the mic used to call render(), which destroys the current
 * view. That is disastrous inside a drill or Riff Lab attempt: the very act of
 * turning listening on erased the exercise that needed the microphone.
 *
 * Listening is transport state, not navigation. Keep the mounted view alive
 * and only refresh the tiny pieces that actually depend on that state.
 */
function syncListeningUi(): void {
  qs('#live-dot').classList.toggle('is-live', state.listening);
  if (state.view === 'session') current?.update?.();
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
      say('I am listening. Play naturally — notes and chord guesses stay on this device.');
    } catch (err) {
      const error = err as Error;
      say(
        error.name === 'NotAllowedError'
          ? 'Microphone access was declined. I cannot hear the guitar without it.'
          : `Could not start listening: ${error.message}`,
        'error',
      );
      state.listening = false;
    } finally {
      changingCapture = false;
      syncListeningUi();
    }
  },

  async stopListening() {
    if (changingCapture || !state.listening) return;
    changingCapture = true;
    try {
      await capture.stop();
      state.listening = false;
      qs<HTMLSelectElement>('#microphone').disabled = false;
      stoppedAt = performance.now();
      stoppedClock = state.session.currentTimeMs;
      pausedElapsed = 0;
      say('Stopped. Your recent playing is still in memory for a minute.');
    } finally {
      changingCapture = false;
      syncListeningUi();
    }
  },

  refresh() { render(); },

  navigate(view, params = {}) {
    state.view = view;
    state.params = params;
    const query = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    window.location.hash = view === 'session' && !query ? '' : `#${view}${query ? `?${query}` : ''}`;
    render();
  },

  say,

  setChordDiagnostics(on) {
    capture.diagnostics = on;
  },
};

function buildView(): View {
  switch (state.view) {
    case 'lab': return labView(context, state.params);
    case 'lessons': return lessonsView(context, state.params);
    case 'session': return coachView(context);
    case 'library': return libraryView(context, state.params);
    case 'practice': return practiceTodayView(context);
    case 'path': return pathView(context);
    case 'songs': return songListView(context);
    case 'song': return songView(context, state.params);
    case 'seeds': return songsView(context);
    case 'fingerprint': return fingerprintView(context);
    case 'today': return todayView(context);
    default: return coachView(context);
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
  // Never hide the section someone is standing in.
  if (MORE_TABS.some(([view]) => view === state.view)) setMoreOpen(true);
  qs('#live-dot').classList.toggle('is-live', state.listening);
}

/** Read the view and its parameters back out of the address bar. */
function readHash(): void {
  const raw = window.location.hash.replace('#', '');
  const [name, query = ''] = raw.split('?');
  state.view = VIEW_NAMES.includes(name ?? '') ? (name as ViewName) : 'session';
  state.params = Object.fromEntries(
    query.split('&').filter(Boolean).map((pair) => {
      const [key, value = ''] = pair.split('=');
      return [key ?? '', decodeURIComponent(value)];
    }),
  );
}

function setMoreOpen(open: boolean): void {
  moreOpen = open;
  const more = document.getElementById('nav-more');
  const toggle = document.querySelector<HTMLButtonElement>('.nav-more-toggle');
  if (more) more.classList.toggle('is-open', open);
  toggle?.setAttribute('aria-expanded', String(open));
}

/**
 * Silence is the worst failure a music app can have, because it looks like
 * nothing happened. If the browser is holding the audio back, say so and give
 * them the tap that fixes it.
 */
function watchSound(): void {
  const banner = qs('#sound-blocked');
  const button = qs<HTMLButtonElement>('#sound-enable');
  button.addEventListener('click', async () => {
    const ready = await unlockAudio();
    if (!ready) say('This browser is still blocking sound. Check the silent switch or volume, then tap again.', 'error');
  });
  const update = () => { banner.hidden = !audioBlocked(); };
  onAudioStateChange(update);
  update();
  // A context can be suspended again by the browser without telling anyone.
  window.setInterval(update, 2000);
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
  for (const [view, label] of PRIMARY_TABS) {
    nav.appendChild(h('button', {
      class: 'nav-tab', type: 'button', text: label, dataset: { view },
      onClick: () => context.navigate(view),
    }));
  }
  // The other three are real places, but nobody needs them on the way in.
  const more = h('div', { class: 'nav-more', id: 'nav-more' });
  for (const [view, label] of MORE_TABS) {
    more.appendChild(h('button', {
      class: 'nav-tab', type: 'button', text: label, dataset: { view },
      onClick: () => context.navigate(view),
    }));
  }
  const moreToggle = h('button', {
    class: 'nav-tab nav-more-toggle', type: 'button', text: '•••',
    title: 'Saved ideas and roadmap',
    'aria-label': 'Open saved ideas and roadmap',
    onClick: () => setMoreOpen(!moreOpen),
  });
  moreToggle.setAttribute('aria-controls', 'nav-more');
  nav.append(moreToggle, more);
  setMoreOpen(false);

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

  window.addEventListener('hashchange', () => { readHash(); render(); });
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
  if (store) void backfillPlayerModel(store);

  mountChrome();
  armAudioUnlock();
  watchSound();
  readHash();
  render();

  window.setInterval(() => {
    if (stoppedAt === null) return;
    const elapsed = performance.now() - stoppedAt;
    state.session.memory.tick(stoppedClock + elapsed);
    if (elapsed >= state.session.memory.windowMs) {
      state.session = new SketchbookSession({ library: state.library, tuning: state.tuning });
      state.sampleRate = 0;
      stoppedAt = null;
      // Expiring old unsaved memory should not destroy an active screen either.
      current?.onNotes?.();
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
