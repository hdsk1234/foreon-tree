import {ComboMeter} from './ComboMeter';
import {formatXp} from '../lib/experience.mjs';

type RewardStatusProps={
 baseXp?:number;rewardLevel?:number;boostRemainingMs?:number;boostMultiplier?:number;nextXp?:number;
 comboMeter?:number;comboMultiplier?:number;comboTier?:number;comboDecaying?:boolean;
};

export function RewardStatus({baseXp=1,rewardLevel=1,boostRemainingMs=0,boostMultiplier=1,nextXp=1,comboMeter,comboMultiplier=1,comboTier,comboDecaying}:RewardStatusProps){
 const active=boostRemainingMs>0;
 const stacked=active&&boostMultiplier>1&&comboMultiplier>1;
 const totalMultiplier=(Math.round(boostMultiplier*comboMultiplier*10)/10).toFixed(1);
 return <div className={`boost-status reward-compact ${active?'boost-active':''} ${stacked?'boost-stacked':''}`} aria-live="off">
  <div className="reward-summary">
   {stacked?<b className="stack-total">중첩 ×{totalMultiplier}</b>:<span>입력당</span>}
   <strong className="reward-exp" aria-label={`Lv.${rewardLevel} 기본 ${formatXp(baseXp)} EXP, 다음 입력 ${formatXp(nextXp)} EXP`}>+{formatXp(nextXp)} EXP{stacked&&<small className="reward-per-input"> / 입력</small>}</strong>
  </div>
  {active&&<div className="reward-factors"><span className="stack-gift">선물 ×{boostMultiplier}</span>{stacked&&<><i aria-hidden="true">×</i><span className="stack-combo">콤보 ×{comboMultiplier.toFixed(1)}</span></>}<small>{Math.ceil(boostRemainingMs/1000)}초 남음</small></div>}
  <ComboMeter meter={comboMeter} multiplier={comboMultiplier} tier={comboTier} decaying={comboDecaying}/>
 </div>;
}
