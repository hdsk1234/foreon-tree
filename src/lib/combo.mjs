import {baseUnitsForScore,addUnits} from './experience.mjs';
import config from '../../functions/src/combo.json' with {type:'json'};
export const COMBO_CONFIG=config;
export function normalizeCombo(value){return {meter:Number.isInteger(value?.meter)?Math.max(0,Math.min(config.maxMeter,value.meter)):0,lastTapAt:Number.isSafeInteger(value?.lastTapAt)?value.lastTapAt:0,version:Number.isSafeInteger(value?.version)?value.version:0};}
export function comboView(value,now){
 const state=normalizeCombo(value),steps=Math.floor(Math.max(0,now-state.lastTapAt-config.graceMs)/config.decayStepMs);
 const meter=Math.max(0,state.meter-steps);let tier=0;config.tiers.forEach((t,index)=>{if(meter>=t.hits)tier=index;});const next=config.tiers[tier+1];
 return {meter,tier,multiplierTenths:config.tiers[tier].tenths,multiplier:config.tiers[tier].tenths/10,maxMeter:config.maxMeter,nextHits:next?next.hits-meter:0,decaying:meter>0&&now>state.lastTapAt+config.graceMs};
}
export function advanceCombo(value,at){
 const state=normalizeCombo(value);
 // 늦게 들어온 과거 입력으로 이미 승인한 콤보를 다시 키우지 않는다.
 if(at<state.lastTapAt)return {state,multiplierTenths:10};
 const view=comboView(state,at);
 return {state:{meter:Math.min(config.maxMeter,view.meter+1),lastTapAt:at,version:state.version},multiplierTenths:view.multiplierTenths};
}
export function awardComboTaps(value,times,boostedPoints=0,boostMultiplier=1,startScore){
 let state=normalizeCombo(value),ticks=0;
 times.forEach((at,index)=>{const step=advanceCombo(state,at);state=step.state;const base=startScore===undefined?1:baseUnitsForScore(addUnits(startScore,ticks/10));ticks+=base*step.multiplierTenths*(index<boostedPoints?boostMultiplier:1);});
 return {state,units:ticks/10};
}
