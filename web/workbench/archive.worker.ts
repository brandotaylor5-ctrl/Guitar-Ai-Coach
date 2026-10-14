import { zipEntries,unpackArchive } from '../../src/workbench/archive.ts';
self.onmessage=async event=>{
 const {op,payload}=event.data;
 try{const result=op==='zip'?await zipEntries(payload,new AbortController().signal):await unpackArchive(payload,new AbortController().signal);self.postMessage({result});}
 catch(error){self.postMessage({error:error instanceof Error?error.message:String(error)});}
};
