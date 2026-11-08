/** A guitar lesson, not a diagram dump.
 * Teach one actual sound at one real fret before recall, in standard tuning.
 * The app never claims a microphone can identify which string produced a pitch.
 */
import { SCALE_STUDIES, studyAt, studyFretMidi, isCorrectStudySpot } from '../../src/learning/scaleStudy.ts';
import type { ScaleStudy, ScaleStudyNote } from '../../src/learning/scaleStudy.ts';
import { midiToName } from '../../src/music/notes.ts';
import { playStudyTones } from '../audio/studyTone.ts';
import { h, clear } from '../ui/dom.ts';
import type { AppContext, View } from './context.ts';

type Phase = 'intro' | 'learn' | 'recall' | 'retry' | 'play' | 'done';
interface SavedAcademy {
  completed: string[];
  firstPassAt: Record<string,number>;
  reviewCount: Record<string,number>;
  nextReviewAt: Record<string,number>;
}
const STORAGE_KEY = 'guitar-ai-coach.scale-academy.v1';
const EMPTY = (): SavedAcademy => ({ completed: [], firstPassAt: {}, reviewCount: {}, nextReviewAt: {} });
const STRING_NAMES: Record<number,string> = {
  6:'low E (thickest)',5:'A (next thickest)',4:'D',3:'G',2:'B',1:'high E (thinnest)',
};
const NOTE_ORDER = [0,4,2,6,1,5,3,7];

function readSaved(): SavedAcademy {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || 'null') as Partial<SavedAcademy> | null;
    if (!value) return EMPTY();
    return {
      completed: Array.isArray(value.completed) ? value.completed.filter((v) => typeof v === 'string') : [],
      firstPassAt: value.firstPassAt ?? {},
      reviewCount: value.reviewCount ?? {},
      nextReviewAt: value.nextReviewAt ?? {},
    };
  } catch { return EMPTY(); }
}
function save(value: SavedAcademy): void {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch { /* Works without storage too. */ }
}
function firstUnfinished(value: SavedAcademy): number {
  const index = SCALE_STUDIES.findIndex((s) => !value.completed.includes(s.id));
  return index < 0 ? SCALE_STUDIES.length - 1 : index;
}
function stringLabel(number: number): string { return STRING_NAMES[number] ?? ('string ' + number); }
function noteLocation(n: ScaleStudyNote): string {
  return stringLabel(n.string) + ', ' + (n.fret === 0 ? 'open string' : 'fret ' + n.fret);
}

