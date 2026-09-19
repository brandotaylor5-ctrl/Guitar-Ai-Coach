/**
 * The course. An actual one, that starts from never having held a guitar.
 *
 * Everything else in this app infers: it watches what you play, models what
 * you can do, and picks a next thing. That machinery is good and it is useless
 * on day one, because it has heard nothing and therefore says nothing. A
 * person who cannot play guitar opened this app and every screen asked them to
 * play something first. There was no content — only an empty frame waiting to
 * be told what they already knew.
 *
 * So this is written down instead of inferred. Fixed order, all of it visible
 * from the first second including the parts months away, because seeing that
 * minor pentatonic is step fourteen is the thing that makes step one worth
 * doing. Nothing here asks a question before it has taught something.
 *
 * The voice is deliberate: say the thing, say why, say how you know you have
 * it. No encouragement that has not been earned, no theory before the sound it
 * explains, and never a word a beginner would have to look up.
 */

export type StepKind = 'know' | 'chord' | 'technique' | 'scale' | 'song' | 'create';

export interface PathStep {
  id: string;
  /** What this is, as a person would say it. */
  title: string;
  kind: StepKind;
  /** The one sentence that says what you will be able to do afterwards. */
  outcome: string;
  /** Why it is worth your time, honestly. */
  why: string;
  /** Do this, in order. Each line is one physical instruction. */
  steps: string[];
  /** How you know you have it, rather than a feeling. */
  check: string;
  /** The most common way this goes wrong, and what to do instead. */
  watchFor?: string;
  /** Roughly how long before this feels normal. Sets honest expectations. */
  expect: string;
  /** Where in the app to actually do it. */
  practice?: { view: 'lessons' | 'session' | 'songs' | 'song'; params?: Record<string, string>; label: string };
  /**
   * The chord this step teaches, so the screen can draw it and play it.
   *
   * Writing "Your first chord: E minor" and then not showing E minor is the
   * whole reason this course read as a wall of text. A step about a shape has
   * to show the shape.
   */
  chord?: string;
  /** The scale this step teaches, same reason. */
  scale?: { tonicPc: number; scaleId: string };
  /** Several chords, for the steps that teach more than one. */
  chords?: string[];
}

