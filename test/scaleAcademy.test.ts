import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { SCALE_STUDIES, studyAt, studyFretMidi, isCorrectStudySpot, validateStudy } from '../src/learning/scaleStudy.ts';
import { SCALES, scaleRun } from '../src/music/scales.ts';
import { STANDARD_TUNING } from '../src/music/fretboard.ts';

describe('one scale at a time', () => {
  test('every lesson is exactly one ascending octave with verified fret notes', () => {
    for (const study of SCALE_STUDIES) {
      assert.equal(validateStudy(study), true, study.id);
      assert.equal(study.notes.length, 8);
      assert.equal(study.notes[7]!.midi - study.notes[0]!.midi, 12);
      for (const n of study.notes) assert.equal(studyFretMidi(n.string, n.fret), n.midi);
    }
  });

  test('G major has eight correct notes at the specified frets', () => {
    const study = studyAt(0);
    assert.deepEqual(study.notes.map(n=>n.name), ['G','A','B','C','D','E','F#','G']);
    assert.deepEqual(study.notes.map(n=>[n.string,n.fret]), [
      [6,3],[6,5],[5,2],[5,3],[5,5],[4,2],[4,4],[4,5],
    ]);
  });

  test('D major correction uses open G, not G string fret one', () => {
    const study = studyAt(1);
    assert.deepEqual(study.notes.map(n=>n.name), ['D','E','F#','G','A','B','C#','D']);
    assert.deepEqual(study.notes.map(n=>[n.string,n.fret]), [
      [4,0],[4,2],[4,4],[3,0],[3,2],[2,0],[2,2],[2,3],
    ]);
    assert.notEqual(studyFretMidi(3,1) % 12, study.notes[3]!.midi % 12);
  });

  test('C major and E natural minor follow their own verified routes', () => {
    assert.deepEqual(studyAt(2).notes.map(n=>n.name), ['C','D','E','F','G','A','B','C']);
    assert.deepEqual(studyAt(3).notes.map(n=>n.name), ['E','F#','G','A','B','C','D','E']);
  });

  test('recall requires exact string and fret, not just the same pitch', () => {
    const target = studyAt(0).notes[4]!;
    assert.equal(isCorrectStudySpot(target,5,5),true);
    assert.equal(isCorrectStudySpot(target,4,0),false); // also D3
    assert.equal(isCorrectStudySpot(target,5,4),false);
    assert.equal(isCorrectStudySpot(target,6,5),false);
  });

  test('the academy unlocks scales one by one in a defined order', () => {
    assert.deepEqual(SCALE_STUDIES.map(s=>s.id), ['g-major','d-major','c-major','e-minor']);
  });
});

describe('scale playback', () => {
  test('does not play a duplicated pitch on the way up', () => {
    const major = SCALES.find(s=>s.id==='major')!;
    const run=scaleRun(7,major,STANDARD_TUNING,3,4);
    const highest=Math.max(...run.map(n=>n.midi));
    const up=run.slice(0,run.findIndex(n=>n.midi===highest)+1);
    assert.equal(new Set(up.map(n=>n.midi)).size,up.length);
    assert.equal(up[0]!.midi,run[run.length-1]!.midi);
  });
});
