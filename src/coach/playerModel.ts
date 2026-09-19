/**
 * Persistent player model.
 *
 * This is the part that makes Live Coach remember the musician instead of only
 * understanding the current phrase. It deliberately separates:
 *
 *   heard evidence   — pitch, intervals, tempo, timing, register, tonal centre
 *   physical evidence — a known Riff School target/zone the player attempted
 *
 * Audio alone cannot prove which duplicate fret/string produced a pitch, so
 * fretboard claims only come from exercises where the target route was known.
 */

import type { NoteEvent, PhraseAnalysis } from '../types.ts';
import { intervalsOf, pcToName } from '../music/notes.ts';
import { timingSteadiness } from '../music/rhythm.ts';

export const PLAYER_MODEL_KEY = 'guitar-ai-coach.player-model.v1';

export interface PhraseObservation {
  sourceId: string;
  at: number;
  noteCount: number;
  homePc: number;
  scaleLabel: string | null;
  scaleConfidence: number;
  bpm: number | null;
  timingSteadiness: number;
  lowMidi: number;
  highMidi: number;
  meanMidi: number;
  intervals: number[];
  resolution: 'up' | 'down' | 'static';
}

export interface PracticeObservation {
  at: number;
  source: 'riff-school' | 'my-riff' | 'live-coach';
  targetId: string;
  lessonId?: string;
  scaleId?: string;
  rootPc?: number;
  zoneIndex?: number;
  startFret?: number;
  noteCount: number;
  accuracy: number;
  tempoRatio: number;
  timingSteadiness: number;
  passed: boolean;
  firstMistakeIndex: number | null;
}

export type CreativeChoiceKind =
  | 'rhythm'
  | 'ending'
  | 'space'
  | 'register'
  | 'answer'
  | 'harmony'
  | 'song-seed';

export interface CreativeObservation {
  at: number;
  kind: CreativeChoiceKind;
  source: 'riff-school' | 'song-workshop' | 'live-coach';
}

export interface PlayerModelData {
  version: 1;
  phrases: PhraseObservation[];
  practices: PracticeObservation[];
  creative: CreativeObservation[];
}

export interface NumericTally {
  value: number;
  count: number;
  share: number;
  label: string;
}

export interface ZoneStat {
  zoneIndex: number;
  attempts: number;
  meanAccuracy: number;
  meanTempoError: number;
  passes: number;
  startFret: number | null;
}

export type TimingTendency = 'rush' | 'drag' | 'steady' | 'mixed' | 'unknown';

export interface PlayerProfile {
  phraseCount: number;
  practiceCount: number;
  creativeCount: number;
  hasEnoughPhraseEvidence: boolean;
  hasEnoughPracticeEvidence: boolean;
  tempo: {
    sampleCount: number;
    median: number | null;
    low: number | null;
    high: number | null;
  };
  timing: {
    meanSteadiness: number | null;
    rushShare: number;
    dragShare: number;
    tendency: TimingTendency;
  };
  register: {
    lowMidi: number | null;
    highMidi: number | null;
    meanMidi: number | null;
    span: number;
  };
  homes: NumericTally[];
  intervals: NumericTally[];
  zones: ZoneStat[];
  weakestZone: ZoneStat | null;
  strongestZone: ZoneStat | null;
  creative: Array<{ kind: CreativeChoiceKind; count: number; share: number }>;
}

export type AdaptiveTaskKind =
  | 'collect'
  | 'timing'
  | 'position'
  | 'interval'
  | 'register'
  | 'resolution'
  | 'development';

export interface AdaptiveTask {
  kind: AdaptiveTaskKind;
  title: string;
  reason: string;
  instruction: string;
  /** Riff School lesson to open when useful. */
  lessonId: string;
  /** Known weak physical zone, when the evidence supports one. */
  zoneIndex?: number;
  /** Tempo to practise against when the evidence supports one. */
  bpm?: number;
  confidence: number;
}

