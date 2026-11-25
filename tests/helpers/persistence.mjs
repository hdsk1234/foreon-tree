import {IDBFactory} from 'fake-indexeddb';
import {ScoreQueue} from '../../src/lib/PersistentScoreQueue.mjs';
export class MemoryStorage {
 constructor(){this.data=new Map();}
 get length(){return this.data.size;}
 key(index){return [...this.data.keys()][index]??null;}
 getItem(key){return this.data.get(key)??null;}
 setItem(key,value){this.data.set(key,String(value));}
 removeItem(key){this.data.delete(key);}
}
export function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
export function setup(){
 const storage=new MemoryStorage(),indexedDB=new IDBFactory(),receipts=new Map(),queues=[];
 let clock=0,score=100,revision=1,personal=0,online=true,active=true,calls=0,currentUid='alice';
 const options={projectId:'demo-persistence',uid:'alice',eventId:'winter',buildingId:'101',initial:{score:100,revision:1},
  storage,indexedDB,autoStart:false,broadcast:false,comboEnabled:false,now:()=>clock,isCurrent:()=>currentUid==='alice'};
 const server={
  async send(batch){calls++;if(!online)throw {code:'functions/unavailable'};
   if(receipts.has(batch.batchId))return {...receipts.get(batch.batchId),duplicate:true};
   if(!active)throw {code:'functions/failed-precondition',details:{reason:'event-ended'}};
   score+=batch.points;personal+=batch.points;revision++;
   const receipt={accepted:batch.points,teamScore:score,teamRevision:revision,duplicate:false};receipts.set(batch.batchId,receipt);return receipt;
  },get score(){return score;},get personal(){return personal;},get calls(){return calls;},get revision(){return revision;},
  set online(value){online=value;},set active(value){active=value;},
 };
 function queue(extra={}){let latest;const errors=[];const q=new ScoreQueue({...options,send:batch=>server.send(batch),status:text=>errors.push(text),changed:value=>{latest=value;},...extra});queues.push(q);return {q,errors,get state(){return latest;}};}
 return {queue,server,storage,indexedDB,options,tick(ms){clock+=ms;},set uid(value){currentUid=value;},
  async cleanup(){for(const q of queues){q.dispose();await q.settle();}}};
}
