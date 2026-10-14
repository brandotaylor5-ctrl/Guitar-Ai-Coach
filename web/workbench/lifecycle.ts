import type { WorkbenchModel } from './model.ts';
import { h } from '../ui/dom.ts';
export function canApplyUpdate(state:{recording:boolean;finalizing:boolean;recoveryPending:boolean;saving:boolean}):boolean{return !state.recording&&!state.finalizing&&!state.recoveryPending&&!state.saving;}
const CAPTURE_LOCK='guitar-workbench-capture';
export function acquireCaptureLock():Promise<()=>void>{
 if(!navigator.locks)throw new Error('This browser cannot safely coordinate recording tabs. Audio import is available; use a current Safari or Chrome for recording.');
 return new Promise((resolve,reject)=>{
  void navigator.locks.request(CAPTURE_LOCK,{ifAvailable:true},async lock=>{
   if(!lock){reject(new Error('Recording or recovery is active in another app tab. Finish it there first.'));return;}
   await new Promise<void>(release=>resolve(release));
  }).catch(reject);
 });
}
export async function recoverAvailable(model:WorkbenchModel):Promise<void>{
 if(!navigator.locks)return;
 await navigator.locks.request(CAPTURE_LOCK,{ifAvailable:true},async lock=>{if(lock){const recovered=await model.repository.recoverInterrupted();if(recovered.length){await model.refresh();await model.openIdea(recovered.at(-1)!.riffId);}}});
}
export function installWorkbenchLifecycle(model:WorkbenchModel):()=>void{
 const safe=()=>{const s=model.snapshot;return canApplyUpdate({recording:['requesting','recording'].includes(s.recorder.status),finalizing:s.recorder.status==='finalizing',recoveryPending:s.recorder.status==='recoverable',saving:s.busy});};
 const banner=h('div',{class:'wb-update',hidden:true,role:'status'}),label=h('span',{}),button=h('button',{type:'button',class:'wb-button',text:'Apply update'});banner.append(label,button);document.body.append(banner);
 let waiting:ServiceWorker|null=null,freezeTimer:ReturnType<typeof setTimeout>|null=null;
 const unfreeze=()=>{if(freezeTimer)clearTimeout(freezeTimer);model.updatePending=false;};
 const show=(text:string)=>{banner.hidden=false;label.textContent=text;};
 button.addEventListener('click',()=>{if(!safe()){show('Finish recording, recovery, or saving before updating.');return;}if(waiting)waiting.postMessage({type:'REQUEST_UPDATE'});else location.reload();});
 const message=(event:MessageEvent)=>{
  if(event.data?.type==='UPDATE_QUERY'){
   const ready=safe();if(ready){model.updatePending=true;freezeTimer=setTimeout(unfreeze,7000);}event.source?.postMessage({type:'UPDATE_VOTE',nonce:event.data.nonce,safe:ready});
  }else if(event.data?.type==='UPDATE_ABORT'){unfreeze();show('Update waiting. Finish work in other app tabs, or close those tabs, then apply again.');}
 };
 const changed=()=>{unfreeze();show('The app update is ready. Reload when your work is saved.');button.textContent='Reload app';waiting=null;};
 if('serviceWorker' in navigator){
  navigator.serviceWorker.addEventListener('message',message);navigator.serviceWorker.addEventListener('controllerchange',changed);
  void navigator.serviceWorker.getRegistration().then(registration=>{
   if(!registration)return;const check=()=>{if(registration.waiting){waiting=registration.waiting;show('An app update is ready. Your current work will stay open until you apply it.');}};check();registration.addEventListener('updatefound',()=>registration.installing?.addEventListener('statechange',check));
  });
 }
 const hidden=()=>{if(document.hidden){model.transport.stop();if(['recording','requesting'].includes(model.recorder.snapshot.status))void model.recorder.interrupt('Recording paused when this tab left the foreground. Download the captured take in Record.');}};
 const unload=(event:BeforeUnloadEvent)=>{if(!safe()){event.preventDefault();event.returnValue='';}};
 const key=(event:KeyboardEvent)=>{
  if(event.repeat||event.ctrlKey||event.metaKey||event.altKey||(event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable=true]'))return;
  if(event.key==='Escape'){model.cancelOperation();return;}
  if(event.code==='Space'){event.preventDefault();void (model.snapshot.transport.playing?Promise.resolve(model.stopPlayback()):model.play()).catch(e=>model.report(e));}
  if(event.key.toLowerCase()==='r'&&!model.snapshot.busy){event.preventDefault();void (['recording','requesting'].includes(model.recorder.snapshot.status)?model.recorder.stop():model.recorder.start()).catch(e=>model.report(e));}
 };
 document.addEventListener('visibilitychange',hidden);window.addEventListener('beforeunload',unload);document.addEventListener('keydown',key);
 return()=>{unfreeze();banner.remove();document.removeEventListener('visibilitychange',hidden);window.removeEventListener('beforeunload',unload);document.removeEventListener('keydown',key);navigator.serviceWorker?.removeEventListener('message',message);navigator.serviceWorker?.removeEventListener('controllerchange',changed);};
}
