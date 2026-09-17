import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { SKILLS, getSkill, prerequisitesOf } from '../src/curriculum/skills.ts';
import { MASTERED, WORKABLE, masteryMap, levelOf } from '../src/curriculum/mastery.ts';
import type { Observation } from '../src/curriculum/mastery.ts';
import { describeProgress, planLessons, progressOf } from '../src/curriculum/plan.ts';
import { buildExercise, gradeChangeDrill, gradeHoldChord, gradeProgression, observationFrom } from '../src/curriculum/exercise.ts';
import { CurriculumStore, observeFreePlay } from '../src/curriculum/watch.ts';

const DAY = 86_400_000;
const NOW = 1_700_000_000_000;

/** Enough good drills to actually master something. */
function drills(skillId: string, quality: number, count = 8, at = NOW): Observation[] {
  return Array.from({ length: count }, (_, i) => ({
    skillId, quality, at: at - (count - i) * 60_000, source: 'drill' as const,
  }));
}

describe('the skill graph', () => {
  test('every prerequisite names a skill that exists', () => {
    for (const skill of SKILLS) {
      for (const required of skill.requires) {
        assert.ok(getSkill(required), `${skill.id} requires missing ${required}`);
      }
    }
  });

  test('nothing depends on itself, however indirectly', () => {
    for (const skill of SKILLS) {
      assert.ok(!prerequisitesOf(skill.id).includes(skill.id), `${skill.id} is circular`);
    }
  });

  test('every skill says what it is for and why it is worth doing', () => {
    for (const skill of SKILLS) {
      assert.ok(skill.goal.length > 15, `${skill.id} has no real goal`);
      assert.ok(skill.why.length > 25, `${skill.id} does not say why it matters`);
    }
  });

  test('there is somewhere to start', () => {
    assert.ok(SKILLS.some((s) => s.requires.length === 0));
  });
});

describe('working out what the player can do', () => {
  test('one good attempt is not mastery', () => {
    const mastery = masteryMap(drills('chord.Em', 1, 1), NOW);
    assert.ok(levelOf(mastery, 'chord.Em') < MASTERED);
  });

  test('a run of good attempts is', () => {
    const mastery = masteryMap(drills('chord.Em', 1, 10), NOW);
    assert.ok(levelOf(mastery, 'chord.Em') >= MASTERED);
  });

  test('one bad take does not undo a skill', () => {
    const good = drills('chord.Em', 1, 10);
    const withSlip = [...good, { skillId: 'chord.Em', quality: 0.1, at: NOW, source: 'drill' as const }];
    assert.ok(levelOf(masteryMap(withSlip, NOW), 'chord.Em') >= WORKABLE);
  });

  test('a skill left alone for months fades', () => {
    const mastery = masteryMap(drills('chord.Em', 1, 10, NOW - 120 * DAY), NOW);
    assert.ok(levelOf(mastery, 'chord.Em') < MASTERED, 'a chord last played in March is not a chord you have');
  });

  test('playing in passing counts for less than a drill', () => {
    const passive = masteryMap(
      drills('chord.Em', 1, 8).map((o) => ({ ...o, source: 'freeplay' as const })), NOW,
    );
    const drilled = masteryMap(drills('chord.Em', 1, 8), NOW);
    assert.ok(levelOf(passive, 'chord.Em') < levelOf(drilled, 'chord.Em'));
  });
});

describe('deciding what to work on', () => {
  test('starts at the beginning when it has heard nothing', () => {
    const lessons = planLessons(new Map(), { now: NOW });
    assert.ok(lessons.length > 0);
    assert.equal(lessons[0]!.skill.requires.length, 0);
    assert.equal(lessons[0]!.reason, 'foundation');
  });

  test('never offers something the player is not ready for', () => {
    const lessons = planLessons(new Map(), { now: NOW, count: 20 });
    for (const lesson of lessons) assert.equal(lesson.skill.requires.length, 0);
  });

  test('skips what they can already do', () => {
    const mastery = masteryMap(drills('chord.Em', 1, 10), NOW);
    const offered = planLessons(mastery, { now: NOW, count: 20 }).map((l) => l.skill.id);
    assert.ok(!offered.includes('chord.Em'), 'nobody should be made to redo a chord they have');
  });

  test('opens up what the mastered skill unlocked', () => {
    const mastery = masteryMap(drills('chord.Em', 1, 10), NOW);
    const offered = planLessons(mastery, { now: NOW, count: 20 }).map((l) => l.skill.id);
    assert.ok(offered.includes('chord.Am'), 'A minor only needed E minor');
  });

  test('finishing something started beats starting something new', () => {
    const mastery = masteryMap([
      ...drills('chord.Em', 1, 10),
      ...drills('chord.Am', 0.5, 4),
    ], NOW);
    const lessons = planLessons(mastery, { now: NOW });
    assert.equal(lessons[0]!.skill.id, 'chord.Am');
    assert.equal(lessons[0]!.reason, 'needs-work');
  });

  test('brings back something that is going stale', () => {
    const mastery = masteryMap(drills('chord.Em', 0.8, 8, NOW - 12 * DAY), NOW);
    const review = planLessons(mastery, { now: NOW, count: 20 }).find((l) => l.skill.id === 'chord.Em');
    assert.ok(review, 'a fading skill should come back round');
    assert.equal(review.reason, 'review');
    assert.match(review.because, /days ago/);
  });

  test('says where they are without scoring them', () => {
    assert.match(describeProgress(new Map()), /have not heard you play/i);
    const some = masteryMap(drills('chord.Em', 1, 10), NOW);
    const text = describeProgress(some);
    assert.ok(!/%/.test(text), 'a percentage tells a beginner nothing useful');
    assert.equal(progressOf(some).mastered, 1);
  });
});

