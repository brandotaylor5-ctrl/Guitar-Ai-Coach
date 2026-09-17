/**
 * What you can already play, right now, with the chords you have.
 *
 * The usual answer to "I know four chords" is a list of more chords to learn.
 * It is the wrong answer. Four chords is already thousands of songs, and the
 * gap for most players is not vocabulary — it is that nobody ever told them
 * what the vocabulary they have is *for*.
 *
 * Progressions are written in roman numerals so one entry covers every key.
 * A player who knows G, C and D gets the same I–IV–V a player who knows E, A
 * and B gets, in their own key, without either of them learning a new shape.
 */

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Scale degree in semitones above the key's root, and the chord's quality. */
interface Degree {
  semitones: number;
  minor: boolean;
}

const DEGREES: Record<string, Degree> = {
  I: { semitones: 0, minor: false },
  ii: { semitones: 2, minor: true },
  iii: { semitones: 4, minor: true },
  IV: { semitones: 5, minor: false },
  V: { semitones: 7, minor: false },
  vi: { semitones: 9, minor: true },
  bVII: { semitones: 10, minor: false },
  bVI: { semitones: 8, minor: false },
  bIII: { semitones: 3, minor: false },
  iv: { semitones: 5, minor: true },
  v: { semitones: 7, minor: true },
};

export interface ProgressionTemplate {
  id: string;
  name: string;
  /** Roman numerals, one per bar. */
  numerals: string[];
  /** What it sounds like, in plain words. */
  character: string;
  /** Why it is worth knowing — usually "you have heard this a thousand times". */
  note: string;
  /** Roughly how hard it is to keep going, 1–3. */
  difficulty: 1 | 2 | 3;
}

export const PROGRESSIONS: ProgressionTemplate[] = [
  {
    id: 'I-V-vi-IV', name: 'The four chords', numerals: ['I', 'V', 'vi', 'IV'], difficulty: 1,
    character: 'Bright and open, and it never sounds like it has finished — which is why it loops so well.',
    note: 'The single most used progression in popular music. Once you can loop this you can play along with an enormous amount of what you already listen to.',
  },
  {
    id: 'vi-IV-I-V', name: 'The sad version of the four chords', numerals: ['vi', 'IV', 'I', 'V'], difficulty: 1,
    character: 'The same four chords started somewhere else, and suddenly it is melancholy rather than triumphant.',
    note: 'Worth playing straight after the one above. Nothing changed except where you began, and that is most of what "key" and "mood" really mean.',
  },
  {
    id: 'I-IV-V', name: 'Three chords', numerals: ['I', 'IV', 'V', 'V'], difficulty: 1,
    character: 'Decisive. It resolves hard, which is why it carries rock and roll and country.',
    note: 'The oldest trick there is. If you only ever learn one thing about how chords fit together, make it these three.',
  },
  {
    id: 'I-vi-IV-V', name: 'The fifties turnaround', numerals: ['I', 'vi', 'IV', 'V'], difficulty: 1,
    character: 'Warm and nostalgic. It sounds like a slow dance in an old film.',
    note: 'Doo-wop, early rock, half the ballads ever written. Instantly recognisable the moment you play it.',
  },
  {
    id: 'vi-V-IV-V', name: 'The brooding loop', numerals: ['vi', 'V', 'IV', 'V'], difficulty: 2,
    character: 'Circles without settling. Good under a vocal because it never demands attention.',
    note: 'A favourite for verses, because it can go round forever without getting boring.',
  },
  {
    id: 'I-bVII-IV', name: 'The rock cadence', numerals: ['I', 'bVII', 'IV', 'I'], difficulty: 2,
    character: 'Swaggering. The flat seventh is the bit that stops it sounding polite.',
    note: 'The sound of classic rock. That one chord from outside the key is doing all the work.',
  },
  {
    id: 'ii-V-I', name: 'The jazz turnaround', numerals: ['ii', 'V', 'I', 'I'], difficulty: 2,
    character: 'Smooth. Each chord leans into the next rather than jumping.',
    note: 'The backbone of jazz, and it shows up constantly in songwriting too. This is where chords start feeling like they pull towards each other.',
  },
  {
    id: 'i-bVI-bIII-bVII', name: 'The epic minor', numerals: ['vi', 'IV', 'I', 'V'], difficulty: 2,
    character: 'Big and cinematic, the kind of thing that sounds like the end of a film.',
    note: 'Same shapes as the four chords, ordered to lean minor. A lot of drama for very little new work.',
  },
  {
    id: 'I-IV-I-V', name: 'The folk loop', numerals: ['I', 'IV', 'I', 'V'], difficulty: 1,
    character: 'Plain and steady. It leaves a lot of room for singing.',
    note: 'Traditional songs live here. It is the easiest of all of these to keep going while you do something else, like sing.',
  },
];

