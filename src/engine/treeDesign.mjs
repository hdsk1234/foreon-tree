import {RIBBON_PALETTES} from './SpiralRibbon.mjs';
// 디자인 성장과 꾸미기 해금은 EXP 경제와 독립적이다.
export const TREE_DESIGNS=[
 {name:'첫 번째 빛',height:.38,radius:.16,colors:['63,180,128','101,220,165'],tiers:4},
 {name:'오색별의 소원',height:.42,radius:.18,colors:['64,206,145','255,215,131'],tiers:4},
 {name:'은하수 리본',height:.46,radius:.20,colors:['93,164,226','194,232,255'],tiers:5},
 {name:'첫눈의 추억',height:.50,radius:.22,colors:['213,58,105','255,169,150'],tiers:5},
 {name:'오로라 정원',height:.54,radius:.24,colors:['67,229,188','172,125,248'],tiers:6},
 {name:'불꽃축제',height:.58,radius:.26,colors:['244,175,61','255,237,168'],tiers:6},
 {name:'길 잃은 루돌프',height:.62,radius:.28,colors:['119,205,242','233,252,255'],tiers:7},
 {name:'별빛궤도',height:.66,radius:.30,colors:['164,104,239','235,187,255'],tiers:7},
 {name:'밤하늘의 별똥별',height:.70,radius:.32,colors:['125,220,249','249,245,223'],tiers:8},
 {name:'인생의 회전목마',height:.74,radius:.35,colors:['255,204,110','255,248,220'],tiers:9}
];
export const STAR_COLORS={original:'255,225,155',ice:'164,225,255',rose:'255,157,197',mint:'137,244,202',violet:'202,167,255'};
export const MAX_ROTATION=5;
export const STYLE_UNLOCKS={starColor:2,rotation:10,snow:4,aurora:5,fireworks:6,reindeer:7,orbits:8,meteors:9,royal:3,ribbonPalette:3};
export const STYLE_LABELS={starColor:'꼭대기 별 색상',rotation:'트리 자전 속도',snow:'눈 내리기',aurora:'오로라 커튼',fireworks:'불꽃놀이',reindeer:'떠다니는 루돌프',orbits:'별빛 궤도',meteors:'별똥별',royal:'은하수 리본',ribbonPalette:'리본 색상'};
export function treeGeometry(w,h,level){
 const profile=TREE_DESIGNS[Math.max(1,Math.min(10,Math.floor(level)))-1];
 return {cx:w/2,ground:h*.91,top:h*(.86-profile.height),treeHeight:h*profile.height,radius:Math.min(w*profile.radius,h*profile.height*.6)};
}
export function sanitizeTreeStyle(value){
 const result={};if(!value||typeof value!=='object')return result;
 if(Object.hasOwn(STAR_COLORS,value.starColor))result.starColor=value.starColor;
 if(Object.hasOwn(RIBBON_PALETTES,value.ribbonPalette))result.ribbonPalette=value.ribbonPalette;
 if(typeof value.rotation==='number'&&Number.isFinite(value.rotation)&&value.rotation>=0&&value.rotation<=MAX_ROTATION)result.rotation=Math.round(value.rotation*20)/20;
 for(const key of ['snow','aurora','fireworks','reindeer','orbits','meteors','royal'])if(typeof value[key]==='boolean')result[key]=value[key];
 if(value.reindeer===undefined&&typeof value.crystals==='boolean')result.reindeer=value.crystals;
 return result;
}
export function resolveTreeStyle(value,actual,view){
 const raw=sanitizeTreeStyle(value),result={starColor:'original',ribbonPalette:'gold',rotation:1,snow:true,aurora:view>=5,fireworks:view>=6,reindeer:view>=7,orbits:view>=8,meteors:view>=9,royal:view>=3};
 for(const [key,setting] of Object.entries(raw))if(actual>=STYLE_UNLOCKS[key])result[key]=setting;
 return result;
}
