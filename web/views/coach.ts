/**
 * Live Coach — teacher first, listener second.
 *
 * The old product waited for the learner to already know what to play. This
 * version opens with a concrete next lesson, demonstrates it, teaches the
 * physical move, listens where the microphone has honest evidence, makes the
 * learner use it musically, then hands them the next lesson.
 *
 * Free play still exists, but it is secondary. A beginner should never have to
 * provide the curriculum.
 */

import type { Frame } from '../../src/audio/noteTracker.ts';
import type { NoteEvent, Phrase, PhraseAnalysis } from '../../src/types.ts';
import { frequencyToMidi, midiToName } from '../../src/music/notes.ts';
import { chordShape, chordShapeMidis } from '../../src/music/chordShapes.ts';
import { inferFingering, renderTab } from '../../src/music/fretboard.ts';
import { scaleById, scaleBox, scaleRun, rootPositionFret } from '../../src/music/scales.ts';
import { suggestChords } from '../../src/create/suggest.ts';
import { motifBranches } from '../../src/create/songwriting.ts';
import { practiceAttempt } from '../../src/practice/practice.ts';
import { checkChordShape } from '../../src/audio/chordCheck.ts';
import type { ChordCheck } from '../../src/audio/chordCheck.ts';
import type { ChordDetection, ChordExplanation } from '../audio/chordDetect.ts';
import { compactChordLabel, normalizeChordLabel, readMelody, readTime } from '../../src/coach/liveTutor.ts';
import { phraseObservation, PlayerModelStore, practiceObservation } from '../../src/coach/playerModel.ts';
import { hardPartTarget, learningWindow, planPhrase } from '../../src/coach/oneRoom.ts';
import { chooseTeacherLesson, musicalUseFor } from '../../src/coach/teacher.ts';
import { CurriculumStore } from '../../src/curriculum/watch.ts';
import { masteryMap } from '../../src/curriculum/mastery.ts';
import { loadProgress, saveDone } from '../../src/curriculum/path.ts';
import type { PathStep } from '../../src/curriculum/path.ts';
import { audioContext, audioOutput, unlockAudio } from '../audio/context.ts';
import { chordTeachingCard } from '../ui/chordCard.ts';
import { h, clear, replace } from '../ui/dom.ts';
import { button, fretboardDiagram, highlightNote, noteRow, scaleDiagram, tabBlock } from '../ui/render.ts';
import type { AppContext, View } from './context.ts';

function appStorage(): Storage | { getItem(key:string):string|null; setItem(key:string,value:string):void } {
  try {
    window.localStorage.setItem('__coach_storage_probe__', '1');
    window.localStorage.removeItem('__coach_storage_probe__');
    return window.localStorage;
  } catch {
    const memory = new Map<string,string>();
    return {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => { memory.set(key, value); },
    };
  }
}

function scaleId(name:string):string {
  const normalized = name.toLowerCase();
  if (normalized.includes('minor pentatonic')) return 'minor-pent';
  if (normalized.includes('major pentatonic')) return 'major-pent';
  if (normalized.includes('blues')) return 'blues';
  if (normalized.includes('mixolydian')) return 'mixolydian';
  if (normalized.includes('dorian')) return 'dorian';
  if (normalized.includes('minor')) return 'minor';
  if (normalized.includes('major')) return 'major';
  return 'minor-pent';
}