describe('drills and how they are judged', () => {
  const change = buildExercise(getSkill('change.Em-Am')!);

  /** A drill attempt alternating two chords at a given rate. */
  function alternating(labels: string[], perMinute: number, seconds: number): Array<{ label: string; at: number }> {
    const gap = 60_000 / perMinute;
    const out: Array<{ label: string; at: number }> = [];
    for (let i = 0; i * gap < seconds * 1000; i++) {
      out.push({ label: labels[i % labels.length]!, at: NOW + i * gap });
    }
    return out;
  }

  test('a change drill is counted in changes per minute', () => {
    const grade = gradeChangeDrill(change, alternating(['Em', 'Am'], 60, 60), 60_000);
    assert.equal(grade.changesPerMinute, 59);
    assert.ok(grade.quality > 0.9);
    assert.match(grade.feedback.join(' '), /fluent/i);
  });

  test('a slow attempt is told what to change, not just that it was slow', () => {
    const grade = gradeChangeDrill(change, alternating(['Em', 'Am'], 20, 60), 60_000);
    assert.ok(!grade.passed);
    assert.match(grade.feedback.join(' '), /as one shape/i);
  });

  test('landing on a wrong chord on the way is noticed', () => {
    const messy = alternating(['Em', 'C', 'Am', 'C'], 60, 60);
    assert.match(gradeChangeDrill(change, messy, 60_000).feedback.join(' '), /landed on something else/i);
  });

  test('hearing almost nothing is not scored as failure', () => {
    const grade = gradeChangeDrill(change, [{ label: 'Em', at: NOW }], 60_000);
    assert.match(grade.feedback.join(' '), /closer|harder/i);
  });

  test('a progression is graded on landing in the right bar', () => {
    const exercise = buildExercise(getSkill('prog.Em-C-G-D')!, 60);
    const barMs = 4 * (60_000 / 60);
    const played = ['Em', 'C', 'G', 'D', 'Em', 'C', 'G', 'D']
      .map((label, i) => ({ label, at: NOW + i * barMs + 120 }));
    const grade = gradeProgression(exercise, played, NOW);
    assert.ok(grade.passed, grade.feedback.join(' '));
    assert.match(grade.feedback.join(' '), /kept your place/i);
  });

  test('one missed bar does not throw off every bar after it', () => {
    const exercise = buildExercise(getSkill('prog.Em-C-G-D')!, 60);
    const barMs = 4 * (60_000 / 60);
    const played = ['Em', 'C', 'G', 'D', 'Em', 'C', 'G', 'D']
      .map((label, i) => ({ label, at: NOW + i * barMs + 120 }))
      .filter((_, i) => i !== 2);
    const grade = gradeProgression(exercise, played, NOW);
    assert.ok(grade.quality >= 0.7, `one slip should not fail the attempt: ${grade.quality}`);
    assert.match(grade.feedback.join(' '), /\bG\b/);
  });

  test('every skill produces an exercise that says what to do', () => {
    for (const skill of SKILLS) {
      const exercise = buildExercise(skill);
      assert.ok(exercise.instructions.length > 30, `${skill.id} has no real instructions`);
      assert.ok(exercise.target.length > 5, `${skill.id} has no target`);
      assert.ok(exercise.durationMs > 0 && exercise.bpm > 0);
    }
  });

  test('a graded attempt feeds straight back into what the app knows', () => {
    const grade = gradeChangeDrill(change, alternating(['Em', 'Am'], 60, 60), 60_000);
    const observation = observationFrom(change, grade, NOW);
    assert.equal(observation.skillId, 'change.Em-Am');
    assert.equal(observation.source, 'drill');
    assert.equal(observation.changesPerMinute, 59);
  });
});

