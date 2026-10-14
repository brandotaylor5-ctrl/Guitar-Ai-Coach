import type { RiffVersion, NoteEvent } from '../types.ts';
import { makeId } from '../util/id.ts';
import { analyzeNotes } from '../phrase/analyze.ts';
import { suggestEndings } from '../create/suggest.ts';
import { motifBranches } from '../create/songwriting.ts';
import { validateNotes, versionTuning } from './edits.ts';
export function makeVariations(version:RiffVersion,operation:'ending'|'rhythm',boundaryMs?:number):RiffVersion[]{
 if(version.analysis?.state!=='confirmed')throw new Error('Confirm the note interpretation first.');
 validateNotes(version.notes,version);
 const candidates:Array<{label:string;notes:NoteEvent[];parameters:Record<string,string|number>}>=[];
 if(operation==='rhythm'){
  const branch=motifBranches(version.notes).find(b=>b.kind==='rhythm');if(branch)candidates.push({...branch,parameters:{}});
 }else{
  const boundary=boundaryMs??version.notes[Math.max(1,Math.floor(version.notes.length*.65))]?.startMs;
  if(boundary===undefined||!version.notes.some(n=>n.startMs===boundary))throw new Error('Choose an existing note onset for the ending.');
  const prefix=version.notes.filter(n=>n.startMs<boundary);if(!prefix.length)return [];
  for(const option of suggestEndings(analyzeNotes(prefix,{tuning:versionTuning(version)}),{tuning:versionTuning(version),maxFret:22-(version.tuningSnapshot?.capo??0)}).slice(0,3)){
   const offset=option.notes[0]!.startMs;
   candidates.push({label:`${option.label.toLowerCase()} ending`,notes:[...structuredClone(prefix),...option.notes.map(n=>({...n,startMs:boundary+n.startMs-offset}))],parameters:{boundaryMs:boundary}});
  }
 }
 return candidates.flatMap(candidate=>{
  try{validateNotes(candidate.notes,version);}catch{return [];}
  return [{id:makeId('ver'),parentId:version.id,label:candidate.label,createdAt:Date.now(),notes:candidate.notes,sourceKind:'synthesized' as const,
   instrument:version.instrument,tuningSnapshot:structuredClone(version.tuningSnapshot),analysis:{state:'confirmed' as const},
   provenance:{sourceVersionId:version.id,operation,parameters:candidate.parameters}}];
 });
}
