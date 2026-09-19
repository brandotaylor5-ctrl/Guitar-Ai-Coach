/**
 * Live Coach — deliberately one screen, one instruction, one active task.
 *
 * The app can know a lot without showing a lot. This view keeps recognition
 * and analysis in the background and reveals only what the player needs next.
 */

import type { Frame } from '../../src/audio/noteTracker.ts';
import type { NoteEvent, Phrase, PhraseAnalysis } from '../../src/types.ts';
import { frequencyToMidi, midiToName } from '../../src/music/notes.ts';
import { chordShape, chordShapeMidis } from '../../src/music/chordShapes.ts';
import { inferFingering, renderTab } from '../../src/music/fretboard.ts';
import { scaleById, scaleBox } from '../../src/music/scales.ts';
import { suggestChords } from '../../src/create/suggest.ts';
import { motifBranches } from '../../src/create/songwriting.ts';
import { practiceAttempt } from '../../src/practice/practice.ts';
import { checkChordShape } from '../../src/audio/chordCheck.ts';
import type { ChordCheck } from '../../src/audio/chordCheck.ts';
import type { ChordDetection, ChordExplanation } from '../audio/chordDetect.ts';
import { compactChordLabel, normalizeChordLabel, readMelody, readTime } from '../../src/coach/liveTutor.ts';
import { PlayerModelStore, phraseObservation, practiceObservation } from '../../src/coach/playerModel.ts';
import { hardPartTarget, learningWindow, planPhrase } from '../../src/coach/oneRoom.ts';
import { audioContext, audioOutput, unlockAudio } from '../audio/context.ts';
import { chordTeachingCard } from '../ui/chordCard.ts';
import { h, clear, replace } from '../ui/dom.ts';
import { button, fretboardDiagram, highlightNote, noteRow, scaleDiagram, tabBlock } from '../ui/render.ts';
import type { AppContext, View } from './context.ts';

