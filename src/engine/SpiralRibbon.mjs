// 2레벨의 가느다란 나선 장식을 모든 은하수 리본의 공통 형태로 사용한다.
export const RIBBON_PARTICLE_COUNT=600;
export const RIBBON_PALETTES={
 gold:{label:'황금색',swatch:'linear-gradient(110deg,#b88538,#ffe7a5,#fff4d8)',colors:[[255,211,124],[255,224,161],[241,189,99]]},
 silver:{label:'은백색',swatch:'linear-gradient(110deg,#9dbbcf,#e3f2ff,#fff)',colors:[[162,194,218],[222,239,252],[255,255,250]]},
 roseGold:{label:'로즈골드',swatch:'linear-gradient(110deg,#ba7a76,#f3b8a2,#ffe4cb)',colors:[[204,141,128],[247,192,171],[255,228,205]]},
 emerald:{label:'에메랄드',swatch:'linear-gradient(110deg,#358d76,#83e5ba,#d5ffe8)',colors:[[65,170,136],[134,237,192],[218,255,231]]},
 rainbow:{label:'무지갯빛',swatch:'linear-gradient(110deg,#ef9cbc,#f4d78d,#8be3ba,#9bcdf5,#c6a4ed)',colors:[[247,166,191],[251,221,153],[143,233,185],[143,204,248],[201,171,246]]}
};
function colorAt(palette,position){
 const colors=(RIBBON_PALETTES[palette]??RIBBON_PALETTES.gold).colors;
 const v=((position%1)+1)%1*colors.length,index=Math.floor(v),blend=v-index;
 return colors[index].map((value,i)=>Math.round(value+(colors[(index+1)%colors.length][i]-value)*blend)).join(',');
}
export function projectRibbon(geometry,time,treeRotation,palette='gold'){
 const {cx,top,treeHeight,radius}=geometry,points=[];
 for(let i=0;i<RIBBON_PARTICLE_COUNT;i++){
  // u=1이 아래쪽. 같은 파티클은 궤적을 따라 위로 이동하고 끝에서 희미해진다.
  const u=1-((i/RIBBON_PARTICLE_COUNT+time*.027)%1);
  const angle=u*20+treeRotation;
  const surfaceRadius=radius*u,depth=Math.sin(angle),near=(depth+1)/2;
  const fade=Math.max(0,Math.min(1,u/.055,(1-u)/.045));
  points.push({
   x:cx+Math.cos(angle)*surfaceRadius,y:top+u*treeHeight+depth*surfaceRadius*.13,
   depth,u,size:(.85+near*.25),
   alpha:(.18+near*.58)*fade,
   color:colorAt(palette,u*.72+time*.013+i%5*.025),glow:i%8===0,highlight:false
  });
 }
 return points;
}
