import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceCombo,awardComboTaps,comboView} from '../src/lib/combo.mjs';
import {addUnits,toExperience} from '../src/lib/experience.mjs';
import {setup,deferred} from './helpers/persistence.mjs';
const fill=(n,at=0)=>awardComboTaps(null,Array(n).fill(at));
function sender(){let score=100,revision=1,combo;const receipts=new Map();let calls=0;return {
 async send(batch){calls++;if(receipts.has(batch.batchId))return receipts.get(batch.batchId);const result=awardComboTaps(combo,batch.tapTimes,batch.boostId?batch.points:0,batch.boostId?5:1,score);combo={...result.state,version:(combo?.version??0)+1};score=addUnits(score,result.units);const receipt={accepted:batch.points,teamScore:score,teamRevision:++revision,combo};receipts.set(batch.batchId,receipt);return receipt;},get score(){return score;},get calls(){return calls;},get combo(){return combo;}};}
test('5·12·20·30회로 1.2·1.5·1.8·2.0배를 해금하고 다음 입력에 적용',()=>{
 for(const [hits,multiplier] of [[5,1.2],[12,1.5],[20,1.8],[30,2]]){const result=fill(hits);assert.equal(comboView(result.state,0).multiplier,multiplier);assert.equal(advanceCombo(result.state,0).multiplierTenths,multiplier*10);}
 assert.equal(fill(100).state.meter,40);assert.equal(fill(40).units,63.4);
});
test('1.5초 유예 후 250ms마다 1칸 감소하며 중간 배율을 거친다',()=>{
 const state=fill(40,10000).state;
 for(const [at,meter,multiplier] of [[11500,40,2],[11750,39,2],[14250,29,1.8],[16750,19,1.5],[18750,11,1.2],[20500,4,1],[21500,0,1]]){const view=comboView(state,at);assert.equal(view.meter,meter);assert.equal(view.multiplier,multiplier);}
 assert.equal(state.meter,40);const resumed=advanceCombo(state,18750);assert.equal(resumed.multiplierTenths,12);assert.equal(resumed.state.meter,12);
});
test('선물과 곱연산하며 만료/사용량 밖의 입력도 콤보 자체는 유지한다',()=>{
 const peak=fill(40,10000).state;
 assert.equal(toExperience(awardComboTaps(peak,[10000],1,5).units),10000);
 assert.equal(awardComboTaps(peak,[10000,10100,10200],2,3).units,14);
});
test('과거 입력은 콤보를 되감거나 증가시키지 않는다',()=>{
 const peak=fill(40,10000).state,result=advanceCombo(peak,9000);assert.deepEqual(result.state,peak);assert.equal(result.multiplierTenths,10);
 assert.equal(advanceCombo(peak,30000).state.meter,1);
});
test('콤보 소수 경험치를 정수 틱으로 합산한다',()=>{
 let units=0;for(let i=0;i<1000;i++)units=addUnits(units,1.2);assert.equal(units,1200);assert.equal(toExperience(units),1200000);assert.equal(addUnits(.1,.2),.3);
});
test('새로고침: 남은 콤보만 감쇠하고 이미 모은 경험치는 유지한다',async()=>{
 const f=setup(),server=sender();try{
  const a=f.queue({comboEnabled:true,send:b=>server.send(b)});await a.q.readyPromise;for(let i=0;i<12;i++)a.q.touch();await a.q.settle();assert.equal(a.state.score,126.8);assert.equal(a.state.comboMultiplier,1.5);a.q.dispose();f.tick(2000);
  const b=f.queue({comboEnabled:true,send:b=>server.send(b)});await b.q.readyPromise;assert.equal(b.state.score,126.8);assert.equal(b.state.comboMultiplier,1.2);assert.equal(b.state.comboMeter,10);
  f.tick(3000);await b.q.flushNow();assert.equal(server.score,126.8);assert.equal(b.state.unconfirmed,0);assert.equal(b.state.comboMultiplier,1);
 }finally{await f.cleanup();}
});
test('승인 응답 유실·최신 스냅샷·재전송으로 콤보를 중복 적용하지 않는다',async()=>{
 const f=setup(),server=sender(),committed=deferred(),release=deferred();let receipt;
 try{
  const a=f.queue({comboEnabled:true,send:async batch=>{receipt=await server.send(batch);committed.resolve();await release.promise;return receipt;}});await a.q.readyPromise;for(let i=0;i<12;i++)a.q.touch();await a.q.settle();f.tick(5000);const sending=a.q.flushNow();await committed.promise;
  a.q.receive({score:receipt.teamScore,revision:receipt.teamRevision,combo:receipt.combo});await a.q.settle();assert.equal(a.state.score,126.8);a.q.dispose();
  const b=f.queue({comboEnabled:true,initial:{score:receipt.teamScore,revision:receipt.teamRevision,combo:receipt.combo},send:b=>server.send(b)});await b.q.readyPromise;assert.equal(b.state.score,126.8);f.tick(21000);await b.q.flushNow();assert.equal(b.state.score,126.8);assert.equal(b.state.unconfirmed,0);assert.equal(server.combo.version,1);release.resolve();await sending;
 }finally{release.resolve();await f.cleanup();}
});
test('여러 탭 동시 입력은 하나의 순서와 배치로 계산한다',async()=>{
 const f=setup(),server=sender();try{
  const a=f.queue({comboEnabled:true,send:b=>server.send(b)}),b=f.queue({comboEnabled:true,send:b=>server.send(b)});await Promise.all([a.q.readyPromise,b.q.readyPromise]);for(let i=0;i<10;i++){a.q.touch();b.q.touch();}await Promise.all([a.q.settle(),b.q.settle()]);a.q.refresh();b.q.refresh();await Promise.all([a.q.settle(),b.q.settle()]);assert.equal(a.state.score,150.8);assert.equal(b.state.score,150.8);
  f.tick(5000);await Promise.all([a.q.flushNow(),b.q.flushNow()]);a.q.refresh();b.q.refresh();await Promise.all([a.q.settle(),b.q.settle()]);assert.equal(server.calls,1);assert.equal(a.state.score,150.8);assert.equal(b.state.unconfirmed,0);
 }finally{await f.cleanup();}
});
test('선물 60초 만료는 콤보를 초기화하지 않고 입력을 별도 배치에 보관한다',async()=>{
 const f=setup(),rewards={version:1,progress:0,target:45,boostMultiplier:5,boostStartsAt:0,boostExpiresAt:2000,boostId:'combo-timed-grant-01',gift:null};
 try{
  const a=f.queue({comboEnabled:true,initial:{score:100,revision:1,rewards}});await a.q.readyPromise;for(let i=0;i<30;i++)a.q.touch();await a.q.settle();assert.equal(a.q.xpPerTap(),20);f.tick(1000);a.q.touch();f.tick(1000);assert.equal(a.q.xpPerTap(),4);a.q.touch();await a.q.settle();assert.equal(a.state.score,558);
  const record=await a.q.store.read();assert.equal(record.batches.length,2);assert.equal(record.batches[0].points,31);assert.equal(record.batches[1].boostId,undefined);assert.equal(a.state.comboMultiplier,2);
 }finally{await f.cleanup();}
});
