/**
 * Rhythm Foundations: a complete, small curriculum slice.
 *
 * Authored teaching content is separate from adaptive presentation. The app may
 * suggest an exercise, but may not invent prerequisites, certify playing from a
 * click, or trap a learner on one unfinished physical technique.
 */
export type Stroke = 'D' | 'U' | '.';
export type RhythmLevel = 'steady' | 'eighths' | 'pattern' | 'accents' | 'changes' | 'syncopation' | 'integration' | 'transfer';

export interface ChapterLesson {
  id: RhythmLevel;
  title: string;
  outcome: string;
  why: string;
  minutes: number;
  bpm: number;
  chords: readonly string[];
  /** 1 & 2 & 3 & 4 &: a dot is a deliberate silent movement. */
  pattern: readonly [Stroke, Stroke, Stroke, Stroke, Stroke, Stroke, Stroke, Stroke];
  /** Zero-based eighth-note positions given a stronger sound. */
  accents: readonly number[];
  hear: string;
  teach: readonly string[];
  practice: string;
  simplify: string;
  apply: string;
  check: { question: string; options: readonly [string, string, string]; correct: number; explanation: string };
}

export const RHYTHM_CHAPTER: readonly ChapterLesson[] = [
  {
    id: 'steady', title: 'Find the pulse', outcome: 'Keep four even beats while playing one familiar chord.',
    why: 'A chord is only part of the music. Your listener also needs a steady pulse to follow.',
    minutes: 8, bpm: 65, chords: ['G'],
    pattern: ['D','.','D','.','D','.','D','.'], accents: [],
    hear: 'The first four high clicks count you in. Then hear four complete bars, with a downstroke on each numbered beat. No guitar chord is required yet.',
    teach: ['Tap your foot or clap four even beats: 1, 2, 3, 4. This is the pulse.', 'Without forming a chord, lightly mute the strings with your fretting hand. Brush down once on every number.', 'If you already know G, try the same exercise with G. Keep counting through imperfect sounds.'],
    practice: 'Count in four beats, then play four bars (16 beats). Tap or brush muted strings; G is optional, not a prerequisite.',
    simplify: 'Leave the guitar down. Clap once per count, matching the four-bar reference before adding any fretting.',
    apply: 'Change the volume of the strum without changing the spacing between beats.',
    check: { question: 'What matters most in this exercise?', options: ['Hitting every string loudly', 'Keeping four beats evenly spaced', 'Changing chords as quickly as possible'], correct: 1, explanation: 'Timing comes before speed or volume. Four evenly spaced beats create a dependable pulse.' },
  },
  {
    id: 'eighths', title: 'Discover the & between beats', outcome: 'Keep the hand moving down and up through eight even subdivisions.',
    why: 'Upstrokes create rhythmic possibilities without requiring any new chord shapes.',
    minutes: 9, bpm: 64, chords: ['Em'],
    pattern: ['D','U','D','U','D','U','D','U'], accents: [],
    hear: 'Hear a downstroke on each number and an upstroke on every &.',
    teach: ['Hold Em. Count 1 & 2 & 3 & 4 &.', 'Down on each number; up on each &. The hand swings continuously.', 'Make upstrokes lighter; they can catch only the thinner strings.'],
    practice: 'Play eight consecutive down-up strokes on Em without pausing your hand.',
    simplify: 'Mute the strings and swing your strumming hand down-up while speaking the counts.',
    apply: 'Alternate one bar of only downstrokes with one bar of down-up, keeping the same beat.',
    check: { question: 'In 1 & 2 & 3 & 4 &, what does the & represent?', options: ['A beat between the numbered beats', 'A request to change chords', 'A rest where the hand stops'], correct: 0, explanation: 'Each & is halfway between numbered beats when you divide the beat into two equal parts.' },
  },
  {
    id: 'pattern', title: 'Make one rhythm out of six strokes', outcome: 'Play down, down-up, up-down-up without freezing on the silent movement.',
    why: 'Omitting a strum while keeping your arm moving creates a groove.',
    minutes: 12, bpm: 60, chords: ['G'],
    pattern: ['D','.','D','U','.','U','D','U'], accents: [],
    hear: 'Count 1 & 2 & 3 & 4 &. Play D on 1, D on 2, U on 2&, U on 3&, D on 4, U on 4&.',
    teach: ['First swing down-up on all eight subdivisions, counting out loud.', 'Now miss the strings on 1& and on beat 3. Keep the empty hand movements.', 'Say down, down-up, up-down-up while you play G. Work at a tempo where you can keep counting.'],
    practice: 'Repeat the pattern for four bars with G alone before adding any chord changes.',
    simplify: 'Practice only the hand movement on muted strings; leave out the chord entirely.',
    apply: 'Try the same pattern on Em. The rhythm should stay the same when the shape changes.',
    check: { question: 'What happens to your hand on beat 3 in this pattern?', options: ['It freezes until the next strum', 'It moves down without striking strings', 'It changes to a new chord'], correct: 1, explanation: 'The hand keeps its pendulum motion; the silent downstroke creates space before the next upstroke.' },
  },
  {
    id: 'accents', title: 'Change the groove without changing chords', outcome: 'Make selected beats stand out while the pulse stays steady.',
    why: 'Dynamics and accents can transform the feel of the same four chords.',
    minutes: 10, bpm: 68, chords: ['G'],
    pattern: ['D','.','D','.','D','.','D','.'], accents: [2,6],
    hear: 'Hear the slightly stronger second and fourth beats. The example uses the same four downstrokes as before.',
    teach: ['Play four equally spaced downstrokes on G.', 'Strum beats 2 and 4 a little louder, not faster.', 'Return to four equal-volume strums. Compare the two grooves.'],
    practice: 'Play two bars with even volume, then two bars emphasizing 2 and 4.',
    simplify: 'Clap the beats and make 2 and 4 a little stronger before touching the guitar.',
    apply: 'Use your favorite open chord and choose a different beat to emphasize.',
    check: { question: 'What changes when you accent beat 2?', options: ['Its timing moves earlier', 'The chord becomes minor', 'That strum becomes stronger, without moving the beat'], correct: 2, explanation: 'An accent changes emphasis, not the location of the beat or the chord notes.' },
  },
  {
    id: 'changes', title: 'Let the rhythm survive a chord change', outcome: 'Move from G to D at the bar line without stopping the pulse.',
    why: 'The hand can stay in time even when the fretting hand is still learning where to go.',
    minutes: 12, bpm: 58, chords: ['G','D'],
    pattern: ['D','.','D','.','D','.','D','.'], accents: [],
    hear: 'One bar of G, one bar of D. The four beats never pause for the change.',
    teach: ['Play four downstrokes on G, counting 1 to 4.', 'Change to D for the next bar. Your first D may be messy, but the pulse keeps going.', 'Repeat slowly. Notice which fingers move first, and keep the strumming hand moving.'],
    practice: 'Play G for four beats, then D for four beats, two times around.',
    simplify: 'Play only one strum on beat 1 of each bar and leave the remaining beats to prepare the next chord.',
    apply: 'Try the same exercise between Em and Cmaj7 at the same tempo.',
    check: { question: 'If your D chord lands late, what is the main goal of this drill?', options: ['Stop and fix D before continuing', 'Keep the pulse and recover on the next beat', 'Increase the tempo'], correct: 1, explanation: 'This lesson focuses on maintaining time, not making every chord change perfect.' },
  },
  {
    id: 'syncopation', title: 'Make the space between beats count', outcome: 'Emphasize an offbeat while preserving the numbered pulse.',
    why: 'Syncopation is a different feel, not merely faster strumming.',
    minutes: 11, bpm: 62, chords: ['Em'],
    pattern: ['D','.','D','U','.','U','D','U'], accents: [5],
    hear: 'Listen for the stronger upstroke on the & after beat 3. The numbers still arrive evenly.',
    teach: ['Count 1 & 2 & 3 & 4 & while tapping your foot on the numbers.', 'Play down, down-up, up-down-up on muted strings.', 'Emphasize the upstroke on 3& without rushing the next downstroke.'],
    practice: 'Play four bars on Em, keeping the offbeat accent but not speeding up.',
    simplify: 'Clap on the & after beat 3 while your foot continues tapping beats 1, 2, 3, 4.',
    apply: 'Try the accent on G instead of Em, then remove it and hear the contrast.',
    check: { question: 'What makes the accented 3& feel offbeat?', options: ['It falls halfway between numbered beats', 'It changes the key', 'It makes the bar longer'], correct: 0, explanation: 'The & is between numbered beats. Highlighting it changes where your ear feels the emphasis.' },
  },
  {
    id: 'integration', title: 'Put four chords under one rhythm', outcome: 'Apply the same rhythmic pattern to G, D, Em, and Cmaj7.',
    why: 'The new challenge is combining established skills, not learning four shapes at once.',
    minutes: 13, bpm: 56, chords: ['G','D','Em','Cmaj7'],
    pattern: ['D','.','D','U','.','U','D','U'], accents: [],
    hear: 'One bar each of G, D, Em, and Cmaj7. The pattern stays constant across changes.',
    teach: ['Play the pattern on G alone first.', 'Add D at the start of the next bar. If needed, simplify to one strum per bar.', 'Introduce Em and Cmaj7 one at a time; restore the full pattern only when timing survives.'],
    practice: 'Play G → D → Em → Cmaj7 with one bar per chord, beginning slowly.',
    simplify: 'Strum each chord once on beat 1 and count the remaining beats. Then add downstrokes on beats 2, 3, 4.',
    apply: 'Try swapping the first two chords. Does your right-hand rhythm stay consistent?',
    check: { question: 'If the full progression breaks down, what is the best first adjustment?', options: ['Add more chords', 'Simplify the strumming while keeping the chord order', 'Stop counting beats'], correct: 1, explanation: 'Reduce one demand at a time. Keep the musical goal, but lower the coordination load.' },
  },
  {
    id: 'transfer', title: 'Play it without the instructions', outcome: 'Use a familiar rhythm with a different chord order and fewer cues.',
    why: 'Learning becomes useful when you can apply it without following every instruction.',
    minutes: 12, bpm: 60, chords: ['Em','Cmaj7','G','D'],
    pattern: ['D','.','D','U','.','U','D','U'], accents: [],
    hear: 'This example is available after your own attempt. It is a reference, not a score.',
    teach: ['Start with Em → Cmaj7 → G → D, one bar each.', 'Choose the strumming pattern from memory. Count in, then hide the example and play it.', 'After trying, listen to the reference and decide what you want to improve.'],
    practice: 'Attempt the whole progression without watching a moving guide. Record yourself separately if helpful.',
    simplify: 'Use four downstrokes per bar first, then add the rhythm in one bar at a time.',
    apply: 'Choose two other familiar open chords and try the pattern with them.',
    check: { question: 'Which result best shows the skill is transferring?', options: ['Repeating one exact exercise with full cues', 'Explaining the chord names alone', 'Using the rhythm in a new progression without a moving guide'], correct: 2, explanation: 'Transfer means applying the same underlying skill in a different musical situation.' },
  },
];

