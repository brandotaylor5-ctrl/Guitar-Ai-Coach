/**
 * Riff Lab: scales, musical riff shapes, progression playback and immediate
 * listen-to-my-attempt feedback. The important loop is hear -> see -> play ->
 * get feedback -> change one thing.
 */

import type { NoteEvent } from '../../src/types.ts';
import { midiToName } from '../../src/music/notes.ts';
import { inferFingering, renderTab } from '../../src/music/fretboard.ts';
import { practiceAttempt } from '../../src/practice/practice.ts';
import { h, clear } from '../ui/dom.ts';
import { button, fretboardDiagram, noteRow, highlightNote, tabBlock } from '../ui/render.ts';
import type { AppContext, View } from './context.ts';

const ROOTS = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const SCALE_TYPES = [
  { id:'minor-pent', label:'Minor pentatonic', degrees:[0,3,5,7,10], minor:true },
  { id:'major-pent', label:'Major pentatonic', degrees:[0,2,4,7,9], minor:false },
  { id:'minor', label:'Natural minor', degrees:[0,2,3,5,7,8,10], minor:true },
  { id:'major', label:'Major', degrees:[0,2,4,5,7,9,11], minor:false },
  { id:'dorian', label:'Dorian', degrees:[0,2,3,5,7,9,10], minor:true },
  { id:'mixolydian', label:'Mixolydian', degrees:[0,2,4,5,7,9,10], minor:false },
  { id:'blues', label:'Blues', degrees:[0,3,5,6,7,10], minor:true },
];

type Level = 'easy'|'medium'|'stretch';
interface RiffTemplate { id:string; name:string; feel:string; level:Level; lesson:string; degrees:number[]; rhythm:number[]; }
interface LabChord { label:string; rootPc:number; minor:boolean; }

