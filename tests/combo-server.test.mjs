import test from 'node:test';import assert from 'node:assert/strict';
import backend from '../functions/lib/combo.js';import scoring from '../functions/lib/scoring.js';
import {advanceCombo,comboView,awardComboTaps} from '../src/lib/combo.mjs';
import {toExperience,addUnits} from '../src/lib/experience.mjs';
test('서버/브라우저의 축적·부분 감쇠·재입력 계산이 동일하다',()=>{
 let state,serverState,now=0,seed=7;
 for(let i=0;i<2000;i++){seed=(seed*1664525+1013904223)>>>0;now+=(seed%11===0?8000:seed%1800);const a=advanceCombo(state,now),b=backend.advanceCombo(serverState,now);assert.deepEqual(a,b);state=a.state;serverState=b.state;assert.deepEqual(comboView(state,now+4250),backend.comboView(serverState,now+4250));}
 const times=Array.from({length:100},(_,i)=>100000+i*100);assert.deepEqual(awardComboTaps(null,times,70,5),backend.awardComboTaps(null,times,70,5));
});
test('서버/브라우저 고정 소수점과 입력 시각 검증',()=>{
 assert.equal(scoring.addScore(.1,.2),addUnits(.1,.2));for(const units of [1.2,1.5,1.8,2,3.6,7.5,10])assert.equal(scoring.toExperience(units),toExperience(units));
 for(const units of [.01,1.25,-.1,Infinity])assert.throws(()=>scoring.toExperience(units));
 const request={eventId:'winter',batchId:'combo_payload_test_01',points:100,buildingId:'101',tapTimes:Array(100).fill(Date.now())};assert.deepEqual(scoring.validateBatch(request),request);assert.ok(Buffer.byteLength(JSON.stringify(request))<2048);
 for(const change of [{tapTimes:[1]},{points:2,tapTimes:[2,1]},{points:1,tapTimes:[1.5]},{comboMultiplier:100},{tapTimes:'invalid'},{batchId:'x'.repeat(3000)}])assert.throws(()=>scoring.validateBatch({...request,...change}));
});

test('레벨 경계와 선물·콤보 중첩의 서버/브라우저 EXP 계산이 동일하다',()=>{
 for(const start of [0,99,599,2999,14999,99999,999999,9999999,99999999,24999999999,25000000000]){
  const times=Array.from({length:100},(_,i)=>100000+i*100);
  for(const gift of [1,2,3,5])assert.deepEqual(awardComboTaps(null,times,70,gift,start),backend.awardComboTaps(null,times,70,gift,start));
 }
 const times=[1000,1100];assert.equal(backend.awardComboTaps(null,times,0,1,99).units,3);
 const peak={meter:40,lastTapAt:1000,version:0};
 assert.equal(backend.awardComboTaps(peak,[1000],1,5,25000000000).units,600);
});
