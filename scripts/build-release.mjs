import {loadEnv} from 'vite';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {validateReleaseConfig} from './release-config.mjs';
const cwd=fileURLToPath(new URL('..',import.meta.url));
try{
 const env={...loadEnv('production',cwd,'VITE_'),...Object.fromEntries(Object.entries(process.env).filter(([key])=>key.startsWith('VITE_')))};
 const release=validateReleaseConfig(env,process.env.GCLOUD_PROJECT);
 console.log(`운영 설정 확인: ${release.projectId} / ${release.eventId}`);
 if(!process.argv.includes('--check-only'))for(const args of [['node_modules/typescript/bin/tsc','--noEmit'],['node_modules/vite/bin/vite.js','build','--mode','production']]){
  await new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{cwd,stdio:'inherit',env:{...process.env,...env}});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('운영 빌드 실패')));});
 }
}catch(error){console.error(error.message);process.exitCode=1;}
