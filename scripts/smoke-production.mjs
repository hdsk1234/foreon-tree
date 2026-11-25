// 실제 운영 API 검수는 본 게임과 분리된 짧은 QA 이벤트에서만 점수를 기록한다.
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {loadEnv} from 'vite';
import {validateReleaseConfig} from './release-config.mjs';
const project=process.argv[process.argv.indexOf('--project')+1];
if(!process.argv.includes('--project')||!project)throw new Error('--project가 필요합니다.');
const env={...loadEnv('production',process.cwd(),'VITE_'),...Object.fromEntries(Object.entries(process.env).filter(([key])=>key.startsWith('VITE_')))};
validateReleaseConfig(env,project);
const require=createRequire(import.meta.url),auth=require('firebase-tools/lib/auth'),account=auth.getProjectDefaultAccount(process.cwd());
if(!account)throw new Error('Firebase CLI 로그인이 필요합니다.');
const access=await auth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform','https://www.googleapis.com/auth/firebase']);
const adminHeaders={Authorization:`Bearer ${access.access_token}`,'Content-Type':'application/json'};
const eventId=`release-smoke-${Date.now()}`,base=`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`,event=`${base}/events/${eventId}`;
async function json(url,options={}){const response=await fetch(url,{...options,signal:AbortSignal.timeout(60000)});const raw=await response.text();let data;try{data=JSON.parse(raw);}catch{const target=new URL(url);throw new Error(`API ${target.hostname}${target.pathname}: HTTP ${response.status}, JSON이 아닌 응답`);}return {response,data};}
function verify(condition,message){if(!condition)throw new Error(message);}
let created=false;
try{
 const home=await fetch(`https://${project}.web.app/`);const html=await home.text();verify(home.ok&&html.includes('포레온 트리')&&html.includes('/assets/'),'운영 웹사이트 응답 확인 실패');
 const createdEvent=await json(`${base}/events?documentId=${eventId}`,{method:'POST',headers:adminHeaders,body:JSON.stringify({fields:{name:{stringValue:'Release smoke test'},status:{stringValue:'active'},startsAt:{timestampValue:new Date(Date.now()-60000).toISOString()},endsAt:{timestampValue:new Date(Date.now()+3600000).toISOString()}}})});
 verify(createdEvent.response.ok,'QA 이벤트 생성 실패');created=true;
 const signup=await json(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${env.VITE_FIREBASE_API_KEY}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({returnSecureToken:true})});
 verify(signup.response.ok&&signup.data.idToken,'운영 게스트 인증 실패');
 const {idToken,localId,refreshToken}=signup.data;
 const endpoint=`https://${env.VITE_FIREBASE_FUNCTIONS_REGION||'asia-northeast3'}-${project}.cloudfunctions.net/`;
 const call=async(name,data,token=idToken)=>(await json(endpoint+name,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify({data})})).data;
 const joined=await call('joinEvent',{eventId,buildingId:'101'});verify(joined.result?.buildingId==='101',`운영 참가 실패: ${joined.error?.status??'unknown'}`);
 const batch={eventId,buildingId:'101',batchId:randomUUID(),points:1,tapTimes:[Date.now()]};
 const first=await call('submitScoreBatch',batch);verify(first.result?.accepted===1&&first.result?.teamScore===1,`운영 저장 실패: ${first.error?.status??'unknown'}`);
 const duplicate=await call('submitScoreBatch',batch);verify(duplicate.result?.duplicate===true&&duplicate.result?.teamScore===1,'운영 중복 집계 방지 실패');
 verify(first.result?.activity?.tapCount===1&&first.result?.activity?.version===1&&duplicate.result?.activity?.tapCount===1&&duplicate.result?.activity?.version===1,'실시간 클릭 중복 보정 메타데이터 확인 실패');
 const refreshed=await json(`https://securetoken.googleapis.com/v1/token?key=${env.VITE_FIREBASE_API_KEY}`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:refreshToken})});
 verify(refreshed.response.ok&&refreshed.data.user_id===localId,'인증 갱신 UID 보존 실패');
 const userHeaders={Authorization:`Bearer ${refreshed.data.id_token}`,'Content-Type':'application/json'};
 const saved=await json(`${event}/userScores/${localId}`,{headers:userHeaders});verify(saved.response.ok&&saved.data.fields?.score?.integerValue==='1','운영 점수 재조회 실패');
 verify(saved.data.fields?.tapCount?.integerValue==='1'&&saved.data.fields?.buildings?.mapValue?.fields?.['101']?.mapValue?.fields?.taps?.integerValue==='1','운영 개인 클릭/기여 기록 확인 실패');
 const publicTree=await json(`${event}/teamScores/101?key=${env.VITE_FIREBASE_API_KEY}`);verify(publicTree.response.ok,'비로그인 101동 트리 조회 실패');
 const publicRank=await json(`${base}/events/${env.VITE_EVENT_ID}/results/leaderboard?key=${env.VITE_FIREBASE_API_KEY}`);verify(publicRank.response.ok,'비로그인 공개 랭킹 조회 실패');
 const privateActivity=await json(`${event}/userScores/${localId}?key=${env.VITE_FIREBASE_API_KEY}`);verify(privateActivity.response.status===403,'비로그인 개인 기록 접근 차단 실패');
 const resetDenied=await call('resetBuildingExp',{eventId,buildingId:'101',requestId:randomUUID()});verify(resetDenied.error?.status==='PERMISSION_DENIED','일반 사용자 동 초기화 차단 실패');
 const stranger=await json(`${event}/userScores/not-this-user`,{headers:userHeaders});verify(stranger.response.status===403,'타인 기록 접근 차단 실패');
 const write=await json(`${event}/teamScores/101?updateMask.fieldPaths=score`,{method:'PATCH',headers:userHeaders,body:JSON.stringify({fields:{score:{integerValue:'999'}}})});verify(write.response.status===403,'직접 점수 위조 차단 실패');
 const anonymous=await call('submitScoreBatch',batch,null);verify(anonymous.error?.status==='UNAUTHENTICATED','미인증 함수 호출 차단 실패');
 console.log(JSON.stringify({projectId:project,qaEvent:eventId,hosting:true,guest:true,join:true,scoreSaved:true,duplicatePrevented:true,authUidPreserved:true,scoreReadback:true,activitySaved:true,publicTree:true,publicRank:true,privateActivityDenied:true,adminResetDenied:true,crossUserReadDenied:true,directWriteDenied:true,unauthenticatedDenied:true,liveGameScoreUntouched:true}));
}catch(error){console.error(error.message);process.exitCode=1;}
finally{if(created){const closed=await json(`${event}?updateMask.fieldPaths=status&updateMask.fieldPaths=endsAt`,{method:'PATCH',headers:adminHeaders,body:JSON.stringify({fields:{status:{stringValue:'closed'},endsAt:{timestampValue:new Date().toISOString()}}})});if(!closed.response.ok){console.error('QA 이벤트 종료 실패');process.exitCode=1;}}}
