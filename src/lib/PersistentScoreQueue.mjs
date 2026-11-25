import {InputJournal,PersistentOutbox,outboxProjection,scoreScope} from './PersistentOutbox.mjs';
import {addUnits,baseUnitsForScore,levelForScore} from './experience.mjs';
import {normalizeCombo,comboView,awardComboTaps} from './combo.mjs';
import {LocalClicks} from './LocalClicks.mjs';
const storageMessage='경험치를 기기에 보관할 수 없어요. 브라우저의 저장 공간·권한을 확인해 주세요.';
export class ScoreQueue {
 constructor(options){
  Object.assign(this,options);this.buildingId=options.buildingId;this.owner=crypto.randomUUID();
  this.scope=scoreScope(options.projectId,options.uid,options.eventId,options.buildingId);this.chain=Promise.resolve();this.disposed=false;this.ready=false;
  this.volatile=new Map();this.timer=null;this.request=null;this.autoStart=options.autoStart!==false;this.warned=false;this.comboEnabled=options.comboEnabled!==false;
  this.now=options.now??Date.now;this.isCurrent=options.isCurrent??(()=>true);
  this.current={score:0,confirmedScore:0,revision:0,unconfirmed:0,known:false,blocked:false,operationIds:[]};
  try{
   const legacyScope=scoreScope(options.projectId,options.uid,options.eventId);
   this.journal=new InputJournal(this.scope,options.storage??globalThis.localStorage,legacyScope,this.buildingId);
   this.clicks=new LocalClicks({projectId:options.projectId,uid:options.uid,eventId:options.eventId,storage:options.storage??globalThis.localStorage});
   this.store=new PersistentOutbox({scope:this.scope,legacyScope,buildingId:this.buildingId,journal:this.journal,indexedDB:options.indexedDB??globalThis.indexedDB,dbName:options.dbName,now:this.now});
   const Channel=options.BroadcastChannel??globalThis.BroadcastChannel;
   if(options.broadcast!==false&&Channel){this.channel=new Channel(`foreon:xp:${this.scope}`);this.channel.onmessage=()=>this.refresh();}
   this.storageListener=event=>{if(event.key?.startsWith(this.journal.prefix))this.refresh(true);};
   globalThis.addEventListener?.('storage',this.storageListener);
   this.onlineListener=()=>this.refresh(true);globalThis.addEventListener?.('online',this.onlineListener);
   this.visibilityListener=()=>{if(!globalThis.document?.hidden){this.publish();this.refresh(true);}};globalThis.document?.addEventListener('visibilitychange',this.visibilityListener);
   this.readyPromise=this.enqueue(async()=>{
    const state=await this.store.hydrate(options.initial);for(const batch of state.batches)if(batch.status==='sealed')this.clicks.seal(batch.batchId,batch.operations);this.clicks.reject(state.batches);this.ready=true;this.accept(state);await this.clean();
    this.schedule(Math.max(0,Math.min(5000,state.nextSendAt-this.now())));
   });
   if(this.autoStart)this.clockTimer=setInterval(()=>this.publish(),100);
  }catch{this.storageError();this.readyPromise=Promise.resolve();}
 }
 enqueue(task){
  const next=this.chain.then(task);this.chain=next.catch(()=>this.storageError());return this.chain;
 }
 storageError(){if(!this.warned&&!this.disposed){this.warned=true;this.status(storageMessage);}}
 accept(state){
  const next=outboxProjection(state,this.now());if(state.version<(this.version??-1))return;this.version=state.version;
  for(const [id] of this.volatile){if(next.operationIds.includes(id)||!this.journal.has(id))this.volatile.delete(id);}
  this.current=next;this.publish();
 }
 project(){
  const now=this.now();let extra=0,comboAfterPending=normalizeCombo(this.current.comboAfterPending);
  for(const input of [...this.volatile.values()].sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id))){
   if(input.combo){const calculated=awardComboTaps(comboAfterPending,[input.createdAt],input.boostId?1:0,input.itemMultiplier,addUnits(this.current.score,extra));comboAfterPending=calculated.state;extra=addUnits(extra,calculated.units);}
   else extra=addUnits(extra,input.xp??1);
  }
  const view=comboView(comboAfterPending,now),remaining=Math.max(0,(this.current.boostExpiresAt??0)-now),itemMultiplier=remaining>0&&now>=(this.current.boostStartsAt??0)?this.current.boostMultiplier:1;
  return {...this.current,score:addUnits(this.current.score,extra),unconfirmed:addUnits(this.current.unconfirmed,extra),boostRemainingMs:remaining,
   baseXp:this.comboEnabled?baseUnitsForScore(addUnits(this.current.score,extra)):1,rewardLevel:levelForScore(addUnits(this.current.score,extra)),
   nextXp:(this.comboEnabled?baseUnitsForScore(addUnits(this.current.score,extra))*view.multiplierTenths:10)*itemMultiplier/10,comboMeter:view.meter,comboMultiplier:view.multiplier,comboTier:view.tier,comboDecaying:view.decaying,comboNextHits:view.nextHits,comboMaxMeter:view.maxMeter};
 }
 publish(){
  if(this.disposed||!this.isCurrent())return;const next=this.project();
  const signature=[next.score,next.confirmedScore,next.unconfirmed,next.revision,next.known,next.blocked,next.nextXp,next.comboMeter,next.comboMultiplier,next.comboDecaying,Math.ceil(next.boostRemainingMs/1000),next.boostExpiresAt,next.gift?.id].join('|');
  if(signature!==this.publication){this.publication=signature;this.changed(next);}
 }
 announce(){if(!this.disposed)this.channel?.postMessage({type:'changed'});}
 async clean(){this.accept(await this.store.cleanup());this.clicks.prune();this.clicks.changed();}
 xpPerTap(){return this.project().nextXp;}
 touch(){
  if(this.disposed||!this.ready||!this.current.known||!this.isCurrent()||this.current.blocked)return false;
  try{
   // setItem 완료 후에만 화면을 증가시킨다. 종료 이벤트나 비동기 DB 완료를 기다리지 않는다.
   const now=this.now(),xp=this.xpPerTap(),boosted=Boolean(this.current.boostId)&&now>=this.current.boostStartsAt&&now<this.current.boostExpiresAt;
   const input=this.journal.append(this.buildingId,{xp,...(this.comboEnabled?{combo:true,itemMultiplier:boosted?this.current.boostMultiplier:1}:{}),...(boosted?{boostId:this.current.boostId}:{})},now);this.volatile.set(input.id,input);this.publish();this.clicks.changed();
   void this.enqueue(async()=>{this.accept(await this.store.hydrate());this.announce();});return true;
  }catch{this.storageError();return false;}
 }
 receive(server){if(!this.disposed)void this.enqueue(async()=>{this.accept(await this.store.receive(server));this.announce();});}
 refresh(ingest=false){
  if(this.disposed)return;
  void this.enqueue(async()=>{this.accept(ingest?await this.store.hydrate():await this.store.read());await this.clean();
   if(this.autoStart&&!this.request)this.schedule(Math.max(0,Math.min(5000,(await this.store.read()).nextSendAt-this.now())));
  });
 }
 schedule(ms){if(!this.autoStart||this.disposed)return;if(this.timer)clearTimeout(this.timer);this.timer=setTimeout(()=>void this.flushNow(),Math.max(50,ms));}
 async flushNow(){
  await this.readyPromise;if(this.disposed||!this.ready||!this.isCurrent()||this.request)return;
  let selected,prepared=false;
  await this.enqueue(async()=>{selected=await this.store.claim(this.owner);if(selected.batch){const stored=selected.state.batches.find(batch=>batch.batchId===selected.batch.batchId);this.clicks.seal(selected.batch.batchId,stored.operations);}this.accept(selected.state);if(selected.batch)this.announce();prepared=true;});
  if(!prepared){this.schedule(5000);return;}
  if(this.disposed||!this.isCurrent())return;
  if(!selected?.batch){this.schedule(5000);return;}
  const batch=selected.batch;
  const request=(async()=>{
   try{
    if(!this.isCurrent())return;
    const receipt=await this.send({...batch,buildingId:this.buildingId});
    // 계정/컴포넌트가 바뀌어도 이 승인 응답은 원래 UID의 저장소에만 확정한다.
    await this.enqueue(async()=>{this.clicks.acknowledge(batch.batchId,receipt.activity);this.accept(await this.store.acknowledge(batch.batchId,receipt));await this.clean();this.announce();});
   }catch(error){
    await this.enqueue(async()=>{
     const code=error?.code,ended=code==='functions/failed-precondition'&&error?.details?.reason==='event-ended';
     if(ended||['functions/invalid-argument','functions/already-exists'].includes(code)){
      const state=await this.store.reject(batch.batchId,ended?'event-ended':code);this.clicks.reject(state.batches);this.accept(state);
      if(!this.disposed&&this.isCurrent())this.status(ended?'이벤트가 종료되어 남은 경험치는 반영되지 않았어요.':'경험치를 반영하지 못했어요. 다시 접속해 주세요.');
     }else{
      this.accept(await this.store.retry(batch.batchId));
      if(!this.disposed&&this.isCurrent())this.status('연결을 확인해 주세요. 모은 경험치는 다시 연결되면 반영돼요.');
     }
     this.announce();
    });
   }
  })();
  this.request=request;
  try{await request;}finally{this.request=null;this.schedule(5000);}
 }
 async settle(){await this.chain;}
 dispose(){
  this.disposed=true;if(this.timer)clearTimeout(this.timer);
  if(this.clockTimer)clearInterval(this.clockTimer);
  this.channel?.close();globalThis.removeEventListener?.('storage',this.storageListener);globalThis.removeEventListener?.('online',this.onlineListener);
  globalThis.document?.removeEventListener('visibilitychange',this.visibilityListener);
  // 미전송·전송 중 배치는 삭제하지 않는다. 이미 시작한 로컬 커밋과 승인 처리를 마친 후 연결만 닫는다.
  void Promise.resolve(this.request).then(()=>this.chain).finally(()=>this.store?.close()).catch(()=>{});
 }
}
