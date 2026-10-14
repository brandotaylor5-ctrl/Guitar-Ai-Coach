import { h } from '../ui/dom.ts';
import type { WorkbenchModel } from './model.ts';
export function action(model:WorkbenchModel,label:string,run:()=>void|Promise<unknown>,className='wb-button'):HTMLButtonElement{
 const button=h('button',{type:'button',class:className,text:label});button.addEventListener('click',()=>{try{Promise.resolve(run()).catch(error=>model.report(error));}catch(error){model.report(error);}});return button;
}
export function download(blob:Blob,name:string):void{
 const url=URL.createObjectURL(blob),link=h('a',{href:url,download:name.replace(/[\\/:*?"<>|]/g,'-')});link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
export function time(seconds:number):string{if(!Number.isFinite(seconds))return '0:00';return `${Math.floor(seconds/60)}:${Math.floor(seconds%60).toString().padStart(2,'0')}`;}
export function sourceLabel(kind:string|undefined):string{return kind==='synthesized'?'Synthesized sketch':kind==='imported'?'Imported recording':kind==='legacy'?'Legacy idea':'Original recording';}