export const PATH: PathStep[] = [
  {
    id: 'hold',
    title: 'Hold the guitar so it can be played',
    kind: 'know',
    outcome: 'Sit with the guitar in a position your hands can work from.',
    why: 'Almost every beginner problem that looks like a finger problem is a position problem. Fixing it now saves months of blaming your hands.',
    steps: [
      'Sit forward on the edge of a chair with both feet flat.',
      'Rest the waist of the guitar — the narrow part — on your right leg if you are right-handed.',
      'Let the neck point up and out at about the angle of a clock hand at ten. Not flat, not vertical.',
      'Pull the body gently back against your chest so it stops sliding forward.',
      'Let your left arm hang, then bring the hand up to the neck. Your wrist should be roughly straight.',
    ],
    check: 'Take both hands off. The guitar should stay exactly where it is.',
    watchFor: 'If you are leaning over to look at your fretting hand, the guitar is too flat on your leg. Tilt the face towards you instead of bending your neck.',
    expect: 'Right away, but you will drift out of it. Check yourself every few minutes for the first week.',
  },
  {
    id: 'strings',
    title: 'Learn the six strings',
    kind: 'know',
    outcome: 'Name any string without counting.',
    why: 'Every instruction anyone gives you names a string. Not knowing them turns a five-second explanation into a minute of hunting.',
    steps: [
      'Thickest string, nearest your face: that is the 6th string, and it is an E.',
      'Then, getting thinner: A, D, G, B, and E again.',
      'The thinnest string is also E, two octaves above the thick one.',
      'Say them out loud, low to high: E A D G B E. Then high to low: E B G D A E.',
      'Pluck each one as you say it so the name attaches to a sound, not just a word.',
    ],
    check: 'Someone says "fourth string" and your finger goes to D without counting up from the bottom.',
    watchFor: 'String numbers run opposite to what feels natural: the 1st string is the thinnest, not the thickest.',
    expect: 'A couple of days of saying them out loud.',
  },
  {
    id: 'fret',
    title: 'Press a note so it actually rings',
    kind: 'technique',
    outcome: 'Play one clean fretted note with no buzz.',
    why: 'This is the single physical skill underneath every chord you will ever play. A chord that buzzes is almost always this, six times over.',
    steps: [
      'Put your first finger on the 3rd fret of the thickest string.',
      'Press just behind the metal fret wire, not on top of it and not in the middle of the gap.',
      'Use the very tip of your finger, nail almost perpendicular to the fretboard.',
      'Keep your thumb behind the neck, roughly opposite your middle finger.',
      'Pick the string. Adjust until it rings clearly rather than buzzing or thudding.',
    ],
    check: 'The note rings on for two full seconds without buzzing, three times in a row.',
    watchFor: 'If it buzzes, you are usually too far back from the fret, or pressing with the flat pad of your finger instead of the tip.',
    expect: 'One session to get it once. A week before it is reliable.',
    practice: { view: 'session', label: 'Let the app listen and tell you if it is clean' },
    chord: 'G',
  },
  {
    id: 'chord-em',
    title: 'Your first chord: E minor',
    kind: 'chord',
    outcome: 'Hold E minor and strum all six strings cleanly.',
    why: 'Two fingers, all six strings, and it sounds complete on its own. It is the shortest distance between holding a guitar and making music.',
    steps: [
      'Middle finger on the 2nd fret of the 5th string (A).',
      'Ring finger on the 2nd fret of the 4th string (D).',
      'Leave every other string open — do not touch them.',
      'Curl both fingers so their tips press and their bellies do not touch the neighbouring strings.',
      'Strum all six strings slowly, from the thick one down.',
    ],
    check: 'Pick each string one at a time. All six ring. No clicks, no dead strings.',
    watchFor: 'The 3rd string (G) going dead is the usual one. Your middle finger is leaning on it — curl it more.',
    expect: 'Most people get a clean E minor within two or three sessions.',
    practice: { view: 'lessons', label: 'Learn it with the app listening' },
    chord: 'Em',
  },
  {
    id: 'strum',
    title: 'Strum in time',
    kind: 'technique',
    outcome: 'Keep four even strums a bar without speeding up.',
    why: 'Timing is what makes playing sound like music. A clean chord out of time sounds worse than a scrappy chord in time, and beginners almost always practise the wrong one of those.',
    steps: [
      'Hold E minor — the two-finger shape from step four.',
      'Strum down on every count: one, two, three, four. Count out loud.',
      'Move from your wrist, not your elbow. The motion is small.',
      'Keep your hand moving even when you are not hitting the strings — like a pendulum that never stops.',
      'Slow is the point. If you cannot count out loud while doing it, you are going too fast.',
    ],
    check: 'Sixteen strums with no gap, no rush, counting out loud the whole way.',
    watchFor: 'Speeding up is the default. It is a sign of tension, not enthusiasm.',
    expect: 'A week to stop rushing. Longer to stop noticing that you are not rushing.',
    practice: { view: 'lessons', label: 'Drill it against a click' },
    chord: 'Em',
  },
  {
    id: 'chord-g',
    title: 'Second chord: G',
    kind: 'chord',
    outcome: 'Hold G cleanly on all six strings.',
    why: 'G is the home chord of an enormous amount of folk, country and rock. With G and one more you have real songs.',
    steps: [
      'Middle finger on the 3rd fret of the 6th string (low E).',
      'Index finger on the 2nd fret of the 5th string (A).',
      'Ring finger on the 3rd fret of the 1st string (thin E).',
      'Leave the D, G and B strings open.',
      'Strum all six strings slowly and check each one is sounding.',
    ],
    check: 'Every string rings. The thin E in particular — it is the one people mute with the underside of the ring finger.',
    watchFor: 'If the thin E is dead, your ring finger is too flat. Come up onto its tip.',
    expect: 'Harder than E minor. Give it a week.',
    practice: { view: 'lessons', label: 'Learn it with the app listening' },
    chord: 'G',
  },
  {
    id: 'change',
    title: 'Change between two chords without stopping',
    kind: 'technique',
    outcome: 'Move between two chords in time, without a silent gap.',
    why: 'This, not the chords themselves, is what playing a song actually is. Nobody is stopped by chords; everybody is stopped by the change.',
    steps: [
      'Pick two chords you have. E minor and G is the easiest pair.',
      'Hold the first. Strum once.',
      'Lift all fingers at the same time and place all fingers at the same time. Not one finger at a time.',
      'Do it slowly enough that the change happens exactly on a count. Four counts on each chord.',
      'When it is clean, take it to two counts each, then one.',
    ],
    check: 'Sixty changes in a minute with no gap in the strumming.',
    watchFor: 'Landing fingers one at a time. It feels faster and it is the thing that keeps you slow.',
    expect: 'Two to four weeks to make it feel automatic. This is the real hump.',
    practice: { view: 'lessons', label: 'The app counts your changes' },
    chords: ['Em', 'G'],
  },
  {
    id: 'first-song',
    title: 'Play a whole song',
    kind: 'song',
    outcome: 'Play a real song, start to finish, with two chords.',
    why: 'You are not learning chords in order to know chords. Playing something whole, however simple, is what makes the next month happen.',
    steps: [
      'Open Tom Dooley. It is G and D, four bars each.',
      'Set it to "Just the chords" — one strum a bar. That is a real performance of it, not a watered-down one.',
      'Play it with the app. Let the chart tell you where you are.',
      'When that holds together, switch the same song to "Bass and strum".',
    ],
    check: 'You get through it without stopping, twice.',
    expect: 'Same day you have the two chords.',
    practice: { view: 'song', params: { song: 'tom-dooley' }, label: 'Open Tom Dooley' },
  },
  {
    id: 'chord-c-d',
    title: 'C and D',
    kind: 'chord',
    outcome: 'Add the two chords that open up most of the songbook.',
    why: 'G, C and D together are the three-chord backbone of thousands of songs. This is the moment the app stops having to say no to you.',
    steps: [
      'D: index on the 2nd fret of the G string, middle on the 2nd fret of the thin E, ring on the 3rd fret of the B string. Play only the thinnest four strings.',
      'C: ring on the 3rd fret of the A string, middle on the 2nd fret of the D string, index on the 1st fret of the B string. Play five strings, not the low E.',
      'Get each one clean on its own before putting them together.',
      'Then practise G to C, and G to D, as changes.',
    ],
    check: 'Both ring cleanly, and you can change into each from G without a gap.',
    watchFor: 'On D, hitting the two thick strings. Aim your strum at the thin four only.',
    expect: 'C is the hardest of the open chords for most people. Two to three weeks.',
    practice: { view: 'lessons', label: 'Learn them with the app listening' },
    chords: ['C', 'D'],
  },
  {
    id: 'more-songs',
    title: 'Three chords, five songs',
    kind: 'song',
    outcome: 'Play several complete songs from the same three shapes.',
    why: 'Repertoire is what makes practice stop feeling like practice. It is also how the changes finally become automatic — by being used rather than drilled.',
    steps: [
      'Open Songs. With G, C and D you can play five of them.',
      'Play each one through once at "Just the chords".',
      'Pick the one you liked and take that one to "Bass and strum".',
      'Come back to it tomorrow rather than moving on today.',
    ],
    check: 'You can start any of the five without looking anything up first.',
    expect: 'A few weeks of playing rather than a few sessions of study.',
    practice: { view: 'songs', label: 'See what you can play' },
  },
  {
    id: 'boom-chuck',
    title: 'Bass note and strum',
    kind: 'technique',
    outcome: 'Alternate a bass note with a strum, in time.',
    why: 'This is the engine of country, folk and bluegrass rhythm playing. It is the difference between strumming along and sounding like a record.',
    steps: [
      'Hold G. Its lowest note is the one your middle finger is on: the 3rd fret of the thick E.',
      'Pick that single string on count one.',
      'Strum the thin three strings on count two.',
      'Pick the 5th string on count three, strum again on four.',
      'Say it out loud: bass, strum, bass, strum.',
    ],
    check: 'Eight bars without the bass note and the strum blurring into each other.',
    watchFor: 'Strumming all six strings on the off-beats. Keep the strum light and high.',
    expect: 'Two weeks before it stops needing your full attention.',
    practice: { view: 'songs', label: 'Use it on a song you know' },
  },
  {
    id: 'clean-notes',
    title: 'Pick single notes cleanly',
    kind: 'technique',
    outcome: 'Play one note at a time without catching neighbouring strings.',
    why: 'Everything melodic — riffs, solos, the tune of a song — needs this. Strumming hides a lot; single notes hide nothing.',
    steps: [
      'Rest your picking hand lightly on the bridge.',
      'Pick one string, down. Let the pick come to rest against the next string rather than flying off.',
      'Then pick the same string up, and let it rest against the previous one.',
      'Down, up, down, up, on one string, slowly and evenly.',
      'Move to the next string and do the same.',
    ],
    check: 'Twenty alternating picks on one string with no accidental extra strings sounding.',
    expect: 'A week to get the motion, a month to get it even.',
    practice: { view: 'session', label: 'Play and let the app watch your notes' },
  },
  {
    id: 'scale-minor-pent',
    title: 'Minor pentatonic — your first scale',
    kind: 'scale',
    outcome: 'Play the five-note shape up and down, and use it to make a short phrase.',
    why: 'This is the sound of almost every rock and blues solo you have ever heard. Five notes, one shape, and it moves anywhere on the neck. It is the best value for effort on the whole instrument.',
    steps: [
      'Start with E minor pentatonic in open position, or A minor pentatonic at the 5th fret.',
      'Learn it as a shape, not as five separate notes. The app draws the box with home marked.',
      'Play it up and down slowly, one note per beat, alternating your picking.',
      'Then stop practising it and use it: play three notes of it and stop. That is a phrase.',
      'Always start and end on home and it will sound finished.',
    ],
    check: 'Up and down twice cleanly, then a three-note phrase that sounds deliberate.',
    watchFor: 'Running up and down forever. The scale is the alphabet, not the sentence.',
    expect: 'The shape in a week. Making music out of it is the rest of your life, and it starts immediately.',
    practice: { view: 'lessons', label: 'Learn the shape and make a riff from it' },
    scale: { tonicPc: 4, scaleId: 'minor-pent' },
  },
  {
    id: 'scale-major-pent',
    title: 'Major pentatonic — the bright one',
    kind: 'scale',
    outcome: 'Play the same five-note idea with a major sound, and hear the difference.',
    why: 'The same economy, the opposite mood. Country, folk and most pop melody lives here. Learning it next to the minor one teaches you that mood is a choice, not a mystery.',
    steps: [
      'Start with G major pentatonic, root on the 3rd fret of the thick E.',
      'Play it up and down until the shape is under your hand.',
      'Now play A minor pentatonic and A major pentatonic back to back.',
      'Listen to what changed. One shape sounds sad and one sounds sunny, and it is only a couple of notes.',
    ],
    check: 'You can play both over the same root and say which is which with your eyes closed.',
    expect: 'A week for the shape, given you already have the minor one.',
    practice: { view: 'lessons', label: 'Learn the shape and make a riff from it' },
    scale: { tonicPc: 7, scaleId: 'major-pent' },
  },
  {
    id: 'first-riff',
    title: 'Make your own riff',
    kind: 'create',
    outcome: 'Write a short phrase that is yours, and keep it.',
    why: 'This is the whole point of the app. Everything before it exists so that you have enough under your hands to say something. It is also the moment practice turns into playing.',
    steps: [
      'Pick a scale you have. Play three or four notes of it and stop.',
      'Play the same thing again. If you cannot remember it, it was too long.',
      'Change one note, or one rhythm. Keep whichever version you prefer.',
      'Play it into the app and save it.',
      'Come back tomorrow and change one thing about it again.',
    ],
    check: 'You have something saved that you can play twice the same way.',
    watchFor: 'Waiting until you are good enough. You are good enough at four notes.',
    expect: 'Today. It will be short and simple and that is what a riff is.',
    practice: { view: 'session', label: 'Play it and let the app catch it' },
  },
  {
    id: 'solo',
    title: 'Play over changes',
    kind: 'create',
    outcome: 'Improvise a line over a song you can already play.',
    why: 'Soloing is not a separate talent. It is knowing a scale, knowing where the chord is, and landing on a note that belongs to it. That is the whole trick, and you now have all three parts.',
    steps: [
      'Open a song you can play and scroll to "Take a solo over it".',
      'Listen to what the app plays. Notice it lands on a chord tone when the chord changes.',
      'Play the scale over the song and aim to be on a chord note at the start of each bar.',
      'Leave gaps. Silence is what makes the notes sound chosen.',
    ],
    check: 'You can play eight bars over a song and land on the chord every time it changes.',
    watchFor: 'Playing constantly. A solo with no space sounds like an exercise.',
    expect: 'The idea lands immediately. Sounding good at it takes months, and it is fun the whole way.',
    practice: { view: 'songs', label: 'Pick a song to solo over' },
  },
];

export function stepById(id: string): PathStep | null {
  return PATH.find((step) => step.id === id) ?? null;
}

const DONE_KEY = 'guitar-path-done';

export interface PathProgress {
  done: Set<string>;
  /** The step to put in front of them: the first one not finished. */
  current: PathStep;
  /** How many are finished, for a quiet sense of movement. */
  completed: number;
}

export function loadProgress(store: { getItem(k: string): string | null }): PathProgress {
  let done = new Set<string>();
  try {
    const raw = store.getItem(DONE_KEY);
    if (raw) done = new Set(JSON.parse(raw) as string[]);
  } catch {
    done = new Set();
  }
  const current = PATH.find((step) => !done.has(step.id)) ?? PATH[PATH.length - 1]!;
  return { done, current, completed: PATH.filter((step) => done.has(step.id)).length };
}

export function saveDone(
  store: { setItem(k: string, v: string): void },
  done: Set<string>,
): void {
  try {
    store.setItem(DONE_KEY, JSON.stringify([...done]));
  } catch {
    // A browser that will not store it still shows the course; it just starts
    // from the top each time, which is better than refusing to teach.
  }
}