export interface PlayerModelStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const EMPTY: PlayerModelData = { version: 1, phrases: [], practices: [], creative: [] };
const MAX_PHRASES = 300;
const MAX_PRACTICES = 400;
const MAX_CREATIVE = 200;

function finite(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, finite(value)));
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  if (ordered.length % 2) return ordered[middle]!;
  return (ordered[middle - 1]! + ordered[middle]!) / 2;
}

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(ordered.length - 1, Math.round((ordered.length - 1) * p)));
  return ordered[index]!;
}

function intervalLabel(semitones: number): string {
  const abs = Math.abs(semitones);
  const names: Record<number, string> = {
    0: 'same note',
    1: 'half-step',
    2: 'whole-step',
    3: 'minor-third',
    4: 'major-third',
    5: 'fourth',
    6: 'tritone',
    7: 'fifth',
    8: 'minor-sixth',
    9: 'major-sixth',
    10: 'minor-seventh',
    11: 'major-seventh',
    12: 'octave',
  };
  const base = names[Math.min(12, abs)] ?? `${abs}-semitone move`;
  if (semitones > 0) return `${base} up`;
  if (semitones < 0) return `${base} down`;
  return base;
}

export function phraseObservation(
  sourceId: string,
  analysis: PhraseAnalysis,
  at = Date.now(),
): PhraseObservation {
  const notes = analysis.phrase.notes;
  const midis = notes.map((note) => note.midi);
  const intervals = intervalsOf(midis)
    .filter((interval) => Number.isFinite(interval))
    .map((interval) => Math.max(-12, Math.min(12, Math.round(interval))));

  const first = midis[0] ?? analysis.homePc;
  const last = midis[midis.length - 1] ?? first;
  const delta = last - first;

  return {
    sourceId,
    at,
    noteCount: notes.length,
    homePc: analysis.homePc,
    scaleLabel: analysis.scale.confidence >= .45 ? analysis.scale.label : null,
    scaleConfidence: clamp01(analysis.scale.confidence),
    bpm: analysis.rhythm.confidence >= .42 && analysis.rhythm.bpm > 0
      ? Math.round(analysis.rhythm.bpm)
      : null,
    timingSteadiness: clamp01(analysis.quality.timingSteadiness),
    lowMidi: midis.length ? Math.min(...midis) : 0,
    highMidi: midis.length ? Math.max(...midis) : 0,
    meanMidi: midis.length ? midis.reduce((a, b) => a + b, 0) / midis.length : 0,
    intervals,
    resolution: delta >= 3 ? 'up' : delta <= -3 ? 'down' : 'static',
  };
}

export function practiceObservation(input: {
  source: PracticeObservation['source'];
  targetId: string;
  lessonId?: string;
  scaleId?: string;
  rootPc?: number;
  zoneIndex?: number;
  startFret?: number;
  reference: NoteEvent[];
  attempt: NoteEvent[];
  accuracy: number;
  tempoRatio: number;
  passed: boolean;
  firstMistakeIndex: number | null;
  at?: number;
}): PracticeObservation {
  return {
    at: input.at ?? Date.now(),
    source: input.source,
    targetId: input.targetId,
    ...(input.lessonId ? { lessonId: input.lessonId } : {}),
    ...(input.scaleId ? { scaleId: input.scaleId } : {}),
    ...(typeof input.rootPc === 'number' ? { rootPc: input.rootPc } : {}),
    ...(typeof input.zoneIndex === 'number' ? { zoneIndex: input.zoneIndex } : {}),
    ...(typeof input.startFret === 'number' ? { startFret: input.startFret } : {}),
    noteCount: input.reference.length,
    accuracy: clamp01(input.accuracy),
    tempoRatio: Math.max(.25, Math.min(4, finite(input.tempoRatio, 1))),
    timingSteadiness: clamp01(timingSteadiness(input.attempt)),
    passed: input.passed,
    firstMistakeIndex: input.firstMistakeIndex,
  };
}

export class PlayerModelStore {
  private readonly storage: PlayerModelStorage;
  private readonly key: string;

