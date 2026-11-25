import test from 'node:test';
import assert from 'node:assert/strict';
import {PROMOTIONS,promotionFor,paintPromotion} from '../src/engine/PromotionScene.mjs';
import {STYLE_UNLOCKS,STYLE_LABELS} from '../src/engine/treeDesign.mjs';
test('승급 안내는 실제 꾸미기 해금 레벨과 일치하고 다음 레벨 기능은 노출하지 않는다',()=>{
 for(let level=1;level<=10;level++)assert.deepEqual(promotionFor(level).unlocks,Object.entries(STYLE_UNLOCKS).filter(([,at])=>at===level).map(([key])=>STYLE_LABELS[key]));
 assert.deepEqual(promotionFor(1).unlocks,[]);
 assert.deepEqual(promotionFor(3).unlocks,['은하수 리본','리본 색상']);
 assert.deepEqual(promotionFor(10).unlocks,['트리 자전 속도']);
});
function surface(){
 let depth=0,draws=0;
 const check=values=>{for(const value of values){if(typeof value==='number')assert.ok(Number.isFinite(value));if(Array.isArray(value))check(value);}};
 const ctx=new Proxy({}, {get(_,name){
  if(name==='createRadialGradient')return (...values)=>{check(values);return {addColorStop(offset){assert.ok(offset>=0&&offset<=1);}};};
  return (...values)=>{check(values);if(name==='save')depth++;if(name==='restore')depth--;assert.ok(depth>=0);if(name==='arc'){assert.ok(values[2]>=0);draws++;}};
 },set(_,name,value){if(name==='globalAlpha')assert.ok(value>=0&&value<=1);return true;}});
 return {ctx,balanced:()=>depth===0,draws:()=>draws};
}
test('2~10레벨의 승급 문양은 서로 다르고 이펙트 개수는 제한된다',()=>{
 const profiles=PROMOTIONS.slice(1);
 assert.equal(new Set(profiles.map(p=>`${p.color}/${p.points}/${p.rings}/${p.wings}`)).size,9);
 assert.ok(profiles.every(p=>p.sparks<=168&&p.duration<6));
 assert.equal(promotionFor(10).crown,true);
});
test('작은 세로/큰 가로 화면의 모든 승급 단계가 유효한 좌표로 렌더링된다',()=>{
 for(const [w,h] of [[320,568],[393,852],[956,440]])for(let level=2;level<=10;level++){
  for(const time of [0,.1,.5,1.2,2.8,4.7,6]){
   const s=surface();paintPromotion(s.ctx,w,h,level,time);assert.ok(s.balanced());assert.ok(s.draws()<200);
  }
 }
});
test('모션 줄이기 모드에도 정적인 문장과 레벨 식별이 유지된다',()=>{
 const s=surface();paintPromotion(s.ctx,320,568,10,0,true);assert.ok(s.balanced());assert.ok(s.draws()>0&&s.draws()<15);
});
