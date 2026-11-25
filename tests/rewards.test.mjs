import test from 'node:test';
import assert from 'node:assert/strict';
import rewards from '../functions/lib/rewards.js';
const {awardTaps,openGift,migrateRewards}=rewards;
const base={version:0,progress:0,target:45,boostMultiplier:1,boostStartsAt:0,boostExpiresAt:0,boostId:null,gift:null};
test('선물 수령 시 서버 기준 정확히 60초의 효과를 발급한다',()=>{
 const first=awardTaps(base,44,1,0);assert.equal(first.xp,44);assert.equal(first.reward.gift,null);
 const dropped=awardTaps(first.reward,1,1,0);assert.equal(dropped.reward.gift.durationSeconds,60);
 const claimed=openGift(dropped.reward,1000);assert.equal(claimed.boostStartsAt,1000);assert.equal(claimed.boostExpiresAt,61000);assert.equal(claimed.boostMultiplier,2);
 assert.equal(claimed.boostId,dropped.reward.gift.id);assert.deepEqual(openGift(claimed,5000),claimed);
});
test('60초 경계: 활성 중 드롭 진행 중지, 만료 이후 기본 입력만 다음 선물에 누적',()=>{
 const state={...base,boostMultiplier:5,boostStartsAt:1000,boostExpiresAt:61000,boostId:'test-boost-grant-01'};
 const active=awardTaps(state,100,8,60999,{points:100,multiplier:5});assert.equal(active.xp,500);assert.equal(active.reward.progress,0);assert.equal(active.reward.boostExpiresAt,61000);
 const expired=awardTaps(active.reward,1,8,61000);assert.equal(expired.xp,1);assert.equal(expired.reward.progress,1);
 // 만료 전 입력은 만료 후 도착해도 검증된 원래 배율로 계산한다.
 const delayed=awardTaps(expired.reward,3,8,90000,{points:3,multiplier:5});assert.equal(delayed.xp,15);assert.equal(delayed.reward.progress,1);
});
test('기존 횟수제 아이템은 60초 효과로 한 번만 전환한다',()=>{
 const old={version:1,progress:0,target:45,boostMultiplier:3,boostRemaining:20,gift:null};
 const converted=migrateRewards(old,1000);assert.equal(converted.boostExpiresAt,61000);assert.ok(converted.boostId);assert.equal('boostRemaining' in converted,false);
 assert.deepEqual(migrateRewards(converted,5000),converted);
});