  constructor(storage: PlayerModelStorage, key = PLAYER_MODEL_KEY) {
    this.storage = storage;
    this.key = key;
  }

  load(): PlayerModelData {
    const raw = this.storage.getItem(this.key);
    if (!raw) return { ...EMPTY, phrases: [], practices: [], creative: [] };
    try {
      const parsed = JSON.parse(raw) as Partial<PlayerModelData>;
      return {
        version: 1,
        phrases: Array.isArray(parsed.phrases) ? parsed.phrases.slice(-MAX_PHRASES) : [],
        practices: Array.isArray(parsed.practices) ? parsed.practices.slice(-MAX_PRACTICES) : [],
        creative: Array.isArray(parsed.creative) ? parsed.creative.slice(-MAX_CREATIVE) : [],
      };
    } catch {
      return { ...EMPTY, phrases: [], practices: [], creative: [] };
    }
  }

  private save(data: PlayerModelData): PlayerModelData {
    try {
      this.storage.setItem(this.key, JSON.stringify(data));
    } catch {
      // The app still works if persistence is unavailable.
    }
    return data;
  }

  recordPhrase(observation: PhraseObservation): PlayerModelData {
    const data = this.load();
    if (data.phrases.some((item) => item.sourceId === observation.sourceId)) return data;
    data.phrases = [...data.phrases, observation].slice(-MAX_PHRASES);
    return this.save(data);
  }

  recordPractice(observation: PracticeObservation): PlayerModelData {
    const data = this.load();
    data.practices = [...data.practices, observation].slice(-MAX_PRACTICES);
    return this.save(data);
  }

  recordCreative(kind: CreativeChoiceKind, source: CreativeObservation['source'], at = Date.now()): PlayerModelData {
    const data = this.load();
    data.creative = [...data.creative, { at, kind, source }].slice(-MAX_CREATIVE);
    return this.save(data);
  }
}

function tallyNumbers(values: number[], label: (value: number) => string): NumericTally[] {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const total = Math.max(1, values.length);
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count, share: count / total, label: label(value) }))
    .sort((a, b) => b.count - a.count || a.value - b.value);
}

function profileZones(practices: PracticeObservation[]): ZoneStat[] {
  const groups = new Map<number, PracticeObservation[]>();
  for (const practice of practices) {
    if (practice.zoneIndex === undefined) continue;
    const list = groups.get(practice.zoneIndex) ?? [];
    list.push(practice);
    groups.set(practice.zoneIndex, list);
  }

  return [...groups.entries()].map(([zoneIndex, rows]) => ({
    zoneIndex,
    attempts: rows.length,
    meanAccuracy: rows.reduce((sum, row) => sum + row.accuracy, 0) / rows.length,
    meanTempoError: rows.reduce((sum, row) => sum + Math.abs(row.tempoRatio - 1), 0) / rows.length,
    passes: rows.filter((row) => row.passed).length,
    startFret: median(rows.flatMap((row) => typeof row.startFret === 'number' ? [row.startFret] : [])),
  })).sort((a, b) => a.zoneIndex - b.zoneIndex);
}

