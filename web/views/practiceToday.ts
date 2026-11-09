/** Practice should rehearse the current lesson, not teleport a learner into
 * a sandbox of music theory words they have never been taught.
 */
import { SCALE_STUDIES } from '../../src/learning/scaleStudy.ts';
import { playStudyTones } from '../audio/studyTone.ts';
import { h, clear } from '../ui/dom.ts';
import type { AppContext, View } from './context.ts';

const LENGTH_KEY='guitar-session-minutes';
const ACADEMY_KEY='guitar-ai-coach.scale-academy.v1';
const STRINGS:Record<number,string>={6:'low E (thickest)',5:'A',4:'D',3:'G',2:'B',1:'high E'};

function activeLesson() {
  try {
    const stored=JSON.parse(window.localStorage.getItem(ACADEMY_KEY)||'null') as {completed?:unknown} | null;
    const done=Array.isArray(stored?.completed) ? stored.completed : [];
    return SCALE_STUDIES.find((s)=>!done.includes(s.id)) ?? SCALE_STUDIES[SCALE_STUDIES.length-1]!;
  } catch { return SCALE_STUDIES[0]!; }
}
function format(seconds:number):string {
  return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
}

export function practiceTodayView(context:AppContext):View {
  const element=h('div',{class:'view view-practice academy-practice'});
  let minutes=5;
  try { const n=Number(window.localStorage.getItem(LENGTH_KEY)); if ([5,10,15,25].includes(n)) minutes=n; } catch { /* Fine. */ }
  let left=minutes*60;
  let interval=0;
  let running=false;
  let finished=false;
  let clock:HTMLElement|null=null;
  let soundStatus:HTMLElement|null=null;

  function stop():void { if(interval)window.clearInterval(interval);interval=0;running=false; }
  function start():void {
    stop();left=minutes*60;finished=false;running=true;render();
    interval=window.setInterval(()=>{
      left=Math.max(0,left-1);
      if(clock)clock.textContent=format(left);
      if(left===0){stop();finished=true;render();}
    },1000);
  }
  function selectTime(n:number):void {
    stop();minutes=n;left=n*60;finished=false;
    try {window.localStorage.setItem(LENGTH_KEY,String(n));} catch { /* Fine. */ }
    render();
  }
  async function hearPair(notes:readonly number[]):Promise<void> {
    if(soundStatus)soundStatus.textContent='Playing reference notes…';
    const ok=await playStudyTones(notes);
    if(soundStatus)soundStatus.textContent=ok?'Sound played. Check phone volume if quiet.':'Sound is blocked. Tap “Turn sound on” at the top and try again.';
  }
  function btn(label:string,click:()=>void,main=false):HTMLElement {
    return h('button',{type:'button',class:'btn '+(main?'btn-primary':'btn-quiet'),text:label,onClick:click});
  }

  function render():void {
    clear(element);
    const scale=activeLesson(), a=scale.notes[0]!, b=scale.notes[1]!;
    const warm=Math.max(1,Math.round(minutes*.2));
    const notes=Math.max(1,Math.round(minutes*.4));
    const music=minutes-warm-notes;
    element.append(
      h('header',{class:'view-head'},
        h('p',{class:'academy-eyebrow',text:'A SIMPLE PRACTICE SESSION'}),
        h('h2',{text:'Play what you know. Learn one new thing.'}),
        h('p',{text:'No scale menus. No surprise exercises. Today uses your familiar chords and '+scale.title+'.'})
      ),
      h('div',{class:'length-switch'},
        h('strong',{text:'How long do you have?'}),
        h('div',{class:'check-picker'},...[5,10,15,25].map(n=>btn(n+' min',()=>selectTime(n))))
      ),
    );
    element.appendChild(h('section',{class:'panel academy-entry'},
      h('p',{class:'academy-step',text:'WANT A CONNECTED LESSON SEQUENCE?'}),
      h('h3',{text:'Make chords become music'}),
      h('p',{text:'The new eight-lesson rhythm chapter builds a skill step by step. Your five-minute practice remains available here.'}),
      btn('Open the rhythm chapter',()=>context.navigate('rhythm'),true)
    ));
    const clockSection=h('section',{class:'panel academy-practice-clock'},
      h('p',{class:'academy-step',text:'YOUR '+minutes+'-MINUTE SESSION'}),
      h('div',{class:'academy-clock',text:format(left)}),
      h('div',{class:'academy-actions'},
        running?btn('Pause',()=>{stop();render();}):btn(finished?'Start another session':'Start '+minutes+' minutes',start,true),
        !running && !finished && left<minutes*60?btn('Restart',start):null,
      ),
      finished?h('p',{text:'Session complete. The goal was to play and learn, not chase a score.'}):null
    );
    clock=clockSection.querySelector<HTMLElement>('.academy-clock');
    element.appendChild(clockSection);

    const cards=[
      {
        title:'1. Warm up with chords you already know',
        time:warm,
        body:'Play G → D → Em → Cmaj7. Four slow strums on each. No pressure to speed up.',
        help:'If a change is messy, keep the beat going. You already know these shapes.',
      },
      {
        title:'2. Find only two notes from '+scale.title,
        time:notes,
        body:a.name+' is on the '+STRINGS[a.string]+' string at fret '+a.fret+'. '+b.name+' is on the '+STRINGS[b.string]+' string at fret '+b.fret+'. Say the names, find them, play them.',
        help:'Fret means the numbered space between metal strips. An open string means no finger presses it.',
      },
      {
        title:'3. Make a tiny melody',
        time:music,
        body:'Pick '+a.name+' → '+b.name+' → '+a.name+'. Leave a pause, then play a '+scale.chord+' chord. Repeat and listen to the change.',
        help:'You have just used a scale to make music. That is the reason we learn the notes.',
      },
    ];
    for (let i=0;i<cards.length;i++){
      const card=cards[i]!;
      element.appendChild(h('section',{class:'panel academy-practice-item'},
        h('p',{class:'academy-step',text:card.time+' MIN'}),
        h('h3',{text:card.title}),
        h('p',{text:card.body}),
        h('p',{class:'muted',text:card.help}),
        i===1?h('div',{class:'academy-actions'},
          btn('Hear '+a.name+' then '+b.name,()=>{void hearPair([a.midi,b.midi]);}),
          btn('Teach me each fret',()=>context.navigate('academy'),true)
        ):null,
        i===1?(soundStatus=h('p',{class:'academy-sound','aria-live':'polite',text:'Tap “Hear” to check sound before playing along.'})):null,
      ));
    }
    element.appendChild(h('p',{class:'academy-footer',text:'Want to go deeper? Learn teaches one note at a time. The advanced scale explorer is optional and is not part of this routine.'}));
  }
  render();
  return {element,dispose:stop};
}
