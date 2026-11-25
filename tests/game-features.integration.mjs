import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,scryptSync} from 'node:crypto';
import {getFirestore,Timestamp} from 'firebase-admin/firestore';
import {initializeApp} from 'firebase-admin/app';
import backend from '../functions/lib/index.js';
const project=process.env.GCLOUD_PROJECT,host=process.env.FOREON_TEST_FUNCTIONS_HOST,db=getFirestore(initializeApp({projectId:project}));
async function signup(){const r=await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-only`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({returnSecureToken:true})});return r.json();}
async function call(name,data,token){const r=await fetch(`http://${host}/${project}/asia-northeast3/${name}`,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({data})});return r.json();}
test('동 변경·선물·배율: 서버 권한/멱등성/이전 동 배치의 실제 저장',async()=>{
 const user=await signup(),eventId=`features_${Date.now()}`,event=db.doc(`events/${eventId}`),p=event.collection('participants').doc(user.localId);
 for(const number of ['101','201'])await db.doc(`apartments/olympic-park-foreon/buildings/${number}`).set({complexId:number[0],buildingNumber:Number(number)});
 await event.set({status:'active',startsAt:Timestamp.fromMillis(Date.now()-60000),endsAt:Timestamp.fromMillis(Date.now()+600000)});
 const request=(name,data)=>call(name,{eventId,...data},user.idToken);
 await request('joinEvent',{buildingId:'101'});
 // 재현 가능한 테스트 경계. 일반 플레이의 임계값은 서버에서 생성한다.
 await p.update({rewards:{version:0,progress:44,target:45,boostMultiplier:1,boostStartsAt:0,boostExpiresAt:0,boostId:null,gift:null}});
 const first={batchId:'features_gift_batch_01',points:1,buildingId:'101'};
 const dropped=(await request('submitScoreBatch',first)).result;assert.equal(dropped.teamScore,1);assert.equal(dropped.rewards.gift.multiplier,2);
 assert.equal((await request('claimGift',{giftId:'not-a-real-gift'})).error.status,'FAILED_PRECONDITION');
 const gifts=await Promise.all([request('claimGift',{giftId:dropped.rewards.gift.id}),request('claimGift',{giftId:dropped.rewards.gift.id})]);
 const boost=gifts[0].result.rewards;assert.equal(boost.boostExpiresAt-boost.boostStartsAt,60000);assert.ok(gifts.every(result=>result.result.rewards.boostExpiresAt===boost.boostExpiresAt));
 assert.equal((await request('changeBuilding',{buildingId:'999'})).error.status,'NOT_FOUND');
 assert.equal((await request('changeBuilding',{buildingId:'201'})).result.buildingId,'201');
 assert.equal((await request('changeBuilding',{buildingId:'102'})).error.status,'RESOURCE_EXHAUSTED');
 assert.equal((await request('changeBuilding',{buildingId:'101'})).error.status,'RESOURCE_EXHAUSTED');
 const reset=()=>event.collection('userScores').doc(user.localId).update({lastBatchAt:Timestamp.fromMillis(0)});
 await reset();const late={batchId:'features_old_home_01',points:2,buildingId:'101',boostId:boost.boostId,tapFrom:boost.boostStartsAt,tapTo:boost.boostStartsAt};
 const old=(await request('submitScoreBatch',late)).result;assert.equal(old.teamScore,5);assert.equal(old.rewards.boostExpiresAt,boost.boostExpiresAt);
 const retry=await request('submitScoreBatch',late);assert.equal(retry.result.teamScore,5);assert.equal((await event.collection('boostGrants').doc(boost.boostId).get()).get('creditedTaps'),2);
 assert.equal((await request('submitScoreBatch',{...late,buildingId:'201'})).error.status,'ALREADY_EXISTS');
 await reset();const current=(await request('submitScoreBatch',{batchId:'features_new_home_01',points:3,buildingId:'201',boostId:boost.boostId,tapFrom:boost.boostStartsAt,tapTo:boost.boostStartsAt})).result;
 assert.equal(current.teamScore,6);assert.equal((await event.collection('teamScores').doc('101').get()).get('score'),5);
 assert.equal((await event.collection('teamScores').doc('201').get()).get('score'),6);
 assert.equal((await event.collection('userScores').doc(user.localId).get()).get('score'),11);
 // 실제 서버에서 만료 전 입력을 늦게 수신해도 배율을 보존한다.
 const end=Date.now()-100,grant=event.collection('boostGrants').doc(boost.boostId);
 await grant.update({startsAt:end-60000,endsAt:end});
 await p.update({'rewards.boostStartsAt':end-60000,'rewards.boostExpiresAt':end});
 await reset();const delayed={batchId:'features_delayed_01',points:2,buildingId:'201',boostId:boost.boostId,tapFrom:end-2,tapTo:end-1};
 assert.equal((await request('submitScoreBatch',delayed)).result.teamScore,10);
 await reset();assert.equal((await request('submitScoreBatch',{...delayed,batchId:'features_expired_01',tapTo:end})).error.status,'INVALID_ARGUMENT');
 await reset();assert.equal((await request('submitScoreBatch',{batchId:'features_base_after_01',points:1,buildingId:'201'})).result.teamScore,11);
 // 과거 수령증을 새 batchId로 무한 재사용하는 공격을 제한한다.
 await grant.update({creditedTaps:1499});await reset();assert.equal((await request('submitScoreBatch',{...delayed,batchId:'features_grant_cap_01'})).result.teamScore,14);
 assert.equal((await grant.get()).get('creditedTaps'),1500);
 assert.equal((await request('submitScoreBatch',{batchId:'features_tamper_01',points:1,multiplier:100})).error.status,'INVALID_ARGUMENT');
 assert.equal((await call('changeBuilding',{eventId,buildingId:'101'})).error.status,'UNAUTHENTICATED');
 await event.update({endsAt:Timestamp.fromMillis(Date.now()-1)});assert.equal((await request('claimGift',{giftId:dropped.rewards.gift.id})).error.status,'FAILED_PRECONDITION');
});
test('개발자 접근: 링크·소유자 등록 없이 비밀번호 인증, 세션 만료·변경·시도 제한',async()=>{
 const password='test-only-password!',salt='isolated-test-salt';
 process.env.DEV_PASSWORD_SALT=salt;process.env.DEV_PASSWORD_HASH=scryptSync(password,salt,64).toString('hex');delete process.env.DEV_LINK_HASH;
 const accessId=createHash('sha256').update(`${salt}:${process.env.DEV_PASSWORD_HASH}`).digest('hex');
 const req=(uid,data={})=>({auth:{uid},data});
 await assert.rejects(backend.authorizeDeveloper.run({data:{password}}),error=>error.code==='unauthenticated');
 await assert.rejects(backend.developerSession.run(req('owner')),error=>error.code==='permission-denied');
 await assert.rejects(backend.authorizeDeveloper.run(req('owner',{password:'wrong'})),error=>error.details?.reason==='invalid-password');
 assert.equal((await backend.authorizeDeveloper.run(req('owner',{password}))).developer,true);
 assert.equal((await backend.developerSession.run(req('owner'))).developer,true);
 // 과거 소유자가 남아 있어도 다른 브라우저의 올바른 비밀번호 인증을 막지 않는다.
 await db.doc(`developerGates/${accessId}`).set({ownerUid:'old-owner'},{merge:true});
 await assert.rejects(backend.developerSession.run(req('other')),error=>error.code==='permission-denied');
 assert.equal((await backend.authorizeDeveloper.run(req('other',{password,accessKey:'obsolete-link'}))).developer,true);
 assert.equal((await backend.developerSession.run(req('other'))).developer,true);
 await db.doc('developerSessions/owner').update({expiresAt:Timestamp.fromMillis(0)});
 await assert.rejects(backend.developerSession.run(req('owner')),error=>error.code==='permission-denied');
 assert.equal((await backend.authorizeDeveloper.run(req('owner',{password}))).developer,true);
 process.env.DEV_PASSWORD_HASH=scryptSync('changed-password',salt,64).toString('hex');
 await assert.rejects(backend.developerSession.run(req('owner')),error=>error.details?.reason==='config-mismatch');
 process.env.DEV_PASSWORD_HASH=scryptSync(password,salt,64).toString('hex');
 await db.doc(`developerGates/${accessId}`).update({attempts:10,windowAt:Date.now()});
 await assert.rejects(backend.authorizeDeveloper.run(req('other',{password})),error=>error.code==='resource-exhausted');
});

test('실제 서버 콤보: 정밀 경험치·단계 감쇠·선물 중첩·중복/시각 위조 방지',async()=>{
 const user=await signup(),eventId=`combo_${Date.now()}`,event=db.doc(`events/${eventId}`),participant=event.collection('participants').doc(user.localId);
 await db.doc('apartments/olympic-park-foreon/buildings/101').set({complexId:'1',buildingNumber:101});
 await event.set({status:'active',startsAt:Timestamp.fromMillis(Date.now()-60000),endsAt:Timestamp.fromMillis(Date.now()+600000)});
 const request=(name,data)=>call(name,{eventId,...data},user.idToken),reset=()=>event.collection('userScores').doc(user.localId).update({lastBatchAt:Timestamp.fromMillis(0)});
 await request('joinEvent',{buildingId:'101'});const at=Date.now(),batch={batchId:'combo_integration_batch_01',buildingId:'101',points:40,tapTimes:Array(40).fill(at)};
 const results=await Promise.all([request('submitScoreBatch',batch),request('submitScoreBatch',batch)]);
 assert.ok(results.every(r=>r.result?.teamScore===63.4),JSON.stringify(results));assert.equal(results[0].result.combo.meter,40);assert.equal(results[0].result.combo.version,1);
 assert.equal((await event.collection('userScores').doc(user.localId).get()).get('score'),63.4);
 assert.equal((await request('submitScoreBatch',{...batch,tapTimes:Array(40).fill(at+1)})).error.status,'ALREADY_EXISTS');
 // 서버 상태의 시계만 이동해 4.25초 중단 경계를 재현한다.
 const resumedAt=Date.now();await participant.update({'combos.101.lastTapAt':resumedAt-4250});await reset();
 const resumed=(await request('submitScoreBatch',{batchId:'combo_integration_resume',buildingId:'101',points:1,tapTimes:[resumedAt]})).result;
 assert.equal(resumed.teamScore,65.2);assert.equal(resumed.combo.meter,30);
 const idleAt=Date.now();await participant.update({'combos.101.lastTapAt':idleAt-11000});await reset();
 const idle=(await request('submitScoreBatch',{batchId:'combo_integration_idle_01',buildingId:'101',points:1,tapTimes:[idleAt]})).result;
 assert.equal(idle.teamScore,66.2);assert.equal(idle.combo.meter,1);
 const giftId='combo_integration_gift_01';await participant.update({'rewards.gift':{id:giftId,multiplier:5,durationSeconds:60}});
 const gift=(await request('claimGift',{giftId})).result.rewards;
 await participant.update({'combos.101.meter':40,'combos.101.lastTapAt':gift.boostStartsAt});await reset();
 const boosted={batchId:'combo_integration_boost_01',buildingId:'101',points:1,boostId:giftId,tapFrom:gift.boostStartsAt,tapTo:gift.boostStartsAt,tapTimes:[gift.boostStartsAt]};
 const won=(await request('submitScoreBatch',boosted)).result;assert.equal(won.teamScore,76.2);assert.equal(won.combo.version,4);
 assert.equal((await request('submitScoreBatch',boosted)).result.teamScore,76.2);assert.equal((await event.collection('boostGrants').doc(giftId).get()).get('creditedTaps'),1);
 assert.equal((await request('submitScoreBatch',{batchId:'combo_integration_forged',buildingId:'101',points:1,tapTimes:[Date.now()],comboMultiplier:100})).error.status,'INVALID_ARGUMENT');
 assert.equal((await request('submitScoreBatch',{batchId:'combo_integration_future',buildingId:'101',points:1,tapTimes:[Date.now()+5000]})).error.status,'INVALID_ARGUMENT');
 const other=await signup();await call('joinEvent',{eventId,buildingId:'101'},other.idToken);
 const separate=(await call('submitScoreBatch',{eventId,batchId:'combo_integration_other_01',buildingId:'101',points:1,tapTimes:[Date.now()]},other.idToken)).result;
 assert.equal(separate.teamScore,77.2);assert.equal(separate.combo.meter,1);assert.equal((await participant.get()).get('combos.101.version'),4);
 await event.update({endsAt:Timestamp.fromMillis(Date.now()-1)});assert.equal((await request('submitScoreBatch',batch)).result.teamScore,63.4);
 assert.equal((await event.collection('teamScores').doc('101').get()).get('score'),77.2);
});

test('레벨 보상: 경계 입력·여러 사용자·중복 재전송·랭킹 레벨을 서버에서 확정한다',async()=>{
 const a=await signup(),b=await signup(),eventId=`level_economy_${Date.now()}`,event=db.doc(`events/${eventId}`);
 await db.doc('apartments/olympic-park-foreon/buildings/101').set({complexId:'1',buildingNumber:101});
 await event.set({status:'active',startsAt:Timestamp.fromMillis(Date.now()-60000),endsAt:Timestamp.fromMillis(Date.now()+600000)});
 for(const user of [a,b])await call('joinEvent',{eventId,buildingId:'101'},user.idToken);
 const team=event.collection('teamScores').doc('101');
 await team.set({buildingId:'101',complexId:'1',score:99,revision:1,actualLevel:1});
 const batch={eventId,batchId:'level_economy_crossing_01',buildingId:'101',points:2,tapTimes:[Date.now()-1,Date.now()]};
 const sent=await Promise.all([call('submitScoreBatch',batch,a.idToken),call('submitScoreBatch',batch,a.idToken)]);
 assert.ok(sent.every(r=>r.result?.teamScore===102),JSON.stringify(sent));
 assert.equal((await team.get()).get('score'),102);assert.equal((await team.get()).get('actualLevel'),2);
 assert.equal((await event.collection('userScores').doc(a.localId).get()).get('score'),3);
 const other=(await call('submitScoreBatch',{...batch,batchId:'level_economy_second_01',points:1,tapTimes:[Date.now()]},b.idToken)).result;
 assert.equal(other.teamScore,104);
 // 서버 최고 해금 레벨을 사용하며, 전송한 디자인/배율 값은 허용하지 않는다.
 assert.equal((await call('submitScoreBatch',{...batch,batchId:'level_economy_forged_01',viewingLevel:10},a.idToken)).error.status,'INVALID_ARGUMENT');
 await team.update({score:100000000,actualLevel:1});
 await backend.publishRankings.run({scheduleTime:new Date().toISOString()});
 const ranking=(await event.collection('results').doc('leaderboard').get()).get('rows');
 assert.equal(ranking.find(row=>row.buildingId==='101').actualLevel,9);
});

test('상시 이벤트는 종료일 없이 참가·경험치·선물·랭킹을 유지하고 영수증을 만료하지 않는다',async()=>{
 const user=await signup(),eventId=`permanent_${Date.now()}`,event=db.doc(`events/${eventId}`);
 await db.doc('apartments/olympic-park-foreon/buildings/101').set({complexId:'1',buildingNumber:101});
 await event.set({status:'active',startsAt:Timestamp.fromMillis(Date.now()-60000),endsAt:null});
 const request=(name,data)=>call(name,{eventId,...data},user.idToken);
 assert.equal((await request('joinEvent',{buildingId:'101'})).result.buildingId,'101');
 await event.collection('participants').doc(user.localId).update({rewards:{version:0,progress:44,target:45,boostMultiplier:1,boostStartsAt:0,boostExpiresAt:0,boostId:null,gift:null}});
 const batch={batchId:'permanent_event_batch_01',buildingId:'101',points:1,tapTimes:[Date.now()]};
 const score=(await request('submitScoreBatch',batch)).result;assert.equal(score.teamScore,1);assert.ok(score.rewards.gift);
 const records=await event.collection('scoreBatches').get();assert.equal(records.docs[0].get('expiresAt'),undefined);
 const gift=(await request('claimGift',{giftId:score.rewards.gift.id})).result.rewards;
 assert.equal((await event.collection('boostGrants').doc(gift.boostId).get()).get('expiresAt'),undefined);
 await backend.publishRankings.run({scheduleTime:new Date().toISOString()});assert.equal((await event.get()).get('status'),'active');
 assert.equal((await request('submitScoreBatch',batch)).result.teamScore,1);
 await event.update({status:'closed'});assert.equal((await request('submitScoreBatch',{...batch,batchId:'permanent_event_closed_01'})).error.status,'FAILED_PRECONDITION');
});

test('내 기록: 클릭·콤보 XP·날짜·동별 기여를 원자 집계하고 중복 배치는 다시 더하지 않는다',async()=>{
 const user=await signup(),eventId=`activity_${Date.now()}`,event=db.doc(`events/${eventId}`);
 for(const number of ['101','201'])await db.doc(`apartments/olympic-park-foreon/buildings/${number}`).set({complexId:number[0],buildingNumber:Number(number)});
 await event.set({status:'active',startsAt:Timestamp.fromMillis(Date.now()-60000),endsAt:null});
 const request=(name,data)=>call(name,{eventId,...data},user.idToken);
 await request('joinEvent',{buildingId:'101'});
 const batch={batchId:'activity_combo_batch_01',points:40,buildingId:'101',tapTimes:Array(40).fill(Date.now())};
 const sent=await request('submitScoreBatch',batch);assert.ok(sent.result,JSON.stringify(sent));
 await request('submitScoreBatch',batch);
 const personal=event.collection('userScores').doc(user.localId),first=(await personal.get()).data();
 assert.equal(first.activityVersion,1);assert.deepEqual(first.recentBatchIds,[batch.batchId]);assert.equal(sent.result.activity.tapCount,40);assert.equal(sent.result.activity.version,1);assert.equal(first.tapCount,40);assert.equal(first.score,63.4);assert.equal(first.trackedScore,63.4);
 const day=new Date(first.trackingStartedAt+9*3600000).toISOString().slice(0,10);
 assert.deepEqual(first.daily[day],{score:63.4,taps:40});assert.equal(first.buildings['101'].activeScore,63.4);
 await request('changeBuilding',{buildingId:'201'});await personal.update({lastBatchAt:Timestamp.fromMillis(0)});
 assert.equal((await request('submitScoreBatch',{batchId:'activity_second_home_01',points:2,buildingId:'201'})).result.accepted,2);
 const moved=(await personal.get()).data();assert.equal(moved.activityVersion,2);assert.equal(moved.tapCount,42);assert.equal(moved.score,65.4);assert.equal(moved.buildings['101'].score,63.4);assert.equal(moved.buildings['201'].score,2);
 // 기존 EXP에서 과거 클릭 수를 역산하지 않는다. 기존 사용자의 EXP는 보존한다.
 const legacy=await signup();await call('joinEvent',{eventId,buildingId:'101'},legacy.idToken);
 const old=event.collection('userScores').doc(legacy.localId);await old.set({score:500,lastBatchAt:Timestamp.fromMillis(0)});
 await call('submitScoreBatch',{eventId,batchId:'activity_legacy_user_01',buildingId:'101',points:1},legacy.idToken);
 const migrated=(await old.get()).data();assert.equal(migrated.score,501);assert.equal(migrated.tapCount,1);assert.equal(migrated.trackedScore,1);
});

test('관리자 동 EXP 초기화: 비밀번호 세션·멱등성·원자 랭킹·개인 기록 보존',async()=>{
 const salt='isolated-reset-salt',password='reset-test-password';
 process.env.DEV_PASSWORD_SALT=salt;process.env.DEV_PASSWORD_HASH=scryptSync(password,salt,64).toString('hex');
 const accessId=createHash('sha256').update(`${salt}:${process.env.DEV_PASSWORD_HASH}`).digest('hex');
 const owner='reset-owner',req=(uid,data)=>({...(uid?{auth:{uid}}:{}),data});
 await db.doc(`developerGates/${accessId}`).set({ownerUid:owner});
 const session=db.doc(`developerSessions/${owner}`);await session.set({accessId,authMethod:'password',expiresAt:Timestamp.fromMillis(Date.now()+60000)});
 const player=await signup(),eventId=`reset_${Date.now()}`,event=db.doc(`events/${eventId}`);
 for(const number of ['101','201'])await db.doc(`apartments/olympic-park-foreon/buildings/${number}`).set({complexId:number[0],buildingNumber:Number(number)});
 await event.set({status:'active',startsAt:Timestamp.fromMillis(Date.now()-60000),endsAt:null});
 await call('joinEvent',{eventId,buildingId:'101'},player.idToken);
 const original={eventId,batchId:'reset_existing_batch_01',points:10,buildingId:'101'};
 await call('submitScoreBatch',original,player.idToken);
 await event.collection('teamScores').doc('201').set({score:5,revision:1,buildingId:'201',complexId:'2'});
 await backend.publishRankings.run({scheduleTime:new Date().toISOString()});
 const request={eventId,buildingId:'101',requestId:'reset_request_uuid_01'};
 await assert.rejects(backend.resetBuildingExp.run(req(null,request)),error=>error.code==='unauthenticated');
 await assert.rejects(backend.resetBuildingExp.run(req(player.localId,{...request,developer:true})),error=>error.code==='permission-denied');
 await db.doc(`developerSessions/${player.localId}`).set({accessId,expiresAt:Timestamp.fromMillis(Date.now()+60000)});
 await assert.rejects(backend.resetBuildingExp.run(req(player.localId,request)),error=>error.code==='permission-denied');
 await assert.rejects(backend.resetBuildingExp.run(req(owner,{...request,buildingId:'999'})),error=>error.code==='not-found');
 const results=await Promise.all([backend.resetBuildingExp.run(req(owner,request)),backend.resetBuildingExp.run(req(owner,request))]);
 assert.equal(results.filter(r=>!r.duplicate).length,1);assert.ok(results.every(r=>r.revision===2));
 let team=(await event.collection('teamScores').doc('101').get()).data();assert.equal(team.score,0);assert.equal(team.actualLevel,1);assert.equal(team.resetEpoch,1);
 assert.equal((await event.collection('scoreResets').get()).size,1);
 const board=(await event.collection('results').doc('leaderboard').get()).get('rows');assert.equal(board.find(r=>r.buildingId==='101').score,0);assert.equal(board.find(r=>r.buildingId==='201').rank,1);
 const personal=event.collection('userScores').doc(player.localId);assert.equal((await personal.get()).get('score'),10);assert.equal((await personal.get()).get('tapCount'),10);
 // 응답이 유실된 과거 배치는 승인 기록만 반환하고 초기화한 동 EXP를 되살리지 않는다.
 assert.equal((await call('submitScoreBatch',original,player.idToken)).result.teamScore,10);assert.equal((await event.collection('teamScores').doc('101').get()).get('score'),0);
 await personal.update({lastBatchAt:Timestamp.fromMillis(0)});
 assert.equal((await call('submitScoreBatch',{...original,batchId:'reset_new_input_batch_01',points:1},player.idToken)).result.teamScore,1);
 team=(await event.collection('teamScores').doc('101').get()).data();assert.equal(team.resetEpoch,1);
 const stats=(await personal.get()).data();assert.equal(stats.score,11);assert.equal(stats.tapCount,11);assert.equal(stats.buildings['101'].score,11);assert.equal(stats.buildings['101'].activeScore,1);assert.equal(stats.buildings['101'].epoch,1);
 await db.doc(`developerOperations/${owner}`).set({lastResetAt:Date.now()});
 await assert.rejects(backend.resetBuildingExp.run(req(owner,{...request,requestId:'reset_another_uuid_02'})),error=>error.code==='resource-exhausted');
 await session.update({expiresAt:Timestamp.fromMillis(0)});
 await assert.rejects(backend.resetBuildingExp.run(req(owner,{...request,requestId:'reset_expired_uuid_03'})),error=>error.code==='permission-denied');
 assert.equal((await event.collection('teamScores').doc('101').get()).get('score'),1);
 assert.equal((await backend.authorizeDeveloper.run(req(player.localId,{password}))).developer,true);
 assert.equal((await backend.resetBuildingExp.run(req(player.localId,{...request,buildingId:'201',requestId:'reset_second_admin_01'}))).duplicate,false);
 assert.equal((await event.collection('teamScores').doc('201').get()).get('score'),0);
});
