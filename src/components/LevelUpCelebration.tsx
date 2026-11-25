import {useEffect,useRef,type CSSProperties} from 'react';
import {paintPromotion,promotionFor} from '../engine/PromotionScene.mjs';
export type Promotion={id:number;level:number;buildingId:string};
export function LevelUpCelebration({event,onClose}:{event:Promotion;onClose:()=>void}){
 const canvas=useRef<HTMLCanvasElement>(null),close=useRef(onClose);close.current=onClose;
 const profile=promotionFor(event.level);
 useEffect(()=>{
  const surface=canvas.current;if(!surface)return;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let frame=0;const start=performance.now(),duration=reduced?2200:profile.duration*1000;
  const render=(now:number)=>{
   const rect=surface.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);
   const w=Math.round(rect.width*dpr),h=Math.round(rect.height*dpr);
   if(surface.width!==w||surface.height!==h){surface.width=w;surface.height=h;}
   const ctx=surface.getContext('2d')!;ctx.setTransform(dpr,0,0,dpr,0,0);
   paintPromotion(ctx,rect.width,rect.height,event.level,(now-start)/1000,reduced);
   if(now-start<duration)frame=requestAnimationFrame(render);else close.current();
  };
  frame=requestAnimationFrame(render);return()=>cancelAnimationFrame(frame);
 },[event.id,event.level,profile.duration]);
 return <div className="promotion" style={{'--promotion-color':profile.color,'--promotion-accent':profile.accent,'--promotion-duration':`${profile.duration}s`} as CSSProperties}>
  <canvas ref={canvas} aria-hidden="true"/>
  <div className="promotion-copy" role="status"><span>{event.buildingId}동 · 새로운 성장</span><strong>LEVEL {String(event.level).padStart(2,'0')}</strong><h2>{profile.title}</h2><p>트리가 성장했어요!</p>{profile.unlocks.length>0&&<div className="promotion-unlocks"><span>새로운 기능 해금</span><strong>{profile.unlocks.join(' · ')}</strong><small>트리 꾸미기에서 사용할 수 있어요</small></div>}</div>
  <button className="promotion-dismiss icon-button" aria-label="레벨업 연출 닫기" onClick={onClose}>×</button>
 </div>;
}
