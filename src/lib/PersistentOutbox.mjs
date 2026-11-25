// 매 입력은 동기식 저널에 먼저 기록한다. IndexedDB는 탭 간 원자적 배치/승인 상태를 관리한다.
import {isScoreUnits,addUnits} from './experience.mjs';
import {normalizeCombo,comboView,awardComboTaps} from './combo.mjs';
export function scoreScope(projectId,uid,eventId,buildingId){return JSON.stringify(buildingId?[projectId,uid,eventId,buildingId]:[projectId,uid,eventId]);}
export function newerScore(a,b){
 // 초기화도 revision을 증가시킨다. 과거의 높은 점수로 새 원장을 덮어쓰지 않는다.
 return a.revision>b.revision||(a.revision===b.revision&&a.score>b.score);
}
function validScore(value){return value&&isScoreUnits(value.score)&&Number.isSafeInteger(value.revision)&&value.revision>=0;}
export class InputJournal {
 constructor(scope,storage=globalThis.localStorage,legacyScope,buildingId){this.scope=scope;this.storage=storage;this.prefix=`foreon:xp:v1:${encodeURIComponent(scope)}:`;this.legacyScope=legacyScope;this.legacyPrefix=legacyScope?`foreon:xp:v1:${encodeURIComponent(legacyScope)}:`:null;this.buildingId=buildingId;}
 append(buildingId,effect={},now=Date.now()){
  const input={id:crypto.randomUUID(),scope:this.scope,buildingId,points:1,createdAt:now,...effect};
  this.storage.setItem(this.prefix+input.id,JSON.stringify(input));return input;
 }
 list(){
  const result=[];
  for(let i=0;i<this.storage.length;i++){
   const key=this.storage.key(i);if(!key?.startsWith(this.prefix)&&!key?.startsWith(this.legacyPrefix??'\0'))continue;
   const raw=this.storage.getItem(key);if(raw===null)continue;
   const input=JSON.parse(raw);
   const legacy=input.scope===this.legacyScope&&key===this.legacyPrefix+input.id;
   if(legacy&&input.buildingId!==this.buildingId)continue;
   if((!legacy&&(input.scope!==this.scope||key!==this.prefix+input.id))||input.points!==1||typeof input.id!=='string'||typeof input.buildingId!=='string'||(input.xp!==undefined&&(!isScoreUnits(input.xp)||input.xp<1||input.xp>600))||(input.combo&&(![1,2,3,5].includes(input.itemMultiplier)||!Number.isSafeInteger(input.createdAt))))
    throw new Error('경험치 저널 형식이 올바르지 않습니다.');
   result.push(input);
  }
  return result.sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id));
 }
 has(id){return this.storage.getItem(this.prefix+id)!==null||Boolean(this.legacyPrefix&&this.storage.getItem(this.legacyPrefix+id)!==null);}
 remove(ids){for(const id of ids){this.storage.removeItem(this.prefix+id);if(this.legacyPrefix)this.storage.removeItem(this.legacyPrefix+id);}}
}
export function outboxProjection(record,now=Date.now()){
 const active=record.batches.filter(batch=>batch.status==='open'||batch.status==='sealed');
 const pendingTaps=active.reduce((sum,batch)=>sum+batch.points,0),reward=record.rewards;
 let unconfirmed=0,comboAfterPending=normalizeCombo(record.combo);
 for(const batch of active){
  if(batch.tapTimes){const calculated=awardComboTaps(comboAfterPending,batch.tapTimes,batch.boostId?batch.points:0,batch.itemMultiplier??1,addUnits(record.base.score,unconfirmed));comboAfterPending=calculated.state;unconfirmed=addUnits(unconfirmed,calculated.units);}
  else unconfirmed=addUnits(unconfirmed,batch.xp??batch.points);
 }
 const combo=comboView(comboAfterPending,now);
 const boostExpiresAt=reward?.boostExpiresAt??0,boostStartsAt=reward?.boostStartsAt??0,boostMultiplier=reward?.boostMultiplier??1;
 const boostRemainingMs=Math.max(0,boostExpiresAt-now);
 return {score:addUnits(record.base.score,unconfirmed),confirmedScore:record.base.score,revision:record.base.revision,
  unconfirmed,pendingTaps,boostExpiresAt,boostStartsAt,boostRemainingMs,boostMultiplier,boostId:reward?.boostId??null,nextXp:combo.multiplierTenths*(now>=boostStartsAt&&boostRemainingMs>0?boostMultiplier:1)/10,gift:reward?.gift??null,known:record.known,blocked:record.blocked,comboAfterPending,
  comboMeter:combo.meter,comboMultiplier:combo.multiplier,comboTier:combo.tier,comboDecaying:combo.decaying,comboNextHits:combo.nextHits,comboMaxMeter:combo.maxMeter,
  operationIds:record.batches.flatMap(batch=>batch.operations)};
}
export class PersistentOutbox {
 constructor({scope,legacyScope,buildingId,journal,indexedDB=globalThis.indexedDB,dbName='foreon-score-outbox-v1',now=Date.now}){
  this.scope=scope;this.legacyScope=legacyScope;this.buildingId=buildingId;this.journal=journal;this.now=now;
  this.db=new Promise((resolve,reject)=>{
   if(!indexedDB){reject(new Error('IndexedDB를 사용할 수 없습니다.'));return;}
   const request=indexedDB.open(dbName,1);
   request.onupgradeneeded=()=>request.result.createObjectStore('sessions',{keyPath:'scope'});
   request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('경험치 저장소가 사용 중입니다.'));
   request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();resolve(request.result);};
  });
 }
 fresh(){return {schema:1,scope:this.scope,buildingId:this.buildingId,base:{score:0,revision:0},known:false,deferred:null,batches:[],version:0,nextSendAt:this.now()+5000,failures:0,leaseOwner:null,leaseUntil:0,blocked:false};}
 async mutate(change){
  const db=await this.db;
  return new Promise((resolve,reject)=>{
   const tx=db.transaction('sessions','readwrite'),store=tx.objectStore('sessions'),request=store.get(this.scope);let state;
   const apply=old=>{
    try{
     state=old??this.fresh();state.scope=this.scope;
     if(state.schema!==1||state.buildingId!==this.buildingId)throw new Error('이벤트 참가 동과 저장된 경험치가 일치하지 않습니다.');
     const changed=change(state);
     if(changed||!request.result){state.version++;store.put(state);}
    }catch(error){reject(error);tx.abort();}
   };
   request.onsuccess=()=>{
    if(!request.result&&this.legacyScope){const legacy=store.get(this.legacyScope);legacy.onsuccess=()=>{const old=legacy.result?.buildingId===this.buildingId?legacy.result:null;if(old)store.delete(this.legacyScope);apply(old);};}
    else apply(request.result);
   };
   tx.oncomplete=()=>resolve(state);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??new Error('경험치 저장이 중단되었습니다.'));
  });
 }
 importJournal(state){
  const known=new Set(state.batches.flatMap(batch=>batch.operations));let changed=false;
  // 저널은 트랜잭션 안에서 읽는다. 다른 탭이 승인 후 지운 입력을 오래된 목록에서 재수입하지 않는다.
  for(const input of this.journal.list()){
   if(known.has(input.id))continue;
   if(input.buildingId!==this.buildingId)throw new Error('저장된 경험치의 동을 확인해 주세요.');
   let batch=state.batches[state.batches.length-1];
   if(batch?.status!=='open'||batch.points>=100||(batch.boostId??null)!==(input.boostId??null)||Boolean(batch.tapTimes)!==Boolean(input.combo)||(batch.tapTimes&&input.createdAt<batch.tapTimes[batch.tapTimes.length-1]))batch=null;
   if(!batch){batch={batchId:crypto.randomUUID(),points:0,operations:[],status:state.blocked?'rejected':'open',createdAt:input.createdAt};state.batches.push(batch);}
   batch.xp=addUnits(batch.xp??batch.points,input.xp??1);
   if(input.combo){batch.tapTimes??=[];batch.tapTimes.push(input.createdAt);batch.itemMultiplier=input.itemMultiplier;}
   if(input.boostId){batch.boostId=input.boostId;batch.tapFrom=Math.min(batch.tapFrom??input.createdAt,input.createdAt);batch.tapTo=Math.max(batch.tapTo??input.createdAt,input.createdAt);}
   batch.points++;batch.operations.push(input.id);known.add(input.id);changed=true;
  }
  return changed;
 }
 applyServer(state,server){
  if(!validScore(server))return false;
  // 입력별 예상 XP가 이미 고정돼 있으므로 새 아이템의 시계는 점수 승인과 독립적으로 갱신한다.
  let changed=false;
  if(server.rewards&&(!state.rewards||server.rewards.version>state.rewards.version)){state.rewards=server.rewards;changed=true;}
  if(state.batches.some(batch=>batch.status==='sealed')){
   if(!state.deferred||newerScore(server,state.deferred)||(server.rewards?.version??-1)>(state.deferred.rewards?.version??-1)||(server.combo?.version??-1)>(state.deferred.combo?.version??-1)){
    const old=state.deferred;state.deferred={...(old&&newerScore(old,server)?old:server),rewards:(old?.rewards?.version??-1)>(server.rewards?.version??-1)?old.rewards:server.rewards,combo:(old?.combo?.version??-1)>(server.combo?.version??-1)?old.combo:server.combo};return true;}
   return changed;
  }
  if(!state.known||newerScore(server,state.base)){state.base={score:server.score,revision:server.revision};state.known=true;changed=true;}
  if(server.combo&&(!state.combo||server.combo.version>state.combo.version)){state.combo=normalizeCombo(server.combo);changed=true;}
  return changed;
 }
 hydrate(initial){return this.mutate(state=>{let changed=this.importJournal(state);if(initial)changed=this.applyServer(state,initial)||changed;return changed;});}
 receive(server){return this.mutate(state=>this.applyServer(state,server));}
 async read(){
  const db=await this.db;
  return new Promise((resolve,reject)=>{const tx=db.transaction('sessions'),r=tx.objectStore('sessions').get(this.scope);r.onsuccess=()=>resolve(r.result??this.fresh());r.onerror=()=>reject(r.error);});
 }
 async claim(owner){
  let selected=null;
  const state=await this.mutate(state=>{
   let changed=this.importJournal(state);const now=this.now();
   if(state.blocked||state.nextSendAt>now||(state.leaseUntil>now&&state.leaseOwner!==owner))return changed;
   const batch=state.batches.find(value=>value.status==='sealed')??state.batches.find(value=>value.status==='open');
   if(!batch)return changed;
   batch.status='sealed';state.leaseOwner=owner;state.leaseUntil=now+20000;state.nextSendAt=now+5000;
   selected={batchId:batch.batchId,points:batch.points,...(batch.boostId?{boostId:batch.boostId,tapFrom:batch.tapFrom,tapTo:batch.tapTo}:{}),...(batch.tapTimes?{tapTimes:[...batch.tapTimes]}:{})};return true;
  });
  return {state,batch:selected};
 }
 async acknowledge(batchId,receipt){
  return this.mutate(state=>{
   const batch=state.batches.find(value=>value.batchId===batchId);
   if(!batch||batch.status==='acked')return false;
   if(receipt.accepted!==batch.points||!validScore({score:receipt.teamScore,revision:receipt.teamRevision}))throw new Error('경험치 승인 응답이 올바르지 않습니다.');
   batch.status='acked';state.leaseUntil=0;state.leaseOwner=null;state.failures=0;state.nextSendAt=this.now()+5000;
   this.applyServer(state,{score:receipt.teamScore,revision:receipt.teamRevision,rewards:receipt.rewards,combo:receipt.combo});
   if(state.deferred){this.applyServer(state,state.deferred);state.deferred=null;}
   return true;
  });
 }
 async cleanup(){
  const state=await this.read();
  // 승인 내역을 먼저 커밋한 뒤 저널을 지우고 마지막으로 승인 tombstone을 정리한다.
  this.journal.remove(state.batches.filter(batch=>batch.status==='acked').flatMap(batch=>batch.operations));
  return this.mutate(state=>{
   const kept=state.batches.filter(batch=>batch.status!=='acked'||batch.operations.some(id=>this.journal.has(id)));
   if(kept.length===state.batches.length)return false;state.batches=kept;return true;
  });
 }
 retry(batchId){return this.mutate(state=>{
  if(!state.batches.some(batch=>batch.batchId===batchId&&batch.status==='sealed'))return false;
  state.failures++;state.nextSendAt=this.now()+Math.min(60000,5000*2**Math.min(state.failures,4));state.leaseOwner=null;state.leaseUntil=0;return true;
 });}
 reject(batchId,reason){return this.mutate(state=>{
  if(!state.batches.some(batch=>batch.batchId===batchId))return false;
  state.blocked=true;state.leaseOwner=null;state.leaseUntil=0;
  for(const batch of state.batches)if(batch.status!=='acked'){batch.status='rejected';batch.reason=reason;}
  if(state.deferred){this.applyServer(state,state.deferred);state.deferred=null;}
  return true;
 });}
 async close(){(await this.db).close();}
}
