import {useEffect,useRef,useState} from 'react';
import {createParticleScene} from '../engine/ParticleScene';
import {treeGeometry} from '../engine/treeDesign.mjs';

// Share one still per level across the podium and all 85 rows. No animation loop.
const stills=new Map<number,HTMLCanvasElement>();
function treeStill(level:number){
 const cached=stills.get(level);if(cached)return cached;
 const image=document.createElement('canvas');image.width=image.height=256;
 const source=image.getContext('2d');if(!source)return null;
 createParticleScene().paint(source,256,256,0,0,level,{},level,true);
 const g=treeGeometry(256,256,level),side=Math.min(256,Math.max(g.ground-g.top+30,g.radius*2.6));
 const left=Math.max(0,Math.min(256-side,g.cx-side/2)),top=Math.max(0,Math.min(256-side,g.top-22));
 const still=document.createElement('canvas');still.width=still.height=192;
 const context=still.getContext('2d');if(!context)return null;
 context.drawImage(image,left,top,side,side,0,0,192,192);stills.set(level,still);return still;
}
export function TreePreview({level,className=''}:{level:number;className?:string}){
 const canvas=useRef<HTMLCanvasElement>(null),[available,setAvailable]=useState(true);
 useEffect(()=>{
  try{
   const image=treeStill(level),context=canvas.current?.getContext('2d');
   if(!image||!context){setAvailable(false);return;}
   context.clearRect(0,0,192,192);context.drawImage(image,0,0);setAvailable(true);
  }catch{setAvailable(false);}
 },[level]);
 return <span className={`tree-preview ${className}`} aria-hidden="true">{!available&&<span>✧</span>}<canvas ref={canvas} width={192} height={192} hidden={!available}/></span>;
}
