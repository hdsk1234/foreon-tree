export function validateReleaseConfig(env,expectedProject){
 const required=['VITE_FIREBASE_API_KEY','VITE_FIREBASE_AUTH_DOMAIN','VITE_FIREBASE_PROJECT_ID','VITE_FIREBASE_APP_ID','VITE_EVENT_ID'];
 const missing=required.filter(key=>!env[key]?.trim());
 if(missing.length)throw new Error(`운영 설정 누락: ${missing.join(', ')}. .env.production.local을 설정하세요.`);
 const project=env.VITE_FIREBASE_PROJECT_ID;
 if(env.VITE_USE_EMULATORS!=='false'||project.startsWith('demo-')||env.VITE_FIREBASE_API_KEY==='demo-only'||env.VITE_FIREBASE_APP_ID==='demo-only')throw new Error('운영 배포에 로컬 Emulator 설정을 사용할 수 없습니다.');
 if(/localhost|127\.0\.0\.1/.test(env.VITE_FIREBASE_AUTH_DOMAIN))throw new Error('운영 인증 도메인을 설정하세요.');
 if(expectedProject&&project!==expectedProject)throw new Error('배포 대상 프로젝트와 Web 앱 설정이 일치하지 않습니다.');
 if(!/^[a-zA-Z0-9_-]{1,80}$/.test(env.VITE_EVENT_ID))throw new Error('운영 이벤트 ID를 확인하세요.');
 return {projectId:project,eventId:env.VITE_EVENT_ID};
}
