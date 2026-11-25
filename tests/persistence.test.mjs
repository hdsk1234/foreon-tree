import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,deferred,MemoryStorage} from './helpers/persistence.mjs';
import {InputJournal,PersistentOutbox,scoreScope,outboxProjection} from '../src/lib/PersistentOutbox.mjs';
import {restoreGuest} from '../src/lib/authRestore.mjs';

test('입력 직후 새로고침: 동기 저널과 미전송 경험치 복구',async()=>{
 const f=setup();try{const a=f.queue();await a.q.readyPromise;assert.equal(a.q.touch(),true);assert.equal(a.state.score,101);
  a.q.dispose();const b=f.queue();await b.q.readyPromise;assert.equal(b.state.score,101);
  f.tick(5000);await b.q.flushNow();assert.equal(f.server.score,101);assert.equal(b.state.score,101);assert.equal(f.storage.length,0);
 }finally{await f.cleanup();}
});
test('배치 직전 새로고침 및 영속 5초 전송 간격',async()=>{
 const f=setup();try{const a=f.queue();await a.q.readyPromise;for(let i=0;i<3;i++)a.q.touch();await a.q.settle();f.tick(4999);a.q.dispose();
  const b=f.queue({initial:{score:0,revision:0}});await b.q.readyPromise;assert.equal(b.state.score,103);
  await b.q.flushNow();assert.equal(f.server.calls,0);f.tick(1);await b.q.flushNow();assert.equal(f.server.score,103);
 }finally{await f.cleanup();}
});
test('전송 도중 새로고침: 임대 만료 후 같은 batchId로 복구',async()=>{
 const f=setup(),started=deferred(),release=deferred();let first;
 try{const a=f.queue({send:async batch=>{first=batch;started.resolve();await release.promise;return f.server.send(batch);}});await a.q.readyPromise;a.q.touch();await a.q.settle();f.tick(5000);
  const sending=a.q.flushNow();await started.promise;a.q.dispose();
  const b=f.queue();await b.q.readyPromise;assert.equal(b.state.score,101);f.tick(21000);await b.q.flushNow();
  const record=await b.q.store.read();assert.equal(record.batches.length,0);assert.equal(f.server.score,101);
  release.resolve();await sending;assert.equal(f.server.score,101);assert.ok(first.batchId);
 }finally{release.resolve();await f.cleanup();}
});
test('서버 저장 직후 응답 전 새로고침: 실시간 점수와 복구 배치를 이중 표시하지 않는다',async()=>{
 const f=setup(),committed=deferred(),release=deferred();
 try{const a=f.queue({send:async batch=>{const result=await f.server.send(batch);committed.resolve();await release.promise;return result;}});await a.q.readyPromise;a.q.touch();await a.q.settle();f.tick(5000);
  const sending=a.q.flushNow();await committed.promise;a.q.dispose();
  const b=f.queue({initial:{score:101,revision:2}});await b.q.readyPromise;b.q.receive({score:101,revision:2});await b.q.settle();
  assert.equal(b.state.score,101);f.tick(21000);await b.q.flushNow();assert.equal(b.state.score,101);assert.equal(b.state.unconfirmed,0);
  assert.equal(f.server.score,101);assert.equal(f.server.personal,1);release.resolve();await sending;
 }finally{release.resolve();await f.cleanup();}
});
test('새로고침 10회 반복: 각 입력을 보존하고 초기 0으로 덮어쓰지 않는다',async()=>{
 const f=setup();try{for(let i=0;i<10;i++){const a=f.queue({initial:{score:0,revision:0}});if(i===0)a.q.receive({score:100,revision:1});await a.q.readyPromise;await a.q.settle();
   assert.equal(a.q.touch(),true);assert.equal(a.state.score,101+i);a.q.dispose();}
  const b=f.queue();await b.q.readyPromise;assert.equal(b.state.score,110);f.tick(5000);await b.q.flushNow();assert.equal(f.server.score,110);assert.equal(f.server.personal,10);
 }finally{await f.cleanup();}
});
test('오프라인 재접속: 영속 지수 백오프와 새 배치/전송 배치 분리',async()=>{
 const f=setup();try{const a=f.queue();await a.q.readyPromise;a.q.touch();await a.q.settle();f.tick(5000);f.server.online=false;await a.q.flushNow();
  const first=(await a.q.store.read()).batches.find(b=>b.status==='sealed');assert.equal((await a.q.store.read()).nextSendAt,15000);
  a.q.touch();await a.q.settle();a.q.dispose();const b=f.queue();await b.q.readyPromise;assert.equal(b.state.score,102);
  await b.q.flushNow();assert.equal(f.server.calls,1);f.tick(10000);f.server.online=true;await b.q.flushNow();assert.equal(f.server.score,101);assert.equal(b.state.score,102);
  f.tick(5000);await b.q.flushNow();assert.equal(f.server.score,102);assert.equal(b.state.score,102);assert.equal(f.server.personal,2);assert.ok(first.batchId);
 }finally{await f.cleanup();}
});
test('여러 탭 동시 입력/전송: 공유 원장과 원자 임대로 유실·중복 방지',async()=>{
 const f=setup();try{const a=f.queue(),b=f.queue();await Promise.all([a.q.readyPromise,b.q.readyPromise]);
  for(let i=0;i<10;i++){a.q.touch();b.q.touch();}await Promise.all([a.q.settle(),b.q.settle()]);
  a.q.refresh();b.q.refresh();await Promise.all([a.q.settle(),b.q.settle()]);assert.equal(a.state.score,120);assert.equal(b.state.score,120);
  f.tick(5000);await Promise.all([a.q.flushNow(),b.q.flushNow()]);a.q.refresh();b.q.refresh();await Promise.all([a.q.settle(),b.q.settle()]);
  assert.equal(f.server.calls,1);assert.equal(f.server.personal,20);assert.equal(a.state.score,120);assert.equal(b.state.score,120);
 }finally{await f.cleanup();}
});
test('게스트 계정 연동: UID가 유지되면 같은 영속 배치를 계속 사용한다',async()=>{
 const f=setup();try{const guest=f.queue();await guest.q.readyPromise;guest.q.touch();await guest.q.settle();guest.q.dispose();
  const linked=f.queue({uid:'alice'});await linked.q.readyPromise;assert.equal(linked.state.score,101);f.tick(5000);await linked.q.flushNow();assert.equal(f.server.personal,1);
 }finally{await f.cleanup();}
});
test('다른 계정 및 이벤트: 개인 미전송 캐시를 표시하거나 대신 보내지 않는다',async()=>{
 const f=setup();try{const a=f.queue();await a.q.readyPromise;a.q.touch();await a.q.settle();f.uid='bob';f.tick(5000);await a.q.flushNow();assert.equal(f.server.calls,0);a.q.dispose();
  const b=f.queue({uid:'bob',isCurrent:()=>true});await b.q.readyPromise;assert.equal(b.state.score,100);assert.equal(b.state.unconfirmed,0);
  const next=f.queue({uid:'alice',eventId:'new-event',isCurrent:()=>true,initial:{score:0,revision:0}});await next.q.readyPromise;assert.equal(next.state.score,0);
  const back=f.queue({uid:'alice',isCurrent:()=>true});await back.q.readyPromise;assert.equal(back.state.score,101);
 }finally{await f.cleanup();}
});
test('이벤트 종료: 미전송은 거절 보관, 이미 승인된 배치는 종료 후에도 재확인',async()=>{
 const f=setup();try{const a=f.queue();await a.q.readyPromise;a.q.touch();await a.q.settle();f.tick(5000);f.server.active=false;await a.q.flushNow();
  assert.equal(a.state.score,100);assert.equal(a.state.blocked,true);assert.equal(a.q.touch(),false);assert.equal(f.server.personal,0);
  assert.equal([...f.storage.data.keys()].filter(key=>key.startsWith('foreon:xp:v1:')).length,1);assert.equal((await a.q.store.read()).batches[0].status,'rejected');
 }finally{await f.cleanup();}
});
test('승인 커밋 후 저널 삭제 이전 중단: 승인 tombstone으로 재수입 방지',async()=>{
 const f=setup();try{const scope=scoreScope('demo-persistence','alice','winter'),journal=new InputJournal(scope,f.storage);
  const store=new PersistentOutbox({scope,buildingId:'101',journal,indexedDB:f.indexedDB,now:()=>5000});await store.hydrate({score:100,revision:1});journal.append('101');await store.hydrate();f.tick(10000);
  // 이 저장소의 기본 nextSendAt은 10000이므로 테스트 시각을 이후로 이동한다.
  store.now=()=>10000;const {batch}=await store.claim('tab');const receipt=await f.server.send(batch);await store.acknowledge(batch.batchId,receipt);await store.close();
  const recovered=f.queue();await recovered.q.readyPromise;assert.equal(recovered.state.score,101);assert.equal(recovered.state.unconfirmed,0);assert.equal(f.storage.length,0);assert.equal(f.server.personal,1);
 }finally{await f.cleanup();}
});
test('저장소 접근 불가/용량 부족: 예외 없이 입력 차단하고 기존 승인 점수 유지',async()=>{
 const f=setup();try{const denied={get length(){throw new Error('SecurityError');},getItem(){throw new Error('SecurityError');}};
  const a=f.queue({storage:denied});await a.q.readyPromise;assert.equal(a.q.touch(),false);assert.equal(a.errors.length,1);
  const quota=new MemoryStorage();quota.setItem=()=>{throw new Error('QuotaExceededError');};const b=f.queue({storage:quota});await b.q.readyPromise;
  assert.equal(b.q.touch(),false);assert.equal(b.state.score,100);assert.equal(b.errors.length,1);assert.equal(f.server.calls,0);
 }finally{await f.cleanup();}
});
test('인증 복원 전에는 익명 생성하지 않고 기존 UID를 네트워크 없이 재사용한다',async()=>{
 const ready=deferred();let creates=0;
 const auth={currentUser:null,authStateReady:()=>ready.promise};
 const result=restoreGuest(auth,async()=>{},async()=>{creates++;return {uid:'new'};});
 await Promise.resolve();assert.equal(creates,0);auth.currentUser={uid:'existing'};ready.resolve();assert.equal((await result).uid,'existing');assert.equal(creates,0);
});
test('IndexedDB 차단: 미보관 입력을 성공한 것처럼 표시하지 않는다',async()=>{
 const f=setup();try{
  const indexedDB={open(){throw new Error('SecurityError');}};
  const page=f.queue({indexedDB});await page.q.readyPromise;
  assert.equal(page.q.touch(),false);assert.equal(page.errors.length,1);assert.equal(f.server.calls,0);
 }finally{await f.cleanup();}
});
test('동 변경: 이전 동 입력을 보존하고 새 동 입력/승인을 분리한다',async()=>{
 const f=setup(),scores={'101':100,'102':0},seen=[];
 const send=async batch=>{seen.push(batch.buildingId);scores[batch.buildingId]+=batch.points;return {accepted:batch.points,teamScore:scores[batch.buildingId],teamRevision:2};};
 try{
  const old=f.queue({send});await old.q.readyPromise;old.q.touch();old.q.dispose();
  const next=f.queue({buildingId:'102',initial:{score:0,revision:0},send});await next.q.readyPromise;assert.equal(next.state.score,0);next.q.touch();await next.q.settle();
  const background=f.queue({send});await background.q.readyPromise;assert.equal(background.state.score,101);f.tick(5000);
  await Promise.all([background.q.flushNow(),next.q.flushNow()]);assert.equal(scores['101'],101);assert.equal(scores['102'],1);assert.deepEqual(seen.sort(),['101','102']);
 }finally{await f.cleanup();}
});
test('60초 아이템: 만료 전후 입력 분리·새로고침·지연 승인에도 경험치를 보존한다',async()=>{
 const f=setup(),rewards={version:1,progress:0,target:45,boostMultiplier:3,boostStartsAt:0,boostExpiresAt:60000,boostId:'timed-boost-grant-01',gift:null};
 const sent=[];let score=100,revision=1;
 try{
  const a=f.queue({initial:{score:100,revision:1,rewards}});await a.q.readyPromise;
  a.q.touch();assert.equal(a.state.score,103);f.tick(30000);a.q.dispose();
  const b=f.queue({send:async batch=>{sent.push(batch);score+=batch.points*(batch.boostId?3:1);return {accepted:batch.points,teamScore:score,teamRevision:++revision,rewards:{...rewards,version:revision}};}});
  await b.q.readyPromise;assert.equal(b.state.score,103);assert.equal(b.state.boostRemainingMs,30000);
  f.tick(29999);b.q.touch();assert.equal(b.state.score,106);f.tick(1);b.q.publish();assert.equal(b.state.nextXp,1);assert.equal(b.state.boostRemainingMs,0);
  b.q.touch();assert.equal(b.state.score,107);await b.q.settle();await b.q.flushNow();
  assert.equal(sent[0].points,2);assert.equal(sent[0].tapFrom,0);assert.equal(sent[0].tapTo,59999);assert.equal(b.state.score,107);
  f.tick(5000);await b.q.flushNow();assert.equal(sent[1].boostId,undefined);assert.equal(score,107);assert.equal(b.state.unconfirmed,0);
 }finally{await f.cleanup();}
});
test('전송 중 새 선물 수령: 승인 대기와 별개로 새 60초 효과를 즉시 사용한다',async()=>{
 const f=setup(),started=deferred(),release=deferred();
 try{
  const a=f.queue({send:async batch=>{started.resolve();await release.promise;return {accepted:batch.points,teamScore:101,teamRevision:2};}});await a.q.readyPromise;a.q.touch();await a.q.settle();f.tick(5000);
  const sending=a.q.flushNow();await started.promise;
  a.q.receive({score:100,revision:1,rewards:{version:2,progress:0,target:45,boostMultiplier:2,boostStartsAt:5000,boostExpiresAt:65000,boostId:'new-grant-during-send',gift:null}});await a.q.settle();
  assert.equal(a.q.xpPerTap(),2);a.q.touch();assert.equal(a.state.score,103);release.resolve();await sending;assert.equal(a.state.score,103);
 }finally{release.resolve();await f.cleanup();}
});

test('관리자 초기화: 전송 중인 과거 승인 응답과 새로고침 캐시가 점수를 되살리지 않는다',async()=>{
 const f=setup();try{
  const gate=deferred(),page=f.queue({send:async()=>gate.promise});await page.q.readyPromise;
  page.q.touch();await page.q.settle();f.tick(5000);const sending=page.q.flushNow();
  // 전송 배치가 생성될 때까지 저장소 작업을 비동기 경계로 넘긴다.
  for(let i=0;i<100&&!page.q.request;i++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.ok(page.q.request,'전송 배치가 생성되어야 한다');
  page.q.receive({score:0,revision:3});await page.q.settle();
  gate.resolve({accepted:1,teamScore:101,teamRevision:2});await sending;await page.q.settle();
  assert.equal(page.state.score,0);assert.equal(page.state.revision,3);page.q.dispose();
  const restored=f.queue({initial:{score:999,revision:0}});await restored.q.readyPromise;
  assert.equal(restored.state.score,0);assert.equal(restored.state.unconfirmed,0);
 }finally{await f.cleanup();}
});
