import test from 'node:test';import assert from 'node:assert/strict';
import {validateReleaseConfig} from '../scripts/release-config.mjs';
const env={VITE_FIREBASE_API_KEY:'public-web-config',VITE_FIREBASE_AUTH_DOMAIN:'foreon-release.firebaseapp.com',VITE_FIREBASE_PROJECT_ID:'foreon-release',VITE_FIREBASE_APP_ID:'1:123:web:release',VITE_EVENT_ID:'foreon-live',VITE_USE_EMULATORS:'false'};
test('미연결 빌드·Emulator 설정·다른 프로젝트의 운영 배포를 차단한다',()=>{
 assert.throws(()=>validateReleaseConfig({}));
 for(const change of [{VITE_USE_EMULATORS:'true'},{VITE_FIREBASE_PROJECT_ID:'demo-test'},{VITE_FIREBASE_API_KEY:'demo-only'},{VITE_FIREBASE_AUTH_DOMAIN:'localhost'},{VITE_EVENT_ID:'../bad'}])assert.throws(()=>validateReleaseConfig({...env,...change}));
 assert.throws(()=>validateReleaseConfig(env,'different-project'));
 assert.deepEqual(validateReleaseConfig(env,'foreon-release'),{projectId:'foreon-release',eventId:'foreon-live'});
});
