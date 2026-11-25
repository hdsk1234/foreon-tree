// Firebase CLI 로그인 자격증명은 메모리에서만 사용하고 키 파일을 만들지 않는다.
import {createRequire} from 'node:module';
import {Timestamp} from 'firebase-admin/firestore';
import {loadEnv} from 'vite';
import {validateReleaseConfig} from './release-config.mjs';
import {apartmentId,apartment,complexes,buildings} from './initial-data.mjs';
const target=process.argv[process.argv.indexOf('--project')+1];
if(!process.argv.includes('--project')||!target||target.startsWith('demo-'))throw new Error('--project로 실제 운영 프로젝트를 명시하세요.');
if(process.env.FIRESTORE_EMULATOR_HOST||process.env.FIREBASE_AUTH_EMULATOR_HOST)throw new Error('운영 초기화에 Emulator 환경을 사용할 수 없습니다.');
const env={...loadEnv('production',process.cwd(),'VITE_'),...Object.fromEntries(Object.entries(process.env).filter(([key])=>key.startsWith('VITE_')))};
const release=validateReleaseConfig(env,target),require=createRequire(import.meta.url),auth=require('firebase-tools/lib/auth');
const account=auth.getProjectDefaultAccount(process.cwd());if(!account)throw new Error('먼저 firebase login으로 운영 계정에 로그인하세요.');
const token=await auth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform','https://www.googleapis.com/auth/firebase']);
const base=`https://firestore.googleapis.com/v1/projects/${target}/databases/(default)/documents`;
let created=0;
function encode(value){
 if(value instanceof Timestamp)return {timestampValue:value.toDate().toISOString()};
 if(value===null)return {nullValue:null};
 if(typeof value==='string')return {stringValue:value};
 if(typeof value==='boolean')return {booleanValue:value};
 if(typeof value==='number')return Number.isInteger(value)?{integerValue:String(value)}:{doubleValue:value};
 if(Array.isArray(value))return {arrayValue:{values:value.map(encode)}};
 return {mapValue:{fields:Object.fromEntries(Object.entries(value).map(([key,v])=>[key,encode(v)]))}};
}
function decode(fields){return Object.fromEntries(Object.entries(fields??{}).map(([key,value])=>[key,'integerValue' in value?Number(value.integerValue):'doubleValue' in value?value.doubleValue:'stringValue' in value?value.stringValue:null]));}
async function request(path,options={}){
 const r=await fetch(`${base}/${path}`,{...options,headers:{Authorization:`Bearer ${token.access_token}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(20000)});
 const data=await r.json();if(!r.ok&&r.status!==409)throw new Error(`Firestore ${r.status}: ${data.error?.message??'request failed'}`);return data;
}
async function createIfMissing(path,data){
 const split=path.lastIndexOf('/'),collection=path.slice(0,split),id=path.slice(split+1);
 const result=await request(`${collection}?documentId=${encodeURIComponent(id)}`,{method:'POST',body:JSON.stringify({fields:encode(data).mapValue.fields})});
 if(!result.error)created++;
}
try{
 await createIfMissing(`apartments/${apartmentId}`,apartment);
 for(const {id,...data} of complexes)await createIfMissing(`apartments/${apartmentId}/complexes/${id}`,{...data,apartmentId});
 for(const {id,...data} of buildings)await createIfMissing(`apartments/${apartmentId}/buildings/${id}`,data);
 const event=`events/${release.eventId}`;
 await createIfMissing(event,{name:'우리 동의 겨울',status:'active',startsAt:Timestamp.now(),endsAt:null});
 for(const b of buildings)await createIfMissing(`${event}/teamScores/${b.id}`,{buildingId:b.id,complexId:b.complexId,score:0,revision:0,actualLevel:1,updatedAt:Timestamp.now()});
 const scores=await request(`${event}/teamScores?pageSize=100`),byId=new Map((scores.documents??[]).map(d=>[d.name.split('/').at(-1),decode(d.fields)]));
 const {levelForScore}=await import('../src/lib/experience.mjs');
 const sorted=buildings.map(b=>({buildingId:b.id,buildingNumber:b.buildingNumber,complexId:b.complexId,score:byId.get(b.id)?.score??0,revision:byId.get(b.id)?.revision??0,actualLevel:levelForScore(byId.get(b.id)?.score??0)})).sort((a,b)=>b.score-a.score||a.buildingNumber-b.buildingNumber);
 const rows=sorted.map((row,i)=>({...row,rank:sorted.findIndex(other=>other.score===row.score)+1}));
 await createIfMissing(`${event}/results/leaderboard`,{rows,updatedAt:Timestamp.now()});
 console.log(JSON.stringify({projectId:target,eventId:release.eventId,buildings:buildings.length,created,existingDocumentsPreserved:true}));
}catch(error){console.error(error.message);process.exitCode=1;}