export function buildPlayerProfile(data: PlayerModelData): PlayerProfile {
  const usablePhrases = data.phrases.filter((phrase) => phrase.noteCount >= 3);
  const bpm = usablePhrases.flatMap((phrase) => phrase.bpm ? [phrase.bpm] : []);
  const intervalValues = usablePhrases.flatMap((phrase) => phrase.intervals).filter((interval) => interval !== 0);
  const homes = tallyNumbers(usablePhrases.map((phrase) => phrase.homePc), pcToName);
  const intervals = tallyNumbers(intervalValues, intervalLabel);

  const registerValues = usablePhrases.filter((phrase) => phrase.highMidi > 0);
  const lowMidi = registerValues.length ? Math.min(...registerValues.map((phrase) => phrase.lowMidi)) : null;
  const highMidi = registerValues.length ? Math.max(...registerValues.map((phrase) => phrase.highMidi)) : null;
  const meanMidi = registerValues.length
    ? registerValues.reduce((sum, phrase) => sum + phrase.meanMidi, 0) / registerValues.length
    : null;

  const practiceTiming = data.practices.filter((row) => row.noteCount >= 3);
  const rushing = practiceTiming.filter((row) => row.tempoRatio > 1.06).length;
  const dragging = practiceTiming.filter((row) => row.tempoRatio < .94).length;
  const timedTotal = Math.max(1, practiceTiming.length);
  const rushShare = rushing / timedTotal;
  const dragShare = dragging / timedTotal;

  let tendency: TimingTendency = 'unknown';
  if (practiceTiming.length >= 3) {
    if (rushShare >= .45 && rushShare > dragShare * 1.4) tendency = 'rush';
    else if (dragShare >= .45 && dragShare > rushShare * 1.4) tendency = 'drag';
    else if (rushShare <= .2 && dragShare <= .2) tendency = 'steady';
    else tendency = 'mixed';
  }

  const steadiness = [
    ...usablePhrases.map((phrase) => phrase.timingSteadiness),
    ...practiceTiming.map((practice) => practice.timingSteadiness),
  ];

  const zones = profileZones(data.practices);
  const eligibleZones = zones.filter((zone) => zone.attempts >= 2);
  const weakestZone = eligibleZones.length
    ? [...eligibleZones].sort((a, b) =>
      a.meanAccuracy - b.meanAccuracy || b.meanTempoError - a.meanTempoError)[0]!
    : null;
  const strongestZone = eligibleZones.length
    ? [...eligibleZones].sort((a, b) =>
      b.meanAccuracy - a.meanAccuracy || a.meanTempoError - b.meanTempoError)[0]!
    : null;

  const creativeCounts = new Map<CreativeChoiceKind, number>();
  for (const event of data.creative) creativeCounts.set(event.kind, (creativeCounts.get(event.kind) ?? 0) + 1);
  const creativeTotal = Math.max(1, data.creative.length);
  const creative = [...creativeCounts.entries()]
    .map(([kind, count]) => ({ kind, count, share: count / creativeTotal }))
    .sort((a, b) => b.count - a.count);

  return {
    phraseCount: usablePhrases.length,
    practiceCount: data.practices.length,
    creativeCount: data.creative.length,
    hasEnoughPhraseEvidence: usablePhrases.length >= 5,
    hasEnoughPracticeEvidence: data.practices.length >= 3,
    tempo: {
      sampleCount: bpm.length,
      median: median(bpm),
      low: percentile(bpm, .2),
      high: percentile(bpm, .8),
    },
    timing: {
      meanSteadiness: steadiness.length
        ? steadiness.reduce((a, b) => a + b, 0) / steadiness.length
        : null,
      rushShare,
      dragShare,
      tendency,
    },
    register: {
      lowMidi,
      highMidi,
      meanMidi,
      span: lowMidi === null || highMidi === null ? 0 : highMidi - lowMidi,
    },
    homes,
    intervals,
    zones,
    weakestZone,
    strongestZone,
    creative,
  };
}

