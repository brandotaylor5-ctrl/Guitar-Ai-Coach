/**
 * One-room Live Coach.
 *
 * The player should never have to leave this screen to understand a chord,
 * learn a phrase, practise a hard transition, connect it to the fretboard, or
 * turn it into music. Other views may still exist as storage/reference, but
 * this is the product.
 */

import type { Frame } from '../../src/audio/noteTracker.ts';
import type { NoteEvent, Phrase, PhraseAnalysis } from '../../src/types.ts';
import { frequencyToMidi, midiToName, pcToName, pitchClass } from '../../src/music/notes.ts';
import { chordShape, chordShapeMidis, beginnerChordShapes } from '../../src/music/chordShapes.ts';
import { inferFingering, renderTab } from '../../src/music/fretboard.ts';
import { scaleById, scaleBox, degreeRole } from '../../src/music/scales.ts';
import { suggestChords } from '../../src/create/suggest.ts';
import { motifBranches } from '../../src/create/songwriting.ts';
import { practiceAttempt } from '../../src/practice/practice.ts';
import { checkChordShape } from '../../src/audio/chordCheck.ts';
import type { ChordCheck } from '../../src/audio/chordCheck.ts';
import type { ChordDetection, ChordExplanation } from '../audio/chordDetect.ts';
import {
  compactChordLabel, inferHarmonyCenter, nextPlayableChord, normalizeChordLabel,
  qualityFamily, readMelody, readTime, readTouch,
} from '../../src/coach/liveTutor.ts';
import {
  PlayerModelStore, buildPlayerProfile, phraseObservation, practiceObservation,
  recommendAdaptiveTask,
} from '../../src/coach/playerModel.ts';
import { hardPartTarget, learningWindow, planPhrase } from '../../src/coach/oneRoom.ts';
import { audioContext, audioOutput, unlockAudio } from '../audio/context.ts';
import { chordDiagram, chordTeachingCard } from '../ui/chordCard.ts';
import { h, clear, replace } from '../ui/dom.ts';
import {
  button, fretboardDiagram, highlightNote, noteRow, scaleDiagram, tabBlock,
} from '../ui/render.ts';
import type { AppContext, View } from './context.ts';

interface HeardChord extends ChordDetection { heardAt: number; }

function memoryStorage(): Storage | {
  getItem(key:string):string|null;
  setItem(key:string,value:string):void;
} {
  try {
    window.localStorage.setItem('__coach_probe__','1');
    window.localStorage.removeItem('__coach_probe__');
    return window.localStorage;
  } catch {
    const memory=new Map<string,string>();
    return {
      getItem:(key)=>memory.get(key)??null,
      setItem:(key,value)=>{memory.set(key,value);},
    };
  }
}

function scaleId(name:string):string {
  const normalized=name.toLowerCase();
  if(normalized.includes('minor pentatonic')) return 'minor-pent';
  if(normalized.includes('major pentatonic')) return 'major-pent';
  if(normalized.includes('blues')) return 'blues';
  if(normalized.includes('mixolydian')) return 'mixolydian';
  if(normalized.includes('dorian')) return 'dorian';
  if(normalized.includes('natural minor')||normalized==='minor') return 'minor';
  if(normalized.includes('major')) return 'major';
  return 'minor-pent';
}

function compactNotes(notes:NoteEvent[], max=9):string {
  const names=notes.slice(0,max).map((note)=>midiToName(note.midi));
  return names.join(' → ')+(notes.length>max?' …':'');
}

function cloneRebased(notes:NoteEvent[]):NoteEvent[] {
  if(!notes.length) return [];
  const origin=notes[0]!.startMs;
  return notes.map((note)=>({...note,startMs:note.startMs-origin}));
}

