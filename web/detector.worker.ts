/**
 * Pitch detection, off the main thread.
 *
 * Detection costs roughly a fifth of a core at a 512-sample hop. Running that
 * on the main thread alongside rendering is what makes an audio app feel
 * sluggish, so it lives here and posts finished notes back.
 */

import { FrameStreamer } from '../src/audio/stream.ts';
import { NoteTracker } from '../src/audio/noteTracker.ts';
import type { Frame } from '../src/audio/noteTracker.ts';
import type { NoteEvent } from '../src/types.ts';

export type DetectorRequest =
  | { type: 'init'; sampleRate: number }
  | { type: 'audio'; chunk: Float32Array }
  | { type: 'flush' }
  | { type: 'reset' };

export interface DetectorResult {
  type: 'result';
  notes: NoteEvent[];
  timeMs: number;
  /** The most recent analysis frame, for the live pitch readout. */
  frame: Frame | null;
}

let streamer: FrameStreamer | null = null;
let tracker: NoteTracker | null = null;

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<DetectorRequest>) => void) | null;
  postMessage(message: DetectorResult): void;
};

function respond(notes: NoteEvent[], frame: Frame | null): void {
  scope.postMessage({ type: 'result', notes, timeMs: streamer?.currentTimeMs ?? 0, frame });
}

scope.onmessage = (event) => {
  const message = event.data;

  switch (message.type) {
    case 'init':
      streamer = new FrameStreamer({ sampleRate: message.sampleRate });
      tracker = new NoteTracker();
      break;

    case 'audio': {
      if (!streamer || !tracker) return;
      const notes: NoteEvent[] = [];
      let latest: Frame | null = null;
      for (const frame of streamer.push(message.chunk)) {
        latest = frame;
        notes.push(...tracker.process(frame));
      }
      respond(notes, latest);
      break;
    }

    case 'flush':
      if (!streamer || !tracker) return;
      respond(tracker.flush(streamer.currentTimeMs), null);
      break;

    case 'reset':
      streamer?.reset();
      tracker?.reset();
      break;
  }
};
