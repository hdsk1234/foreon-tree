import {useEffect,useRef,type CSSProperties} from 'react';
import {Modal} from './Modal';
import {RIBBON_PALETTES} from '../engine/SpiralRibbon.mjs';
import {TreeRenderer} from '../engine/TreeRenderer';
import {STAR_COLORS,resolveTreeStyle,STYLE_UNLOCKS,STYLE_LABELS,MAX_ROTATION,type TreeStyle} from '../engine/treeDesign.mjs';
const names:Record<string,string>={original:'골드',ice:'아이스',rose:'로즈',mint:'민트',violet:'바이올렛'};
export function TreeCustomizer({actual,view,style,onChange,onClose,storageFailed=false}:{actual:number;view:number;style:TreeStyle;onChange:(style:TreeStyle)=>void;onClose:()=>void;storageFailed?:boolean}){
 const canvas=useRef<HTMLCanvasElement>(null),renderer=useRef<TreeRenderer|null>(null),resolved=resolveTreeStyle(style,actual,view);
 useEffect(()=>{if(!canvas.current)return;const engine=new TreeRenderer(canvas.current,{actualLevel:actual,viewingLevel:view,isOwnBuilding:false,style});renderer.current=engine;engine.start();return()=>{engine.stop();renderer.current=null;};},[]);
 useEffect(()=>{renderer.current?.update({actualLevel:actual,viewingLevel:view,isOwnBuilding:false,style});},[actual,view,style]);
 const unlocked=(key:string)=>actual>=STYLE_UNLOCKS[key];
 const badge=(key:string)=>unlocked(key)?<span className="custom-unlocked">해금</span>:<span className="custom-locked">Lv.{STYLE_UNLOCKS[key]} 해금</span>;
 const effects=[
  {key:'snow',label:STYLE_LABELS.snow,description:'조용히 내려앉는 눈'},
  {key:'aurora',label:STYLE_LABELS.aurora,description:'청록과 보라의 빛결'},
  {key:'fireworks',label:STYLE_LABELS.fireworks,description:'밤하늘에 반복해서 피어나는 빛'},
  {key:'reindeer',label:STYLE_LABELS.reindeer,description:'빨간 코를 반짝이며 트리 주위를 날아요'},
  {key:'orbits',label:STYLE_LABELS.orbits,description:'트리 주위를 도는 빛'},
  {key:'meteors',label:STYLE_LABELS.meteors,description:'하늘을 가로질러 흐르는 별'},
 ] as const;

 return <Modal title="나의 트리 꾸미기" onClose={onClose}>
  <div className="custom-preview"><canvas ref={canvas} aria-label={`${view}레벨 꾸미기 미리보기`}/><span>Lv.{view} 디자인 · Lv.{actual}까지 해금</span></div>
  <div className="custom-controls">
   <fieldset disabled={!unlocked('starColor')}><legend>{STYLE_LABELS.starColor} {badge('starColor')}</legend><div className="star-swatches">{Object.entries(STAR_COLORS).map(([key,rgb])=><button key={key} type="button" aria-label={`${names[key]} 별`} aria-pressed={resolved.starColor===key} style={{'--swatch':`rgb(${rgb})`} as CSSProperties} onClick={()=>onChange({...style,starColor:key})}><i/>{names[key]}</button>)}</div></fieldset>

   <div className="custom-option"><div><strong>{STYLE_LABELS.royal} {badge('royal')}</strong><small>트리를 감싸며 위로 흐르는 빛의 리본</small></div><button type="button" className="custom-switch" role="switch" aria-label="은하수 리본" aria-checked={unlocked('royal')&&resolved.royal} disabled={!unlocked('royal')} onClick={()=>onChange({...style,royal:!resolved.royal})}><i/></button></div>
   <fieldset className="ribbon-colors" disabled={!unlocked('royal')||!resolved.royal}><legend>{STYLE_LABELS.ribbonPalette}</legend><div className="star-swatches ribbon-swatches">{Object.entries(RIBBON_PALETTES).map(([key,palette])=><button key={key} type="button" aria-label={`${palette.label} 리본`} aria-pressed={resolved.ribbonPalette===key} style={{'--ribbon-swatch':palette.swatch} as CSSProperties} onClick={()=>onChange({...style,ribbonPalette:key})}><i/>{palette.label}</button>)}</div></fieldset>
   {effects.map(effect=><div className="custom-option" key={effect.key}><div><strong>{effect.label} {badge(effect.key)}</strong><small>{effect.description}</small></div>{<button type="button" className="custom-switch" role="switch" aria-label={effect.label} aria-checked={unlocked(effect.key)&&resolved[effect.key]} disabled={!unlocked(effect.key)} onClick={()=>onChange({...style,[effect.key]:!resolved[effect.key]})}><i/></button>}</div>)}
   <fieldset disabled={!unlocked('rotation')}><legend>{STYLE_LABELS.rotation} {badge('rotation')}<output className="rotation-value" htmlFor="tree-rotation">{resolved.rotation===0?'정지':`${resolved.rotation.toFixed(2)}×`}</output></legend><input id="tree-rotation" className="rotation-slider" type="range" min={0} max={MAX_ROTATION} step={.05} value={resolved.rotation} aria-label="트리 자전 속도" aria-valuetext={resolved.rotation===0?'자전 정지':`기본 속도의 ${resolved.rotation.toFixed(2)}배`} onChange={event=>onChange({...style,rotation:Number(event.target.value)})}/><div className="rotation-scale"><span>정지</span><span>기본 1×</span><span>{MAX_ROTATION}×</span></div></fieldset>
   <p className="custom-note">내 화면의 트리에 적용돼요. 다른 디자인에서도 해금한 기능을 사용할 수 있어요.</p>
   {storageFailed&&<p className="custom-note" role="status">이 기기에 설정을 저장하지 못했어요.</p>}
   <button type="button" className="text-button" onClick={()=>onChange({})}>기본 디자인으로 되돌리기</button>
  </div>
 </Modal>;
}
