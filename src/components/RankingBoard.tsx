import {useEffect,useRef,useState} from 'react';
import {rankRows,podiumRows} from '../lib/ranking.mjs';
import {formatXp} from '../lib/experience.mjs';
import {TreePreview} from './TreePreview';
export type RankingRow={buildingId:string;buildingNumber:number;complexId:string;score:number;actualLevel:number};
export function RankingBoard({rows,own,ready,onOpen,active=true}:{rows:RankingRow[];own:string|null;ready:boolean;onOpen:(id:string)=>void;active?:boolean}){
 const [filter,setFilter]=useState(''),[findOwn,setFindOwn]=useState(0),[highlight,setHighlight]=useState<string|null>(null);
 const root=useRef<HTMLDivElement>(null),ranked=rankRows(rows,filter);
 const {podium,list}=podiumRows(ranked),mine=own?rows.find(row=>row.buildingId===own):undefined;
 const tied=(rank:number)=>ranked.filter(row=>row.rank===rank).length>1;
 const rankText=(rank:number)=>`${tied(rank)?'공동 ':''}${rank}위`;
 const positions=podium.length===1?['center']:podium.length===2?['center','left']:['center','left','right'];
 useEffect(()=>{
  if(!findOwn||!own||!active||!ready)return;
  const target=root.current?.querySelector<HTMLButtonElement>(`[data-building="${CSS.escape(own)}"]`);
  target?.focus({preventScroll:true});
  target?.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  setHighlight(own);
  const timer=setTimeout(()=>setHighlight(null),2200);
  return()=>clearTimeout(timer);
 },[findOwn,filter,own,active,ready]);
 const showOwn=()=>{if(!mine)return;if(filter&&mine.complexId!==filter)setFilter('');setFindOwn(value=>value+1);};
 const ownLabel=(id:string)=>id===own?<small className="ranking-own-label">우리 동</small>:null;
 return <div className="ranking-board" ref={root} aria-busy={!ready}>
  <div className="ranking-board-heading"><h2>동별 랭킹</h2><button onClick={showOwn} disabled={!mine||!ready}>우리 동 보기 <span aria-hidden="true">⌖</span></button></div>
  <div className="rank-filters" role="group" aria-label="단지 필터">{['','1','2','3','4'].map(id=><button key={id} aria-pressed={filter===id} onClick={()=>{setFilter(id);setHighlight(null);setFindOwn(0);}}>{id?`${id}단지`:'전체'}</button>)}</div>
  {!ready?<p className="ranking-loading" role="status">랭킹을 불러오고 있어요.</p>:<>
   <p className="ranking-scope">{filter?`${filter}단지`:'전체'} · {ranked.length}개 동 <span>경험치 기준</span></p>
   {podium.length>0&&<div className="ranking-podium" role="group" aria-label={`${filter?`${filter}단지`:'전체'} 상위 순위 시상대`}>
    {podium.map((row,index)=><button key={row.buildingId} data-building={row.buildingId} className={`podium-card podium-rank-${row.rank} podium-${positions[index]} ${row.buildingId===own?'is-own':''} ${highlight===row.buildingId?'ranking-highlight':''}`} onClick={()=>onOpen(row.buildingId)} aria-label={`${rankText(row.rank)} ${row.buildingNumber}동${row.buildingId===own?' · 우리 동':''} · Lv.${row.actualLevel} · ${formatXp(row.score)} EXP · 트리 보기`}>
     {row.rank===1&&<svg className="podium-crown" viewBox="0 0 32 24" fill="none" aria-hidden="true"><path d="m4 7 6 5 6-9 6 9 6-5-3 13H7Z" fill="currentColor"/><path d="M8 23h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><circle cx="4" cy="5" r="2" fill="currentColor"/><circle cx="16" cy="2" r="2" fill="currentColor"/><circle cx="28" cy="5" r="2" fill="currentColor"/></svg>}
     <span className="podium-place">{rankText(row.rank)}</span>
     <TreePreview level={row.actualLevel} className="podium-tree"/>
     <strong className="podium-building">{row.buildingNumber}동</strong>
     <span className="podium-own-space">{ownLabel(row.buildingId)}</span>
     <span className="podium-level">Lv.{row.actualLevel}</span>
     <span className="podium-exp"><span>{formatXp(row.score)}</span><small>EXP</small></span>
    </button>)}
   </div>}
   <ol className="ranking-rows" aria-label={`${filter?`${filter}단지`:'전체'} 순위 목록`}>{list.map(row=><li key={row.buildingId}><button data-building={row.buildingId} className={`${row.buildingId===own?'is-own':''} ${highlight===row.buildingId?'ranking-highlight':''}`} onClick={()=>onOpen(row.buildingId)} aria-label={`${rankText(row.rank)} ${row.buildingNumber}동${row.buildingId===own?' · 우리 동':''} · Lv.${row.actualLevel} · ${formatXp(row.score)} EXP · 트리 보기`}>
    <span className="ranking-place"><strong>{row.rank}</strong>{tied(row.rank)&&<small>공동</small>}</span>
    <TreePreview level={row.actualLevel} className="ranking-thumbnail"/>
    <span className="ranking-building"><strong>{row.buildingNumber}동</strong><span>Lv.{row.actualLevel}</span>{ownLabel(row.buildingId)}</span>
    <span className="ranking-exp"><strong>{formatXp(row.score)}</strong><small>EXP</small></span>
   </button></li>)}</ol>
   {!ranked.length&&<p className="empty-state">이 단지의 랭킹을 준비하고 있어요.</p>}
  </>}
 </div>;
}
