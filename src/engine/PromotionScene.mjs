import {TREE_DESIGNS,STYLE_UNLOCKS,STYLE_LABELS} from './treeDesign.mjs';
// 독자적인 승급 문양. 게임 로고나 외부 아트 없이 Canvas로 그린다.
export const PROMOTIONS = [
 {color:'#80d8b0',accent:'#e7fff0',points:4,rings:1,wings:0,sparks:36,duration:3.6},
 {color:'#65efbd',accent:'#dcfff2',points:4,rings:1,wings:1,sparks:56,duration:3.8},
 {color:'#a8dbff',accent:'#e9f6ff',points:6,rings:2,wings:2,sparks:72,duration:4},
 {color:'#ff7ba1',accent:'#b8dfff',points:8,rings:2,wings:3,sparks:88,duration:4.2},
 {color:'#70eedc',accent:'#c597ff',points:5,rings:3,wings:4,sparks:100,duration:4.4},
 {color:'#ffc454',accent:'#fff1af',points:12,rings:3,wings:5,sparks:112,duration:4.6},
 {color:'#88c7ff',accent:'#e4f7ff',points:6,rings:4,wings:6,sparks:124,duration:4.6},
 {color:'#c29aff',accent:'#ffbde3',points:8,rings:4,wings:7,sparks:136,duration:4.8,crown:true},
 {color:'#a6f1ff',accent:'#fff5d6',points:10,rings:5,wings:8,sparks:148,duration:5},
 {color:'#ffdc83',accent:'#fb92e4',points:12,rings:6,wings:9,sparks:168,duration:5.6,crown:true},
].map((profile,index)=>({...profile,title:TREE_DESIGNS[index].name,unlocks:Object.entries(STYLE_UNLOCKS).filter(([,level])=>level===index+1).map(([key])=>STYLE_LABELS[key])}));
export function promotionFor(level){return PROMOTIONS[Math.max(0,Math.min(9,Math.floor(level)-1))];}
const clamp=x=>Math.max(0,Math.min(1,x));
const ease=x=>1-(1-clamp(x))**3;
const particles=Array.from({length:168},(_,i)=>({angle:i*2.39996323,reach:.55+(i*73%101)/100,size:1+(i%4)*.55,delay:(i%7)*.025}));
function polygon(ctx,r,points,inner=.5){
 ctx.beginPath();for(let i=0;i<points*2;i++){const a=i*Math.PI/points-Math.PI/2,s=i%2?r*inner:r;
  if(i===0)ctx.moveTo(Math.cos(a)*s,Math.sin(a)*s);else ctx.lineTo(Math.cos(a)*s,Math.sin(a)*s);
 }ctx.closePath();
}
export function paintPromotion(ctx,width,height,level,seconds,reduced=false){
 const p=promotionFor(level),t=reduced?1.7:Math.max(0,seconds);
 const fade=reduced?1:Math.min(ease(t/.25),clamp((p.duration-t)/.65));
 ctx.clearRect(0,0,width,height);if(!fade)return;
 const size=Math.min(width*.24,height*.16,106),cx=width/2,cy=height*.43;
 ctx.save();ctx.globalAlpha=fade;
 const veil=ctx.createRadialGradient(cx,cy,0,cx,cy,Math.max(width,height)*.7);
 veil.addColorStop(0,'rgba(4,10,23,.85)');veil.addColorStop(1,'rgba(3,7,17,.65)');
 ctx.fillStyle=veil;ctx.fillRect(0,0,width,height);
 ctx.translate(cx,cy);
 // 빛 응축 → 광채 확장 → 문장 등장. 반복 점멸 대신 한 번의 빛 확장으로 연출한다.
 const reveal=ease((t-.3)/.85),impact=ease((t-.2)/1.15);
 ctx.globalCompositeOperation='lighter';
 const glow=ctx.createRadialGradient(0,0,0,0,0,size*3.8);
 glow.addColorStop(0,p.color+'66');glow.addColorStop(.4,p.accent+'22');glow.addColorStop(1,'transparent');
 ctx.fillStyle=glow;ctx.fillRect(-size*3.8,-size*3.8,size*7.6,size*7.6);
 if(!reduced){
  ctx.save();ctx.globalAlpha=fade*(1-clamp((t-1.1)/1.2))*.75;
  for(let i=0;i<p.points*2;i++){
   ctx.save();ctx.rotate(i*Math.PI/p.points+t*.05);ctx.beginPath();ctx.moveTo(-2,0);ctx.lineTo(-size*.1,-size*(1+impact*4));ctx.lineTo(size*.1,-size*(1+impact*4));ctx.lineTo(2,0);
   ctx.fillStyle=i%2?p.accent+'30':p.color+'55';ctx.fill();ctx.restore();
  }ctx.restore();
 }
 for(let ring=0;ring<p.rings;ring++){
  ctx.save();ctx.rotate((ring%2?1:-1)*(reduced?.2:t*.13)+ring*.34);
  ctx.strokeStyle=ring%2?p.accent:p.color;ctx.globalAlpha=fade*reveal*(.7-ring*.07);
  ctx.lineWidth=ring===0?2:1;ctx.setLineDash(ring%2?[3,12]:[size*.16,8]);
  ctx.beginPath();ctx.arc(0,0,size*(1.3+ring*.23)*(.6+impact*.4),0,Math.PI*2);ctx.stroke();ctx.restore();
 }
 // 날개는 레벨마다 층수·길이·색을 바꾼다.
 ctx.globalCompositeOperation='source-over';ctx.save();ctx.scale(reveal,reveal);
 for(const side of [-1,1])for(let wing=0;wing<p.wings;wing++){
  ctx.save();ctx.scale(side,1);ctx.rotate(-.06*wing);
  const x=size*(.7+wing*.12),y=size*(.05+wing*.07);
  ctx.beginPath();ctx.moveTo(size*.4,size*.3);ctx.lineTo(x+size*.9,-size*(.6+wing*.1));ctx.lineTo(x+size*.6,y);ctx.lineTo(size*.6,size*.55);ctx.closePath();
  ctx.fillStyle=wing%2?p.accent+'30':p.color+'45';ctx.strokeStyle=p.color+'88';ctx.lineWidth=1;ctx.fill();ctx.stroke();ctx.restore();
 }
 ctx.shadowColor=p.color;ctx.shadowBlur=24;
 polygon(ctx,size,p.points,p.points===4?.68:.54);ctx.fillStyle='#0d192b';ctx.fill();ctx.strokeStyle=p.color;ctx.lineWidth=2.5;ctx.stroke();
 ctx.save();ctx.scale(.77,.77);polygon(ctx,size,p.points,.62);ctx.strokeStyle=p.accent+'cc';ctx.lineWidth=1;ctx.stroke();ctx.restore();
 if(p.crown){
  ctx.beginPath();ctx.moveTo(-size*.55,-size*.65);ctx.lineTo(-size*.7,-size*1.2);ctx.lineTo(-size*.22,-size*.96);ctx.lineTo(0,-size*1.5);ctx.lineTo(size*.22,-size*.96);ctx.lineTo(size*.7,-size*1.2);ctx.lineTo(size*.55,-size*.65);ctx.closePath();ctx.fillStyle=p.color;ctx.fill();
 }
 ctx.shadowBlur=0;ctx.font=`600 ${size*.5}px Georgia,serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=p.accent;ctx.fillText(String(level).padStart(2,'0'),0,size*.04);ctx.restore();
 if(!reduced){
  ctx.save();ctx.globalCompositeOperation='lighter';
  for(let i=0;i<p.sparks;i++){
   const s=particles[i],age=Math.max(0,t-.35-s.delay),travel=ease(age/2),distance=size*(.65+travel*3.8)*s.reach;
   ctx.globalAlpha=fade*clamp((3.8-age)/2.6);ctx.fillStyle=i%3?p.color:p.accent;
   const x=Math.cos(s.angle)*distance,y=Math.sin(s.angle)*distance+age*age*11;
   ctx.beginPath();ctx.arc(x,y,s.size*(1-travel*.5),0,Math.PI*2);ctx.fill();
  }ctx.restore();
 }
 ctx.restore();
}
