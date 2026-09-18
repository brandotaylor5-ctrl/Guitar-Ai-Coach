/**
 * What there is to learn, and what has to come first.
 *
 * Every guitar app ships a fixed lesson order. This is a graph instead: each
 * skill names what it depends on, so the next thing to work on can be chosen
 * from what the player has actually demonstrated rather than from where they
 * happen to be in a list. Somebody who arrives already able to play E minor
 * should never be made to sit through it.
 */

export type SkillKind = 'chord' | 'change' | 'progression' | 'scale' | 'technique';

export interface Skill {
  id: string;
  name: string;
  kind: SkillKind;
  requires: string[];
  goal: string;
  why: string;
  chord?: string;
  between?: [string, string];
  sequence?: string[];
  scale?: { tonicPc: number; name: string };
  /** Concrete teaching steps for skills that are not a chord shape. */
  teach?: string[];
  /** The part of the app where this skill becomes music. */
  practice?: 'session' | 'lab' | 'songs';
}

export const FLUENT_CHANGES_PER_MINUTE = 60;

export const SKILLS: Skill[] = [
  // --- first chords -------------------------------------------------------
  {
    id: 'chord.Em', name: 'E minor', kind: 'chord', requires: [], chord: 'Em',
    goal: 'Hold E minor so all six strings ring cleanly.',
    why: 'Two fingers, six strings, and it sounds complete on its own. It is the fastest route to sounding like music.',
  },
  {
    id: 'chord.Am', name: 'A minor', kind: 'chord', requires: ['chord.Em'], chord: 'Am',
    goal: 'Hold A minor cleanly, without muting the first string.',
    why: 'Almost the same shape as E minor moved across, so it teaches your hand to move a shape rather than relearn one.',
  },
  {
    id: 'chord.E', name: 'E major', kind: 'chord', requires: ['chord.Em'], chord: 'E',
    goal: 'Hold E major cleanly.',
    why: 'One finger away from E minor. Hearing those two back to back is how the difference between major and minor stops being a word.',
  },
  {
    id: 'chord.A', name: 'A major', kind: 'chord', requires: ['chord.Am'], chord: 'A',
    goal: 'Fit three fingers into one fret without muting the next string.',
    why: 'The first chord that is genuinely cramped. Getting it clean teaches finger arching, which every later chord needs.',
  },
  {
    id: 'chord.D', name: 'D major', kind: 'chord', requires: ['chord.Am'], chord: 'D',
    goal: 'Play D major on the top four strings only.',
    why: 'Learning to strum four strings and not six is a skill in itself, and D is where you learn it.',
  },
  {
    id: 'chord.G', name: 'G major', kind: 'chord', requires: ['chord.E', 'chord.D'], chord: 'G',
    goal: 'Stretch across the neck for G without collapsing the shape.',
    why: 'The widest of the open chords. Once G is comfortable your fretting hand has most of the reach it will ever need.',
  },
  {
    id: 'chord.C', name: 'C major', kind: 'chord', requires: ['chord.Am'], chord: 'C',
    goal: 'Hold C major with the third finger reaching to the fifth string.',
    why: 'C is in an enormous number of songs, and its shape is the one barre chords are built from later.',
  },
  {
    id: 'chord.Dm', name: 'D minor', kind: 'chord', requires: ['chord.D'], chord: 'Dm',
    goal: 'Hold D minor cleanly on the top four strings.',
    why: 'The saddest of the easy chords, and the one that makes a progression sound like it means something.',
  },
  {
    id: 'chord.F', name: 'F major', kind: 'chord', requires: ['chord.C', 'chord.Am'], chord: 'F',
    goal: 'Play the small four-string F cleanly before worrying about a full barre chord.',
    why: 'F unlocks an enormous amount of music, but beginners are often thrown at the full barre version too early. Start with the real four-string voicing and earn the barre later.',
  },
  {
    id: 'chord.B7', name: 'B7', kind: 'chord', requires: ['chord.E', 'chord.A'], chord: 'B7',
    goal: 'Hold B7 with the open B string ringing clearly.',
    why: 'B7 is the tension chord that makes blues and songs in E want to come home. It is worth learning before a twelve-bar blues asks for it.',
  },

  // --- colour chords: familiar shapes with one small change --------------
  {
    id: 'chord.Em7', name: 'E minor 7', kind: 'chord', requires: ['chord.Em'], chord: 'Em7',
    goal: 'Turn E minor into E minor 7 with one extra finger while keeping every open string ringing.',
    why: 'This is the first lesson in changing the colour of a chord without abandoning the shape you already know.',
  },
  {
    id: 'chord.Am7', name: 'A minor 7', kind: 'chord', requires: ['chord.Am'], chord: 'Am7',
    goal: 'Turn A minor into A minor 7 by lifting one finger and keeping the open G string clear.',
    why: 'It teaches that making a chord richer can actually mean using fewer fingers, and the sound is immediately useful in songs.',
  },
  {
    id: 'chord.E7', name: 'E7', kind: 'chord', requires: ['chord.E'], chord: 'E7',
    goal: 'Turn E major into E7 cleanly and hear the extra tension.',
    why: 'E7 is a tiny physical change with a huge musical effect: it teaches your ear what a chord that wants to move sounds like.',
  },
  {
    id: 'chord.A7', name: 'A7', kind: 'chord', requires: ['chord.A'], chord: 'A7',
    goal: 'Hold A7 with the open G string ringing between the two fretted notes.',
    why: 'A7 is easy under the fingers and makes blues, folk and country progressions start sounding like real music instead of exercises.',
  },
  {
    id: 'chord.D7', name: 'D7', kind: 'chord', requires: ['chord.D'], chord: 'D7',
    goal: 'Hold D7 cleanly on the top four strings without catching the low strings.',
    why: 'D7 gives you another tension sound and makes the I-IV-V family in G much more expressive.',
  },
  {
    id: 'chord.G7', name: 'G7', kind: 'chord', requires: ['chord.G'], chord: 'G7',
    goal: 'Move from G to G7 while keeping the bass side of the chord steady.',
    why: 'G7 shows how changing one note can completely redirect where a progression wants to go.',
  },
  {
    id: 'chord.Asus2', name: 'A suspended 2', kind: 'chord', requires: ['chord.A'], chord: 'Asus2',
    goal: 'Open the B string inside your A shape and let the suspended sound ring.',
    why: 'Suspended chords are one of the easiest ways to make simple open-chord playing sound spacious and less predictable.',
  },
  {
    id: 'chord.Dsus2', name: 'D suspended 2', kind: 'chord', requires: ['chord.D'], chord: 'Dsus2',
    goal: 'Lift one finger from D major and keep the thin E string ringing open.',
    why: 'It turns a chord you already know into a moving texture you can use inside strumming patterns and intros.',
  },
  {
    id: 'chord.Cmaj7', name: 'C major 7', kind: 'chord', requires: ['chord.C'], chord: 'Cmaj7',
    goal: 'Turn C major into C major 7 by lifting your index finger and keeping the top strings open.',
    why: 'One lifted finger makes C much more spacious, teaching you to hear chord colour instead of only memorizing names.',
  },

  // --- useful color chords and open-chord variations ---------------------










  // --- changes ------------------------------------------------------------
  {
    id: 'change.Em-Am', name: 'E minor to A minor', kind: 'change',
    requires: ['chord.Em', 'chord.Am'], between: ['Em', 'Am'],
    goal: 'Change between them in time, without stopping to reassemble your hand.',
    why: 'Holding a chord is not playing guitar. Changing between two is where music starts, and these two share a finger.',
  },
  {
    id: 'change.Em-G', name: 'E minor to G', kind: 'change',
    requires: ['chord.Em', 'chord.G'], between: ['Em', 'G'],
    goal: 'Move between E minor and G cleanly.',
    why: 'Two fingers stay put. Noticing that is the moment changes stop feeling like starting over each time.',
  },
  {
    id: 'change.C-G', name: 'C to G', kind: 'change',
    requires: ['chord.C', 'chord.G'], between: ['C', 'G'],
    goal: 'Change between C and G without a gap in the strum.',
    why: 'The most common change in popular music, and one of the more awkward. Worth the work it takes.',
  },
  {
    id: 'change.G-D', name: 'G to D', kind: 'change',
    requires: ['chord.G', 'chord.D'], between: ['G', 'D'],
    goal: 'Change between G and D in time.',
    why: 'Once this is fluent, a very large number of songs open up at once.',
  },
  {
    id: 'change.Am-C', name: 'A minor to C', kind: 'change',
    requires: ['chord.Am', 'chord.C'], between: ['Am', 'C'],
    goal: 'Change between A minor and C smoothly.',
    why: 'Two fingers never move. It is the clearest example of why chord shapes are worth seeing as families.',
  },
  {
    id: 'change.Em-Em7', name: 'E minor to E minor 7', kind: 'change',
    requires: ['chord.Em', 'chord.Em7'], between: ['Em', 'Em7'],
    goal: 'Move between E minor and E minor 7 without rebuilding the whole hand.',
    why: 'This is chord decoration: the harmony stays related while one note changes the colour.',
  },
  {
    id: 'change.Am-Am7', name: 'A minor to A minor 7', kind: 'change',
    requires: ['chord.Am', 'chord.Am7'], between: ['Am', 'Am7'],
    goal: 'Move between A minor and A minor 7 by lifting and replacing one finger in time.',
    why: 'It teaches you to create movement inside one chord instead of changing the entire harmony.',
  },
  {
    id: 'change.E-E7', name: 'E to E7', kind: 'change',
    requires: ['chord.E', 'chord.E7'], between: ['E', 'E7'],
    goal: 'Move between E and E7 without losing the pulse.',
    why: 'Hearing stable E become tense E7 is a practical introduction to how chords create forward motion.',
  },
  {
    id: 'change.A-Asus2', name: 'A to Asus2', kind: 'change',
    requires: ['chord.A', 'chord.Asus2'], between: ['A', 'Asus2'],
    goal: 'Move between A and Asus2 while the open strings keep ringing.',
    why: 'This is the kind of tiny chord movement guitarists use to make a repeated chord feel alive.',
  },
  {
    id: 'change.D-Dsus2', name: 'D to Dsus2', kind: 'change',
    requires: ['chord.D', 'chord.Dsus2'], between: ['D', 'Dsus2'],
    goal: 'Move between D and Dsus2 with one finger while keeping the rhythm steady.',
    why: 'A one-finger change can create an intro, fill or hook without learning a completely new chord.',
  },
  {
    id: 'change.C-Cmaj7', name: 'C to C major 7', kind: 'change',
    requires: ['chord.C', 'chord.Cmaj7'], between: ['C', 'Cmaj7'],
    goal: 'Move between C and C major 7 by lifting and replacing the index finger cleanly.',
    why: 'This teaches chord colour in the simplest possible way: same family, one note different, completely different feeling.',
  },

  {
    id: 'change.Em-C', name: 'E minor to C', kind: 'change',
    requires: ['chord.Em', 'chord.C'], between: ['Em', 'C'],
    goal: 'Move between E minor and C without rebuilding your hand from scratch.',
    why: 'This is one of the core changes inside modern acoustic and indie progressions.',
  },
  {
    id: 'change.D-Em', name: 'D to E minor', kind: 'change',
    requires: ['chord.D', 'chord.Em'], between: ['D', 'Em'],
    goal: 'Move between D and E minor in time.',
    why: 'This change connects bright and dark colors and appears constantly in four-chord loops.',
  },
  {
    id: 'change.D-A', name: 'D to A', kind: 'change',
    requires: ['chord.D', 'chord.A'], between: ['D', 'A'],
    goal: 'Change between D and A without pausing.',
    why: 'D and A unlock a huge amount of country, folk and rock rhythm guitar.',
  },
  {
    id: 'change.A-E', name: 'A to E', kind: 'change',
    requires: ['chord.A', 'chord.E'], between: ['A', 'E'],
    goal: 'Move between A and E as two complete shapes.',
    why: 'This is a foundational I–V movement and sets up songs and blues in A and E.',
  },
  {
    id: 'change.E-A', name: 'E to A', kind: 'change',
    requires: ['chord.E', 'chord.A'], between: ['E', 'A'],
    goal: 'Move from E to A and back without losing the beat.',
    why: 'The E–A relationship is one of the basic engines of blues, country and rock.',
  },
  {
    id: 'change.E-B7', name: 'E to B7', kind: 'change',
    requires: ['chord.E', 'chord.B7'], between: ['E', 'B7'],
    goal: 'Land on B7 and come back to E without stopping.',
    why: 'This is the tension-and-release move that makes a blues turnaround actually feel like a turnaround.',
  },
  {
    id: 'change.A-B7', name: 'A to B7', kind: 'change',
    requires: ['chord.A', 'chord.B7'], between: ['A', 'B7'],
    goal: 'Move between A and B7 cleanly inside a blues form.',
    why: 'It completes the three-chord vocabulary you need to keep your place through a twelve-bar blues in E.',
  },
  {
    id: 'change.A-D', name: 'A to D', kind: 'change',
    requires: ['chord.A', 'chord.D'], between: ['A', 'D'],
    goal: 'Switch between A and D while keeping the strum moving.',
    why: 'A–D is one of the most useful two-chord movements on acoustic guitar.',
  },
  {
    id: 'change.D-G', name: 'D to G', kind: 'change',
    requires: ['chord.D', 'chord.G'], between: ['D', 'G'],
    goal: 'Move between D and G without breaking the pulse.',
    why: 'This unlocks common progressions in both G and D and forces the fretting hand to move efficiently.',
  },
  {
    id: 'change.C-F', name: 'C to F', kind: 'change',
    requires: ['chord.C', 'chord.F'], between: ['C', 'F'],
    goal: 'Move between C and the small F without squeezing harder than you need to.',
    why: 'This is the practical bridge into thousands of songs that use F without requiring a full barre chord.',
  },
  {
    id: 'change.Am-F', name: 'A minor to F', kind: 'change',
    requires: ['chord.Am', 'chord.F'], between: ['Am', 'F'],
    goal: 'Move from A minor to F smoothly enough to keep a sad loop going.',
    why: 'This change is central to one of the most common minor-key pop and singer-songwriter progressions.',
  },






  // --- progressions -------------------------------------------------------
  {
    id: 'prog.G-C-D', name: 'Three chords in G', kind: 'progression',
    requires: ['change.C-G', 'change.G-D'], sequence: ['G', 'C', 'D', 'D'],
    goal: 'Loop G, C and D without stopping.',
    why: 'Three chords are enough for a huge amount of real music. This is the first place chord practice starts feeling like a song.',
  },
  {
    id: 'prog.Em-C-G-D', name: 'E minor four-chord loop', kind: 'progression',
    requires: ['change.Em-C', 'change.C-G', 'change.G-D', 'change.D-Em'], sequence: ['Em', 'C', 'G', 'D'],
    goal: 'Play all four in a loop, one bar each, without stopping.',
    why: 'This sequence is everywhere in modern acoustic and alternative music and gives you a complete minor-key loop to write over.',
  },
  {
    id: 'prog.D-G-A', name: 'Three chords in D', kind: 'progression',
    requires: ['change.D-G', 'change.D-A'], sequence: ['D', 'G', 'A', 'A'],
    goal: 'Keep D, G and A moving as one musical loop.',
    why: 'It gives you another whole family of songs and makes transposition stop feeling mysterious.',
  },
  {
    id: 'prog.A-D-E', name: 'Three chords in A', kind: 'progression',
    requires: ['change.A-D', 'change.A-E'], sequence: ['A', 'D', 'E', 'E'],
    goal: 'Loop A, D and E with a steady pulse.',
    why: 'A–D–E is a basic rock, country and blues vocabulary and reinforces the same harmonic job in a new key.',
  },
  {
    id: 'prog.Em-D-C', name: 'Descending E minor loop', kind: 'progression',
    requires: ['change.D-Em', 'change.Em-C', 'chord.D', 'chord.C'], sequence: ['Em', 'D', 'C', 'C'],
    goal: 'Let the bass movement fall from E minor through D to C without losing time.',
    why: 'This is a simple, dark loop that is excellent raw material for writing riffs and vocal melodies.',
  },
  {
    id: 'prog.C-Am-F-G', name: 'Classic singer-songwriter loop', kind: 'progression',
    requires: ['change.Am-C', 'change.Am-F', 'change.C-F', 'change.C-G'], sequence: ['C', 'Am', 'F', 'G'],
    goal: 'Play C, A minor, F and G as one continuous thought.',
    why: 'It is a classic songwriting loop and a useful laboratory for hearing how chord order changes emotional direction.',
  },
  {
    id: 'prog.Am-F-C-G', name: 'A minor four-chord loop', kind: 'progression',
    requires: ['change.Am-F', 'change.C-F', 'change.C-G'], sequence: ['Am', 'F', 'C', 'G'],
    goal: 'Keep the loop going through the F without losing the pulse.',
    why: 'The same chord family can sound completely different when A minor feels like home. This is practical harmony you can hear.',
  },
  {
    id: 'prog.E-A-B7', name: 'E turnaround', kind: 'progression',
    requires: ['change.E-A', 'change.E-B7', 'change.A-B7'], sequence: ['E', 'A', 'B7', 'E'],
    goal: 'Hear and play the tension of B7 resolving back to E.',
    why: 'This makes harmonic tension physical: B7 feels unfinished until E arrives.',
  },
  {
    id: 'prog.12bar.E', name: 'Twelve-bar blues in E', kind: 'progression',
    requires: ['change.E-A', 'change.E-B7', 'change.A-B7'], sequence: ['E', 'E', 'E', 'E', 'A', 'A', 'E', 'E', 'B7', 'A', 'E', 'E'],
    goal: 'Keep your place through all twelve bars.',
    why: 'The blues form underpins enormous amounts of rock, country and improvisation. Knowing where you are lets you riff without getting lost.',
  },

  // --- scales, rhythm, technique and creative fluency --------------------
  {
    id: 'scale.Em.pentatonic', name: 'E minor pentatonic, first position', kind: 'scale',
    requires: ['chord.Em'], scale: { tonicPc: 4, name: 'minor pentatonic' },
    goal: 'Play the five-note sound up and down, then use it to make a tiny phrase.',
    why: 'This is the quickest bridge from playing chords to making your own melodic ideas.',
    practice: 'lab',
  },
  {
    id: 'scale.Am.pentatonic', name: 'A minor pentatonic, first position', kind: 'scale',
    requires: ['scale.Em.pentatonic', 'chord.Am'], scale: { tonicPc: 9, name: 'minor pentatonic' },
    goal: 'Move the same pentatonic idea so A feels like home.',
    why: 'Learning the same musical shape in a new key teaches that the fretboard is movable rather than a pile of unrelated frets.',
    practice: 'lab',
  },
  {
    id: 'scale.E.blues', name: 'E blues scale', kind: 'scale',
    requires: ['scale.Em.pentatonic'], scale: { tonicPc: 4, name: 'blues' },
    goal: 'Add the blues color note to E minor pentatonic and use it deliberately.',
    why: 'One extra note creates the tension heard across blues and rock, and teaches that outside-sounding notes can be expressive when they resolve.',
    practice: 'lab',
  },
  {
    id: 'scale.A.blues', name: 'A blues scale', kind: 'scale',
    requires: ['scale.Am.pentatonic'], scale: { tonicPc: 9, name: 'blues' },
    goal: 'Use the blues color in A without losing the pentatonic shape underneath.',
    why: 'It reinforces movable scale thinking and gives you a practical sound for improvising over an A blues.',
    practice: 'lab',
  },
  {
    id: 'scale.C.major', name: 'C major scale', kind: 'scale',
    requires: ['chord.C'], scale: { tonicPc: 0, name: 'major' },
    goal: 'Hear the seven-note major sound and find it on the fretboard.',
    why: 'This connects the musical alphabet, chord tones and melody in the friendliest key for theory.',
    practice: 'lab',
  },
  {
    id: 'scale.G.major', name: 'G major scale', kind: 'scale',
    requires: ['chord.G', 'scale.C.major'], scale: { tonicPc: 7, name: 'major' },
    goal: 'Move the major-scale idea so G feels like home.',
    why: 'Moving a known scale into another key turns theory into a fretboard skill instead of a diagram to memorize.',
    practice: 'lab',
  },
  {
    id: 'technique.clean-notes', name: 'Making every string ring', kind: 'technique', requires: ['chord.Em'],
    goal: 'Pick through a chord one string at a time and hear which string is muted or buzzing.',
    why: 'Being able to diagnose one dead string is how chord cleanup becomes something you can fix yourself.',
    teach: [
      'Hold a chord you already know.',
      'Pick the strings one at a time instead of strumming.',
      'When one buzzes or dies, keep the chord held and adjust only the finger touching that string.',
      'Then strum the whole chord and compare the sound.',
    ],
    practice: 'session',
  },
  {
    id: 'technique.steady-strum', name: 'Keeping a steady pulse', kind: 'technique', requires: ['chord.Em'],
    goal: 'Strum a steady quarter-note pulse without speeding up when the chord feels easy.',
    why: 'Timing is the difference between knowing a chord and making music with somebody else.',
    teach: [
      'Mute the strings lightly with your fretting hand.',
      'Count 1 2 3 4 out loud.',
      'Make one relaxed down-strum on every number.',
      'Keep your arm moving like a pendulum even if one strum is messy.',
    ],
    practice: 'session',
  },
  {
    id: 'technique.up-strum', name: 'Adding up-strums', kind: 'technique', requires: ['technique.steady-strum'],
    goal: 'Keep the hand moving down and up while choosing which motions actually hit the strings.',
    why: 'Up-strums are the doorway to real groove because the hand can keep time even when the pattern changes.',
    teach: [
      'Keep counting 1 and 2 and 3 and 4 and.',
      'Move down on the numbers and up on every “and.”',
      'Start by touching the strings only on the down motions.',
      'Then let one or two up motions brush the thinnest strings without changing the arm motion.',
    ],
    practice: 'session',
  },
  {
    id: 'technique.eighth-strum', name: 'Eighth-note strumming', kind: 'technique', requires: ['technique.up-strum'],
    goal: 'Keep continuous down-up motion through a full bar of eighth notes.',
    why: 'A steady eighth-note engine is underneath a huge amount of acoustic, rock and pop rhythm guitar.',
    teach: [
      'Count 1 and 2 and 3 and 4 and.',
      'Down on every number, up on every “and.”',
      'Make the motion small and loose.',
      'Once it is steady, miss selected strings on purpose while the hand keeps moving.',
    ],
    practice: 'session',
  },
  {
    id: 'technique.dynamics', name: 'Playing with dynamics', kind: 'technique', requires: ['technique.steady-strum'],
    goal: 'Play the same chord loop quietly, then louder, without changing tempo.',
    why: 'Volume and attack turn a chord progression into a story instead of a loop at one emotional level.',
    teach: [
      'Play one loop as quietly as you can while keeping every chord audible.',
      'Repeat it with a firmer strum but the same tempo.',
      'Try making beats 2 and 4 slightly stronger.',
      'Notice how the groove changes even though the chords did not.',
    ],
    practice: 'session',
  },
  {
    id: 'technique.six-eight', name: 'Feeling 6/8 time', kind: 'technique', requires: ['technique.eighth-strum'],
    goal: 'Feel two big pulses made of three smaller beats: ONE two three FOUR five six.',
    why: '6/8 is everywhere in ballads, folk and fingerstyle music and feels completely different from ordinary 4/4.',
    teach: [
      'Count ONE two three FOUR five six.',
      'Make ONE and FOUR the strongest motions.',
      'Start on one chord so your hands can focus on the feel.',
      'Then move the same pulse through a two-chord progression.',
    ],
    practice: 'session',
  },
  {
    id: 'technique.alternate-picking', name: 'Alternate picking', kind: 'technique', requires: ['scale.Em.pentatonic'],
    goal: 'Pick a short scale fragment down-up-down-up without resetting the pick.',
    why: 'Alternate picking makes single-note playing smoother and gives your picking hand a reliable engine.',
    teach: [
      'Choose four adjacent notes from a scale you know.',
      'Pick the first down, the second up, then keep alternating.',
      'Do not restart with a downstroke when you change strings.',
      'Go slowly enough that the motion stays tiny.',
    ],
    practice: 'lab',
  },
  {
    id: 'technique.hammer-on', name: 'Hammer-ons', kind: 'technique', requires: ['scale.Em.pentatonic'],
    goal: 'Pick one note and sound the next note with the fretting hand alone.',
    why: 'Hammer-ons connect notes smoothly and are one of the first techniques that make a riff sound like guitar rather than an exercise.',
    teach: [
      'Fret a lower note with your index finger.',
      'Pick it once.',
      'Without picking again, drop another finger firmly onto a higher fret on the same string.',
      'Aim for the new note to be nearly as loud as the picked note.',
    ],
    practice: 'lab',
  },
  {
    id: 'technique.pull-off', name: 'Pull-offs', kind: 'technique', requires: ['technique.hammer-on'],
    goal: 'Sound a lower fretted note by pulling a higher finger off the string.',
    why: 'Pull-offs pair with hammer-ons to create flowing phrases and ornament melodies without picking every note.',
    teach: [
      'Fret two notes on the same string.',
      'Pick the higher note.',
      'Pull that finger slightly toward the floor as it leaves the string.',
      'Keep the lower finger planted so the second note rings clearly.',
    ],
    practice: 'lab',
  },
  {
    id: 'technique.slide', name: 'Slides', kind: 'technique', requires: ['scale.Em.pentatonic'],
    goal: 'Connect two notes on one string by moving the same finger without releasing pressure.',
    why: 'Slides make fretboard movement sound intentional and vocal instead of like separate button presses.',
    teach: [
      'Pick the first fretted note.',
      'Keep the finger pressed down.',
      'Move it to the target fret in one motion.',
      'Listen for the destination note to arrive clearly without a second pick.',
    ],
    practice: 'lab',
  },
  {
    id: 'technique.vibrato', name: 'Basic vibrato', kind: 'technique', requires: ['technique.slide'],
    goal: 'Let a held note gently move in pitch instead of dying flat.',
    why: 'Vibrato is one of the biggest differences between merely finding a note and making that note sound expressive.',
    teach: [
      'Hold one comfortable fretted note.',
      'Let the wrist make a tiny repeated rocking motion.',
      'Keep the movement even rather than wide.',
      'Use it after the note has already sounded clearly.',
    ],
    practice: 'session',
  },
  {
    id: 'technique.fingerstyle-thumb', name: 'Fingerstyle bass + fingers', kind: 'technique',
    requires: ['chord.Em', 'chord.C'],
    goal: 'Let the thumb own a bass string while the fingers answer on higher strings.',
    why: 'Separating bass from melody is the foundation of fingerstyle and lets one guitar feel like more than one part.',
    teach: [
      'Hold E minor or C.',
      'Play one bass string with your thumb.',
      'Answer with two higher strings using index and middle fingers.',
      'Repeat slowly until the thumb feels independent.',
    ],
    practice: 'session',
  },
  {
    id: 'technique.fingerstyle-pattern', name: 'A repeating fingerstyle pattern', kind: 'technique',
    requires: ['technique.fingerstyle-thumb', 'chord.Am'],
    goal: 'Keep thumb–finger–finger movement repeating while the chord changes underneath it.',
    why: 'A stable picking pattern lets harmony change without losing the flow — the core of a huge amount of acoustic guitar.',
    teach: [
      'Choose a chord and assign the thumb to its bass string.',
      'Play thumb, index, middle, index as a repeating four-note pattern.',
      'Keep the pattern going until it feels automatic.',
      'Then change to a second chord without changing the picking order.',
    ],
    practice: 'session',
  },
  {
    id: 'technique.riff-motif', name: 'Turning a small idea into a riff', kind: 'technique',
    requires: ['scale.Em.pentatonic'],
    goal: 'Repeat a tiny musical shape and change only one thing on the next pass.',
    why: 'Memorable riffs usually grow from a small identity, not from using every note you know.',
    teach: [
      'Make a phrase with only three or four notes.',
      'Play it twice the same way.',
      'On the third pass, change only the ending or rhythm.',
      'Keep whichever difference makes you want to hear the phrase again.',
    ],
    practice: 'lab',
  },
  {
    id: 'technique.call-response', name: 'Call and response', kind: 'technique',
    requires: ['technique.riff-motif'],
    goal: 'Play one short musical sentence, leave space, then answer it with another.',
    why: 'Thinking in questions and answers turns scales into storytelling and gives solos and songs a conversational shape.',
    teach: [
      'Play a short phrase and stop.',
      'Leave a real breath of silence.',
      'Answer with a phrase of similar length.',
      'Reuse some rhythm or contour so the two ideas sound related.',
    ],
    practice: 'lab',
  },
  {
    id: 'technique.song-sections', name: 'Verse, chorus and contrast', kind: 'technique',
    requires: ['prog.Em-C-G-D'],
    goal: 'Use one musical idea as a verse and create a clearly different section to answer it.',
    why: 'A song becomes larger than a loop when one section makes another section feel different.',
    teach: [
      'Choose one riff or progression as the verse idea.',
      'Decide what should change in the chorus: register, rhythm, harmony, density or ending.',
      'Change one or two of those things instead of replacing everything.',
      'Play verse → chorus → verse and listen for whether the return feels meaningful.',
    ],
    practice: 'songs',
  },

];

const BY_ID = new Map(SKILLS.map((skill) => [skill.id, skill]));

export function getSkill(id: string): Skill | null {
  return BY_ID.get(id) ?? null;
}

export function prerequisitesOf(id: string, seen = new Set<string>()): string[] {
  const skill = BY_ID.get(id);
  if (!skill) return [];
  for (const required of skill.requires) {
    if (seen.has(required)) continue;
    seen.add(required);
    prerequisitesOf(required, seen);
  }
  return [...seen];
}
