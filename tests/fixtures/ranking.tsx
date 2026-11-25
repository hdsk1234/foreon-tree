import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {RankingBoard} from '/src/components/RankingBoard';
import {TreePreview} from '/src/components/TreePreview';
import {levelForScore} from '/src/lib/experience.mjs';
const params=new URLSearchParams(location.search);
const buildings=[{start:101,count:24},{start:201,count:10},{start:301,count:21},{start:401,count:30}].flatMap((c,complex)=>Array.from({length:c.count},(_,i)=>({buildingId:String(c.start+i),buildingNumber:c.start+i,complexId:String(complex+1)})));
function Fixture(){
 const [scenario,setScenario]=useState(params.get('scenario')??'unique'),[own,setOwn]=useState(params.get('own')==='podium'?buildings[0].buildingId:buildings.at(-1)!.buildingId),[target,setTarget]=useState<string|null>(null);
 const rows=buildings.map((row,index)=>{const score=scenario==='ties'?(index===0?850000:0):scenario==='zero'?0:Math.round((85-index)**6*.01);return {...row,score,actualLevel:levelForScore(score)};});
 const selected=rows.find(row=>row.buildingId===target);
 return <><div className="fixture-tools">검수용 데이터 · 운영 기록에 영향을 주지 않아요<select aria-label="검수 시나리오" value={scenario} onChange={e=>setScenario(e.target.value)}><option value="unique">단독 TOP 3</option><option value="ties">단독 1위 + 공동 2위 84개 동</option><option value="zero">모두 공동 1위</option></select><select aria-label="검수 우리 동" value={own} onChange={e=>setOwn(e.target.value)}><option value={buildings.at(-1)!.buildingId}>리스트의 우리 동</option><option value={buildings[0].buildingId}>시상대의 우리 동</option><option value="">로그아웃</option></select></div><div className="app-shell"><header className="app-header"><a className="brand" href="#"><span className="brand-mark">✧</span><div><span className="eyebrow">FOREON TREE</span><h1>포레온 트리 키우기</h1></div></a><button className="icon-button account-trigger" aria-label="계정 메뉴">👤</button></header><main className="app-content">{selected?<section className="fixture-tree"><h2>{selected.buildingNumber}동의 트리</h2><p>Lv.{selected.actualLevel}</p><TreePreview level={selected.actualLevel}/><button onClick={()=>setTarget(null)}>랭킹으로 돌아가기</button></section>:<RankingBoard rows={rows} own={own||null} ready onOpen={setTarget}/>}</main><nav className="bottom-nav" aria-label="메인 메뉴"><button onClick={()=>setTarget(own||rows[0].buildingId)}><span>✧</span><strong>트리</strong></button><button aria-current={!selected?'page':undefined} onClick={()=>setTarget(null)}><span>♜</span><strong>랭킹</strong></button><button><span>▥</span><strong>내 기록</strong></button></nav></div></>;
}
flushSync(()=>createRoot(document.getElementById('root')!).render(<Fixture/>));
if(params.has('verify')){
 const report=document.getElementById('verification')!,passed:string[]=[];
 const publish=()=>{if(parent!==window)parent.postMessage({kind:'ranking-verification',status:report.dataset.status,text:report.textContent},location.origin);};
 const wait=()=>new Promise(resolve=>setTimeout(resolve,120));
 const check=(ok:unknown,label:string)=>{if(!ok)throw new Error(label);passed.push(label);};
 const click=(el:Element|null)=>{if(!(el instanceof HTMLElement))throw new Error('Missing button');flushSync(()=>el.click());};
 const select=(label:string,value:string)=>{const el=document.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`)!;el.value=value;flushSync(()=>el.dispatchEvent(new Event('change',{bubbles:true})));};
 const filter=(name:string)=>Array.from(document.querySelectorAll('.rank-filters button')).find(el=>el.textContent===name)!;
 try{
  await wait();
  check(document.querySelectorAll('.podium-card').length===3,'단독 TOP 3 표시');
  check(document.querySelectorAll('[data-building]').length===85,'85개 동 중복·누락 없음');
  const podium=Array.from(document.querySelectorAll<HTMLElement>('.podium-card')).sort((a,b)=>a.getBoundingClientRect().left-b.getBoundingClientRect().left);
  check(podium.map(el=>el.querySelector('.podium-place')!.textContent).join(',')==='2위,1위,3위','좌 2위·중앙 1위·우 3위');
  check(Math.round(podium[0].getBoundingClientRect().top-podium[1].getBoundingClientRect().top)===20,'1위 20px 높이 차이');
  check(document.documentElement.scrollWidth<=innerWidth,'360px 가로 넘침 없음');
  check(Array.from(document.querySelectorAll<HTMLElement>('.podium-card')).every(el=>{const name=el.querySelector('.podium-building')!.getBoundingClientRect(),exp=el.querySelector('.podium-exp')!.getBoundingClientRect();return name.bottom<exp.top&&exp.right<=el.getBoundingClientRect().right;}),'동 이름·EXP 겹침 없음');
  click(filter('1단지'));await wait();check(document.querySelectorAll('[data-building]').length===24,'필터는 시상대·리스트 모두 반영');
  click(document.querySelector('.ranking-board-heading button'));await wait();
  check(filter('전체').getAttribute('aria-pressed')==='true','숨겨진 우리 동은 전체로 전환');
  check(document.activeElement?.getAttribute('data-building')===buildings.at(-1)!.buildingId,'우리 동 행 스크롤·포커스');
  const last=document.querySelector<HTMLElement>('.ranking-rows li:last-child button')!;last.scrollIntoView({block:'end',behavior:'instant'});window.scrollBy(0,1000);await wait();
  check(last.getBoundingClientRect().bottom<=document.querySelector('.bottom-nav')!.getBoundingClientRect().top,'마지막 행 하단바 가림 없음');
  click(last);await wait();check(document.querySelector('.fixture-tree h2')?.textContent===`${buildings.at(-1)!.buildingNumber}동의 트리`,'리스트에서 선택한 트리 열기');
  click(document.querySelector('.fixture-tree button'));await wait();click(document.querySelector('.podium-card'));await wait();check(Boolean(document.querySelector('.fixture-tree')),'시상대에서 트리 열기');
  click(document.querySelector('.fixture-tree button'));await wait();
  select('검수 우리 동',buildings[0].buildingId);await wait();click(document.querySelector('.ranking-board-heading button'));await wait();check(document.activeElement?.closest('.podium-card'),'시상대 우리 동 이동·라벨');
  select('검수 시나리오','ties');await wait();check(document.querySelectorAll('.podium-card').length===1&&document.querySelectorAll('.ranking-rows li').length===84,'단독 1위 + 공동 2위 84개 모두 표시');
  check(Array.from(document.querySelectorAll('.ranking-place strong')).every(el=>el.textContent==='2'),'공동 순위 유지');
  select('검수 시나리오','zero');await wait();check(!document.querySelector('.podium-card')&&document.querySelectorAll('.ranking-rows li').length===85,'전체 공동 1위 누락 없음');
  select('검수 시나리오','unique');select('검수 우리 동','');await wait();check(!document.querySelector('.ranking-own-label'),'로그아웃 우리 동 라벨 숨김');
  select('검수 우리 동',buildings.at(-1)!.buildingId);window.scrollTo(0,0);
  report.dataset.status='passed';report.textContent=`PASS ${passed.length}\n${passed.join('\n')}`;publish();
 }catch(error){report.dataset.status='failed';report.textContent=`FAIL ${error}\n${passed.join('\n')}`;publish();}
}
