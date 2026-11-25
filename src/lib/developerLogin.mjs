export async function authorizeStudio(password,{restore,isCurrent,authorize,now=Date.now}){
 const user=await restore();
 if(!user?.uid)throw Object.assign(new Error('관리자 인증 정보를 준비하지 못했어요. 다시 시도해 주세요.'),{code:'studio/auth-unavailable'});
 if(!isCurrent(user.uid))throw Object.assign(new Error('인증 정보가 변경됐어요. 다시 눌러 주세요.'),{code:'studio/auth-changed'});
 const result=await authorize(password);
 if(!isCurrent(user.uid))throw Object.assign(new Error('인증 정보가 변경됐어요. 다시 눌러 주세요.'),{code:'studio/auth-changed'});
 if(result?.developer!==true||!Number.isFinite(result.expiresAt)||result.expiresAt<=now())throw new Error('인증 응답을 확인하지 못했어요. 다시 시도해 주세요.');
 return result.expiresAt;
}
export function studioAuthMessage(error){
 const code=error?.code,reason=error?.details?.reason;
 if(reason==='invalid-password')return '비밀번호가 맞지 않아요. 다시 확인해 주세요.';
 if(code==='functions/resource-exhausted')return '인증 시도가 많아요. 1분 후 다시 시도해 주세요.';
 if(code==='functions/unavailable')return '인증 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.';
 if(code==='functions/deadline-exceeded'||code==='studio/timeout')return '응답이 늦어지고 있어요. 연결을 확인하고 다시 눌러 주세요.';
 if(code==='auth/network-request-failed')return '인터넷 연결을 확인하고 다시 시도해 주세요.';
 if(code==='auth/web-storage-unsupported')return '브라우저 저장 공간을 사용할 수 없어요. 브라우저 설정을 확인해 주세요.';
 if(code==='functions/unauthenticated'||code==='auth/user-token-expired'||code==='auth/invalid-user-token')return '인증 연결이 만료됐어요. 다시 눌러 주세요.';
 if(code?.startsWith('studio/'))return error.message;
 return '작업실을 열지 못했어요. 연결을 확인한 뒤 다시 시도해 주세요.';
}
export async function studioTimeout(task,milliseconds=15000){
 let timer;try{return await Promise.race([task,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(new Error('인증 응답 시간이 초과됐어요.'),{code:'studio/timeout'})),milliseconds);})]);}
 finally{clearTimeout(timer);}
}
