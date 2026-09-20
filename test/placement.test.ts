import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { chooseTeacherLesson } from '../src/coach/teacher.ts';
import {
  PlacementStore,
  effectiveProgress,
  evidenceForPlacement,
  placementEvidence,
  placementStepIds,
  shouldOfferPlacement,
  type PlayerPlacement,
} from '../src/coach/placement.ts';
import { MASTERED, WORKABLE, levelOf, masteryMap } from '../src/curriculum/mastery.ts';
import { PATH } from '../src/curriculum/path.ts';

const NOW = new Date('2026-09-20T12:00:00Z').getTime();

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

function blankProgress() {
  return { done: new Set<string>(), current: PATH[0]!, completed: 0 };
}

describe('first-run player placement', () => {
  test('a brand-new player still starts with the first physical lesson', () => {
    const placement: PlayerPlacement = {
      experience: 'new',
      knownChords: [],
      knownSteps: [],
      completedAt: NOW,
    };

    const progress = effectiveProgress(blankProgress(), placement);
    const choice = chooseTeacherLesson(progress, masteryMap(placementEvidence(placement), NOW));

    assert.equal(choice.step.id, 'hold');
    assert.equal(progress.completed, 0);
  });

  test('an experienced beginner starts at the first honest gap, not lesson one', () => {
    const placement: PlayerPlacement = {
      experience: 'played',
      knownChords: ['Em', 'G', 'D', 'C'],
      knownSteps: ['strum', 'strum-updown', 'change', 'first-song'],
      completedAt: NOW,
    };

    const progress = effectiveProgress(blankProgress(), placement);
    const mastery = masteryMap(placementEvidence(placement), NOW);
    const choice = chooseTeacherLesson(progress, mastery);

    assert.equal(choice.step.id, 'strum-pattern');
    assert.equal(progress.done.has('hold'), true);
    assert.equal(progress.done.has('strings'), true);
    assert.equal(progress.done.has('fret'), true);
  });

  test('self-reported chords are provisional evidence that later playing can replace', () => {
    const placement: PlayerPlacement = {
      experience: 'played',
      knownChords: ['G'],
      knownSteps: [],
      completedAt: NOW,
    };

    const evidence = placementEvidence(placement, NOW);
    const claimedLevel = levelOf(masteryMap(evidence, NOW), 'chord.G');
    const corrected = masteryMap([
      ...evidence,
      { skillId:'chord.G', quality:0, at:NOW + 1, source:'drill' },
      { skillId:'chord.G', quality:0, at:NOW + 2, source:'drill' },
    ], NOW + 2);

    assert.ok(evidence.length > 1);
    assert.equal(evidence.every((item) => item.skillId === 'chord.G'), true);
    assert.equal(evidence.every((item) => item.source === 'freeplay'), true);
    assert.ok(claimedLevel >= WORKABLE, 'claim should be enough to plan around');
    assert.ok(claimedLevel < MASTERED, 'claim must not be called mastery');
    assert.ok(levelOf(corrected, 'chord.G') < WORKABLE, 'real playing should replace the claim quickly');
  });

  test('an unverified claim stays usable until real playing replaces it', () => {
    const placement: PlayerPlacement = {
      experience:'played', knownChords:['G'], knownSteps:[], completedAt:NOW,
    };
    const oneMonthLater = NOW + 30 * 86_400_000;

    const level = levelOf(
      masteryMap(placementEvidence(placement, oneMonthLater), oneMonthLater),
      'chord.G',
    );

    assert.ok(level >= WORKABLE);
    assert.ok(level < MASTERED);
  });

  test('placement persists, can be changed, and can be reset', () => {
    const storage = new MemoryStorage();
    const store = new PlacementStore(storage);
    const first: PlayerPlacement = {
      experience: 'new', knownChords: [], knownSteps: [], completedAt: NOW,
    };
    const changed: PlayerPlacement = {
      experience: 'played', knownChords: ['Em', 'G'], knownSteps: ['strum'], completedAt: NOW + 1,
    };

    store.save(first);
    assert.deepEqual(store.load(), first);
    store.save(changed);
    assert.deepEqual(store.load(), changed);
    store.clear();
    assert.equal(store.load(), null);
  });

  test('corrupt placement is treated as not completed', () => {
    const storage = new MemoryStorage();
    storage.setItem('guitar-ai-coach.placement.v1', '{nope');

    assert.equal(new PlacementStore(storage).load(), null);
  });

  test('legacy progress is respected instead of forcing onboarding again', () => {
    assert.equal(shouldOfferPlacement(null, blankProgress(), 0), true);
    assert.equal(shouldOfferPlacement(null, { ...blankProgress(), completed: 2 }, 0), false);
    assert.equal(shouldOfferPlacement(null, blankProgress(), 3), false);
    assert.equal(shouldOfferPlacement({
      experience: 'new', knownChords: [], knownSteps: [], completedAt: NOW,
    }, blankProgress(), 0), false);
  });

  test('starting over ignores older learning evidence but keeps new observations', () => {
    const placement: PlayerPlacement = {
      experience:'new', knownChords:[], knownSteps:[], completedAt:NOW,
    };
    const observations = [
      { skillId:'chord.G', quality:1, at:NOW - 1, source:'drill' as const },
      { skillId:'chord.Em', quality:1, at:NOW + 1, source:'drill' as const },
    ];

    assert.deepEqual(evidenceForPlacement(observations, placement), [observations[1]]);
  });

  test('any real chord evidence replaces the self-report instead of mixing with it', () => {
    const placement: PlayerPlacement = {
      experience:'played', knownChords:['G'], knownSteps:[], completedAt:NOW,
    };
    const heard = { skillId:'chord.G', quality:.15, at:NOW - 1, source:'drill' as const };

    assert.deepEqual(evidenceForPlacement([heard], placement), [heard]);
  });

  test('roadmap can distinguish placed lessons from completed lessons', () => {
    const placement: PlayerPlacement = {
      experience:'played',
      knownChords:['Em', 'G'],
      knownSteps:['strum'],
      completedAt:NOW,
    };

    assert.deepEqual(
      [...placementStepIds(placement)].sort(),
      ['chord-em', 'chord-g', 'fret', 'hold', 'strings', 'strum'],
    );
    assert.deepEqual(
      [...placementStepIds(placement, new Set(['chord.G']))].sort(),
      ['chord-em', 'fret', 'hold', 'strings', 'strum'],
    );
  });
});