export function coachView(context:AppContext):View {
  let disposed=false;
  let checking=false;
  let lastPhraseId='';
  let previousAnalysis:PhraseAnalysis|null=null;
  let lastNoteAt=0;
  let voiceEnabled=false;
  let pendingVoice:string|null=null;
  let lastSpokenAt=0;

  let currentPhrase:Phrase|null=null;
  let currentAnalysis:PhraseAnalysis|null=null;
  let activeTarget:NoteEvent[]|null=null;
  let activeTargetLabel='';
  let attemptStartMs:number|null=null;

  let chordTarget:string|null=null;
  let chordTargetHost:HTMLElement|null=null;
  let chordTargetBest=-1;
  let chordTargetClean=false;

  let tempoTimer=0;
  let currentTempo=0;
  const chordHistory:HeardChord[]=[];

  const model=new PlayerModelStore(memoryStorage());

  // --- compact "now" ------------------------------------------------------
  const nowChord=h('strong',{class:'coach-now-value',text:'—'});
  const nowChordShape=h('div',{class:'coach-now-chord-shape'});
  const nowNote=h('strong',{class:'coach-now-value',text:'—'});
  const nowTempo=h('strong',{class:'coach-now-value',text:'—'});
  const nowHome=h('strong',{class:'coach-now-value',text:'—'});
  const nowDetail=h('span',{class:'muted coach-now-detail',text:'Start listening and play normally.'});

  const coachFeed=h('div',{class:'coach-conversation','aria-live':'polite'});
  const workbench=h('div',{class:'coach-workbench'});
  const progression=h('div',{class:'coach-progression muted'});
  const memoryLine=h('div',{class:'coach-memory-line muted'});

  const listenButton=button(context.listening?'Stop listening':'Start Coach',async()=>{
    if(context.listening) await context.stopListening();
    else await context.startListening();
  },'btn-primary coach-listen');

  const voiceButton=button('Voice: off',()=>{
    voiceEnabled=!voiceEnabled;
    voiceButton.textContent=`Voice: ${voiceEnabled?'on':'off'}`;
    voiceButton.classList.toggle('is-live',voiceEnabled);
    if(!voiceEnabled&&'speechSynthesis' in window){
      pendingVoice=null;
      window.speechSynthesis.cancel();
    } else if(voiceEnabled) {
      speak('Voice coach on. Play. I will wait for a pause before I talk.',true);
    }
  },'btn-quiet');

  const whatWasThat=button('What did I just play?',async()=>{
    const recall=await context.session.whatDidIJustPlay();
    if(!recall){
      addCoach('I need a few notes and a short pause first.','teach');
      return;
    }
    currentPhrase=recall.phrase;
    currentAnalysis=recall.analysis;
    renderPhraseWorkbench(recall.phrase,recall.analysis,true);
  },'btn-quiet');

  const element=h('div',{class:'view coach-one-room'},
    h('section',{class:'panel coach-hero'},
      h('div',{},
        h('p',{class:'lab-kicker',text:'LIVE COACH'}),
        h('h1',{text:'Play guitar. I’ll stay with you.'}),
        h('p',{class:'muted',text:'I’ll name what I hear, show the hand when a chord matters, teach the phrase you just played, isolate mistakes, explain the fretboard around it, and help you turn good accidents into music — without sending you somewhere else.'}),
      ),
      h('div',{class:'coach-hero-actions'},listenButton,voiceButton,whatWasThat),
    ),

    h('section',{class:'panel coach-now'},
      h('div',{class:'coach-now-grid'},
        h('article',{class:'coach-now-item'},
          h('span',{class:'live-hearing-label',text:'CHORD'}),
          nowChord,
          nowChordShape,
        ),
        h('article',{class:'coach-now-item'},
          h('span',{class:'live-hearing-label',text:'NOTE'}),
          nowNote,
        ),
        h('article',{class:'coach-now-item'},
          h('span',{class:'live-hearing-label',text:'TEMPO'}),
          nowTempo,
        ),
        h('article',{class:'coach-now-item'},
          h('span',{class:'live-hearing-label',text:'HOME'}),
          nowHome,
        ),
      ),
      nowDetail,
      progression,
    ),

    h('section',{class:'panel coach-talk'},
      h('div',{class:'coach-section-heading'},
        h('div',{},
          h('p',{class:'eyebrow',text:'COACH'}),
          h('h2',{text:'One thing at a time.'}),
        ),
      ),
      coachFeed,
    ),

    workbench,

    h('details',{class:'panel coach-memory'},
      h('summary',{text:'What Coach remembers about my playing'}),
      memoryLine,
      h('div',{class:'practice-actions'},
        button('Open saved ideas',()=>context.navigate('library'),'btn-quiet'),
        button('Open structured course',()=>context.navigate('path'),'btn-quiet'),
      ),
    ),
  );

  // --- conversation --------------------------------------------------------

  function speak(text:string,force=false):void {
    if(!voiceEnabled||!('speechSynthesis' in window)) return;
    const now=Date.now();
    if(!force&&now-lastNoteAt<1400){pendingVoice=text;return;}
    if(!force&&now-lastSpokenAt<7000){pendingVoice=text;return;}
    if(window.speechSynthesis.speaking||window.speechSynthesis.pending){pendingVoice=text;return;}
    lastSpokenAt=now;
    pendingVoice=null;
    const utterance=new SpeechSynthesisUtterance(text);
    utterance.rate=1.02;
    utterance.pitch=.96;
    utterance.volume=.9;
    window.speechSynthesis.speak(utterance);
  }

  function flushVoice():void {
    if(!pendingVoice) return;
    if(Date.now()-lastNoteAt<1400) return;
    const text=pendingVoice;
    pendingVoice=null;
    speak(text);
  }

  function addCoach(text:string,kind:'hear'|'teach'|'success'|'create'='hear',action?:HTMLElement):void {
    coachFeed.appendChild(h('article',{class:`coach-turn is-${kind}`},
      h('span',{class:'coach-avatar',text:'✦'}),
      h('div',{class:'coach-turn-body'},
        h('p',{text}),
        action??null,
      ),
    ));
    while(coachFeed.children.length>5) coachFeed.firstElementChild?.remove();
    coachFeed.scrollTop=coachFeed.scrollHeight;
    if(kind!=='hear') speak(text);
  }

  addCoach('Start Coach and play anything. I’ll teach from the guitar that is actually in your hands.','hear');

  // --- memory summary ------------------------------------------------------

  function renderMemory():void {
    const profile=buildPlayerProfile(model.load());
    clear(memoryLine);
    if(!profile.phraseCount&&!profile.practiceCount){
      memoryLine.appendChild(h('p',{text:'Nothing permanent yet. I’ll build this from phrases you play and practice attempts I can actually measure.'}));
      return;
    }
    const adaptive=recommendAdaptiveTask(profile);
    memoryLine.append(
      h('p',{text:`${profile.phraseCount} phrases remembered · ${profile.practiceCount} measured attempts${profile.tempo.median?` · usual pulse ~${Math.round(profile.tempo.median)} BPM`:''}.`}),
      h('p',{},h('strong',{text:'What I’d work on next: '}),adaptive.title),
      h('p',{class:'muted',text:adaptive.reason}),
    );
  }

  // --- chord coaching ------------------------------------------------------

  function playChord(label:string):void {
    const shape=chordShape(normalizeChordLabel(label));
    if(!shape) return;
    const events=chordShapeMidis(shape).map((midi,index)=>({
      midi,startMs:index*42,durationMs:1150,confidence:1,velocity:.62,
    }));
    void context.player.play(events);
  }

  function chordCheckView(check:ChordCheck):HTMLElement {
    return h('div',{class:`coach-chord-check${check.clean?' is-clean':''}`},
      h('strong',{text:check.advice[0]??(check.clean?'That chord is ringing.':'Try it again.')}),
      h('div',{class:'coach-string-row'},
        ...[...check.strings].reverse().map((string)=>h('span',{
          class:`coach-string is-${string.verdict}`,
          text:`${string.verdict==='ringing'?'●':string.verdict==='missing'?'✕':string.verdict==='unclear'?'?':'×'} ${string.stringNumber}`,
        })),
      ),
      ...check.advice.slice(1,3).map((line)=>h('p',{class:'muted',text:line})),
    );
  }

  function teachChord(label:string,reason:string):void {
    const clean=normalizeChordLabel(label);
    const shape=chordShape(clean);
    clear(workbench);
    stopTempo();

    if(!shape){
      workbench.appendChild(h('section',{class:'panel coach-focus'},
        h('p',{class:'eyebrow',text:'WORK ON THIS'}),
        h('h2',{text:clean}),
        h('p',{text:reason}),
        h('p',{class:'muted',text:'I can name that sound, but I do not have a beginner-safe physical map stored for it. I will not invent one.'}),
      ));
      return;
    }

    const feedback=h('div',{class:'coach-inline-feedback'});
    chordTargetHost=feedback;
    chordTarget=clean;
    chordTargetBest=-1;
    chordTargetClean=false;
    context.setChordDiagnostics?.(true);

    workbench.append(
      h('section',{class:'panel coach-focus'},
        h('p',{class:'eyebrow',text:'WORK ON THIS · CHORD'}),
        h('h2',{text:`${shape.name} · ${clean}`}),
        h('p',{text:reason}),
        h('div',{class:'practice-actions'},
          button('Hear the chord',()=>playChord(clean),'btn-quiet'),
          button(`Listen to my ${clean}`,async()=>{
            if(!context.listening) await context.startListening();
            replace(feedback,h('p',{class:'muted',text:`I’m listening specifically for ${clean}. Put the hand down and give me two slow strums.`}));
          },'btn-primary'),
        ),
        feedback,
      ),
      chordTeachingCard(clean,context.player,{compact:true}),
    );
    workbench.scrollIntoView({behavior:'smooth',block:'nearest'});
  }

  function updateChordTarget(explanation:ChordExplanation):void {
    if(!chordTarget||!chordTargetHost) return;
    const shape=chordShape(chordTarget);
    if(!shape) return;
    const check=checkChordShape(explanation.perMidi,shape,context.session.tuning);
    const score=check.strings.filter((s)=>s.verdict==='ringing'||s.verdict==='unclear').length;
    if(score<chordTargetBest) return;
    chordTargetBest=score;
    replace(chordTargetHost,chordCheckView(check));
    if(check.clean&&!chordTargetClean){
      chordTargetClean=true;
      addCoach(`Yep. That’s ${chordTarget}. Keep the hand relaxed and make it ring once more before you leave it.`,'success');
    }
  }

  function renderProgression():void {
    clear(progression);
    if(!chordHistory.length){
      progression.classList.add('muted');
      progression.appendChild(h('span',{text:'Your chord story will build here as you play.'}));
      return;
    }
    progression.classList.remove('muted');
    progression.appendChild(h('span',{class:'coach-progression-label',text:'you played ' }));
    chordHistory.slice(-5).forEach((chord,index)=>{
      if(index) progression.appendChild(h('span',{text:' → ',class:'muted'}));
      progression.appendChild(button(chord.label,()=>teachChord(chord.label,`You played ${chord.label}. Here is the exact beginner hand shape I know for it.`),'coach-chord-pill'));
    });

    const center=inferHarmonyCenter(chordHistory);
    const move=nextPlayableChord(center,chordHistory.at(-1),beginnerChordShapes().map((shape)=>shape.chord));
    if(move&&chordShape(move.label)){
      progression.append(
        h('span',{class:'coach-progression-label',text:' · try '}),
        button(move.label,()=>teachChord(move.label,`${move.reason} Try it after ${chordHistory.at(-1)!.label}.`),'coach-chord-pill is-suggested'),
      );
    }
  }

  // --- tempo ---------------------------------------------------------------

  function stopTempo():void {
    if(tempoTimer) window.clearInterval(tempoTimer);
    tempoTimer=0;
  }

  async function startTempo(bpm:number):Promise<void> {
    stopTempo();
    currentTempo=bpm;
    await unlockAudio();
    let beat=0;
    const click=()=>{
      const ctx=audioContext();
      const osc=ctx.createOscillator();
      const gain=ctx.createGain();
      osc.frequency.value=beat%4===0?1400:920;
      gain.gain.setValueAtTime(beat%4===0?.15:.09,ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+.045);
      osc.connect(gain);
      gain.connect(audioOutput());
      osc.start();
      osc.stop(ctx.currentTime+.055);
      beat++;
    };
    click();
    tempoTimer=window.setInterval(click,60000/bpm);
  }

  // --- phrase teaching -----------------------------------------------------

  function inferredRoute(notes:NoteEvent[]):{positions:ReturnType<typeof inferFingering>;startFret:number;endFret:number} {
    const positions=inferFingering(notes.map((n)=>n.midi),{tuning:context.session.tuning,maxFret:18});
    const window=learningWindow(positions.map((p)=>p.fret),18);
    return {positions,...window};
  }

  function phraseRouteBlock(analysis:PhraseAnalysis):HTMLElement {
    const {positions,startFret,endFret}=inferredRoute(analysis.phrase.notes);
    const scale=scaleById(scaleId(analysis.scale.scale));
    const tonic=analysis.scale.confidence>=.45?analysis.scale.tonicPc:analysis.homePc;

    const block=h('div',{class:'coach-route'},
      h('div',{class:'coach-route-head'},
        h('div',{},
          h('h3',{text:'One playable route'}),
          h('p',{class:'muted',text:'I can hear pitch, not which duplicate fret you used. This is a low-travel route you can actually practise.'}),
        ),
        h('span',{class:'badge',text:`frets ${startFret}–${endFret}`}),
      ),
      fretboardDiagram(positions,context.session.tuning),
      tabBlock(renderTab(positions,context.session.tuning)),
    );

    if(scale&&analysis.scale.confidence>=.45){
      const box=scaleBox(tonic,scale,context.session.tuning,startFret,Math.max(4,endFret-startFret));
      const roles=[...new Set(analysis.phrase.notes.map((note)=>{
        const degree=((pitchClass(note.midi)-tonic)%12+12)%12;
        return degreeRole(degree).short;
      }))];
      block.append(
        h('details',{class:'coach-neighborhood'},
          h('summary',{text:`Show the nearby ${pcToName(tonic)} ${scale.name} notes`}),
          h('p',{class:'muted',text:`Your phrase fits this sound at ${Math.round(analysis.scale.confidence*100)}% confidence. Treat the root as home; the rest are choices around it. Roles you used: ${roles.join(', ')}.`}),
          scaleDiagram(box,context.session.tuning),
        ),
      );
    }
    return block;
  }

  function renderCoachPlan(analysis:PhraseAnalysis):HTMLElement {
    const profile=buildPlayerProfile(model.load());
    const plan=planPhrase(analysis,profile);
    const wrap=h('div',{class:'coach-plan'},
      h('p',{class:'eyebrow',text:'COACH MOVE'}),
      h('h3',{text:plan.headline}),
      h('p',{text:plan.reason}),
      h('p',{class:'coach-plan-do',text:plan.instruction}),
    );

    if(plan.priority==='timing'&&analysis.rhythm.bpm>0){
      const target=Math.max(45,Math.round(analysis.rhythm.bpm*.82));
      wrap.appendChild(h('div',{class:'practice-actions'},
        button(`Give me ${target} BPM`,()=>{void startTempo(target);},'btn-primary'),
        button('Stop click',stopTempo,'btn-quiet'),
      ));
    }
    return wrap;
  }

  function practiceTargetView(target:NoteEvent[],label:string):void {
    activeTarget=cloneRebased(target);
    activeTargetLabel=label;
    attemptStartMs=null;
    stopTempo();

    const row=noteRow(activeTarget);
    clear(workbench);
    workbench.appendChild(h('section',{class:'panel coach-focus coach-practice'},
      h('p',{class:'eyebrow',text:'WORK ON THIS · RIFF'}),
      h('h2',{text:label}),
      h('p',{class:'muted',text:'Do not restart the whole session. This exact phrase is the target now.'}),
      row,
      h('div',{class:'practice-actions'},
        button('Hear it',()=>{void context.player.play(activeTarget!,{
          onNote:(index)=>highlightNote(row,index),
          onEnd:()=>highlightNote(row,null),
        });},'btn-primary'),
        button('75%',()=>{void context.player.play(activeTarget!,{speed:.75});},'btn-quiet'),
        button('50%',()=>{void context.player.play(activeTarget!,{speed:.5});},'btn-quiet'),
        button('Start my take',async()=>{
          if(!context.listening) await context.startListening();
          attemptStartMs=context.session.currentTimeMs;
          addCoach(`I’m listening for ${label}. Play it once, then leave a pause and hit Check my take.`,'teach');
        },'btn-quiet'),
        button('Check my take',checkPractice,'btn-quiet'),
      ),
      phraseRouteBlock({
        ...(currentAnalysis??({} as PhraseAnalysis)),
        phrase:{
          id:'practice-target',
          notes:activeTarget,
          startMs:activeTarget[0]?.startMs??0,
          endMs:(activeTarget.at(-1)?.startMs??0)+(activeTarget.at(-1)?.durationMs??0),
        },
      } as PhraseAnalysis),
      h('div',{class:'coach-inline-feedback',id:'coach-practice-feedback'}),
    ));
  }

  function feedbackNode():HTMLElement|null {
    return workbench.querySelector('#coach-practice-feedback');
  }

  function loopTarget(notes:NoteEvent[],times:number,speed:number):void {
    void (async()=>{
      for(let i=0;i<times;i++){
        await context.player.play(notes,{speed});
        if(i<times-1) await new Promise((resolve)=>window.setTimeout(resolve,180));
      }
    })();
  }

  function checkPractice():void {
    const host=feedbackNode();
    if(!host||!activeTarget){
      addCoach('Choose Practice this phrase first.','teach');
      return;
    }
    if(attemptStartMs===null){
      replace(host,h('p',{class:'muted',text:'Hit Start my take first so I know which notes belong to the attempt.'}));
      return;
    }
    const attempt=context.session.memory.all().filter((note)=>note.startMs>=attemptStartMs!);
    const result=practiceAttempt(activeTarget,attempt,{requiredAccuracy:.82,tempoTolerance:.28});
    const passed=result.accuracy>=.82&&Math.abs(result.tempoRatio-1)<=.32;

    model.recordPractice(practiceObservation({
      source:'live-coach',
      targetId:activeTargetLabel||'live phrase',
      reference:activeTarget,
      attempt,
      accuracy:result.accuracy,
      tempoRatio:result.tempoRatio,
      passed,
      firstMistakeIndex:result.firstMistakeIndex,
    }));
    renderMemory();

    clear(host);
    host.append(
      h('p',{class:`coaching${passed?' is-nailed':''}`,text:`${Math.round(result.accuracy*100)}% note match. ${result.feedback.join(' ')}`}),
    );

    if(passed){
      host.appendChild(h('p',{class:'coach-success',text:'Good. Now stop drilling it. Play it musically again, or make one deliberate change.'}));
      addCoach(`That take is close enough to stop treating it like an exercise. Play it once like music now.`,'success');
    } else if(result.firstMistakeIndex!==null) {
      const hard=hardPartTarget(activeTarget,result.firstMistakeIndex);
      if(hard.length>=2){
        const hardRow=noteRow(hard);
        host.appendChild(h('div',{class:'coach-hard-part'},
          h('strong',{text:'Here. This is the breakdown.'}),
          h('p',{class:'muted',text:'Note before the miss → miss → note after. Fix this transition instead of restarting the whole riff.'}),
          hardRow,
          h('div',{class:'practice-actions'},
            button('Loop it 4× at 50%',()=>loopTarget(hard,4,.5),'btn-primary'),
            button('Loop it 4× at 75%',()=>loopTarget(hard,4,.75),'btn-quiet'),
            button('Make this chunk my target',()=>practiceTargetView(hard,`${activeTargetLabel} · hard part`),'btn-quiet'),
          ),
        ));
      }
    }
    attemptStartMs=null;
  }

  function renderCreate(phrase:Phrase,analysis:PhraseAnalysis):void {
    stopTempo();
    const branches=motifBranches(phrase.notes);
    const chords=suggestChords(analysis,4)
      .map((item)=>({...item,symbol:compactChordLabel(item.label)}))
      .filter((item)=>chordShape(item.symbol));

    clear(workbench);
    const panel=h('section',{class:'panel coach-focus coach-create'},
      h('p',{class:'eyebrow',text:'MAKE MUSIC FROM THIS'}),
      h('h2',{text:'Keep the identity. Change one thing.'}),
      h('p',{class:'muted',text:'No generated “song.” Your phrase stays the source material. Audition one deliberate change and keep only what sounds like you.'}),
      h('div',{class:'coach-original-idea'},
        h('strong',{text:'Your idea'}),
        h('p',{text:compactNotes(phrase.notes)}),
        h('div',{class:'practice-actions'},
          button('Hear mine',()=>{void context.player.play(phrase.notes);},'btn-primary'),
          button('Save mine',()=>{void savePhrase(phrase,'Caught by Live Coach');},'btn-quiet'),
        ),
      ),
    );

    if(branches.length){
      const grid=h('div',{class:'coach-branch-grid'});
      for(const branch of branches){
        grid.appendChild(h('article',{class:'coach-branch'},
          h('strong',{text:branch.label}),
          h('p',{text:branch.principle}),
          h('div',{class:'practice-actions'},
            button('A/B it',()=>{void (async()=>{
              await context.player.play(phrase.notes);
              await new Promise((resolve)=>window.setTimeout(resolve,220));
              await context.player.play(branch.notes);
            })();},'btn-primary'),
            button('Practice this version',()=>practiceTargetView(branch.notes,branch.label),'btn-quiet'),
            button('Keep it',async()=>{
              await context.library.saveRiff(branch.notes,{comment:`Live Coach · ${branch.label}`});
              model.recordCreative(branch.kind,'live-coach');
              renderMemory();
              context.say('Kept. Your original is untouched.');
            },'btn-quiet'),
          ),
        ));
      }
      panel.append(
        h('h3',{text:'Three controlled experiments'}),
        grid,
      );
    }

    if(chords.length){
      panel.append(
        h('h3',{text:'Try harmony underneath it'}),
        h('p',{class:'muted',text:'These chords contain a lot of the notes you already played. Tap one and I’ll teach your hand the chord right here.'}),
        h('div',{class:'coach-harmony-options'},
          ...chords.map((item)=>button(
            `${item.symbol} · ${Math.round(item.fit*100)}% fit`,
            ()=>teachChord(item.symbol,`${Math.round(item.fit*100)}% of your melody’s notes already live inside ${item.symbol}. Learn the hand, then play your phrase again over the feeling of that chord.`),
            'coach-chord-pill',
          )),
        ),
      );
    }

    workbench.appendChild(panel);
    workbench.scrollIntoView({behavior:'smooth',block:'nearest'});
  }

  async function savePhrase(phrase:Phrase,comment:string):Promise<void> {
    const riff=await context.session.saveRiff(phrase,{comment});
    await context.keepClipFor(riff.versions[0]?.audioRef);
    context.say('Saved. That idea is yours.');
  }

  function renderPhraseWorkbench(phrase:Phrase,analysis:PhraseAnalysis,scroll=false):void {
    currentPhrase=phrase;
    currentAnalysis=analysis;
    stopTempo();
    chordTarget=null;
    chordTargetHost=null;

    const melody=readMelody(analysis);
    const time=readTime(analysis,previousAnalysis);
    const touch=readTouch(analysis.phrase.notes);
    const row=noteRow(phrase.notes);

    clear(workbench);
    workbench.appendChild(h('section',{class:'panel coach-focus'},
      h('p',{class:'eyebrow',text:'WORK ON THIS · YOUR PHRASE'}),
      h('div',{class:'coach-phrase-head'},
        h('div',{},
          h('h2',{text:melody.headline}),
          h('p',{text:melody.detail}),
        ),
        h('span',{class:'badge',text:time.bpm?`~${time.bpm} BPM`:'free time'}),
      ),
      row,
      h('p',{class:'muted',text:touch.headline==='Touch still unclear'
        ? 'Play it again if you want me to compare the attack/dynamics too.'
        : `${touch.headline}. ${touch.detail}`}),
      renderCoachPlan(analysis),
      h('div',{class:'coach-primary-actions'},
        button('Teach me this phrase',()=>{
          const existing=workbench.querySelector('.coach-route');
          if(existing) existing.scrollIntoView({behavior:'smooth',block:'nearest'});
        },'btn-primary'),
        button('Practice this exact phrase',()=>practiceTargetView(phrase.notes,'your phrase'),'btn-primary'),
        button('Make music from it',()=>renderCreate(phrase,analysis),'btn-primary'),
        button('Save it',()=>{void savePhrase(phrase,'Caught by Live Coach');},'btn-quiet'),
      ),
      phraseRouteBlock(analysis),
    ));

    if(scroll) workbench.scrollIntoView({behavior:'smooth',block:'nearest'});
  }

  // --- live updates --------------------------------------------------------

  function updateNowFromAnalysis(analysis:PhraseAnalysis):void {
    const time=readTime(analysis,previousAnalysis);
    nowTempo.textContent=time.bpm?`~${time.bpm}`:'—';
    currentTempo=time.bpm??0;

    const harmony=inferHarmonyCenter(chordHistory);
    if(harmony){
      nowHome.textContent=`${pcToName(harmony.rootPc)} ${harmony.minor?'minor':'major'}`;
    } else if(analysis.scale.confidence>=.5) {
      nowHome.textContent=analysis.scale.label;
    } else {
      nowHome.textContent=pcToName(analysis.homePc);
    }

    nowDetail.textContent=`${analysis.phrase.notes.length} notes · ${Math.round(analysis.quality.timingSteadiness*100)}% pulse consistency · ${analysis.scale.confidence>=.5?analysis.scale.label:'tonal center still forming'}`;
  }

  async function coachLatestPhrase():Promise<void> {
    if(attemptStartMs!==null) return;
    const latest=context.session.phrases().at(-1);
    if(!latest||latest.id===lastPhraseId||latest.notes.length<3) return;
    lastPhraseId=latest.id;
    const recall=await context.session.recallPhrase(latest.id);
    if(!recall||disposed) return;

    currentPhrase=latest;
    currentAnalysis=recall.analysis;
    model.recordPhrase(phraseObservation(latest.id,recall.analysis));
    renderMemory();
    updateNowFromAnalysis(recall.analysis);

    const plan=planPhrase(recall.analysis,buildPlayerProfile(model.load()));
    addCoach(`${plan.headline} ${plan.instruction}`,'teach');
    renderPhraseWorkbench(latest,recall.analysis,false);
    previousAnalysis=recall.analysis;
  }

  function onFrame(frame:Frame):void {
    if(frame.rms>.02) lastNoteAt=Date.now();
    if(frame.hz>0&&frame.clarity>.7){
      const midi=frequencyToMidi(frame.hz);
      nowNote.textContent=midiToName(Math.round(midi));
    } else {
      nowNote.textContent='—';
    }
  }

  function onChord(chord:ChordDetection):void {
    nowChord.textContent=chord.label;
    clear(nowChordShape);
    const clean=normalizeChordLabel(chord.label);
    if(chordShape(clean)) nowChordShape.appendChild(chordDiagram(clean));

    const previous=chordHistory.at(-1);
    if(previous?.label===chord.label) return;

    chordHistory.push({...chord,heardAt:Date.now()});
    while(chordHistory.length>7) chordHistory.shift();
    renderProgression();

    if(!previous){
      addCoach(`That chord sounds like ${chord.label}. The hand shape is sitting right above if you need it.`,'hear');
    } else {
      addCoach(`${previous.label} → ${chord.label}. I’m keeping that progression in mind.`,'hear');
    }
  }

  function onChordExplain(explanation:ChordExplanation):void {
    updateChordTarget(explanation);
  }

  function update():void {
    listenButton.textContent=context.listening?'Stop listening':'Start Coach';
    listenButton.classList.toggle('is-live',context.listening);
  }

  const timer=window.setInterval(async()=>{
    if(checking) return;
    checking=true;
    try{
      await coachLatestPhrase();
      flushVoice();
    } finally {
      checking=false;
    }
  },650);

  update();
  renderMemory();
  renderProgression();

  return {
    element,
    update,
    onNotes:update,
    onFrame,
    onChord,
    onChordExplain,
    dispose(){
      disposed=true;
      window.clearInterval(timer);
      stopTempo();
      context.setChordDiagnostics?.(false);
      if('speechSynthesis' in window) window.speechSynthesis.cancel();
    },
  };
}