describe('learning from ordinary playing', () => {
  test('notices the chords someone plays without being asked', () => {
    const heard = [
      { label: 'Em', confidence: 0.9, at: NOW },
      { label: 'Am', confidence: 0.88, at: NOW + 2000 },
    ];
    const ids = observeFreePlay(heard, NOW).map((o) => o.skillId);
    assert.ok(ids.includes('chord.Em'));
    assert.ok(ids.includes('chord.Am'));
  });

  test('a guess is not evidence', () => {
    const heard = [{ label: 'Em', confidence: 0.4, at: NOW }, { label: 'Am', confidence: 0.3, at: NOW + 1000 }];
    assert.deepEqual(observeFreePlay(heard, NOW), []);
  });

  test('credits a change only once it is clearly habitual', () => {
    const twice = [
      { label: 'Em', confidence: 0.9, at: NOW },
      { label: 'Am', confidence: 0.9, at: NOW + 1000 },
      { label: 'Em', confidence: 0.9, at: NOW + 2000 },
    ];
    assert.ok(!observeFreePlay(twice, NOW).some((o) => o.skillId === 'change.Em-Am'));

    const often = Array.from({ length: 8 }, (_, i) => ({
      label: i % 2 === 0 ? 'Em' : 'Am', confidence: 0.9, at: NOW + i * 1000,
    }));
    const change = observeFreePlay(often, NOW).find((o) => o.skillId === 'change.Em-Am');
    assert.ok(change, 'eight alternations is somebody who can do it');
    assert.equal(change.source, 'freeplay');
    assert.equal(change.changesPerMinute, 60);
  });

  test('a long pause between two chords is not a change', () => {
    const slow = Array.from({ length: 8 }, (_, i) => ({
      label: i % 2 === 0 ? 'Em' : 'Am', confidence: 0.9, at: NOW + i * 30_000,
    }));
    assert.ok(!observeFreePlay(slow, NOW).some((o) => o.skillId === 'change.Em-Am'));
  });

  test('someone who already plays skips the beginning', () => {
    // Arrives able to play Em and Am and to change between them.
    const heard = Array.from({ length: 10 }, (_, i) => ({
      label: i % 2 === 0 ? 'Em' : 'Am', confidence: 0.92, at: NOW + i * 900,
    }));
    const observations = [
      ...observeFreePlay(heard, NOW),
      ...observeFreePlay(heard, NOW + DAY).map((o) => ({ ...o, at: o.at + DAY })),
      ...observeFreePlay(heard, NOW + 2 * DAY).map((o) => ({ ...o, at: o.at + 2 * DAY })),
    ];
    const mastery = masteryMap(observations, NOW + 2 * DAY);
    assert.ok(levelOf(mastery, 'chord.Em') > 0, 'it should have noticed them playing E minor');
    const lessons = planLessons(mastery, { now: NOW + 2 * DAY, count: 20 });
    assert.ok(lessons.length > 0, 'and still have something to offer next');
  });
});

describe('remembering across sessions', () => {
  function fakeStorage() {
    const entries = new Map<string, string>();
    return {
      fail: false,
      getItem: (key: string) => entries.get(key) ?? null,
      setItem(key: string, value: string) {
        if (this.fail) throw new Error('QuotaExceededError');
        entries.set(key, value);
      },
    };
  }

  test('what was learned survives closing the app', () => {
    const storage = fakeStorage();
    new CurriculumStore(storage).record(drills('chord.Em', 0.9, 4));
    assert.equal(new CurriculumStore(storage).load().length, 4);
  });

  test('corrupt storage costs the history, not the app', () => {
    const storage = fakeStorage();
    storage.setItem('guitar-ai-coach.curriculum.v1', '{not json');
    assert.deepEqual(new CurriculumStore(storage).load(), []);
  });

  test('full storage does not stop the session', () => {
    const storage = fakeStorage();
    storage.fail = true;
    assert.doesNotThrow(() => new CurriculumStore(storage).record(drills('chord.Em', 0.9, 2)));
  });
});

describe('holding a single chord', () => {
  const exercise = buildExercise(getSkill('chord.Em')!);
  const at = (i: number) => ({ label: 'Em', at: NOW + i * 2000 });

  test('four clean ones in a row is having the chord', () => {
    const grade = gradeHoldChord(exercise, [0, 1, 2, 3, 4].map(at), exercise.durationMs);
    assert.ok(grade.passed);
    assert.match(grade.feedback.join(' '), /yours/i);
  });

  test('the right shape that keeps collapsing is not', () => {
    const heard = [at(0), at(1), { label: 'E5', at: NOW + 4000 }, at(3), { label: 'E5', at: NOW + 8000 }];
    const grade = gradeHoldChord(exercise, heard, exercise.durationMs);
    assert.ok(!grade.passed);
    assert.match(grade.feedback.join(' '), /holding it|dropped out|Keep the shape/i);
  });

  test('a different chord entirely is said plainly', () => {
    const grade = gradeHoldChord(exercise, [{ label: 'Am', at: NOW }], exercise.durationMs);
    assert.match(grade.feedback.join(' '), /came out as Am/);
  });

  test('silence asks them to try again rather than failing them', () => {
    assert.match(gradeHoldChord(exercise, [], 5000).feedback.join(' '), /did not hear Em/);
  });
});
