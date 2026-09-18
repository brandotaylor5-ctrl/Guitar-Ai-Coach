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

  // --- progressions -------------------------------------------------------
  {
    id: 'prog.Em-C-G-D', name: 'The four-chord progression', kind: 'progression',
    requires: ['change.C-G', 'change.G-D', 'change.Am-C'], sequence: ['Em', 'C', 'G', 'D'],
    goal: 'Play all four in a loop, one bar each, without stopping.',
    why: 'This exact sequence carries an unreasonable number of songs. Playing it in time means you can play along with records.',
  },
  {
    id: 'prog.Am-F-C-G', name: 'The sad four chords', kind: 'progression',
    requires: ['prog.Em-C-G-D', 'chord.F'], sequence: ['Am', 'F', 'C', 'G'],
    goal: 'Keep the loop going through the F.',
    why: 'Same four chords, started somewhere else, and it changes the whole mood. It is theory you can hear rather than read.',
  },
  {
    id: 'prog.12bar.E', name: 'Twelve-bar blues in E', kind: 'progression',
    requires: ['chord.E', 'chord.A', 'chord.B7'], sequence: ['E', 'E', 'E', 'E', 'A', 'A', 'E', 'E', 'B7', 'A', 'E', 'E'],
    goal: 'Keep your place through all twelve bars.',
    why: 'The form most improvising sits on top of. Knowing where you are in it is what lets you solo without getting lost.',
  },
  {
    id: 'prog.open-colour', name: 'Open-colour loop', kind: 'progression',
    requires: ['chord.Cmaj7', 'chord.Em7', 'chord.Am7', 'chord.Dsus2'],
    sequence: ['Cmaj7', 'Em7', 'Am7', 'Dsus2'],
    goal: 'Loop four colourful open chords while keeping the ringing strings alive between changes.',
    why: 'This turns the seventh and suspended shapes into music immediately and teaches you to hear texture, not just chord names.',
  },
  {
    id: 'prog.blues7.A', name: 'Three dominant sevenths in A', kind: 'progression',
    requires: ['chord.A7', 'chord.D7', 'chord.E7'],
    sequence: ['A7', 'D7', 'A7', 'E7'],
    goal: 'Keep a four-bar blues-flavoured loop moving without stopping between the seventh chords.',
    why: 'Three closely related shapes give you the sound of blues harmony without needing a long form or a pile of theory.',
  },

  // --- scales and technique ----------------------------------------------
  {
    id: 'scale.Em.pentatonic', name: 'E minor pentatonic, first position', kind: 'scale',
    requires: ['chord.Em'], scale: { tonicPc: 4, name: 'minor pentatonic' },
    goal: 'Play the shape up and down cleanly, in time.',
    why: 'Five notes that sound right over almost anything in E minor. This is the shape nearly every guitar solo you know is built from.',
  },
  {
    id: 'scale.Am.pentatonic', name: 'A minor pentatonic, first position', kind: 'scale',
    requires: ['scale.Em.pentatonic'], scale: { tonicPc: 9, name: 'minor pentatonic' },
    goal: 'Play the same shape rooted on A.',
    why: 'Identical shape, different starting fret. Learning that once means you can play it in any key.',
  },
  {
    id: 'technique.steady-strum', name: 'Keeping time', kind: 'technique', requires: ['chord.Em'],
    goal: 'Strum a steady pulse for a minute without speeding up or drifting.',
    why: 'Timing is the difference between someone who knows chords and someone who can play with other people.',
  },
  {
    id: 'technique.clean-notes', name: 'Making every string ring', kind: 'technique', requires: ['chord.Em'],
    goal: 'Play each string of a chord one at a time and hear all of them clearly.',
    why: 'Most beginners cannot hear which string is buzzing. Finding it deliberately is how you fix it.',
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
