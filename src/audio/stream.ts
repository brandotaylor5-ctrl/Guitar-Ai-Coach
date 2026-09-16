/**
 * Buffers an incoming audio stream into overlapping analysis windows.
 *
 * Audio arrives in whatever block size the host hands us; pitch detection wants
 * fixed, overlapping windows. This sits between them and keeps session time in
 * samples, so timestamps stay exact no matter how the blocks are chopped up.
 */

import { detectPitch } from './pitchDetect.ts';
import type { PitchDetectOptions } from './pitchDetect.ts';
import type { Frame } from './noteTracker.ts';

export interface FrameStreamerOptions extends PitchDetectOptions {
  /** Analysis window length. 2048 at 44.1kHz reaches comfortably below low E. */
  windowSize?: number;
  /** Samples between successive windows. Smaller means tighter onset timing. */
  hopSize?: number;
}

export class FrameStreamer {
  readonly windowSize: number;
  readonly hopSize: number;
  private readonly options: PitchDetectOptions;
  private buffer: Float32Array;
  private filled = 0;
  /** Samples slid past, i.e. the left edge of the next analysis window. */
  private consumed = 0;
  /** Every sample ever handed in. This, not `consumed`, is session time. */
  private ingested = 0;

  constructor(options: FrameStreamerOptions) {
    this.windowSize = options.windowSize ?? 2048;
    this.hopSize = options.hopSize ?? 512;
    this.options = options;
    this.buffer = new Float32Array(this.windowSize);
  }

  get currentTimeMs(): number {
    return (this.ingested / this.options.sampleRate) * 1000;
  }

  /** Feed a block of samples; get back every analysis frame it completed. */
  push(chunk: Float32Array): Frame[] {
    const frames: Frame[] = [];
    this.ingested += chunk.length;
    let offset = 0;

    while (offset < chunk.length) {
      const room = this.windowSize - this.filled;
      const take = Math.min(room, chunk.length - offset);
      this.buffer.set(chunk.subarray(offset, offset + take), this.filled);
      this.filled += take;
      offset += take;

      if (this.filled < this.windowSize) break;

      const result = detectPitch(this.buffer, this.options);
      // Timestamp the centre of the window: that is the moment it describes.
      const centreSample = this.consumed + this.windowSize / 2;
      frames.push({ ...result, timeMs: (centreSample / this.options.sampleRate) * 1000 });

      // Slide by one hop, keeping the overlap.
      this.buffer.copyWithin(0, this.hopSize);
      this.filled = this.windowSize - this.hopSize;
      this.consumed += this.hopSize;
    }
    return frames;
  }

  reset(): void {
    this.buffer = new Float32Array(this.windowSize);
    this.filled = 0;
    this.consumed = 0;
    this.ingested = 0;
  }
}