export type Difficulty = 'shape' | 'transition' | 'rhythm' | 'whole';
export const BARRE_RECOVERY: Record<Difficulty, { title: string; first: string; steps: readonly string[]; target: string }> = {
  shape: {
    title: 'Get one chord ringing', first: 'Try G♯ major at fret 4 using a movable E-major shape.',
    steps: ['Place the index across fret 4 and the other fingers in the familiar E-major shape, shifted up.', 'Pick strings individually. Relax and reposition rather than squeezing continuously.', 'Take breaks if the hand becomes sore; numbness or sharp pain means stop.'],
    target: 'A comfortable, reasonably clear G♯ chord on its own, without a metronome.',
  },
  transition: {
    title: 'Move the same shape one fret', first: 'Practice G♯ major at fret 4 to A major at fret 5.',
    steps: ['Keep the sixth-string-root major barre shape intact as you shift up one fret.', 'Play G♯ once, release pressure slightly, move to fret 5 and play A once.', 'Reverse it. Keep the move slow and easy before adding rhythm.'],
    target: 'Move back and forth without rebuilding the shape finger by finger.',
  },
  rhythm: {
    title: 'Separate the strumming from the barre', first: 'Use muted strings to establish four even downstrokes.',
    steps: ['Lightly mute the strings with the fretting hand.', 'Strum four even beats while counting aloud.', 'Add one G♯ strum on beat 1, then return to muted rhythm before trying a change.'],
    target: 'Keep four steady beats even when the fretting hand moves.',
  },
  whole: {
    title: 'Connect two chords before all four', first: 'The destination is C♯m → G♯ → A → E.',
    steps: ['Practice C♯m (x46654) to G♯ (466544) as one pair, slowly.', 'Separately practice A barre (577655) to open E (022100).', 'Use one strum per bar first; only combine the pairs when they feel manageable.'],
    target: 'Play two comfortable pairs before attempting the full four-chord sequence.',
  },
};

