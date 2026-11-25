import test from 'node:test';
import assert from 'node:assert/strict';
import {OptimisticScore} from '../src/lib/OptimisticScore.mjs';
const ack=(score,revision,accepted)=>({teamScore:score,teamRevision:revision,accepted,duplicate:false});
test('터치는 즉시 표시하고 배치 분리/재시도는 표시 점수를 바꾸지 않는다',()=>{
 const score=new OptimisticScore({score:98,revision:1});
 for(let i=0;i<5;i++)score.touch();
 assert.equal(score.snapshot().score,103);
 assert.deepEqual(score.begin('first',3),{batchId:'first',points:3});
 assert.equal(score.snapshot().score,103);
 assert.deepEqual(score.begin('retry'),{batchId:'first',points:3});
 score.acknowledge('first',ack(101,2,3));
 assert.equal(score.snapshot().score,103);assert.equal(score.snapshot().unconfirmed,2);
});
test('서버 집계가 응답보다 먼저 도착해도 내 터치를 이중 합산하지 않는다',()=>{
 const score=new OptimisticScore({score:100,revision:10});
 for(let i=0;i<5;i++)score.touch();score.begin('batch');
 score.touch();score.touch();
 score.receive({score:110,revision:12}); // 내 5점 + 다른 사람 5점
 assert.equal(score.snapshot().score,107); // 미확정 배치 포함 여부를 응답 전 단정하지 않음
 score.acknowledge('batch',ack(105,11,5));
 assert.equal(score.snapshot().score,112);assert.equal(score.snapshot().unconfirmed,2);
 score.receive({score:100,revision:10});assert.equal(score.snapshot().score,112);
});
test('응답 후 오래된 집계를 받아도 점수가 내려가거나 재가산되지 않는다',()=>{
 const score=new OptimisticScore({score:98,revision:1});
 score.touch();score.touch();score.begin('batch');
 score.acknowledge('batch',ack(100,2,2));
 for(const server of [{score:98,revision:1},{score:100,revision:2}])score.receive(server);
 score.acknowledge('batch',{...ack(100,2,2),duplicate:true});
 assert.deepEqual(score.snapshot(),{score:100,confirmedScore:100,revision:2,unconfirmed:0});
});
test('집계 대기 중 저장 거절 시 서버 기준으로 복구하고 미확정 터치를 취소한다',()=>{
 const score=new OptimisticScore({score:100,revision:10});
 score.touch();score.begin('failed');score.touch();
 score.receive({score:104,revision:11});score.cancel();
 assert.deepEqual(score.snapshot(),{score:104,confirmedScore:104,revision:11,unconfirmed:0});
});
test('전송 전 다른 참여자의 집계는 내 미전송 터치 위에 즉시 반영한다',()=>{
 const score=new OptimisticScore({score:100,revision:10});
 score.touch();score.receive({score:105,revision:11});
 assert.equal(score.snapshot().score,106);
 score.begin('batch');score.acknowledge('batch',ack(106,12,1));
 assert.equal(score.snapshot().score,106);
});
test('잘못된 응답은 배치를 지우지 않으며 새 이벤트 원장은 독립적이다',()=>{
 const score=new OptimisticScore();score.touch();score.begin('a');
 assert.throws(()=>score.acknowledge('a',ack(1,1,2)));
 assert.equal(score.snapshot().unconfirmed,1);
 assert.equal(new OptimisticScore().snapshot().score,0);
});

test('이전 집계와 새 응답이 섞여도 누적 점수를 중복하거나 되돌리지 않는다',()=>{
 const score=new OptimisticScore({score:105,revision:3});
 score.receive({score:110,revision:0});
 score.receive({score:108,revision:4});assert.equal(score.snapshot().score,108);
 score.touch();score.begin('new');score.acknowledge('new',ack(111,5,1));
 score.receive({score:110,revision:0});assert.equal(score.snapshot().score,111);
});
test('관리자 초기화: 낮아진 새 revision을 적용하고 과거 승인/집계는 무시한다',()=>{
 const score=new OptimisticScore({score:999,revision:0});
 score.receive({score:0,revision:1});assert.equal(score.snapshot().score,0);
 score.receive({score:999,revision:0});assert.equal(score.snapshot().score,0);
 score.receive({score:2,revision:2});assert.equal(score.snapshot().score,2);
});
