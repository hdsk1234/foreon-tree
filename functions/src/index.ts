import {createHash} from 'node:crypto';
import {initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore, Timestamp,FieldValue} from 'firebase-admin/firestore';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {onSchedule} from 'firebase-functions/v2/scheduler';
import {setGlobalOptions} from 'firebase-functions/v2';
import {validateBatch,addScore,levelForScore,MIN_BATCH_INTERVAL_MS} from './scoring';
import {awardTaps,initialRewards,openGift,migrateRewards,MAX_BOOST_TAPS,type Rewards} from './rewards';
import {awardComboTaps,normalizeCombo} from './combo';
import {requireDeveloper} from './developer';
import {recordActivity,clickReceipt} from './activity';
import {publishRankingBoards} from './rankings';
export {authorizeDeveloper,developerSession} from './developer';
export {adminDashboard} from './admin';
initializeApp();
setGlobalOptions({region:'asia-northeast3',maxInstances:5,minInstances:0,timeoutSeconds:60});
const db=getFirestore();
function uidOf(request:{auth?:{uid:string}}):string {
  if (!request.auth) throw new HttpsError('unauthenticated','로그인이 필요합니다.');
  return request.auth.uid;
}
async function liveUser(uid:string) {
  try {
    const user=await getAuth().getUser(uid);
    if(user.disabled) throw new HttpsError('unauthenticated','사용할 수 없는 계정입니다.');
    return user;
  } catch(error) {
    if((error as {code?:string}).code==='auth/user-not-found')
      throw new HttpsError('unauthenticated','계정이 삭제되었습니다.');
    throw error;
  }
}
function id(value:unknown):string {
  if (typeof value!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(value))
    throw new HttpsError('invalid-argument','올바른 ID가 필요합니다.');
  return value;
}
function active(event:FirebaseFirestore.DocumentSnapshot) {
  const d=event.data(), now=Date.now();
  if (!d || d.status!=='active' || !(d.startsAt instanceof Timestamp) || (d.endsAt!=null&&!(d.endsAt instanceof Timestamp)) ||
      now<d.startsAt.toMillis() || (d.endsAt instanceof Timestamp&&now>=d.endsAt.toMillis()))
    throw new HttpsError('failed-precondition','진행 중인 이벤트가 아닙니다.',{reason:d?.status==='closed'||(d?.endsAt instanceof Timestamp&&now>=d.endsAt.toMillis())?'event-ended':'event-not-active'});
}
// 상시 이벤트는 중복 처리 기록을 만료시키지 않는다. 종료일이 있는 이벤트만 기존 TTL 사용.
function receiptExpiry(event:FirebaseFirestore.DocumentSnapshot){
 const endsAt=event.get('endsAt');return endsAt instanceof Timestamp?{expiresAt:Timestamp.fromMillis(endsAt.toMillis()+30*86400000)}:{};
}
export const joinEvent=onCall(async request=>{
  const uid=uidOf(request), eventId=id(request.data?.eventId), buildingId=id(request.data?.buildingId);
  await liveUser(uid);
  const apartmentId='olympic-park-foreon';
  return db.runTransaction(async tx=>{
    const event=db.doc(`events/${eventId}`), participant=event.collection('participants').doc(uid);
    const user=db.doc(`users/${uid}`), building=db.doc(`apartments/${apartmentId}/buildings/${buildingId}`);
    const [e,p,u,b]=await tx.getAll(event,participant,user,building);
    active(e);
    if (u.data()?.status==='deleting') throw new HttpsError('failed-precondition','삭제 처리 중입니다.');
    if (!b.exists) throw new HttpsError('not-found','동을 찾을 수 없습니다.');
    if (p.exists) return {buildingId:p.get('buildingId')};
    const now=Timestamp.now();
    const affiliation={apartmentId,complexId:b.get('complexId'),buildingId};
    tx.create(participant,{...affiliation,joinedAt:now,buildingIds:[buildingId],rewards:initialRewards()});
    tx.set(user,{uid,...affiliation,accountType:request.auth!.token.firebase.sign_in_provider==='anonymous'?'guest':'linked',
      updatedAt:now,...(!u.exists?{createdAt:now}:{})},{merge:true});
    return {buildingId};
  });
});
export const submitScoreBatch=onCall(async request=>{
  const uid=uidOf(request), {eventId,batchId,points,buildingId:requestedBuilding,boostId,tapFrom,tapTo,tapTimes}=validateBatch(request.data);
  // UID 이름공간 + digest: 다른 사용자 배치 충돌 및 경로 삽입 방지.
  const key=createHash('sha256').update(`${uid}:${batchId}`).digest('hex');
  const event=db.doc(`events/${eventId}`);
  return db.runTransaction(async tx=>{
    const batch=event.collection('scoreBatches').doc(key), personal=event.collection('userScores').doc(uid);
    const [e,p,b,u,profile]=await tx.getAll(event,event.collection('participants').doc(uid),batch,personal,db.doc(`users/${uid}`));
    if (profile.data()?.status==='deleting') throw new HttpsError('failed-precondition','삭제 처리 중입니다.');
    if (!p.exists) throw new HttpsError('permission-denied','먼저 이벤트에 참가하세요.');
    if (b.exists) {
      if (b.get('points')!==points||(requestedBuilding&&b.get('buildingId')!==requestedBuilding)||(b.get('boostId')??undefined)!==boostId||b.get('tapFrom')!==tapFrom||b.get('tapTo')!==tapTo||JSON.stringify(b.get('tapTimes')??null)!==JSON.stringify(tapTimes??null)) throw new HttpsError('already-exists','배치 내용이 다릅니다.');
      if(typeof b.get('teamScore')==='number'&&typeof b.get('teamRevision')==='number')
        return {accepted:points,duplicate:true,teamScore:b.get('teamScore'),teamRevision:b.get('teamRevision'),rewards:b.get('rewards'),combo:b.get('combo'),activity:clickReceipt(u.data()??{})};
      // 이전 버전의 배치도 재합산하지 않고 현재 확정 원장을 반환한다.
      const team=await tx.get(event.collection('teamScores').doc(id(p.get('buildingId'))));
      return {accepted:points,duplicate:true,teamScore:team.get('score')??0,teamRevision:team.get('revision')??0,activity:clickReceipt(u.data()??{})};
    }
    active(e);
    const buildingId=requestedBuilding??id(p.get('buildingId'));
    if(buildingId!==p.get('buildingId')&&!(p.get('buildingIds')??[]).includes(buildingId))throw new HttpsError('permission-denied','참가한 동이 아닙니다.');
    const building=db.doc(`apartments/${id(p.get('apartmentId'))}/buildings/${buildingId}`);
    const team=event.collection('teamScores').doc(buildingId);
    const [t,buildingDoc]=await tx.getAll(team,building);
    if (!buildingDoc.exists)
      throw new HttpsError('failed-precondition','참가 동 정보가 유효하지 않습니다.');
    const now=Timestamp.now();
    if(tapTimes&&(tapTimes[0]<(e.get('startsAt') as Timestamp).toMillis()||tapTimes[tapTimes.length-1]>now.toMillis()+1000||(boostId&&(tapFrom!==tapTimes[0]||tapTo!==tapTimes[tapTimes.length-1]))))
      throw new HttpsError('invalid-argument','입력 시각 범위를 확인하세요.');
    if (u.exists && now.toMillis()-(u.get('lastBatchAt') as Timestamp).toMillis()<MIN_BATCH_INTERVAL_MS)
      throw new HttpsError('resource-exhausted','배치 전송 간격을 기다려 주세요.');
    const previous=p.get('rewards') as Rewards|undefined,normalized=migrateRewards(previous,now.toMillis());
    const grant=boostId?event.collection('boostGrants').doc(boostId):null;
    const stored=grant?await tx.get(grant):null;
    let bonus={points:0,multiplier:1};
    if(boostId){
      if(!stored?.exists||stored.get('uid')!==uid||tapFrom!<stored.get('startsAt')||tapTo!>=stored.get('endsAt')||tapTo!>now.toMillis()+1000)
        throw new HttpsError('invalid-argument','아이템의 유효 입력 시간을 확인하세요.');
      bonus={points:Math.min(points,Math.max(0,MAX_BOOST_TAPS-(stored.get('creditedTaps')??0))),multiplier:stored.get('multiplier')};
    }
    // 횟수제 아이템은 최초 접속 시 서버 기준 60초 아이템으로 변환한다.
    const migrating=(previous?.boostRemaining??0)>0&&!previous?.boostExpiresAt;
    if(migrating&&!boostId)bonus={points:Math.min(points,previous!.boostRemaining!),multiplier:previous!.boostMultiplier};
    const {xp:legacyXp,reward}=awardTaps(normalized,points,levelForScore(t.get('score')??0),now.toMillis(),bonus);
    const oldCombo=normalizeCombo(p.get(`combos.${buildingId}`));
    const calculated=tapTimes?awardComboTaps(oldCombo,tapTimes,bonus.points,bonus.multiplier,t.get('score')??0):null;
    const xp=calculated?.units??legacyXp,combo=calculated?{...calculated.state,version:oldCombo.version+1}:oldCombo;
    if(grant&&stored)tx.update(grant,{creditedTaps:(stored.get('creditedTaps')??0)+bonus.points});
    if(migrating)tx.create(event.collection('boostGrants').doc(reward.boostId!),{uid,multiplier:reward.boostMultiplier,startsAt:reward.boostStartsAt,endsAt:reward.boostExpiresAt,creditedTaps:0,
      ...receiptExpiry(e)});
    const total=addScore(t.get('score'),xp),revision=addScore(t.get('revision'),1);
    tx.create(batch,{uid,batchId,points,buildingId,...(boostId?{boostId,tapFrom,tapTo}:{}),...(tapTimes?{tapTimes,combo}:{}),awardedXp:xp,rewards:reward,teamScore:total,teamRevision:revision,createdAt:now,
      ...receiptExpiry(e)});
    const activity=recordActivity(u.data()??{},buildingId,xp,points,t.get('resetEpoch')??0,now.toMillis(),batchId,tapTimes);
    tx.set(personal,{score:addScore(u.get('score'),xp),lastBatchAt:now,...activity});
    tx.update(p.ref,{rewards:reward,...(tapTimes?{[`combos.${buildingId}`]:combo}:{})});
    tx.set(team,{buildingId,complexId:buildingDoc.get('complexId'),score:total,revision,actualLevel:levelForScore(total),updatedAt:FieldValue.serverTimestamp()},{merge:true});
    return {accepted:points,duplicate:false,teamScore:total,teamRevision:revision,rewards:reward,activity:clickReceipt(activity),...(tapTimes?{combo}:{})};
  });
});
export const resetBuildingExp=onCall({maxInstances:2,timeoutSeconds:30},async request=>{
 const uid=uidOf(request),eventId=id(request.data?.eventId),buildingId=id(request.data?.buildingId),requestId=id(request.data?.requestId);
 if(!/^\d{3}$/.test(buildingId)||requestId.length<16)throw new HttpsError('invalid-argument','초기화 요청을 확인하세요.');
 return db.runTransaction(async tx=>{
  await requireDeveloper(uid,tx);
  const event=db.doc(`events/${eventId}`),team=event.collection('teamScores').doc(buildingId),board=event.collection('results').doc('leaderboard');
  const audit=event.collection('scoreResets').doc(createHash('sha256').update(`${uid}:${requestId}`).digest('hex'));
  const rate=db.doc(`developerOperations/${uid}`);
  const [e,t,l,b,a,r]=await tx.getAll(event,team,board,db.doc(`apartments/olympic-park-foreon/buildings/${buildingId}`),audit,rate);
  if(a.exists){if(a.get('buildingId')!==buildingId)throw new HttpsError('already-exists','초기화 요청이 다릅니다.');return {buildingId,revision:a.get('revision'),duplicate:true};}
  if(!e.exists||!b.exists)throw new HttpsError('not-found','이벤트 또는 동을 찾을 수 없습니다.');
  if(Date.now()-(r.get('lastResetAt')??0)<1000)throw new HttpsError('resource-exhausted','잠시 후 다시 초기화하세요.');
  const now=Timestamp.now(),revision=addScore(t.get('revision'),1),epoch=addScore(t.get('resetEpoch'),1);
  const oldRows=l.get('rows');if(!Array.isArray(oldRows))throw new HttpsError('failed-precondition','랭킹을 준비한 후 다시 시도하세요.');
  const row={buildingId,buildingNumber:b.get('buildingNumber'),complexId:b.get('complexId'),score:0,revision,actualLevel:1};
  const rows=[...oldRows.filter(value=>value.buildingId!==buildingId),row].sort((a,b)=>b.score-a.score||a.buildingNumber-b.buildingNumber);
  const ranked=rows.map(value=>({...value,rank:rows.findIndex(other=>other.score===value.score)+1}));
  tx.set(team,{buildingId,complexId:b.get('complexId'),score:0,revision,resetEpoch:epoch,actualLevel:1,resetAt:now,updatedAt:FieldValue.serverTimestamp()},{merge:true});
  tx.set(board,{rows:ranked,updatedAt:now},{merge:true});
  tx.create(audit,{uid,buildingId,previousScore:t.get('score')??0,previousRevision:t.get('revision')??0,revision,resetEpoch:epoch,createdAt:now});
  tx.set(rate,{lastResetAt:now.toMillis()});
  return {buildingId,revision,duplicate:false};
 });
});
export const changeBuilding=onCall(async request=>{
 const uid=uidOf(request),eventId=id(request.data?.eventId),buildingId=id(request.data?.buildingId);
 await liveUser(uid);
 return db.runTransaction(async tx=>{
  const event=db.doc(`events/${eventId}`),participant=event.collection('participants').doc(uid),profile=db.doc(`users/${uid}`);
  const building=db.doc(`apartments/olympic-park-foreon/buildings/${buildingId}`);
  const [e,p,u,b]=await tx.getAll(event,participant,profile,building);active(e);
  if(!p.exists||u.get('status')==='deleting')throw new HttpsError('failed-precondition','참가 상태를 확인해 주세요.');
  if(!b.exists)throw new HttpsError('not-found','동을 찾을 수 없습니다.');
  if(p.get('buildingId')===buildingId)return {buildingId};
  if(p.get('changedAt') instanceof Timestamp&&Date.now()-p.get('changedAt').toMillis()<30000)throw new HttpsError('resource-exhausted','동 변경은 30초 후 다시 할 수 있어요.');
  const affiliation={buildingId,complexId:b.get('complexId'),apartmentId:'olympic-park-foreon'};
  tx.update(participant,{...affiliation,buildingIds:[...new Set([...(p.get('buildingIds')??[]),p.get('buildingId'),buildingId])],changedAt:Timestamp.now()});
  tx.set(profile,{...affiliation,updatedAt:Timestamp.now()},{merge:true});return {buildingId};
 });
});
export const claimGift=onCall(async request=>{
 const uid=uidOf(request),eventId=id(request.data?.eventId),giftId=id(request.data?.giftId);
 return db.runTransaction(async tx=>{
  const event=db.doc(`events/${eventId}`),ref=event.collection('participants').doc(uid),profile=db.doc(`users/${uid}`);
  const [e,p,u]=await tx.getAll(event,ref,profile);active(e);
  if(!p.exists||u.get('status')==='deleting')throw new HttpsError('permission-denied','참가 상태를 확인해 주세요.');
  const rewards=p.get('rewards') as Rewards|undefined;
  if(p.get('lastGiftId')===giftId)return {rewards};
  if(!rewards?.gift||rewards.gift.id!==giftId)throw new HttpsError('failed-precondition','열 수 있는 선물이 없습니다.');
  const next=openGift(rewards);
  tx.create(event.collection('boostGrants').doc(giftId),{uid,multiplier:next.boostMultiplier,startsAt:next.boostStartsAt,endsAt:next.boostExpiresAt,creditedTaps:0,
   ...receiptExpiry(e)});
  tx.update(ref,{rewards:next,lastGiftId:giftId});return {rewards:next};
 });
});
// Fixed building metadata is bundled; unchanged scores and boards are not reread/rewritten.
export const publishRankings=onSchedule('every 1 minutes',async()=>{
 console.info('rankingSync',await publishRankingBoards(db));
});

