/**
 * Monophonic pitch detection (McLeod Pitch Method).
 *
 * MPM's normalised square difference function is markedly more octave-stable
 * than plain autocorrelation on plucked strings, where the fundamental is often
 * weaker than the harmonics above it. It also hands back a clarity figure,
 * which the rest of the system uses to decide whether a note really happened
 * and how much to trust it.
 *
 * This is deliberately the *only* part of the product that touches samples.
 */

export interface PitchResult {
  /** Detected fundamental in Hz, or 0 when nothing convincing was found. */
  hz: number;
  /** 0..1 periodicity. Low clarity means "that was probably not a note". */
  clarity: number;
  /** Root-mean-square level of the analysed window, 0..1. */
  rms: number;
}

export interface PitchDetectOptions {
  sampleRate: number;
  /** Below this, treat the window as silence. */
  rmsThreshold?: number;
  /** Peaks under this fraction of the strongest peak are ignored. */
  peakThreshold?: number;
  /** Search bounds. Defaults cover a guitar from drop-C to the 22nd fret. */
  minHz?: number;
  maxHz?: number;
}

export function rmsOf(buffer: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) sum += buffer[i]! * buffer[i]!;
  return Math.sqrt(sum / Math.max(1, buffer.length));
}

/** Refine a discrete peak to sub-sample accuracy through its two neighbours. */
function parabolicPeak(nsdf: Float32Array, index: number): { position: number; value: number } {
  const y0 = nsdf[index - 1] ?? nsdf[index]!;
  const y1 = nsdf[index]!;
  const y2 = nsdf[index + 1] ?? nsdf[index]!;
  const denom = 2 * y1 - y0 - y2;
  if (Math.abs(denom) < 1e-12) return { position: index, value: y1 };
  const shift = (y2 - y0) / (2 * denom);
  return { position: index + shift, value: y1 - 0.25 * (y0 - y2) * shift };
}

export function detectPitch(buffer: Float32Array, options: PitchDetectOptions): PitchResult {
  const { sampleRate } = options;
  const rmsThreshold = options.rmsThreshold ?? 0.01;
  const peakThreshold = options.peakThreshold ?? 0.9;
  const minHz = options.minHz ?? 65;
  const maxHz = options.maxHz ?? 1400;

  const rms = rmsOf(buffer);
  if (rms < rmsThreshold) return { hz: 0, clarity: 0, rms };

  const size = buffer.length;
  const minTau = Math.max(2, Math.floor(sampleRate / maxHz));
  const maxTau = Math.min(size - 1, Math.ceil(sampleRate / minHz));
  if (maxTau <= minTau) return { hz: 0, clarity: 0, rms };

  // NSDF: n(tau) = 2*r(tau) / m(tau), bounded to [-1, 1] and independent of level.
  const nsdf = new Float32Array(maxTau + 1);
  for (let tau = minTau; tau <= maxTau; tau++) {
    let acf = 0;
    let divisor = 0;
    const limit = size - tau;
    for (let i = 0; i < limit; i++) {
      const a = buffer[i]!;
      const b = buffer[i + tau]!;
      acf += a * b;
      divisor += a * a + b * b;
    }
    nsdf[tau] = divisor > 0 ? (2 * acf) / divisor : 0;
  }

  // Key maxima: the highest point of each positively-sloped hump.
  const peaks: number[] = [];
  let tau = minTau;
  while (tau < maxTau && nsdf[tau]! > 0) tau++; // skip the shoulder at tau=0
  while (tau < maxTau) {
    if (nsdf[tau]! > 0 && nsdf[tau]! > nsdf[tau - 1]!) {
      let best = tau;
      while (tau < maxTau && nsdf[tau]! >= 0) {
        if (nsdf[tau]! > nsdf[best]!) best = tau;
        tau++;
      }
      peaks.push(best);
    }
    tau++;
  }
  if (peaks.length === 0) return { hz: 0, clarity: 0, rms };

  // Take the *first* peak that clears the threshold, not the tallest: the
  // tallest is frequently an octave (or two) below the note actually played.
  const strongest = Math.max(...peaks.map((p) => nsdf[p]!));
  if (strongest <= 0) return { hz: 0, clarity: 0, rms };
  const cutoff = strongest * peakThreshold;
  const chosen = peaks.find((p) => nsdf[p]! >= cutoff) ?? peaks[0]!;

  const { position, value } = parabolicPeak(nsdf, chosen);
  if (position <= 0) return { hz: 0, clarity: 0, rms };

  const hz = sampleRate / position;
  if (hz < minHz || hz > maxHz) return { hz: 0, clarity: 0, rms };

  return { hz, clarity: Math.max(0, Math.min(1, value)), rms };
}
