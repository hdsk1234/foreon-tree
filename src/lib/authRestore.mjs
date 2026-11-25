// 기존 사용자는 토큰 갱신 실패를 이유로 버리거나 새 익명 계정으로 교체하지 않는다.
export async function restoreGuest(auth,prepare,create,lock=task=>task()){
 await prepare();
 return lock(async()=>{await auth.authStateReady();return auth.currentUser??await create();});
}
