const CACHE='propilot-shell-v4';
const ROOT=new URL('./',self.registration.scope).pathname;
const HOME=ROOT.endsWith('/')?ROOT:ROOT+'/';
self.addEventListener('install',event=>{self.skipWaiting()});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('propilot-shell-')).map(k=>caches.delete(k)))));
 self.clients.claim();
});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 const url=new URL(event.request.url);
 if(url.origin!==self.location.origin||!url.pathname.startsWith(HOME))return;
 // Never return the index HTML in place of a missing JavaScript/CSS asset.
 if(event.request.mode==='navigate'){
  event.respondWith(fetch(event.request,{cache:'no-store'}).catch(async()=>{
   const cached=await caches.match(HOME);
   return cached||Response.error();
  }));
  return;
 }
 // Bundled assets use content hashes: let the browser fetch them normally.
});
