/** Note-name, MIDI and frequency conversions, plus interval vocabulary. */

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/** A4 = 440 Hz = MIDI 69. */
export const A4_MIDI = 69;
export const A4_HZ = 440;

export function pitchClass(midi: number): number {
  return ((Math.round(midi) % 12) + 12) % 12;
}

export function octaveOf(midi: number): number {
  return Math.floor(Math.round(midi) / 12) - 1;
}

/** MIDI 40 -> "E2". Set `flats` for keys that read better flat. */
export function midiToName(midi: number, flats = false): string {
  const names = flats ? FLAT_NAMES : SHARP_NAMES;
  return `${names[pitchClass(midi)]}${octaveOf(midi)}`;
}

/** Pitch class 4 -> "E". */
export function pcToName(pc: number, flats = false): string {
  const names = flats ? FLAT_NAMES : SHARP_NAMES;
  return names[((pc % 12) + 12) % 12]!;
}

/** "E2", "Eb3", "F#4" -> MIDI number. Throws on malformed input. */
export function nameToMidi(name: string): number {
  const m = /^([A-Ga-g])([#b]?)(-?\d+)$/.exec(name.trim());
  if (!m) throw new Error(`Not a note name: "${name}"`);
  const letter = m[1]!.toUpperCase();
  const base = SHARP_NAMES.indexOf(letter);
  const accidental = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  const octave = Number(m[3]);
  return (octave + 1) * 12 + base + accidental;
}

export function midiToFrequency(midi: number): number {
  return A4_HZ * Math.pow(2, (midi - A4_MIDI) / 12);
}

/** Returns a fractional MIDI number, so callers can see how sharp/flat it was. */
export function frequencyToMidi(hz: number): number {
  return A4_MIDI + 12 * Math.log2(hz / A4_HZ);
}

/** How many cents sharp (+) or flat (-) a frequency sits from the nearest note. */
export function centsOffset(hz: number): number {
  const midi = frequencyToMidi(hz);
  return Math.round((midi - Math.round(midi)) * 100);
}

const INTERVAL_NAMES = [
  'unison', 'minor second', 'major second', 'minor third', 'major third',
  'perfect fourth', 'tritone', 'perfect fifth', 'minor sixth', 'major sixth',
  'minor seventh', 'major seventh',
];

/** Theory name for a semitone distance, e.g. 3 -> "minor third". */
export function intervalName(semitones: number): string {
  const n = Math.abs(Math.round(semitones));
  const simple = INTERVAL_NAMES[n % 12]!;
  const octaves = Math.floor(n / 12);
  if (octaves === 0) return simple;
  if (n % 12 === 0) return octaves === 1 ? 'octave' : `${octaves} octaves`;
  return `${simple} plus ${octaves === 1 ? 'an octave' : `${octaves} octaves`}`;
}

/** Plain-language movement, for beginner-facing copy. */
export function stepDescription(semitones: number): string {
  if (semitones === 0) return 'stayed on the same note';
  const dir = semitones > 0 ? 'up' : 'down';
  return `${dir} ${intervalName(semitones)}`;
}

/** Semitone steps between consecutive notes. */
export function intervalsOf(midis: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < midis.length; i++) out.push(midis[i]! - midis[i - 1]!);
  return out;
}

/** Direction-only shape of a line: 1 up, -1 down, 0 repeated. */
export function contourOf(midis: number[]): number[] {
  return intervalsOf(midis).map((x) => Math.sign(x));
}
