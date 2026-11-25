import {useEffect,useRef,useState,type FormEvent} from 'react';
import {httpsCallable} from 'firebase/functions';
import {onAuthStateChanged} from 'firebase/auth';
import {studioAuth as auth,studioFunctions as functions,studioGuest as guest} from '../lib/firebase';
import {TreeRenderer} from '../engine/TreeRenderer';
import {LevelUpCelebration,type Promotion} from './LevelUpCelebration';
import {promotionFor} from '../engine/PromotionScene.mjs';
import {TreeCustomizer} from './TreeCustomizer';
import {useTreeStyle} from '../lib/useTreeStyle';
import {GiftDrop} from './GiftDrop';
import {formatXp} from '../lib/experience.mjs';
import {Modal} from './Modal';
import {authorizeStudio,studioAuthMessage,studioTimeout} from '../lib/developerLogin.mjs';
import {AdminDashboard} from './AdminDashboard';
export function DeveloperGallery({dashboard=false}:{dashboard?:boolean}){
 const [session,setSession]=useState<number|null>(null),[checking,setChecking]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [level,setLevel]=useState(1),[building,setBuilding]=useState('101'),[promotion,setPromotion]=useState<Promotion|null>(null);
 const [previewGift,setPreviewGift]=useState(false),[giftOpened,setGiftOpened]=useState(false);
 const [customizing,setCustomizing]=useState(false);
 const [resetTarget,setResetTarget]=useState<{buildingId:string;requestId:string}|null>(null),[resetConfirm,setResetConfirm]=useState(''),[resetting,setResetting]=useState(false),[resetMessage,setResetMessage]=useState('');
 const treeStyle=useTreeStyle(session&&auth?.currentUser?`developer:${auth.currentUser.uid}`:null);
 const canvas=useRef<HTMLCanvasElement>(null),renderer=useRef<TreeRenderer|null>(null);
 const loginBusy=useRef(false),authTurn=useRef(0);
 useEffect(()=>{let alive=true,off=()=>{};
  void studioTimeout(guest()).then(()=>{if(!alive)return;if(!auth||!functions)throw new Error('서버 연결이 필요합니다.');off=onAuthStateChanged(auth,async user=>{
   if(!alive)return;
   const request=++authTurn.current;if(loginBusy.current)return;setSession(null);setPromotion(null);setChecking(true);
   try{if(user&&functions){const result=await httpsCallable(functions,'developerSession',{timeout:15000})({});if(alive&&request===authTurn.current&&!loginBusy.current)setSession((result.data as {expiresAt:number}).expiresAt);}}
   catch(error){if(alive&&request===authTurn.current&&!loginBusy.current&&(error as {code?:string}).code!=='functions/permission-denied')setError(studioAuthMessage(error));}
   finally{if(alive&&request===authTurn.current&&!loginBusy.current)setChecking(false);}
  });}).catch(error=>{if(alive&&!loginBusy.current){setChecking(false);setError(studioAuthMessage(error));}});
  return()=>{alive=false;authTurn.current++;off();};
 },[]);
 useEffect(()=>{if(!session)return;const timer=setTimeout(()=>{setSession(null);setPromotion(null);setError('인증 시간이 만료됐어요. 비밀번호로 다시 인증해 주세요.');},Math.max(0,session-Date.now()));return()=>clearTimeout(timer);},[session]);
 useEffect(()=>{if(!session||!canvas.current)return;const engine=new TreeRenderer(canvas.current,{actualLevel:10,viewingLevel:level,isOwnBuilding:false,style:treeStyle.style});renderer.current=engine;engine.start();return()=>{engine.stop();renderer.current=null;};},[session]);
 useEffect(()=>{renderer.current?.update({actualLevel:10,viewingLevel:level,isOwnBuilding:false,style:treeStyle.style});setPromotion(null);},[level,building,treeStyle.style]);
 useEffect(()=>{if(customizing)renderer.current?.stop();else if(session)renderer.current?.start();},[customizing,session]);
 async function login(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(loginBusy.current)return;
  const service=functions;
  if(!service){setError('관리자 서버 설정이 없습니다. 운영 주소로 다시 접속해 주세요.');return;}
  loginBusy.current=true;authTurn.current++;setBusy(true);setChecking(false);setError('');
  const password=String(new FormData(event.currentTarget).get('password')??'');
  try{const expiresAt=await authorizeStudio(password,{restore:()=>studioTimeout(guest()),isCurrent:uid=>auth?.currentUser?.uid===uid,
   authorize:async value=>{const {data}=await httpsCallable<{password:string},{developer:boolean;expiresAt:number}>(service,'authorizeDeveloper',{timeout:15000})({password:value});return data;}});
   setSession(expiresAt);history.replaceState(null,'',location.pathname);
  }catch(error){setError(studioAuthMessage(error));}finally{loginBusy.current=false;setChecking(false);setBusy(false);}
 }
 async function resetExp(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(!functions||!resetTarget||resetting||resetConfirm!==resetTarget.buildingId)return;
  setResetting(true);setResetMessage('');
  try{
   await httpsCallable(functions,'resetBuildingExp')({eventId:import.meta.env.VITE_EVENT_ID,...resetTarget});
   setResetMessage(`${resetTarget.buildingId}동 EXP를 0으로 초기화했어요.`);setResetTarget(null);setResetConfirm('');
  }catch(error){setResetMessage((error as {code?:string}).code==='functions/permission-denied'?'관리자 인증이 만료됐어요. 다시 인증해 주세요.':'초기화하지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.');}
  finally{setResetting(false);}
 }
 const buildings=[{start:101,count:24},{start:201,count:10},{start:301,count:21},{start:401,count:30}].flatMap(group=>Array.from({length:group.count},(_,i)=>String(group.start+i)));
 return <div className={`app-shell developer-shell ${dashboard?'admin-shell':''}`}><header className="app-header"><div><span className="eyebrow">{dashboard?'PRIVATE DASHBOARD':'PRIVATE STUDIO'}</span><h1>{dashboard?'포레온 운영 현황':'트리 개발자 모드'}</h1></div><div className="admin-header-links"><a className="text-button" href={dashboard?'/developer':'/admin'}>{dashboard?'개발자 모드':'운영 대시보드'}</a><a className="text-button" href="/">게임으로</a></div></header>
  {session&&customizing&&<TreeCustomizer actual={10} view={level} style={treeStyle.style} onChange={treeStyle.update} onClose={()=>setCustomizing(false)} storageFailed={treeStyle.storageFailed}/>}
  <main className="app-content">{checking?<p>접근 권한 확인 중…</p>:!session?<form className="developer-login" onSubmit={login}><span className="eyebrow">OWNER ACCESS</span><h2>{dashboard?'관리자 대시보드':'나만의 겨울 작업실'}</h2><p>비밀번호를 입력해 주세요.</p><label>비밀번호<input name="password" type="password" required autoComplete="current-password" maxLength={128}/></label><button className="primary-button" disabled={busy}>{busy?'확인 중…':dashboard?'대시보드 열기':'작업실 열기'}</button>{error&&<p role="alert">{error}</p>}</form>:<>
   {dashboard?<AdminDashboard expiresAt={session}/>:<><p className="preview-note">개발자 전용 · 모든 트리 해금 · 게임 경험치에 반영되지 않아요</p>
   <label className="developer-select">동 선택<select value={building} onChange={e=>setBuilding(e.target.value)}>{buildings.map(id=><option key={id} value={id}>{id}동</option>)}</select></label>
   <section className="developer-reset"><div><strong>{building}동 EXP 관리</strong><p>해당 동의 EXP와 레벨을 0 EXP · Lv.1로 되돌립니다. 개인 기여 기록은 유지됩니다.</p></div><button onClick={()=>{setResetTarget({buildingId:building,requestId:crypto.randomUUID()});setResetConfirm('');setResetMessage('');}}>동 EXP 초기화</button>{resetMessage&&!resetTarget&&<p role="status">{resetMessage}</p>}</section>
   <section className="gallery"><div className="tree-title"><h2>{building}동 · Lv.{level}</h2><span className="mode-badge own">ALL UNLOCKED</span></div><div className="tree"><canvas ref={canvas} aria-label={`${level}레벨 해금된 트리`}/>{previewGift&&<GiftDrop gift={{id:'preview',multiplier:5,durationSeconds:60}} onOpen={()=>{setPreviewGift(false);setGiftOpened(true);}}/>}</div>
   <div className="indicators">{Array.from({length:10},(_,i)=><button key={i} className={`achieved ${level===i+1?'selected':''}`} aria-label={`${i+1}레벨 보기`} aria-pressed={level===i+1} onClick={()=>setLevel(i+1)}>{i+1}</button>)}</div>
   <button className="customize-trigger" onClick={()=>setCustomizing(true)}>✧ 트리 꾸미기 · 모두 해금</button><p className="tree-hint">{promotionFor(level).title}</p><button className="primary-button" disabled={level===1} onClick={()=>setPromotion({id:Date.now(),level,buildingId:building})}>승급 연출 재생</button><button className="return-current" onClick={()=>{setPreviewGift(true);setGiftOpened(false);}}>선물 상자 미리보기</button>{giftOpened&&<p className="tree-hint" role="status">빛의 증폭 · 60초 동안 +{formatXp(5)} EXP · 연출 미리보기</p>}</section>
  </>}</>}</main>{session&&resetTarget&&<Modal title={`${resetTarget.buildingId}동 EXP 초기화`} onClose={()=>{if(!resetting)setResetTarget(null);}}><p>{resetTarget.buildingId}동의 경험치와 레벨을 초기화합니다. 되돌릴 수 없어요. 진행 중인 클릭은 초기화 후 다시 쌓일 수 있어요.</p><form className="reset-form" onSubmit={resetExp}><label>확인하려면 동 번호 {resetTarget.buildingId}을 입력하세요<input autoComplete="off" inputMode="numeric" value={resetConfirm} disabled={resetting} onChange={e=>setResetConfirm(e.target.value)}/></label><button className="primary-button" disabled={resetting||resetConfirm!==resetTarget.buildingId}>{resetting?'초기화 중…':'EXP 초기화하기'}</button></form>{resetMessage&&<p role="alert">{resetMessage}</p>}</Modal>}{promotion&&<LevelUpCelebration event={promotion} onClose={()=>setPromotion(null)}/>}</div>;
}
