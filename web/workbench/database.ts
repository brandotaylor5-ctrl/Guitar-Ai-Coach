export const DATABASE_NAME = 'guitar-ai-coach';
export const DATABASE_VERSION = 2;

export function openWorkbenchDatabase(factory: IDBFactory, name = DATABASE_NAME): Promise<IDBDatabase> {
  return new Promise((resolve,reject) => {
    let blocked = false;
    const request=factory.open(name,DATABASE_VERSION);
    request.onupgradeneeded=()=>{
      const db=request.result;
      for(const store of ['clips','assets','riffs','songs','meta','staging']) if(!db.objectStoreNames.contains(store)) db.createObjectStore(store,{keyPath:'id'});
      if(!db.objectStoreNames.contains('chunks')) {
        const chunks=db.createObjectStore('chunks',{keyPath:['assetId','index']});
        chunks.createIndex('assetId','assetId');
      }
    };
    request.onblocked=()=>{blocked=true;reject(new Error('Close the other app tab, then reload to upgrade your music storage. Nothing has been deleted.'));};
    request.onerror=()=>reject(request.error ?? new Error('Could not open music storage'));
    request.onsuccess=()=>{
      if(blocked){request.result.close();return;}
      request.result.addEventListener('versionchange',()=>request.result.close());
      resolve(request.result);
    };
  });
}

export function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve,reject)=>{
    tx.addEventListener('complete',()=>resolve(),{once:true});
    tx.addEventListener('abort',()=>reject(tx.error??new Error('Storage transaction aborted')),{once:true});
  });
}

export function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve,reject)=>{
    request.addEventListener('success',()=>resolve(request.result),{once:true});
    request.addEventListener('error',()=>reject(request.error??new Error('Music storage request failed')),{once:true});
  });
}

/** Await only IDB requests inside work: unrelated awaits can auto-commit a transaction. */
export async function inTransaction<T>(db:IDBDatabase,stores:string[],mode:IDBTransactionMode,work:(tx:IDBTransaction)=>Promise<T>):Promise<T> {
  const tx=db.transaction(stores,mode), done=transactionDone(tx);
  // Attach a handler immediately: abort may occur while a request is being awaited.
  void done.catch(()=>{});
  try {const value=await work(tx);await done;return value;}
  catch(error){try{tx.abort();}catch{/* Already finished. */}await done.catch(()=>{});throw error;}
}