export const deleteAccount=onCall(async request=>{
  const uid=uidOf(request);
  if (Date.now()/1000-Number(request.auth!.token.auth_time)>300)
    throw new HttpsError('unauthenticated','삭제 전 다시 인증하세요.');
  const profile=db.doc(`users/${uid}`);
  await profile.set({status:'deleting',updatedAt:Timestamp.now()},{merge:true});
  // 이벤트/동 집계는 유지하되 개인 연결 기록은 삭제한다. 실패 시 동일 UID로 재시도 가능.
  const events=await db.collection('events').get();
  for (const e of events.docs) {
    await db.recursiveDelete(e.ref.collection('participants').doc(uid));
    await db.recursiveDelete(e.ref.collection('userScores').doc(uid));
    const batches=await e.ref.collection('scoreBatches').where('uid','==',uid).get();
    const writer=db.bulkWriter(); batches.docs.forEach(b=>writer.delete(b.ref)); await writer.close();
    const grants=await e.ref.collection('boostGrants').where('uid','==',uid).get();
    const grantWriter=db.bulkWriter();grants.docs.forEach(g=>grantWriter.delete(g.ref));await grantWriter.close();
  }
  await getAuth().deleteUser(uid);
  await profile.delete();
  return {deleted:true};
});

export const syncAccount=onCall(async request=>{
  const uid=uidOf(request);
  const user=await liveUser(uid);
  await db.runTransaction(async tx=>{
    const ref=db.doc(`users/${uid}`), profile=await tx.get(ref);
    if(profile.get('status')==='deleting') throw new HttpsError('failed-precondition','삭제 처리 중입니다.');
    const now=Timestamp.now();
    tx.set(ref,{uid,accountType:user.providerData.length?'linked':'guest',updatedAt:now,
      ...(!profile.exists?{createdAt:now}:{})},{merge:true});
  });
  return {synced:true};
});
