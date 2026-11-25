import test from 'node:test';
import assert from 'node:assert/strict';
import {LocalClicks,clickDay} from '../src/lib/LocalClicks.mjs';
import {InputJournal,scoreScope} from '../src/lib/PersistentOutbox.mjs';
import {MemoryStorage,setup,deferred} from './helpers/persistence.mjs';
const at=Date.parse('2026-11-25T03:00:00Z'),day=clickDay(at);
const base=(version,tapCount,batches=[],daily={[day]:tapCount})=>({version,tapCount,daily,recentBatchIds:batches});
function fixture(){const storage=new MemoryStorage(),options={projectId:'demo-clicks',uid:'alice',eventId:'winter',storage};const ledger=new LocalClicks(options),journal=new InputJournal(scoreScope('demo-clicks','alice','winter','101'),storage);return {storage,ledger,journal,options};}
test('입력 즉시 로컬 카운트 증가·새로고침 복구·서버 응답 전후 중복 합산 방지',()=>{
 const {ledger,journal,options}=fixture();ledger.receive(base(1,10));const first=journal.append('101',{},at);
 assert.equal(ledger.project().tapCount,11);assert.equal(new LocalClicks(options).project().daily[day],11);
 ledger.seal('batch-01',[first.id]);ledger.receive(base(2,11,['batch-01']));assert.equal(ledger.project().tapCount,11);
 const second=journal.append('101',{},at+1);assert.equal(ledger.project().tapCount,12);
 ledger.acknowledge('batch-01',base(2,11,['batch-01']));journal.remove([first.id]);ledger.prune();assert.equal(ledger.project().tapCount,12);
 ledger.seal('batch-02',[second.id]);ledger.acknowledge('batch-02',base(3,12,['batch-01','batch-02']));journal.remove([second.id]);ledger.prune();
 ledger.receive(base(2,11,['batch-01']));assert.equal(ledger.project().tapCount,12);
});
test('두 탭과 동 변경의 입력은 UUID별로 합산하고 계정·이벤트·프로젝트는 분리한다',()=>{
 const {ledger,journal,options,storage}=fixture();ledger.receive(base(1,100));journal.append('101',{},at);
 const other=new InputJournal(scoreScope('demo-clicks','alice','winter','201'),storage);other.append('201',{},at);
 assert.equal(new LocalClicks(options).project().tapCount,102);
 for(const changed of [{uid:'bob'},{eventId:'other'},{projectId:'demo-other'}])assert.equal(new LocalClicks({...options,...changed}).project(),null);
});
test('오프라인 한국 자정 경계와 거절 배치의 클릭 롤백',()=>{
 const {ledger,journal}=fixture(),before=Date.parse('2026-11-25T14:59:59Z'),after=before+2000;
 ledger.receive(base(1,5,[],{'2026-11-25':5}));const a=journal.append('101',{},before),b=journal.append('101',{},after);
 assert.deepEqual(ledger.project().daily,{'2026-11-25':6,'2026-11-26':1});
 ledger.seal('bad',[a.id,b.id]);ledger.reject([{batchId:'bad',status:'rejected',operations:[a.id,b.id]}]);
 assert.equal(ledger.project().tapCount,5);assert.equal(ledger.project().daily['2026-11-26'],undefined);
});
test('다른 기기 증가와 본인 전송 중 입력을 겹치지 않고 합산한다',()=>{
 const {ledger,journal}=fixture();ledger.receive(base(1,10));const input=journal.append('101',{},at);ledger.seal('mine',[input.id]);
 ledger.receive(base(2,15,['other-device']));assert.equal(ledger.project().tapCount,16);
 ledger.receive(base(3,16,['other-device','mine']));assert.equal(ledger.project().tapCount,16);
});
test('최근 배치 창을 지난 응답 유실에서도 기준값을 보존하고 승인 후 최신 합계로 복귀한다',()=>{
 const {ledger,journal}=fixture();ledger.receive(base(1,10));const a=journal.append('101',{},at);ledger.seal('lost',[a.id]);
 ledger.receive(base(200,300,Array.from({length:128},(_,i)=>`other-${i}`)));assert.equal(ledger.project().tapCount,11);
 const b=journal.append('101',{},at+1);ledger.seal('second',[b.id]);
 ledger.acknowledge('second',base(201,301,Array.from({length:128},(_,i)=>`new-${i}`)));journal.remove([b.id]);ledger.prune();
 assert.equal(ledger.project().tapCount,12);
 ledger.acknowledge('lost',base(201,301,Array.from({length:128},(_,i)=>`new-${i}`)));journal.remove([a.id]);ledger.prune();
 assert.equal(ledger.project().tapCount,301);
});
test('실제 영속 큐: 응답 유실 후 같은 배치를 복구해 클릭·서버 합계를 한 번만 반영한다',async()=>{
 const f=setup();try{
  const ledger=new LocalClicks({...f.options,storage:f.storage});ledger.receive({version:1,tapCount:0,daily:{},recentBatchIds:[]});
  const release=deferred(),started=deferred();let sent;
  const page=f.queue({send:async batch=>{sent=batch;started.resolve();await release.promise;return {...await f.server.send(batch),activity:base(2,1,[batch.batchId],{'1970-01-01':1})};}});
  await page.q.readyPromise;page.q.touch();assert.equal(ledger.project().tapCount,1);await page.q.settle();f.tick(5000);const sending=page.q.flushNow();await started.promise;
  ledger.receive(base(2,1,[sent.batchId],{'1970-01-01':1}));assert.equal(ledger.project().tapCount,1);
  page.q.dispose();release.resolve();await sending;
  assert.equal(new LocalClicks({...f.options,storage:f.storage}).project().tapCount,1);assert.equal(f.server.personal,1);
 }finally{await f.cleanup();}
});
test('로컬 메타데이터 용량 부족 시 입력을 보존하고 저장소 복구 후 같은 배치를 재전송한다',async()=>{
 const f=setup();try{
  const ledger=new LocalClicks({...f.options,storage:f.storage});ledger.receive(base(1,0,[],{}));
  const page=f.queue({send:async batch=>({...await f.server.send(batch),activity:base(2,1,[batch.batchId],{'1970-01-01':1})})});
  await page.q.readyPromise;page.q.touch();await page.q.settle();
  const save=f.storage.setItem.bind(f.storage);
  f.storage.setItem=(key,value)=>{if(key.includes(':sealed:'))throw new Error('QuotaExceededError');save(key,value);};
  f.tick(5000);await page.q.flushNow();assert.equal(f.server.calls,0);assert.equal(page.state.unconfirmed,1);
  f.storage.setItem=save;f.tick(5000);await page.q.flushNow();
  assert.equal(f.server.calls,1);assert.equal(ledger.project().tapCount,1);assert.equal(page.state.unconfirmed,0);
 }finally{await f.cleanup();}
});