const TEMPLATES: RiffTemplate[] = [
  { id:'drone', name:'Drone & Answer', feel:'Low home note, then a little reply above it.', level:'easy', lesson:'Hear a bass note as a floor while the melody moves.', degrees:[0,2,0,3,2,0], rhythm:[1,.5,.5,.75,.75,1.5] },
  { id:'three', name:'Three-Step Hook', feel:'A compact shape that sounds like a hook, not an exercise.', level:'easy', lesson:'Repeat a small shape before you add more notes.', degrees:[0,1,2,1,0,4,2,0], rhythm:[.5,.5,1,.5,.5,1,.5,1.5] },
  { id:'pedal', name:'Pedal Tone', feel:'Home keeps returning while an upper note changes.', level:'easy', lesson:'A repeated note can glue a riff together.', degrees:[0,3,0,4,0,2,0,1,0], rhythm:[.5,.5,.5,.5,.5,.5,.5,.5,1] },
  { id:'space', name:'Open-Space Climb', feel:'Leaves room between notes so the guitar can ring.', level:'easy', lesson:'Silence is part of the riff.', degrees:[0,1,3,2,4,3,5], rhythm:[1,.5,1,.5,1,.5,1.5] },
  { id:'descend', name:'Descending Turn', feel:'Starts high, folds inward, then lands without sounding too neat.', level:'medium', lesson:'A line can resolve by contour, not only by hitting home.', degrees:[5,4,2,3,1,2,0], rhythm:[.5,.5,.75,.25,.5,.5,1.5] },
  { id:'call', name:'Call / Response', feel:'Two short ideas that sound like they are talking.', level:'medium', lesson:'Think in sentences instead of endless scales.', degrees:[0,2,3,2,5,4,2,0], rhythm:[.5,.5,1,1,.5,.5,.75,1.25] },
  { id:'late', name:'Late-Night Loop', feel:'A darker repeating cell with one color-changing note.', level:'medium', lesson:'Change one note and keep the rhythm recognizable.', degrees:[0,2,4,2,1,2,4,2], rhythm:[.75,.25,.5,.5,.75,.25,.5,1] },
  { id:'shuffle', name:'Lopsided Shuffle', feel:'A little bounce that gets addictive when repeated.', level:'medium', lesson:'Uneven rhythm can create identity before pitch does.', degrees:[0,1,2,0,3,2,1,0], rhythm:[.5,.25,.75,.5,.5,.25,.75,1] },
  { id:'skip', name:'String-Skip Shape', feel:'Leaps away from home and snaps back.', level:'medium', lesson:'Bigger interval jumps make a line feel less scalar.', degrees:[0,4,1,5,2,4,0], rhythm:[.5,.5,.5,.75,.25,.5,1.5] },
  { id:'push', name:'Push the Downbeat', feel:'Starts a thought before the beat and lets the landing feel bigger.', level:'medium', lesson:'Where a note starts can matter as much as which note it is.', degrees:[1,2,0,3,2,4,2,0], rhythm:[.25,.25,1,.5,.5,.5,.5,1.5] },
  { id:'wide', name:'Wide-Open Fifths', feel:'Big, plain-spoken movement with room around it.', level:'stretch', lesson:'Wide intervals can sound strong without many notes.', degrees:[0,4,0,5,2,5,1,0], rhythm:[.75,.75,.5,.5,.75,.25,.5,1.5] },
  { id:'question', name:'Question Mark', feel:'Refuses to settle where you expect.', level:'stretch', lesson:'An unresolved ending can make you want the next bar.', degrees:[0,2,3,4,2,5,4,3], rhythm:[.5,.5,.5,.5,.75,.25,.5,1.5] },
  { id:'mirror', name:'Mirror Phrase', feel:'Climbs, then answers with the contour turned around.', level:'stretch', lesson:'Reuse a contour instead of inventing eight new notes.', degrees:[0,1,3,4,4,3,1,0], rhythm:[.5,.5,.75,.75,.5,.5,.75,1.25] },
  { id:'octave', name:'Octave Lift', feel:'Repeats the idea higher so the second half feels larger.', level:'stretch', lesson:'Register can create development without changing the idea.', degrees:[0,1,2,0,5,6,7,5], rhythm:[.5,.5,.75,1,.5,.5,.75,1.5] },
  { id:'threebeat', name:'Three-Beat Cell', feel:'A repeating cell that keeps crossing the bar line.', level:'stretch', lesson:'A phrase length that fights the bar can create momentum.', degrees:[0,2,1,0,2,1,3,2,1], rhythm:[.5,.5,.5,.5,.5,.5,.5,.5,1] },
  { id:'resolve-late', name:'Late Resolution', feel:'Keeps dodging home until the last possible second.', level:'stretch', lesson:'Delay the obvious answer to make it matter more.', degrees:[2,3,4,2,5,3,1,2,0], rhythm:[.5,.5,.5,.5,.75,.25,.5,.5,1.5] },
];

function scaleMidis(rootPc:number, degrees:number[], tuningLow:number):number[] {
  let root=tuningLow; while (((root%12)+12)%12 !== rootPc) root++;
  const out:number[]=[]; for (let octave=0;octave<3;octave++) for (const degree of degrees) out.push(root+degree+octave*12);
  return out;
}

function riffFromTemplate(template:RiffTemplate, notes:number[], beatMs=430):NoteEvent[] {
  let cursor=0;
  return template.degrees.map((degree,i)=>{
    const midi=notes[Math.max(0,Math.min(notes.length-1,degree))]!;
    const duration=template.rhythm[i]??.5;
    const event:NoteEvent={ midi,startMs:cursor,durationMs:Math.max(130,beatMs*duration*.78),confidence:1,velocity:.62 };
    cursor+=beatMs*duration; return event;
  });
}

