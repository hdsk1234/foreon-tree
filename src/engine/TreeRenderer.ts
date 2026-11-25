import {createParticleScene} from './ParticleScene';
import type {TreeStyle} from './treeDesign.mjs';
import {canScore} from './gallery.mjs';
export type TreeState={actualLevel:number;viewingLevel:number;isOwnBuilding:boolean;style?:TreeStyle};
// 출력, DPR, 애니메이션 수명, 시각적 잠금을 담당한다. 디자인은 별도 모듈.
export class TreeRenderer {
  private frame=0;
  private motion=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
  private lastTime=0;
  private low=document.createElement('canvas');
  private scene=document.createElement('canvas');
  private particles=createParticleScene();
  constructor(private canvas:HTMLCanvasElement,private state:TreeState){}
  update(state:TreeState){
    if(state.viewingLevel!==this.state.viewingLevel||state.isOwnBuilding!==this.state.isOwnBuilding)
      this.particles.clearBursts();
    this.state=state;
  }
  tap(x:number,y:number){
    if(canScore(this.state.actualLevel,this.state.viewingLevel,this.state.isOwnBuilding))
      this.particles.burst(x,y);
  }
  start(){
    this.stop();
    const tick=(ms:number)=>{
      const dt=this.lastTime?Math.min((ms-this.lastTime)/1000,.05):0;
      this.lastTime=ms;this.draw(ms/1000,dt);
      this.frame=requestAnimationFrame(tick);
    };
    this.frame=requestAnimationFrame(tick);
  }
  stop(){cancelAnimationFrame(this.frame);this.lastTime=0;}
  private draw(time:number,dt:number){
    const rect=this.canvas.getBoundingClientRect();
    const w=Math.max(1,rect.width),h=Math.max(1,rect.height),dpr=Math.min(devicePixelRatio||1,2);
    const pixelsW=Math.round(w*dpr),pixelsH=Math.round(h*dpr);
    if(this.canvas.width!==pixelsW||this.canvas.height!==pixelsH){this.canvas.width=pixelsW;this.canvas.height=pixelsH;}
    const out=this.canvas.getContext('2d')!;
    out.setTransform(dpr,0,0,dpr,0,0);
    const level=Math.max(1,Math.min(10,this.state.viewingLevel));
    if(level<=this.state.actualLevel){this.particles.paint(out,w,h,time,dt,level,this.state.style,this.state.actualLevel,this.motion?.matches??false);return;}
    if(this.scene.width!==pixelsW||this.scene.height!==pixelsH){this.scene.width=pixelsW;this.scene.height=pixelsH;}
    const sceneCtx=this.scene.getContext('2d')!;
    sceneCtx.setTransform(dpr,0,0,dpr,0,0);
    this.particles.paint(sceneCtx,w,h,time,dt,level,this.state.style,this.state.actualLevel,this.motion?.matches??false);
    const lowW=Math.max(1,Math.floor(w/17)),lowH=Math.max(1,Math.floor(h/17));
    if(this.low.width!==lowW||this.low.height!==lowH){this.low.width=lowW;this.low.height=lowH;}
    this.low.getContext('2d')!.drawImage(this.scene,0,0,lowW,lowH);
    out.imageSmoothingEnabled=false;out.drawImage(this.low,0,0,w,h);out.imageSmoothingEnabled=true;
    out.fillStyle='rgba(3,7,15,.58)';out.fillRect(0,0,w,h);
    out.save();out.textAlign='center';out.textBaseline='middle';
    out.fillStyle='#fff';out.font=`bold ${Math.min(120,w*.32,h*.3)}px Arial`;
    out.shadowColor='#fff';out.shadowBlur=15;out.fillText('?',w/2,h*.48);
    out.restore();
  }
}
