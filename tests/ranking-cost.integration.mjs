import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {buildings} from '../scripts/initial-data.mjs';
const project=process.env.GCLOUD_PROJECT;
if(project!=='demo-foreon-tests'||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8180')throw new Error('격리된 Emulator에서만 실행하세요.');
const require=createRequire(new URL('../functions/package.json',import.meta.url)),{publishRankingBoards,BUILDINGS}=require('./lib/rankings.js');
const {initializeApp,deleteApp}=require('firebase-admin/app'),{getFirestore,Timestamp,FieldValue}=require('firebase-admin/firestore');
test('랭킹: 85개 초기화 후 변경분만 읽고 유휴 갱신·중복 작성은 생략한다',async()=>{
 const app=initializeApp({projectId:project},'ranking-cost'),db=getFirestore(app),event=db.doc(`events/ranking_cost_${Date.now()}`);
 try{
  assert.deepEqual(BUILDINGS.map(row=>row.buildingId),buildings.map(row=>row.id));
  await event.set({status:'active',startsAt:Timestamp.fromMillis(Date.now()-60000),endsAt:null});
  const batch=db.batch();for(const building of BUILDINGS)batch.set(event.collection('teamScores').doc(building.buildingId),{score:0,revision:0,updatedAt:FieldValue.serverTimestamp()});await batch.commit();
  const board=event.collection('results').doc('leaderboard');
  await publishRankingBoards(db);const initial=await board.get();assert.equal(initial.get('rows').length,85);assert.equal(initial.get('syncVersion'),1);assert.ok(initial.get('syncCursor') instanceof Timestamp);
  const idle=await publishRankingBoards(db);assert.equal(idle.scoreDocuments,0);assert.equal(idle.boardWrites,0);assert.ok((await board.get()).updateTime.isEqual(initial.updateTime));
  const changes=db.batch();for(const id of ['101','201'])changes.update(event.collection('teamScores').doc(id),{score:100,revision:1,updatedAt:FieldValue.serverTimestamp()});await changes.commit();
  const incremental=await publishRankingBoards(db);assert.equal(incremental.scoreDocuments,2);assert.equal(incremental.boardWrites,1);
  const rows=(await board.get()).get('rows');assert.equal(rows[0].buildingId,'101');assert.equal(rows[1].buildingId,'201');assert.equal(rows[0].rank,1);assert.equal(rows[1].rank,1);assert.equal(rows[2].rank,3);
  const cursor=(await board.get()).get('syncCursor');await event.collection('teamScores').doc('301').update({score:200,revision:1,updatedAt:FieldValue.serverTimestamp()});
  assert.ok((await event.collection('teamScores').doc('301').get()).get('updatedAt').toMillis()>=cursor.toMillis());
  const concurrent=await Promise.all([publishRankingBoards(db),publishRankingBoards(db)]);assert.equal(concurrent.reduce((sum,value)=>sum+value.boardWrites,0),1);assert.equal((await board.get()).get('rows')[0].buildingId,'301');
  const beforeClose=await board.get();await event.update({endsAt:Timestamp.fromMillis(Date.now()-1)});const ended=await publishRankingBoards(db);
  assert.equal(ended.boardWrites,0);assert.equal((await event.get()).get('status'),'closed');assert.ok((await board.get()).updateTime.isEqual(beforeClose.updateTime));
 }finally{await deleteApp(app);}
});
