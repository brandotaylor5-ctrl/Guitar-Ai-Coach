import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseTeacherLesson, musicalUseFor } from '../src/coach/teacher.ts';
import { PATH } from '../src/curriculum/path.ts';
import type { SkillMastery } from '../src/curriculum/mastery.ts';

function progressAt(id:string, done:string[]=[]){
  const step=PATH.find((item)=>item.id===id)!;
  return {done:new Set(done),current:step,completed:done.length};
}

describe('teacher-led Coach',()=>{
  test('starts from the course current step when there is no evidence to skip it',()=>{
    const choice=chooseTeacherLesson(progressAt('chord-em'),new Map());
    assert.equal(choice.step.id,'chord-em');
  });

  test('skips a chord the player has already demonstrated and teaches the next thing',()=>{
    const mastery=new Map<string,SkillMastery>([
      ['chord.Em',{skillId:'chord.Em',level:.4,sessions:1,lastSeenAt:Date.now()}],
    ]);
    const choice=chooseTeacherLesson(progressAt('chord-em'),mastery);
    assert.equal(choice.step.id,'strum');
  });

  test('does not silently skip physical technique steps just because later chords are known',()=>{
    const mastery=new Map<string,SkillMastery>([
      ['chord.Em',{skillId:'chord.Em',level:.5,sessions:1,lastSeenAt:Date.now()}],
      ['chord.G',{skillId:'chord.G',level:.5,sessions:1,lastSeenAt:Date.now()}],
    ]);
    const choice=chooseTeacherLesson(progressAt('strum'),mastery);
    assert.equal(choice.step.id,'strum');
  });

  test('new chords come with a musical use, not only a diagram',()=>{
    const d=PATH.find((step)=>step.id==='chord-d')!;
    const use=musicalUseFor(d);
    assert.ok(use);
    assert.deepEqual(use!.chords,['G','D']);
    assert.match(use!.instruction,/repeat|four/i);
  });

  test('scale teaching immediately becomes riff making',()=>{
    const scale=PATH.find((step)=>step.scale)!;
    const use=musicalUseFor(scale);
    assert.ok(use);
    assert.match(use!.instruction,/riff/i);
  });

  test('technique lessons have concrete musical applications instead of generic advice',()=>{
    for(const id of ['strum','boom-chuck','hammer-on','fingerpick','dynamics']){
      const step=PATH.find((item)=>item.id===id)!;
      const use=musicalUseFor(step);
      assert.ok(use,id);
      assert.ok(use!.instruction.length>45,id);
    }
    assert.match(musicalUseFor(PATH.find((item)=>item.id==='hammer-on')!)!.instruction,/hammer/i);
    assert.match(musicalUseFor(PATH.find((item)=>item.id==='boom-chuck')!)!.instruction,/bass/i);
  });
});
