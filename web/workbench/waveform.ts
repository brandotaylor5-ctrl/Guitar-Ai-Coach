import type { AudioRegion, PcmAudio } from '../../src/workbench/types.ts';
import { waveformPeaks } from '../../src/workbench/regions.ts';
import { h } from '../ui/dom.ts';
import { time } from './ui.ts';
export interface WaveformElement extends HTMLElement {setSelection:(region:AudioRegion)=>void;dispose:()=>void}
export function waveform({audio,selection,onSelection}:{audio:PcmAudio;selection:AudioRegion;onSelection:(start:number,end:number)=>void}):WaveformElement{
 let range={...selection};const length=audio.channels[0]!.length;
 const root=h('div',{class:'wb-waveform'}),plot=h('div',{class:'wb-wave-plot'}),canvas=h('canvas',{'aria-label':'Original audio waveform',role:'img'}),shade=h('div',{class:'wb-wave-selection'});
 const start=h('button',{type:'button',class:'wb-handle wb-handle-start',role:'slider','aria-label':'Selection start'}),end=h('button',{type:'button',class:'wb-handle wb-handle-end',role:'slider','aria-label':'Selection end'});
 const a=h('input',{type:'number',min:0,step:.001,'aria-label':'Start seconds'}),b=h('input',{type:'number',min:0,step:.001,'aria-label':'End seconds'});
 const duration=h('span',{class:'wb-mono'});
 const update=()=>{
  start.style.left=`${range.startSample/length*100}%`;end.style.left=`${range.endSample/length*100}%`;
  shade.style.left=start.style.left;shade.style.width=`${Math.max(0,range.endSample-range.startSample)/length*100}%`;
  for(const [node,value] of [[start,range.startSample],[end,range.endSample]] as const){node.setAttribute('aria-valuemin','0');node.setAttribute('aria-valuemax',String(length));node.setAttribute('aria-valuenow',String(value));node.setAttribute('aria-valuetext',`${(value/audio.sampleRate).toFixed(3)} seconds`);}
  if(document.activeElement!==a)a.value=(range.startSample/audio.sampleRate).toFixed(3);
  if(document.activeElement!==b)b.value=(range.endSample/audio.sampleRate).toFixed(3);
  duration.textContent=`${((range.endSample-range.startSample)/audio.sampleRate).toFixed(2)}s selected · ${time(length/audio.sampleRate)} full take`;
 };
 const change=(isStart:boolean,n:number)=>{n=Math.max(0,Math.min(length,Math.round(n)));range=isStart?{...range,startSample:Math.min(n,range.endSample)}:{...range,endSample:Math.max(n,range.startSample)};update();onSelection(range.startSample,range.endSample);};
 for(const [handle,isStart] of [[start,true],[end,false]] as const){
  handle.addEventListener('pointerdown',event=>{handle.setPointerCapture(event.pointerId);event.preventDefault();});
  handle.addEventListener('pointermove',event=>{if(!handle.hasPointerCapture(event.pointerId))return;const rect=plot.getBoundingClientRect();change(isStart,(event.clientX-rect.left)/rect.width*length);});
  handle.addEventListener('keydown',event=>{let n=isStart?range.startSample:range.endSample;const step=Math.max(1,Math.round(audio.sampleRate*(event.shiftKey?.1:.01)));
   if(event.key==='ArrowLeft'||event.key==='ArrowDown')n-=step;else if(event.key==='ArrowRight'||event.key==='ArrowUp')n+=step;else if(event.key==='Home')n=0;else if(event.key==='End')n=length;else return;event.preventDefault();change(isStart,n);});
 }
 a.addEventListener('change',()=>change(true,Number(a.value)*audio.sampleRate));b.addEventListener('change',()=>change(false,Number(b.value)*audio.sampleRate));
 const peaks=waveformPeaks(audio,700);
 const draw=()=>{const width=Math.max(1,plot.clientWidth),height=180,scale=window.devicePixelRatio||1;canvas.width=width*scale;canvas.height=height*scale;const ctx=canvas.getContext('2d');if(!ctx)return;ctx.scale(scale,scale);ctx.clearRect(0,0,width,height);ctx.strokeStyle='#353936';ctx.beginPath();ctx.moveTo(0,height/2);ctx.lineTo(width,height/2);ctx.stroke();ctx.strokeStyle='#a9b6a7';ctx.lineWidth=Math.max(1,width/peaks.length*.65);peaks.forEach((p,i)=>{const x=(i+.5)/peaks.length*width;ctx.beginPath();ctx.moveTo(x,height/2-p.max*height*.43);ctx.lineTo(x,height/2-p.min*height*.43);ctx.stroke();});};
 plot.append(canvas,shade,start,end);root.append(plot,h('div',{class:'wb-range-fields'},h('label',{},'Start ',a),h('label',{},'End ',b),duration));update();
 const observer=new ResizeObserver(draw);observer.observe(plot);
 return Object.assign(root,{setSelection:(value:AudioRegion)=>{range={...value};update();},dispose:()=>observer.disconnect()});
}
