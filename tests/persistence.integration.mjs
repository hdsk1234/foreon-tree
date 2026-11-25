import test from 'node:test';
import assert from 'node:assert/strict';
import {initializeApp} from 'firebase-admin/app';
import {getFirestore,Timestamp} from 'firebase-admin/firestore';
import {setup,deferred} from './helpers/persistence.mjs';
const project=process.env.GCLOUD_PROJECT??'demo-foreon-tests';
const authHost=process.env.FIREBASE_AUTH_EMULATOR_HOST??'127.0.0.1:9199';
const functionsHost=process.env.FOREON_TEST_FUNCTIONS_HOST??'127.0.0.1:5101';
const db=getFirestore(initializeApp({projectId:project},'persistence-integration'));
async function authRequest(action,data){const response=await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:${action}?key=demo-only`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const body=await response.json();assert.ok(!body.error,JSON.stringify(body));return body;}
async function call(name,data,token){const response=await fetch(`http://${functionsHost}/${project}/asia-northeast3/${name}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},body:JSON.stringify({data})});const body=await response.json();if(body.error)throw {code:`functions/${body.error.status.toLowerCase().replaceAll('_','-')}`,details:body.error.details};return body.result;}
test('실제 Firestore/함수: 복구·계정 연동·응답 유실·동시 탭·종료 후 중복 확인',async()=>{
 const f=setup(),user=await authRequest('signUp',{returnSecureToken:true});let token=user.idToken;
 const eventId=`persist_${Date.now()}`,event=db.doc(`events/${eventId}`);
 await db.doc('apartments/olympic-park-foreon/buildings/101').set({apartmentId:'olympic-park-foreon',complexId:'1',buildingNumber:101},{merge:true});
 await event.set({status:'active',startsAt:Timestamp.fromMillis(Date.now()-60000),endsAt:Timestamp.fromMillis(Date.now()+600000)});
 await call('joinEvent',{eventId,buildingId:'101'},token);
 const base={projectId:project,uid:user.localId,eventId,isCurrent:()=>true,initial:{score:0,revision:0},send:batch=>call('submitScoreBatch',{eventId,...batch},token)};
 const resetRate=()=>event.collection('userScores').doc(user.localId).set({lastBatchAt:Timestamp.fromMillis(0)},{merge:true});
 try{
  // 브라우저 컨텍스트 재생성 10회 + 각 입력의 동기식 저널 복구.
  for(let i=0;i<10;i++){const page=f.queue(base);await page.q.readyPromise;assert.equal(page.q.touch(),true);page.q.dispose();}
  const restored=f.queue(base);await restored.q.readyPromise;assert.equal(restored.state.score,10);f.tick(5000);await restored.q.flushNow();
  assert.equal((await event.collection('teamScores').doc('101').get()).get('score'),10);
  assert.equal((await event.collection('userScores').doc(user.localId).get()).get('score'),10);
  // Auth Emulator에서 실제 익명→이메일 계정 연결. UID와 큐 경로가 유지되어야 한다.
  const linked=await authRequest('update',{idToken:token,email:`persistence-${Date.now()}@example.test`,password:'Emulator-only-12345!',returnSecureToken:true});
  assert.equal(linked.localId,user.localId);token=linked.idToken;await call('syncAccount',{},token);
  assert.equal((await db.doc(`users/${user.localId}`).get()).get('accountType'),'linked');
  restored.q.touch();await restored.q.settle();restored.q.dispose();
  const linkedPage=f.queue({...base,send:batch=>call('submitScoreBatch',{eventId,...batch},token)});await linkedPage.q.readyPromise;assert.equal(linkedPage.state.score,11);
  await resetRate();f.tick(5000);await linkedPage.q.flushNow();assert.equal((await event.collection('teamScores').doc('101').get()).get('score'),11);
  // 두 컨텍스트의 입력과 동시 전송을 실제 서버 원장으로 검증한다.
  const tabA=f.queue(base),tabB=f.queue(base);await Promise.all([tabA.q.readyPromise,tabB.q.readyPromise]);
  tabA.q.touch();tabB.q.touch();await Promise.all([tabA.q.settle(),tabB.q.settle()]);
  await resetRate();f.tick(5000);await Promise.all([tabA.q.flushNow(),tabB.q.flushNow()]);
  assert.equal((await event.collection('teamScores').doc('101').get()).get('score'),13);
  assert.equal((await event.collection('userScores').doc(user.localId).get()).get('score'),13);
  // 서버에 쓰기를 확정하고 HTTP 성공 응답만 보류한다.
  const committed=deferred(),release=deferred();let accepted;
  const first=f.queue({...base,send:async batch=>{accepted=await call('submitScoreBatch',{eventId,...batch},token);committed.resolve();await release.promise;return accepted;}});
  await first.q.readyPromise;first.q.touch();await first.q.settle();await resetRate();f.tick(5000);const sending=first.q.flushNow();await committed.promise;first.q.dispose();
  const baseline={score:accepted.teamScore,revision:accepted.teamRevision};
  const replay=f.queue({...base,initial:baseline});await replay.q.readyPromise;replay.q.receive(baseline);await replay.q.settle();assert.equal(replay.state.score,14);
  // 종료 후에도 기존에 성공한 batchId는 성공 응답이어야 한다.
  await event.update({endsAt:Timestamp.fromMillis(Date.now()-1)});f.tick(21000);await replay.q.flushNow();assert.equal(replay.state.score,14);assert.equal(replay.state.unconfirmed,0);
  release.resolve();await sending;assert.equal((await event.collection('teamScores').doc('101').get()).get('score'),14);
  // 새로운 미전송분은 종료 후 반영하지 않고 삭제 없이 거절 상태로 보관한다.
  replay.q.touch();await replay.q.settle();f.tick(5000);await replay.q.flushNow();assert.equal(replay.state.blocked,true);assert.equal(replay.state.score,14);
  assert.equal((await replay.q.store.read()).batches[0].status,'rejected');
  // 다른 실제 UID는 이전 사용자의 미전송분을 읽지 않는다.
  const other=await authRequest('signUp',{returnSecureToken:true});await call('joinEvent',{eventId,buildingId:'101'},other.idToken).catch(error=>assert.equal(error.code,'functions/failed-precondition'));
  const otherPage=f.queue({...base,uid:other.localId,initial:baseline});await otherPage.q.readyPromise;assert.equal(otherPage.state.unconfirmed,0);assert.equal(otherPage.state.score,14);
 }finally{await f.cleanup();await db.terminate();}
});
