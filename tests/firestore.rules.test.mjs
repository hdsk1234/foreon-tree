import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,collection,getDocs} from 'firebase/firestore';
test('개인정보와 집계의 읽기 경계 및 클라이언트 쓰기 차단',async()=>{
 const env=await initializeTestEnvironment({projectId:process.env.GCLOUD_PROJECT??'demo-foreon-tree',firestore:{rules:await readFile('firestore.rules','utf8')}});
 try{
  const paths=['users/alice','events/winter/participants/alice','events/winter/userScores/alice'];
  await env.withSecurityRulesDisabled(async c=>{
    for(const p of [...paths,'events/winter/teamScores/101','events/winter/scoreBatches/x','events/winter/results/leaderboard'])await setDoc(doc(c.firestore(),p),{score:1});
  });
  const own=env.authenticatedContext('alice').firestore(),other=env.authenticatedContext('bob').firestore(),anon=env.unauthenticatedContext().firestore();
  for(const path of paths){await assertSucceeds(getDoc(doc(own,path)));await assertFails(getDoc(doc(other,path)));await assertFails(getDoc(doc(anon,path)));await assertFails(setDoc(doc(own,path),{score:99}));}
  await assertFails(getDocs(collection(own,'users')));
  await assertFails(getDoc(doc(own,'events/winter/scoreBatches/x')));
  await assertSucceeds(getDoc(doc(own,'events/winter/teamScores/101')));
  await assertSucceeds(getDoc(doc(other,'events/winter/teamScores/101')));
  await assertSucceeds(getDoc(doc(anon,'events/winter/teamScores/101')));
  await assertFails(getDoc(doc(anon,'events/winter/teamScores/201')));
  await assertFails(getDocs(collection(own,'events/winter/teamScores')));
  await assertFails(setDoc(doc(own,'events/winter/teamScores/101'),{score:99}));
  await assertSucceeds(getDoc(doc(other,'events/winter/results/leaderboard')));
  await assertSucceeds(getDoc(doc(anon,'events/winter/results/leaderboard')));
  await assertFails(getDoc(doc(anon,'events/winter/results/private')));
  await assertFails(getDocs(collection(anon,'events/winter/results')));
  for(const path of ['developerSessions/alice','developerGates/example','events/winter/scoreResets/example','adminDashboardCache/example']){
   await assertFails(getDoc(doc(own,path)));await assertFails(setDoc(doc(own,path),{score:0}));
  }
  await assertFails(setDoc(doc(own,'events/winter/results/leaderboard'),{rows:[]}));
 }finally{await env.cleanup();}
});
