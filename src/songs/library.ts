/**
 * Real songs, at whatever level you are currently at.
 *
 * The idea borrowed here is the one Tunefox gets right: a song is not a fixed
 * thing you either can or cannot play. Every part of it has versions — a bare
 * strum, a bass note and a strum, the actual melody — and you swap each part
 * up as your hands catch up. You are playing the whole song from the first
 * day, and it gets more like the record over weeks instead of being locked
 * behind them.
 *
 * Everything here is traditional or public domain. That is not a compromise:
 * it is the bluegrass and old-time repertoire, which is where these songs came
 * from and what they were built to teach.
 */

/** How hard a version of a part is, and therefore who it is for. */
export type Level = 'strum' | 'boom-chuck' | 'melody';

export interface SongPart {
  level: Level;
  /** What the player actually does, in one line. */
  how: string;
  /**
   * MIDI notes with beat positions, for the versions that are notes rather
   * than strums. Beat 0 is the start of the section.
   */
  notes?: Array<{ midi: number; beat: number; beats: number }>;
}

export interface SongSection {
  id: string;
  name: string;
  /** One chord symbol per bar. */
  bars: string[];
  parts: SongPart[];
}

export interface Song {
  id: string;
  title: string;
  /** Where it comes from, because a beginner deserves to know. */
  origin: string;
  key: string;
  bpm: number;
  /** Rough order of difficulty, 1 easiest. */
  difficulty: 1 | 2 | 3;
  /** Why this song is worth a beginner's time, in plain words. */
  why: string;
  sections: SongSection[];
}

/** Four bars of a chord, the way a chart would write it. */
function bars(chord: string, count: number): string[] {
  return Array.from({ length: count }, () => chord);
}

const STRUM: SongPart = {
  level: 'strum',
  how: 'One strum on the first beat of each bar. Let it ring. Change to the next chord in time — nothing else.',
};

const BOOM_CHUCK: SongPart = {
  level: 'boom-chuck',
  how: 'Bass note on 1 and 3, strum on 2 and 4. This is the engine of every bluegrass and country song there is.',
};