export function fretboardAcademyView(context: AppContext): View {
  const element = h('div', {class:'view academy academy-v2'});
  const saved = readSaved();
  let active = firstUnfinished(saved);
  let phase: Phase = 'intro';
  let step = 0;
  let errors = 0;
  let firstTry = 0;
  let missed = false;
  let message = '';
  let statusHost: HTMLElement | null = null;

  async function sound(midis: readonly number[], interval = 530): Promise<void> {
    if (statusHost) statusHost.textContent = 'Playing a clear reference tone…';
    const ok = await playStudyTones(midis, interval);
    if (statusHost) statusHost.textContent = ok
      ? 'Sound played. If it is quiet, check your phone volume.'
      : 'Sound is blocked. Tap “Turn sound on” at the top, then try again. Check device volume too.';
  }
  function hear(n: ScaleStudyNote): void { void sound([n.midi]); }
  function switchTo(next: number): void {
    if (next < 0 || next > firstUnfinished(saved)) return;
    active=next;phase='intro';step=0;errors=0;firstTry=0;missed=false;message='';render();
  }
  function startTest(): void { phase='recall';step=0;errors=0;firstTry=0;missed=false;message='';render(); }
  function complete(): void {
    const study=studyAt(active);
    if (!saved.completed.includes(study.id)) {
      saved.completed.push(study.id);
      saved.firstPassAt[study.id]=Date.now();
    }
    const prior=saved.reviewCount[study.id]??0;
    saved.reviewCount[study.id]=prior+1;
    const days=prior===0?1:prior===1?3:7;
    saved.nextReviewAt[study.id]=Date.now()+days*86_400_000;
    save(saved);phase='done';render();
  }
  function button(label:string,action:()=>void,major=false):HTMLElement {
    return h('button',{type:'button',class:'btn '+(major?'btn-primary':'btn-quiet'),text:label,onClick:action});
  }
  function smallBoard(n:ScaleStudyNote,reveal:boolean,quiz:boolean): HTMLElement {
    const max=Math.max(5,n.fret);
    const area=h('div',{class:'academy-one-string'});
    area.appendChild(h('p',{class:'academy-string-title',text:'Only the '+stringLabel(n.string)+' string · string '+n.string}));
    const board=h('div',{class:'academy-one-row','aria-label':'String '+n.string+' fret choices'});
    for(let fret=0;fret<=max;fret+=1) {
      const selected=fret===n.fret;
      const label=fret===0?'OPEN':String(fret);
      const dot=h('button',{
        type:'button',
        class:'academy-spot'+(reveal&&selected?' academy-spot-target':''),
        text:reveal&&selected ? n.name : label,
        'aria-label':'String '+n.string+', '+(fret===0?'open':('fret '+fret)),
        title:label,
        onClick:()=>{
          if (!quiz) {
            const midi=studyFretMidi(n.string,fret);
            void sound([midi]);
            if (fret!==n.fret) message='That spot plays '+midiToName(midi).replace(/\d/g,'')+'. The note we are learning is '+n.name+' at fret '+n.fret+'.';
            else message='Yes, '+n.name+' lives here.';
            const line=area.querySelector('.academy-choice-feedback');
            if(line)line.textContent=message;
            return;
          }
          if (isCorrectStudySpot(n,n.string,fret)) {
            if(!missed)firstTry+=1;
            missed=false;step+=1;message='Correct: '+n.name+' at '+noteLocation(n)+'.';
            hear(n);
            if(step>=NOTE_ORDER.length)phase=errors===0?'play':'retry';
          } else {
            errors+=1;missed=true;
            message='Not quite. This was fret '+fret+'. Try another fret on this same string.';
          }
          render();
        }
      });
      board.appendChild(dot);
    }
    area.append(board,h('p',{class:'academy-board-tip',text:'OPEN means no finger on the string. Fret numbers count from the headstock.'}));
    if(!quiz)area.appendChild(h('p',{class:'academy-choice-feedback','aria-live':'polite',text:message}));
    return area;
  }
  function header(s:ScaleStudy):HTMLElement {
    return h('header',{class:'academy-header'},
      h('p',{class:'academy-eyebrow',text:'ONE SCALE AT A TIME'}),
      h('h2',{text:s.title}),
      h('p',{class:'academy-subtitle',text:'Lesson '+(active+1)+' of '+SCALE_STUDIES.length+'. Standard tuning, no capo.'}),
      h('p',{class:'academy-location',text:'A scale is a small collection of notes that sound related. We will learn one place to play each note, not every position on the guitar.'})
    );
  }
  function soundIndicator():HTMLElement {
    statusHost=h('p',{class:'academy-sound','aria-live':'polite',text:'Use “Hear note” or tap a fret. The app will play a clear reference tone.'});
    return statusHost;
  }
  function render():void {
    clear(element);message='';
    const study=studyAt(active),notes=study.notes;
    element.appendChild(header(study));
    const body=h('section',{class:'academy-task'});element.appendChild(body);
    if(phase==='intro') {
      body.append(
        h('p',{class:'academy-step',text:'FIRST · WHAT IS THIS?'}),
        h('h3',{text:'Guitar notes are places you can find.'}),
        h('p',{text:study.title+' uses these notes: '+notes.slice(0,7).map(n=>n.name).join(' · ')+'. Then '+study.home+' repeats higher.'}),
        h('p',{text:'A string has an open note. Each fret moves its sound up one small step. The thickest string is low E. On that string, fret 3 is G and fret 5 is A.'}),
        h('p',{text:'We will learn eight notes, one at a time, across a few strings. You do not have to memorize the whole guitar neck.'}),
        h('div',{class:'academy-actions'},
          button('Hear the first note ('+notes[0]!.name+')',()=>hear(notes[0]!)),
          button('Show me the first fret',()=>{phase='learn';step=0;render();},true)
        ),
      );
    } else if(phase==='learn') {
      const n=notes[step]!;
      body.append(
        h('p',{class:'academy-step',text:'LEARN · NOTE '+(step+1)+' OF 8'}),
        h('h3',{text:n.name+' lives at '+noteLocation(n)}),
        h('p',{class:'academy-instruction',text:n.fret===0?'Play the string without pressing a fret. That is called an open string.':'Press just behind fret '+n.fret+' and pluck the '+stringLabel(n.string)+' string.'}),
        smallBoard(n,true,false),
        h('div',{class:'academy-actions'},
          button('Hear '+n.name,()=>hear(n)),
          step>0?button('Previous note',()=>{step-=1;render();}):null,
          button(step===7?'I saw all 8 · test my memory':'Next note',()=>{if(step===7)startTest();else{step+=1;render();}},true)
        ),
      );
    } else if(phase==='recall') {
      const n=notes[NOTE_ORDER[step]!]!;
      body.append(
        h('p',{class:'academy-step',text:'REMEMBER · QUESTION '+(step+1)+' OF 8'}),
        h('h3',{text:'Which fret makes '+n.name+' on the '+stringLabel(n.string)+' string?'}),
        h('p',{class:'academy-instruction',text:'The answer is hidden. Tap the fret number below. This tests memory, not speed.'}),
        smallBoard(n,false,true),
        h('p',{class:'academy-message','aria-live':'polite',text:message||'Find the fret from memory.'}),
        h('div',{class:'academy-actions'},button('Show the notes again',()=>{phase='learn';step=0;render();}))
      );
    } else if(phase==='retry') {
      body.append(
        h('p',{class:'academy-step',text:'REVIEW'}),
        h('h3',{text:'Good practice. Give those tricky frets another look.'}),
        h('p',{text:'You found '+firstTry+' of the 8 locations on your first try. It is fine to learn gradually.'}),
        h('div',{class:'academy-actions'},
          button('Study one note at a time',()=>{phase='learn';step=0;render();}),
          button('Try the memory quiz again',startTest,true)
        )
      );
    } else if(phase==='play') {
      body.append(
        h('p',{class:'academy-step',text:'USE IT · MUSIC'}),
        h('h3',{text:'Now turn notes into something musical.'}),
        h('p',{text:'Play all eight notes on your guitar, slowly. Then try a four-note melody: '+[notes[0],notes[2],notes[4],notes[7]].map(n=>n!.name).join(' → ')+'.'}),
        h('p',{class:'academy-instruction',text:'A melody is just notes in an intentional order. The app checked your fret memory; this guitar-playing part is for you to try.'}),
        h('div',{class:'academy-actions'},
          button('Hear the scale',()=>{void sound([...notes,...[...notes].reverse().slice(1)].map(n=>n.midi),550);}),
          button('Hear the little melody',()=>{void sound([notes[0],notes[2],notes[4],notes[7]].map(n=>n!.midi),650);}),
          button('I played it · save progress',complete,true)
        )
      );
    } else {
      const reviews=saved.reviewCount[study.id]??1;
      const days=reviews===1?1:reviews===2?3:7;
      body.append(
        h('p',{class:'academy-step',text:'FINISHED · '+study.title}),
        h('h3',{text:'You have learned the first route.'}),
        h('p',{text:'Your note recall is saved on this device. Review it in '+days+' day'+(days===1?'':'s')+' to keep it fresh.'}),
        h('div',{class:'academy-actions'},
          button('Review this scale',()=>{phase='intro';step=0;render();}),
          active+1<SCALE_STUDIES.length?button('Next lesson: '+SCALE_STUDIES[active+1]!.title,()=>switchTo(active+1),true):button('Return to Learn',()=>context.navigate('path'),true)
        )
      );
    }
    element.appendChild(soundIndicator());
    if (phase==='intro' || phase==='learn') {
      const older=SCALE_STUDIES.slice(0,active).filter(s=>saved.completed.includes(s.id));
      if(older.length)element.appendChild(h('div',{class:'academy-previous'},button('Review '+older[older.length-1]!.title,()=>switchTo(SCALE_STUDIES.indexOf(older[older.length-1]!)))));
    }
    element.appendChild(h('p',{class:'academy-footer',text:'You can always return to Learn or Practice. No advanced scale names are needed for this lesson.'}));
    element.appendChild(button('Back to Learn',()=>context.navigate('path')));
  }
  render();
  return {element};
}
