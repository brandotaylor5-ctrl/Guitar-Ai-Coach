/**
 * Slowing a recording down without the pitch dropping.
 *
 * Practising slowly is only useful if the notes stay where they were, so
 * simply playing the audio back at a lower rate is no good — that transposes
 * everything down and you end up learning the wrong thing.
 *
 * This is WSOLA (waveform similarity overlap-add): the signal is cut into
 * overlapping windows which are laid back down at a different spacing, and
 * each window is nudged to the nearby position whose waveform best continues
 * the one before it. That alignment step is what stops the overlaps from
 * fighting each other and turning a guitar into a flanger.
 */

export interface TimeStretchOptions {
  /** Window length in samples. ~23ms at 44.1kHz suits a plucked string. */
  windowSize?: number;
  /** How far to look for a better-aligned window, in samples. */
  searchRadius?: number;
}

/** Periodic Hann. At 50% overlap these sum to exactly one, so no rescaling. */
function hannWindow(size: number): Float32Array {
  const window = new Float32Array(size);
  for (let i = 0; i < size; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size);
  return window;
}

/**
 * How well the signal at `offset` continues `target`. Normalised, so a loud
 * passage cannot out-score a well-aligned quiet one.
 */
function similarity(input: Float32Array, offset: number, target: Float32Array, step: number): number {
  let dot = 0;
  let energy = 0;
  for (let i = 0; i < target.length; i += step) {
    const sample = input[offset + i] ?? 0;
    dot += sample * (target[i] ?? 0);
    energy += sample * sample;
  }
  return energy > 1e-12 ? dot / Math.sqrt(energy) : 0;
}

/**
 * Stretch audio in time, leaving pitch alone.
 *
 * `factor` is how much longer the result should be: 2 is half speed, 0.5 is
 * double speed, 1 returns the input unchanged.
 */
export function timeStretch(input: Float32Array, factor: number, options: TimeStretchOptions = {}): Float32Array {
  if (!Number.isFinite(factor) || factor <= 0) throw new Error('factor must be a positive number');
  if (factor === 1) return new Float32Array(input);

  const windowSize = options.windowSize ?? 1024;
  const synthesisHop = windowSize >> 1;
  const analysisHop = synthesisHop / factor;
  const searchRadius = options.searchRadius ?? Math.min(256, synthesisHop >> 1);

  if (input.length < windowSize * 2) {
    // Too short to stretch meaningfully; resampling it would change the pitch,
    // so hand back what we were given rather than something wrong.
    return new Float32Array(input);
  }

  const window = hannWindow(windowSize);
  const output = new Float32Array(Math.ceil(input.length * factor) + windowSize);
  // Correlating every sample is wasted work at audio rates.
  const step = Math.max(1, windowSize >> 6);

  let outputPos = 0;
  let target: Float32Array | null = null;
  let frame = 0;

  while (outputPos + windowSize <= output.length) {
    const ideal = Math.round(frame * analysisHop);
    if (ideal + windowSize > input.length) break;

    let best = ideal;
    if (target) {
      let bestScore = -Infinity;
      for (let delta = -searchRadius; delta <= searchRadius; delta++) {
        const candidate = ideal + delta;
        if (candidate < 0 || candidate + windowSize > input.length) continue;
        const score = similarity(input, candidate, target, step);
        if (score > bestScore) { bestScore = score; best = candidate; }
      }
    }

    for (let i = 0; i < windowSize; i++) {
      output[outputPos + i] = (output[outputPos + i] ?? 0) + (input[best + i] ?? 0) * (window[i] ?? 0);
    }

    // What would naturally have followed the window we just used. The next
    // window is chosen to continue this, wherever it happens to sit.
    const continuation = best + synthesisHop;
    if (continuation + windowSize <= input.length) {
      target = input.subarray(continuation, continuation + windowSize);
    } else {
      target = null;
    }

    outputPos += synthesisHop;
    frame++;
  }

  // Trim the tail that was never written into.
  const used = Math.min(output.length, outputPos + synthesisHop);
  return output.subarray(0, used);
}
