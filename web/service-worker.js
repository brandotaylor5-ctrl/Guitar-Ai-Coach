const CACHE = '__WORKBENCH_CACHE__';
const SHELL = __WORKBENCH_SHELL__;
const urls = new Set(SHELL.map(path => new URL(path,self.location.href).href));
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL))));
// Prior caches remain available to the clients still running those builds.
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
let pending=null;
const appClients=async()=> (await self.clients.matchAll({type:'window',includeUncontrolled:true})).filter(client=>client.url.startsWith(self.registration.scope));
self.addEventListener('message',event=>{
 const message=event.data;
 if(message?.type==='UPDATE_VOTE'&&pending&&message.nonce===pending.nonce){pending.votes.set(event.source.id,message.safe===true);return;}
 if(message?.type!=='REQUEST_UPDATE'||pending)return;
 event.waitUntil((async()=>{
  const request={nonce:crypto.randomUUID(),votes:new Map()};pending=request;
  const clients=await appClients();clients.forEach(client=>client.postMessage({type:'UPDATE_QUERY',nonce:request.nonce}));
  await new Promise(resolve=>setTimeout(resolve,2200));
  const current=await appClients();const ready=current.every(client=>request.votes.get(client.id)===true);pending=null;
  if(ready)await self.skipWaiting();else current.forEach(client=>client.postMessage({type:'UPDATE_ABORT'}));
 })());
});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
 if(!urls.has(event.request.url)&&event.request.mode!=='navigate')return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE),cached=await cache.match(event.request);
  if(cached)return cached;
  if(event.request.mode==='navigate')return (await cache.match('./index.html'))??fetch(event.request);
  return fetch(event.request);
 })());
});
