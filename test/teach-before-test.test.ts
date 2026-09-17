import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { SKILLS, getSkill, prerequisitesOf } from '../src/curriculum/skills.ts';
import { chordShape } from '../src/music/chordShapes.ts';

describe('teach before test', () => {
  test('every chord lesson has a concrete beginner finger map', () => {
    for (const skill of SKILLS.filter((item) => item.kind === 'chord')) {
      assert.ok(skill.chord, `${skill.id} is a chord skill without a chord label`);
      assert.ok(chordShape(skill.chord!), `${skill.id} can be assigned but has no finger map`);
    }
  });

  test('every chord used in a progression exists as a chord lesson', () => {
    for (const skill of SKILLS.filter((item) => item.kind === 'progression')) {
      for (const chord of new Set(skill.sequence ?? [])) {
        assert.ok(getSkill(`chord.${chord}`), `${skill.id} uses ${chord} without ever teaching ${chord}`);
      }
    }
  });

  test('a progression cannot unlock before every chord inside it has been learned', () => {
    for (const skill of SKILLS.filter((item) => item.kind === 'progression')) {
      const before = new Set(prerequisitesOf(skill.id));
      for (const chord of new Set(skill.sequence ?? [])) {
        assert.ok(before.has(`chord.${chord}`), `${skill.id} can unlock before chord.${chord}`);
      }
    }
  });
});
