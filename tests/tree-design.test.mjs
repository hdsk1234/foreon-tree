import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import ts from 'typescript';
import {TREE_DESIGNS,treeGeometry,resolveTreeStyle,sanitizeTreeStyle} from '../src/engine/treeDesign.mjs';
const source=(await readFile(new URL('../src/engine/ParticleScene.ts',import.meta.url),'utf8')).replace("'./treeDesign.mjs'",JSON.stringify(new URL('../src/engine/treeDesign.mjs',import.meta.url).href)).replace("'./SpiralRibbon.mjs'",JSON.stringify(new URL('../src/engine/SpiralRibbon.mjs',import.meta.url).href));
const {createParticleScene}=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText).toString('base64'));
test('모든 레벨의 트리 높이·폭이 증가하며 모바일과 가로 화면 안에 들어간다',()=>{
 assert.equal(new Set(TREE_DESIGNS.map(p=>p.colors.join('/'))).size,10);
 for(const [w,h] of [[320,250],[393,366],[956,280]]){
  let last={treeHeight:0,radius:0};
  for(let level=1;level<=10;level++){
   const g=treeGeometry(w,h,level);assert.ok(g.treeHeight>last.treeHeight);assert.ok(g.radius>last.radius);assert.ok(g.top>0&&g.top+g.treeHeight<g.ground&&g.ground<h);assert.ok(g.cx-g.radius>0&&g.cx+g.radius<w);last=g;
  }
 }
});
test('꾸미기 해금은 열람 레벨이 아닌 최고 해금 레벨로 제한한다',()=>{
 const all={starColor:'rose',rotation:1.5,snow:false,aurora:true,reindeer:true,orbits:true,royal:true};
 const locked=resolveTreeStyle(all,1,1);assert.equal(locked.starColor,'original');assert.equal(locked.rotation,1);assert.equal(locked.aurora,false);assert.equal(locked.royal,false);
 assert.equal(resolveTreeStyle(all,2,1).starColor,'rose');assert.equal(resolveTreeStyle(all,2,1).rotation,1);
 assert.equal(resolveTreeStyle(all,9,1).rotation,1);assert.equal(resolveTreeStyle(all,10,1).rotation,1.5);assert.equal(resolveTreeStyle(all,2,1).royal,false);assert.equal(resolveTreeStyle(all,3,1).royal,true);assert.equal(resolveTreeStyle(all,10,1).royal,true);
 assert.deepEqual(sanitizeTreeStyle({starColor:'url(bad)',rotation:Infinity,snow:'true',score:999}),{});
});
test('10종 트리·꾸미기·모션 줄이기를 렌더링해도 좌표/반경/Canvas 상태가 유효하다',()=>{
 for(const [w,h] of [[320,250],[393,366],[956,280]])for(let level=1;level<=10;level++)for(const reduced of [false,true]){
  let depth=0,circles=0;
  const check=args=>{for(const arg of args)if(typeof arg==='number')assert.ok(Number.isFinite(arg));};
  const gradient={addColorStop(at){assert.ok(at>=0&&at<=1);}};
  const ctx=new Proxy({}, {get(_,name){return (...args)=>{check(args);if(name==='save')depth++;if(name==='restore')depth--;assert.ok(depth>=0);if(name==='arc'){assert.ok(args[2]>0);circles++;}if(name==='createRadialGradient'||name==='createLinearGradient')return gradient;};},set(){return true;}});
  const scene=createParticleScene();scene.paint(ctx,w,h,10,1/60,level,{rotation:5,fireworks:true,meteors:true},level,reduced);scene.burst(w/2,h/2);scene.paint(ctx,w,h,11,1/60,level,{},level,reduced);
  assert.equal(depth,0);assert.ok(circles>0&&circles<10000);
 }
});

test('자전 슬라이더의 중간 속도를 저장·복구하고 잘못된 범위는 거부한다',()=>{
 for(const speed of [0,.05,.65,1,1.35,2,3.15,5])assert.equal(resolveTreeStyle(JSON.parse(JSON.stringify({rotation:speed})),10,1).rotation,speed);
 for(const speed of [-.05,5.05,Infinity,NaN,'1'])assert.equal(sanitizeTreeStyle({rotation:speed}).rotation,undefined);
 assert.equal(sanitizeTreeStyle({rotation:.651}).rotation,.65);
 assert.equal(resolveTreeStyle({rotation:1.35},9,1).rotation,1);
});