export interface PlayableProgression {
  template: ProgressionTemplate;
  /** The key it is in, as a chord name. */
  key: string;
  /** The actual chords, in order, one per bar. */
  chords: string[];
  /** True when the player already knows every chord in it. */
  playableNow: boolean;
  /** Chords they would need to learn first. Empty when playable now. */
  missing: string[];
}

function chordFor(keyPc: number, numeral: string): string | null {
  const degree = DEGREES[numeral];
  if (!degree) return null;
  const pc = (keyPc + degree.semitones) % 12;
  return `${NAMES[pc]}${degree.minor ? 'm' : ''}`;
}

/** Every key a progression could be played in, given what the player knows. */
export function progressionsIn(keyChord: string): PlayableProgression[] {
  const keyPc = NAMES.indexOf(keyChord.replace(/m$/, ''));
  if (keyPc < 0) return [];
  return PROGRESSIONS.map((template) => {
    const chords = template.numerals.map((n) => chordFor(keyPc, n)).filter((c): c is string => c !== null);
    return { template, key: keyChord, chords, playableNow: false, missing: [] };
  });
}

/**
 * What this player can play today, and what is one chord away.
 *
 * Sorted so the things needing nothing new come first — the whole point is to
 * show somebody that they are further along than they think.
 */
export function repertoireFor(known: string[], options: { includeNearMisses?: boolean } = {}): PlayableProgression[] {
  const knownSet = new Set(known);
  const out: PlayableProgression[] = [];

  // Only bother with keys the player could actually be in — one of their own
  // chords has to be able to act as home.
  const candidateKeys = [...new Set(known.map((c) => c.replace(/m$/, '')))];

  for (const key of candidateKeys) {
    const keyPc = NAMES.indexOf(key);
    if (keyPc < 0) continue;
    for (const template of PROGRESSIONS) {
      const chords = template.numerals.map((n) => chordFor(keyPc, n)).filter((c): c is string => c !== null);
      if (chords.length !== template.numerals.length) continue;
      const missing = [...new Set(chords.filter((c) => !knownSet.has(c)))];
      if (missing.length === 0) {
        out.push({ template, key, chords, playableNow: true, missing: [] });
      } else if (options.includeNearMisses && missing.length === 1) {
        out.push({ template, key, chords, playableNow: false, missing });
      }
    }
  }

  return out.sort((a, b) => {
    if (a.playableNow !== b.playableNow) return a.playableNow ? -1 : 1;
    return a.template.difficulty - b.template.difficulty;
  });
}

/**
 * The single chord that would unlock the most new music.
 *
 * A far better answer to "what should I learn next" than the next item in a
 * list, because it is measured in songs rather than in progress.
 */
export function mostValuableNextChord(known: string[]): { chord: string; unlocks: number } | null {
  const already = repertoireFor(known).length;
  const candidates = new Set<string>();
  for (const entry of repertoireFor(known, { includeNearMisses: true })) {
    for (const chord of entry.missing) candidates.add(chord);
  }
  if (candidates.size === 0) return null;

  const scored = [...candidates]
    .map((chord) => ({ chord, unlocks: repertoireFor([...known, chord]).length - already }))
    .filter((entry) => entry.unlocks > 0);
  if (scored.length === 0) return null;

  const most = Math.max(...scored.map((entry) => entry.unlocks));
  // A chord that unlocks one more progression but takes a fortnight to hold
  // down is not the better answer. Within one of the best, prefer the one
  // that is nearer to what their hand can already do.
  const contenders = scored.filter((entry) => entry.unlocks >= most - 1);
  contenders.sort((a, b) => difficultyOf(a.chord) - difficultyOf(b.chord) || b.unlocks - a.unlocks);
  return contenders[0] ?? null;
}

/** Roughly how hard a shape is to hold, lowest first. */
function difficultyOf(chord: string): number {
  const order = ['Em', 'E', 'Am', 'A', 'D', 'Dm', 'C', 'G', 'F', 'Bm'];
  const index = order.indexOf(chord);
  return index < 0 ? order.length : index;
}

/** Plain-language summary of where somebody stands, in songs rather than scores. */
export function describeRepertoire(known: string[]): string {
  if (known.length === 0) return 'Once I know a couple of your chords I can show you what they are already enough for.';
  const playable = repertoireFor(known);
  if (playable.length === 0) {
    return `${known.length} chord${known.length === 1 ? '' : 's'} so far. One or two more and whole progressions open up at once.`;
  }
  const next = mostValuableNextChord(known);
  const base = `With ${known.join(', ')} you can already play ${playable.length} standard progression${playable.length === 1 ? '' : 's'} — real ones, in real keys.`;
  return next ? `${base} Learning ${next.chord} would add ${next.unlocks} more.` : base;
}
