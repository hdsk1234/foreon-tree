import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
test('접속 수집은 공개·개인정보 읽기는 관리자 한정, UID 위조·추가 필드·만료 차단',async()=>{
 const env=await initializeTestEnvironment({projectId:'demo-presence-rules',database:{host:'127.0.0.1',port:9100,rules:await readFile('database.rules.json','utf8')}});
 try{
  const visitor=env.unauthenticatedContext().database(),user=env.authenticatedContext('alice').database(),admin=env.authenticatedContext('admin').database();
  const path=`connections/${randomUUID()}`,value={browserId:randomUUID(),uid:'',page:'tree',active:true,startedAt:Date.now(),updatedAt:Date.now()};
  await assertSucceeds(visitor.ref(path).set(value));
  await assertFails(visitor.ref('connections').once('value'));await assertFails(user.ref('connections').once('value'));
  await assertFails(visitor.ref(path).update({uid:'alice',updatedAt:Date.now()}));
  await assertFails(user.ref(`connections/${randomUUID()}`).set({...value,uid:'bob'}));
  await assertFails(visitor.ref(path).update({email:'private@example.test'}));
  await assertFails(visitor.ref('adminAccess/admin').set({expiresAt:Date.now()+60000,accessId:'fake'}));
  await env.withSecurityRulesDisabled(async c=>{await c.database().ref().update({'adminConfig':{accessId:'test'},'adminAccess/admin':{accessId:'test',expiresAt:Date.now()+60000}});});
  assert.ok((await assertSucceeds(admin.ref('connections').once('value'))).val());
  await env.withSecurityRulesDisabled(c=>c.database().ref('adminAccess/admin/expiresAt').set(Date.now()-1));
  await assertFails(admin.ref('connections').once('value'));
  await assertSucceeds(visitor.ref(path).remove());
 }finally{await env.cleanup();}
});
test('실제 연결이 끊기면 onDisconnect가 해당 탭만 제거한다',async()=>{
 const env=await initializeTestEnvironment({projectId:'demo-presence-disconnect',database:{host:'127.0.0.1',port:9100,rules:await readFile('database.rules.json','utf8')}});
 try{
  const first=env.unauthenticatedContext().database(),second=env.unauthenticatedContext().database();
  const a=`connections/${randomUUID()}`,b=`connections/${randomUUID()}`,browserId=randomUUID();
  const data=()=>({browserId,uid:'',page:'tree',active:true,startedAt:Date.now(),updatedAt:Date.now()});
  await first.ref(a).onDisconnect().remove();await first.ref(a).set(data());
  await second.ref(b).onDisconnect().remove();await second.ref(b).set(data());first.goOffline();
  let result;for(let i=0;i<50;i++){await env.withSecurityRulesDisabled(async c=>{result=(await c.database().ref('connections').once('value')).val();});if(!result?.[a.split('/')[1]])break;await new Promise(resolve=>setTimeout(resolve,100));}
  assert.equal(result?.[a.split('/')[1]],undefined);assert.ok(result?.[b.split('/')[1]]);
 }finally{await env.cleanup();}
});
