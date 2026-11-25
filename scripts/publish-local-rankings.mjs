if(process.env.GCLOUD_PROJECT!=='demo-foreon-tree'||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8080')
 throw new Error('로컬 Emulator 전용 순위 실행기입니다.');
const {default:backend}=await import('../functions/lib/index.js');
// Scheduler 대신 같은 서버 집계 함수를 로컬에서 호출한다. 운영 주기와 동일한 1분.
while(true){
 await backend.publishRankings.run({scheduleTime:new Date().toISOString()});
 await new Promise(resolve=>setTimeout(resolve,60000));
}
