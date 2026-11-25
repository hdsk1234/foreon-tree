import {Modal} from './Modal';
export function AuthChoices({ready,busy,error,onGuest,onGoogle,onClose}:{ready:boolean;busy:'guest'|'google'|null;error:string;onGuest:()=>void;onGoogle:()=>void;onClose:()=>void}){
 return <Modal title="어떻게 시작할까요?" onClose={()=>{if(!busy)onClose();}}><p>로그인하고 우리 동의 트리를 함께 밝혀요.</p><div className="welcome-actions">
   <button className="google-button" disabled={!ready||Boolean(busy)} onClick={onGoogle}><svg aria-hidden="true" viewBox="0 0 48 48" width="20" height="20"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.6c3.9-3.6 6.1-8.9 6.1-15Z"/><path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.5l-6.6-5.1c-1.8 1.2-4.1 1.9-6.9 1.9-5.3 0-9.8-3.6-11.4-8.4H5.8v5.3A20.4 20.4 0 0 0 24 44Z"/><path fill="#FBBC05" d="M12.6 27.9a12.3 12.3 0 0 1 0-7.8v-5.3H5.8a20 20 0 0 0 0 18.4Z"/><path fill="#EA4335" d="M24 11.7c3 0 5.7 1 7.8 3.1l5.8-5.8A19.5 19.5 0 0 0 24 4 20.4 20.4 0 0 0 5.8 14.8l6.8 5.3c1.6-4.8 6.1-8.4 11.4-8.4Z"/></svg>{busy==='google'?'Google 연결 중…':'Google로 시작'}</button>
   <button className="guest-button" disabled={!ready||Boolean(busy)} onClick={onGuest}>{busy==='guest'?'시작하는 중…':'게스트로 시작'}</button>
   <p className="welcome-note">Google로 로그인하면 다른 기기에서도 이어갈 수 있어요.</p>
   {!ready&&<p className="welcome-status" role="status">로그인 정보를 확인하고 있어요.</p>}
   {error&&<p className="welcome-error" role="alert">{error}</p>}
  </div></Modal>;
}
