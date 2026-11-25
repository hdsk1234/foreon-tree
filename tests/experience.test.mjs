import test from 'node:test';
import assert from 'node:assert/strict';
import levels from '../functions/src/levels.json' with {type:'json'};
import {EXP_PER_SCORE_UNIT,toExperience,formatXp,levelForScore,growthForScore} from '../src/lib/experience.mjs';
import {setup} from './helpers/persistence.mjs';
test('성장 단위 환산과 새 레벨 임계값을 적용한다',()=>{
 assert.equal(EXP_PER_SCORE_UNIT,1000);assert.deepEqual([1,2,3,5].map(formatXp),['1,000','2,000','3,000','5,000']);
 assert.deepEqual(levels,[0,100000,600000,3000000,15000000,100000000,1000000000,10000000000,100000000000,25000000000000]);
 assert.equal(levelForScore(99),1);assert.equal(levelForScore(100),2);assert.equal(levelForScore(25000000000),10);
});
test('누적 EXP는 보존하고 새 기준으로 레벨과 남은 EXP를 계산한다',()=>{
 assert.equal(formatXp(348),'348,000');assert.deepEqual(growthForScore(348),{level:2,remaining:252000,value:248000,max:500000});
 assert.deepEqual(growthForScore(99),{level:1,remaining:1000,value:99000,max:100000});
 assert.equal(growthForScore(25000000000).remaining,0);
});
test('미전송 입력을 새로고침으로 복구해도 1,000배 경험치를 중복 가산하지 않는다',async()=>{
 const f=setup();try{
  const first=f.queue();await first.q.readyPromise;first.q.touch();assert.equal(formatXp(first.state.score),'101,000');first.q.dispose();
  const restored=f.queue();await restored.q.readyPromise;assert.equal(toExperience(restored.state.unconfirmed),1000);
  f.tick(5000);await restored.q.flushNow();assert.equal(formatXp(restored.state.score),'101,000');assert.equal(toExperience(f.server.personal),1000);
 }finally{await f.cleanup();}
});
test('환산 경험치는 안전한 정수 범위를 지킨다',()=>{
 const max=Math.floor(Number.MAX_SAFE_INTEGER/1000);assert.ok(Number.isSafeInteger(toExperience(max)));
 assert.equal(toExperience(1.2),1200);assert.equal(toExperience(3.6),3600);
 for(const units of [-1,0.01,NaN,Infinity,max+1])assert.throws(()=>toExperience(units));
});

test('레벨별 기본 EXP가 증가하며 최고 해금 레벨의 점수만 사용한다',async()=>{
 const {baseUnitsForScore}=await import('../src/lib/experience.mjs');
 const expected=[1,2,3,5,8,12,18,27,40,60];
 for(let i=0;i<levels.length;i++){
  assert.equal(baseUnitsForScore(levels[i]/1000),expected[i]);
  if(i)assert.equal(baseUnitsForScore((levels[i]-100)/1000),expected[i-1]);
 }
});
test('500명이 하루 1시간·초당 3회씩 일주일 입력해도 최대 보너스로 10레벨에 도달하지 못한다',async()=>{
 const {minimumInputsToLevel10}=await import('../scripts/balance-economy.mjs');
 assert.ok(minimumInputsToLevel10()>500*60*60*3*7);
});
test('레벨 경계를 넘는 입력은 다음 입력부터 보상이 증가하고 새로고침해도 유지된다',async()=>{
 const f=setup();try{
  const a=f.queue({comboEnabled:true,initial:{score:99,revision:1}});await a.q.readyPromise;
  a.q.touch();assert.equal(a.state.score,100);assert.equal(a.state.baseXp,2);assert.equal(a.state.nextXp,2);
  a.q.touch();assert.equal(a.state.score,102);await a.q.settle();a.q.dispose();
  const b=f.queue({comboEnabled:true,initial:{score:99,revision:1}});await b.q.readyPromise;
  assert.equal(b.state.score,102);assert.equal(b.state.nextXp,2);
 }finally{await f.cleanup();}
});

test('최고 레벨 600,000 EXP 입력도 저널에 저장되고 새로고침 후 중복 없이 복구된다',async()=>{
 const f=setup(),initial={score:25000000000,revision:1,combo:{meter:40,lastTapAt:0,version:1},rewards:{version:1,progress:0,target:45,boostMultiplier:5,boostStartsAt:0,boostExpiresAt:60000,boostId:'max_level_boost_01',gift:null}};
 try{
  const a=f.queue({comboEnabled:true,initial});await a.q.readyPromise;assert.equal(a.q.xpPerTap(),600);
  assert.equal(a.q.touch(),true);await a.q.settle();assert.equal(a.state.unconfirmed,600);a.q.dispose();
  const b=f.queue({comboEnabled:true,initial});await b.q.readyPromise;assert.equal(b.state.unconfirmed,600);assert.equal(b.state.score,25000000600);
 }finally{await f.cleanup();}
});