export function recommendAdaptiveTask(profile: PlayerProfile): AdaptiveTask {
  if (!profile.hasEnoughPhraseEvidence && !profile.hasEnoughPracticeEvidence) {
    return {
      kind: 'collect',
      title: 'Give me two versions of the same idea',
      reason: 'I need a little more of your actual playing before I should pretend to know your habits.',
      instruction: 'Learn one short Riff School phrase in the first zone, then move that exact idea one zone higher. I can compare those attempts honestly because I know the target route.',
      lessonId: 'motif-repeat',
      zoneIndex: 0,
      confidence: .45,
    };
  }

  if (profile.hasEnoughPracticeEvidence && profile.timing.tendency === 'rush') {
    const bpm = profile.tempo.median ? Math.max(50, Math.round(profile.tempo.median * .82)) : 72;
    return {
      kind: 'timing',
      title: 'Keep the idea. Stop outrunning it.',
      reason: `${Math.round(profile.timing.rushShare * 100)}% of your measured riff attempts have landed noticeably faster than the target.`,
      instruction: `Use the same notes at about ${bpm} BPM. Make the gaps feel boringly even before you let the speed come back.`,
      lessonId: 'push',
      bpm,
      confidence: Math.min(.96, .55 + profile.practiceCount * .025),
    };
  }

  if (profile.hasEnoughPracticeEvidence && profile.timing.tendency === 'drag') {
    const bpm = profile.tempo.median ? Math.max(50, Math.round(profile.tempo.median * .9)) : 68;
    return {
      kind: 'timing',
      title: 'Land on the beat instead of behind it.',
      reason: `${Math.round(profile.timing.dragShare * 100)}% of your measured riff attempts have fallen noticeably slower than the target.`,
      instruction: `Keep the phrase small and play against ${bpm} BPM. Think about arriving with the click, not reacting after it.`,
      lessonId: 'motif-repeat',
      bpm,
      confidence: Math.min(.96, .55 + profile.practiceCount * .025),
    };
  }

  const weak = profile.weakestZone;
  const strong = profile.strongestZone;
  if (
    weak && strong &&
    weak.zoneIndex !== strong.zoneIndex &&
    weak.meanAccuracy + .12 < strong.meanAccuracy
  ) {
    return {
      kind: 'position',
      title: `Your idea gets less reliable in Zone ${weak.zoneIndex + 1}.`,
      reason: `You average ${Math.round(weak.meanAccuracy * 100)}% there versus ${Math.round(strong.meanAccuracy * 100)}% in Zone ${strong.zoneIndex + 1}.`,
      instruction: 'Do not learn a new lick. Take one phrase you already know and move it into the weaker zone until the sound survives the hand shift.',
      lessonId: 'home-neighbor',
      zoneIndex: weak.zoneIndex,
      confidence: Math.min(.95, .58 + weak.attempts * .05),
    };
  }

  const topInterval = profile.intervals[0];
  if (profile.hasEnoughPhraseEvidence && topInterval && topInterval.share >= .38) {
    return {
      kind: 'interval',
      title: `You lean hard on the ${topInterval.label}.`,
      reason: `${Math.round(topInterval.share * 100)}% of the melodic moves I have heard are that same interval.`,
      instruction: 'Keep your rhythm and home note, but force one wider skip into the middle. You are not fixing a bad habit — you are learning how contrast changes your voice.',
      lessonId: 'skip',
      confidence: Math.min(.92, .55 + profile.phraseCount * .025),
    };
  }

  if (profile.hasEnoughPhraseEvidence && profile.register.span > 0 && profile.register.span < 12) {
    return {
      kind: 'register',
      title: 'Your melodies are living inside about one octave.',
      reason: `The phrases I have heard span roughly ${Math.round(profile.register.span)} semitones from lowest to highest.`,
      instruction: 'Repeat a small motif, then lift only the second half into the next register. Keep the rhythm recognizable so your ear hears development instead of a new riff.',
      lessonId: 'sequence',
      confidence: Math.min(.9, .52 + profile.phraseCount * .02),
    };
  }

  const topHome = profile.homes[0];
  if (profile.hasEnoughPhraseEvidence && topHome && topHome.share >= .5) {
    return {
      kind: 'resolution',
      title: `You come home to ${topHome.label} a lot.`,
      reason: `${Math.round(topHome.share * 100)}% of your recent phrases treat ${topHome.label} like the center.`,
      instruction: 'Keep the same general phrase but delay that home note until the very end. Listen to how postponing the answer creates tension.',
      lessonId: 'delay-home',
      confidence: Math.min(.9, .5 + profile.phraseCount * .02),
    };
  }

  return {
    kind: 'development',
    title: 'Develop one idea instead of collecting another.',
    reason: 'Your playing is varied enough that no single technical weakness is dominating the evidence.',
    instruction: 'Take a motif you like, repeat it once, then change only the rhythm or the ending. Keep enough identity that you can still sing the original through the variation.',
    lessonId: 'motif-repeat',
    confidence: .7,
  };
}
