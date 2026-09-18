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
  let best = -120;
  for (let i = Math.max(1, bin - 1); i <= Math.min(db.length - 1, bin + 1); i++) best = Math.max(best, db[i]!);
  if (best < -82) return 0;
  return Math.pow(10, best / 20);
}

function midiFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export interface ChordEvidence {
  /** Per-pitch-class fundamental strength, 0..1. */
  chroma: number[];
  /**
   * Pitch class of the lowest note that is really sounding, or -1.
   *
   * Folding straight to chroma throws this away, and it is the single most
   * useful thing in the signal: guitarists play chords in root position almost
   * all the time, so the bass note names the chord. Without it, a template
   * built on two loudly doubled notes can outscore the right chord whose third
   * is fretted on one string — which is how an open E comes back as Bsus4.
   */
  bassPc: number;
  /** MIDI note of that bass, or -1. */
  bassMidi: number;
  /** Strength at each MIDI pitch, 0..1, so callers can ask about one note. */
  perMidi: number[];
}

/** Estimate how strongly each pitch class exists as a *fundamental*.
 * Harmonics help its own fundamental score but do not directly vote as notes.
 */
export function guitarEvidence(db: Float32Array, sampleRate: number, fftSize: number): ChordEvidence {
  const chroma = Array(12).fill(0) as number[];
  const perMidi = Array(89).fill(0) as number[];
  for (let midi = 40; midi <= 88; midi++) {
    const f = midiFrequency(midi);
    const fundamental = binEnergy(db, f, sampleRate, fftSize);
    if (fundamental === 0) continue;
    const score = fundamental
      + binEnergy(db, f * 2, sampleRate, fftSize) * 0.34
      + binEnergy(db, f * 3, sampleRate, fftSize) * 0.18
      + binEnergy(db, f * 4, sampleRate, fftSize) * 0.10;
    perMidi[midi] = score;
    const pc = ((midi % 12) + 12) % 12;
    chroma[pc] = Math.max(chroma[pc]!, score);
  }

  const max = Math.max(...chroma, 1e-9);

  // The lowest note carrying real energy. Scanning upward from the bottom of
  // the guitar's range finds the bass string rather than the loudest partial.
  //
  // It has to be the top of a hump, not the near side of one: bin smoothing
  // lifts the semitone below every strong note over any threshold, and a bass
  // read one semitone flat shifts every partial offset with it, so nothing
  // downstream can tell a harmonic from a fretted note any more.
  let bassMidi = -1;
  for (let midi = 40; midi <= 88; midi++) {
    const energy = perMidi[midi]! / max;
    if (energy < 0.45) continue;
    if (perMidi[midi]! < (perMidi[midi - 1] ?? 0) || perMidi[midi]! < (perMidi[midi + 1] ?? 0)) continue;
    bassMidi = midi;
    break;
  }

  return {
    chroma: chroma.map((x) => x / max),
    bassPc: bassMidi < 0 ? -1 : ((bassMidi % 12) + 12) % 12,
    bassMidi,
    perMidi: perMidi.map((x) => x / max),
  };
}

/** Chroma alone, for callers that do not care where the bass is. */
export function guitarChroma(db: Float32Array, sampleRate: number, fftSize: number): number[] {
  return guitarEvidence(db, sampleRate, fftSize).chroma;
}

/** Below this a template note is not really sounding, whatever the noise floor says. */
const PRESENT = 0.3;

/** What a template is charged for each fretted pitch class it cannot name. */
const UNEXPLAINED = 0.18;

/** A note this strong is a played string on its own evidence. */
const LOUD = 0.3;
/** Below this there is nothing to corroborate. */
const QUIET = 0.18;

