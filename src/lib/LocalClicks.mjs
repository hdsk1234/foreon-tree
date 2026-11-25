const ROOT='foreon:click-counts:v1:',JOURNAL='foreon:xp:v1:';
export const CLICK_EVENT='foreon-click-counts';
export const clickDay=at=>new Date(at+9*3600000).toISOString().slice(0,10);
function valid(value){return value&&Number.isSafeInteger(value.version)&&value.version>=0&&Number.isSafeInteger(value.tapCount)&&value.tapCount>=0&&value.daily&&typeof value.daily==='object'&&Object.values(value.daily).every(n=>Number.isSafeInteger(n)&&n>=0)&&Array.isArray(value.recentBatchIds)&&value.recentBatchIds.every(id=>typeof id==='string');}
const includesAck=(base,ack)=>valid(ack.base)&&(base.version>ack.base.version||(base.version===ack.base.version&&base.tapCount>=ack.base.tapCount));
export class LocalClicks{
 constructor({projectId,uid,eventId,storage=globalThis.localStorage}){this.scope=JSON.stringify([projectId,uid,eventId]);this.prefix=ROOT+encodeURIComponent(this.scope)+':';this.storage=storage;}
 changed(){if(typeof globalThis.CustomEvent==='function')globalThis.dispatchEvent?.(new CustomEvent(CLICK_EVENT,{detail:this.scope}));}
 entries(){const result=[];for(let i=0;i<this.storage.length;i++){const key=this.storage.key(i);if(key?.startsWith(this.prefix)){try{const value=JSON.parse(this.storage.getItem(key));if(value&&typeof value==='object')result.push([key.slice(this.prefix.length),value]);}catch{}}}return result;}
 inputs(){const result=[];for(let i=0;i<this.storage.length;i++){const key=this.storage.key(i);if(!key?.startsWith(JOURNAL))continue;try{const value=JSON.parse(this.storage.getItem(key)),scope=JSON.parse(value.scope);if(JSON.stringify(scope.slice(0,3))===this.scope&&value.points===1&&typeof value.id==='string'&&Number.isSafeInteger(value.createdAt))result.push(value);}catch{}}return result;}
 receive(value){if(!valid(value))return;this.storage.setItem(this.prefix+`server:${value.version}:${value.tapCount}`,JSON.stringify(value));this.prune();this.changed();}
 seal(batchId,operations){
  const key=this.prefix+'sealed:'+batchId;if(this.storage.getItem(key))return;
  const base=this.project()?.base??null;
  this.storage.setItem(key,JSON.stringify({batchId,operations,base,startVersion:base?.version??0}));this.changed();
 }
 acknowledge(batchId,value){
  // 승인 메타데이터를 입력 저널 삭제보다 먼저 저장해 새로고침 경계를 보호한다.
  if(valid(value))this.receive(value);
  const marker=JSON.parse(this.storage.getItem(this.prefix+'sealed:'+batchId)??'null');
  if(marker)this.storage.setItem(this.prefix+'acked:'+batchId,JSON.stringify({operations:marker.operations,inputs:this.inputs().filter(input=>marker.operations.includes(input.id)),base:valid(value)?value:null}));
  this.changed();
 }
 reject(batches){let changed=false;for(const batch of batches)if(batch.status==='rejected'&&!this.storage.getItem(this.prefix+'rejected:'+batch.batchId)){this.storage.setItem(this.prefix+'rejected:'+batch.batchId,JSON.stringify({operations:batch.operations}));changed=true;}if(changed)this.changed();}
 project(){
  const entries=this.entries(),byId=new Map(this.inputs().map(input=>[input.id,input])),ignored=new Set(),acked=new Map(),sealed=[];
  for(const [key,value] of entries){
   if(key.startsWith('rejected:'))for(const id of value.operations??[])ignored.add(id);
   if(key.startsWith('acked:')){for(const id of value.operations??[])acked.set(id,value);for(const input of value.inputs??[])byId.set(input.id,input);}
  }
  const inputs=[...byId.values()];
  const pending=inputs.filter(input=>!ignored.has(input.id)),pendingIds=new Set(pending.map(input=>input.id));
  for(const [key,value] of entries)if(key.startsWith('sealed:')&&value.operations?.some(id=>pendingIds.has(id)&&!acked.has(id)))sealed.push(value);
  const candidates=[...entries.filter(([key])=>key.startsWith('server:')).map(([,value])=>value),...sealed.map(value=>value.base),...new Set(acked.values())].map(value=>value?.base??value).filter(valid).sort((a,b)=>b.version-a.version||b.tapCount-a.tapCount);
  // 최근 배치 목록 밖으로 밀린 응답 유실 배치는 승인 확인까지 기존 기준값을 유지한다.
  const base=candidates.find(candidate=>sealed.every(batch=>candidate.recentBatchIds.includes(batch.batchId)||candidate.version<=batch.startVersion||candidate.version-candidate.recentBatchIds.length<=batch.startVersion));
  if(!base)return null;
  const included=new Set(sealed.filter(batch=>base.recentBatchIds.includes(batch.batchId)).flatMap(batch=>batch.operations));
  let tapCount=base.tapCount;const daily={...base.daily};
  for(const input of pending){
   const ack=acked.get(input.id),confirmed=ack&&(!valid(ack.base)||includesAck(base,ack));
   if(!included.has(input.id)&&!confirmed){tapCount++;const day=clickDay(input.createdAt);daily[day]=(daily[day]??0)+1;}
  }
  return {tapCount,daily,base};
 }
 prune(){
  const entries=this.entries(),servers=entries.filter(([key])=>key.startsWith('server:')).sort(([,a],[,b])=>b.version-a.version||b.tapCount-a.tapCount);
  for(const [key] of servers.slice(2))this.storage.removeItem(this.prefix+key);
  const ids=new Set(this.inputs().map(input=>input.id));
  const base=this.project()?.base;
  for(const [key,value] of entries)if(!key.startsWith('server:')&&!value.operations?.some(id=>ids.has(id))&&(!key.startsWith('acked:')||!valid(value.base)||(base&&includesAck(base,value))))this.storage.removeItem(this.prefix+key);
 }
}
