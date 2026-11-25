import {spawn} from 'node:child_process';
import {initializeApp} from 'firebase-admin/app';
import {getFirestore,Timestamp} from 'firebase-admin/firestore';
if(process.env.GCLOUD_PROJECT!=='demo-foreon-tests'||process.env.FIRESTORE_EMULATOR_HOST!=='127.0.0.1:8180')throw new Error('격리 Emulator에서만 실행하세요.');
const db=getFirestore(initializeApp({projectId:'demo-foreon-tests'}));
const eventId=`browser_${Date.now()}`;
await db.doc('apartments/olympic-park-foreon/buildings/101').set({complexId:'1',buildingNumber:101});
await db.doc(`events/${eventId}`).set({status:'active',startsAt:Timestamp.fromMillis(Date.now()-60000),endsAt:Timestamp.fromMillis(Date.now()+3600000)});
const child=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5195','--strictPort'],{stdio:'inherit',env:{...process.env,
 VITE_FIREBASE_PROJECT_ID:'demo-foreon-tests',VITE_FIREBASE_API_KEY:'demo-only',VITE_FIREBASE_APP_ID:'demo-only',VITE_FIREBASE_AUTH_DOMAIN:'localhost',
 VITE_USE_EMULATORS:'true',VITE_EVENT_ID:eventId,VITE_FIREBASE_AUTH_EMULATOR_PORT:'9199',VITE_FIRESTORE_EMULATOR_PORT:'8180',VITE_FUNCTIONS_EMULATOR_PORT:'5101'}});
console.log('브라우저 복구 검수: http://127.0.0.1:5195/tests/fixtures/persistence.html');
process.once('SIGINT',()=>child.kill('SIGINT'));process.once('SIGTERM',()=>child.kill('SIGTERM'));
await new Promise(resolve=>child.once('exit',resolve));await db.terminate();
