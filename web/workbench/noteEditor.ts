import type { RiffVersion, NoteEvent } from '../../src/types.ts';
import { h,replace } from '../ui/dom.ts';
import { midiToName } from '../../src/music/notes.ts';
import { validateNotes,versionTuning } from '../../src/workbench/edits.ts';
import { analyzeNotes } from '../../src/phrase/analyze.ts';
import { midiFile } from '../../src/workbench/midi.ts';
import type { WorkbenchModel } from './model.ts';
import { action,download } from './ui.ts';

export function noteEditor(model:WorkbenchModel,version:RiffVersion):HTMLElement{
 let notes=structuredClone(version.notes),confirmed=version.analysis?.state==='confirmed';
 const body=h('tbody',{}),status=h('p',{class:'wb-muted'}),tab=h('pre',{class:'wb-tab'}),table=h('table',{class:'wb-note-table'},
  h('thead',{},h('tr',{},...['Pitch (MIDI)','Onset (ms)','Duration (ms)','Estimate',''].map(text=>h('th',{text,scope:'col'})))),body);
 const root=h('section',{class:'wb-note-editor'},h('h3',{text:'Note interpretation'}),h('p',{class:'wb-muted',text:'Single-note melodies only. Chords, noise and overlapping strings can confuse the estimate. Correct what you hear; the recorded performance stays intact.'}),status,h('div',{class:'wb-table-scroll'},table));
 const confirm=action(model,'Confirm these notes',async()=>{validateNotes(notes,version);await model.saveVersionEdit({...version,notes,analysis:{state:'confirmed'}});},'wb-button wb-primary');
 const midi=action(model,'Download MIDI',()=>{if(!confirmed)throw new Error('Confirm these notes before exporting MIDI.');download(new Blob([midiFile(notes)],{type:'audio/midi'}),'guitar-sketch.mid');});
 function state():void{
  status.textContent=confirmed?'Confirmed by you · variations and MIDI are available.':'Unconfirmed · edit the estimate and listen before confirming.';midi.disabled=!confirmed;
  try{validateNotes(notes,version);confirm.disabled=false;tab.textContent=analyzeNotes(notes,{tuning:versionTuning(version),maxFret:22-(version.tuningSnapshot?.capo??0)}).tab;}
  catch(error){confirm.disabled=true;tab.textContent=error instanceof Error?error.message:String(error);}
 }
 function render():void{
  replace(body,...notes.map((note,index)=>{
   const fields=(['midi','startMs','durationMs'] as const).map(key=>{
    const input=h('input',{type:'number',value:note[key],step:key==='midi'?1:10,'aria-label':`${key==='midi'?'MIDI pitch':key==='startMs'?'Onset':'Duration'} ${index+1}`});
    input.addEventListener('input',()=>{note[key]=Number(input.value);confirmed=false;state();});return h('td',{},input);
   });
   return h('tr',{},...fields,h('td',{},h('span',{class:'wb-small',text:`${midiToName(note.midi)} · ${Math.round(note.confidence*100)}%`})),h('td',{},action(model,`Remove ${index+1}`,()=>{notes.splice(index,1);confirmed=false;render();})));
  }));state();
 }
 root.append(h('div',{class:'wb-actions'},action(model,'Add note',()=>{const last=notes.at(-1);notes.push({midi:last?.midi??versionTuning(version).strings[0]!,startMs:last?last.startMs+last.durationMs:0,durationMs:400,confidence:1});confirmed=false;render();}),
  action(model,'Preview interpretation',()=>model.previewNotes(notes)),confirm,midi),h('details',{},h('summary',{text:'Suggested fingering · frets from capo'}),tab));
 render();return root;
}
