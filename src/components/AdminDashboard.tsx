import {useEffect,useRef,useState} from 'react';
import {httpsCallable} from 'firebase/functions';
import {onValue,ref} from 'firebase/database';
import {studioFunctions,presenceDatabase} from '../lib/firebase';
import {presenceSummary,type Connection} from '../lib/presence.mjs';
import {formatXp} from '../lib/experience.mjs';
type Account={uid:string;name:string;email:string;providers:string[];disabled:boolean;createdAt:number;lastSignInAt:number|null;buildingId:string|null;joined:boolean;score:number;taps:number|null};
type Report={at:number;accountsAt:number;partial:boolean;expiresAt:number;pageSize:number;summary:{total:number;guest:number;linked:number;disabled:number;today:number;participants:number};rows:Account[];nextOffset:number|null};
const date=(at:number|null)=>at?new Date(at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}):'—';
const pageName={tree:'트리',ranking:'랭킹',activity:'내 기록'};
const accountType=(row:Account)=>!row.providers.length?'게스트':row.providers.includes('google.com')?'Google':row.providers.join(', ');
export function AdminDashboard({expiresAt}:{expiresAt:number}){
 const [report,setReport]=useState<Report|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[offset,setOffset]=useState(0),[search,setSearch]=useState('');
 const [connections,setConnections]=useState<Record<string,Connection>|null>(null),[presenceError,setPresenceError]=useState(''),[connected,setConnected]=useState(false),[presenceReady,setPresenceReady]=useState(false);
 const position=useRef(0),loading=useRef(false),alive=useRef(true);
 async function load(next=position.current,refresh=false){
  if(loading.current||!studioFunctions||Date.now()>=expiresAt)return;loading.current=true;setBusy(true);setError('');
  try{
   const {data}=await httpsCallable<{eventId:string;offset:number;refresh:boolean},Report>(studioFunctions,'adminDashboard',{timeout:60000})({eventId:import.meta.env.VITE_EVENT_ID,offset:next,refresh});
   if(!alive.current)return;position.current=next;setOffset(next);setReport(data);
  }catch(error){if(alive.current)setError((error as {code?:string}).code==='functions/permission-denied'?'관리자 인증이 만료됐습니다. 다시 인증해 주세요.':(error as {code?:string}).code==='functions/resource-exhausted'?'조회가 너무 빨라요. 잠시 후 다시 눌러 주세요.':'계정 현황을 가져오지 못했습니다. 잠시 후 새로고침해 주세요.');}
  finally{loading.current=false;if(alive.current)setBusy(false);}
 }
 useEffect(()=>{alive.current=true;void load();const timer=setInterval(()=>{if(document.visibilityState==='visible')void load();},5*60000);return()=>{alive.current=false;clearInterval(timer);};},[expiresAt]);
 useEffect(()=>{
  if(!report)return;const database=presenceDatabase(true);if(!database)return;
  const off=onValue(ref(database,'connections'),snapshot=>{setConnections(snapshot.val());setPresenceReady(true);setPresenceError('');},()=>{setConnections(null);setPresenceReady(false);setPresenceError('접속 현황 권한을 확인하지 못했습니다. 새로고침하거나 다시 인증해 주세요.');});
  const status=onValue(ref(database,'.info/connected'),snapshot=>setConnected(snapshot.val()===true));
  return()=>{off();status();};
 },[Boolean(report),presenceError]);
 const presence=presenceSummary(connections),byUid=new Map(report?.rows.map(row=>[row.uid,row])??[]);
 const accounts=report?.rows.filter(row=>`${row.uid} ${row.email} ${row.name} ${row.buildingId??''} ${accountType(row)}`.toLowerCase().includes(search.trim().toLowerCase()))??[];
 const metric=(label:string,value:number|undefined,note?:string)=><article className="admin-metric"><small>{label}</small><strong>{value===undefined?'—':value.toLocaleString()}</strong>{note&&<span>{note}</span>}</article>;
 return <div className="admin-dashboard">
  <div className="admin-heading"><div><h2>운영 대시보드</h2><p>접속은 실시간 · 계정 현황은 5분마다 갱신</p></div><button className="admin-refresh" disabled={busy} onClick={()=>{setPresenceError('');void load(position.current,true);}}>{busy?'조회 중…':'새로고침'}</button></div>
  {error&&<p className="admin-error" role="alert">{error}</p>}
  <section className="admin-section"><div className="admin-section-heading"><h3>실시간 접속 현황</h3><span className={`admin-live ${connected&&!presenceError?'is-live':''}`}>{presenceError?'연결 오류':connected?'실시간 연결':'연결 중'}</span></div>
   <div className="admin-metrics">{metric('접속 브라우저',connected&&presenceReady&&!presenceError?presence.browsers:undefined,'같은 브라우저의 탭은 중복 제거')}{metric('활성 브라우저',connected&&presenceReady&&!presenceError?presence.active:undefined,'현재 화면을 보고 있는 브라우저')}{metric('열린 탭',connected&&presenceReady&&!presenceError?presence.tabs:undefined)}{metric('로그인 계정',connected&&presenceReady&&!presenceError?presence.accounts:undefined)}{metric('비로그인 브라우저',connected&&presenceReady&&!presenceError?presence.visitors:undefined)}</div>
   <p className="admin-note">현재 버전에서 수집한 연결입니다. 비로그인도 포함하며 관리자 화면은 제외합니다. 네트워크 단절은 서버가 연결 종료를 감지한 뒤 반영됩니다. 브라우저 수는 실제 사람 수와 다를 수 있습니다.</p>
   {presenceError&&<p className="admin-error" role="alert">{presenceError}</p>}
   <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>접속</th><th>계정 / 방문자</th><th>화면</th><th>연결 시각</th><th>최근 신호</th></tr></thead><tbody>{presence.rows.sort((a,b)=>b.updatedAt-a.updatedAt).map(row=><tr key={row.id}><td><span className={`admin-status ${row.active?'is-active':''}`}>{row.active?'활성':'백그라운드'}</span></td><td>{row.uid?(byUid.get(row.uid)?.email||byUid.get(row.uid)?.name||`로그인 · ${row.uid.slice(-8)}`):`방문자 · ${row.browserId.slice(-6)}`}<small>{row.uid&&byUid.get(row.uid)?.buildingId?`${byUid.get(row.uid)!.buildingId}동`:`탭 ${row.id.slice(-6)}`}</small></td><td>{pageName[row.page]??'—'}</td><td>{date(row.startedAt)}</td><td>{date(row.updatedAt)}</td></tr>)}</tbody></table>{!presence.rows.length&&<p className="admin-empty">{connected?'현재 접속한 게임 화면이 없습니다.':'접속 현황에 연결하고 있습니다.'}</p>}</div>
  </section>
  <section className="admin-section"><div className="admin-section-heading"><h3>계정 현황</h3><span>{report?`${date(report.accountsAt)} 기준`:'조회 중'}</span></div>
   <div className="admin-metrics">{metric(report?.partial?'조회된 게임 계정':'전체 게임 계정',report?.summary.total)}{metric('게스트',report?.summary.guest)}{metric('연결된 계정',report?.summary.linked,'Google 등 로그인 수단 연결')}{metric('오늘 생성',report?.summary.today,'한국 시간 기준')}{metric('이벤트 참가',report?.summary.participants)}</div>
   <p className="admin-note">계정 정보는 최대 5분간 캐시하며 수동 새로고침은 최소 30초 간격으로 갱신합니다. 관리자 인증에 사용된 계정은 계정 통계·목록에서 제외합니다. 게임 계정에는 동을 아직 선택하지 않은 게스트도 포함합니다. 최근 로그인은 Firebase 인증 시각으로 최근 플레이 시각과 다를 수 있습니다.{report?.partial?' 최초 10,000개에 한해 부분 집계했습니다.':''}</p>
   <label className="admin-search">현재 페이지 검색<input type="search" placeholder="동 · 이름 · 이메일 · UID" value={search} onChange={event=>setSearch(event.target.value)}/></label>
   <div className="admin-table-wrap"><table className="admin-table admin-accounts"><thead><tr><th>계정</th><th>로그인 방식 / 상태</th><th>참여 동</th><th>개인 기록</th><th>생성 / 최근 로그인</th></tr></thead><tbody>{accounts.map(row=><tr key={row.uid}><td><strong>{row.name||row.email||'게스트'}</strong>{row.name&&row.email&&<small>{row.email}</small>}<small className="admin-uid">{row.uid}</small></td><td>{accountType(row)}<small>{row.disabled?'사용 중지':'정상'}</small></td><td>{row.buildingId?`${row.buildingId}동`:'미선택'}<small>{row.joined?'이벤트 참가':'이벤트 미참가'}</small></td><td>{formatXp(row.score)} EXP<small>{row.taps===null?'클릭 기록 없음':`${row.taps.toLocaleString()}회 클릭`}</small></td><td>{date(row.createdAt)}<small>{date(row.lastSignInAt)}</small></td></tr>)}</tbody></table>{!accounts.length&&<p className="admin-empty">{report?'표시할 계정이 없습니다.':'계정을 조회하고 있습니다.'}</p>}</div>
   <div className="admin-pagination"><button disabled={busy||offset===0} onClick={()=>void load(Math.max(0,offset-(report?.pageSize??25)))}>이전</button><span>{report?.rows.length?`${offset+1}–${offset+report.rows.length}`:'0'} / {report?.summary.total??'—'}개</span><button disabled={busy||report?.nextOffset==null} onClick={()=>void load(report!.nextOffset!)}>다음</button></div>
  </section>
 </div>;
}
