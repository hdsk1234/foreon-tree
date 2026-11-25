import test from 'node:test';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
import {getFirestore,Timestamp} from 'firebase-admin/firestore';
import {initializeApp} from 'firebase-admin/app';
import backend from '../functions/lib/index.js';
const project=process.env.GCLOUD_PROJECT??'demo-foreon-tree';
const authHost=process.env.FIREBASE_AUTH_EMULATOR_HOST??'127.0.0.1:9099';
const functionsHost=process.env.FOREON_TEST_FUNCTIONS_HOST??'127.0.0.1:5001';
const db=getFirestore(initializeApp({projectId:project}));
async function signup(){
 const response=await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-only`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({returnSecureToken:true})});
 const body=await response.json();assert.ok(body.idToken,JSON.stringify(body));return body;
}
async function call(name,data,token){
 const response=await fetch(`http://${functionsHost}/${project}/asia-northeast3/${name}`,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({data})});
 return response.json();
}
test('Emulator 초기 데이터 스크립트: 85개 동 생성 및 재실행 시 기존 트리 유지',async()=>{
 const run=promisify(execFile);
 await run(process.execPath,['scripts/seed.mjs']);
 const collection=db.collection('apartments/olympic-park-foreon/buildings');
 assert.equal((await collection.get()).size,85);
 await collection.doc('101').update({'tree.actualLevel':4});
 await run(process.execPath,['scripts/seed.mjs']);
 assert.equal((await collection.doc('101').get()).get('tree.actualLevel'),4);
});
test('실제 Emulator callable: 참가·중복·동시성·제한·종료와 공개 집계',async()=>{
 const alice=await signup(),bob=await signup(),eventId=`test_${Date.now()}`;
 const event=db.doc(`events/${eventId}`);
 await db.doc('apartments/olympic-park-foreon/buildings/101').set({apartmentId:'olympic-park-foreon',complexId:'1',buildingNumber:101});
 await event.set({status:'active',startsAt:Timestamp.fromMillis(Date.now()-60000),endsAt:Timestamp.fromMillis(Date.now()+600000)});
 const batch={eventId,batchId:'integration_batch_01',points:10};
 assert.equal((await call('submitScoreBatch',batch)).error.status,'UNAUTHENTICATED');
 assert.equal((await call('submitScoreBatch',batch,alice.idToken)).error.status,'PERMISSION_DENIED');
 assert.equal((await call('joinEvent',{eventId,buildingId:'101'},alice.idToken)).result.buildingId,'101');
 assert.equal((await call('joinEvent',{eventId,buildingId:'101'},bob.idToken)).result.buildingId,'101');
 const outcomes=await Promise.all(Array.from({length:3},()=>call('submitScoreBatch',batch,alice.idToken)));
 assert.ok(outcomes.every(r=>r.result?.accepted===10),JSON.stringify(outcomes));
 assert.ok(outcomes.every(r=>r.result?.teamScore===10&&r.result?.teamRevision===1),JSON.stringify(outcomes));
 assert.equal((await event.collection('teamScores').doc('101').get()).get('score'),10);
 assert.equal((await event.collection('userScores').doc(alice.localId).get()).get('score'),10);
 assert.equal((await call('submitScoreBatch',{...batch,points:11},alice.idToken)).error.status,'ALREADY_EXISTS');
 await event.collection('userScores').doc(alice.localId).update({lastBatchAt:Timestamp.now()});
 assert.equal((await call('submitScoreBatch',{...batch,batchId:'integration_batch_02'},alice.idToken)).error.status,'RESOURCE_EXHAUSTED');
 assert.equal((await call('submitScoreBatch',{...batch,points:0},bob.idToken)).error.status,'INVALID_ARGUMENT');
 // 다른 UID의 동일 batchId는 독립 요청.
 assert.equal((await call('submitScoreBatch',batch,bob.idToken)).result.accepted,10);
 assert.equal((await event.collection('teamScores').doc('101').get()).get('score'),20);
 const duplicate=await call('submitScoreBatch',batch,alice.idToken);
 assert.equal(duplicate.result.teamScore,10);assert.equal(duplicate.result.teamRevision,1);
 assert.equal((await event.collection('teamScores').doc('101').get()).get('revision'),2);
 await db.doc(`users/${alice.localId}`).update({buildingId:'102'});
 await event.collection('userScores').doc(alice.localId).update({lastBatchAt:Timestamp.fromMillis(0)});
 assert.equal((await call('submitScoreBatch',{...batch,batchId:'integration_batch_03'},alice.idToken)).result.accepted,10);
 assert.equal((await event.collection('teamScores').doc('101').get()).get('score'),30);
 await event.update({endsAt:Timestamp.fromMillis(Date.now()-1)});
 assert.equal((await call('submitScoreBatch',{...batch,batchId:'integration_batch_04'},alice.idToken)).error.status,'FAILED_PRECONDITION');
 await backend.publishRankings.run({scheduleTime:new Date().toISOString()});
 const result=(await event.collection('results').doc('leaderboard').get()).data();
 assert.equal(result.rows.find(r=>r.buildingId==='101').score,30);
 assert.equal(result.rows.find(r=>r.buildingId==='101').revision,3);
 assert.ok(result.rows.every(r=>!('uid' in r)&&!('email' in r)));
 assert.equal((await event.get()).get('status'),'closed');
 assert.equal((await call('deleteAccount',{},bob.idToken)).result.deleted,true);
 for(const path of [`users/${bob.localId}`,`events/${eventId}/participants/${bob.localId}`,`events/${eventId}/userScores/${bob.localId}`])assert.equal((await db.doc(path).get()).exists,false);
 assert.equal((await event.collection('scoreBatches').where('uid','==',bob.localId).get()).size,0);
 assert.equal((await event.collection('teamScores').doc('101').get()).get('score'),30);
 assert.equal((await call('joinEvent',{eventId,buildingId:'101'},bob.idToken)).error.status,'UNAUTHENTICATED');

});
