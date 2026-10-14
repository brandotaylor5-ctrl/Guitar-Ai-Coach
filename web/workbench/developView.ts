import { h,replace } from '../ui/dom.ts';
import type { View } from '../views/context.ts';
import type { WorkbenchModel } from './model.ts';
import { waveform } from './waveform.ts';
import type { WaveformElement } from './waveform.ts';
import { noteEditor } from './noteEditor.ts';
import { makeVariations } from '../../src/workbench/variations.ts';
import { action,download,sourceLabel } from './ui.ts';

export function developView(model:WorkbenchModel):View{
 const rail=h('aside',{class:'wb-rail'}),editor=h('section',{class:'wb-editor'}),error=h('div',{class:'wb-error',role:'alert',hidden:true});
 const stop=action(model,'Stop and save take',()=>model.recorder.stop());stop.hidden=true;
 const root=h('div',{class:'workbench'},rail,h('div',{class:'wb-surface'},h('header',{class:'wb-heading'},h('div',{},h('p',{class:'wb-eyebrow',text:'YOUR PERFORMANCES · YOUR CHOICES'}),h('h2',{text:'Develop'}))),stop,error,editor));
 let wave:WaveformElement|null=null,key='';
 function render():void{
  wave?.dispose();wave=null;replace(rail,h('h2',{text:'Ideas & takes'}));replace(editor);
  const s=model.snapshot;
  const ideas=h('select',{'aria-label':'Develop idea'},h('option',{value:'',text:'Choose an idea'}),...s.riffs.filter(r=>!r.archivedAt).map(r=>h('option',{value:r.id,text:r.name??'Untitled idea'})));ideas.value=s.riff?.id??'';ideas.addEventListener('change',()=>{if(ideas.value)void model.openIdea(ideas.value).catch(e=>model.report(e));});rail.append(ideas);
  if(!s.version||!s.riff){editor.append(h('div',{class:'wb-empty'},h('h3',{text:'A place to try the next version.'}),h('p',{text:'Choose an idea, compare performances, or shape a phrase into a new sketch.'}),h('a',{href:'#record',class:'wb-button',text:'Go to Record'})));return;}
  const v=s.version,r=s.riff;
  rail.append(h('div',{class:'wb-idea-list'},...r.versions.map(t=>{const b=action(model,'',()=>model.openIdea(r.id,t.id),'wb-idea');b.classList.toggle('is-selected',t.id===v.id);b.append(h('strong',{text:`${t.id===r.currentVersionId?'★ ':''}${t.label}`}),h('span',{text:sourceLabel(t.sourceKind)}));return b;})));
  editor.append(h('div',{class:'wb-editor-title'},h('h3',{text:r.name??'Untitled idea'}),h('span',{class:'wb-source',text:sourceLabel(v.sourceKind)})));
  const undo=action(model,'Undo',()=>model.undo()),redo=action(model,'Redo',()=>model.redo());undo.disabled=!model.canUndo;redo.disabled=!model.canRedo;
  editor.append(h('div',{class:'wb-actions'},action(model,v.sourceKind==='synthesized'?'Record this version':'Record alternate take',()=>model.recordAlternate(),'wb-button wb-primary'),action(model,'Set as favorite',()=>model.favorite()),undo,redo));
  if(model.pendingEdit)editor.append(action(model,'Retry retained edit',()=>model.retryPendingEdit()));
  if(s.audio&&s.selection){wave=waveform({audio:s.audio,selection:s.selection,onSelection:(a,b)=>model.setSelection(a,b)});editor.append(wave,action(model,'Save range as version',()=>model.saveVersionEdit({...v,recording:model.snapshot.selection!,notes:[],analysis:{state:'unavailable'},label:`${v.label} · range`})));}
  const comment=h('textarea',{'aria-label':'Take notes',rows:2,placeholder:'What works? Tuning, capo, feel, the part to come back to…',value:v.comment??''});
  editor.append(h('label',{class:'wb-field'},'Take notes',comment),action(model,'Save take notes',()=>model.saveVersionEdit({...v,comment:comment.value})));
  if(r.versions.length>1){
   const selected=model.comparison??{a:r.versions[0]!.id,b:v.id};
   const a=h('select',{'aria-label':'Comparison A'},...r.versions.map(t=>h('option',{value:t.id,text:`${t.label} · ${sourceLabel(t.sourceKind)}`})));
   const b=h('select',{'aria-label':'Comparison B'},...r.versions.map(t=>h('option',{value:t.id,text:`${t.label} · ${sourceLabel(t.sourceKind)}`})));a.value=selected.a;b.value=selected.b;
   editor.append(h('section',{class:'wb-tool-panel'},h('h3',{text:'A / B comparison'}),h('div',{class:'wb-compare'},a,action(model,'Hear A',async()=>{model.chooseComparison(a.value,b.value);await model.openIdea(r.id,a.value);await model.play();}),b,action(model,'Hear B',async()=>{model.chooseComparison(a.value,b.value);await model.openIdea(r.id,b.value);await model.play();}))));
  }
  const panel=h('section',{class:'wb-tool-panel'},h('h3',{text:'Shape the phrase'}));
  if(v.recording)panel.append(action(model,'Estimate notes in selection',()=>model.estimateNotes()),h('p',{class:'wb-small',text:'Optional. Your recording is already saved and playable.'}));
  panel.append(noteEditor(model,v));
  if(v.analysis?.state==='confirmed'){
   const boundary=h('select',{'aria-label':'Replace ending from note'},...v.notes.slice(1).map((n,i)=>h('option',{value:n.startMs,text:`Note ${i+2} · ${(n.startMs/1000).toFixed(2)} s`})));
   const options=h('div',{class:'wb-variants'});
   const show=(op:'ending'|'rhythm')=>{const candidates=makeVariations(v,op,Number(boundary.value));replace(options,...candidates.map(candidate=>h('div',{class:'wb-variant'},h('strong',{text:candidate.label}),h('span',{class:'wb-small',text:'Synthesized sketch'}),h('div',{class:'wb-actions'},action(model,'Hear sketch',()=>model.previewNotes(candidate.notes)),action(model,'Keep sketch',()=>model.keepSketch(candidate))))));if(!candidates.length)options.append(h('p',{text:'No playable variation for this selection. Try a different boundary.'}));};
   panel.append(h('div',{class:'wb-actions'},boundary,action(model,'Try another ending',()=>show('ending')),action(model,'Try another rhythm',()=>show('rhythm')),action(model,'Hear confirmed baseline',()=>model.previewNotes(v.notes))),options);
  }
  if(!v.recording&&v.notes.length)panel.append(action(model,'Download sketch WAV',async()=>download(await model.exportSketch(),'guitar-sketch.wav')));
  editor.append(panel);
 }
 const unsubscribe=model.subscribe(s=>{
  error.hidden=!s.error;error.textContent=s.error;stop.hidden=!['recording','requesting','finalizing'].includes(s.recorder.status);stop.disabled=s.recorder.status==='finalizing';
  const next=JSON.stringify([s.riff,s.version,s.riffs.map(r=>[r.id,r.name]),!!model.pendingEdit]);if(next!==key){key=next;render();}
  if(s.selection)wave?.setSelection(s.selection);
 });
 return {element:root,dispose(){unsubscribe();wave?.dispose();}};
}
