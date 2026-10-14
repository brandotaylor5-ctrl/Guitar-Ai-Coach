import type { Riff, RiffVersion, SongSeed, NoteEvent } from '../../src/types.ts';
import { EditHistory, validateNotes } from '../../src/workbench/edits.ts';
import { makeId } from '../../src/util/id.ts';
import { analyzeRecordedRegion } from './processing.ts';
import { ConflictError } from './repository.ts';
import { resolveArrangement,renderArrangement } from '../../src/workbench/arrangement.ts';
import { exportProject,restoreProject } from './backup.ts';
import type { AudioRegion, KeptTake, PcmAudio } from '../../src/workbench/types.ts';
import { sourceForVersion } from '../../src/workbench/types.ts';
import { validateRegion } from '../../src/workbench/regions.ts';
import { RiffLibrary } from '../../src/library/riffLibrary.ts';
import { encodePcmWav } from '../audio/pcmWav.ts';
import { renderNotePcm } from '../audio/playback.ts';
import { importAudio } from './audioImport.ts';
import type { WorkbenchRepository } from './repository.ts';
import type { RecordingController, RecordingSnapshot } from './recorder.ts';
import type { AudioTransport, TransportSnapshot } from './transport.ts';

export interface WorkbenchSnapshot {
 riffs:Riff[];songs:SongSeed[];project:SongSeed|null;riff:Riff|null;version:RiffVersion|null;selection:AudioRegion|null;audio:PcmAudio|null;
 recorder:RecordingSnapshot;transport:TransportSnapshot;saveStatus:string;error:string;busy:boolean;revision:number;
}
export class WorkbenchModel {
 readonly repository:WorkbenchRepository;readonly recorder:RecordingController;readonly transport:AudioTransport;readonly library:RiffLibrary;
 private state:Omit<WorkbenchSnapshot,'recorder'|'transport'>={riffs:[],songs:[],project:null,riff:null,version:null,selection:null,audio:null,saveStatus:'Saved on this device',error:'',busy:false,revision:0};
 private listeners=new Set<(state:WorkbenchSnapshot)=>void>();
 private openGeneration=0;private seenTake='';private operation:AbortController|null=null;
 loop=false;speed:1|.75|.5=1;
 instrument='Guitar';tuningSnapshot:RiffVersion['tuningSnapshot'];
 private histories=new Map<string,EditHistory<Riff>>();
 pendingEdit:Riff|null=null;comparison:{a:string;b:string}|null=null;
 private songHistories=new Map<string,EditHistory<SongSeed>>();
 playTarget:'idea'|'song'='idea';pendingProject:SongSeed|null=null;
 updatePending=false;
 get canCancel():boolean{return !!this.operation;}
 constructor(options:{repository:WorkbenchRepository;recorder:RecordingController;transport:AudioTransport}){
  this.repository=options.repository;this.recorder=options.recorder;this.transport=options.transport;this.library=new RiffLibrary(options.repository);
 }
 get snapshot():WorkbenchSnapshot{return {...this.state,recorder:this.recorder.snapshot,transport:this.transport.snapshot};}
 subscribe(listener:(state:WorkbenchSnapshot)=>void):()=>void{this.listeners.add(listener);listener(this.snapshot);return()=>this.listeners.delete(listener);}
 protected emit(structural=true):void{if(structural)this.state.revision++;for(const listener of this.listeners)listener(this.snapshot);}
 report(error:unknown):void{this.state.error=error instanceof Error?error.message:String(error);this.emit();}
 clearError():void{this.state.error='';this.emit();}
 notifyTransport():void{this.emit(false);}
 notifyRecorder():void{
  this.emit(false);const kept=this.recorder.snapshot.kept;
  if(kept && kept.versionId!==this.seenTake){this.seenTake=kept.versionId;void this.finishTake(kept).catch(error=>this.report(error));}
 }
 private async finishTake(kept:KeptTake):Promise<void>{
  const riff=await this.repository.getRiff(kept.riffId),version=riff?.versions.find(v=>v.id===kept.versionId);
  if(riff && version){version.instrument=this.instrument;if(this.tuningSnapshot)version.tuningSnapshot=structuredClone(this.tuningSnapshot);await this.repository.putRiff(riff);}
  await this.refresh();await this.openIdea(kept.riffId,kept.versionId);
 }
 async refresh():Promise<void>{
  [this.state.riffs,this.state.songs]=await Promise.all([this.repository.listRiffs(),this.repository.listSongs()]);this.emit();
 }
 async openIdea(riffId:string,versionId?:string):Promise<void>{
  if(this.recorder.snapshot.status==='recoverable')throw new Error('Download or dismiss the rescue take before changing ideas.');
  const generation=++this.openGeneration;this.transport.stop();
  const riff=await this.repository.getRiff(riffId);if(!riff)throw new Error('This idea is unavailable');
  if(!this.histories.has(riffId))this.histories.set(riffId,new EditHistory(riff));
  const version=riff.versions.find(v=>v.id===(versionId??riff.currentVersionId));if(!version)throw new Error('This take is unavailable');
  let audio:PcmAudio|null=null;
  if(version.recording){
    const asset=await this.repository.getAsset(version.recording.assetId);
    if(!asset)throw new Error('Recording unavailable');
    audio=await this.repository.readRegion({assetId:asset.id,startSample:0,endSample:asset.sampleCount});
  }
  if(generation!==this.openGeneration)return;
  this.state={...this.state,riff,version,audio,selection:version.recording?{...version.recording}:null,error:''};this.emit();
 }
 setSelection(startSample:number,endSample:number):void{
  if(!this.state.selection)return;
  this.state.selection={...this.state.selection,startSample,endSample};this.emit(false);
 }
 get canUseSelection():boolean{
  if(!this.state.selection || !this.state.audio)return false;
  try{validateRegion(this.state.selection,this.state.audio.channels[0]!.length);return true;}catch{return false;}
 }
 private validSelection():AudioRegion{if(!this.canUseSelection)throw new Error('Choose a non-empty range inside the recording');return {...this.state.selection!};}
 protected async save<T>(work:()=>Promise<T>):Promise<T>{
  if(this.updatePending)throw new Error('The app update is being applied. Wait a moment.');
  if(this.state.busy)throw new Error('Wait for the current operation to finish');
  this.state.busy=true;this.state.saveStatus='Saving…';this.state.error='';this.emit();
  try{const result=await work();this.state.saveStatus='Saved on this device';return result;}
  catch(error){this.state.saveStatus='Not saved';this.state.error=error instanceof Error?error.message:String(error);throw error;}
  finally{this.state.busy=false;this.emit();}
 }
 async keepSelection():Promise<KeptTake>{
  const region=this.validSelection(),original=this.state.version;
  const kept=await this.save(async()=>{
    const riff=await this.library.saveRiff([],{recording:region,sourceKind:original?.sourceKind??'recorded',instrument:original?.instrument??this.instrument,
      tuningSnapshot:original?.tuningSnapshot,analysis:{state:'unavailable'},comment:'Selected from a full original take.'});
    return {riffId:riff.id,versionId:riff.currentVersionId};
  });await this.refresh();await this.openIdea(kept.riffId,kept.versionId);return kept;
 }
 async exportSelection():Promise<Blob>{
  const pcm=await this.repository.readRegion(this.validSelection());return new Blob([encodePcmWav(pcm,'pcm16')],{type:'audio/wav'});
 }
 async play():Promise<void>{
  if(['requesting','recording','finalizing','recoverable'].includes(this.recorder.snapshot.status))throw new Error('Finish the recording before playback.');
  if(this.playTarget==='song'){await this.playProject();return;}
  if(!this.state.version)throw new Error('Choose an idea first');
  const source=this.state.version.recording?{kind:'audio' as const,region:this.validSelection()}:sourceForVersion(this.state.version);
  await this.transport.play(source,{loop:this.loop,speed:this.speed});
 }
 async import(file:File):Promise<void>{
  this.requireIdle();
  if(['requesting','recording','finalizing','recoverable'].includes(this.recorder.snapshot.status))throw new Error('Finish the current recording before importing.');
  this.operation=new AbortController();
  try{const kept=await this.save(()=>importAudio(file,this.repository,this.operation!.signal));await this.finishTake(kept);}
  finally{this.operation=null;}
 }
 cancelOperation():void{this.operation?.abort();this.transport.stop();}
 async rename(name:string):Promise<void>{
  const riff=this.state.riff;if(!riff)return;
  await this.save(async()=>{const updated={...riff,name:name.trim()||null};await this.repository.putRiff(updated);this.state.riff=updated;});await this.refresh();
 }
 async exportSketch():Promise<Blob>{
  const version=this.state.version;if(!version || version.recording)throw new Error('Choose a synthesized sketch');
  return new Blob([encodePcmWav(await renderNotePcm(version.notes,48000),'pcm16')],{type:'audio/wav'});
 }
 private requireIdle():void{
  if(this.updatePending)throw new Error('The app update is being applied. Wait a moment.');
  if(this.state.busy||['requesting','recording','finalizing','recoverable'].includes(this.recorder.snapshot.status))throw new Error('Finish the current recording or operation first.');
 }
 async recordAlternate():Promise<void>{
  this.requireIdle();const {riff,version}=this.state;if(!riff||!version)throw new Error('Choose a take first');
  await this.recorder.start({riffId:riff.id,parentId:version.id});
 }
 chooseComparison(a:string,b:string):void{
  if(!this.state.riff?.versions.some(v=>v.id===a)||!this.state.riff.versions.some(v=>v.id===b))throw new Error('Choose two saved takes');
  this.comparison={a,b};this.emit(false);
 }
 async previewNotes(notes:NoteEvent[]):Promise<void>{this.requireIdle();validateNotes(notes,this.state.version??{});await this.transport.play({kind:'synthesized',notes},{loop:this.loop,speed:this.speed});}
 async estimateNotes():Promise<void>{
  this.requireIdle();const region=this.validSelection(),version=this.state.version!;this.operation=new AbortController();
  try{
   const notes=await this.save(async()=>analyzeRecordedRegion(await this.repository.readRegion(region),this.operation!.signal));
   if(!notes.length)throw new Error('No clear single-note line was found. The recording is saved; you can enter notes yourself.');
   await this.saveVersionEdit({...version,recording:region,notes,analysis:{state:'estimated'}});
  }finally{this.operation=null;}
 }
 private async persistIdea(next:Riff,recordHistory=true):Promise<void>{
  this.requireIdle();const id=next.id;
  try{await this.save(()=>this.repository.putRiff(next));}
  catch(error){if(error instanceof ConflictError){this.pendingEdit=structuredClone(next);await this.refresh();await this.openIdea(id);this.report('This idea changed in another tab. Your pending edit is retained. Review the latest take, then retry it.');}throw error;}
  if(recordHistory)this.histories.get(id)?.apply(next);this.pendingEdit=null;
  await this.refresh();await this.openIdea(id,next.currentVersionId);
 }
 async saveVersionEdit(version:RiffVersion):Promise<void>{
  const riff=this.state.riff;if(!riff||!riff.versions.some(v=>v.id===version.id))throw new Error('The edited take is no longer selected');
  if(version.notes.length)validateNotes(version.notes,version);
  const edited={...structuredClone(version),id:makeId('ver'),parentId:version.id,createdAt:Date.now()};
  await this.persistIdea({...riff,versions:[...riff.versions,edited],currentVersionId:edited.id,updatedAt:Date.now()});
 }
 async keepSketch(version:RiffVersion):Promise<void>{
  const riff=this.state.riff;if(!riff||!riff.versions.some(v=>v.id===version.parentId)||version.recording||version.sourceKind!=='synthesized')throw new Error('Invalid sketch source');
  validateNotes(version.notes,version);await this.persistIdea({...riff,versions:[...riff.versions,structuredClone(version)],currentVersionId:version.id,updatedAt:Date.now()});
 }
 async favorite():Promise<void>{
  if(this.state.riff&&this.state.version)await this.persistIdea({...this.state.riff,currentVersionId:this.state.version.id,updatedAt:Date.now()});
 }
 get canUndo():boolean{return !!this.state.riff&&!!this.histories.get(this.state.riff.id)?.canUndo;}
 get canRedo():boolean{return !!this.state.riff&&!!this.histories.get(this.state.riff.id)?.canRedo;}
 async undo():Promise<void>{await this.moveHistory('undo');}
 async redo():Promise<void>{await this.moveHistory('redo');}
 private async moveHistory(direction:'undo'|'redo'):Promise<void>{
  this.requireIdle();const current=this.state.riff;if(!current)return;const history=this.histories.get(current.id);if(!history)return;
  const target=history[direction]();
  // Retain all immutable versions: a song may already pin an undone branch.
  target.versions=[...current.versions,...target.versions.filter(v=>!current.versions.some(c=>c.id===v.id))];target.revision=current.revision;
  try{await this.persistIdea(target,false);}catch(error){history[direction==='undo'?'redo':'undo']();throw error;}
 }
 async retryPendingEdit():Promise<void>{
  const pending=this.pendingEdit;if(!pending)return;const latest=await this.repository.getRiff(pending.id);if(!latest)throw new Error('Idea unavailable');
  await this.persistIdea({...pending,revision:latest.revision,versions:[...latest.versions,...pending.versions.filter(v=>!latest.versions.some(c=>c.id===v.id))]});
 }
 async createProject(name:string):Promise<string>{
  this.requireIdle();const song=await this.save(()=>this.library.createSong(name.trim()||'Untitled song'));await this.refresh();await this.openProject(song.id);return song.id;
 }
 async openProject(id:string):Promise<void>{
  const project=await this.repository.getSong(id);if(!project)throw new Error('Song unavailable');this.transport.stop();this.state.project=project;this.playTarget='song';
  if(!this.songHistories.has(id))this.songHistories.set(id,new EditHistory(project));this.emit();
 }
 async addSection(projectId:string,kept:KeptTake,role:string):Promise<void>{
  const project=await this.repository.getSong(projectId),riff=await this.repository.getRiff(kept.riffId),version=riff?.versions.find(v=>v.id===kept.versionId);
  if(!project||!version)throw new Error('Choose an available song and take');
  const selection=this.state.version?.id===version.id&&this.canUseSelection?this.state.selection:version.recording;
  await this.editProject({...project,sections:[...project.sections,{id:makeId('section'),role:role.trim()||'Section',riffId:riff!.id,versionId:version.id,repeats:1,...(selection?{recording:{...selection}}:{})}]});
 }
 async editProject(project:SongSeed,history=true):Promise<void>{
  this.requireIdle();
  try{await this.save(()=>this.repository.putSong(project));}
  catch(error){if(error instanceof ConflictError){this.pendingProject=structuredClone(project);await this.openProject(project.id);this.report('The song changed in another tab. Your edit is retained; review the latest song before retrying.');}throw error;}
  if(history)this.songHistories.get(project.id)?.apply(project);this.pendingProject=null;this.state.project=project;await this.refresh();
 }
 async retryProject():Promise<void>{const pending=this.pendingProject;if(!pending)return;const latest=await this.repository.getSong(pending.id);if(!latest)throw new Error('Song unavailable');await this.editProject({...pending,revision:latest.revision});}
 get canUndoSong():boolean{return !!this.state.project&&!!this.songHistories.get(this.state.project.id)?.canUndo;}
 get canRedoSong():boolean{return !!this.state.project&&!!this.songHistories.get(this.state.project.id)?.canRedo;}
 async songHistory(direction:'undo'|'redo'):Promise<void>{
  const project=this.state.project;if(!project)return;const history=this.songHistories.get(project.id);if(!history)return;const next=history[direction]();next.revision=project.revision;
  try{await this.editProject(next,false);}catch(error){history[direction==='undo'?'redo':'undo']();throw error;}
 }
 private async renderProject():Promise<PcmAudio>{
  this.requireIdle();const project=this.state.project;if(!project)throw new Error('Choose a song first');
  this.operation=new AbortController();
  try{return await this.save(async()=>renderArrangement(resolveArrangement(project,await this.repository.listRiffs()),region=>this.repository.readRegion(region),renderNotePcm,48000,this.operation!.signal));}
  finally{this.operation=null;}
 }
 async playProject():Promise<void>{const audio=await this.renderProject();await this.transport.playPcm(audio,this.loop);}
 async exportProjectDemo():Promise<Blob>{const audio=await this.renderProject();return new Blob([encodePcmWav(audio,'pcm16')],{type:'audio/wav'});}
 async loopSection(index:number):Promise<void>{
  this.requireIdle();const project=this.state.project;if(!project)throw new Error('Choose a song first');
  const item=resolveArrangement(project,await this.repository.listRiffs())[index];if(!item)throw new Error('Section unavailable');await this.transport.play(item.source,{loop:true,speed:1});
 }
 async backupProject(acknowledgeMissing=false):Promise<Blob>{
  this.requireIdle();const project=this.state.project;if(!project)throw new Error('Choose a song first');this.operation=new AbortController();
  try{return await this.save(()=>exportProject(project.id,this.repository,this.operation!.signal,acknowledgeMissing));}finally{this.operation=null;this.emit(false);}
 }
 async restoreBackup(file:File):Promise<void>{
  this.requireIdle();this.operation=new AbortController();
  try{const restored=await this.save(()=>restoreProject(file,this.repository,this.operation!.signal));await this.refresh();await this.openProject(restored.projectId);}
  finally{this.operation=null;this.emit(false);}
 }
}
