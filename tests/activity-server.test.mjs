import test from 'node:test';
import assert from 'node:assert/strict';
import activity from '../functions/lib/activity.js';
const {recordActivity}=activity;
test('개인 활동은 실제 클릭과 XP를 구분하고 한국 자정/최근31일 경계를 유지한다',()=>{
 const before=Date.parse('2026-11-25T14:59:59Z'),after=before+2000;
 const a=recordActivity({},'101',12.5,5,0,before),b=recordActivity(a,'101',30,3,0,after);
 assert.equal(b.tapCount,8);assert.equal(b.trackedScore,42.5);assert.equal(b.trackingStartedAt,before);
 assert.deepEqual(b.daily['2026-11-25'],{score:12.5,taps:5});assert.deepEqual(b.daily['2026-11-26'],{score:30,taps:3});
 let next=b;for(let i=1;i<=40;i++)next=recordActivity(next,'201',1,1,0,after+i*86400000);
 assert.equal(Object.keys(next.daily).length,31);assert.equal(next.buildings['101'].score,42.5);assert.equal(next.tapCount,48);
});
test('동 EXP 초기화 후 현재 기여도는 새 회차로 분리하고 개인 누적 활동은 보존한다',()=>{
 const a=recordActivity({},'101',100,50,0,Date.now());
 const b=recordActivity(a,'101',2,1,1,Date.now());
 assert.deepEqual(b.buildings['101'],{score:102,taps:51,epoch:1,activeScore:2,activeTaps:1});
 assert.equal(b.trackedScore,102);assert.equal(b.tapCount,51);
});

test('지연 전송된 클릭도 한국 날짜별로 집계하고 배치 버전/최근 ID를 제한한다',()=>{
 const now=Date.parse('2026-11-25T15:00:01Z'),before=now-2000;
 const a=recordActivity({},'101',2,2,0,now,'batch-first',[before,now]);
 assert.equal(a.daily['2026-11-25'].taps,1);assert.equal(a.daily['2026-11-26'].taps,1);
 assert.equal(a.activityVersion,1);assert.deepEqual(a.recentBatchIds,['batch-first']);
 let current=a;for(let i=0;i<140;i++)current=recordActivity(current,'101',1,1,0,now,'batch-'+i,[now]);
 assert.equal(current.recentBatchIds.length,128);assert.equal(current.tapCount,142);assert.equal(current.activityVersion,141);
});
