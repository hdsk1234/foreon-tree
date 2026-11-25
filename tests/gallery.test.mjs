import test from 'node:test';
import assert from 'node:assert/strict';
import {nextViewingLevel,canScore,galleryTransition} from '../src/engine/gallery.mjs';
test('현재 열람 중이면 레벨업 시 이동, 과거·미래 열람이면 유지',()=>{
  assert.equal(nextViewingLevel(3,3,4),4);
  assert.equal(nextViewingLevel(3,1,4),1);
  assert.equal(nextViewingLevel(3,5,4),5);
  assert.equal(nextViewingLevel(3,4,4),4);
});
test('본인 동의 해금된 모든 디자인에서 점수 허용, 미래·다른 동은 차단',()=>{
  for(let a=1;a<=10;a++)for(let v=1;v<=10;v++){
    assert.equal(canScore(a,v,true),v<=a);assert.equal(canScore(a,v,false),false);
  }
  assert.equal(canScore(10,0,true),false);
  assert.equal(canScore(10,11,true),false);
});

test('최초 서버 기록을 불러오거나 관전 대상을 바꿀 때 승급 연출을 재생하지 않는다',()=>{
 const first=galleryTransition({scope:'a',actual:1,ready:false},{scope:'a',actual:8,ready:true},1);
 assert.deepEqual(first,{viewingLevel:8,levelUp:false,celebrate:false});
 const other=galleryTransition({scope:'a',actual:2,ready:true},{scope:'b',actual:9,ready:true},2);
 assert.deepEqual(other,{viewingLevel:9,levelUp:false,celebrate:false});
});
test('현재 레벨의 성장만 자동 전환과 승급 연출을 함께 발생시킨다',()=>{
 assert.deepEqual(galleryTransition({scope:'a',actual:2,ready:true},{scope:'a',actual:3,ready:true},2),
  {viewingLevel:3,levelUp:true,celebrate:true});
});
test('과거/미래 관전 시 열람은 유지하고 성장 알림만 제공한다',()=>{
 for(const viewingLevel of [1,4])assert.deepEqual(galleryTransition({scope:'a',actual:2,ready:true},{scope:'a',actual:3,ready:true},viewingLevel),
  {viewingLevel,levelUp:true,celebrate:false});
});
test('경험치 복구로 레벨이 낮아질 때 승급 연출이 잘못 실행되지 않는다',()=>{
 assert.deepEqual(galleryTransition({scope:'a',actual:3,ready:true},{scope:'a',actual:2,ready:true},3),
  {viewingLevel:2,levelUp:false,celebrate:false});
});