export interface LessonEvidence {
  conceptCheckedAt?: number;
  practiceAttempts: number;
  lastPracticeAt?: number;
  /** The learner's claim, never a microphone-verified grade. */
  selfReportedIndependentAt?: number;
  needsWork: boolean;
}

export type ChapterProgress = Partial<Record<RhythmLevel, LessonEvidence>>;
const KNOWN_IDS = new Set(RHYTHM_CHAPTER.map((lesson) => lesson.id));
export const RHYTHM_STORAGE_KEY = 'guitar-academy.rhythm-chapter.v1';

function safeDate(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

export function parseChapterProgress(value: string | null): ChapterProgress {
  if (!value) return {};
  try {
    const input: unknown = JSON.parse(value);
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
    const output: ChapterProgress = {};
    for (const [id, raw] of Object.entries(input)) {
      if (!KNOWN_IDS.has(id as RhythmLevel) || !raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      const item = raw as Record<string, unknown>;
      output[id as RhythmLevel] = {
        conceptCheckedAt: safeDate(item.conceptCheckedAt),
        practiceAttempts: typeof item.practiceAttempts === 'number' && Number.isSafeInteger(item.practiceAttempts) && item.practiceAttempts >= 0 ? Math.min(item.practiceAttempts, 10000) : 0,
        lastPracticeAt: safeDate(item.lastPracticeAt),
        selfReportedIndependentAt: safeDate(item.selfReportedIndependentAt),
        needsWork: item.needsWork === true,
      };
      const evidence = output[id as RhythmLevel]!;
      if (!evidence.practiceAttempts || evidence.needsWork) evidence.selfReportedIndependentAt = undefined;
    }
    return output;
  } catch { return {}; }
}

export type EvidenceAction = 'concept-check' | 'practiced' | 'independent' | 'needs-work';
export function recordEvidence(progress: ChapterProgress, id: RhythmLevel, action: EvidenceAction, at: number): ChapterProgress {
  if (!KNOWN_IDS.has(id)) return progress;
  const current = progress[id] ?? { practiceAttempts: 0, needsWork: false };
  const next: LessonEvidence = { ...current };
  if (action === 'concept-check') next.conceptCheckedAt = at;
  if (action === 'practiced') {
    next.practiceAttempts += 1;
    next.lastPracticeAt = at;
  }
  if (action === 'independent') {
    // A performance self-report requires an attempt; it is NEVER marked verified.
    if (!next.practiceAttempts) return progress;
    next.selfReportedIndependentAt = at;
    next.needsWork = false;
  }
  if (action === 'needs-work') {
    next.needsWork = true;
    next.selfReportedIndependentAt = undefined;
  }
  return { ...progress, [id]: next };
}

/**
 * Entry point is a learner choice, not a claim of mastery. In particular,
 * selecting an experienced start never awards passing scores for earlier
 * lessons. All lesson choices remain accessible for review.
 */
export type RhythmEntry = 'new' | 'chords' | 'switches' | 'songs';
export const RHYTHM_ENTRY_KEY = 'guitar-academy.rhythm-entry.v1';
export const RHYTHM_ENTRY: Readonly<Record<RhythmEntry,{title:string; detail:string; start: RhythmLevel}>> = {
  new: { title: 'I am new to guitar', detail: 'Build a pulse with claps and muted strings. You do not need to know any chords.', start: 'steady' },
  chords: { title: 'I know a few open chords', detail: 'Learn a useful down-up strumming pattern without adding new chord shapes.', start: 'pattern' },
  switches: { title: 'I can strum, but chord changes interrupt my rhythm', detail: 'Work on keeping the beat through changes, without chasing speed.', start: 'changes' },
  songs: { title: 'I already play songs with strumming patterns', detail: 'Work on offbeat feel and combining rhythm with complete progressions.', start: 'syncopation' },
};

export function parseRhythmEntry(value: string | null): RhythmEntry | null {
  return value === 'new' || value === 'chords' || value === 'switches' || value === 'songs' ? value : null;
}

export function recommendRhythmFromEntry(progress: ChapterProgress, entry: RhythmEntry): ChapterLesson {
  const index = RHYTHM_CHAPTER.findIndex(lesson => lesson.id === RHYTHM_ENTRY[entry].start);
  const afterStart = RHYTHM_CHAPTER.slice(index);
  return afterStart.find(lesson => {
    const state = progress[lesson.id];
    return (!state?.conceptCheckedAt || !state.practiceAttempts) && !state?.needsWork;
  }) ?? afterStart.find(lesson => !progress[lesson.id]?.selfReportedIndependentAt)
    ?? afterStart[afterStart.length - 1]!;
}

export function recommendRhythmLesson(progress: ChapterProgress): ChapterLesson {
  // A declared difficulty never gates the next lesson. A lesson is ready for
  // review without being marked as completed, and another concept stays open.
  return RHYTHM_CHAPTER.find(lesson => {
    const p = progress[lesson.id];
    return !p?.conceptCheckedAt && !p?.needsWork || (!!p?.conceptCheckedAt && !p.practiceAttempts && !p.needsWork);
  }) ?? RHYTHM_CHAPTER.find(lesson => !progress[lesson.id]?.selfReportedIndependentAt) ?? RHYTHM_CHAPTER[RHYTHM_CHAPTER.length - 1]!;
}

export function chapterCounts(progress: ChapterProgress) {
  return {
    understood: RHYTHM_CHAPTER.filter(l => !!progress[l.id]?.conceptCheckedAt).length,
    practiced: RHYTHM_CHAPTER.filter(l => (progress[l.id]?.practiceAttempts ?? 0) > 0).length,
    independentClaims: RHYTHM_CHAPTER.filter(l => !!progress[l.id]?.selfReportedIndependentAt).length,
    needsWork: RHYTHM_CHAPTER.filter(l => !!progress[l.id]?.needsWork).length,
  };
}

/**
 * Musical reference: four audible count-in clicks, followed by four complete
 * bars. A one-bar demo followed by a four-bar assignment was confusing and
 * did not give a learner time to hear what the task really was.
 *
 * Clicks use short high pitched synthetic plucks, not speech. This is a
 * reference track only, never a live grading or evaluation system.
 */
export function rhythmEvents(
  lesson: ChapterLesson,
  getNotes: (chord: string) => readonly number[],
  simpler = false,
): Array<{ midi: number; startMs: number; durationMs: number; confidence: number; velocity: number }> {
  const beatMs = 60000 / lesson.bpm;
  const eighthMs = beatMs / 2;
  const events: Array<{ midi: number; startMs: number; durationMs: number; confidence: number; velocity: number }> = [];
  for (let beat = 0; beat < 4; beat++) {
    events.push({ midi: beat === 0 ? 91 : 88, startMs: beat * beatMs,
      durationMs: 90, confidence: 1, velocity: beat === 0 ? 0.5 : 0.3 });
  }
  const afterCountIn = 4 * beatMs;
  // Short examples repeat for four bars; full four-chord examples still play
  // every chord once. No lesson demonstration stops after only four strokes.
  for (let bar = 0; bar < Math.max(4, lesson.chords.length); bar++) {
    const chord = lesson.chords[bar % lesson.chords.length]!;
    const midis = getNotes(chord);
    if (!midis.length) continue;
    const pattern = simpler ? (['D','.','.','.','.','.','.','.'] as const) : lesson.pattern;
    pattern.forEach((stroke, subdivision) => {
      if (stroke === '.') return;
      const notes = stroke === 'U' ? [...midis].reverse() : midis;
      const accent = !simpler && lesson.accents.includes(subdivision);
      notes.forEach((midi, index) => {
        events.push({
          midi, startMs: afterCountIn + bar * 8 * eighthMs + subdivision * eighthMs + index * 12,
          durationMs: Math.min(650, eighthMs * 1.6), confidence: 1,
          velocity: accent ? 0.72 : stroke === 'U' ? 0.4 : 0.52,
        });
      });
    });
  }
  return events;
}