export const SONGS: Song[] = [
  {
    id: 'tom-dooley',
    title: 'Tom Dooley',
    origin: 'Traditional Appalachian murder ballad, collected in North Carolina.',
    key: 'G',
    bpm: 92,
    difficulty: 1,
    why: 'Two chords, and they are the two most songs start with. It is the shortest distance between holding a chord and playing something people recognise.',
    sections: [
      {
        id: 'verse',
        name: 'Verse',
        bars: [...bars('G', 4), ...bars('D', 4), ...bars('D', 4), ...bars('G', 4)],
        parts: [
          STRUM,
          BOOM_CHUCK,
          {
            level: 'melody',
            how: 'The sung melody, picked. Play it slowly until the tune is obviously there, then bring it up.',
            notes: [
              { midi: 55, beat: 0, beats: 1 }, { midi: 55, beat: 1, beats: 0.5 },
              { midi: 57, beat: 1.5, beats: 0.5 }, { midi: 59, beat: 2, beats: 2 },
              { midi: 62, beat: 4, beats: 1 }, { midi: 59, beat: 5, beats: 1 },
              { midi: 57, beat: 6, beats: 2 },
            ],
          },
        ],
      },
    ],
  },

  {
    id: 'worried-man',
    title: 'Worried Man Blues',
    origin: 'Traditional, made famous by the Carter Family in 1930.',
    key: 'G',
    bpm: 100,
    difficulty: 1,
    why: 'Three chords in the order thousands of songs use them. Learn this shape of song once and you start hearing it coming in everything else.',
    sections: [
      {
        id: 'verse',
        name: 'Verse',
        bars: [...bars('G', 8), ...bars('C', 4), ...bars('G', 4), ...bars('D', 4), ...bars('G', 4)],
        parts: [
          STRUM,
          BOOM_CHUCK,
          {
            level: 'melody',
            how: 'The melody line. It sits almost entirely in the first three frets.',
            notes: [
              { midi: 55, beat: 0, beats: 0.5 }, { midi: 59, beat: 0.5, beats: 0.5 },
              { midi: 62, beat: 1, beats: 1 }, { midi: 59, beat: 2, beats: 1 },
              { midi: 62, beat: 3, beats: 1 }, { midi: 64, beat: 4, beats: 2 },
              { midi: 62, beat: 6, beats: 2 },
            ],
          },
        ],
      },
    ],
  },

  {
    id: 'will-the-circle',
    title: 'Will the Circle Be Unbroken',
    origin: 'Traditional hymn, 1907; the bluegrass standard after the Carter Family recorded it.',
    key: 'G',
    bpm: 96,
    difficulty: 1,
    why: 'Everybody at every jam knows this one. Learning it is how you get to play with other people rather than at them.',
    sections: [
      {
        id: 'chorus',
        name: 'Chorus',
        bars: [...bars('G', 4), ...bars('C', 2), ...bars('G', 2), ...bars('G', 2), ...bars('D', 2), ...bars('G', 4)],
        parts: [
          STRUM,
          BOOM_CHUCK,
          {
            level: 'melody',
            how: 'The chorus melody. Sing it while you play it and the timing sorts itself out.',
            notes: [
              { midi: 55, beat: 0, beats: 1 }, { midi: 59, beat: 1, beats: 1 },
              { midi: 62, beat: 2, beats: 1 }, { midi: 62, beat: 3, beats: 1 },
              { midi: 64, beat: 4, beats: 2 }, { midi: 62, beat: 6, beats: 1 },
              { midi: 59, beat: 7, beats: 1 },
            ],
          },
        ],
      },
    ],
  },

  {
    id: 'house-rising-sun',
    title: 'House of the Rising Sun',
    origin: 'Traditional folk ballad, printed in collections well before 1900.',
    key: 'Am',
    bpm: 76,
    difficulty: 2,
    why: 'The first song most people want and the first that sounds genuinely serious. It is in 6/8, so it also teaches a feel that is not four-square.',
    sections: [
      {
        id: 'verse',
        name: 'Verse',
        bars: ['Am', 'C', 'D', 'F', 'Am', 'C', 'E', 'E'],
        parts: [
          STRUM,
          {
            level: 'boom-chuck',
            how: 'Arpeggiate: lowest string, then the top three, one after another. Six notes a bar, evenly.',
          },
          {
            level: 'melody',
            how: 'The rolling arpeggio the record is famous for, written out.',
            notes: [
              { midi: 45, beat: 0, beats: 0.5 }, { midi: 52, beat: 0.5, beats: 0.5 },
              { midi: 57, beat: 1, beats: 0.5 }, { midi: 60, beat: 1.5, beats: 0.5 },
              { midi: 64, beat: 2, beats: 0.5 }, { midi: 60, beat: 2.5, beats: 0.5 },
              { midi: 48, beat: 3, beats: 0.5 }, { midi: 52, beat: 3.5, beats: 0.5 },
              { midi: 55, beat: 4, beats: 0.5 }, { midi: 60, beat: 4.5, beats: 0.5 },
              { midi: 64, beat: 5, beats: 1 },
            ],
          },
        ],
      },
    ],
  },

  {
    id: 'wildwood-flower',
    title: 'Wildwood Flower',
    origin: 'Traditional, 1860; the Carter Family recording made it the guitar tune it is now.',
    key: 'C',
    bpm: 104,
    difficulty: 2,
    why: 'The song that taught a century of guitarists to play melody and rhythm at once. If you learn one flatpicking tune, it is this.',
    sections: [
      {
        id: 'a',
        name: 'A part',
        bars: [...bars('C', 8), ...bars('G', 4), ...bars('C', 4)],
        parts: [
          STRUM,
          BOOM_CHUCK,
          {
            level: 'melody',
            how: 'The Carter-style melody, picked on the low strings while the chord rings above it.',
            notes: [
              { midi: 52, beat: 0, beats: 1 }, { midi: 55, beat: 1, beats: 0.5 },
              { midi: 57, beat: 1.5, beats: 0.5 }, { midi: 60, beat: 2, beats: 1 },
              { midi: 57, beat: 3, beats: 1 }, { midi: 55, beat: 4, beats: 1 },
              { midi: 52, beat: 5, beats: 1 }, { midi: 48, beat: 6, beats: 2 },
            ],
          },
        ],
      },
    ],
  },

  {
    id: 'nine-pound-hammer',
    title: 'Nine Pound Hammer',
    origin: 'Traditional work song out of the Appalachian coal fields.',
    key: 'G',
    bpm: 120,
    difficulty: 2,
    why: 'Fast, short, and every bluegrass jam calls it. It is where you find out whether your chord changes hold up at speed.',
    sections: [
      {
        id: 'chorus',
        name: 'Chorus',
        bars: [...bars('G', 4), ...bars('C', 4), ...bars('G', 4), ...bars('D', 2), ...bars('G', 2)],
        parts: [
          STRUM,
          BOOM_CHUCK,
          {
            level: 'melody',
            how: 'The melody with the bluegrass pickup that drags you into the first bar.',
            notes: [
              { midi: 59, beat: -0.5, beats: 0.5 }, { midi: 62, beat: 0, beats: 1 },
              { midi: 62, beat: 1, beats: 0.5 }, { midi: 64, beat: 1.5, beats: 0.5 },
              { midi: 62, beat: 2, beats: 1 }, { midi: 59, beat: 3, beats: 1 },
              { midi: 55, beat: 4, beats: 2 },
            ],
          },
        ],
      },
    ],
  },

  {
    id: 'cripple-creek',
    title: 'Cripple Creek',
    origin: 'Traditional old-time fiddle tune, played at every jam in America.',
    key: 'A',
    bpm: 128,
    difficulty: 3,
    why: 'The first proper fiddle tune most guitarists learn. The A part is a genuine lick — once it is under your fingers you will play it for the rest of your life.',
    sections: [
      {
        id: 'a',
        name: 'A part',
        bars: [...bars('A', 4), ...bars('D', 2), ...bars('A', 2), ...bars('A', 2), ...bars('E', 2), ...bars('A', 4)],
        parts: [
          STRUM,
          BOOM_CHUCK,
          {
            level: 'melody',
            how: 'The A part as it is actually played. Alternate your picking strictly — down, up, down, up — or it will never get up to speed.',
            notes: [
              { midi: 61, beat: 0, beats: 0.5 }, { midi: 64, beat: 0.5, beats: 0.5 },
              { midi: 66, beat: 1, beats: 0.5 }, { midi: 64, beat: 1.5, beats: 0.5 },
              { midi: 61, beat: 2, beats: 0.5 }, { midi: 57, beat: 2.5, beats: 0.5 },
              { midi: 59, beat: 3, beats: 0.5 }, { midi: 61, beat: 3.5, beats: 0.5 },
              { midi: 57, beat: 4, beats: 1 }, { midi: 61, beat: 5, beats: 0.5 },
              { midi: 64, beat: 5.5, beats: 0.5 }, { midi: 66, beat: 6, beats: 2 },
            ],
          },
        ],
      },
    ],
  },

  {
    id: 'old-joe-clark',
    title: 'Old Joe Clark',
    origin: 'Traditional old-time tune; the flat seventh in it is what gives it that sideways sound.',
    key: 'A',
    bpm: 124,
    difficulty: 3,
    why: 'It uses a G chord in the key of A, which should sound wrong and does not. That one note is a whole lesson in why modes exist.',
    sections: [
      {
        id: 'a',
        name: 'A part',
        bars: [...bars('A', 4), ...bars('A', 2), ...bars('G', 2), ...bars('A', 4), ...bars('G', 2), ...bars('A', 2)],
        parts: [
          STRUM,
          BOOM_CHUCK,
          {
            level: 'melody',
            how: 'The A part. Listen for the G natural — that is the note doing all the work.',
            notes: [
              { midi: 69, beat: 0, beats: 1 }, { midi: 69, beat: 1, beats: 0.5 },
              { midi: 67, beat: 1.5, beats: 0.5 }, { midi: 66, beat: 2, beats: 1 },
              { midi: 64, beat: 3, beats: 1 }, { midi: 61, beat: 4, beats: 0.5 },
              { midi: 64, beat: 4.5, beats: 0.5 }, { midi: 66, beat: 5, beats: 1 },
              { midi: 64, beat: 6, beats: 2 },
            ],
          },
        ],
      },
    ],
  },

  {
    id: 'down-in-the-valley',
    title: 'Down in the Valley',
    origin: 'Traditional American folk waltz, printed in collections by the 1910s.',
    key: 'G',
    bpm: 88,
    difficulty: 1,
    why: 'Two chords and three beats to a bar instead of four. It is the easiest way to find out that not every song counts to four.',
    sections: [
      {
        id: 'verse',
        name: 'Verse',
        bars: [...bars('G', 4), ...bars('D', 4), ...bars('D', 4), ...bars('G', 4)],
        parts: [
          STRUM,
          {
            level: 'boom-chuck',
            how: 'Bass note, strum, strum — three to a bar. Count one two three, one two three, and let the bass land on every one.',
          },
          {
            level: 'melody',
            how: 'The melody. It is a waltz, so let it lean rather than march.',
            notes: [
              { midi: 55, beat: 0, beats: 1 }, { midi: 59, beat: 1, beats: 1 },
              { midi: 62, beat: 2, beats: 1 }, { midi: 64, beat: 3, beats: 2 },
              { midi: 62, beat: 5, beats: 1 }, { midi: 59, beat: 6, beats: 2 },
            ],
          },
        ],
      },
    ],
  },

  {
    id: 'shady-grove',
    title: 'Shady Grove',
    origin: 'Traditional Appalachian tune, related to an older English ballad.',
    key: 'Am',
    bpm: 108,
    difficulty: 2,
    why: 'A minor tune that uses a G in it, which should sound wrong and is the whole reason it sounds old. Two chords, endless verses.',
    sections: [
      {
        id: 'verse',
        name: 'Verse',
        bars: [...bars('Am', 4), ...bars('G', 4), ...bars('Am', 4), ...bars('G', 2), ...bars('Am', 2)],
        parts: [
          STRUM,
          BOOM_CHUCK,
          {
            level: 'melody',
            how: 'The melody, mostly on the middle strings.',
            notes: [
              { midi: 57, beat: 0, beats: 0.5 }, { midi: 60, beat: 0.5, beats: 0.5 },
              { midi: 62, beat: 1, beats: 1 }, { midi: 64, beat: 2, beats: 1 },
              { midi: 62, beat: 3, beats: 0.5 }, { midi: 60, beat: 3.5, beats: 0.5 },
              { midi: 57, beat: 4, beats: 2 },
            ],
          },
        ],
      },
    ],
  },

  {
    id: 'banks-of-the-ohio',
    title: 'Banks of the Ohio',
    origin: 'Traditional American murder ballad, collected in the nineteenth century.',
    key: 'G',
    bpm: 96,
    difficulty: 2,
    why: 'Three chords in the plainest possible order. It is the song to practise chord changes on, because the changes arrive exactly where you expect them.',
    sections: [
      {
        id: 'verse',
        name: 'Verse',
        bars: [...bars('G', 4), ...bars('C', 4), ...bars('G', 4), ...bars('D', 2), ...bars('G', 2)],
        parts: [
          STRUM,
          BOOM_CHUCK,
          {
            level: 'melody',
            how: 'The melody sits low, around the open strings.',
            notes: [
              { midi: 50, beat: 0, beats: 0.5 }, { midi: 55, beat: 0.5, beats: 0.5 },
              { midi: 55, beat: 1, beats: 1 }, { midi: 59, beat: 2, beats: 1 },
              { midi: 57, beat: 3, beats: 1 }, { midi: 55, beat: 4, beats: 2 },
              { midi: 50, beat: 6, beats: 2 },
            ],
          },
        ],
      },
    ],
  },

  {
    id: 'angeline-the-baker',
    title: 'Angeline the Baker',
    origin: 'Traditional old-time tune, from a Stephen Foster song of 1850.',
    key: 'D',
    bpm: 116,
    difficulty: 2,
    why: 'A fiddle tune with only two chords, which makes it the easiest way into old-time playing. Every jam knows it.',
    sections: [
      {
        id: 'a',
        name: 'A part',
        bars: [...bars('D', 8), ...bars('G', 4), ...bars('D', 4)],
        parts: [
          STRUM,
          BOOM_CHUCK,
          {
            level: 'melody',
            how: 'The A part. Keep your picking strictly alternating or it will never come up to speed.',
            notes: [
              { midi: 62, beat: 0, beats: 0.5 }, { midi: 64, beat: 0.5, beats: 0.5 },
              { midi: 66, beat: 1, beats: 0.5 }, { midi: 64, beat: 1.5, beats: 0.5 },
              { midi: 62, beat: 2, beats: 0.5 }, { midi: 59, beat: 2.5, beats: 0.5 },
              { midi: 57, beat: 3, beats: 1 }, { midi: 62, beat: 4, beats: 2 },
            ],
          },
        ],
      },
    ],
  },

  {
    id: 'wayfaring-stranger',
    title: 'Wayfaring Stranger',
    origin: 'Traditional American spiritual, in print by the 1850s.',
    key: 'Am',
    bpm: 72,
    difficulty: 2,
    why: 'Slow, minor and completely serious. It is the one to play when you want the guitar to sound like it means something.',
    sections: [
      {
        id: 'verse',
        name: 'Verse',
        bars: [...bars('Am', 4), ...bars('Dm', 2), ...bars('Am', 2), ...bars('Am', 2), ...bars('E', 2), ...bars('Am', 4)],
        parts: [
          STRUM,
          BOOM_CHUCK,
          {
            level: 'melody',
            how: 'The melody. Let every note ring its full length — the space is the song.',
            notes: [
              { midi: 57, beat: 0, beats: 1 }, { midi: 60, beat: 1, beats: 1 },
              { midi: 62, beat: 2, beats: 2 }, { midi: 60, beat: 4, beats: 1 },
              { midi: 57, beat: 5, beats: 1 }, { midi: 55, beat: 6, beats: 2 },
            ],
          },
        ],
      },
    ],
  },

  {
    id: 'man-of-constant-sorrow',
    title: 'Man of Constant Sorrow',
    origin: 'Traditional, first published 1913; a bluegrass standard ever since.',
    key: 'G',
    bpm: 104,
    difficulty: 2,
    why: 'Three chords, a famous tune, and the exact changes that half of bluegrass uses. If you can play this you can sit in at a jam.',
    sections: [
      {
        id: 'verse',
        name: 'Verse',
        bars: [...bars('G', 4), ...bars('C', 2), ...bars('G', 2), ...bars('G', 2), ...bars('D', 2), ...bars('G', 4)],
        parts: [
          STRUM,
          BOOM_CHUCK,
          {
            level: 'melody',
            how: 'The melody, with the pickup that drags you into the first bar.',
            notes: [
              { midi: 55, beat: -0.5, beats: 0.5 }, { midi: 59, beat: 0, beats: 1 },
              { midi: 62, beat: 1, beats: 1 }, { midi: 64, beat: 2, beats: 1 },
              { midi: 62, beat: 3, beats: 1 }, { midi: 59, beat: 4, beats: 2 },
              { midi: 55, beat: 6, beats: 2 },
            ],
          },
        ],
      },
    ],
  },

];

export function songById(id: string): Song | null {
  return SONGS.find((song) => song.id === id) ?? null;
}

/**
 * Every distinct chord a song asks for.
 *
 * Derived from the bars rather than declared alongside them. A hand-written
 * list drifts: Wildwood Flower claimed an F it never actually plays, which
 * made the app hold the song back over a chord that was not in it.
 */
export function chordsIn(song: Song): string[] {
  const seen = new Set<string>();
  for (const section of song.sections) for (const bar of section.bars) seen.add(bar);
  return [...seen];
}