function chord(rootPc:number, minor:boolean):LabChord { return { rootPc, minor, label:`${ROOTS[rootPc]}${minor?'m':''}` }; }
function progressions(rootPc:number, minor:boolean):LabChord[][] {
  const c=(off:number,m=false)=>chord((rootPc+off)%12,m);
  return minor ? [
    [c(0,true),c(8),c(3),c(10)],
    [c(0,true),c(5,true),c(8),c(7)],
    [c(0,true),c(10),c(8),c(10)],
  ] : [
    [c(0),c(7),c(9,true),c(5)],
    [c(0),c(5),c(9,true),c(7)],
    [c(9,true),c(5),c(0),c(7)],
  ];
}

function nearestMidiForPc(pc:number, around:number):number {
  let best=around,dist=99;
  for(let midi=40;midi<=84;midi++) if(midi%12===pc){ const d=Math.abs(midi-around); if(d<dist){best=midi;dist=d;} }
  return best;
}

function progressionNotes(chords:LabChord[], barMs=1050):NoteEvent[] {
  const out:NoteEvent[]=[];
  chords.forEach((ch,i)=>{
    const root=nearestMidiForPc(ch.rootPc,50);
    const third=root+(ch.minor?3:4), fifth=root+7;
    for(const midi of [root,third,fifth]) out.push({midi,startMs:i*barMs,durationMs:barMs*.84,confidence:1,velocity:.45});
  });
  return out;
}

function leadOverProgression(chords:LabChord[], scale:number[], barMs=1050):NoteEvent[] {
  const out:NoteEvent[]=[];
  const scalePc=new Set(scale.map((m)=>m%12));
  const pick=(pc:number,around:number)=>{
    const candidates=scale.filter((m)=>m%12===pc);
    if(candidates.length) return candidates.sort((a,b)=>Math.abs(a-around)-Math.abs(b-around))[0]!;
    return scale.slice().sort((a,b)=>Math.abs(a-around)-Math.abs(b-around))[0]!;
  };
  let around=57;
  chords.forEach((ch,i)=>{
    const third=(ch.rootPc+(ch.minor?3:4))%12;
    const fifth=(ch.rootPc+7)%12;
    const targets=[ch.rootPc,scalePc.has(third)?third:fifth];
    targets.forEach((pc,j)=>{
      const midi=pick(pc,around); around=midi;
      out.push({midi,startMs:i*barMs+j*(barMs/2),durationMs:barMs*.38,confidence:1,velocity:.62});
    });
  });
  return out;
}

