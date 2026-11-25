import {createHash,scryptSync,timingSafeEqual} from 'node:crypto';
import {getFirestore,Timestamp} from 'firebase-admin/firestore';
import {HttpsError,onCall} from 'firebase-functions/v2/https';
function config(){
 const {DEV_PASSWORD_SALT:salt,DEV_PASSWORD_HASH:hash}=process.env;
 if(!salt||!hash)throw new HttpsError('unavailable','개발자 접근 설정이 없습니다.');
 // 비밀번호 변경 시 이전 세션도 무효화한다. 전용 링크 설정에는 의존하지 않는다.
 const accessId=createHash('sha256').update(`${salt}:${hash}`).digest('hex');
 return {salt,hash,accessId};
}
function uid(request:{auth?:{uid:string}}){if(!request.auth)throw new HttpsError('unauthenticated','로그인이 필요합니다.');return request.auth.uid;}
export function developerAccessId(){return config().accessId;}
function equal(a:string,b:string){const x=Buffer.from(a,'hex'),y=Buffer.from(b,'hex');return x.length===y.length&&timingSafeEqual(x,y);}
const options={region:'asia-northeast3',maxInstances:2,minInstances:0,timeoutSeconds:30};
export const authorizeDeveloper=onCall(options,async request=>{
 const user=uid(request),{salt,hash,accessId}=config();
 const password=request.data?.password;
 if(typeof password!=='string'||password.length>128)throw new HttpsError('permission-denied','접근할 수 없습니다.');
 const db=getFirestore(),gate=db.doc(`developerGates/${accessId}`),now=Date.now();
 // 비밀번호 검증 전에 전역 시도 횟수를 원자적으로 제한한다. 익명 UID 교체로 우회할 수 없다.
 await db.runTransaction(async tx=>{const old=await tx.get(gate),recent=now-(old.get('windowAt')??0)<60000;
  if(recent&&(old.get('attempts')??0)>=10)throw new HttpsError('resource-exhausted','잠시 후 다시 시도해 주세요.');
  tx.set(gate,{windowAt:recent?old.get('windowAt'):now,attempts:recent?(old.get('attempts')??0)+1:1},{merge:true});});
 if(!equal(scryptSync(password,salt,64).toString('hex'),hash))
  throw new HttpsError('permission-denied','비밀번호를 확인해 주세요.',{reason:'invalid-password'});
 const expiresAt=Timestamp.fromMillis(now+2*3600000);
 await db.doc(`developerSessions/${user}`).set({accessId,authMethod:'password',expiresAt});
 return {developer:true,expiresAt:expiresAt.toMillis()};
});
export async function requireDeveloper(user:string,tx?:FirebaseFirestore.Transaction){
 const {accessId}=config(),db=getFirestore();
 const ref=db.doc(`developerSessions/${user}`);
 const session=await (tx?tx.get(ref):ref.get());
 const reason=!session.exists?'session-missing':session.get('accessId')!==accessId?'config-mismatch':session.get('authMethod')!=='password'?'password-required':!(session.get('expiresAt') instanceof Timestamp)?'invalid-expiry':session.get('expiresAt').toMillis()<=Date.now()?'expired':null;
 if(reason)throw new HttpsError('permission-denied','개발자 인증이 필요합니다.',{reason});
 return {developer:true,expiresAt:session.get('expiresAt').toMillis()};
}
export const developerSession=onCall(options,async request=>{
 return requireDeveloper(uid(request));
});
