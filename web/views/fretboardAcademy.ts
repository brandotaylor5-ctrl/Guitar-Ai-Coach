/** Learning-first scale studio: one scale and one octave at a time.
 * The fretboard quiz verifies exact STRING and FRET. Microphone pitch detection
 * cannot reliably identify where the same pitch was played on the neck.
 */
import { SCALE_STUDIES, studyAt, studyFretMidi, isCorrectStudySpot } from '../../src/learning/scaleStudy.ts';
import type { ScaleStudy, ScaleStudyNote } from '../../src/learning/scaleStudy.ts';
import { h, clear } from '../ui/dom.ts';
import type { AppContext, View } from './context.ts';

type Stage = 'learn' | 'recall' | 'retry' | 'play' | 'done';
interface SavedAcademy {
  completed: string[];
  firstPassAt: Record<string,number>;
  reviewCount: Record<string,number>;
  nextReviewAt: Record<string,number>;
}

const STORAGE_KEY = 'guitar-ai-coach.scale-academy.v1';
const EMPTY = (): SavedAcademy => ({
  completed:[], firstPassAt:{}, reviewCount:{}, nextReviewAt:{},
});
const STRING_NAMES: Record<number,string> = {
  6:'Low E',5:'A',4:'D',3:'G',2:'B',1:'High E',
};

function readSaved(): SavedAcademy {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY();
    const value = JSON.parse(raw) as Partial<SavedAcademy>;
    return {
      completed: Array.isArray(value.completed) ? value.completed.filter(x => typeof x === 'string') : [],
      firstPassAt: value.firstPassAt ?? {},
      reviewCount: value.reviewCount ?? {},
      nextReviewAt: value.nextReviewAt ?? {},
    };
  } catch { return EMPTY(); }
}

function writeSaved(value: SavedAcademy): void {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); }
  catch { /* No permission: still usable for this session. */ }
}

function nextLesson(saved: SavedAcademy): number {
  const index = SCALE_STUDIES.findIndex(item => !saved.completed.includes(item.id));
  return index < 0 ? SCALE_STUDIES.length - 1 : index;
}

function durationName(value: number): string {
  return value === 1 ? '1 day' : String(value) + ' days';
}

