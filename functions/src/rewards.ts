import {randomInt,randomUUID} from 'node:crypto';
export const BOOST_DURATION_MS=60000;
// 기존 서버 입력 상한(100회/4초)에 맞춘 선물 1개당 부정 재전송 방어 상한.
export const MAX_BOOST_TAPS=1500;
export type Gift={id:string;multiplier:number;durationSeconds:number};
export type Rewards={version:number;progress:number;target:number;boostMultiplier:number;boostStartsAt:number;boostExpiresAt:number;boostId:string|null;gift:Gift|null;boostRemaining?:number};
export function initialRewards(level=1):Rewards{return {version:0,progress:0,target:randomInt(level>=4?35:45,level>=4?61:76),boostMultiplier:1,boostStartsAt:0,boostExpiresAt:0,boostId:null,gift:null};}
export function migrateRewards(previous:Rewards|undefined,now:number):Rewards{
 if(!previous)return initialRewards();
 const legacy=(previous.boostRemaining??0)>0&&!previous.boostExpiresAt;
 return {version:previous.version,progress:previous.progress,target:previous.target,boostMultiplier:previous.boostMultiplier,
  boostStartsAt:legacy?now:previous.boostStartsAt??0,boostExpiresAt:legacy?now+BOOST_DURATION_MS:previous.boostExpiresAt??0,
  boostId:legacy?randomUUID():previous.boostId??null,
  gift:previous.gift?{id:previous.gift.id,multiplier:previous.gift.multiplier,durationSeconds:60}:null};
}
export function awardTaps(previous:Rewards|undefined,taps:number,level:number,now=Date.now(),bonus={points:0,multiplier:1}){
 const reward=migrateRewards(previous??initialRewards(level),now);
 const boosted=Math.min(taps,bonus.points),xp=taps+boosted*(bonus.multiplier-1);
 if(!reward.gift&&now>=reward.boostExpiresAt){
  reward.progress+=taps-boosted;
  if(reward.progress>=reward.target){
   reward.gift={id:randomUUID(),multiplier:level>=8?5:level>=4?3:2,durationSeconds:60};reward.progress=0;
  }
 }
 reward.version++;return {xp,reward};
}
export function openGift(previous:Rewards,now=Date.now()){
 if(!previous.gift)return migrateRewards(previous,now);
 return {...migrateRewards(previous,now),version:previous.version+1,boostMultiplier:previous.gift.multiplier,
  boostId:previous.gift.id,boostStartsAt:now,boostExpiresAt:now+BOOST_DURATION_MS,
  gift:null,progress:0,target:randomInt(previous.gift.multiplier>=3?35:45,previous.gift.multiplier>=3?61:76)};
}
