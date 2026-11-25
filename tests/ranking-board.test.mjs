import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
const result=await build({entryPoints:['src/components/RankingBoard.tsx'],bundle:true,write:false,format:'esm',platform:'node',jsx:'automatic',plugins:[{name:'shared-react',setup(builder){builder.onResolve({filter:/^react(?:\/|$)/},args=>({path:pathToFileURL(require.resolve(args.path)).href,external:true}));}}]});
const {RankingBoard}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const rows=[90,80,70,60].map((score,i)=>({buildingId:String(301+i),buildingNumber:301+i,complexId:'3',score,actualLevel:i+1}));
const render=(own,ready=true)=>renderToStaticMarkup(createElement(RankingBoard,{rows,own,ready,onOpen:()=>{}}));
test('데이터 기반 카드와 행에만 우리 동 라벨이 나타나며 이전 차트·검색은 없다',()=>{
 const html=render('301');assert.match(html,/동별 랭킹/);assert.match(html,/우리 동 보기/);assert.match(html,/301동/);assert.match(html,/90,000/);
 assert.equal((html.match(/class="ranking-own-label"/g)??[]).length,1);
 assert.equal((render('304').match(/class="ranking-own-label"/g)??[]).length,1);
 assert.doesNotMatch(render(null),/class="ranking-own-label"/);
 assert.doesNotMatch(html,/leader-summary|rank-chart|type="search"/);
 for(const row of rows)assert.equal((html.match(new RegExp(`data-building="${row.buildingId}"`,'g'))??[]).length,1);
});
test('랭킹 복원 전 가짜 0점·시상대를 표시하지 않는다',()=>{
 const html=render(null,false);assert.match(html,/랭킹을 불러오고 있어요/);assert.doesNotMatch(html,/data-building=|90,000|podium-card/);
});
test('우리 동이 1·2·3위일 때 해당 시상대 카드만 지속 강조하고 접근성 이름에도 표시한다',()=>{
 for(const row of rows.slice(0,3)){
  const html=render(row.buildingId);
  const cards=[...html.matchAll(/<button[^>]*class="([^"]*podium-card[^"]*)"[^>]*aria-label="([^"]*)"/g)];
  const ownCards=cards.filter(card=>card[1].split(' ').includes('is-own'));
  assert.equal(ownCards.length,1);assert.match(ownCards[0][2],new RegExp(`${row.buildingNumber}동 · 우리 동`));
 }
 assert.doesNotMatch(render(null),/podium-card[^"<>]*is-own/);
});
