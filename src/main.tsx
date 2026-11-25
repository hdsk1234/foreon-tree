import {useCallback,useEffect,useRef,useState,type PointerEvent} from 'react';
import {createRoot} from 'react-dom/client';
import {doc,onSnapshot} from 'firebase/firestore';
import {httpsCallable} from 'firebase/functions';
import {onAuthStateChanged} from 'firebase/auth';
import {TreeRenderer} from './engine/TreeRenderer';
import {galleryTransition,canScore} from './engine/gallery.mjs';
import {promotionFor} from './engine/PromotionScene.mjs';
import {LevelUpCelebration,type Promotion} from './components/LevelUpCelebration';
import {DeveloperGallery} from './components/DeveloperGallery';
import {Modal} from './components/Modal';
import {AuthChoices} from './components/AuthChoices';
import {MyActivity} from './components/MyActivity';
import {GiftDrop} from './components/GiftDrop';
import {TreeCustomizer} from './components/TreeCustomizer';
import {useTreeStyle} from './lib/useTreeStyle';
import {RewardStatus} from './components/RewardStatus';
import {GameTips} from './components/GameTips';
import {RankingBoard} from './components/RankingBoard';
import type {ComboState} from './lib/combo.mjs';
import {auth,db,functions,guest,loginGoogle,linkGoogle,configured,logout,projectId} from './lib/firebase';
import {ScoreQueue} from './lib/ScoreQueue';
import type {PersistentProjection} from './lib/PersistentScoreQueue.mjs';
import {newerScore} from './lib/PersistentOutbox.mjs';
import type {Rewards,BatchReceipt} from './lib/OptimisticScore.mjs';
import {levelForScore,growthForScore} from './lib/progress';
import {formatXp} from './lib/experience.mjs';
import {rankRows} from './lib/ranking.mjs';
import {usePresence} from './lib/usePresence';
import complexes from '../functions/src/buildings.json';
import './style.css';
type Row={buildingId:string;buildingNumber:number;complexId:string;score:number;revision?:number;actualLevel:number;rank:number};
type Tab='tree'|'ranking'|'activity';
type Toast={id:number;text:string;kind:'info'|'level'|'error';buildingId?:string};
const initialRows:Row[]=complexes.flatMap(c=>Array.from({length:c.count},(_,i)=>({buildingId:String(c.start+i),buildingNumber:c.start+i,complexId:c.id,score:0,actualLevel:1,rank:1})));
const tabFromHash=():Tab=>location.hash==='#ranking'?'ranking':location.hash==='#activity'?'activity':'tree';
function App(){
 const [customizing,setCustomizing]=useState(false);
 const [authReady,setAuthReady]=useState(false);
 const [signingIn,setSigningIn]=useState<'guest'|'google'|null>(null),[authError,setAuthError]=useState(''),[isGuest,setIsGuest]=useState(true);
 const authBusy=useRef(false);
 const [authOpen,setAuthOpen]=useState(false);
 const joinAfterAuth=useRef(false);
 const [participantReady,setParticipantReady]=useState(false),[joinOpen,setJoinOpen]=useState(false);
 const identity=useRef<string|null>(null);
 const participantIdentity=useRef({uid:'',buildingId:''});
 const [teamScores,setTeamScores]=useState<Record<string,{score:number;revision:number;resetEpoch:number;known:boolean}>>({});
 const [uid,setUid]=useState<string|null>(null),[complex,setComplex]=useState(''),[building,setBuilding]=useState('');
 const [own,setOwn]=useState<string|null>(null),[target,setTarget]=useState('101');
 const [rows,setRows]=useState(initialRows),[view,setView]=useState(1),[loaded,setLoaded]=useState(false);
 const [tab,setTab]=useState<Tab>(tabFromHash);
 usePresence(uid,tab,authReady);
 const [joining,setJoining]=useState(false),[accountOpen,setAccountOpen]=useState(false);
 const [changing,setChanging]=useState(false),[changeOpen,setChangeOpen]=useState(false),[nextBuilding,setNextBuilding]=useState(''),[nextComplex,setNextComplex]=useState('');
 const [rewardState,setRewardState]=useState<Rewards|undefined>(),[buildingIds,setBuildingIds]=useState<string[]>([]),[opening,setOpening]=useState(false);
 const [comboState,setComboState]=useState<ComboState|undefined>();
 const [tapFx,setTapFx]=useState<{id:number;x:number;y:number;xp:number}|null>(null);
 const [toast,setToast]=useState<Toast|null>(null),[promotion,setPromotion]=useState<Promotion|null>(null);
 const [localScore,setLocalScore]=useState<(PersistentProjection&{key:string})|null>(null);
 const sequence=useRef(0),account=useRef<HTMLDivElement>(null),accountButton=useRef<HTMLButtonElement>(null);
 const canvas=useRef<HTMLCanvasElement>(null),renderer=useRef<TreeRenderer|null>(null),queue=useRef<ScoreQueue|null>(null);
 const eventId=import.meta.env.VITE_EVENT_ID,scoreKey=`${uid}:${eventId}:${own}`;
 const treeStyle=useTreeStyle(uid&&eventId&&own?JSON.stringify([uid,eventId,own]):null);
 const ownProjection=localScore?.key===scoreKey?localScore:null;
 const visibleRows=rows.map(row=>{
  const live=teamScores[row.buildingId];
  const source=row.buildingId===own&&ownProjection?.known?ownProjection:live?.known?live:null;
  return source?{...row,score:source.score,revision:source.revision,actualLevel:levelForScore(source.score)}:{...row,actualLevel:levelForScore(row.score)};
 });
 const currentRow=visibleRows.find(row=>row.buildingId===target),total=currentRow?.score??0,actual=currentRow?.actualLevel??1;
 const isOwnBuilding=target===own,future=view>actual,growth=growthForScore(total);
 const allRanked=rankRows(visibleRows);
 const treeReady=Boolean((target===own&&ownProjection?.known)||teamScores[target]?.known||loaded);
 const scoreText=treeReady?formatXp(total):'—';
 const currentStanding=loaded&&treeReady?allRanked.find(row=>row.buildingId===target):undefined;
 const sharedRank=currentStanding&&allRanked.some(row=>row.buildingId!==target&&row.score===currentStanding.score);
 const standingText=currentStanding?`${sharedRank?'공동 ':''}${currentStanding.rank}위`:'—';
 const scope=`${scoreKey}:${target}`;
 useEffect(()=>setCustomizing(false),[scoreKey,target]);
 const previous=useRef({actual,target,scope,ready:false});
 const notify=useCallback((text:string,kind:Toast['kind']='info',buildingId?:string)=>{
  setToast({id:++sequence.current,text,kind,buildingId});
 },[]);
 const navigate=(next:Tab)=>{
  setPromotion(null);setAccountOpen(false);setTab(next);
  if(location.hash!==`#${next}`)location.hash=next;
  window.scrollTo({top:0,behavior:'instant'});
 };
 const openBuilding=(id:string)=>{setTarget(id);navigate('tree');};
 useEffect(()=>{
  const sync=()=>{setTab(tabFromHash());setPromotion(null);window.scrollTo({top:0,behavior:'instant'});};
  addEventListener('hashchange',sync);return()=>removeEventListener('hashchange',sync);
 },[]);
 useEffect(()=>{
  if(!toast)return;const id=toast.id;
  const timer=setTimeout(()=>setToast(current=>current?.id===id?null:current),toast.kind==='level'?7000:5000);
  return()=>clearTimeout(timer);
 },[toast]);
 useEffect(()=>{
  if(!accountOpen)return;
  const outside=(event:globalThis.PointerEvent)=>{if(!account.current?.contains(event.target as Node))setAccountOpen(false);};
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setAccountOpen(false);accountButton.current?.focus();}};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
 },[accountOpen]);
 useEffect(()=>{
  if(!auth){setAuthReady(true);return;}
  let active=true;
  const off=onAuthStateChanged(auth,user=>{
   if(!active)return;const next=user?.uid??null;
   if(identity.current!==next){identity.current=next;participantIdentity.current={uid:'',buildingId:''};setUid(next);setOwn(null);setTarget('101');setParticipantReady(false);setJoinOpen(false);setAccountOpen(false);setLocalScore(null);setRewardState(undefined);setComboState(undefined);setBuildingIds([]);setChangeOpen(false);setPromotion(null);}
   setIsGuest(user?.isAnonymous??true);setAuthError('');setAuthReady(true);
  });
  return()=>{active=false;off();};
 },[notify]);
 useEffect(()=>{
  if(!db||!authReady||!uid||!eventId)return;
  let active=true;
  const off=onSnapshot(doc(db,`events/${eventId}/participants/${uid}`),{includeMetadataChanges:true},snapshot=>{
   if(!active||auth?.currentUser?.uid!==uid)return;
   const id=snapshot.data()?.buildingId;
   setRewardState(snapshot.data()?.rewards);
   setComboState(snapshot.data()?.combos?.[id]);
   const ids=snapshot.data()?.buildingIds??(id?[id]:[]);setBuildingIds(previous=>JSON.stringify(previous)===JSON.stringify(ids)?previous:ids);
   if(id){setParticipantReady(true);setJoinOpen(false);setOwn(id);if(participantIdentity.current.uid!==uid||participantIdentity.current.buildingId!==id){participantIdentity.current={uid,buildingId:id};setTarget(id);}}
   else if(!snapshot.metadata.fromCache){setParticipantReady(true);setOwn(null);}
  },()=>{if(active)notify('참여 정보를 불러오지 못했어요. 잠시 후 다시 접속해 주세요.','error');});
  return()=>{active=false;off();};
 },[authReady,uid,eventId,notify]);
 useEffect(()=>{
  if(uid)setAuthOpen(false);
  if(uid&&participantReady&&joinAfterAuth.current){joinAfterAuth.current=false;if(!own){setComplex('');setBuilding('');setJoinOpen(true);}}
 },[uid,participantReady,own]);
 useEffect(()=>{
  if(!db||!authReady||!eventId)return;
  return onSnapshot(doc(db,`events/${eventId}/results/leaderboard`),snapshot=>{
   if(snapshot.exists()){setRows(snapshot.data().rows as Row[]);setLoaded(true);}
  },()=>notify('랭킹을 불러오지 못했어요. 연결을 확인해 주세요.','error'));
 },[authReady,uid,eventId,notify]);
 useEffect(()=>{
  if(previous.current.scope!==scope||actual<previous.current.actual)setPromotion(null);
  const transition=galleryTransition(previous.current,{scope,actual,ready:treeReady},view);
  if(transition.viewingLevel!==view)setView(transition.viewingLevel);
  if(transition.levelUp){
   const id=++sequence.current;
   if(tab==='tree'&&transition.celebrate)setPromotion({id,level:actual,buildingId:target});
   else notify(`${target}동이 Lv.${actual}로 성장했어요!`,'level',target);
  }
  previous.current={actual,target,scope,ready:treeReady};
 },[actual,target,scope,treeReady,notify]);
 useEffect(()=>{
  if(!canvas.current)return;
  const engine=new TreeRenderer(canvas.current,{actualLevel:actual,viewingLevel:view,isOwnBuilding,style:isOwnBuilding?treeStyle.style:undefined});renderer.current=engine;
  return()=>{engine.stop();renderer.current=null;};
 },[]);
 useEffect(()=>{renderer.current?.update({actualLevel:actual,viewingLevel:view,isOwnBuilding,style:isOwnBuilding?treeStyle.style:undefined});},[actual,view,isOwnBuilding,treeStyle.style]);
 useEffect(()=>{
  const sync=()=>{if(tab==='tree'&&!customizing&&!authOpen&&!joinOpen&&!document.hidden)renderer.current?.start();else renderer.current?.stop();};
  sync();document.addEventListener('visibilitychange',sync);
  return()=>{document.removeEventListener('visibilitychange',sync);renderer.current?.stop();};
 },[tab,customizing,authOpen,joinOpen]);
 const listenTeam=useCallback((buildingId:string)=>{
  if(!db||!authReady||!eventId||(!uid&&buildingId!=='101'))return()=>{};
  let active=true;
  const off=onSnapshot(doc(db,`events/${eventId}/teamScores/${buildingId}`),{includeMetadataChanges:true},snapshot=>{
   if(!active||(auth?.currentUser?.uid??null)!==uid)return;
   if(!snapshot.exists()&&snapshot.metadata.fromCache)return;
   const value={score:snapshot.data()?.score??0,revision:snapshot.data()?.revision??0,resetEpoch:snapshot.data()?.resetEpoch??0,known:true};
   setTeamScores(previous=>{
    const old=previous[buildingId];
    if(old?.known&&old.score===value.score&&old.revision===value.revision)return previous;
    return {...previous,[buildingId]:value};
   });
  },()=>{if(active)notify('경험치를 불러오지 못했어요. 연결을 확인해 주세요.','error');});
  return()=>{active=false;off();};
 },[authReady,uid,eventId,notify]);
 useEffect(()=>{if(own)return listenTeam(own);},[own,listenTeam]);
 useEffect(()=>{if(tab==='tree'&&target!==own)return listenTeam(target);},[tab,target,own,listenTeam]);
 useEffect(()=>{
  if(!functions||!authReady||!uid||!own||!eventId)return;
  const send=httpsCallable(functions,'submitScoreBatch',{timeout:15000}),key=`${uid}:${eventId}:${own}`;
  const live=teamScores[own],rank=loaded?rows.find(row=>row.buildingId===own):undefined;
  const initial=live?.known?{...live,rewards:rewardState,combo:comboState}:rank?{score:rank.score,revision:rank.revision??0,rewards:rewardState,combo:comboState}:undefined;
  const q=new ScoreQueue({projectId,uid,eventId,buildingId:own,initial,
   isCurrent:()=>auth?.currentUser?.uid===uid,
   send:batch=>send({eventId,...batch}).then(result=>result.data as BatchReceipt),
   status:text=>notify(text,'error'),changed:state=>setLocalScore({...state,key})});queue.current=q;
  return()=>{q.dispose();queue.current=null;};
 },[authReady,uid,own,eventId,notify]);
 useEffect(()=>{
  if(!functions||!authReady||!uid||!own||!eventId)return;
  const send=httpsCallable(functions,'submitScoreBatch',{timeout:15000});
  const queues=buildingIds.filter(id=>id!==own).map(buildingId=>new ScoreQueue({projectId,uid,eventId,buildingId,
   initial:{score:0,revision:0},isCurrent:()=>auth?.currentUser?.uid===uid,
   send:batch=>send({eventId,...batch}).then(result=>result.data as BatchReceipt),status:()=>{},changed:()=>{}}));
  return()=>queues.forEach(q=>q.dispose());
 },[authReady,uid,own,eventId,buildingIds]);
 useEffect(()=>{
  const q=queue.current;if(!q)return;
  const live=teamScores[q.buildingId],rank=loaded?rows.find(value=>value.buildingId===q.buildingId):undefined;
  let value=live?.known?{score:live.score,revision:live.revision}:undefined;
  if(rank){const ranked={score:rank.score,revision:rank.revision??0};if(!value||newerScore(ranked,value))value=ranked;}
  if(value)q.receive({...value,rewards:rewardState,combo:comboState});
 },[teamScores,rows,loaded,uid,own,eventId,rewardState,comboState]);
 async function switchBuilding(){
  if(!functions||!own||changing||nextBuilding===own||!initialRows.some(row=>row.buildingId===nextBuilding&&row.complexId===nextComplex))return;setChanging(true);
  try{await queue.current?.settle();await httpsCallable(functions,'changeBuilding')({eventId,buildingId:nextBuilding});setChangeOpen(false);setTarget(nextBuilding);notify(`${nextBuilding}동의 겨울에 함께해요.`);}
  catch(error){notify((error as {message?:string}).message?.includes('30초')?'동 변경은 30초 후 다시 할 수 있어요.':'동을 변경하지 못했어요. 연결을 확인해 주세요.','error');}finally{setChanging(false);}
 }
 async function receiveGift(){
  const gift=ownProjection?.gift;if(!functions||!gift||opening)return;setOpening(true);
  try{const result=await httpsCallable(functions,'claimGift')({eventId,giftId:gift.id});const rewards=(result.data as {rewards:Rewards}).rewards;queue.current?.receive({score:ownProjection!.confirmedScore,revision:ownProjection!.revision,rewards});await queue.current?.settle();setRewardState(rewards);notify(`60초 선물 ×${gift.multiplier}! 콤보와 함께 적용돼요.`);}
  catch{notify('선물을 열지 못했어요. 다시 눌러 주세요.','error');}finally{setOpening(false);}
 }
 async function join(){
  if(!functions||!uid||!eventId||!participantReady||own||joining||!initialRows.some(row=>row.buildingId===building&&row.complexId===complex))return;setJoining(true);
  try{const result=await httpsCallable(functions,'joinEvent')({eventId,buildingId:building});
   if(identity.current!==uid)return;
   const id=(result.data as {buildingId:string}).buildingId;setOwn(id);setTarget(id);setJoinOpen(false);notify(`${id}동의 겨울에 함께해요.`);
  }catch{if(identity.current===uid)notify('참가하지 못했어요. 잠시 후 다시 시도해 주세요.','error');}finally{setJoining(false);}
 }
 const chooseBuilding=()=>{
  setComplex('');setBuilding('');
  if(!uid){joinAfterAuth.current=true;setAuthOpen(true);return;}
  if(!participantReady){joinAfterAuth.current=true;return;}
  setJoinOpen(true);
 };
 const collect=(event:PointerEvent<HTMLCanvasElement>)=>{
  if(!own){chooseBuilding();return;}
  const xp=queue.current?.xpPerTap()??1;
  if(opening||!canScore(actual,view,isOwnBuilding)||!queue.current?.touch())return;
  const rect=event.currentTarget.getBoundingClientRect();renderer.current?.tap(event.clientX-rect.left,event.clientY-rect.top);
  setTapFx({id:++sequence.current,x:Math.max(80,Math.min(rect.width-80,event.clientX-rect.left)),y:event.clientY-rect.top,xp});
 };
 async function leave(){
  try{await logout();setAccountOpen(false);notify('로그아웃했어요.');}catch{notify('로그아웃하지 못했어요. 다시 시도해 주세요.','error');}
 }
 async function startSession(method:'guest'|'google',link=false){
  if(authBusy.current)return;authBusy.current=true;setSigningIn(method);setAuthError('');
  try{
   if(method==='guest')await guest();else if(link)await linkGoogle();else await loginGoogle();
   setIsGuest(auth?.currentUser?.isAnonymous??true);setAccountOpen(false);
  }catch(error){
   const code=(error as {code?:string}).code;
   const message=code==='auth/popup-closed-by-user'||code==='auth/cancelled-popup-request'?'로그인을 취소했어요. 시작 방법을 다시 선택해 주세요.':
    code==='auth/popup-blocked'?'팝업이 차단됐어요. 브라우저에서 팝업을 허용한 뒤 다시 눌러 주세요.':
    code==='auth/credential-already-in-use'||code==='auth/account-exists-with-different-credential'?'이미 사용 중인 계정이에요. 현재 게스트 기록은 유지됩니다. 기존 계정으로 시작하려면 로그아웃 후 Google로 로그인해 주세요.':
    code==='auth/network-request-failed'?'인터넷 연결을 확인하고 다시 시도해 주세요.':'로그인하지 못했어요. 잠시 후 다시 시도해 주세요.';
   if(link)notify(message,'error');else setAuthError(message);
  }finally{authBusy.current=false;setSigningIn(null);}
 }
 return <>
  {authOpen&&!uid&&<AuthChoices ready={authReady&&configured} busy={signingIn} error={authError} onGuest={()=>{void startSession('guest');}} onGoogle={()=>{void startSession('google');}} onClose={()=>{joinAfterAuth.current=false;setAuthOpen(false);setAuthError('');}}/>}
  <div className="app-shell">
  <header className="app-header"><a className="brand" href="#tree" onClick={()=>{if(own)setTarget(own);navigate('tree');}}><span className="brand-mark" aria-hidden="true">✧</span><div><span className="eyebrow">FOREON TREE</span><h1>포레온 트리 키우기</h1></div></a>
   <div className="account" ref={account}><button ref={accountButton} className="icon-button account-trigger" aria-label="계정 메뉴" aria-expanded={accountOpen} aria-controls="account-menu" onClick={()=>setAccountOpen(value=>!value)}><span aria-hidden="true">👤</span></button>
    {accountOpen&&<div id="account-menu" className="account-popover"><span className="eyebrow">MY ACCOUNT</span><strong>{own?`${own}동과 함께하는 겨울`:'가볍게 시작하는 겨울'}</strong><p>{!uid?'로그인 방법을 선택해 주세요.':isGuest?'게스트로 이용 중이에요.':'Google 계정으로 이용 중이에요.'}</p>
     {uid&&isGuest&&<button disabled={Boolean(signingIn)} onClick={()=>{void startSession('google',true);}}>{signingIn==='google'?'Google 연결 중…':'Google 계정 연결'}</button>}
     {uid?<button onClick={leave}><span aria-hidden="true">🚪</span> 로그아웃</button>:<button onClick={()=>{setAccountOpen(false);setAuthOpen(true);}}>로그인 / 게스트로 시작</button>}
     {own&&<button onClick={()=>{setNextComplex('');setNextBuilding('');setChangeOpen(true);setAccountOpen(false);}}><span aria-hidden="true">🏡</span> 동 바꾸기</button>}
     {isGuest&&<small>Google 계정을 연결하면 현재 기록으로 이어갈 수 있어요.</small>}</div>}
   </div>
  </header>
  {customizing&&isOwnBuilding&&<TreeCustomizer key={scoreKey} actual={actual} view={view} style={treeStyle.style} onChange={treeStyle.update} onClose={()=>setCustomizing(false)} storageFailed={treeStyle.storageFailed}/>}
  <main className="app-content">
   <section id="tree-panel" className="tree-panel" aria-label="트리" hidden={tab!=='tree'}>
    {!configured&&<p className="preview-note">미리보기 · 포레온 트리 키우기를 먼저 둘러보세요</p>}
    <section className="gallery" aria-label={`${target}동 트리 현황`}>
     <div className="tree-title"><div>{!isOwnBuilding&&<span className="eyebrow">TREE GALLERY</span>}<h2>{target}동의 트리 <span className={`mode-badge ${isOwnBuilding?'own':''}`}>{isOwnBuilding?'우리 동':'둘러보기'}</span></h2></div>
     </div>
     <h3 className="level-caption tree-level-title"><span className="level-heading">Lv.{view}</span><span className="tree-level-name">{future?'아직 밝혀지지 않은 겨울':promotionFor(view).title}</span></h3>
     <div className="team-score">
      <div className={`score-total ${scoreText.length>12?'score-total-wide score-total-huge':scoreText.length>8?'score-total-wide':''}`}><div className="score-amount"><output key={total} aria-live="off" aria-label={`${target}동 경험치`}>{scoreText}</output><span>EXP</span></div><span className="score-standing" aria-label={`${target}동 현재 순위 ${standingText}`}><small>현재 순위</small><strong>{standingText}</strong></span></div>
      <div className="growth-copy"><span>{growth.remaining>0?`Lv ${growth.level+1}까지`:'가장 찬란한 겨울'}</span><strong>{!treeReady?'—':growth.remaining>0?`${growth.remaining.toLocaleString()} EXP 남음`:'최고 레벨 달성'}</strong></div>
      <progress aria-label="다음 레벨 경험치" value={treeReady?growth.value:undefined} max={growth.max}/>
     {isOwnBuilding&&<RewardStatus baseXp={ownProjection?.baseXp} rewardLevel={ownProjection?.rewardLevel} boostRemainingMs={ownProjection?.boostRemainingMs} boostMultiplier={ownProjection?.boostMultiplier} nextXp={ownProjection?.nextXp} comboMeter={ownProjection?.comboMeter} comboMultiplier={ownProjection?.comboMultiplier} comboTier={ownProjection?.comboTier} comboDecaying={ownProjection?.comboDecaying}/>}
     </div>
     {isOwnBuilding&&<button className="customize-trigger" onClick={()=>setCustomizing(true)} aria-label="트리 꾸미기">✧ 트리 꾸미기 <span>Lv.{actual}</span></button>}
     <div className="tree"><canvas ref={canvas} role={!own?'button':undefined} tabIndex={!own?0:undefined} aria-haspopup={!own?'dialog':undefined} aria-label={!own?'트리를 눌러 함께할 동 선택':future?'미해금 트리 미리보기':`${view}레벨 트리 · 눌러서 경험치 모으기`} onPointerDown={collect} onKeyDown={event=>{if(!own&&(event.key==='Enter'||event.key===' ')){event.preventDefault();chooseBuilding();}}}/>
      {tapFx&&isOwnBuilding&&<span key={tapFx.id} className={`tap-exp ${tapFx.xp>1?'tap-boosted':''}`} style={{left:tapFx.x,top:tapFx.y}} onAnimationEnd={()=>setTapFx(null)} aria-hidden="true">+{formatXp(tapFx.xp)}</span>}
      {ownProjection?.gift&&canScore(actual,view,isOwnBuilding)&&<GiftDrop gift={ownProjection.gift} onOpen={receiveGift} opening={opening}/>}
      <button className="arrow left" aria-label="이전 레벨" disabled={view===1} onClick={()=>setView(value=>value-1)}>‹</button><button className="arrow right" aria-label="다음 레벨" disabled={view===10} onClick={()=>setView(value=>value+1)}>›</button>
      {future&&<span className="lock">◇ 미해금</span>}
     </div>
     <div className="indicators" aria-label="성장 갤러리">{Array.from({length:10},(_,i)=><button key={i} aria-label={`${i+1}레벨 ${i+1>actual?'미해금':'달성'}`} aria-current={view===i+1?'step':undefined} className={`${i+1<=actual?'achieved':''} ${view===i+1?'selected':''}`} onClick={()=>setView(i+1)}><span className="level-dot" aria-hidden="true"/><span className="indicator-number" aria-hidden="true">{i+1}</span></button>)}</div>
     <GameTips active={tab==='tree'} intro={!own?'트리를 눌러 함께할 동을 골라 주세요':future?'다음 겨울에는 어떤 빛이 기다릴까요?':!isOwnBuilding?'이 동의 겨울을 구경하고 있어요':undefined}/>
     {view!==actual&&<button className="return-current" onClick={()=>setView(actual)}>지금의 트리로 돌아가기 <span aria-hidden="true">↗</span></button>}
     {!isOwnBuilding&&own&&<button className="return-own text-button" onClick={()=>openBuilding(own)}>우리 동 트리로 돌아가기</button>}
    </section>
   </section>
   <section id="ranking-panel" className="ranking-panel" aria-label="랭킹" hidden={tab!=='ranking'}>
    <RankingBoard rows={visibleRows} own={uid?own:null} ready={loaded} active={tab==='ranking'} onOpen={openBuilding}/>
   </section>
   <section id="activity-panel" hidden={tab!=='activity'} aria-label="내 기록"><MyActivity uid={uid} eventId={eventId} own={own} active={tab==='activity'} teamScore={own?teamScores[own]?.score:undefined} resetEpoch={own?teamScores[own]?.resetEpoch:undefined} onLogin={()=>setAuthOpen(true)} onJoin={chooseBuilding}/></section>
  </main>
  <nav className="bottom-nav" aria-label="메인 메뉴"><button aria-current={tab==='tree'?'page':undefined} aria-controls="tree-panel" onClick={()=>{if(own)setTarget(own);navigate('tree');}}><span aria-hidden="true">✧</span><strong>트리</strong></button><button aria-current={tab==='ranking'?'page':undefined} aria-controls="ranking-panel" onClick={()=>navigate('ranking')}><span aria-hidden="true">♜</span><strong>랭킹</strong></button><button aria-current={tab==='activity'?'page':undefined} aria-controls="activity-panel" onClick={()=>navigate('activity')}><span aria-hidden="true">▥</span><strong>내 기록</strong></button></nav>
  {toast&&!promotion&&<div className={`toast toast-${toast.kind}`} role={toast.kind==='error'?'alert':'status'}><span aria-hidden="true">{toast.kind==='level'?'✦':toast.kind==='error'?'!':'✧'}</span><p>{toast.text}</p>{toast.buildingId&&<button onClick={()=>{openBuilding(toast.buildingId!);setView(actual);setToast(null);}}>트리 보기</button>}<button className="icon-button" aria-label="알림 닫기" onClick={()=>setToast(null)}>×</button></div>}
  {promotion&&tab==='tree'&&<LevelUpCelebration key={promotion.id} event={promotion} onClose={()=>setPromotion(null)}/>}
  {joinOpen&&!own&&<Modal title="어느 동과 함께할까요?" onClose={()=>{if(!joining)setJoinOpen(false);}}><p>우리 동을 선택하고 트리에 경험치를 모아 주세요.</p><form onSubmit={event=>{event.preventDefault();void join();}}>
   <label>단지<select required disabled={joining} value={complex} onChange={event=>{setComplex(event.target.value);setBuilding('');}}><option value="">선택</option>{complexes.map(value=><option key={value.id} value={value.id}>{value.id}단지</option>)}</select></label>
   <label>동<select required disabled={joining||!complex} value={building} onChange={event=>setBuilding(event.target.value)}><option value="">선택</option>{initialRows.filter(row=>row.complexId===complex).map(row=><option key={row.buildingId} value={row.buildingId}>{row.buildingNumber}동</option>)}</select></label>
   <button className="primary-button" disabled={!configured||!uid||!eventId||!participantReady||joining||!complex||!building}>{!configured?'참가 준비 중':!eventId?'새로운 겨울을 준비하고 있어요':!uid||!participantReady?'연결 중…':joining?'함께하는 중…':'이 동과 함께하기'}</button>
  </form></Modal>}
  {changeOpen&&<Modal title="함께할 동 바꾸기" onClose={()=>{if(!changing)setChangeOpen(false);}}><p>지금까지 모은 경험치는 기존 동에 남아요. 변경 후 모으는 경험치는 새 동에 쌓여요.</p><form onSubmit={event=>{event.preventDefault();void switchBuilding();}}><label>단지<select required disabled={changing} value={nextComplex} onChange={e=>{setNextComplex(e.target.value);setNextBuilding('');}}><option value="">선택</option>{complexes.map(c=><option key={c.id} value={c.id}>{c.id}단지</option>)}</select></label><label>동<select required disabled={changing||!nextComplex} value={nextBuilding} onChange={e=>setNextBuilding(e.target.value)}><option value="">선택</option>{initialRows.filter(row=>row.complexId===nextComplex).map(row=><option key={row.buildingId} value={row.buildingId}>{row.buildingNumber}동</option>)}</select></label><button className="primary-button" disabled={changing||!nextComplex||!nextBuilding||nextBuilding===own}>{changing?'변경 중…':'이 동과 함께하기'}</button></form></Modal>}
 </div></>;
}
createRoot(document.getElementById('root')!).render(location.pathname==='/admin'?<DeveloperGallery dashboard/>:location.pathname==='/developer'?<DeveloperGallery/>:<App/>);
