import test from 'node:test';
import assert from 'node:assert/strict';
import {presenceSummary} from '../src/lib/presence.mjs';
test('다중 탭은 브라우저와 계정별로 중복 제거하고 비로그인·활성 화면을 구분한다',()=>{
 const result=presenceSummary({a:{browserId:'browser-a',uid:'alice',active:true},b:{browserId:'browser-a',uid:'alice',active:false},c:{browserId:'browser-b',uid:'',active:true},d:{browserId:'browser-c',uid:'alice',active:false},e:{browserId:'browser-b',uid:'',active:false}});
 assert.deepEqual([result.browsers,result.active,result.tabs,result.accounts,result.visitors],[3,2,5,1,1]);
});
test('동일 브라우저의 로그인 전·후 탭은 비로그인 방문자로 중복 집계하지 않는다',()=>{
 const result=presenceSummary({a:{browserId:'browser-a',uid:'',active:false},b:{browserId:'browser-a',uid:'alice',active:true}});
 assert.equal(result.browsers,1);assert.equal(result.accounts,1);assert.equal(result.visitors,0);
 assert.equal(presenceSummary(null).tabs,0);
});
