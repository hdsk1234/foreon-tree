import {useEffect,useState} from 'react';
import {doc,onSnapshot} from 'firebase/firestore';
import {auth,db,projectId} from '../lib/firebase';
import {LocalClicks,CLICK_EVENT,clickDay,type ClickReceipt} from '../lib/LocalClicks.mjs';
import {formatXp} from '../lib/experience.mjs';
type Counts={score:number;taps:number};
type Activity={score?:number;tapCount?:number;activityVersion?:number;recentBatchIds?:string[];trackedScore?:number;trackingStartedAt?:number;lastBatchAt?:{toMillis:()=>number};daily?:Record<string,Counts>;buildings?:Record<string,Counts&{epoch:number;activeScore:number;activeTaps:number}>};
export function MyActivity({uid,eventId,own,active,teamScore,resetEpoch,onLogin,onJoin}:{uid:string|null;eventId:string;own:string|null;active:boolean;teamScore?:number;resetEpoch?:number;onLogin:()=>void;onJoin:()=>void}){
 const key=`${uid}:${eventId}`;
 const [snapshot,setSnapshot]=useState<{key:string;data:Activity}|null>(null),[error,setError]=useState<string|null>(null);
 const [localClicks,setLocalClicks]=useState<{key:string;data:{tapCount:number;daily:Record<string,number>}|null}|null>(null);
 useEffect(()=>{
  if(!active||!uid||!db||!eventId)return;
  let alive=true,ledger:LocalClicks|null=null;setError(null);
  try{ledger=new LocalClicks({projectId,uid,eventId});}catch{}
  const refresh=()=>{if(!alive||auth?.currentUser?.uid!==uid)return;try{setLocalClicks({key,data:ledger?.project()??null});}catch{setLocalClicks({key,data:null});}};
  const storage=(event:StorageEvent)=>{if(event.key===null||event.key.startsWith('foreon:xp:v1:')||event.key.startsWith(ledger?.prefix??'foreon:click-counts:v1:'))refresh();};
  const changed=(event:Event)=>{if((event as CustomEvent).detail===ledger?.scope)refresh();};
  refresh();addEventListener('storage',storage);addEventListener(CLICK_EVENT,changed);
  const midnight=setInterval(refresh,60000);
  const off=onSnapshot(doc(db,`events/${eventId}/userScores/${uid}`),{includeMetadataChanges:true},value=>{
   if(!alive||auth?.currentUser?.uid!==uid||(!value.exists()&&value.metadata.fromCache))return;
   const data:Activity=value.data()??{};
   const receipt:ClickReceipt={version:data.activityVersion??0,tapCount:data.tapCount??0,daily:Object.fromEntries(Object.entries(data.daily??{}).map(([day,count])=>[day,count.taps])),recentBatchIds:data.recentBatchIds??[]};
   try{ledger?.receive(receipt);}catch{ledger=null;}
   setSnapshot({key,data});refresh();
  },()=>{if(alive)setError(key);});
  return()=>{alive=false;off();clearInterval(midnight);removeEventListener('storage',storage);removeEventListener(CLICK_EVENT,changed);};
 },[active,uid,eventId,key]);
 const data=snapshot?.key===key?snapshot.data:null;
 const clicks=localClicks?.key===key?localClicks.data:null,clicksKnown=Boolean(clicks||data);
 const today=clickDay(Date.now()),clickTotal=clicks?.tapCount??data?.tapCount??0,todayClicks=clicks?.daily[today]??data?.daily?.[today]?.taps??0;
 const days=Array.from({length:7},(_,index)=>{
  const day=new Date(Date.parse(`${today}T00:00:00Z`)-(6-index)*86400000).toISOString().slice(0,10);
  return {day,...(data?.daily?.[day]??{score:0,taps:0}),taps:clicks?.daily[day]??data?.daily?.[day]?.taps??0};
 });
 const max=Math.max(1,...days.map(day=>day.taps)),current=own?data?.buildings?.[own]:undefined;
 const activeScore=current?.epoch===resetEpoch?current?.activeScore??0:0;
 const share=teamScore!==undefined?Math.min(100,teamScore>0?100*activeScore/teamScore:0):null;
 const dateText=(at:number)=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',hour:'numeric',minute:'2-digit'}).format(at);
 return <>
  <div className="page-heading"><span className="eyebrow">MY WINTER</span><h2>내가 밝힌 겨울</h2><p>{own?`${own}동과 함께 모은 작은 빛의 기록`:'작은 빛이 모여 우리 동의 겨울이 돼요'}</p></div>
  {!uid?<div className="activity-empty"><p>로그인하면 나의 기여도와 클릭 기록을 볼 수 있어요.</p><button className="primary-button" onClick={onLogin}>내 기록 시작하기</button></div>:!own?<div className="activity-empty"><p>함께할 동을 선택하고 첫 번째 빛을 모아 보세요.</p><button className="primary-button" onClick={onJoin}>우리 동 선택하기</button></div>:<>
   {error===key&&<p role="alert" className="activity-note">기록을 불러오지 못했어요. 연결을 확인해 주세요.</p>}
   <section className="activity-hero" aria-label="나의 누적 기여 경험치"><span>누적 기여 경험치</span><strong>{data?formatXp(data.score??0):'—'} <small>EXP</small></strong><p>지금까지 모든 동에 보탠 경험치</p></section>
   <div className="activity-metrics"><article><span>누적 클릭</span><strong>{clicksKnown?clickTotal.toLocaleString():'—'}<small>회</small></strong></article><article><span>오늘 클릭</span><strong>{clicksKnown?todayClicks.toLocaleString():'—'}<small>회</small></strong></article><article><span>오늘 모은 경험치</span><strong>{data?formatXp(data.daily?.[today]?.score??0):'—'}<small>EXP</small></strong></article><article><span>나의 기여도</span><strong>{data&&share!==null?share.toLocaleString('ko-KR',{maximumFractionDigits:1}):'—'}<small>%</small></strong></article></div>
   <section className="activity-week"><h3>최근 7일의 클릭</h3><div className="activity-chart" role="img" aria-label={days.map(day=>`${day.day}: ${day.taps}회`).join(', ')}>{days.map(day=><div key={day.day} className={day.day===today?'today':''}><strong>{clicksKnown?day.taps.toLocaleString():'—'}</strong><div className="activity-bar-track"><i style={{height:`${Math.max(day.taps?3:0,100*day.taps/max)}%`}}/></div><span>{day.day.slice(5).replace('-','.')}</span></div>)}</div></section>
   <section className="activity-buildings"><h3>동별 누적 기여</h3>{data?.buildings&&Object.keys(data.buildings).length?<ul>{Object.entries(data.buildings).sort(([,a],[,b])=>b.score-a.score).map(([building,value])=><li key={building}><span>{building}동{building===own&&<small>우리 동</small>}</span><strong>{formatXp(value.score)} <small>EXP</small></strong></li>)}</ul>:<p className="activity-note">첫 클릭으로 우리 동의 겨울을 밝혀 주세요.</p>}</section>
   <p className="activity-note">클릭·일별 활동·동별 기여는 {data?.trackingStartedAt?`${dateText(data.trackingStartedAt)}부터`:'기록 집계 시작일부터'} 표시돼요. 동 EXP가 초기화되어도 개인 누적 기록은 유지돼요. 나의 기여도는 현재 동의 초기화 이후 집계한 경험치 기준이에요.</p>
   {data?.lastBatchAt&&<p className="activity-note">마지막 활동 · {dateText(data.lastBatchAt.toMillis())}</p>}
  </>}
 </>;
}
