import economy from '../../functions/src/economy.json' with {type:'json'};
import thresholds from '../../functions/src/levels.json' with {type:'json'};
export const EXP_PER_SCORE_UNIT=economy.expPerScoreUnit;
const precision=economy.scoreTicksPerUnit;
const formatter=new Intl.NumberFormat('ko-KR');
// 저장된 성장 단위는 변하지 않는다. 예전 점수/미전송 기록도 같은 비율로 환산한다.
export function scoreTicks(units){
 const ticks=Math.round(units*precision);
 if(!Number.isFinite(units)||units<0||!Number.isSafeInteger(ticks)||units>Math.floor(Number.MAX_SAFE_INTEGER/EXP_PER_SCORE_UNIT)||Math.abs(units-ticks/precision)>Number.EPSILON*Math.max(1,units)*4)throw new Error('경험치 범위를 확인하세요.');
 return ticks;
}
export function isScoreUnits(units){try{scoreTicks(units);return true;}catch{return false;}}
export function addUnits(a,b){return scoreTicks((scoreTicks(a)+scoreTicks(b))/precision)/precision;}
export function toExperience(units){return scoreTicks(units)*(EXP_PER_SCORE_UNIT/precision);}
export function formatXp(units){return formatter.format(toExperience(units));}
export function levelForScore(units){const exp=toExperience(units);return thresholds.filter(value=>exp>=value).length;}
export function baseUnitsForScore(units){return economy.levelBaseUnits[levelForScore(units)-1];}
export function growthForScore(units){
 const exp=toExperience(units),level=levelForScore(units),start=thresholds[level-1],next=thresholds[level];
 return {level,remaining:next===undefined?0:next-exp,value:next===undefined?1:exp-start,max:next===undefined?1:next-start};
}
