import { h,replace,relativeTime } from '../ui/dom.ts';
import type { View } from '../views/context.ts';
import type { WorkbenchModel } from './model.ts';
import { waveform } from './waveform.ts';
import type { WaveformElement } from './waveform.ts';
import { action,download,sourceLabel,time } from './ui.ts';
import { encodePcmWav } from '../audio/pcmWav.ts';

export function recordView(model:WorkbenchModel):View{
 const list=h('div',{class:'wb-idea-list'}),editor=h('section',{class:'wb-editor'}),error=h('div',{class:'wb-error',role:'alert',hidden:true});
 const clock=h('span',{class:'wb-record-clock wb-mono',text:'0:00'}),meter=h('meter',{min:0,max:1,value:0,'aria-label':'Microphone input level'});
 const record=action(model,'● Record',async()=>{if(['recording','requesting'].includes(model.recorder.snapshot.status))await model.recorder.stop();else await model.recorder.start();},'wb-button wb-record');
 const mark=action(model,'Mark moment',()=>model.recorder.mark());mark.disabled=true;
 const file=h('input',{type:'file',accept:'audio/*,.m4a,.wav,.mp3,.aac,.flac,.ogg',hidden:true,'aria-label':'Import audio file'});file.addEventListener('change',()=>{const item=file.files?.[0];file.value='';if(item)void model.import(item).catch(e=>model.report(e));});
 const importButton=action(model,'Import audio',()=>file.click());
 const instrument=h('input',{value:model.instrument,list:'wb-instruments','aria-label':'Instrument label',placeholder:'Instrument'});instrument.addEventListener('change',()=>{model.instrument=instrument.value.trim()||'Guitar';});
 const liveCanvas=h('canvas',{class:'wb-live-wave',height:90,width:700,'aria-label':'Live recording waveform',hidden:true});
 const recovery=h('div',{class:'wb-recovery',hidden:true}),hint=h('p',{class:'wb-muted',text:'Up to 10 minutes per take. Keep this tab in the foreground while recording.'});
 const root=h('div',{class:'workbench wb-record-view'},h('aside',{class:'wb-rail'},h('div',{class:'wb-rail-heading'},h('h2',{text:'Ideas'}),h('span',{class:'wb-small',text:'On this device'})),list),
  h('div',{class:'wb-surface'},h('header',{class:'wb-heading'},h('div',{},h('p',{class:'wb-eyebrow',text:'GUITAR WORKBENCH'}),h('h2',{text:'Record'}))),h('section',{class:'wb-capture'},
   h('div',{class:'wb-capture-actions'},record,mark,importButton,file,clock),h('div',{class:'wb-input-row'},meter,instrument,h('datalist',{id:'wb-instruments'},h('option',{value:'Burl'}),h('option',{value:'Llewelyn'}))),liveCanvas,hint),
   h('p',{class:'wb-small',text:'Import a Dolby On recording or another local audio file · mono or stereo · 100 MB maximum'}),error,recovery,editor));
 let wave:WaveformElement|null=null,revision=-1,shown='',editorGeneration=0;
 const archived=h('details',{class:'wb-archived'},h('summary',{text:'Archived ideas'})),archivedList=h('div',{});archived.append(archivedList);root.querySelector('.wb-rail')!.append(archived);
 function renderEditor():void{
  const generation=++editorGeneration;wave?.dispose();wave=null;const s=model.snapshot;replace(editor);
  if(!s.version || !s.riff){editor.append(h('div',{class:'wb-empty'},h('span',{class:'wb-empty-mark',text:'∿','aria-hidden':'true'}),h('h3',{text:'Keep the part you want to come back to.'}),h('p',{text:'Record freely, or bring in a take from your phone. Choose a passage once you hear something worth keeping.'})));return;}
  const title=h('input',{class:'wb-title-input',value:s.riff.name??'',placeholder:'Untitled idea','aria-label':'Idea name'});title.addEventListener('change',()=>void model.rename(title.value).catch(e=>model.report(e)));
  editor.append(h('div',{class:'wb-editor-title'},title,h('span',{class:'wb-source',text:sourceLabel(s.version.sourceKind)})));
  editor.append(action(model,'Archive idea',async()=>{await model.repository.archiveRiff(s.riff!.id,true);await model.refresh();}));
  if(s.audio && s.selection){
   wave=waveform({audio:s.audio,selection:s.selection,onSelection:(a,b)=>model.setSelection(a,b)});editor.append(wave);
   const keep=action(model,'Keep selection as idea',()=>model.keepSelection(),'wb-button wb-primary'),exportButton=action(model,'Download selection',async()=>download(await model.exportSelection(),`${model.snapshot.riff?.name??'guitar-idea'}.wav`));
   keep.dataset.selectionAction='true';exportButton.dataset.selectionAction='true';
   editor.append(h('div',{class:'wb-actions'},keep,action(model,'Full take',()=>model.setSelection(0,s.audio!.channels[0]!.length)),exportButton));
   const assetId=s.selection.assetId;void model.repository.getAsset(assetId).then(asset=>{if(!asset || generation!==editorGeneration || model.snapshot.selection?.assetId!==assetId)return;
    if(asset.originalBlob)editor.append(action(model,'Download original file',()=>download(asset.originalBlob!,asset.originalFilename??'original-audio')));
    if(asset.markers.length)editor.append(h('div',{class:'wb-markers'},...asset.markers.map((n,i)=>action(model,`Mark ${i+1} · ${time(n/asset.sampleRate)}`,()=>model.setSelection(n,asset.markers[i+1]??asset.sampleCount)))));
    editor.append(h('p',{class:'wb-small',text:`${(asset.sampleRate/1000).toFixed(1)} kHz ${asset.importDecode==='browser-decoded'?'working audio':'audio'} · ${asset.channelCount===2?'stereo':'mono'} · Full source preserved`}));
   }).catch(e=>model.report(e));
  }else editor.append(h('p',{class:'wb-muted',text:'This idea contains a synthesized note sketch. Open Develop to edit it.'}));
 }
 const unsub=model.subscribe(s=>{
  const active=['recording','requesting','finalizing'].includes(s.recorder.status);record.textContent=s.recorder.status==='requesting'?'Cancel request':s.recorder.status==='recording'?'■ Stop':'● Record';record.classList.toggle('is-recording',s.recorder.status==='recording');record.disabled=s.busy||s.recorder.status==='finalizing'||s.recorder.status==='recoverable';mark.disabled=s.recorder.status!=='recording';importButton.disabled=active||s.busy||s.recorder.status==='recoverable';instrument.disabled=active;
  clock.textContent=time(s.recorder.sampleRate?s.recorder.capturedSamples/s.recorder.sampleRate:0);meter.value=s.recorder.level;
  const seconds=s.recorder.sampleRate?s.recorder.capturedSamples/s.recorder.sampleRate:0;hint.textContent=seconds>=540&&active?`${Math.max(0,Math.ceil(600-seconds))} seconds left in this take. It will save automatically.`:'Up to 10 minutes per take. Keep this tab in the foreground while recording.';
  liveCanvas.hidden=!active;if(active){const ctx=liveCanvas.getContext('2d');if(ctx){ctx.clearRect(0,0,700,90);ctx.strokeStyle='#e7b36b';const peaks=s.recorder.peaks;peaks.forEach((p,i)=>{const x=i/Math.max(1,peaks.length)*700;ctx.beginPath();ctx.moveTo(x,45-p.max*42);ctx.lineTo(x,45-p.min*42);ctx.stroke();});}}
  const message=s.error??'';error.hidden=!(message||s.recorder.error);error.textContent=message||s.recorder.error||'';
  recovery.hidden=s.recorder.status!=='recoverable';if(!recovery.hidden && shown!==s.recorder.error){shown=s.recorder.error??'';replace(recovery,h('h3',{text:'Keep your captured audio'}),h('p',{text:shown}),action(model,'Download rescue WAV',async()=>{download(new Blob([encodePcmWav(await model.recorder.rescue(),'pcm16')],{type:'audio/wav'}),'recovered-take.wav');await model.recorder.acknowledgeRecovery();await model.refresh();}),action(model,'Dismiss rescue',async()=>{if(!window.confirm('Dismiss the unsaved tail? Any committed audio stays recoverable.'))return;await model.recorder.acknowledgeRecovery();await model.refresh();}));}
  if(s.revision!==revision){revision=s.revision;replace(list,...s.riffs.filter(r=>!r.archivedAt).sort((a,b)=>b.updatedAt-a.updatedAt).map(r=>{const btn=action(model,'',()=>model.openIdea(r.id),'wb-idea');btn.classList.toggle('is-selected',r.id===s.riff?.id);btn.append(h('strong',{text:r.name??'Untitled idea'}),h('span',{text:`${r.versions.length} ${r.versions.length===1?'take':'takes'} · ${relativeTime(r.createdAt)}`}));return btn;}));if(!list.childElementCount)list.append(h('p',{class:'wb-muted',text:'Your recordings and selected ideas will appear here.'}));renderEditor();}
  if(s.revision===revision){replace(archivedList,...s.riffs.filter(r=>r.archivedAt).map(r=>action(model,`Restore ${r.name??'untitled idea'}`,async()=>{await model.repository.archiveRiff(r.id,false);await model.refresh();})));}
  if(s.selection)wave?.setSelection(s.selection);for(const control of editor.querySelectorAll<HTMLButtonElement>('[data-selection-action]'))control.disabled=!model.canUseSelection||s.busy||active;
 });
 return {element:root,dispose(){editorGeneration++;unsub();wave?.dispose();}};
}
