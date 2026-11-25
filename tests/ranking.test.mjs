import test from 'node:test';
import assert from 'node:assert/strict';
import {rankRows,podiumRows} from '../src/lib/ranking.mjs';
const rows=[90,80,70,60,50].map((score,i)=>({buildingId:String(301+i),buildingNumber:301+i,complexId:i<3?'3':'4',score}));
test('기존 경쟁 순위와 동 번호 정렬, 단지 내 순위를 유지한다',()=>{
 const input=rows.map((row,i)=>({...row,score:i<2?100:row.score})),before=structuredClone(input);
 assert.deepEqual(rankRows(input).map(row=>row.rank),[1,1,3,4,5]);assert.deepEqual(input,before);
 assert.deepEqual(rankRows(input,'4').map(row=>row.rank),[1,2]);assert.deepEqual(rankRows(input,'9'),[]);
});
test('단독 TOP 3와 나머지 리스트는 중복이나 누락이 없다',()=>{
 const sorted=rankRows(rows),{podium,list}=podiumRows(sorted);
 assert.deepEqual(podium.map(row=>row.rank),[1,2,3]);assert.deepEqual(list.map(row=>row.rank),[4,5]);
 assert.equal(new Set([...podium,...list].map(row=>row.buildingId)).size,rows.length);
});
test('단독 1위 아래 공동 2위 84개 동은 전부 리스트로 보낸다',()=>{
 const input=Array.from({length:85},(_,i)=>({buildingId:String(i),buildingNumber:101+i,complexId:'1',score:i?0:100}));
 const {podium,list}=podiumRows(rankRows(input));assert.equal(podium.length,1);assert.equal(podium[0].rank,1);
 assert.equal(list.length,84);assert.ok(list.every(row=>row.rank===2));
});
test('모두 공동 1위면 시상대를 생략하고 전부 리스트에 표시한다',()=>{
 const {podium,list}=podiumRows(rankRows(rows.map(row=>({...row,score:0}))));
 assert.equal(podium.length,0);assert.equal(list.length,rows.length);assert.ok(list.every(row=>row.rank===1));
});
test('공동 그룹이 시상대에 모두 들어가면 함께 표시하고 단지 필터도 동일하게 적용한다',()=>{
 const input=rows.map((row,i)=>({...row,score:i===2?80:row.score}));
 const {podium,list}=podiumRows(rankRows(input));assert.deepEqual(podium.map(row=>row.rank),[1,2,2]);assert.deepEqual(list.map(row=>row.rank),[4,5]);
 const scoped=podiumRows(rankRows(input,'4'));assert.equal(scoped.podium.length,2);assert.ok(scoped.podium.every(row=>row.complexId==='4'));assert.equal(scoped.list.length,0);
});
