import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizeStudio,studioAuthMessage,studioTimeout} from '../src/lib/developerLogin.mjs';
test('관리자 버튼은 초기 인증 실패 이후에도 인증을 다시 준비한 뒤 비밀번호를 전송한다',async()=>{
 const calls=[];let current=null;
 const expires=await authorizeStudio('test-password',{restore:async()=>{calls.push('restore');current='new-browser';return {uid:current};},isCurrent:uid=>uid===current,authorize:async password=>{calls.push(password);return {developer:true,expiresAt:2000};},now:()=>1000});
 assert.equal(expires,2000);assert.deepEqual(calls,['restore','test-password']);
});
test('관리자 UID 변경은 무응답으로 종료하지 않고 명시적인 재시도 오류를 반환한다',async()=>{
 let current='first';
 await assert.rejects(authorizeStudio('pw',{restore:async()=>({uid:current}),isCurrent:uid=>current===uid,authorize:async()=>{current='second';return {developer:true,expiresAt:2000};},now:()=>1000}),error=>error.code==='studio/auth-changed');
});
test('인증 복원 실패·빈 사용자·만료 응답을 성공으로 표시하지 않는다',async()=>{
 let sends=0;const options={restore:async()=>null,isCurrent:()=>true,authorize:async()=>{sends++;return {developer:true,expiresAt:1};}};
 await assert.rejects(authorizeStudio('pw',options),error=>error.code==='studio/auth-unavailable');assert.equal(sends,0);
 await assert.rejects(authorizeStudio('pw',{...options,restore:async()=>({uid:'a'}),now:()=>2}));
});
test('응답 지연과 잘못된 비밀번호·연결 오류를 구분하고 시간 초과 후 재시도한다',async()=>{
 await assert.rejects(studioTimeout(new Promise(()=>{}),5),error=>error.code==='studio/timeout');
 assert.equal(await studioTimeout(Promise.resolve('retry-ok'),5),'retry-ok');
 assert.match(studioAuthMessage({details:{reason:'invalid-password'}}),/비밀번호/);
 assert.match(studioAuthMessage({code:'functions/resource-exhausted'}),/1분/);
 assert.match(studioAuthMessage({code:'studio/timeout',message:'late'}),/응답/);
});
