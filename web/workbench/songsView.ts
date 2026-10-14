import { h,replace } from '../ui/dom.ts';
import type { View } from '../views/context.ts';
import type { WorkbenchModel } from './model.ts';
import { action,download,sourceLabel } from './ui.ts';
import { makeId } from '../../src/util/id.ts';

export function projectView(model:WorkbenchModel):View{
 model.playTarget='song';
 const rail=h('aside',{class:'wb-rail'}),editor=h('section',{class:'wb-editor'}),error=h('div',{class:'wb-error',role:'alert',hidden:true});
 const name=h('input',{'aria-label':'New song name',placeholder:'Name your song'});
 const root=h('div',{class:'workbench'},rail,h('div',{class:'wb-surface'},h('header',{class:'wb-heading'},h('div',{},h('p',{class:'wb-eyebrow',text:'FROM A PHRASE TO A SONG'}),h('h2',{text:'Songs'}))),h('div',{class:'wb-actions'},name,action(model,'New song',()=>model.createProject(name.value),'wb-button wb-primary')),error,editor));
 let key='',dragged=-1;
 function render():void{
  const s=model.snapshot,p=s.project;replace(rail,h('h2',{text:'Your songs'}),h('div',{class:'wb-idea-list'},...s.songs.filter(song=>!song.archivedAt).map(song=>{
   const button=action(model,'',()=>model.openProject(song.id),'wb-idea');button.classList.toggle('is-selected',song.id===p?.id);button.append(h('strong',{text:song.name}),h('span',{text:`${song.sections.length} sections`}));return button;
  })));replace(editor);
  if(!p){editor.append(h('div',{class:'wb-empty'},h('h3',{text:'Give your ideas somewhere to go.'}),h('p',{text:'Create a song, add specific takes, and put the sections in the order you hear them.'})));return;}
  const title=h('input',{class:'wb-title-input','aria-label':'Song name',value:p.name});title.addEventListener('change',()=>void model.editProject({...p,name:title.value.trim()||'Untitled song'}).catch(e=>model.report(e)));
  const undo=action(model,'Undo',()=>model.songHistory('undo')),redo=action(model,'Redo',()=>model.songHistory('redo'));undo.disabled=!model.canUndoSong;redo.disabled=!model.canRedoSong;
  editor.append(title,h('div',{class:'wb-actions'},action(model,'Play song',()=>model.playProject(),'wb-button wb-primary'),action(model,'Download song demo',async()=>download(await model.exportProjectDemo(),`${p.name}.wav`)),undo,redo));
  if(model.pendingProject)editor.append(action(model,'Retry retained song edit',()=>model.retryProject()));
  editor.append(h('p',{class:'wb-small',text:'Each section keeps its chosen take and range. Timing, silence and dynamics stay as played. Demos export at 48 kHz stereo.'}));
  async function move(from:number,to:number):Promise<void>{if(to<0||to>=p!.sections.length)return;const sections=structuredClone(p!.sections);const [section]=sections.splice(from,1);sections.splice(to,0,section!);await model.editProject({...p!,sections});}
  const sections=h('div',{class:'wb-sections'});
  p.sections.forEach((section,i)=>{
   const riff=s.riffs.find(r=>r.id===section.riffId),take=riff?.versions.find(v=>v.id===section.versionId);
   const role=h('input',{'aria-label':`Section ${i+1} name`,value:section.role}),repeat=h('input',{type:'number',min:1,max:32,value:section.repeats??1,'aria-label':`Section ${i+1} repeats`});
   const update=()=>model.editProject({...p,sections:p.sections.map((item,n)=>n===i?{...item,role:role.value.trim()||'Section',repeats:Number(repeat.value)}:item)});
   role.addEventListener('change',()=>void update().catch(e=>model.report(e)));repeat.addEventListener('change',()=>void update().catch(e=>model.report(e)));
   const up=action(model,'↑',()=>move(i,i-1)),down=action(model,'↓',()=>move(i,i+1));up.setAttribute('aria-label',`Move section ${i+1} up`);down.setAttribute('aria-label',`Move section ${i+1} down`);up.disabled=i===0;down.disabled=i===p.sections.length-1;
   const card=h('article',{class:'wb-section',draggable:true},h('span',{class:'wb-section-number',text:String(i+1).padStart(2,'0')}),h('div',{},role,h('p',{class:'wb-small',text:`${riff?.name??'Untitled idea'} · ${take?.label??'Take unavailable'} · ${sourceLabel(take?.sourceKind)}`})),h('label',{class:'wb-repeat'},'Repeats',repeat),h('div',{class:'wb-actions'},up,down,action(model,'Loop section',()=>model.loopSection(i)),action(model,'Duplicate',()=>model.editProject({...p,sections:[...p.sections.slice(0,i+1),{...structuredClone(section),id:makeId('section')},...p.sections.slice(i+1)]})),action(model,'Remove',()=>model.editProject({...p,sections:p.sections.filter((_,n)=>n!==i)}))));
   card.addEventListener('dragstart',event=>{if((event.target as HTMLElement).closest('input,button,select,textarea')){event.preventDefault();return;}dragged=i;});card.addEventListener('dragover',event=>event.preventDefault());card.addEventListener('drop',event=>{event.preventDefault();if(dragged>=0)void move(dragged,i).catch(e=>model.report(e));dragged=-1;});sections.append(card);
  });
  if(!p.sections.length)sections.append(h('p',{class:'wb-muted',text:'Start with an intro, verse, or any passage you want to build around.'}));editor.append(sections);
  const choice=h('select',{'aria-label':'Take to add'},h('option',{value:'',text:'Choose an idea and take'}));
  for(const riff of s.riffs.filter(r=>!r.archivedAt))for(const version of riff.versions)choice.append(h('option',{value:JSON.stringify({riffId:riff.id,versionId:version.id}),text:`${riff.name??'Untitled idea'} / ${version.label} · ${sourceLabel(version.sourceKind)}`}));
  const role=h('input',{'aria-label':'New section name',placeholder:'Verse, chorus, bridge…',value:'Verse'});
  editor.append(h('section',{class:'wb-tool-panel'},h('h3',{text:'Add a section'}),h('div',{class:'wb-actions'},choice,role,action(model,'Add selected take',()=>{if(!choice.value)throw new Error('Choose a take first');return model.addSection(p.id,JSON.parse(choice.value),role.value);}))));
  const notes=h('textarea',{'aria-label':'Lyrics and performance notes',rows:8,placeholder:'Lyrics, chords, where to pull back, where to let Burl ring…',value:p.notes??''});
  editor.append(h('label',{class:'wb-field'},'Lyrics & performance notes',notes),action(model,'Save lyrics and notes',()=>model.editProject({...p,notes:notes.value})));
 }
 const unsubscribe=model.subscribe(s=>{error.hidden=!s.error;error.textContent=s.error;const next=JSON.stringify([s.project,s.songs,s.riffs.map(r=>[r.id,r.name,r.versions.length]),!!model.pendingProject]);if(next!==key){key=next;render();}});
 return {element:root,dispose(){unsubscribe();}};
}
