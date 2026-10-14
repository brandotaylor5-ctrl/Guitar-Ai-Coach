import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { canApplyUpdate } from '../web/workbench/lifecycle.ts';
import { openWorkbenchDatabase } from '../web/workbench/database.ts';
test('updates wait for recording, finalization, unsaved recovery, or a write',()=>{
 const safe={recording:false,finalizing:false,recoveryPending:false,saving:false};assert.equal(canApplyUpdate(safe),true);
 for(const key of Object.keys(safe))assert.equal(canApplyUpdate({...safe,[key]:true}),false);
});
test('a v1 tab blocking upgrade produces a recoverable error without deleting the store',async()=>{
 const factory=new IDBFactory();const old=await new Promise<IDBDatabase>(resolve=>{const r=factory.open('blocked',1);r.onupgradeneeded=()=>r.result.createObjectStore('old');r.onsuccess=()=>resolve(r.result);});
 await assert.rejects(openWorkbenchDatabase(factory,'blocked'),/other app tab/);assert.ok(old.objectStoreNames.contains('old'));old.close();
});
