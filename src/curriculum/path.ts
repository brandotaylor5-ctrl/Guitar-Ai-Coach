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
    practice: { view: 'session', label: 'Open Live Coach and watch the note settle' },
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
    check: 'Pick each string one at a time. All six ring. No clicks, no dead strings — or let the app check it for you and name the string.',
    watchFor: 'The 3rd string (G) going dead is the usual one. Your middle finger is leaning on it — curl it more.',
    expect: 'Most people get a clean E minor within two or three sessions.',
    practice: { view: 'lessons', params: { skill: 'chord.Em', path: 'chord-em' }, label: 'Practice E minor with the microphone' },
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
    practice: { view: 'lessons', params: { skill: 'technique.steady-strum', path: 'strum' }, label: 'Practice the steady pulse' },
    chord: 'Em',
  },
  {
    id: 'strum-updown',
    title: 'The up-strum',
    kind: 'technique',
    outcome: 'Strum down and up in one continuous motion.',
    why: 'Down-strums alone can only ever sound like a march. The up-strum is where rhythm starts being something you feel rather than something you count.',
    steps: [
      'Hold E minor and keep strumming down on every count, as you already can.',
      'Now let your hand come back up through the strings on the way to the next down.',
      'The up-stroke is lighter and usually only catches the thin three strings. That is correct, not a mistake.',
      'Count it out loud: one and two and three and four and. The downs land on numbers, the ups on the ands.',
      'Keep the hand swinging even through the ups you do not play.',
    ],
    check: 'Eight bars of down-up without the hand ever stopping, and without the ups sounding as heavy as the downs.',
    watchFor: 'Hitting all six strings on the way up. Angle the pick slightly and let it brush only the thin strings.',
    expect: 'A few days for the motion, a couple of weeks before it stops needing thought.',
    chord: 'Em',
    practice: { view: 'lessons', params: { skill: 'technique.up-strum', path: 'strum-updown' }, label: 'Practice down-up motion' },
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
    practice: { view: 'lessons', params: { skill: 'chord.G', path: 'chord-g' }, label: 'Practice G with the microphone' },
    chord: 'G',
  },
  {
    id: 'chord-d',
    title: 'Third chord: D',
    kind: 'chord',
    outcome: 'Hold D cleanly on the thinnest four strings.',
    why: 'G and D are enough to play a complete traditional song. D also teaches you that a chord does not always use all six strings.',
    steps: [
      'Index finger on the 2nd fret of the 3rd string (G).',
      'Ring finger on the 3rd fret of the 2nd string (B).',
      'Middle finger on the 2nd fret of the 1st string (thin E).',
      'Start your strum on the open 4th string (D). Do not hit the A or low E strings.',
      'Pick the four strings one at a time before you strum them together.',
    ],
    check: 'The D, G, B and high E strings all ring clearly, and the two thickest strings stay out of the chord.',
    watchFor: 'The usual mistake is simply strumming too many strings. Aim the pick at the open D string and let that be the top of the motion.',
    expect: 'A few sessions to find the triangle quickly. Clean changes into it take longer.',
    practice: { view: 'lessons', params: { skill: 'chord.D', path: 'chord-d' }, label: 'Practice D with the microphone' },
    chord: 'D',
  },
  {
    id: 'change',
    title: 'Change between G and D without stopping',
    kind: 'technique',
    outcome: 'Move between G and D in time, without a silent gap.',
    why: 'This is the exact change your first complete song needs. Chord changes are where guitar starts becoming music instead of a collection of shapes.',
    steps: [
      'Hold G and strum once.',
      'Move to D as one hand movement instead of placing the D fingers one at a time.',
      'Give each chord four slow counts at first: G for four, D for four.',
      'When that stays clean, use two counts each.',
      'Only then try one strum per chord and let the app count the changes.',
    ],
    check: 'You can keep alternating G and D for a minute without stopping after a messy change.',
    watchFor: 'Freezing to repair a bad landing. Leave the ugly one behind and make the next change on time.',
    expect: 'This is a real skill, not a one-day box to tick. Expect a couple of weeks before it feels easy.',
    practice: { view: 'lessons', params: { skill: 'change.G-D', path: 'change' }, label: 'Let the app count G ↔ D' },
    chords: ['G', 'D'],
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
    id: 'strum-pattern',
    title: 'The pattern that fits most songs',
    kind: 'technique',
    outcome: 'Play down, down-up, up-down-up without thinking about it.',
    why: 'This one pattern fits an enormous number of songs in every style. Learning it properly is worth more than learning six patterns badly.',
    steps: [
      'Count one and two and three and four and, out loud, with your hand swinging the whole time.',
      'Play: down on one. Down on two, up on the and of two.',
      'Then up on the and of three, down on four, up on the and of four.',
      'Beat three has no down-strum. Your hand still goes down, it just misses the strings.',
      'Say "down, down-up, up-down-up" while you do it until your mouth and hand agree.',
    ],
    check: 'Four bars of it on one chord, in time, without counting the gaps out loud.',
    watchFor: 'Stopping your hand on beat three. The miss is what creates the rhythm — a stopped hand loses the place every time.',
    expect: 'A week to get it, a month before you can change chords while doing it.',
    chord: 'G',
    practice: { view: 'lessons', params: { skill: 'technique.eighth-strum', path: 'strum-pattern' }, label: 'Practice the rhythm with a click' },
  },
  {
    id: 'chord-c',
    title: 'Add C major',
    kind: 'chord',
    outcome: 'Add C so G, C and D become a complete three-chord family.',
    why: 'Once G and D already make a song, C is not another random shape — it is the chord that opens a much larger songbook around them.',
    steps: [
      'Index finger on the 1st fret of the 2nd string (B).',
      'Middle finger on the 2nd fret of the 4th string (D).',
      'Ring finger on the 3rd fret of the 5th string (A).',
      'Leave the G and high E strings open.',
      'Start the strum on the 5th string. Do not hit the low E.',
    ],
    check: 'All five intended strings ring clearly, then you can move G → C and back without rebuilding one finger at a time.',
    watchFor: 'The open G and high E strings are easy to mute. Curl the index and middle fingers and stay on their tips.',
    expect: 'C is one of the awkward early shapes. Give the hand a week or two rather than squeezing harder.',
    practice: { view: 'lessons', params: { skill: 'chord.C', path: 'chord-c' }, label: 'Practice C with the microphone' },
    chord: 'C',
  },
  {
    id: 'more-songs',
    title: 'Three chords, a pile of songs',
    kind: 'song',
    outcome: 'Play several complete songs from the same three shapes.',
    why: 'Repertoire is what makes practice stop feeling like practice. It is also how the changes finally become automatic — by being used rather than drilled.',
    steps: [
      'Open Songs. With G, C and D a good number of them are now open to you — the app marks which.',
      'Play each one it offers you through once at "Just the chords".',
      'Pick the one you liked and take that one to "Bass and strum".',
      'Come back to it tomorrow rather than moving on today.',
    ],
    check: 'You can start any of the five without looking anything up first.',
    expect: 'A few weeks of playing rather than a few sessions of study.',
    practice: { view: 'songs', label: 'See what you can play' },
  },
  {
    id: 'chord-a',
    title: 'Add A major',
    kind: 'chord',
    outcome: 'Hold A cleanly while keeping the high E string open.',
    why: 'A opens a second family of songs and teaches you to fit several fingers into the same fret without flattening them.',
    steps: [
      'Index finger on the 2nd fret of the 4th string (D).',
      'Middle finger on the 2nd fret of the 3rd string (G).',
      'Ring finger on the 2nd fret of the 2nd string (B).',
      'Start your strum on the open 5th string (A).',
      'Leave the high E open and do not hit the low E.',
    ],
    check: 'The open A and high E both ring, and all three fretted notes sound without buzzing.',
    watchFor: 'Three fingers in one fret gets crowded. Keep them narrow and on their tips instead of squeezing harder.',
    expect: 'A few sessions to make the shape fit comfortably.',
    chord: 'A',
    practice: { view: 'lessons', params: { skill: 'chord.A', path: 'chord-a' }, label: 'Practice A with the microphone' },
  },
  {
    id: 'chord-e',
    title: 'Add E major',
    kind: 'chord',
    outcome: 'Turn your familiar E minor shape into E major with one extra finger.',
    why: 'E is one finger away from E minor. Hearing that one-note change is an early lesson in how tiny physical changes alter the entire mood.',
    steps: [
      'Start from E minor: middle finger on A-string fret 2, ring finger on D-string fret 2.',
      'Add your index finger to the 1st fret of the G string.',
      'Leave the B and high E strings open.',
      'Strum all six strings.',
      'Go back and forth between E minor and E major so your ear hears what the index finger changes.',
    ],
    check: 'All six strings ring, and you can switch E minor ↔ E major without rebuilding the two fingers they share.',
    watchFor: 'The index finger can flatten and mute the B string. Stay on its tip.',
    expect: 'Usually quicker than A because most of the hand already knows E minor.',
    chord: 'E',
    practice: { view: 'lessons', params: { skill: 'chord.E', path: 'chord-e' }, label: 'Practice E with the microphone' },
  },
  {
    id: 'change-a-e',
    title: 'Change between A and E',
    kind: 'technique',
    outcome: 'Move between A and E without losing the beat.',
    why: 'This gives you the core movement behind a huge amount of rock, country and blues rhythm.',
    steps: [
      'Strum A once, then move to E as one hand movement.',
      'Give each chord four slow counts until both land cleanly.',
      'Reduce that to two counts each.',
      'Keep going through ugly landings instead of stopping to repair them.',
      'Use the app only when the shapes are familiar enough that counting changes is useful.',
    ],
    check: 'You can alternate A and E for a minute without stopping.',
    watchFor: 'Placing the A chord one finger at a time. Think of the three fingers as one small cluster.',
    expect: 'A couple of weeks to stop thinking about the individual fingers.',
    chords: ['A', 'E'],
    practice: { view: 'lessons', params: { skill: 'change.A-E', path: 'change-a-e' }, label: 'Let the app count A ↔ E' },
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
    practice: { view: 'lessons', params: { skill: 'technique.clean-notes', path: 'clean-notes' }, label: 'Start a guided clean-picking practice' },
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
    practice: { view: 'lessons', params: { skill: 'scale.Em.pentatonic', path: 'scale-minor-pent' }, label: 'Learn E minor pentatonic with feedback' },
    scale: { tonicPc: 4, scaleId: 'minor-pent' },
  },
  {
    id: 'hammer-on',
    title: 'Your first hammer-on',
    kind: 'technique',
    outcome: 'Sound a second note with your fretting hand instead of picking twice.',
    why: 'This is the first technique that makes a simple scale phrase sound connected and guitar-like instead of like separate buttons being pressed.',
    steps: [
      'Use a two-note piece of the E minor pentatonic shape you just learned.',
      'Fret the lower note with your index finger and pick it once.',
      'Without picking again, drop another finger firmly onto the higher fret on the same string.',
      'Aim just behind the fret wire so the hammered note rings clearly.',
      'Repeat slowly until the second note is close to the volume of the first.',
    ],
    check: 'You can make ten clear two-note hammer-ons without picking the second note.',
    watchFor: 'Pressing the second finger down slowly. A hammer-on is a small strike from the knuckle, not a gradual squeeze.',
    expect: 'You can usually get the sound in one session. Making it even takes longer.',
    practice: { view: 'lessons', params: { skill: 'technique.hammer-on', path: 'hammer-on' }, label: 'Start a guided hammer-on practice' },
  },
  {
    id: 'pull-off',
    title: 'Add the pull-off',
    kind: 'technique',
    outcome: 'Sound the lower note by removing a finger without picking again.',
    why: 'Hammer-ons and pull-offs together let a short riff flow with far fewer pick strokes.',
    steps: [
      'Fret two notes on the same string, with the lower finger already planted.',
      'Pick the higher note once.',
      'Pull the higher finger slightly toward the floor as it leaves the string.',
      'Let the lower fretted note ring immediately underneath it.',
      'Then combine them: pick, hammer-on, pull-off.',
    ],
    check: 'The lower note after the pull-off is clear and nearly as loud as the picked note, ten times in a row.',
    watchFor: 'Lifting straight away from the neck. The tiny sideways pluck is what actually sounds the lower note.',
    expect: 'A day to make it work, a couple of weeks before it feels fluid.',
    practice: { view: 'lessons', params: { skill: 'technique.pull-off', path: 'pull-off' }, label: 'Start a guided pull-off practice' },
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
    practice: { view: 'lessons', params: { skill: 'scale.G.pentatonic.major', path: 'scale-major-pent' }, label: 'Learn G major pentatonic with feedback' },
    scale: { tonicPc: 7, scaleId: 'major-pent' },
  },
  {
    id: 'scale-blues',
    title: 'The blues scale',
    kind: 'scale',
    outcome: 'Add one note to minor pentatonic and get the whole blues sound.',
    why: 'One note is the entire difference between a neutral minor sound and a blues. Hearing what that single note does is worth more than another whole scale.',
    steps: [
      'Start from minor pentatonic, which you already know.',
      'Add one note between the fourth and fifth notes of it. That is the blue note.',
      'Play the scale up and down with it in.',
      'Now play it again but sit on the blue note for a whole beat. Notice how wrong it sounds.',
      'Now pass straight through it into the next note. That is the only way it wants to be used.',
    ],
    check: 'You can play a phrase that goes through the blue note without stopping on it.',
    watchFor: 'Landing on the blue note at the end of a phrase. It is a passing note, not a destination.',
    expect: 'The shape in a day, since you already have the pentatonic under it.',
    scale: { tonicPc: 9, scaleId: 'blues' },
    practice: { view: 'lessons', params: { skill: 'scale.A.blues', path: 'scale-blues' }, label: 'Learn the A blues shape with feedback' },
  },
  {
    id: 'bend',
    title: 'Bend a note',
    kind: 'technique',
    outcome: 'Push a string sideways until it reaches the next note up.',
    why: 'A bend is the closest a guitar gets to a singing voice, and it is the single most expressive thing on the instrument. It is also the thing that most obviously separates playing notes from playing music.',
    steps: [
      'Fret the 3rd string at the 7th fret with your ring finger.',
      'Put your middle and index fingers on the same string behind it — all three push together.',
      'Push the string towards the ceiling, rotating from your wrist rather than pushing with the fingers.',
      'Now play the 9th fret so you know the note you are aiming at. Then bend the 7th until it matches exactly.',
      'Hold it there. A bend that goes flat halfway sounds worse than no bend.',
    ],
    check: 'Your bent note and the fretted 9th fret sound identical, three times in a row.',
    watchFor: 'Bending only part of the way. An under-bent note sounds out of tune, and your ear will know before you do.',
    expect: 'A week to reach the pitch, a month to hit it reliably.',
    practice: { view: 'session', label: 'Bend it and watch the pitch readout' },
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
    id: 'chord-f-small',
    title: 'F, the way that actually works',
    kind: 'chord',
    outcome: 'Play an F without barring anything.',
    why: 'F is where more beginners quit than anywhere else, and it is almost always because they were handed the full barre first. The four-string version sounds fine and gets you playing the songs now.',
    steps: [
      'Index finger lies flat across the 1st fret of the thin two strings only — B and high E.',
      'Middle finger on the 2nd fret of the G string.',
      'Ring finger on the 3rd fret of the D string.',
      'Play only those four strings. Do not touch the two thick ones.',
      'Aim your strum at the thin four. This is a real F, not a compromise.',
    ],
    check: 'Four strings ring, and you can get into it from C without stopping.',
    watchFor: 'Trying to barre all six. You do not need to yet, and attempting it now is what makes people give up.',
    expect: 'A week. Much less than the full barre would take.',
    chord: 'F',
    practice: { view: 'lessons', params: { skill: 'chord.F', path: 'chord-f-small' }, label: 'Practice the small F with the microphone' },
  },
  {
    id: 'power-chords',
    title: 'Power chords',
    kind: 'chord',
    outcome: 'Play a two-finger shape that works anywhere on the neck.',
    why: 'One shape, no open strings, slide it anywhere and it is a different chord. It is the whole vocabulary of rock rhythm guitar and it is easier than the open chords you already play.',
    steps: [
      'Index finger on the 5th fret of the thick E string. That is an A.',
      'Ring finger on the 7th fret of the A string, two frets up and one string over.',
      'Play only those two strings, and mute the rest by resting your hand on them.',
      'Now slide the whole shape up two frets. That is a B. The shape never changes.',
      'The note under your index finger names the chord. Learn the thick string and you can find any of them.',
    ],
    check: 'You can play A, C and D as power chords without looking for them.',
    expect: 'A day for the shape. Knowing the notes on the thick string is the slow part.',
    practice: { view: 'session', label: 'Play them and let the app listen' },
  },
  {
    id: 'barre',
    title: 'The full barre',
    kind: 'chord',
    outcome: 'Hold a barre chord with every string ringing.',
    why: 'A barre is an open chord shape moved up the neck, which turns six shapes you know into all forty-eight chords there are. It is worth the fight, but only once your hand is ready — which is why it is here and not at the start.',
    steps: [
      'Lay your index finger flat across all six strings at the 1st fret.',
      'Roll it slightly onto its bony outside edge. The flat pad is soft and will mute strings.',
      'Now add an E major shape with your other three fingers, at frets 2 and 3.',
      'Squeeze from the thumb behind the neck, not by gripping harder with the index.',
      'Check each string one at a time. Expect several dead ones at first.',
    ],
    check: 'All six strings ring at the 1st fret. If the 5th fret is easier, start there — it is.',
    watchFor: 'Pure hand strength is not the answer. Getting onto the edge of the index finger and pulling back with the thumb does more than squeezing ever will.',
    expect: 'Weeks, and it is normal for it to feel impossible before it suddenly does not.',
    practice: { view: 'session', label: 'Use Live Coach for pitch while you build the barre shape' },
  },
  {
    id: 'fingerpick',
    title: 'Fingerpicking',
    kind: 'technique',
    outcome: 'Play a repeating pattern with thumb and fingers instead of a pick.',
    why: 'It is a completely different sound out of the same chords you already know, and it makes a solo guitar sound like more than one instrument.',
    steps: [
      'Hold E minor. Rest your thumb on the thick E string, and index, middle and ring on the G, B and thin E.',
      'Thumb plays the thick E. Then index, then middle, then ring, one at a time.',
      'Keep the thumb steady and even — it is the drummer, and everything else fits around it.',
      'Repeat it slowly, over and over, until your fingers stop needing to be told.',
      'Then change to G and keep the same pattern going.',
    ],
    check: 'Sixteen bars without the pattern stumbling when the chord changes.',
    watchFor: 'Looking at your picking hand. Look at the fretting hand — the picking fingers learn by feel and staring at them slows it down.',
    expect: 'Two weeks to the pattern, longer to change chords underneath it.',
    chord: 'Em',
    practice: { view: 'lessons', params: { skill: 'technique.fingerstyle-pattern', path: 'fingerpick' }, label: 'Start a guided fingerstyle practice' },
  },
  {
    id: 'dynamics',
    title: 'Loud and quiet',
    kind: 'technique',
    outcome: 'Play the same thing softly and then hard, on purpose.',
    why: 'Beginners play everything at one volume and it is the biggest single reason their playing sounds flat. Changing loudness is free and it does more for how you sound than any new chord.',
    steps: [
      'Play a verse of a song you know as quietly as you can while still sounding every string.',
      'Play the next part noticeably louder.',
      'Go back to quiet. The contrast is the point, not the loudness.',
      'Now do it inside a single bar: start a strum soft and finish it hard.',
      'Listen back with the app if you are not sure you actually changed anything.',
    ],
    check: 'Somebody in the next room could tell where the loud part started.',
    expect: 'Immediately, and then forever, because it is a habit rather than a skill.',
    practice: { view: 'session', label: 'Play and watch the level' },
  },
  {
    id: 'twelve-bar',
    title: 'The twelve-bar blues',
    kind: 'song',
    outcome: 'Play the twelve-bar form from memory in A.',
    why: 'It is one form and it unlocks thousands of songs and every blues jam there has ever been. Knowing where you are in it is what lets you play with other people.',
    steps: [
      'Four bars of A. Then two of D, two of A.',
      'Then one bar of E, one of D, and two of A to finish.',
      'Count four beats in every bar, out loud, until the shape is in your head rather than on the screen.',
      'Play it with power chords first, then with open chords.',
      'Say the chord for the next bar out loud before you get there.',
    ],
    check: 'Three times round without looking at anything.',
    expect: 'A week to memorise, and then it is yours permanently.',
    practice: { view: 'songs', label: 'Find a blues to play it over' },
  },
  {
    id: 'ear',
    title: 'Work out a song by ear',
    kind: 'create',
    outcome: 'Find the chords of a simple song without being told them.',
    why: 'This is the skill that makes you independent of tab sites and apps, including this one. It is also far more learnable than people think — most songs use four chords and you already know them.',
    steps: [
      'Pick a simple song you know well and can hum.',
      'Find the very first bass note by humming it and hunting on the thick strings.',
      'That note is almost always the first chord. Try it major; if it sounds sad, try it minor.',
      'Most songs stay in one key, so the other chords are nearly always the handful that go with the first.',
      'Guess, play along, and change your guess when it clashes. Being wrong out loud is the method, not a failure.',
    ],
    check: 'You have found the chords to one whole song without looking them up.',
    watchFor: 'Believing you are tone deaf. You are hunting, not guessing — a wrong chord sounds obviously wrong and that is the information you need.',
    expect: 'The first one takes an hour. The tenth takes five minutes.',
    practice: { view: 'session', label: 'Play along and let the app name what it hears' },
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
