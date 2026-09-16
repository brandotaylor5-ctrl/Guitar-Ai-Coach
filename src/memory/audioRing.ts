/**
 * An audio ring buffer that forgets by default.
 *
 * Saving a riff should be able to keep the actual sound of it, which means the
 * recent audio has to exist somewhere. It lives here, in a fixed-size circular
 * buffer that overwrites itself continuously and is only ever read when the
 * player explicitly saves something. Nothing here is persisted; `extract` is
 * the single door out.
 */

export interface AudioRingOptions {
  sampleRate: number;
  /** How much audio to keep. Default 60 seconds. */
  windowMs?: number;
}

export class AudioRingBuffer {
  readonly sampleRate: number;
  readonly capacity: number;
  private buffer: Float32Array;
  private writeIndex = 0;
  /** Total samples ever written, which also gives us absolute time. */
  private written = 0;

  constructor(options: AudioRingOptions) {
    this.sampleRate = options.sampleRate;
    const windowMs = options.windowMs ?? 60_000;
    this.capacity = Math.max(1, Math.floor((windowMs / 1000) * this.sampleRate));
    this.buffer = new Float32Array(this.capacity);
  }

  get durationMs(): number {
    return (Math.min(this.written, this.capacity) / this.sampleRate) * 1000;
  }

  /** Absolute end of the buffer, in session milliseconds. */
  get currentTimeMs(): number {
    return (this.written / this.sampleRate) * 1000;
  }

  write(chunk: Float32Array): void {
    for (let i = 0; i < chunk.length; i++) {
      this.buffer[this.writeIndex] = chunk[i]!;
      this.writeIndex = (this.writeIndex + 1) % this.capacity;
    }
    this.written += chunk.length;
  }

  /**
   * Pull a clip out by absolute session time. Returns only the portion still
   * in the buffer — audio older than the window is genuinely gone.
   */
  extract(fromMs: number, toMs: number): Float32Array {
    const oldestSample = Math.max(0, this.written - this.capacity);
    const from = Math.max(oldestSample, Math.floor((fromMs / 1000) * this.sampleRate));
    const to = Math.min(this.written, Math.ceil((toMs / 1000) * this.sampleRate));
    if (to <= from) return new Float32Array(0);

    const out = new Float32Array(to - from);
    for (let i = 0; i < out.length; i++) {
      out[i] = this.buffer[(from + i) % this.capacity]!;
    }
    return out;
  }

  /** Zero the buffer. The "I'd rather you didn't have that" button. */
  clear(): void {
    this.buffer = new Float32Array(this.capacity);
    this.writeIndex = 0;
    this.written = 0;
  }
}
