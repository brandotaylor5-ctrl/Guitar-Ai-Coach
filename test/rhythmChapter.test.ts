import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  RHYTHM_CHAPTER, BARRE_RECOVERY, RHYTHM_STORAGE_KEY,
  chapterCounts, parseChapterProgress, recordEvidence, recommendRhythmLesson, rhythmEvents,
  RHYTHM_ENTRY, RHYTHM_ENTRY_KEY, parseRhythmEntry, recommendRhythmFromEntry,
} from '../src/curriculum/rhythmChapter.ts';

describe('first complete academy chapter', () => {
  test('has eight distinct authored lessons with playable, explicit checks', () => {
    assert.equal(RHYTHM_CHAPTER.length, 8);
    assert.equal(new Set(RHYTHM_CHAPTER.map(l => l.id)).size, 8);
    for (const lesson of RHYTHM_CHAPTER) {
      assert.ok(lesson.teach.length >= 3, lesson.id);
      assert.ok(lesson.why.length > 30, lesson.id);
      assert.ok(lesson.practice.length > 20, lesson.id);
      assert.ok(lesson.simplify.length > 25, lesson.id);
      assert.ok(lesson.apply.length > 25, lesson.id);
      assert.ok(lesson.check.correct >= 0 && lesson.check.correct < 3, lesson.id);
      assert.ok(lesson.check.options.every(option => option.length > 10), lesson.id);
      assert.equal(lesson.pattern.length, 8);
      assert.ok(lesson.pattern.every(step => ['D','U','.'].includes(step)), lesson.id);
      assert.ok(lesson.accents.every(i => i >= 0 && i < 8), lesson.id);
      assert.ok(lesson.chords.length > 0, lesson.id);
      assert.ok(lesson.bpm >= 45 && lesson.bpm <= 100, lesson.id);
    }
  });

  test('concept checks, physical attempts and independent reports are separate', () => {
    const now = 1800000000000;
    let progress = recordEvidence({}, 'steady', 'concept-check', now);
    assert.equal(chapterCounts(progress).understood, 1);
    assert.equal(chapterCounts(progress).practiced, 0);
    progress = recordEvidence(progress, 'steady', 'independent', now);
    assert.equal(chapterCounts(progress).independentClaims, 0, 'a button cannot certify playing with no attempt');
    progress = recordEvidence(progress, 'steady', 'practiced', now + 1);
    assert.equal(chapterCounts(progress).practiced, 1);
    assert.equal(chapterCounts(progress).independentClaims, 0, 'one practice is not automatic mastery');
    progress = recordEvidence(progress, 'steady', 'independent', now + 2);
    assert.equal(chapterCounts(progress).independentClaims, 1, 'explicit self-report can be retained');
    assert.equal(progress.steady?.selfReportedIndependentAt, now + 2);
    progress = recordEvidence(progress, 'steady', 'needs-work', now + 3);
    assert.equal(chapterCounts(progress).independentClaims, 0, 'a fresh difficulty can reopen practice');
    assert.equal(chapterCounts(progress).needsWork, 1);
    assert.equal(progress.steady?.practiceAttempts, 1);
  });

  test('being stuck on one exercise does not block the next concept', () => {
    const at = 1800000000000;
    let progress = recordEvidence({}, 'steady', 'concept-check', at);
    progress = recordEvidence(progress, 'steady', 'practiced', at);
    progress = recordEvidence(progress, 'steady', 'needs-work', at);
    assert.equal(recommendRhythmLesson(progress).id, 'eighths');
    assert.equal(progress.steady?.needsWork, true);
  });

  test('the suggested lesson is the first unattempted one, not a fictitious mastered score', () => {
    let progress = {};
    const at = 1800000000000;
    assert.equal(recommendRhythmLesson(progress).id, 'steady');
    for (let i = 0; i < RHYTHM_CHAPTER.length - 1; i++) {
      const lesson = RHYTHM_CHAPTER[i]!;
      progress = recordEvidence(progress, lesson.id, 'concept-check', at);
      progress = recordEvidence(progress, lesson.id, 'practiced', at);
    }
    assert.equal(recommendRhythmLesson(progress).id, 'transfer');
  });

  test('corrupt or foreign browser progress is ignored rather than promoted to proof', () => {
    assert.deepEqual(parseChapterProgress('{oops'), {});
    assert.deepEqual(parseChapterProgress('[]'), {});
    assert.deepEqual(parseChapterProgress('null'), {});
    const data = parseChapterProgress(JSON.stringify({
      unknown: { conceptCheckedAt: 3, practiceAttempts: 100 },
      steady: { conceptCheckedAt: 'now', practiceAttempts: -99, selfReportedIndependentAt: true, needsWork: 'yes' },
      eighths: { conceptCheckedAt: 1800000000000, practiceAttempts: 1, needsWork: true },
    }));
    assert.equal(Object.keys(data).length, 2);
    assert.equal(data.steady?.practiceAttempts, 0);
    assert.equal(data.steady?.conceptCheckedAt, undefined);
    assert.equal(data.steady?.selfReportedIndependentAt, undefined);
    assert.equal(data.steady?.needsWork, false);
    assert.equal(data.eighths?.conceptCheckedAt, 1800000000000);
    assert.equal(data.eighths?.needsWork, true);
    const impossible = parseChapterProgress(JSON.stringify({
      steady: { practiceAttempts: 0, selfReportedIndependentAt: 1800000000000 },
      eighths: { practiceAttempts: 2, needsWork: true, selfReportedIndependentAt: 1800000000000 },
    }));
    assert.equal(impossible.steady?.selfReportedIndependentAt, undefined);
    assert.equal(impossible.eighths?.selfReportedIndependentAt, undefined);
    assert.ok(RHYTHM_STORAGE_KEY.includes('.v1'));
  });

  test('audible demonstrations follow the authored eight-subdivision pattern', () => {
    const lesson = RHYTHM_CHAPTER.find(l => l.id === 'pattern')!;
    const notes = (_: string) => [40, 47, 52];
    const full = rhythmEvents(lesson, notes);
    const simple = rhythmEvents(lesson, notes, true);
    assert.equal(full.length, 4 + 4 * 6 * 3, 'four count-in clicks plus four bars of six strokes');
    assert.equal(simple.length, 4 + 4 * 3, 'simplest version is four clicks plus one stroke per bar');
    assert.equal(simple[0]?.startMs, 0);
    const beat = 60000 / lesson.bpm;
    assert.ok(full.slice(0, 4).every((n, i) => Math.abs(n.startMs - i * beat) < 0.001));
    assert.ok(full.slice(4).every(n => n.startMs >= 4 * beat), 'chords begin after the count-in');
    assert.ok(full.some(n => n.startMs >= 4 * beat + 3 * 4 * beat), 'full fourth bar is played');
    assert.ok(full.every(event => event.startMs >= 0 && event.durationMs > 0));
    assert.equal(rhythmEvents(lesson, () => [] ).length, 4, 'count-in still sounds when chord fingering unavailable');
  });

  test('guitar experience chooses a suitable starting point, never awards passing credits', () => {
    assert.deepEqual(Object.keys(RHYTHM_ENTRY), ['new', 'chords', 'switches', 'songs']);
    assert.equal(parseRhythmEntry('veteran'), null);
    assert.equal(parseRhythmEntry('songs'), 'songs');
    assert.ok(RHYTHM_ENTRY_KEY.includes('.v1'));
    for (const [entry, start] of [
      ['new', 'steady'], ['chords', 'pattern'], ['switches', 'changes'], ['songs', 'syncopation'],
    ] as const) {
      assert.equal(recommendRhythmFromEntry({}, entry).id, start);
      assert.ok(RHYTHM_ENTRY[entry].detail.length > 25);
    }
    const progress = recordEvidence({}, 'steady', 'needs-work', 1800000000000);
    assert.equal(recommendRhythmFromEntry(progress, 'songs').id, 'syncopation', 'stuck on pulse does not gate the rest');
    assert.equal(progress.steady?.conceptCheckedAt, undefined, 'placement does not produce mastery evidence');
  });

  test('first beginner rhythm lesson requires no G fingering to practice', () => {
    const first = RHYTHM_CHAPTER[0]!;
    assert.equal(first.id, 'steady');
    assert.match(first.practice, /Tap or brush muted strings/);
    assert.match(first.teach.join(' '), /Without forming a chord/);
    assert.match(first.hear, /four complete bars/);
  });

  test('barre help has targeted alternative exercises and no mastery unlock', () => {
    assert.deepEqual(Object.keys(BARRE_RECOVERY).sort(), ['rhythm','shape','transition','whole']);
    for (const item of Object.values(BARRE_RECOVERY)) {
      assert.ok(item.steps.length >= 3);
      assert.ok(item.target.length > 20);
    }
    assert.ok(!RHYTHM_CHAPTER.some(l => l.chords.includes('C#m')), 'the barre progression cannot gate the rhythm chapter');
  });
});
