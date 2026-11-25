import {useEffect,useRef} from 'react';
import {onDisconnect,onValue,ref,remove,serverTimestamp,set,update,goOffline,goOnline,type DatabaseReference,type OnDisconnect} from 'firebase/database';
import {presenceDatabase} from './firebase';
export function usePresence(uid:string|null,page:'tree'|'ranking'|'activity',ready:boolean){
 const state=useRef({uid:uid??'',page}),refresh=useRef(()=>{});state.current={uid:uid??'',page};
 useEffect(()=>{refresh.current();},[uid,page]);
 useEffect(()=>{
  if(!ready)return;const database=presenceDatabase();if(!database)return;
  goOnline(database);
  let browserId=crypto.randomUUID();try{const key='foreon:presence-browser:v1',saved=localStorage.getItem(key);if(saved&&/^[a-f0-9-]{36}$/.test(saved))browserId=saved as typeof browserId;else localStorage.setItem(key,browserId);}catch{/* Storage failure must never interrupt the game. */}
  let connection:DatabaseReference|null=null,disconnected:OnDisconnect|null=null;
  let alive=true,connected=false,started=false,generation=0;
  const details=()=>({...state.current,active:document.visibilityState==='visible',updatedAt:serverTimestamp()});
  const change=()=>{if(alive&&connected&&started&&connection)void update(connection,details()).catch(()=>{});};
  refresh.current=change;
  const off=onValue(ref(database,'.info/connected'),snapshot=>{
   const turn=++generation;connected=snapshot.val()===true;started=false;if(!connected)return;
   const target=ref(database,`connections/${crypto.randomUUID()}`),cleanup=onDisconnect(target);connection=target;disconnected=cleanup;
   void (async()=>{try{
    // Register server-side removal before publishing the connection.
    await cleanup.remove();if(!alive||turn!==generation)return;
    await set(target,{browserId,startedAt:serverTimestamp(),...details()});
    if(alive&&turn===generation){started=true;change();}
   }catch{/* Presence failure must not affect login or scoring. */}})();
  });
  const hide=()=>{generation++;connected=false;started=false;goOffline(database);};
  const show=()=>goOnline(database);
  const heartbeat=setInterval(change,60000);
  document.addEventListener('visibilitychange',change);window.addEventListener('pagehide',hide);window.addEventListener('pageshow',show);
  return()=>{alive=false;generation++;refresh.current=()=>{};off();clearInterval(heartbeat);document.removeEventListener('visibilitychange',change);window.removeEventListener('pagehide',hide);window.removeEventListener('pageshow',show);if(connection){const cleanup=disconnected;void remove(connection).then(()=>cleanup?.cancel()).catch(()=>{});}goOffline(database);};
 },[ready]);
}