export function labView(context:AppContext):View {
  let rootPc=4;
  let scale=SCALE_TYPES[0]!;
  let level:'all'|Level='all';
  let selectedId=TEMPLATES[0]!.id;
  let practiceStartMs:number|null=null;
  let currentRiffs=new Map<string,NoteEvent[]>();

  const rootSelect=h('select',{class:'select'}) as HTMLSelectElement;
  ROOTS.forEach((name,pc)=>rootSelect.appendChild(h('option',{value:pc,text:name,selected:pc===rootPc})));
  const scaleSelect=h('select',{class:'select'}) as HTMLSelectElement;
  SCALE_TYPES.forEach((item)=>scaleSelect.appendChild(h('option',{value:item.id,text:item.label,selected:item.id===scale.id})));
  const levelSelect=h('select',{class:'select'}) as HTMLSelectElement;
  [['all','All levels'],['easy','Easy'],['medium','Medium'],['stretch','Stretch me']].forEach(([value,label])=>levelSelect.appendChild(h('option',{value,text:label})));

  const scaleHost=h('div',{class:'lab-scale-host'}), riffsHost=h('div',{class:'lab-riffs'}), detailHost=h('div',{class:'lab-detail'}), progressionsHost=h('div',{class:'lab-progressions'});
  const practiceHost=h('div',{class:'lab-practice-feedback muted',text:'Pick a riff, hear it, then let the app listen to your attempt.'});

  const element=h('div',{class:'view view-lab'},
    h('section',{class:'panel lab-hero'},
      h('div',{},h('p',{class:'lab-kicker',text:'RIFF LAB'}),h('h2',{text:'Turn theory into something your fingers can hear.'}),h('p',{class:'muted',text:'Choose a sound, steal a musical shape, hear chord loops, generate a lead over them, slow it down, and have the app check your take.'})),
      h('div',{class:'lab-controls'},h('label',{},'Key ',rootSelect),h('label',{},'Scale ',scaleSelect),h('label',{},'Shelf ',levelSelect)),
    ),
    h('section',{class:'panel'},h('h3',{text:'Scale explorer'}),h('p',{class:'muted',text:'Tap a note to hear it. The fretboard shows practical places to find the sound in your current tuning.'}),scaleHost),
    h('section',{class:'panel'},
      h('div',{class:'lab-section-head'},h('div',{},h('h3',{text:'Riff shelf'}),h('p',{class:'muted',text:'These are musical shapes generated inside the scale, grouped by how much they ask of your hands and ears.'})),button('Surprise me',()=>{const pool=filteredTemplates(); selectedId=pool[Math.floor(Math.random()*pool.length)]?.id??TEMPLATES[0]!.id; renderRiffs();},'btn-quiet')),
      riffsHost,detailHost,h('div',{class:'lab-practice-box'},h('h4',{text:'PLAY IT BACK TO ME'}),practiceHost),
    ),
    h('section',{class:'panel'},h('h3',{text:'Progression → riff playground'}),h('p',{class:'muted',text:'Hear the harmony first. Then let the lab build a simple lead that targets notes inside those chords while staying in your chosen scale.'}),progressionsHost),
  );

  rootSelect.addEventListener('change',()=>{rootPc=Number(rootSelect.value);render();});
  scaleSelect.addEventListener('change',()=>{scale=SCALE_TYPES.find((x)=>x.id===scaleSelect.value)??SCALE_TYPES[0]!;render();});
  levelSelect.addEventListener('change',()=>{level=levelSelect.value as 'all'|Level; const pool=filteredTemplates(); if(!pool.some((x)=>x.id===selectedId)) selectedId=pool[0]?.id??TEMPLATES[0]!.id; renderRiffs();});

  function filteredTemplates():RiffTemplate[]{ return level==='all'?TEMPLATES:TEMPLATES.filter((t)=>t.level===level); }

  function renderScale():void {
    clear(scaleHost);
    const midis=scaleMidis(rootPc,scale.degrees,context.session.tuning.strings[0]!);
    const firstOctave=midis.slice(0,scale.degrees.length+1);
    scaleHost.appendChild(h('div',{class:'lab-note-buttons'},...firstOctave.map((midi,i)=>button(`${midiToName(midi)}${i===0?' · HOME':''}`,()=>{void context.player.playNote(midi);},i===0?'btn-primary':'btn-quiet'))));
    scaleHost.appendChild(fretboardDiagram(inferFingering(firstOctave,{tuning:context.session.tuning,maxFret:12}),context.session.tuning));
  }

  function renderRiffs():void {
    const midis=scaleMidis(rootPc,scale.degrees,context.session.tuning.strings[0]!);
    currentRiffs=new Map(TEMPLATES.map((t)=>[t.id,riffFromTemplate(t,midis)]));
    const pool=filteredTemplates();
    if(!pool.some((x)=>x.id===selectedId)) selectedId=pool[0]?.id??TEMPLATES[0]!.id;
    clear(riffsHost);
    riffsHost.appendChild(h('div',{class:'lab-riff-grid'},...pool.map((template)=>h('button',{class:`lab-riff-card${template.id===selectedId?' is-active':''}`,type:'button',onClick:()=>{selectedId=template.id;renderRiffs();}},h('span',{class:'lab-level',text:template.level}),h('strong',{text:template.name}),h('span',{text:template.feel})))));
    renderDetail();
  }

  function renderDetail():void {
    const template=TEMPLATES.find((x)=>x.id===selectedId)??TEMPLATES[0]!;
    const notes=currentRiffs.get(template.id); if(!notes)return;
    clear(detailHost);
    const row=noteRow(notes), positions=inferFingering(notes.map((n)=>n.midi),{tuning:context.session.tuning});
    const hear=async(speed=1)=>{await context.player.play(notes,{speed,onNote:(i)=>highlightNote(row,i),onEnd:()=>highlightNote(row,null)});};
    detailHost.appendChild(h('article',{class:'lab-selected-riff'},
      h('div',{class:'lab-selected-copy'},h('h3',{text:template.name}),h('p',{class:'muted',text:template.feel}),h('p',{},h('strong',{text:'What this teaches: '}),template.lesson)),row,
      h('div',{class:'lab-riff-actions'},button('Hear it',()=>{void hear(1);},'btn-primary'),button('75%',()=>{void hear(.75);},'btn-quiet'),button('50%',()=>{void hear(.5);},'btn-quiet'),button('Save to my library',async()=>{const riff=await context.library.saveRiff(notes,{comment:`Riff Lab · ${ROOTS[rootPc]} ${scale.label} · ${template.name}`});context.say('Saved. Change it until it becomes yours.');context.navigate('library',{riff:riff.id});},'btn-quiet')),
      h('details',{class:'section'},h('summary',{text:'Show tab + fingering'}),fretboardDiagram(positions,context.session.tuning),tabBlock(renderTab(positions,context.session.tuning))),
      h('div',{class:'lab-riff-actions'},button('Start my attempt',async()=>{if(!context.listening)await context.startListening();practiceStartMs=context.session.currentTimeMs;practiceHost.textContent='Listening now. Play the riff once, then press Check my take.';},'btn-primary'),button('Check my take',()=>{if(practiceStartMs===null){practiceHost.textContent='Press Start my attempt first.';return;}const attempt=context.session.memory.all().filter((n)=>n.startMs>=practiceStartMs!);const result=practiceAttempt(notes,attempt,{requiredAccuracy:.85,tempoTolerance:.18});practiceHost.textContent=`${Math.round(result.accuracy*100)}% note match. ${result.feedback.join(' ')}`;practiceStartMs=null;},'btn-quiet')),
    ));
  }

  function renderProgressions():void {
    clear(progressionsHost);
    const scaleNotes=scaleMidis(rootPc,scale.degrees,context.session.tuning.strings[0]!);
    const labels=['Big familiar loop','A little heavier','Keep it moving'];
    progressionsHost.appendChild(h('div',{class:'lab-progression-grid'},...progressions(rootPc,scale.minor).map((chords,i)=>{
      const lead=leadOverProgression(chords,scaleNotes);
      const leadRow=noteRow(lead);
      const leadBox=h('div',{class:'lab-generated-lead'},h('p',{},h('strong',{text:'Generated lead: '}),'two target notes per chord, staying inside your selected scale.'),leadRow,
        h('div',{class:'lab-progression-actions'},button('Hear lead',()=>{void context.player.play(lead,{onNote:(n)=>highlightNote(leadRow,n),onEnd:()=>highlightNote(leadRow,null)});},'btn-quiet'),button('Save lead as riff',async()=>{await context.library.saveRiff(lead,{comment:`Built over ${chords.map((c)=>c.label).join(' → ')} · ${ROOTS[rootPc]} ${scale.label}`});context.say('That progression-based lead is in My Riffs now.');},'btn-quiet')));
      return h('article',{class:'lab-progression-card'},h('span',{class:'muted',text:labels[i]??'Progression'}),h('strong',{text:chords.map((c)=>c.label).join('  →  ')}),h('p',{class:'muted',text:'First hear the chords by themselves. Then hear how a lead can aim at chord tones without leaving the scale.'}),h('div',{class:'lab-progression-actions'},button('Hear chords',()=>{void context.player.play(progressionNotes(chords));},'btn-primary'),button('Hear chords → lead',async()=>{await context.player.play(progressionNotes(chords));await context.player.play(lead);},'btn-quiet')),leadBox);
    })));
  }

  function render():void { renderScale();renderRiffs();renderProgressions(); }
  render();
  return {element,update:render};
}