export function fretboardAcademyView(context: AppContext): View {
  const element = h('div', { class: 'view academy' });
  const saved = readSaved();
  let active = nextLesson(saved);
  let stage: Stage = 'learn';
  let index = 0;
  let mistakes = 0;
  let missedThisNote = false;
  let cleanAnswers = 0;
  let message = '';
  let reviewing = false;

  function playNote(midi: number): void {
    void context.player.play([{
      midi, startMs:0, durationMs:460, confidence:1, velocity:0.7,
    }]);
  }

  function playLine(notes: readonly ScaleStudyNote[], speed = 1): void {
    const full = [...notes, ...[...notes].reverse().slice(1)];
    void context.player.play(full.map((n,i) => ({
      midi:n.midi, startMs:i * 430, durationMs:380, confidence:1, velocity:0.68,
    })), { speed });
  }

  function playPhrase(notes: readonly ScaleStudyNote[]): void {
    const phrase = [notes[0],notes[2],notes[4],notes[7]].filter(
      (n): n is ScaleStudyNote => Boolean(n)
    );
    void context.player.play(phrase.map((n,i)=>({
      midi:n.midi,startMs:i*620,durationMs:560,confidence:1,velocity:0.75,
    })));
  }

  function moveTo(next: number, review = false): void {
    const unlock = nextLesson(saved);
    if (next > unlock || next < 0) return;
    active = next; stage = 'learn'; index = 0;
    mistakes = 0; cleanAnswers = 0; missedThisNote = false;
    reviewing = review; message = ''; render();
  }

  function chooseFret(string: number, fret: number): void {
    if (stage !== 'recall') {
      playNote(studyFretMidi(string, fret));
      return;
    }
    const target = studyAt(active).notes[index]!;
    if (isCorrectStudySpot(target, string, fret)) {
      if (!missedThisNote) cleanAnswers += 1;
      missedThisNote = false;
      index += 1;
      message = 'Yes. ' + target.name + ' is string ' + target.string + ', fret ' + target.fret + '.';
      playNote(target.midi);
      if (index === 8) stage = mistakes === 0 ? 'play' : 'retry';
    } else {
      mistakes += 1;
      missedThisNote = true;
      message = 'Not that fret. Stay on the ' + STRING_NAMES[target.string] + ' string and try again.';
    }
    render();
  }

  function startRecall(): void {
    stage='recall'; index=0; mistakes=0; cleanAnswers=0;
    missedThisNote=false; message=''; render();
  }

  function finishLesson(): void {
    const study = studyAt(active);
    if (!saved.completed.includes(study.id)) {
      saved.completed.push(study.id);
      saved.firstPassAt[study.id] = Date.now();
    }
    const previousReviews = saved.reviewCount[study.id] ?? 0;
    saved.reviewCount[study.id] = previousReviews + 1;
    const days = previousReviews === 0 ? 1 : previousReviews === 1 ? 3 : 7;
    saved.nextReviewAt[study.id] = Date.now() + days * 86_400_000;
    writeSaved(saved);
    stage='done'; message=''; render();
  }

  function heading(study: ScaleStudy): HTMLElement {
    const due = saved.completed.includes(study.id) && (saved.nextReviewAt[study.id] ?? 0) <= Date.now();
    return h('header', { class:'academy-header' },
      h('p', { class:'academy-eyebrow', text:'FRETBOARD ACADEMY · ONE SCALE AT A TIME' }),
      h('div', { class:'academy-title-row' },
        h('div', {},
          h('h2', { text: study.title }),
          h('p', { class:'academy-subtitle', text: study.subtitle })
        ),
        h('span', { class:'academy-counter', text:'Study ' + (active+1) + ' / ' + SCALE_STUDIES.length })
      ),
      h('p', { class:'academy-rule', text:'Standard tuning · no capo · only one octave. You will learn the exact string, fret and note.' }),
      due ? h('p', {class:'academy-review-due',text:'This scale is due for a short memory review.'}) : null
    );
  }

  function fretboard(study: ScaleStudy, answersVisible: boolean): HTMLElement {
    const host = h('section', { class:'academy-board', 'aria-label':'Interactive guitar fretboard' });
    const maxFret = Math.max(5,...study.notes.map(n => n.fret));
    const strings = [...new Set(study.notes.map(n=>n.string))].sort((a,b)=>b-a);
    const columns = '76px repeat(' + (maxFret + 1) + ', minmax(34px, 1fr))';
    host.appendChild(h('div', { class:'academy-fret-row', style:'grid-template-columns:'+columns },
      h('span', {text:'String'}),
      ...Array.from({length:maxFret+1},(_,f)=>h('span',{text:f===0?'OPEN':String(f)}))
    ));
    for(const string of strings){
      const row = h('div', {class:'academy-string-row',style:'grid-template-columns:'+columns});
      row.appendChild(h('span',{class:'academy-string-name',text:STRING_NAMES[string]+' ('+string+')'}));
      for(let fret=0;fret<=maxFret;fret++){
        const spot = study.notes.find(n=>n.string===string&&n.fret===fret);
        const show = answersVisible && Boolean(spot);
        const hit = h('button',{
          type:'button',
          class:'academy-fret' + (show?' is-in-scale':'') + (show&&spot?.name===study.home?' is-home':''),
          text:show?spot!.name:'·',
          title:'String '+string+' · fret '+fret,
          'aria-label':'String '+string+', fret '+fret,
          onClick:()=>chooseFret(string,fret),
        });
        row.appendChild(hit);
      }
      host.appendChild(row);
    }
    host.appendChild(h('p', {class:'academy-board-help',text: answersVisible
      ? 'Tap a labeled note to hear it. OPEN means the string is not fretted.'
      : 'Names are hidden. Find the requested note by tapping its string and fret.'}));
    return host;
  }

  function reviewLink(study: ScaleStudy): HTMLElement | null {
    const previous = SCALE_STUDIES.slice(0,active).filter(x => saved.completed.includes(x.id));
    if(previous.length===0)return null;
    const due = previous.find(x => (saved.nextReviewAt[x.id] ?? 0) <= Date.now());
    const item = due ?? previous[previous.length-1]!;
    return h('div', {class:'academy-previous'},
      h('p', {text:due ? 'Memory review is ready: '+item.title : 'Want to check what you remember?'}),
      h('button',{type:'button',class:'btn btn-quiet',text:'Review '+item.title,
        onClick:()=>moveTo(SCALE_STUDIES.indexOf(item),true)})
    );
  }

  function render(): void {
    clear(element);
    const study = studyAt(active);
    element.appendChild(heading(study));
    const progressNames=study.notes.map(n=>n.name).join('   ');
    const host=h('section',{class:'academy-task'});
    element.appendChild(host);

    if(stage==='learn'){
      host.append(
        h('p',{class:'academy-step',text:'1 / 3   LEARN'}),
        h('h3',{text:'Find these eight notes'}),
        h('p',{text:progressNames}),
        h('p',{class:'academy-instruction',text:'Read each note aloud, find its string and fret, then tap it to hear the pitch. Start on '+study.home+' and finish on the same note an octave higher.'}),
        fretboard(study,true),
        h('div',{class:'academy-actions'},
          h('button',{type:'button',class:'btn btn-quiet',text:'Hear the full octave',onClick:()=>playLine(study.notes)}),
          h('button',{type:'button',class:'btn btn-primary',text:'Hide names · test me',onClick:startRecall})
        ),
      );
      const previous=reviewLink(study);
      if(previous)host.appendChild(previous);
    } else if(stage==='recall') {
      const target = study.notes[index]!;
      host.append(
        h('p',{class:'academy-step',text:'2 / 3   RECALL · '+(index+1)+' of 8'}),
        h('h3',{text:'Find '+target.name+' on the '+STRING_NAMES[target.string]+' string'}),
        h('p',{class:'academy-instruction',text:'All notes are hidden. Tap the correct fret on the '+STRING_NAMES[target.string]+' string. No guessing from highlighted dots.'}),
        fretboard(study,false),
        h('p',{class:'academy-message','aria-live':'polite',text:message||'Answer from memory.'}),
        h('div',{class:'academy-actions'},
          h('button',{type:'button',class:'btn btn-quiet',text:'Show me the notes again',onClick:()=>{stage='learn';message='';render();}})
        )
      );
    } else if(stage==='retry') {
      host.append(
        h('p',{class:'academy-step',text:'2 / 3   RECALL'}),
        h('h3',{text:'Almost there. Test your memory once more.'}),
        h('p',{text:String(cleanAnswers)+' of 8 notes were right on the first try. The goal is eight without hints.'}),
        h('p',{class:'academy-instruction',text:'The mistakes are useful information, not a penalty. See the notes again or repeat the test.'}),
        h('div',{class:'academy-actions'},
          h('button',{type:'button',class:'btn btn-primary',text:'Repeat recall',onClick:startRecall}),
          h('button',{type:'button',class:'btn btn-quiet',text:'Study the fretboard',onClick:()=>{stage='learn';render();}})
        )
      );
    } else if(stage==='play') {
      host.append(
        h('p',{class:'academy-step',text:'3 / 3   MAKE MUSIC'}),
        h('h3',{text:'Eight notes recalled. Now use them.'}),
        h('p',{text:'On your guitar, play the scale up and back down once. Then play a short four-note phrase using '+study.notes[0]!.name+', '+study.notes[2]!.name+', '+study.notes[4]!.name+' and '+study.notes[7]!.name+'.'}),
        h('p',{class:'academy-instruction',text:'The note quiz was verified on screen. This final guitar exercise is self-reported; the microphone cannot prove which frets you used.'}),
        h('div',{class:'academy-actions'},
          h('button',{type:'button',class:'btn btn-quiet',text:'Hear octave at 60%',onClick:()=>playLine(study.notes,.6)}),
          h('button',{type:'button',class:'btn btn-quiet',text:'Hear a four-note phrase',onClick:()=>playPhrase(study.notes)}),
          h('button',{type:'button',class:'btn btn-primary',text:'I played it · finish lesson',onClick:finishLesson})
        )
      );
    } else {
      const next = active + 1;
      const isFinal = next>=SCALE_STUDIES.length;
      const prev = saved.reviewCount[study.id] ?? 1;
      const days=prev===1?1:prev===2?3:7;
      host.append(
        h('p',{class:'academy-step',text:'COMPLETED'}),
        h('h3',{text:'You know where the notes live.'}),
        h('p',{text:'You recalled all eight note locations and marked your musical application complete. Review them in '+durationName(days)+' to help them stick.'}),
        h('div',{class:'academy-actions'},
          h('button',{type:'button',class:'btn btn-quiet',text:'Review this scale',onClick:()=>moveTo(active,true)}),
          !isFinal ? h('button',{type:'button',class:'btn btn-primary',text:'Next scale: '+SCALE_STUDIES[next]!.title,onClick:()=>moveTo(next)})
            : h('button',{type:'button',class:'btn btn-primary',text:'Back to learning roadmap',onClick:()=>context.navigate('path')})
        )
      );
    }
    element.appendChild(h('p',{class:'academy-footer',text:'One route first. More fretboard positions and improvisation come later. This is deliberate, not a complete neck diagram.'}));
    element.appendChild(h('div',{class:'academy-back'},
      h('button',{type:'button',class:'btn btn-quiet',text:'Back to all guitar learning',onClick:()=>context.navigate('path')})
    ));
  }
  render();
  return {element};
}
