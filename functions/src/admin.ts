import {getAuth,type UserRecord} from 'firebase-admin/auth';
import {getFirestore,Timestamp,type Firestore} from 'firebase-admin/firestore';
import {createHash} from 'node:crypto';
import {getDatabaseWithUrl} from 'firebase-admin/database';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {requireDeveloper,developerAccessId} from './developer';
export const ADMIN_PAGE_SIZE=25,ADMIN_CACHE_MS=5*60000;

type AccountCache={at:number;users:UserRecord[];partial:boolean};
let cache:AccountCache|null=null;
let loading:Promise<AccountCache>|null=null;
async function accounts(){
 if(cache&&Date.now()-cache.at<60000)return cache;
 if(loading)return loading;
 loading=(async()=>{
  const users:UserRecord[]=[];let token:string|undefined;
  do{const page=await getAuth().listUsers(1000,token);users.push(...page.users);token=page.pageToken;}while(token&&users.length<10000);
  cache={at:Date.now(),users,partial:Boolean(token)};return cache;
 })();try{return await loading;}finally{loading=null;}
}
async function buildReport(db:Firestore,eventId:string,offset:number,uid:string){
 const [internal,authData,participantCount]=await Promise.all([
  db.collection('developerSessions').get(),accounts(),db.collection(`events/${eventId}/participants`).count().get()
 ]);
 const internalIds=new Set(internal.docs.map(doc=>doc.id));internalIds.add(uid);
 const users=authData.users.filter(user=>!internalIds.has(user.uid)).sort((a,b)=>Date.parse(b.metadata.creationTime)-Date.parse(a.metadata.creationTime)||a.uid.localeCompare(b.uid));
 const page=users.slice(offset,offset+ADMIN_PAGE_SIZE);
 const refs=page.flatMap(user=>[db.doc(`users/${user.uid}`),db.doc(`events/${eventId}/participants/${user.uid}`),db.doc(`events/${eventId}/userScores/${user.uid}`)]);
 const docs=refs.length?await db.getAll(...refs):[];
 const kstDay=(time:string)=>new Date(time).toLocaleDateString('en-CA',{timeZone:'Asia/Seoul'});
 const today=kstDay(new Date().toISOString()),guest=users.filter(user=>user.providerData.length===0).length;
 return {
  at:Date.now(),accountsAt:authData.at,partial:authData.partial,pageSize:ADMIN_PAGE_SIZE,
  summary:{total:users.length,guest,linked:users.length-guest,disabled:users.filter(user=>user.disabled).length,today:users.filter(user=>kstDay(user.metadata.creationTime)===today).length,participants:participantCount.data().count},
  rows:page.map((user,index)=>{
   const [profile,participant,score]=docs.slice(index*3,index*3+3);
   return {uid:user.uid,name:user.displayName??'',email:user.email??'',providers:user.providerData.map(provider=>provider.providerId),disabled:user.disabled,
    createdAt:Date.parse(user.metadata.creationTime),lastSignInAt:user.metadata.lastSignInTime?Date.parse(user.metadata.lastSignInTime):null,
    buildingId:participant.get('buildingId')??profile.get('buildingId')??null,joined:participant.exists,score:score.get('score')??0,taps:score.get('tapCount')??null};
  }),nextOffset:offset+page.length<users.length?offset+page.length:null
 };
}
type Report=Awaited<ReturnType<typeof buildReport>>;
const reportsLoading=new Map<string,Promise<Report>>();
export const adminDashboard=onCall({region:'asia-northeast3',maxInstances:2,timeoutSeconds:60},async request=>{
 if(!request.auth)throw new HttpsError('unauthenticated','관리자 인증이 필요합니다.');
 // Check the live password session on every request, including cache hits.
 const uid=request.auth.uid,session=await requireDeveloper(uid),accessId=developerAccessId(),db=getFirestore();
 const eventId=request.data?.eventId,offset=request.data?.offset??0,refresh=request.data?.refresh??false;
 if(typeof eventId!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(eventId)||!Number.isInteger(offset)||offset<0||offset>10000||typeof refresh!=='boolean')throw new HttpsError('invalid-argument','조회 범위를 확인하세요.');
 const gate=db.doc(`adminDashboardRequests/${uid}`);
 await db.runTransaction(async tx=>{const old=await tx.get(gate),now=Date.now();if(now-(old.get('at')??0)<2000)throw new HttpsError('resource-exhausted','잠시 후 다시 조회하세요.');tx.set(gate,{at:now});});
 const key=createHash('sha256').update(JSON.stringify([eventId,offset])).digest('hex'),cacheRef=db.doc(`adminDashboardCache/${key}`),snapshot=await cacheRef.get();
 const cached=snapshot.get('payload') as Report|undefined,age=Date.now()-(cached?.at??0);
 let report:Report,cacheHit=false;
 if(snapshot.get('accessId')===accessId&&cached&&age>=0&&age<ADMIN_CACHE_MS&&(!refresh||age<30000)){report=cached;cacheHit=true;}
 else{
  const loadingKey=`${key}:${accessId}`;
  let pending=reportsLoading.get(loadingKey);
  if(!pending){pending=(async()=>{const value=await buildReport(db,eventId,offset,uid);await cacheRef.set({accessId,payload:value,expiresAt:Timestamp.fromMillis(value.at+ADMIN_CACHE_MS)});return value;})();reportsLoading.set(loadingKey,pending);}
  try{report=await pending;}finally{if(reportsLoading.get(loadingKey)===pending)reportsLoading.delete(loadingKey);}
 }
 const projectId=process.env.GCLOUD_PROJECT||process.env.GOOGLE_CLOUD_PROJECT;
 if(!projectId)throw new HttpsError('unavailable','프로젝트 설정이 없습니다.');
 const databaseURL=process.env.PRESENCE_DATABASE_URL||`https://${projectId}-default-rtdb.asia-southeast1.firebasedatabase.app`;
 await getDatabaseWithUrl(databaseURL).ref().update({[`adminAccess/${uid}`]:{accessId,expiresAt:session.expiresAt},adminConfig:{accessId}});
 return {...report,cacheHit,expiresAt:session.expiresAt};
});
