import { h } from '../ui/dom.ts';
import type { WorkbenchModel } from './model.ts';
import { action,time } from './ui.ts';
export function transportBar(model:WorkbenchModel):HTMLElement{
 const play=action(model,'Play',()=>model.canCancel?model.cancelOperation():model.transport.snapshot.playing||model.transport.snapshot.processing?model.transport.stop():model.play(),'wb-button wb-play');
 const loop=action(model,'Loop off',()=>{model.loop=!model.loop;loop.textContent=model.loop?'Loop on':'Loop off';loop.setAttribute('aria-pressed',String(model.loop));if(model.transport.snapshot.playing)void model.play().catch(e=>model.report(e));});loop.setAttribute('aria-pressed','false');
 const speed=h('select',{'aria-label':'Playback speed'},...[1,.75,.5].map(n=>h('option',{value:n,text:`${n*100}%`})));speed.addEventListener('change',()=>{model.speed=Number(speed.value) as 1|.75|.5;if(model.transport.snapshot.playing)void model.play().catch(e=>model.report(e));});
 const level=h('input',{type:'range',min:0,max:1,step:.01,value:.8,'aria-label':'Output volume'});level.addEventListener('input',()=>model.transport.setGain(Number(level.value)));
 const clock=h('output',{class:'wb-mono',text:'0:00 / 0:00'}),status=h('span',{class:'wb-save-status'}),input=h('span',{class:'wb-input-status',text:'Mic off'});
 const rescue=h('a',{href:'#record',text:'Open recording recovery',hidden:true,class:'wb-button'});
 const bar=h('div',{class:'wb-transport','aria-label':'Audio transport'},h('div',{class:'wb-transport-controls'},play,loop,speed,clock),h('label',{class:'wb-output'},'Output ',level),h('div',{class:'wb-transport-status'},input,status),rescue);
 model.subscribe(s=>{play.textContent=s.transport.processing||model.canCancel?'Cancel':s.transport.playing?'Stop':'Play';clock.textContent=`${time(s.transport.positionSeconds)} / ${time(s.transport.durationSeconds)}`;
  const active=['requesting','recording','finalizing','recoverable'].includes(s.recorder.status);play.disabled=active||!model.canCancel&&!s.transport.playing&&!(model.playTarget==='song'?s.project:s.version);loop.disabled=active||s.busy;speed.disabled=active||s.busy||model.playTarget==='song';
  input.textContent=s.recorder.status==='recording'?'● Recording':s.recorder.status==='requesting'?'Microphone requested':'Mic off';input.classList.toggle('is-recording',s.recorder.status==='recording');
  status.textContent=s.recorder.status==='finalizing'?'Saving audio…':s.recorder.status==='recoverable'?'Rescue needed':s.saveStatus;
  rescue.hidden=s.recorder.status!=='recoverable';
 });return bar;
}