function preferredVoice():SpeechSynthesisVoice|null {
  if (!('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices().filter((voice) => /^en(-|_)/i.test(voice.lang));
  const preferred = [/samantha/i, /alex/i, /daniel/i, /aaron/i, /ava/i, /natural/i, /google us english/i];
  for (const pattern of preferred) {
    const hit = voices.find((voice) => pattern.test(voice.name));
    if (hit) return hit;
  }
  return voices[0] ?? null;
}

function rebase(notes:NoteEvent[]):NoteEvent[] {
  if (!notes.length) return [];
  const origin = notes[0]!.startMs;
  return notes.map((note) => ({ ...note, startMs: note.startMs - origin }));
}

function skillIdForStep(step:PathStep):string|null {
  return step.practice?.params?.skill ?? (step.chord ? `chord.${step.chord}` : null);
}

export function coachView(context:AppContext):View {
  const store = appStorage();
  const curriculum = new CurriculumStore(store);
  const playerModel = new PlayerModelStore(store);

  let disposed = false;
  let checking = false;
  let freePlayMode = false;
  let lastPhraseId = '';
  let lastNoteAt = 0;
  let lastSpokenAt = 0;
  let pendingVoice:string|null = null;
  let voiceEnabled = true;

  let currentPhrase:Phrase|null = null;
  let currentAnalysis:PhraseAnalysis|null = null;
  let activeTarget:NoteEvent[]|null = null;
  let activeTargetLabel = '';
  let attemptStartMs:number|null = null;

  let chordTarget:string|null = null;
  let chordTargetHost:HTMLElement|null = null;
  let chordTargetBest = -1;
  let chordTargetClean = false;
  let chordTargetStep:PathStep|null = null;

  let tempoTimer = 0;

  const stageKicker = h('p', { class:'coach-stage-kicker' });
  const stageTitle = h('h1');
  const stageText = h('p', { class:'coach-stage-text' });
  const stageActions = h('div', { class:'coach-stage-actions' });

  const heardNote = h('span', { text:'—' });
  const heardChord = h('button', { class:'coach-heard-chord', type:'button', text:'—' });
  const heardTempo = h('span', { text:'—' });
  const heardLine = h('div', { class:'coach-heard-line is-quiet' },
    h('span', { class:'coach-heard-label', text:'while I listen' }),
    h('span', {}, h('small', { text:'note' }), heardNote),
    h('span', {}, h('small', { text:'chord' }), heardChord),
    h('span', {}, h('small', { text:'tempo' }), heardTempo),
  );

  const workbench = h('div', { class:'coach-workbench-minimal' });

  const voiceButton = button('Voice on', () => {
    voiceEnabled = !voiceEnabled;
    voiceButton.textContent = voiceEnabled ? 'Voice on' : 'Voice off';
    voiceButton.classList.toggle('is-off', !voiceEnabled);
    if (!voiceEnabled && 'speechSynthesis' in window) {
      pendingVoice = null;
      window.speechSynthesis.cancel();
    } else if (voiceEnabled) {
      speak('Voice coach is on.', true);
    }
  }, 'coach-voice-toggle');

  const element = h('div', { class:'view coach-minimal' },
    h('section', { class:'coach-stage' },
      h('div', { class:'coach-stage-copy' }, stageKicker, stageTitle, stageText),
      stageActions,
      heardLine,
    ),
    workbench,
  );

  heardChord.addEventListener('click', () => {
    const label = heardChord.textContent ?? '';
    if (label !== '—' && chordShape(label)) {
      teachChordOutsideLesson(label, 'You just played this chord. Here is the hand shape whenever you want to clean it up.');
    }
  });

  function setStage(kicker:string, title:string, text:string, speakIt=false):void {
    stageKicker.textContent = kicker;
    stageTitle.textContent = title;
    stageText.textContent = text;
    if (speakIt) speak(`${title}. ${text}`);
  }

  function setActions(...actions:HTMLElement[]):void {
    clear(stageActions);
    stageActions.append(...actions, voiceButton);
  }

  function speak(text:string, force=false):void {
    if (!voiceEnabled || !('speechSynthesis' in window)) return;
    const now = Date.now();
    if (!force && now - lastNoteAt < 1350) {
      pendingVoice = text;
      return;
    }
    if (!force && now - lastSpokenAt < 4300) {
      pendingVoice = text;
      return;
    }
    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      pendingVoice = text;
      return;
    }

    lastSpokenAt = now;
    pendingVoice = null;
    if (force) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = .98;
    utterance.pitch = .92;
    utterance.volume = 1;
    utterance.voice = preferredVoice();
    utterance.onerror = (event) => {
      if (event.error === 'canceled' || event.error === 'interrupted') return;
      context.say('Voice output is blocked here. Tap Voice on once to retry.', 'error');
    };
    window.speechSynthesis.speak(utterance);
  }

  function flushVoice():void {
    if (!pendingVoice || Date.now() - lastNoteAt < 1350) return;
    const next = pendingVoice;
    pendingVoice = null;
    speak(next);
  }

  function teacherChoice() {
    return chooseTeacherLesson(loadProgress(store), masteryMap(curriculum.load()));
  }

  function renderTeacherHome(announce=false):void {
    freePlayMode = false;
    stopTempo();
    chordTarget = null;
    chordTargetHost = null;
    context.setChordDiagnostics?.(false);
    clear(workbench);

    const choice = teacherChoice();
    const lessonNumber = choice.index + 1;
    setStage(
      `YOUR NEXT LESSON · ${lessonNumber}`,
      choice.step.title,
      `${choice.step.outcome} ${choice.reason}`,
      announce,
    );

    const teach = button('Teach me this', () => renderTeacherLesson(choice.step, choice.index), 'btn-primary coach-start');
    const know = button('I already know this', () => {
      finishStep(choice.step, false);
    }, 'btn-quiet');
    const free = button('Listen to me play instead', () => { void startFreePlay(); }, 'coach-text-action');
    setActions(teach, know, free);
  }

  function finishStep(step:PathStep, earned:boolean):void {
    const progress = loadProgress(store);
    progress.done.add(step.id);
    saveDone(store, progress.done);

    const skillId = skillIdForStep(step);
    if (earned && skillId) {
      curriculum.record([{
        skillId,
        quality:.88,
        at:Date.now(),
        source:'lesson',
      }]);
    }

    const next = teacherChoice();
    clear(workbench);
    setStage(
      'NICE. NEXT.',
      next.step.title,
      `${next.step.outcome} I’ll teach it when you’re ready.`,
      true,
    );
    setActions(
      button('Teach me the next thing', () => renderTeacherLesson(next.step, next.index), 'btn-primary coach-start'),
      button('Done for now', () => renderTeacherHome(false), 'btn-quiet'),
    );
  }

  function lessonSteps(step:PathStep):HTMLElement {
    return h('ol', { class:'coach-lesson-steps' },
      ...step.steps.map((line) => h('li', { text:line })),
    );
  }

  function renderTeacherLesson(step:PathStep, index:number):void {
    freePlayMode = false;
    stopTempo();
    chordTarget = null;
    chordTargetHost = null;
    context.setChordDiagnostics?.(false);
    clear(workbench);

    setStage(
      `LESSON ${index + 1}`,
      step.title,
      step.why,
      true,
    );
    setActions(
      button('Back to next lesson', () => renderTeacherHome(false), 'coach-text-action'),
    );

    if (step.chord && chordShape(step.chord)) {
      renderChordLesson(step);
      return;
    }

    if (step.scale) {
      renderScaleLesson(step);
      return;
    }

    renderPhysicalLesson(step);
  }

  function renderPhysicalLesson(step:PathStep):void {
    const use = musicalUseFor(step);
    const rhythmLike = /strum|rhythm|boom|fingerpick|dynamic/i.test(`${step.id} ${step.title}`);

    const task = h('section', { class:'coach-task coach-teacher-task' },
      h('p', { class:'coach-task-title', text:'Do this with me' }),
      lessonSteps(step),
      step.watchFor ? h('div', { class:'coach-teacher-note' },
        h('strong', { text:'Watch for: ' }),
        h('span', { text:step.watchFor }),
      ) : null,
      h('div', { class:'coach-teacher-check' },
        h('strong', { text:'You have it when: ' }),
        h('span', { text:step.check }),
      ),
    );

    if (rhythmLike) {
      task.appendChild(h('div', { class:'coach-task-actions' },
        button('Give me a slow 60 BPM click', () => { void startTempo(60); }, 'btn-primary'),
        button('72 BPM', () => { void startTempo(72); }, 'btn-quiet'),
        button('Stop click', stopTempo, 'btn-quiet'),
      ));
    }

    if (use) {
      task.appendChild(h('div', { class:'coach-use-it' },
        h('span', { class:'coach-heard-label', text:'THEN MAKE IT MUSIC' }),
        h('strong', { text:use.title }),
        h('p', { text:use.instruction }),
        use.chords ? chordLoopControls(use.chords) : null,
      ));
    }

    task.appendChild(h('div', { class:'coach-complete-row' },
      button('I can do that — next lesson', () => finishStep(step, true), 'btn-primary'),
      button('Show me the steps again', () => task.scrollIntoView({ behavior:'smooth', block:'start' }), 'btn-quiet'),
    ));

    workbench.appendChild(task);
  }

  function renderChordLesson(step:PathStep):void {
    const chord = step.chord!;
    const feedback = h('div', { class:'coach-inline-feedback' });
    chordTarget = chord;
    chordTargetHost = feedback;
    chordTargetBest = -1;
    chordTargetClean = false;
    chordTargetStep = step;
    context.setChordDiagnostics?.(true);

    workbench.append(
      chordTeachingCard(chord, context.player, { compact:true }),
      h('section', { class:'coach-task coach-teacher-task' },
        h('p', { class:'coach-task-title', text:'Now make the shape yourself' }),
        h('p', { class:'muted', text:step.check }),
        h('div', { class:'coach-task-actions' },
          button('Hear it again', () => playChord(chord), 'btn-quiet'),
          button(`Listen to my ${chord}`, async () => {
            speak(`Good. Put the ${chord} shape down and give me two slow strums.`, true);
            if (!context.listening) await context.startListening();
            replace(feedback, h('p', { class:'muted', text:'Listening for two slow strums…' }));
          }, 'btn-primary'),
        ),
        feedback,
        h('div', { class:'coach-complete-row' },
          button('I can play it — use it in music', () => renderMusicalUse(step), 'btn-primary'),
          button('I already have this shape', () => finishStep(step, false), 'btn-quiet'),
        ),
      ),
    );
  }

  function playChord(label:string):void {
    const shape = chordShape(normalizeChordLabel(label));
    if (!shape) return;
    void context.player.play(chordShapeMidis(shape).map((midi, index) => ({
      midi,
      startMs:index * 45,
      durationMs:1200,
      confidence:1,
      velocity:.62,
    })));
  }

  function chordFeedback(check:ChordCheck):HTMLElement {
    return h('div', { class:`coach-chord-feedback${check.clean ? ' is-clean' : ''}` },
      h('strong', { text:check.advice[0] ?? (check.clean ? 'That is ringing cleanly.' : 'Try it once more.') }),
      h('div', { class:'coach-string-status' },
        ...[...check.strings].reverse().map((string) => h('span', {
          class:`is-${string.verdict}`,
          text:`${string.verdict === 'ringing' ? '●' : string.verdict === 'missing' ? '✕' : string.verdict === 'unclear' ? '?' : '×'} ${string.stringNumber}`,
        })),
      ),
      ...check.advice.slice(1, 2).map((line) => h('p', { class:'muted', text:line })),
    );
  }

  function updateChordTarget(explanation:ChordExplanation):void {
    if (!chordTarget || !chordTargetHost) return;
    const shape = chordShape(chordTarget);
    if (!shape) return;

    const check = checkChordShape(explanation.perMidi, shape, context.session.tuning);
    const score = check.strings.filter((string) =>
      string.verdict === 'ringing' || string.verdict === 'unclear').length;
    if (score < chordTargetBest) return;

    chordTargetBest = score;
    replace(chordTargetHost, chordFeedback(check));

    if (check.clean && !chordTargetClean) {
      chordTargetClean = true;
      speak(`Yes. That is ${chordTarget}. Now we are going to use it in music instead of staring at the shape.`, true);
      if (chordTargetStep) {
        const step = chordTargetStep;
        chordTargetHost.appendChild(h('div', { class:'coach-task-actions' },
          button('Use this chord in music', () => renderMusicalUse(step), 'btn-primary'),
        ));
      }
    }
  }

  function renderMusicalUse(step:PathStep):void {
    stopTempo();
    const use = musicalUseFor(step);
    clear(workbench);

    if (!use) {
      finishStep(step, true);
      return;
    }

    setStage(
      'NOW USE IT',
      use.title,
      use.instruction,
      true,
    );

    const task = h('section', { class:'coach-task coach-use-card' },
      h('p', { class:'coach-task-title', text:use.title }),
      h('p', { text:use.instruction }),
    );

    if (use.chords) task.appendChild(chordLoopControls(use.chords));

    task.appendChild(h('div', { class:'coach-complete-row' },
      button('Got it — teach me the next thing', () => finishStep(step, true), 'btn-primary'),
      button('Teach the hand again', () => {
        const choiceIndex = teacherChoice().index;
        renderTeacherLesson(step, choiceIndex);
      }, 'btn-quiet'),
    ));
    workbench.appendChild(task);
  }

  function chordLoopControls(chords:string[]):HTMLElement {
    const valid = chords.filter((chord) => chordShape(chord));
    return h('div', { class:'coach-loop' },
      h('div', { class:'coach-loop-chords' },
        ...valid.flatMap((chord, index) => [
          index ? h('span', { class:'muted', text:'→' }) : h('span'),
          button(chord, () => teachChordOutsideLesson(chord, `Here is ${chord}. Return to the lesson when the shape makes sense.`), 'coach-chord-pill'),
        ]),
      ),
      h('div', { class:'coach-task-actions' },
        button('Hear the loop', () => playChordLoop(valid), 'btn-primary'),
        button('Give me a 60 BPM pulse', () => { void startTempo(60); }, 'btn-quiet'),
      ),
    );
  }

  function playChordLoop(chords:string[]):void {
    if (!chords.length) return;
    const beat = 60000 / 72;
    const events:NoteEvent[] = [];
    chords.forEach((chord, chordIndex) => {
      const shape = chordShape(chord);
      if (!shape) return;
      chordShapeMidis(shape).forEach((midi, stringIndex) => {
        events.push({
          midi,
          startMs:chordIndex * beat * 4 + stringIndex * 34,
          durationMs:beat * 3.6,
          confidence:1,
          velocity:.55,
        });
      });
    });
    void context.player.play(events);
  }

  function renderScaleLesson(step:PathStep):void {
    const scaleSpec = step.scale!;
    const scale = scaleById(scaleSpec.scaleId);
    if (!scale) {
      renderPhysicalLesson(step);
      return;
    }

    const tuning = context.session.tuning;
    const startFret = rootPositionFret(scaleSpec.tonicPc, tuning);
    const box = scaleBox(scaleSpec.tonicPc, scale, tuning, startFret, 4);
    const runPositions = scaleRun(scaleSpec.tonicPc, scale, tuning, startFret, 4);
    const run = runPositions.map((position, index) => ({
      midi:position.midi,
      startMs:index * 360,
      durationMs:300,
      confidence:1,
      velocity:.6,
    }));

    const riffIndexes = [0, 1, 2, 0, 1, 3, 2, 0]
      .map((index) => Math.min(index, Math.max(0, run.length - 1)));
    const riff = riffIndexes.map((index, i) => ({
      ...run[index]!,
      startMs:i * 420,
      durationMs:i === 2 || i === 5 ? 620 : 330,
    }));

    setStage(
      'NEW MELODY TOOL',
      step.title,
      `First learn where the sound lives. Then I’ll give you an original little phrase so it immediately becomes music.`,
      true,
    );

    const riffRow = noteRow(riff);
    workbench.appendChild(h('section', { class:'coach-task coach-teacher-task' },
      h('p', { class:'coach-task-title', text:step.outcome }),
      h('p', { text:step.why }),
      scaleDiagram(box, tuning),
      h('div', { class:'coach-task-actions' },
        button('Hear the scale slowly', () => { void context.player.play(run, { speed:.75 }); }, 'btn-quiet'),
      ),
      h('div', { class:'coach-use-it' },
        h('span', { class:'coach-heard-label', text:'NOW MAKE A RIFF' }),
        h('strong', { text:'Motif, then change the ending' }),
        h('p', { text:'Play a tiny three-note idea. Repeat the beginning. Change only the last note. That is development — the reason it sounds like a riff instead of a scale exercise.' }),
        riffRow,
        h('div', { class:'coach-task-actions' },
          button('Hear my example', () => { void context.player.play(riff, {
            onNote:(index) => highlightNote(riffRow, index),
            onEnd:() => highlightNote(riffRow, null),
          }); }, 'btn-primary'),
          button('Practice this riff with me', () => practicePhrase(riff, `${step.title} mini riff`, step), 'btn-quiet'),
        ),
      ),
      h('div', { class:'coach-complete-row' },
        button('I can play the shape — next lesson', () => finishStep(step, true), 'btn-primary'),
      ),
    ));
  }

  function teachChordOutsideLesson(label:string, reason:string):void {
    const clean = normalizeChordLabel(label);
    if (!chordShape(clean)) return;
    const returnStep = teacherChoice();
    setStage('QUICK CHORD HELP', `Here’s ${clean}`, reason, true);
    clear(workbench);
    workbench.append(
      chordTeachingCard(clean, context.player, { compact:true }),
      h('div', { class:'coach-after-task' },
        button('Back to my lesson', () => renderTeacherLesson(returnStep.step, returnStep.index), 'coach-text-action'),
      ),
    );
  }

  async function startFreePlay():Promise<void> {
    freePlayMode = true;
    stopTempo();
    clear(workbench);
    speak('Okay. Play anything you want for about fifteen seconds. Then pause. I will choose one thing worth teaching from it.', true);
    await unlockAudio();
    if (!context.listening) await context.startListening();
    setStage(
      'OPTIONAL FREE PLAY',
      'Play anything for about 15 seconds.',
      'When you pause, I’ll respond to what you played. Your teacher-led lesson is still waiting whenever you want it.',
    );
    setActions(
      button('Back to my lesson', () => renderTeacherHome(false), 'btn-primary'),
    );
  }

  function routeFor(notes:NoteEvent[], analysis:PhraseAnalysis|null):HTMLElement {
    const positions = inferFingering(notes.map((note) => note.midi), {
      tuning:context.session.tuning,
      maxFret:18,
    });
    const window = learningWindow(positions.map((position) => position.fret), 18);
    const route = h('details', { class:'coach-route-minimal' },
      h('summary', { text:'Show me where I can play this' }),
      h('p', { class:'muted', text:'This is one low-travel route. I can hear pitches, not which duplicate fret you used.' }),
      fretboardDiagram(positions, context.session.tuning),
      tabBlock(renderTab(positions, context.session.tuning)),
    );

    if (analysis && analysis.scale.confidence >= .5) {
      const scale = scaleById(scaleId(analysis.scale.scale));
      if (scale) {
        route.appendChild(h('details', { class:'coach-scale-neighborhood' },
          h('summary', { text:`Show nearby ${analysis.scale.label} notes` }),
          scaleDiagram(scaleBox(
            analysis.scale.tonicPc,
            scale,
            context.session.tuning,
            window.startFret,
            Math.max(4, window.endFret - window.startFret),
          ), context.session.tuning),
        ));
      }
    }
    return route;
  }

  function renderReactivePhrase(phrase:Phrase, analysis:PhraseAnalysis):void {
    currentPhrase = phrase;
    currentAnalysis = analysis;
    const melody = readMelody(analysis);
    const time = readTime(analysis, null);
    const plan = planPhrase(analysis);
    heardTempo.textContent = time.bpm ? `~${time.bpm}` : 'free';

    setStage(
      'FROM WHAT YOU JUST PLAYED',
      plan.headline,
      plan.instruction,
      true,
    );
    clear(workbench);

    const row = noteRow(phrase.notes);
    workbench.appendChild(h('section', { class:'coach-task' },
      h('p', { class:'coach-task-title', text:melody.headline }),
      h('p', { class:'muted', text:melody.detail }),
      row,
      h('div', { class:'coach-task-actions' },
        button('Practice this exact phrase', () => practicePhrase(phrase.notes, 'your phrase'), 'btn-primary'),
        button('Make music from it', () => openCreate(phrase, analysis), 'btn-quiet'),
      ),
      routeFor(phrase.notes, analysis),
      h('div', { class:'coach-after-task' },
        button('Back to what you were going to teach me', () => renderTeacherHome(false), 'coach-text-action'),
      ),
    ));
  }

  function practicePhrase(notes:NoteEvent[], label:string, lessonStep:PathStep|null=null):void {
    freePlayMode = false;
    stopTempo();
    activeTarget = rebase(notes);
    activeTargetLabel = label;
    attemptStartMs = null;

    setStage('PRACTICE', 'Play this back to me.', 'Hear it once. Slow it down if needed. Then give me one take.', true);
    clear(workbench);

    const row = noteRow(activeTarget);
    const feedback = h('div', { class:'coach-inline-feedback' });
    workbench.appendChild(h('section', { class:'coach-task' },
      row,
      h('div', { class:'coach-task-actions' },
        button('Hear it', () => { void context.player.play(activeTarget!, {
          onNote:(index) => highlightNote(row, index),
          onEnd:() => highlightNote(row, null),
        }); }, 'btn-primary'),
        button('75%', () => { void context.player.play(activeTarget!, { speed:.75 }); }, 'btn-quiet'),
        button('50%', () => { void context.player.play(activeTarget!, { speed:.5 }); }, 'btn-quiet'),
      ),
      routeFor(activeTarget, lessonStep ? null : currentAnalysis),
      h('div', { class:'coach-practice-capture' },
        button('Start my take', async () => {
          if (!context.listening) await context.startListening();
          attemptStartMs = context.session.currentTimeMs;
          speak('Your turn. Play it once, then pause.', true);
        }, 'btn-primary'),
        button('Check my take', () => checkTake(feedback, lessonStep), 'btn-quiet'),
      ),
      feedback,
    ));
  }

  function checkTake(feedback:HTMLElement, lessonStep:PathStep|null):void {
    if (!activeTarget || attemptStartMs === null) {
      replace(feedback, h('p', { class:'muted', text:'Press Start my take first.' }));
      return;
    }

    const attempt = context.session.memory.all().filter((note) => note.startMs >= attemptStartMs!);
    const result = practiceAttempt(activeTarget, attempt, {
      requiredAccuracy:.82,
      tempoTolerance:.28,
    });
    const passed = result.accuracy >= .82 && Math.abs(result.tempoRatio - 1) <= .32;

    playerModel.recordPractice(practiceObservation({
      source:'live-coach',
      targetId:activeTargetLabel,
      reference:activeTarget,
      attempt,
      accuracy:result.accuracy,
      tempoRatio:result.tempoRatio,
      passed,
      firstMistakeIndex:result.firstMistakeIndex,
    }));

    clear(feedback);
    feedback.appendChild(h('p', {
      class:passed ? 'coach-good' : '',
      text:`${Math.round(result.accuracy * 100)}% note match. ${result.feedback.join(' ')}`,
    }));

    if (passed) {
      speak('Good. Stop drilling it. Use it like music now.', true);
      if (lessonStep) {
        feedback.appendChild(button('Next lesson', () => finishStep(lessonStep, true), 'btn-primary'));
      } else {
        feedback.appendChild(button('Back to my lesson', () => renderTeacherHome(false), 'btn-primary'));
      }
    } else if (result.firstMistakeIndex !== null) {
      const hard = hardPartTarget(activeTarget, result.firstMistakeIndex);
      if (hard.length >= 2) {
        const hardRow = noteRow(hard);
        feedback.appendChild(h('div', { class:'coach-hard-part-minimal' },
          h('strong', { text:'This tiny transition is the problem.' }),
          h('p', { class:'muted', text:'Do not restart the whole riff. Loop only this.' }),
          hardRow,
          h('div', { class:'coach-task-actions' },
            button('Loop 4× · 50%', () => loop(hard, 4, .5), 'btn-primary'),
            button('Loop 4× · 75%', () => loop(hard, 4, .75), 'btn-quiet'),
            button('Practice only this', () => practicePhrase(hard, `${activeTargetLabel} · hard part`, lessonStep), 'btn-quiet'),
          ),
        ));
      }
    }
    attemptStartMs = null;
  }

  function loop(notes:NoteEvent[], times:number, speed:number):void {
    void (async () => {
      for (let i = 0; i < times; i += 1) {
        await context.player.play(notes, { speed });
        if (i < times - 1) await new Promise((resolve) => window.setTimeout(resolve, 160));
      }
    })();
  }

  function openCreate(phrase:Phrase, analysis:PhraseAnalysis):void {
    freePlayMode = false;
    const branches = motifBranches(phrase.notes);
    const bestChord = suggestChords(analysis, 4)
      .map((item) => ({ ...item, symbol:compactChordLabel(item.label) }))
      .find((item) => chordShape(item.symbol));

    setStage('MAKE MUSIC', 'Keep your idea. Change one thing.', 'Pick one experiment. Your phrase stays the source material.', true);
    clear(workbench);

    const host = h('div', { class:'coach-variant-preview' },
      h('p', { class:'muted', text:'Choose one change.' }),
    );

    workbench.appendChild(h('section', { class:'coach-task' },
      h('div', { class:'coach-experiment-row' },
        ...branches.map((branch) => button(
          branch.kind === 'rhythm' ? 'Change rhythm'
            : branch.kind === 'space' ? 'Add space'
              : 'Lift the second half',
          () => showVariation(branch.label, branch.principle, branch.notes, phrase.notes, host),
          'btn-quiet',
        )),
      ),
      host,
      bestChord ? h('div', { class:'coach-one-harmony' },
        h('span', { class:'coach-heard-label', text:'ONE HARMONY IDEA' }),
        h('p', { text:`Try ${bestChord.symbol} underneath it. ${Math.round(bestChord.fit * 100)}% of the melody notes already fit inside that chord.` }),
        button(`Teach me ${bestChord.symbol}`, () => teachChordOutsideLesson(
          bestChord.symbol,
          'This is one harmonic color that fits the melody you actually played.',
        ), 'btn-quiet'),
      ) : null,
      h('div', { class:'coach-after-task' },
        button('Back to my lesson', () => renderTeacherHome(false), 'coach-text-action'),
      ),
    ));
  }

  function showVariation(
    label:string,
    principle:string,
    variation:NoteEvent[],
    original:NoteEvent[],
    host:HTMLElement,
  ):void {
    clear(host);
    host.append(
      h('p', { class:'coach-task-title', text:label }),
      h('p', { class:'muted', text:principle }),
      h('div', { class:'coach-task-actions' },
        button('A/B it', () => { void (async () => {
          await context.player.play(original);
          await new Promise((resolve) => window.setTimeout(resolve, 180));
          await context.player.play(variation);
        })(); }, 'btn-primary'),
        button('Practice this version', () => practicePhrase(variation, label), 'btn-quiet'),
        button('Keep this version', async () => {
          await context.library.saveRiff(variation, { comment:`Live Coach · ${label}` });
          context.say('Saved. Your original is untouched.');
        }, 'btn-quiet'),
      ),
    );
  }

  function stopTempo():void {
    if (tempoTimer) window.clearInterval(tempoTimer);
    tempoTimer = 0;
  }

  async function startTempo(bpm:number):Promise<void> {
    stopTempo();
    await unlockAudio();
    let beat = 0;
    const click = () => {
      const ctx = audioContext();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.frequency.value = beat % 4 === 0 ? 1320 : 880;
      gain.gain.setValueAtTime(beat % 4 === 0 ? .14 : .08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + .04);
      oscillator.connect(gain);
      gain.connect(audioOutput());
      oscillator.start();
      oscillator.stop(ctx.currentTime + .05);
      beat += 1;
    };
    click();
    tempoTimer = window.setInterval(click, 60_000 / bpm);
  }

  async function coachLatestPhrase():Promise<void> {
    if (!freePlayMode || attemptStartMs !== null) return;
    const latest = context.session.phrases().at(-1);
    if (!latest || latest.id === lastPhraseId || latest.notes.length < 3) return;
    lastPhraseId = latest.id;

    const recall = await context.session.recallPhrase(latest.id);
    if (!recall || disposed) return;

    playerModel.recordPhrase(phraseObservation(latest.id, recall.analysis));
    renderReactivePhrase(latest, recall.analysis);
  }

  function onFrame(frame:Frame):void {
    if (frame.rms > .02) lastNoteAt = Date.now();
    if (frame.hz > 0 && frame.clarity > .7) {
      heardNote.textContent = midiToName(Math.round(frequencyToMidi(frame.hz)));
    } else {
      heardNote.textContent = '—';
    }
  }

  function onChord(chord:ChordDetection):void {
    const clean = normalizeChordLabel(chord.label);
    heardChord.textContent = clean;
    heardChord.classList.toggle('is-known', Boolean(chordShape(clean)));
  }

  function onChordExplain(explanation:ChordExplanation):void {
    updateChordTarget(explanation);
  }

  function update():void {}

  const timer = window.setInterval(async () => {
    if (checking) return;
    checking = true;
    try {
      await coachLatestPhrase();
      flushVoice();
    } finally {
      checking = false;
    }
  }, 650);

  renderTeacherHome(false);

  return {
    element,
    update,
    onNotes:update,
    onFrame,
    onChord,
    onChordExplain,
    dispose() {
      disposed = true;
      window.clearInterval(timer);
      stopTempo();
      context.setChordDiagnostics?.(false);
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    },
  };
}