export function detectChord(db: Float32Array, sampleRate: number, fftSize: number): ChordDetection | null {
  const { chroma, bassPc, bassMidi, perMidi } = guitarEvidence(db, sampleRate, fftSize);
  const audible = chroma.map((v, pc) => ({ v, pc })).filter((x) => x.v >= 0.28).sort((a, b) => b.v - a.v);
  if (audible.length < 2) return null;

  /**
   * Which pitch classes were actually fretted, rather than rung as partials of
   * the bass note?
   *
   * A plucked low E puts energy an octave up, a twelfth up, two octaves up and
   * onwards. The twelfth is a perfect fifth and the fifteenth a major second,
   * so one open E string supplies, for free, most of what E5 and Esus2 ask
   * for — and gets reported as one, confidently. Strength cannot settle it: a
   * guitar's third partial is routinely louder than its fundamental. Position
   * can. A fretted note sounds where no partial of the bass lands.
   */
  const PARTIAL_OFFSETS = [12, 19.02, 24, 27.86, 31.02, 34, 36];
  const fretted = new Set<number>();
  if (bassMidi >= 0) {
    // Every string rings its own partials, not just the bass one. An open E
    // string puts a B a twelfth above it, which is why an A chord offers a
    // free B and comes back as Asus2; an open A string puts an E up there,
    // which is why a D chord offers a free E. Working upward and letting each
    // note already accepted account for what lies above it removes those
    // without needing to know which string anything came from. Doubled notes
    // survive, because the lower copy is accepted before the higher one is
    // explained away.
    const sounding: number[] = [];
    for (let midi = 40; midi <= 88; midi++) {
      const energy = perMidi[midi] ?? 0;
      if (energy < QUIET) continue;
      // A real note is a peak. Every strong partial drags its neighbours up
      // with it — window spread either side of the bin — so the semitone above
      // a loud string clears any threshold you pick while being nothing but
      // the skirt of it. Only the top of a hump is a note.
      if (energy < (perMidi[midi - 1] ?? 0) || energy < (perMidi[midi + 1] ?? 0)) continue;

      // A chord's third is one fretted string; its root and fifth are open and
      // doubled across two or three. So the third is always the quietest note
      // in the chord, and a threshold set high enough to keep noise out also
      // throws the third away — which is how a D became D5 for anyone whose
      // F# was not as loud as two open strings.
      //
      // What separates a quiet string from noise is not level but structure: a
      // real string rings its own octave above itself. So a note below the
      // confident threshold still counts, if that octave is there too.
      if (energy < LOUD) {
        // Only that the octave is there, not that it is a peak in its own
        // right: a loud string a semitone away flattens it, and the note
        // below has already had to be a peak to get this far.
        if ((perMidi[midi + 12] ?? 0) < QUIET) continue;
        // A note a fifth above a louder one is the one ghost this cannot tell
        // from a string: its second and fourth partials land exactly on that
        // note's third and sixth, so it borrows a whole harmonic series it
        // never had. A real fifth played on a real string is loud enough not
        // to need this tier.
        const borrowed = sounding.some((lower) => midi - lower === 7 && (perMidi[lower] ?? 0) > energy);
        if (borrowed) continue;
      }

      // Only a string that is confidently sounding may explain away what lies
      // above it, and only something no louder than itself. A quiet ghost that
      // gets to cast a shadow swallows the real strings above it: an A chord
      // whose every note sat at an octave or a twelfth above one faint reading
      // came back with nothing fretted at all.
      const isPartial = sounding.some((lower) => (perMidi[lower] ?? 0) >= LOUD
        && (perMidi[lower] ?? 0) >= energy
        && PARTIAL_OFFSETS.some((offset) => Math.abs(midi - lower - offset) <= 0.5));
      sounding.push(midi);
      if (!isPartial) fretted.add(((midi % 12) + 12) % 12);
    }
  }

  // One note, however rich, is not a chord. Two distinct fretted pitch classes
  // is the least that can be.
  if (fretted.size < 2) return null;

  // Noise spreads itself evenly; a chord concentrates. Counting how many pitch
  // classes are lit does not separate them — a six-string chord rings eight or
  // more through sheer harmonic bleed — but how much of the total sits in the
  // strongest few does: chords hold better than half there, noise barely a
  // third.
  const ranked = [...chroma].sort((a, b) => b - a);
  const total = chroma.reduce((a, b) => a + b, 0);
  const concentration = total > 0 ? ranked.slice(0, 4).reduce((a, b) => a + b, 0) / total : 0;
  if (concentration < 0.45) return null;

  let best: { score: number; rootPc: number; template: typeof TEMPLATES[number] } | null = null;
  let second = -Infinity;
  for (let rootPc = 0; rootPc < 12; rootPc++) {
    for (const template of TEMPLATES) {
      const wanted = template.pcs.map((d) => (rootPc + d) % 12);
      const inside = wanted.reduce((sum, p) => sum + chroma[p]!, 0) / wanted.length;
      const outsideValues = chroma.filter((_, p) => !wanted.includes(p));
      const outside = outsideValues.reduce((a, b) => a + b, 0) / outsideValues.length;
      const rootBonus = chroma[rootPc]! * 0.18;
      // A string the evidence already decided was fretted counts as present
      // even if it is quiet. Otherwise the detector charges a chord for a note
      // it has just finished establishing was played, which is most of what
      // kept a quiet third from ever winning.
      const isPresent = (p: number) => chroma[p]! >= PRESENT || fretted.has(p);
      const present = wanted.filter(isPresent).length;
      const coverage = present / wanted.length;

      // The bass note names the chord. This is what stops a template made of
      // two loudly doubled notes from beating the chord actually being played.
      const bassBonus = bassPc < 0 ? 0 : rootPc === bassPc ? 0.22 : -0.05;

      // Averaging over template notes quietly rewards templates that ask for
      // less. Charging for each note a template claims but cannot show makes
      // the comparison honest between a triad and a two-note shape.
      const missingPenalty = (wanted.length - present) * 0.14;

      // Charge properly for template notes that only exist as partials of
      // something else. This, rather than the bass, is what should rule a
      // chord out: Bsus4 needs an F# nobody played.
      const unfretted = wanted.filter((p) => !fretted.has(p)).length;
      const phantomPenalty = unfretted * 0.3;

      // A two-note power chord naturally gets a higher arithmetic average than
      // a full triad. If the third is genuinely audible, prefer the chord that
      // explains it instead of throwing that information away and calling Em
      // "E5". Conversely, a real power chord still wins when no third exists.
      const fullChordBonus = template.pcs.length >= 3 ? 0.08 : 0;

      let powerChordPenalty = 0;
      if (template.quality === '5') {
        const thirdEvidence = Math.max(chroma[(rootPc + 3) % 12]!, chroma[(rootPc + 4) % 12]!);
        powerChordPenalty = Math.max(0, thirdEvidence - 0.20) * 0.22;
        // The fifth has to have been played, not merely rung as the root's
        // twelfth — otherwise every single note becomes a power chord.
        if (!fretted.has((rootPc + 7) % 12)) powerChordPenalty += 0.6;
      }

      // A template that asks for fewer notes only has to explain fewer notes,
      // and averaging over what it asks for lets it ignore the rest for free.
      // That is the whole reason D5 beat D: it kept the two loud open strings
      // and simply did not account for the F#. So charge a template for every
      // string the player actually fretted that it cannot name.
      const unexplained = [...fretted].filter((p) => !wanted.includes(p)).length;
      const unexplainedPenalty = unexplained * UNEXPLAINED;

      // Reward templates whose defining color note is actually present. This
      // helps major/minor quality survive the harmonic clutter of guitar audio.
      let qualityEvidence = 0;
      if (template.quality === 'minor' || template.quality === 'm7') {
        qualityEvidence = Math.max(0, chroma[(rootPc + 3) % 12]! - 0.20) * 0.10;
      } else if (template.quality === 'major' || template.quality === '7' || template.quality === 'maj7') {
        qualityEvidence = Math.max(0, chroma[(rootPc + 4) % 12]! - 0.20) * 0.10;
      }

      const score = inside - outside * 0.34 + rootBonus + fullChordBonus + coverage * 0.04
        + qualityEvidence - powerChordPenalty + bassBonus - missingPenalty - phantomPenalty
        - unexplainedPenalty;
      if (!best || score > best.score) {
        if (best) second = best.score;
        best = { score, rootPc, template };
      } else if (score > second) second = score;
    }
  }
  if (!best) return null;

  const wanted = best.template.pcs.map((d) => (best.rootPc + d) % 12);
  const present = wanted.filter((p) => chroma[p]! >= PRESENT || fretted.has(p)).length;
  const required = best.template.quality === '5' ? 2 : Math.min(3, wanted.length);
  if (present < required || best.score < 0.44) return null;

  // Chroma alone is too generous for the final word: a low E on its own lights
  // its own twelfth brightly enough to stand in for a fifth, so two notes can
  // clear a four-note template on borrowed harmonics. Strings, not chroma,
  // have to account for the shape being claimed.
  const played = wanted.filter((p) => fretted.has(p)).length;
  if (played < required) return null;

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