function storage(): Storage | { getItem(key:string):string|null; setItem(key:string,value:string):void } {
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

function rebase(notes:NoteEvent[]):NoteEvent[] {
  if (!notes.length) return [];
  const origin = notes[0]!.startMs;
  return notes.map((note) => ({ ...note, startMs: note.startMs - origin }));
}

function preferredVoice():SpeechSynthesisVoice|null {
  if (!('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices().filter((voice) => /^en(-|_)/i.test(voice.lang));
  const preferred = [
    /samantha/i, /alex/i, /daniel/i, /aaron/i, /ava/i,
    /natural/i, /google us english/i, /microsoft.*english/i,
  ];
  for (const pattern of preferred) {
    const hit = voices.find((voice) => pattern.test(voice.name));
    if (hit) return hit;
  }
  return voices[0] ?? null;
}

export function coachView(context:AppContext):View {
  let disposed = false;
  let checking = false;
  let lastPhraseId = '';
  let lastNoteAt = 0;
  let lastSpokenAt = 0;
  let pendingVoice:string|null = null;
  let voiceEnabled = true;

  let currentAnalysis:PhraseAnalysis|null = null;
  let activeTarget:NoteEvent[]|null = null;
  let activeTargetLabel = '';
  let attemptStartMs:number|null = null;

  let chordTarget:string|null = null;
  let chordTargetHost:HTMLElement|null = null;
  let chordTargetBest = -1;
  let chordTargetClean = false;

  let tempoTimer = 0;
  const model = new PlayerModelStore(storage());

  const stageKicker = h('p', { class:'coach-stage-kicker', text:'START HERE' });
  const stageTitle = h('h1', { text:'Pick up your guitar.' });
  const stageText = h('p', {
    class:'coach-stage-text',
    text:'Press Start. Play anything you know for about 15 seconds. Chords, notes, a riff — it does not matter. I’ll choose one thing to work on.',
  });
  const stageActions = h('div', { class:'coach-stage-actions' });

  const heardNote = h('span', { text:'—' });
  const heardChord = h('button', { class:'coach-heard-chord', type:'button', text:'—' });
  const heardTempo = h('span', { text:'—' });
  const heardLine = h('div', { class:'coach-heard-line' },
    h('span', { class:'coach-heard-label', text:'I hear' }),
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

  const startButton = button('Start Coach', () => { void toggleListening(); }, 'btn-primary coach-start');

  stageActions.append(startButton, voiceButton);

  const element = h('div', { class:'view coach-minimal' },
    h('section', { class:'coach-stage' },
      h('div', { class:'coach-stage-copy' }, stageKicker, stageTitle, stageText),
      stageActions,
      heardLine,
    ),
    workbench,
  );

  heardChord.addEventListener('click', () => {
    if (heardChord.textContent && heardChord.textContent !== '—') {
      teachChord(heardChord.textContent, 'You played this chord. Here is the hand shape, then I’ll listen to your version.');
    }
  });

  function setStage(kicker:string, title:string, text:string, speakIt=false):void {
    stageKicker.textContent = kicker;
    stageTitle.textContent = title;
    stageText.textContent = text;
    if (speakIt) speak(`${title} ${text}`);
  }

  function speak(text:string, force=false):void {
    if (!voiceEnabled || !('speechSynthesis' in window)) return;
    const now = Date.now();
    if (!force && now - lastNoteAt < 1350) {
      pendingVoice = text;
      return;
    }
    if (!force && now - lastSpokenAt < 4500) {
      pendingVoice = text;
      return;
    }
    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      pendingVoice = text;
      return;
    }

    lastSpokenAt = now;
    pendingVoice = null;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.98;
    utterance.pitch = 0.92;
    utterance.volume = 1;
    utterance.voice = preferredVoice();
    window.speechSynthesis.speak(utterance);
  }

  function flushVoice():void {
    if (!pendingVoice || Date.now() - lastNoteAt < 1350) return;
    const next = pendingVoice;
    pendingVoice = null;
    speak(next);
  }

  async function toggleListening():Promise<void> {
    if (context.listening) {
      await context.stopListening();
      startButton.textContent = 'Start Coach';
      setStage('READY WHEN YOU ARE', 'Pick the guitar back up.', 'Press Start and I’ll listen again.');
      return;
    }

    voiceEnabled = true;
    voiceButton.textContent = 'Voice on';
    voiceButton.classList.remove('is-off');

    // Speak while this click is still a direct user gesture; mobile browsers
    // are much more reliable about allowing speech here than after async work.
    speak('I’m here. Play anything you know for about fifteen seconds. Don’t perform for me. I’m just figuring out where to start.', true);
    await unlockAudio();
    await context.startListening();

    if (context.listening) {
      startButton.textContent = 'Stop';
      clear(workbench);
      setStage(
        'I’M LISTENING',
        'Play anything for about 15 seconds.',
        'Chords, single notes, a riff, mistakes — all useful. Leave a short pause when you’re done and I’ll choose the first thing to work on.',
      );
    }
  }

  function playChord(label:string):void {
    const shape = chordShape(normalizeChordLabel(label));
    if (!shape) return;
    const notes = chordShapeMidis(shape).map((midi, index) => ({
      midi,
      startMs: index * 45,
      durationMs: 1200,
      confidence: 1,
      velocity: .62,
    }));
    void context.player.play(notes);
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

  function teachChord(label:string, reason:string):void {
    const clean = normalizeChordLabel(label);
    const shape = chordShape(clean);
    stopTempo();
    clear(workbench);

    if (!shape) {
      setStage('CHORD', clean, 'I can hear the chord name, but I do not have a beginner-safe hand map for it. I will not invent one.', true);
      return;
    }

    setStage('CHORD LESSON', `Learn ${clean}`, reason, true);
    const feedback = h('div', { class:'coach-inline-feedback' });
    chordTarget = clean;
    chordTargetHost = feedback;
    chordTargetBest = -1;
    chordTargetClean = false;
    context.setChordDiagnostics?.(true);

    workbench.append(
      chordTeachingCard(clean, context.player, { compact:true }),
      h('section', { class:'coach-task' },
        h('p', { class:'coach-task-title', text:'Now you.' }),
        h('p', { class:'muted', text:'Put the shape down and give me two slow strums.' }),
        h('div', { class:'coach-task-actions' },
          button('Hear it once', () => playChord(clean), 'btn-quiet'),
          button(`Listen to my ${clean}`, async () => {
            if (!context.listening) await context.startListening();
            replace(feedback, h('p', { class:'muted', text:'Listening. Two slow strums.' }));
          }, 'btn-primary'),
        ),
        feedback,
      ),
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
      setStage('YES', `That’s ${chordTarget}.`, 'Play it one more time without squeezing harder. Then go back to whatever you were playing.', true);
    }
  }

  function routeFor(notes:NoteEvent[], analysis:PhraseAnalysis|null):HTMLElement {
    const positions = inferFingering(notes.map((note) => note.midi), {
      tuning:context.session.tuning,
      maxFret:18,
    });
    const window = learningWindow(positions.map((position) => position.fret), 18);

    const route = h('details', { class:'coach-route-minimal' },
      h('summary', { text:'Show me exactly where I can play this' }),
      h('p', { class:'muted', text:'This is one low-travel route. A pitch can exist in several places on guitar, so I am not pretending this is definitely where your hand was.' }),
      h('span', { class:'badge', text:`frets ${window.startFret}–${window.endFret}` }),
      fretboardDiagram(positions, context.session.tuning),
      tabBlock(renderTab(positions, context.session.tuning)),
    );

    if (analysis && analysis.scale.confidence >= .5) {
      const scale = scaleById(scaleId(analysis.scale.scale));
      if (scale) {
        const box = scaleBox(
          analysis.scale.tonicPc,
          scale,
          context.session.tuning,
          window.startFret,
          Math.max(4, window.endFret - window.startFret),
        );
        route.appendChild(h('details', { class:'coach-scale-neighborhood' },
          h('summary', { text:`Show the nearby ${analysis.scale.label} notes` }),
          h('p', { class:'muted', text:'Do not memorize this whole picture. Find the notes from your phrase first, then notice what is one step away.' }),
          scaleDiagram(box, context.session.tuning),
        ));
      }
    }
    return route;
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

  function renderPhrase(phrase:Phrase, analysis:PhraseAnalysis):void {
    currentAnalysis = analysis;
    activeTarget = null;
    attemptStartMs = null;
    chordTarget = null;
    chordTargetHost = null;
    stopTempo();
    context.setChordDiagnostics?.(false);

    const melody = readMelody(analysis);
    const time = readTime(analysis, null);
    const plan = planPhrase(analysis);
    heardTempo.textContent = time.bpm ? `~${time.bpm}` : 'free';

    setStage('START HERE', plan.headline, plan.instruction, true);
    clear(workbench);

    const row = noteRow(phrase.notes);
    const taskActions = h('div', { class:'coach-task-actions' });

    if (plan.priority === 'timing' && analysis.rhythm.bpm > 0) {
      const target = Math.max(45, Math.round(analysis.rhythm.bpm * .82));
      taskActions.append(
        button(`Start ${target} BPM`, () => { void startTempo(target); }, 'btn-primary'),
        button('Practice this phrase', () => practicePhrase(phrase.notes, 'your phrase'), 'btn-quiet'),
      );
    } else {
      taskActions.append(
        button('Practice this phrase', () => practicePhrase(phrase.notes, 'your phrase'), 'btn-primary'),
      );
    }

    workbench.appendChild(h('section', { class:'coach-task' },
      h('div', { class:'coach-idea-head' },
        h('div', {},
          h('p', { class:'coach-task-title', text:melody.headline }),
          h('p', { class:'muted', text:melody.detail }),
        ),
        time.bpm ? h('span', { class:'badge', text:`~${time.bpm} BPM` }) : null,
      ),
      row,
      taskActions,
      routeFor(phrase.notes, analysis),
      h('div', { class:'coach-after-task' },
        button('Make music from this', () => openCreate(phrase, analysis), 'coach-text-action'),
        button('Save this idea', () => { void savePhrase(phrase); }, 'coach-text-action'),
      ),
    ));
  }

  function practicePhrase(notes:NoteEvent[], label:string):void {
    stopTempo();
    activeTarget = rebase(notes);
    activeTargetLabel = label;
    attemptStartMs = null;
    clear(workbench);
    setStage('PRACTICE', 'Play this back to me.', 'Hear it once. Slow it down if you need to. Then press Start my take and play it one time.', true);

    const row = noteRow(activeTarget);
    const feedback = h('div', { class:'coach-inline-feedback', id:'coach-practice-feedback' });

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
      routeFor(activeTarget, currentAnalysis),
      h('div', { class:'coach-practice-capture' },
        button('Start my take', async () => {
          if (!context.listening) await context.startListening();
          attemptStartMs = context.session.currentTimeMs;
          setStage('YOUR TURN', 'I’m listening.', 'Play the phrase once. Leave a short pause, then press Check my take.', true);
        }, 'btn-primary'),
        button('Check my take', () => checkTake(feedback), 'btn-quiet'),
      ),
      feedback,
      h('div', { class:'coach-after-task' },
        button('Back to my idea', () => {
          if (currentPhrase && currentAnalysis) renderPhrase(currentPhrase, currentAnalysis);
        }, 'coach-text-action'),
      ),
    ));
  }

  function checkTake(feedback:HTMLElement):void {
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

    model.recordPractice(practiceObservation({
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
      setStage('GOOD', 'Stop drilling it.', 'Now play the same phrase like music instead of an exercise.', true);
    } else if (result.firstMistakeIndex !== null) {
      const hard = hardPartTarget(activeTarget, result.firstMistakeIndex);
      if (hard.length >= 2) {
        const hardRow = noteRow(hard);
        feedback.appendChild(h('div', { class:'coach-hard-part-minimal' },
          h('strong', { text:'This transition is the problem.' }),
          h('p', { class:'muted', text:'Do not restart the whole riff. Loop only these notes.' }),
          hardRow,
          h('div', { class:'coach-task-actions' },
            button('Loop 4× · 50%', () => loop(hard, 4, .5), 'btn-primary'),
            button('Loop 4× · 75%', () => loop(hard, 4, .75), 'btn-quiet'),
            button('Practice only this', () => practicePhrase(hard, `${activeTargetLabel} · hard part`), 'btn-quiet'),
          ),
        ));
        setStage('FOUND IT', 'This is where it breaks.', 'Fix the tiny transition below. Then put it back into the full phrase.', true);
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
    stopTempo();
    const branches = motifBranches(phrase.notes);
    const bestChord = suggestChords(analysis, 4)
      .map((item) => ({ ...item, symbol:compactChordLabel(item.label) }))
      .find((item) => chordShape(item.symbol));

    setStage('MAKE MUSIC', 'Keep your idea. Change one thing.', 'Pick one experiment. A/B it against what you played. Keep it only if your ear likes it.', true);
    clear(workbench);

    const previewHost = h('div', { class:'coach-variant-preview' },
      h('p', { class:'muted', text:'Choose one change below.' }),
    );

    const experimentRow = h('div', { class:'coach-experiment-row' });
    for (const branch of branches) {
      experimentRow.appendChild(button(
        branch.kind === 'rhythm' ? 'Change rhythm'
          : branch.kind === 'space' ? 'Add space'
            : 'Lift the second half',
        () => showVariation(branch.label, branch.principle, branch.notes, phrase.notes, previewHost),
        'btn-quiet',
      ));
    }

    workbench.appendChild(h('section', { class:'coach-task' },
      h('div', { class:'coach-original' },
        h('span', { class:'coach-heard-label', text:'YOUR IDEA' }),
        noteRow(phrase.notes),
        button('Hear mine', () => { void context.player.play(phrase.notes); }, 'coach-text-action'),
      ),
      experimentRow,
      previewHost,
      bestChord ? h('div', { class:'coach-one-harmony' },
        h('span', { class:'coach-heard-label', text:'ONE HARMONY IDEA' }),
        h('p', {}, `Try ${bestChord.symbol} underneath it. ${Math.round(bestChord.fit * 100)}% of your melody notes already fit inside that chord.`),
        button(`Teach me ${bestChord.symbol}`, () => teachChord(
          bestChord.symbol,
          `This is one harmonic color that fits the melody you actually played.`,
        ), 'btn-quiet'),
      ) : null,
      h('div', { class:'coach-after-task' },
        button('Back to learning this phrase', () => renderPhrase(phrase, analysis), 'coach-text-action'),
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
    const row = noteRow(variation);
    host.append(
      h('p', { class:'coach-task-title', text:label }),
      h('p', { class:'muted', text:principle }),
      row,
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

  async function savePhrase(phrase:Phrase):Promise<void> {
    const riff = await context.session.saveRiff(phrase, { comment:'Caught by Live Coach' });
    await context.keepClipFor(riff.versions[0]?.audioRef);
    context.say('Saved.');
  }

  async function coachLatestPhrase():Promise<void> {
    if (attemptStartMs !== null) return;
    const latest = context.session.phrases().at(-1);
    if (!latest || latest.id === lastPhraseId || latest.notes.length < 3) return;
    lastPhraseId = latest.id;

    const recall = await context.session.recallPhrase(latest.id);
    if (!recall || disposed) return;

    currentAnalysis = recall.analysis;
    model.recordPhrase(phraseObservation(latest.id, recall.analysis));
    renderPhrase(latest, recall.analysis);
  }

  function onFrame(frame:Frame):void {
    if (frame.rms > .02) lastNoteAt = Date.now();
    if (frame.hz > 0 && frame.clarity > .7) {
      const midi = frequencyToMidi(frame.hz);
      heardNote.textContent = midiToName(Math.round(midi));
    } else {
      heardNote.textContent = '—';
    }
  }

  function onChord(chord:ChordDetection):void {
    heardChord.textContent = normalizeChordLabel(chord.label);
    heardChord.classList.toggle('is-known', Boolean(chordShape(normalizeChordLabel(chord.label))));
  }

  function onChordExplain(explanation:ChordExplanation):void {
    updateChordTarget(explanation);
  }

  function update():void {
    startButton.textContent = context.listening ? 'Stop' : 'Start Coach';
  }

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

  update();

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
