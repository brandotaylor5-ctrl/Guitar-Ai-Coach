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
  /** Skills that should be reasonably solid before this one is worth trying. */
  requires: string[];
  /** What the player is actually trying to do, in their words not a syllabus's. */
  goal: string;
  /** Why it is worth the time — a teacher always answers this. */
  why: string;
  /** Chord label, for chord skills. */
  chord?: string;
  /** The two chords, for a change. */
  between?: [string, string];
  /** Chord sequence, for a progression. */
  sequence?: string[];
  /** Scale root pitch class and degrees, for a scale. */
  scale?: { tonicPc: number; name: string };
}

/** Changes-per-minute a teacher would call fluent for a two-chord change. */
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

  // --- progressions -------------------------------------------------------
  {
    id: 'prog.Em-C-G-D', name: 'The four-chord progression', kind: 'progression',
    requires: ['change.C-G', 'change.G-D', 'change.Am-C'], sequence: ['Em', 'C', 'G', 'D'],
    goal: 'Play all four in a loop, one bar each, without stopping.',
    why: 'This exact sequence carries an unreasonable number of songs. Playing it in time means you can play along with records.',
  },
  {
    id: 'prog.Am-F-C-G', name: 'The sad four chords', kind: 'progression',
    requires: ['prog.Em-C-G-D'], sequence: ['Am', 'F', 'C', 'G'],
    goal: 'Keep the loop going through the F.',
    why: 'Same four chords, started somewhere else, and it changes the whole mood. It is theory you can hear rather than read.',
  },
  {
    id: 'prog.12bar.E', name: 'Twelve-bar blues in E', kind: 'progression',
    requires: ['chord.E', 'chord.A'], sequence: ['E', 'E', 'E', 'E', 'A', 'A', 'E', 'E', 'B7', 'A', 'E', 'E'],
    goal: 'Keep your place through all twelve bars.',
    why: 'The form most improvising sits on top of. Knowing where you are in it is what lets you solo without getting lost.',
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

/** Every skill that must come before this one, transitively. */
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
