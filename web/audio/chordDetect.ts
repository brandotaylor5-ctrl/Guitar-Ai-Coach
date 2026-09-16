/** Lightweight real-time chord recognition for guitar microphone input.
 *
 * This is deliberately conservative. It builds pitch-class evidence from the
 * spectral energy at plausible guitar fundamentals and their harmonics, then
 * matches that evidence against common guitar-chord templates. A result is only
 * emitted after several consecutive frames agree, so one loud harmonic does
 * not instantly become a fake chord.
 */

export type ChordQuality = 'major' | 'minor' | '5' | 'sus2' | 'sus4' | '7' | 'maj7' | 'm7';

export interface ChordDetection {
  label: string;
  rootPc: number;
  quality: ChordQuality;
  confidence: number;
  pitchClasses: number[];
}

const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const TEMPLATES: Array<{ quality: ChordQuality; pcs: number[]; suffix: string }> = [
  { quality: 'major', pcs: [0, 4, 7], suffix: '' },
  { quality: 'minor', pcs: [0, 3, 7], suffix: 'm' },
  { quality: '5', pcs: [0, 7], suffix: '5' },
  { quality: 'sus2', pcs: [0, 2, 7], suffix: 'sus2' },
  { quality: 'sus4', pcs: [0, 5, 7], suffix: 'sus4' },
  { quality: '7', pcs: [0, 4, 7, 10], suffix: '7' },
  { quality: 'maj7', pcs: [0, 4, 7, 11], suffix: 'maj7' },
  { quality: 'm7', pcs: [0, 3, 7, 10], suffix: 'm7' },
];

function binEnergy(db: Float32Array, frequency: number, sampleRate: number, fftSize: number): number {
  if (frequency <= 0 || frequency >= sampleRate / 2) return 0;
  const bin = Math.round(frequency * fftSize / sampleRate);
  if (bin < 1 || bin >= db.length) return 0;
  // Read a tiny neighbourhood so a note between FFT bins is not punished.
  let best = -120;
  for (let i = Math.max(1, bin - 1); i <= Math.min(db.length - 1, bin + 1); i++) best = Math.max(best, db[i]!);
  if (best < -82) return 0;
  return Math.pow(10, best / 20);
}

function midiFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Estimate how strongly each pitch class exists as a *fundamental*.
 * Harmonics help its own fundamental score but do not directly vote as notes.
 */
export function guitarChroma(db: Float32Array, sampleRate: number, fftSize: number): number[] {
  const chroma = Array(12).fill(0) as number[];
  for (let midi = 40; midi <= 88; midi++) {
    const f = midiFrequency(midi);
    const fundamental = binEnergy(db, f, sampleRate, fftSize);
    if (fundamental === 0) continue;
    const score = fundamental
      + binEnergy(db, f * 2, sampleRate, fftSize) * 0.34
      + binEnergy(db, f * 3, sampleRate, fftSize) * 0.18
      + binEnergy(db, f * 4, sampleRate, fftSize) * 0.10;
    const pc = ((midi % 12) + 12) % 12;
    chroma[pc] = Math.max(chroma[pc]!, score);
  }
  const max = Math.max(...chroma, 1e-9);
  return chroma.map((x) => x / max);
}

export function detectChord(db: Float32Array, sampleRate: number, fftSize: number): ChordDetection | null {
  const chroma = guitarChroma(db, sampleRate, fftSize);
  const audible = chroma.map((v, pc) => ({ v, pc })).filter((x) => x.v >= 0.28).sort((a, b) => b.v - a.v);
  if (audible.length < 2) return null;

  let best: { score: number; rootPc: number; template: typeof TEMPLATES[number] } | null = null;
  let second = -Infinity;
  for (let rootPc = 0; rootPc < 12; rootPc++) {
    for (const template of TEMPLATES) {
      const wanted = template.pcs.map((d) => (rootPc + d) % 12);
      const inside = wanted.reduce((sum, p) => sum + chroma[p]!, 0) / wanted.length;
      const outsideValues = chroma.filter((_, p) => !wanted.includes(p));
      const outside = outsideValues.reduce((a, b) => a + b, 0) / outsideValues.length;
      // Root presence matters on guitar. It also stops a single fifth from being
      // labelled as several unrelated inversions with equal confidence.
      const rootBonus = chroma[rootPc]! * 0.18;
      const score = inside - outside * 0.34 + rootBonus;
      if (!best || score > best.score) {
        if (best) second = best.score;
        best = { score, rootPc, template };
      } else if (score > second) second = score;
    }
  }
  if (!best) return null;

  const wanted = best.template.pcs.map((d) => (best.rootPc + d) % 12);
  const present = wanted.filter((p) => chroma[p]! >= 0.22).length;
  const required = best.template.quality === '5' ? 2 : Math.min(3, wanted.length);
  if (present < required || best.score < 0.44) return null;

  const margin = Math.max(0, best.score - second);
  const confidence = Math.max(0, Math.min(1, 0.48 + margin * 1.8 + (present / wanted.length) * 0.28));
  if (confidence < 0.58) return null;
  return {
    label: `${NAMES[best.rootPc]}${best.template.suffix}`,
    rootPc: best.rootPc,
    quality: best.template.quality,
    confidence,
    pitchClasses: audible.slice(0, 6).map((x) => x.pc),
  };
}

/** Require the same answer repeatedly before telling the UI. */
export class ChordTracker {
  private candidate = '';
  private hits = 0;
  private lastEmitted = '';
  private lastEmission = 0;

  update(db: Float32Array, sampleRate: number, fftSize: number, now = performance.now()): ChordDetection | null {
    const detected = detectChord(db, sampleRate, fftSize);
    if (!detected) {
      this.candidate = '';
      this.hits = 0;
      return null;
    }
    if (detected.label === this.candidate) this.hits++;
    else { this.candidate = detected.label; this.hits = 1; }
    if (this.hits < 3) return null;
    if (detected.label === this.lastEmitted && now - this.lastEmission < 700) return null;
    this.lastEmitted = detected.label;
    this.lastEmission = now;
    return detected;
  }

  reset(): void {
    this.candidate = '';
    this.hits = 0;
    this.lastEmitted = '';
    this.lastEmission = 0;
  }
}
