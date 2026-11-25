import {initializeApp} from 'firebase/app';
import {initializeAuth,browserPopupRedirectResolver,connectAuthEmulator,browserLocalPersistence,setPersistence,signInAnonymously,
  EmailAuthProvider,GoogleAuthProvider,linkWithCredential,linkWithPopup,sendEmailVerification,
  sendPasswordResetEmail,signInWithPopup,signOut,inMemoryPersistence} from 'firebase/auth';
import {initializeFirestore,persistentLocalCache,persistentMultipleTabManager,connectFirestoreEmulator} from 'firebase/firestore';
import {getFunctions,connectFunctionsEmulator,httpsCallable} from 'firebase/functions';
import {getDatabase,connectDatabaseEmulator,type Database} from 'firebase/database';
import {restoreGuest} from './authRestore.mjs';
const env=import.meta.env;
export const projectId=env.VITE_FIREBASE_PROJECT_ID??'';
export const configured=Boolean(env.VITE_FIREBASE_API_KEY&&env.VITE_FIREBASE_PROJECT_ID&&env.VITE_FIREBASE_APP_ID);
const app=configured?initializeApp({apiKey:env.VITE_FIREBASE_API_KEY,authDomain:env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:env.VITE_FIREBASE_PROJECT_ID,appId:env.VITE_FIREBASE_APP_ID}):null;
// 모든 진입점에서 같은 영속 계층으로 시작해 탭 사이의 자동 persistence 이동을 피한다.
export const auth=app?initializeAuth(app,{persistence:browserLocalPersistence,popupRedirectResolver:browserPopupRedirectResolver}):null;
export const db=app?initializeFirestore(app,{localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})}):null;
export const functions=app?getFunctions(app,env.VITE_FIREBASE_FUNCTIONS_REGION||'asia-northeast3'):null;
if(env.VITE_USE_EMULATORS==='true'&&auth&&db&&functions){
  if(!env.VITE_FIREBASE_PROJECT_ID.startsWith('demo-')) throw new Error('로컬 Emulator에는 demo- 프로젝트 ID를 사용하세요.');
  connectAuthEmulator(auth,`http://127.0.0.1:${env.VITE_FIREBASE_AUTH_EMULATOR_PORT||9099}`,{disableWarnings:true});
  connectFirestoreEmulator(db,'127.0.0.1',Number(env.VITE_FIRESTORE_EMULATOR_PORT||8080));connectFunctionsEmulator(functions,'127.0.0.1',Number(env.VITE_FUNCTIONS_EMULATOR_PORT||5001));
}
let persistenceReady:Promise<void>|null=null;
let creating:Promise<import('firebase/auth').User>|null=null;
export async function guest(){
 if(!auth)return null;
 const client=auth;
 return restoreGuest(client,()=>persistenceReady??=(setPersistence(client,browserLocalPersistence).catch(error=>{persistenceReady=null;throw error;})),
  ()=>creating??=(signInAnonymously(client).then(result=>result.user).finally(()=>{creating=null;})),
  async task=>navigator.locks?await navigator.locks.request(`foreon-auth:${projectId}`,async()=>await task()):await task());
}
export function loginGoogle(){
 if(!auth)throw new Error('Firebase 설정이 필요합니다.');
 const provider=new GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});
 return signInWithPopup(auth,provider);
}
// 개발자 소유자 인증은 게임 계정/로그아웃과 분리된 Auth 저장 공간을 사용한다.
const studioApp=app?initializeApp(app.options,'foreon-developer'):null;
const presenceInstances=new Map<boolean,Database>();
export function presenceDatabase(admin=false){
 const source=admin?studioApp:app;if(!source)return null;
 const cached=presenceInstances.get(admin);if(cached)return cached;
 const url=env.VITE_PRESENCE_DATABASE_URL||`https://${projectId}-default-rtdb.asia-southeast1.firebasedatabase.app`;
 const database=getDatabase(source,url);
 if(env.VITE_USE_EMULATORS==='true')connectDatabaseEmulator(database,'127.0.0.1',Number(env.VITE_DATABASE_EMULATOR_PORT||9000));
 presenceInstances.set(admin,database);return database;
}
export const studioAuth=studioApp?initializeAuth(studioApp,{persistence:[browserLocalPersistence,inMemoryPersistence]}):null;
export const studioFunctions=studioApp?getFunctions(studioApp,env.VITE_FIREBASE_FUNCTIONS_REGION||'asia-northeast3'):null;
if(env.VITE_USE_EMULATORS==='true'&&studioAuth&&studioFunctions){
 connectAuthEmulator(studioAuth,`http://127.0.0.1:${env.VITE_FIREBASE_AUTH_EMULATOR_PORT||9099}`,{disableWarnings:true});
 connectFunctionsEmulator(studioFunctions,'127.0.0.1',Number(env.VITE_FUNCTIONS_EMULATOR_PORT||5001));
}
let studioPersistence:Promise<void>|null=null,studioCreating:Promise<import('firebase/auth').User>|null=null;
export async function studioGuest(){
 if(!studioAuth)return null;const client=studioAuth;
 return restoreGuest(client,()=>studioPersistence??=(setPersistence(client,browserLocalPersistence).catch(()=>setPersistence(client,inMemoryPersistence)).catch(error=>{studioPersistence=null;throw error;})),
  ()=>studioCreating??=(signInAnonymously(client).then(result=>result.user).finally(()=>{studioCreating=null;})),
  async task=>navigator.locks?await navigator.locks.request(`foreon-studio-auth:${projectId}`,async()=>await task()):await task());
}
// 충돌 예외는 상위 UI로 전달하며 로그인/삭제/점수 병합을 자동 실행하지 않는다.
export async function linkEmail(email:string,password:string){
  if(!auth?.currentUser||!functions) throw new Error('로그인이 필요합니다.');
  const linked=await linkWithCredential(auth.currentUser,EmailAuthProvider.credential(email,password));
  await linked.user.getIdToken(true);await httpsCallable(functions,'syncAccount')({});
  await sendEmailVerification(linked.user);return linked.user;
}
export async function linkGoogle(){
  if(!auth?.currentUser||!functions) throw new Error('로그인이 필요합니다.');
  const linked=await linkWithPopup(auth.currentUser,new GoogleAuthProvider());
  await linked.user.getIdToken(true);await httpsCallable(functions,'syncAccount')({});return linked.user;
}
export async function verifyEmail(){if(auth?.currentUser) await sendEmailVerification(auth.currentUser);}
export async function resetPassword(email:string){if(auth) await sendPasswordResetEmail(auth,email);}
export async function logout(){if(auth) await signOut(auth);}
export async function removeAccount(){if(functions) await httpsCallable(functions,'deleteAccount')({});if(auth) await signOut(auth);}
