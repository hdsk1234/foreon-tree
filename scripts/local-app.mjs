import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {readFile,writeFile,rename} from 'node:fs/promises';
import {getFirestore,Timestamp} from 'firebase-admin/firestore';
const project='demo-foreon-tree';
if(process.env.GCLOUD_PROJECT!==project||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080'||
 process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9099')
 throw new Error('로컬 Firebase Emulator 안에서만 실행할 수 있습니다. npm run dev:local을 사용하세요.');
// Admin SDK 역시 Emulator로만 접근한다. 실제 프로젝트를 생성하거나 수정하지 않는다.
await import('./seed.mjs');
const db=getFirestore();
const eventId='local-winter';
await db.runTransaction(async tx=>{
 const ref=db.doc(`events/${eventId}`);
 if(!(await tx.get(ref)).exists)tx.create(ref,{
  name:'로컬 개발 이벤트',status:'active',
  startsAt:Timestamp.fromMillis(Date.now()-60000),
  endsAt:Timestamp.fromMillis(Date.now()+7*86400000),
 });
});
let port;
for(let candidate=5174;candidate<=5194;candidate++){
 const available=await new Promise(resolve=>{
  const probe=createServer();
  probe.once('error',()=>resolve(false));
  probe.listen(candidate,'127.0.0.1',()=>probe.close(()=>resolve(true)));
 });
 if(available){port=candidate;break;}
}
if(!port)throw new Error('5174~5194 사이 사용 가능한 개발 서버 포트가 없습니다.');
const children=new Set();
let stopping=false;
async function stop(code=0){
 if(stopping)return;stopping=true;
 for(const child of children)child.kill('SIGTERM');
 await db.terminate();process.exit(code);
}
function launch(args,extraEnv={}){
 const child=spawn(process.execPath,args,{stdio:'inherit',env:{...process.env,...extraEnv}});
 children.add(child);
 child.once('error',error=>{console.error(error.message);void stop(1);});
 child.once('exit',code=>{children.delete(child);if(!stopping)void stop(code??1);});
 return child;
}
process.once('SIGINT',()=>void stop());process.once('SIGTERM',()=>void stop());
launch(['scripts/publish-local-rankings.mjs']);
launch(['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port),'--strictPort'],{
 VITE_FIREBASE_API_KEY:'demo-only',VITE_FIREBASE_AUTH_DOMAIN:'localhost',
 VITE_FIREBASE_PROJECT_ID:project,VITE_FIREBASE_APP_ID:'demo-only',
 VITE_FIREBASE_FUNCTIONS_REGION:'asia-northeast3',VITE_USE_EMULATORS:'true',VITE_EVENT_ID:eventId,
});
if(process.env.FOREON_LOCAL_RUN_ID){
 const stateFile=new URL('../.firebase/local-dev.json',import.meta.url);
 const state=JSON.parse(await readFile(stateFile,'utf8'));
 if(state.runId!==process.env.FOREON_LOCAL_RUN_ID||state.pid!==Number(process.env.FOREON_LOCAL_OWNER_PID))
  throw new Error('로컬 실행 소유권이 변경되었습니다.');
 const temporary=new URL(`../.firebase/local-dev.${process.pid}.tmp`,import.meta.url);
 await writeFile(temporary,JSON.stringify({...state,phase:'running',url:`http://127.0.0.1:${port}/`}));
 await rename(temporary,stateFile);
}
console.log(`\n로컬 플레이: http://127.0.0.1:${port}/ · 게스트 로그인/85개 동/점수 함수 자동 연결`);
console.log('실제 Firebase 프로젝트·결제 없음. 개발 서버를 종료하면 로컬 데이터가 초기화됩니다.\n');
