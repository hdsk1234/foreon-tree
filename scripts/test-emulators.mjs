import {spawn} from 'node:child_process';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const cwd=fileURLToPath(new URL('..',import.meta.url));
const configFile=new URL(`../.firebase-integration-${process.pid}.json`,import.meta.url);
const config=JSON.parse(await readFile(new URL('../firebase.json',import.meta.url),'utf8'));
// 사용자 개발 서버와 프로젝트/포트를 분리한다. 테스트 데이터는 운영/개발 데이터와 섞지 않는다.
config.database={rules:'database.rules.json'};
config.emulators={database:{port:9100},auth:{port:9199},firestore:{port:8180,websocketPort:9250},functions:{port:5101},
 hub:{port:4411},logging:{port:4511},eventarc:{port:9398},tasks:{port:9598},ui:{enabled:false},singleProjectMode:true};
await writeFile(configFile,JSON.stringify(config));
let child;
const stop=()=>child?.kill('SIGINT');
process.once('SIGINT',stop);process.once('SIGTERM',stop);
try{
 const code=await new Promise((resolve,reject)=>{
  child=spawn(process.execPath,['node_modules/firebase-tools/lib/bin/firebase.js','--config',fileURLToPath(configFile),
   'emulators:exec','--only','auth,firestore,functions,database','--project','demo-foreon-tests',
   process.argv.includes('--browser')?'node scripts/persistence-browser.mjs':'node --test --test-concurrency=1 tests/firestore.rules.test.mjs tests/functions.integration.mjs tests/persistence.integration.mjs tests/game-features.integration.mjs tests/admin.integration.mjs tests/presence.rules.test.mjs tests/ranking-cost.integration.mjs'],
   {cwd,stdio:'inherit',env:{...process.env,DEBUG:'',FOREON_TEST_FUNCTIONS_HOST:'127.0.0.1:5101'}});
  child.once('error',reject);child.once('exit',resolve);
 });
 process.exitCode=code??1;
}finally{await unlink(configFile);}
