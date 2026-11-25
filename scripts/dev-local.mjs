import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdir,readFile,writeFile,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const cwd=fileURLToPath(new URL('..',import.meta.url));
const stateFile=new URL('../.firebase/local-dev.json',import.meta.url);
const runId=randomUUID();
let ownsLock=false,child=null,stopping=false;
function alive(pid){
 if(!Number.isSafeInteger(pid)||pid<1)return false;
 try{process.kill(pid,0);return true;}catch(error){return error.code==='EPERM';}
}
async function acquire(){
 await mkdir(new URL('../.firebase/',import.meta.url),{recursive:true});
 for(let attempt=0;attempt<3;attempt++){
  try{
   await writeFile(stateFile,JSON.stringify({pid:process.pid,runId,cwd,phase:'starting'}),{flag:'wx'});
   ownsLock=true;return true;
  }catch(error){if(error.code!=='EEXIST')throw error;}
  let state;
  try{state=JSON.parse(await readFile(stateFile,'utf8'));}
  catch(error){
   if(error.code==='ENOENT')continue;
   throw new Error('다른 로컬 실행이 준비 중이거나 상태 파일을 읽을 수 없습니다. 먼저 실행한 터미널을 확인하세요.');
  }
  if(alive(state.pid)){
   if(state.cwd===cwd&&/^http:\/\/127\.0\.0\.1:51(?:7[4-9]|8[0-9]|9[0-4])\/$/.test(state.url??''))
    console.log(`이미 로컬 개발 서버가 실행 중입니다.\n로컬 플레이: ${state.url}\n다시 시작하려면 기존 실행 터미널에서 Ctrl+C 후 실행하세요.`);
   else console.log('이미 로컬 환경을 시작하고 있습니다. 먼저 실행한 터미널의 준비 완료 안내를 확인하세요.');
   return false;
  }
  // 종료된 우리 실행의 상태 파일만 제거한다. 포트를 쓰는 프로세스는 종료하지 않는다.
  const latest=JSON.parse(await readFile(stateFile,'utf8'));
  if(latest.runId===state.runId)await unlink(stateFile);
 }
 throw new Error('로컬 실행 상태를 확보하지 못했습니다. 먼저 실행한 터미널을 확인하세요.');
}
async function checkPorts(){
 for(const [port,name] of [[9099,'Authentication'],[8080,'Firestore'],[5001,'Functions'],[9000,'Realtime Database']]){
  await new Promise((resolve,reject)=>{
   const probe=createServer();
   probe.once('error',()=>reject(new Error(`${name} Emulator 포트 ${port}가 이미 사용 중입니다. 기존 Emulator 터미널에서 Ctrl+C 후 다시 실행하세요. 다른 프로그램은 자동 종료하지 않았습니다.`)));
   probe.listen(port,'127.0.0.1',()=>probe.close(resolve));
  });
 }
}
function stop(){
 stopping=true;if(!child?.pid)return;
 try{
  if(process.platform==='win32')child.kill('SIGINT');
  else process.kill(-child.pid,'SIGINT');
 }catch(error){if(error.code!=='ESRCH')console.error(error.message);}
}
process.once('SIGINT',stop);process.once('SIGTERM',stop);
function run(command,args){
 return new Promise((resolve,reject)=>{
  if(stopping){resolve();return;}
  child=spawn(command,args,{cwd,stdio:'inherit',detached:process.platform!=='win32',
   env:{...process.env,DEBUG:'',FOREON_LOCAL_RUN_ID:runId,FOREON_LOCAL_OWNER_PID:String(process.pid)}});
  child.once('error',reject);
  child.once('exit',(code,signal)=>{
   child=null;
   if(code===0||stopping)resolve();else reject(new Error(`로컬 실행 종료: ${signal??code}`));
  });
 });
}
try{
 if(await acquire()){
  await checkPorts();
  await run('npm',['--prefix','functions','run','build']);
  if(!stopping)await run(process.execPath,['node_modules/firebase-tools/lib/bin/firebase.js','emulators:exec',
   '--only','auth,firestore,functions,database','--project','demo-foreon-tree','node scripts/local-app.mjs']);
 }
}catch(error){console.error(error.message);process.exitCode=1;}
finally{
 if(ownsLock){
  try{const state=JSON.parse(await readFile(stateFile,'utf8'));if(state.runId===runId)await unlink(stateFile);}
  catch(error){if(error.code!=='ENOENT')console.error(error.message);}
 }
}
