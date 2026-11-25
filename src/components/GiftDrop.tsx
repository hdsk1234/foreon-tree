import type {Gift} from '../lib/OptimisticScore.mjs';
export function GiftDrop({gift,opening=false,onOpen}:{gift:Gift;opening?:boolean;onOpen:()=>void}){
 return <button className="gift-drop" onClick={onOpen} disabled={opening} aria-label={`선물 열기: 60초 동안 경험치 ${gift.multiplier}배, 콤보와 중첩`}><span className="gift-spark" aria-hidden="true">✧</span><span className="gift-box" aria-hidden="true"><i/><b/></span><strong>{opening?'열고 있어요…':'선물이 도착했어요!'}</strong><small>60초 선물 ×{gift.multiplier} · 콤보 중첩</small></button>;
}