test('불꽃놀이·별똥별 토글을 저장·복원하고, 이전 시간 제한 이후에도 켜짐/꺼짐을 적용한다',()=>{
 const saved=JSON.parse(JSON.stringify(sanitizeTreeStyle({fireworks:true,meteors:true})));
 assert.equal(resolveTreeStyle(saved,5,1).fireworks,false);
 assert.equal(resolveTreeStyle(saved,6,1).fireworks,true);
 assert.equal(resolveTreeStyle(saved,8,1).meteors,false);
 assert.equal(resolveTreeStyle(saved,9,1).meteors,true);
 assert.equal(resolveTreeStyle({fireworks:false,meteors:false},10,10).fireworks,false);
 function circles(style,reduced=false){
  let count=0;const gradient={addColorStop(){}};
  const ctx=new Proxy({}, {get(_,name){return ()=>{if(name==='arc')count++;if(name==='createRadialGradient'||name==='createLinearGradient')return gradient;};},set(){return true;}});
  const scene=createParticleScene();scene.paint(ctx,393,366,30,30,10,style,10,reduced);return count;
 }
 const off=circles({fireworks:false,meteors:false});
 assert.ok(circles(saved)>off);
 assert.ok(circles({fireworks:true,meteors:false})>off);
 assert.ok(circles({fireworks:false,meteors:true})>off);
 assert.equal(circles(saved,true),circles({fireworks:false,meteors:false},true));
});


test('루돌프는 7레벨에 해금하고 이전 서리 결정 설정의 켜짐/꺼짐을 이어받는다',()=>{
 assert.equal(resolveTreeStyle({reindeer:true},6,1).reindeer,false);
 assert.equal(resolveTreeStyle({reindeer:true},7,1).reindeer,true);
 assert.equal(resolveTreeStyle({reindeer:false},10,10).reindeer,false);
 assert.deepEqual(sanitizeTreeStyle({crystals:false}),{reindeer:false});
 assert.deepEqual(sanitizeTreeStyle({crystals:true,reindeer:false}),{reindeer:false});
});

test('나선 리본은 600개 파티클로 표면을 감싸며 위로 흐르고 팔레트/설정을 복원한다',async()=>{
 const {projectRibbon,RIBBON_PARTICLE_COUNT,RIBBON_PALETTES}=await import('../src/engine/SpiralRibbon.mjs');
 assert.equal(Object.keys(RIBBON_PALETTES).length,5);assert.equal(RIBBON_PARTICLE_COUNT,600);
 const g=treeGeometry(393,366,8),start=projectRibbon(g,0,0),next=projectRibbon(g,.1,0);
 assert.equal(start.length,600);assert.ok(start.some(p=>p.depth<0)&&start.some(p=>p.depth>0));
 for(let i=0;i<start.length;i++){
  const p=start[i];assert.ok(Math.abs(p.x-g.cx)<=g.radius*p.u);assert.ok(p.alpha>=0&&p.alpha<=1);assert.ok(p.size>0);
  if(p.u>.1&&p.u<.9)assert.ok(next[i].u<p.u);
 }
 const near=start.filter(p=>p.depth>.8&&p.u>.2&&p.u<.8),far=start.filter(p=>p.depth<-.8&&p.u>.2&&p.u<.8);
 const mean=(list,key)=>list.reduce((sum,p)=>sum+p[key],0)/list.length;
 assert.ok(mean(near,'size')>mean(far,'size'));assert.ok(mean(near,'alpha')>mean(far,'alpha'));
 for(const key of Object.keys(RIBBON_PALETTES)){
  const saved=JSON.parse(JSON.stringify(sanitizeTreeStyle({royal:true,ribbonPalette:key})));
  assert.equal(resolveTreeStyle(saved,3,1).ribbonPalette,key);
  assert.equal(resolveTreeStyle(saved,2,1).ribbonPalette,'gold');
  assert.ok(projectRibbon(g,30,2,key).every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&/^\d+,\d+,\d+$/.test(p.color)));
 }
 assert.equal(sanitizeTreeStyle({ribbonPalette:'invalid'}).ribbonPalette,undefined);
});
