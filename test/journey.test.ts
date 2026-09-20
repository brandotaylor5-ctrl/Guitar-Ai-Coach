import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { PATH } from '../src/curriculum/path.ts';
import type { SkillMastery } from '../src/curriculum/mastery.ts';
import {
  JOURNEY_STAGES, guidedSessionPlan, journeyStatus, stageForStep, warmupFor,
} from '../src/coach/journey.ts';

function progressAt(id:string, done:string[]=[]){
  const current=PATH.find((step)=>step.id===id)!;
  return {done:new Set(done),current,completed:done.length};
}

describe('guided guitar journey',()=>{
  test('every lesson belongs to one visible journey stage',()=>{
    for(const step of PATH){
      const stage=stageForStep(step);
      assert.ok(JOURNEY_STAGES.includes(stage),step.id);
    }
  });

  test('minor pentatonic is explicitly in the fretboard stage',()=>{
    const step=PATH.find((item)=>item.id==='scale-minor-pent')!;
    assert.equal(stageForStep(step).id,'fretboard');
  });

  test('progress reports both lesson and stage location',()=>{
    const progress=progressAt('chord-g',['hold','strings','fret','chord-em','strum','strum-updown']);
    const status=journeyStatus(progress);
    assert.equal(status.stage.id,'foundation');
    assert.equal(status.lessonNumber,7);
    assert.equal(status.completedLessons,6);
    assert.ok(status.stageFraction>0);
  });

  test('known G and D create a musically useful warmup instead of finger aerobics',()=>{
    const mastery=new Map<string,SkillMastery>([
      ['chord.G',{skillId:'chord.G',level:.55,sessions:2,lastSeenAt:Date.now()}],
      ['chord.D',{skillId:'chord.D',level:.55,sessions:2,lastSeenAt:Date.now()}],
    ]);
    const warm=warmupFor(mastery);
    assert.deepEqual(warm.chords,['G','D']);
    assert.match(warm.instruction,/pulse/i);
  });

  test('a guided session has a beginning, new material, musical use and an ending',()=>{
    const step=PATH.find((item)=>item.id==='hammer-on')!;
    const plan=guidedSessionPlan(step,new Map());
    assert.equal(plan.totalMinutes,15);
    assert.equal(plan.warmup.minutes,2);
    assert.equal(plan.learnMinutes,6);
    assert.equal(plan.musicMinutes,4);
    assert.equal(plan.playMinutes,3);
    assert.match(plan.finishPrompt,/phrase|short/i);
  });
});
