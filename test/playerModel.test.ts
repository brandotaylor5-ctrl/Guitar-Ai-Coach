import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { NoteEvent, PhraseAnalysis } from '../src/types.ts';
import {
  buildPlayerProfile, phraseObservation, practiceObservation, recommendAdaptiveTask,
} from '../src/coach/playerModel.ts';

function note(midi:number, startMs:number):NoteEvent {
  return {midi,startMs,durationMs:300,confidence:.95,velocity:.5};
}

function fakeAnalysis(midis:number[], bpm=84, steadiness=.8):PhraseAnalysis {
  const notes=midis.map((m,i)=>note(m,i*(60000/bpm)));
  return {
    phrase:{id:'p',notes,startMs:0,endMs:notes.at(-1)!.startMs+300},
    noteNames:notes.map(n=>String(n.midi)),
    intervals:midis.slice(1).map((m,i)=>m-midis[i]!),
    contour:[],
    homePc:midis[0]!%12,
    scale:{tonicPc:midis[0]!%12,scale:'minor pentatonic',confidence:.8,label:'A minor pentatonic'},
    rhythm:{bpm,confidence:.8,beatRatios:[]},
    resolution:'down',
    quality:{score:.8,confidence:.9,timingSteadiness:steadiness,articulation:.9},
    motifs:[],
  } as unknown as PhraseAnalysis;
}

describe('persistent player model',()=>{
  test('builds interval and tempo tendencies from phrases',()=>{
    const phrases=Array.from({length:6},(_,i)=>phraseObservation(
      'p'+i, fakeAnalysis([57,60,57,60,57],80+i), 1000+i,
    ));
    const profile=buildPlayerProfile({version:1,phrases,practices:[],creative:[]});
    assert.equal(profile.phraseCount,6);
    assert.ok(profile.tempo.median);
    assert.ok(profile.intervals[0]!.share>.4);
    assert.equal(profile.hasEnoughPhraseEvidence,true);
  });

  test('recognizes repeated rushing in measured riff attempts',()=>{
    const reference=[note(57,0),note(60,500),note(62,1000),note(64,1500)];
    const practices=Array.from({length:5},(_,i)=>practiceObservation({
      source:'riff-school',targetId:'x',lessonId:'motif-repeat',zoneIndex:0,startFret:5,
      reference,attempt:reference,accuracy:.9,tempoRatio:1.13+i*.01,passed:false,firstMistakeIndex:null,at:2000+i,
    }));
    const profile=buildPlayerProfile({version:1,phrases:[],practices,creative:[]});
    assert.equal(profile.timing.tendency,'rush');
    assert.equal(recommendAdaptiveTask(profile).kind,'timing');
  });

  test('spots a weaker neck zone from known physical practice targets',()=>{
    const ref=[note(57,0),note(60,500),note(62,1000)];
    const rows=[] as ReturnType<typeof practiceObservation>[];
    for(let i=0;i<3;i++) rows.push(practiceObservation({
      source:'riff-school',targetId:'shape',lessonId:'home-neighbor',zoneIndex:0,startFret:5,
      reference:ref,attempt:ref,accuracy:.94,tempoRatio:1,passed:true,firstMistakeIndex:null,at:i,
    }));
    for(let i=0;i<3;i++) rows.push(practiceObservation({
      source:'riff-school',targetId:'shape',lessonId:'home-neighbor',zoneIndex:2,startFret:10,
      reference:ref,attempt:ref,accuracy:.62,tempoRatio:1.02,passed:false,firstMistakeIndex:1,at:10+i,
    }));
    const profile=buildPlayerProfile({version:1,phrases:[],practices:rows,creative:[]});
    const task=recommendAdaptiveTask(profile);
    assert.equal(task.kind,'position');
    assert.equal(task.zoneIndex,2);
  });
});
