import {projectRibbon} from './SpiralRibbon.mjs';
import {TREE_DESIGNS,STAR_COLORS,treeGeometry,resolveTreeStyle,type TreeStyle} from './treeDesign.mjs';
export const PARTICLE_COUNTS=[280,450,650,850,1100,1400,1700,2100,2500,2900] as const;
type Burst={x:number;y:number;vx:number;vy:number;life:number;size:number};
export function createParticleScene(){
 let ctx:CanvasRenderingContext2D,w=0,h=0,level=1,clock=0,rotation=0,reduced=false;
 let style=resolveTreeStyle({},1,1),bursts:Burst[]=[];
 let seed=231;const random=()=>{seed=seed*16807%2147483647;return seed/2147483647;};
 const particles=Array.from({length:2900},()=>({h:Math.sqrt(random()),angle:random()*Math.PI*2,radius:.58+random()*.42,size:.45+random()*1.05,phase:random()*Math.PI*2,color:random()}));
 const snow=Array.from({length:80},()=>({x:random(),y:random(),speed:.018+random()*.025,size:.4+random()*1.3,phase:random()*6}));
 const circle=(x:number,y:number,r:number,color:string)=>{ctx.beginPath();ctx.arc(x,y,Math.max(.1,r),0,Math.PI*2);ctx.fillStyle=color;ctx.fill();};
 function glow(x:number,y:number,r:number,color:string){const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);}
 function line(points:number[][],color:string|CanvasGradient,width=1,close=false){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));if(close)ctx.closePath();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
 function diamond(x:number,y:number,size:number,color:string){ctx.beginPath();ctx.moveTo(x,y-size);ctx.lineTo(x+size*.65,y);ctx.lineTo(x,y+size);ctx.lineTo(x-size*.65,y);ctx.closePath();ctx.fillStyle=color;ctx.fill();line([[x,y-size],[x,y+size]],'#ffffff90',.6);}
 function star(x:number,y:number,r:number,color:string){glow(x,y,r*4,`rgba(${color},.22)`);ctx.beginPath();for(let i=0;i<10;i++){const a=i*Math.PI/5-Math.PI/2,s=i%2?r*.42:r;const px=x+Math.cos(a)*s,py=y+Math.sin(a)*s;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.closePath();ctx.fillStyle=`rgb(${color})`;ctx.fill();}
 const geometry=()=>treeGeometry(w,h,level);
 function aurora(){
  if(!style.aurora)return;
  // 여러 높이의 반투명 수직 광막: 굵은 사인파 선 대신 빛의 커튼을 겹친다.
  for(let layer=0;layer<3;layer++){
   const rgb=['67,235,185','94,175,249','171,115,236'][layer];
   const g=ctx.createLinearGradient(0,0,0,1);g.addColorStop(0,`rgba(${rgb},0)`);g.addColorStop(.62,`rgba(${rgb},.018)`);g.addColorStop(.9,`rgba(${rgb},.16)`);g.addColorStop(1,`rgba(${rgb},0)`);
   for(let x=-4;x<w+4;x+=6){
    const u=x/w,bend=Math.sin(u*5.6+clock*.16+layer*.9)*h*.05+Math.sin(u*11-clock*.12)*h*.016;
    const y=h*(.03+layer*.045)+bend,extent=h*(.17+.14*(.5+.5*Math.sin(u*8+layer+clock*.12)));
    ctx.save();ctx.translate(x,y);ctx.scale(1,extent);ctx.fillStyle=g;ctx.fillRect(0,0,7,1);ctx.restore();
   }
  }
 }
 function ground(){
  const {cx,ground,radius}=geometry();
  glow(cx,ground,radius*1.3,level>=8?'rgba(157,130,231,.14)':'rgba(92,170,175,.08)');
  for(let i=0;i<(level>=9?3:1);i++){ctx.beginPath();ctx.ellipse(cx,ground+i*4,radius*(1.12+i*.1),7+i*3,0,0,Math.PI*2);ctx.strokeStyle=level===10?`rgba(249,218,147,${.5-i*.12})`:'rgba(155,201,222,.16)';ctx.lineWidth=level>=9?1.2:.7;ctx.stroke();}
 }
 function orbits(front:boolean){
  if(!style.orbits)return;const {cx,top,treeHeight,radius}=geometry();
  const count=level>=9?3:2;
  for(let j=0;j<count;j++){
   const points=[];for(let i=0;i<=64;i++){const a=(front?0:Math.PI)+i/64*Math.PI;points.push([cx+Math.cos(a)*(radius*1.18+j*5),top+treeHeight*(.28+j*.23)+Math.sin(a)*(10+j*4)+Math.cos(a)*radius*(j%2?.14:-.14)]);}
   line(points,level===10?'rgba(255,226,152,.6)':'rgba(186,182,255,.38)',.8);
   if(front){const a=clock*.3+j*2;diamond(cx+Math.cos(a)*radius*1.18,top+treeHeight*(.28+j*.23)+Math.sin(a)*(10+j*4)+Math.cos(a)*radius*(j%2?.14:-.14),2.3,'#e6ddff');}
  }
 }
 function tree(){
  const {cx,top,treeHeight,radius}=geometry(),profile=TREE_DESIGNS[level-1];
  glow(cx,top+treeHeight*.66,radius*1.6,`rgba(${profile.colors[0]},.1)`);
  // 가지 끝을 층층이 벌려 입체적인 수관을 만든다.
  const projected=[];
  for(let i=0;i<PARTICLE_COUNTS[level-1];i++){
   const p=particles[i],a=p.angle+rotation,depth=Math.sin(a),tier=(p.h*profile.tiers)%1;
   const branch=.77+.23*Math.pow(tier,.6),r=radius*p.h*p.radius*branch;
   projected.push({x:cx+Math.cos(a)*r,y:top+p.h*treeHeight+depth*r*.13,depth,p,opacity:(.35+.65*(depth+1)/2)*(.72+.28*Math.sin(clock*1.4+p.phase))});
  }
  projected.sort((a,b)=>a.depth-b.depth);
  for(const q of projected){const rgb=profile.colors[q.p.color<.55?0:1],size=q.p.size*(.9+(q.depth+1)*.14);circle(q.x,q.y,size,`rgba(${rgb},${q.opacity})`);if(q.p.color<.035)circle(q.x,q.y,size*3.3,`rgba(${rgb},.07)`);}
  // 가지 층을 따라 가장자리 빛을 더한다.
  if(level>=3)for(let tier=1;tier<=profile.tiers;tier++){
   const u=tier/(profile.tiers+.25),points=[];for(let i=0;i<=32;i++){const a=i/32*Math.PI;points.push([cx+Math.cos(a)*radius*u,top+treeHeight*u+Math.sin(a)*radius*u*.13]);}
   line(points,`rgba(${profile.colors[1]},${level>=7?.28:.12})`,.65);
  }
 }
 function ribbon(){
  if(!style.royal&&level!==2)return;
  // 2레벨과 완전히 같은 단일 나선. 앞뒤를 잘라 원반처럼 보이게 하지 않는다.
  const points=projectRibbon(geometry(),style.royal?clock:0,rotation,style.royal?style.ribbonPalette:'gold');
  for(const p of points){
   if(p.alpha<=0)continue;
   if(p.glow)circle(p.x,p.y,p.size*2.7,`rgba(${p.color},${p.alpha*.05})`);
   circle(p.x,p.y,p.size,`rgba(${p.color},${p.alpha})`);
  }
 }
 function ornaments(){
  if(level<3)return;const {cx,top,treeHeight,radius}=geometry();
  const count=level===3?9:level===4?17:level>=8?28:20;
  for(let i=0;i<count;i++){
   const u=.24+.7*((i*.618)%1),a=i*2.4+rotation,depth=Math.sin(a);if(depth<-.25)continue;
   const x=cx+Math.cos(a)*radius*u*.96,y=top+u*treeHeight+depth*radius*u*.13,s=(level>=8?3.8:2.7)*(w/360);
   if(level===3||level===7)diamond(x,y,s,level===3?'#ceeaff':'#e9fcff');
   else{glow(x,y,s*2.5,level===4?'rgba(255,90,128,.2)':'rgba(255,217,169,.16)');circle(x,y,s,level===4?'#e84b79':level===8?'#d9a3ff':level===5?'#a6f8df':'#ffde9b');circle(x-s*.2,y-s*.25,s*.28,'#fff6');}
  }
 }
 function reindeer(front:boolean){
  if(!style.reindeer)return;
  const {cx,top,treeHeight,radius}=geometry(),phase=clock*.32+1,depth=Math.sin(phase);
  if((depth>=0)!==front)return;
  const x=cx+Math.cos(phase)*Math.min(w*.32,radius*1.13),y=top+treeHeight*.43+depth*treeHeight*.1+Math.sin(clock*1.8)*3;
  const scale=Math.max(.55,Math.min(1.05,w/360))*(.82+.18*(depth+1)/2),direction=depth>=0?-1:1;
  ctx.save();ctx.translate(x,y);ctx.scale(scale*direction,scale);
  // 다리와 뿔을 몸통 뒤에 그려 작아도 실루엣이 분명한 루돌프를 만든다.
  for(let i=0;i<4;i++){
   const lx=-8+i*5,swing=Math.sin(clock*3+i*Math.PI*.7)*4;
   line([[lx,4],[lx+swing,12],[lx+swing+4,16]],i%2?'#8c583e':'#694532',2.7);
   line([[lx+swing+2,16],[lx+swing+6,16]],'#332a2d',2.5);
  }
  line([[-13,-2],[-21,-8]],'#e5c39a',4);
  for(const offset of [0,7]){
   const ax=12+offset;
   line([[ax,-17],[ax-2,-25],[ax-7,-32]],'#dfbd8b',1.8);
   line([[ax-2,-25],[ax+3,-30],[ax+3,-34]],'#dfbd8b',1.6);
   line([[ax-5,-29],[ax-10,-28],[ax-12,-32]],'#dfbd8b',1.5);
  }
  ctx.beginPath();ctx.ellipse(0,0,14,8,0,0,Math.PI*2);ctx.fillStyle='#b58054';ctx.fill();
  ctx.beginPath();ctx.ellipse(2,3,9,4,0,0,Math.PI*2);ctx.fillStyle='#d5a878';ctx.fill();
  ctx.beginPath();ctx.moveTo(7,0);ctx.lineTo(11,-14);ctx.lineTo(21,-9);ctx.lineTo(13,4);ctx.closePath();ctx.fillStyle='#b58054';ctx.fill();
  ctx.beginPath();ctx.ellipse(17,-13,7.5,6,-.15,0,Math.PI*2);ctx.fillStyle='#c18c5e';ctx.fill();
  ctx.beginPath();ctx.ellipse(11,-19,4,2,-.5,0,Math.PI*2);ctx.fillStyle='#d7b088';ctx.fill();
  ctx.beginPath();ctx.ellipse(24,-10,7,4.5,0,0,Math.PI*2);ctx.fillStyle='#edc69b';ctx.fill();
  circle(20,-15,1.3,'#211f2a');circle(20.4,-15.5,.45,'#fff');
  line([[10,-6],[17,-3]],'#bc3e58',4);line([[12,-3],[6,1],[2,0]],'#d85670',3);
  glow(30,-10,9,'rgba(255,66,86,.28)');circle(30,-10,3.2,'#f35a68');circle(29,-11,1,'#ffd1bf');
  ctx.restore();
 }
 function crest(){
  const {cx,top,treeHeight}=geometry();
  // 모든 단계에서 첫 별의 비율을 그대로 유지하고 나무 높이에 맞춰 확대한다.
  star(cx,top-8,Math.max(3,Math.min(14,treeHeight*.048)),STAR_COLORS[style.starColor]??STAR_COLORS.original);
 }
 function atmosphere(){
  if(style.snow)for(const p of snow.slice(0,25+level*5))circle(p.x*w+Math.sin(clock*.3+p.phase)*8,((p.y+clock*p.speed)%1)*h,p.size,'rgba(211,231,248,.37)');
  if(level>=8)for(let i=0;i<30;i++)circle(((i*79.13)%1000)/1000*w,((i*137.3)%1000)/1000*h*.65,.6+i%3*.3,`rgba(217,224,255,${.2+.35*(Math.sin(clock+i)+1)/2})`);
  if(!reduced&&style.meteors)for(let i=0;i<4;i++){
   const u=(clock*.6+i*.29)%1,x=w*(1.2-u*1.5)+i*13,y=h*(-.1+u*.7);const g=ctx.createLinearGradient(x,y,x+42,y-24);g.addColorStop(0,'#dbedffcc');g.addColorStop(1,'#bcb2ff00');line([[x+42,y-24],[x,y]],g,1.3);circle(x,y,1.4,'#f4fbff');
  }
  if(!reduced&&style.fireworks)for(let j=0;j<3;j++){
   const age=(clock*.6+j*.31)%1,x=w*(.18+j*.32),y=h*(.2+j%2*.13);for(let i=0;i<26;i++){const a=i*Math.PI*2/26,r=age*w*.17;circle(x+Math.cos(a)*r,y+Math.sin(a)*r+age*age*10,1,`rgba(255,${195+j*15},151,${(1-age)*.8})`);}
  }
 }
 function village(){
  const {cx,ground,radius}=geometry();
  // 3레벨부터 선물, 8레벨부터 마을의 창문이 켜진다.
  if(level>=3)for(let i=0;i<(level>=8?5:3);i++){
   const x=cx+(i-1)*(radius*.25),y=ground+5+i%2*5,s=9+i%3*3;ctx.fillStyle=['#84394f','#437679','#9b7945'][i%3];ctx.fillRect(x-s/2,y-s,s,s);ctx.fillStyle='#f0d292';ctx.fillRect(x-1,y-s,2,s);ctx.fillRect(x-s/2,y-s*.65,s,2);
  }
  if(level>=4)for(const side of (level>=5?[-1,1]:[-1])){
   const x=cx+side*radius*1.12,y=ground-2,s=Math.min(1,w/400);
   ctx.save();ctx.translate(x,y);ctx.scale(s,s);circle(0,-11,10,'#bfd4e4');circle(0,-28,7,'#e0edf5');circle(-2.5,-29,1,'#263646');circle(2.5,-29,1,'#263646');ctx.fillStyle='#ac4962';ctx.fillRect(-7,-23,14,3);ctx.fillRect(3,-21,3,9);ctx.fillStyle='#34415b';ctx.fillRect(-9,-35,18,2);ctx.fillRect(-5,-42,10,7);circle(0,-11,1.3,'#34415b');circle(0,-5,1.3,'#34415b');ctx.restore();
  }
  if(level>=8)for(const side of [-1,1])for(let i=0;i<2;i++){
   const x=cx+side*(radius*.8+i*18),y=ground-2,s=12+i*4;ctx.fillStyle='#263147';ctx.fillRect(x-s/2,y-s,s,s);ctx.beginPath();ctx.moveTo(x-s*.7,y-s);ctx.lineTo(x,y-s*1.6);ctx.lineTo(x+s*.7,y-s);ctx.fillStyle='#b6c7d8';ctx.fill();ctx.fillStyle='#f1d28f';ctx.fillRect(x-3,y-s*.7,3,4);
  }
 }
 return {
  paint(context:CanvasRenderingContext2D,width:number,height:number,_time:number,dt:number,view:number,options:TreeStyle={},actual=view,motionReduced=false){
   ctx=context;w=width;h=height;level=Math.max(1,Math.min(10,view));reduced=motionReduced;style=resolveTreeStyle(options,actual,level);clock+=reduced?0:dt;rotation+=reduced?0:dt*.35*style.rotation;
   if(reduced)bursts=[];
   ctx.save();ctx.fillStyle='#050a13';ctx.fillRect(0,0,w,h);
   aurora();atmosphere();ground();orbits(false);reindeer(false);tree();ribbon();ornaments();orbits(true);crest();reindeer(true);village();
   for(const p of bursts){p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt*1.7;if(p.life>0)circle(p.x,p.y,p.size,`rgba(255,224,157,${p.life})`);}bursts=bursts.filter(p=>p.life>0);ctx.restore();
  },
  burst(x:number,y:number){if(reduced)return;for(let i=0;i<18;i++){const a=Math.random()*Math.PI*2,s=25+Math.random()*85;bursts.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:1,size:1+Math.random()*1.5});}bursts=bursts.slice(-360);},
  clearBursts(){bursts=[];}
 };
}
