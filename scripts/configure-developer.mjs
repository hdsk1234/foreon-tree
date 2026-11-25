import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomBytes,scryptSync} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
let input='';for await(const chunk of process.stdin)input+=chunk;
const password=input.trim();
if(password.length<10||password.length>128)throw new Error('10~128자의 비밀번호를 표준 입력으로 전달하세요.');
const salt=randomBytes(24).toString('hex');
const path=new URL('../functions/.env.local',import.meta.url);
let previous='';try{previous=await readFile(path,'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
const entries={DEV_PASSWORD_SALT:salt,DEV_PASSWORD_HASH:scryptSync(password,salt,64).toString('hex')};
const kept=previous.split('\n').filter(line=>![...Object.keys(entries),'DEV_LINK_HASH'].some(name=>line.startsWith(name+'='))).join('\n').trim();
await writeFile(path,[kept,...Object.entries(entries).map(([name,value])=>`${name}=${value}`)].filter(Boolean).join('\n')+'\n',{mode:0o600});
let base='http://127.0.0.1:5174/';try{base=JSON.parse(await readFile(new URL('../.firebase/local-dev.json',import.meta.url),'utf8')).url??base;}catch{}
const url=`${base}developer`;
await mkdir(new URL('../.firebase/',import.meta.url),{recursive:true});await writeFile(new URL('../.firebase/developer-link.txt',import.meta.url),url+'\n',{mode:0o600});
// 실행 중인 Emulator도 새 환경 설정을 다시 읽도록 함수 변경 감지를 유도한다.
await new Promise((resolve,reject)=>{
 const child=spawn('npm',['--prefix','functions','run','build'],{cwd:fileURLToPath(new URL('..',import.meta.url)),stdio:'inherit'});
 child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('함수 빌드 실패. 의존성 설치 상태를 확인하세요.')));
});
console.log(url);
