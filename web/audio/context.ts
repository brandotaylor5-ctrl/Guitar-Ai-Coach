/**
 * One audio context for the whole app, unlocked on the first touch.
 *
 * Browsers will not make sound until the person has interacted with the page,
 * and a context created before that starts suspended and stays suspended.
 * iOS is stricter still: it wants the context woken inside the gesture itself,
 * and it will keep a page silent if the ring switch is off unless something
 * has actually played.
 *
 * All of which fails the same way — no sound, no error, nothing to see. So
 * this unlocks once on the first gesture anywhere, and exposes whether it
 * worked so the interface can say so rather than leaving someone tapping a
 * button that does nothing.
 */

let context: AudioContext | null = null;
let unlocked = false;
const listeners = new Set<(ready: boolean) => void>();

/** The shared context. Created on demand; may be suspended until unlocked. */
export function audioContext(): AudioContext {
  if (!context) context = new AudioContext({ latencyHint: 'interactive' });
  return context;
}

export function audioReady(): boolean {
  return context !== null && context.state === 'running';
}

/**
 * True only once something has actually asked for sound and been refused.
 * Before that there is nothing to warn anyone about.
 */
export function audioBlocked(): boolean {
  return context !== null && context.state !== 'running';
}

/** Told whenever the audio state changes, so the UI can stop lying about it. */
export function onAudioStateChange(listener: (ready: boolean) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function announce(): void {
  const ready = audioReady();
  for (const listener of listeners) listener(ready);
}

/**
 * Wake the audio up. Safe to call as often as you like; only the first call
 * does anything. Must be called from inside a real user gesture.
 */
export async function unlockAudio(): Promise<boolean> {
  const ctx = audioContext();
  try {
    if (ctx.state === 'suspended') await ctx.resume();
    if (!unlocked) {
      // iOS stays muted until something has actually been played through the
      // context, even after resume. A single silent buffer is enough.
      const buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
      unlocked = true;
    }
  } catch {
    // Left suspended. `audioReady` reports it and the interface can say so.
  }
  announce();
  return audioReady();
}

/** Attach the one-time unlock to the first gesture anywhere on the page. */
export function armAudioUnlock(): void {
  const events = ['pointerdown', 'touchend', 'keydown'] as const;
  const handler = () => { void unlockAudio(); };
  for (const type of events) {
    document.addEventListener(type, handler, { capture: true, passive: true });
  }
  // Coming back to a backgrounded tab can leave the context suspended.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && context?.state === 'suspended') void unlockAudio();
  });
}
