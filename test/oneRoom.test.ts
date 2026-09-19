import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { NoteEvent, PhraseAnalysis } from '../src/types.ts';
import { hardPartTarget, learningWindow, planPhrase } from '../src/coach/oneRoom.ts';

function notes(midis:number[], gap=500):NoteEvent[] {
  return midis.map((midi,i)=>({
    midi,startMs:i*gap,durationMs:Math.round(gap*.7),confidence:.95,velocity:.55,
  }));
}

function analysis(midis:number[], opts:{
  bpm?:number; rhythmConfidence?:number; steadiness?:number; scaleConfidence?:number; scaleLabel?:string;
}={}):PhraseAnalysis {
  const phraseNotes=notes(midis);
  return {
    phrase:{id:'p',notes:phraseNotes,startMs:0,endMs:phraseNotes.at(-1)!.startMs+300},
    noteNames:midis.map(String),
    intervals:midis.slice(1).map((m,i)=>m-midis[i]!),
    contour:[],
    homePc:midis[0]!%12,
    scale:{
      tonicPc:midis[0]!%12,
      scale:'minor pentatonic',
      confidence:opts.scaleConfidence ?? .7,
      label:opts.scaleLabel ?? 'A minor pentatonic',
    },
    rhythm:{
      bpm:opts.bpm ?? 90,
      confidence:opts.rhythmConfidence ?? .8,
      beatRatios:[],
    },
    resolution:'down',
    quality:{
      score:.8,
      confidence:.9,
      timingSteadiness:opts.steadiness ?? .8,
      articulation:.9,
    },
    motifs:[],
  } as unknown as PhraseAnalysis;
}

describe('one-room Coach priority',()=>{
  test('timing wins when the pulse is the clearest problem',()=>{
    const plan=planPhrase(analysis([57,60,62,64,62],{steadiness:.42}));
    assert.equal(plan.priority,'timing');
    assert.match(plan.headline,/pulse/i);
    assert.match(plan.instruction,/BPM/i);
  });

  test('a tiny repeated idea becomes melody development, not theory overload',()=>{
    const plan=planPhrase(analysis([57,60,57,60,57],{scaleConfidence:.8}));
    assert.equal(plan.priority,'melody');
    assert.match(plan.instruction,/one neighboring note/i);
  });

  test('a clear multi-note line connects sound to a fretboard neighborhood',()=>{
    const plan=planPhrase(analysis([57,60,62,64,67],{steadiness:.82,scaleConfidence:.82}));
    assert.equal(plan.priority,'fretboard');
    assert.match(plan.headline,/minor pentatonic/i);
    assert.doesNotMatch(plan.instruction,/definitely|exactly where/i);
  });
});

describe('one-room hard-part practice',()=>{
  test('isolates the note before the miss, the miss, and the note after',()=>{
    const target=notes([57,60,62,64,67],400);
    const hard=hardPartTarget(target,2);
    assert.deepEqual(hard.map(n=>n.midi),[60,62,64]);
    assert.equal(hard[0]!.startMs,0);
    assert.ok(hard[1]!.startMs>hard[0]!.startMs);
  });

  test('handles a mistake at the first note without inventing context',()=>{
    const hard=hardPartTarget(notes([57,60,62],400),0);
    assert.deepEqual(hard.map(n=>n.midi),[57,60]);
  });
});

describe('one-room fretboard framing',()=>{
  test('turns an inferred route into a small hand-sized learning window',()=>{
    assert.deepEqual(learningWindow([5,5,7,8,7]),{startFret:4,endFret:8});
  });

  test('falls back safely when there is no physical evidence',()=>{
    assert.deepEqual(learningWindow([]),{startFret:0,endFret:4});
  });
});
