import {baseUnitsForScore,addScore as addUnits} from './scoring';
import config from './combo.json';
export type ComboState={meter:number;lastTapAt:number;version:number};
export function normalizeCombo(value?:Partial<ComboState>|null):ComboState{return {meter:Number.isInteger(value?.meter)?Math.max(0,Math.min(config.maxMeter,value!.meter!)):0,lastTapAt:Number.isSafeInteger(value?.lastTapAt)?value!.lastTapAt!:0,version:Number.isSafeInteger(value?.version)?value!.version!:0};}
export function comboView(value:Partial<ComboState>|null|undefined,now:number){
 const state=normalizeCombo(value),steps=Math.floor(Math.max(0,now-state.lastTapAt-config.graceMs)/config.decayStepMs);
 const meter=Math.max(0,state.meter-steps);let tier=0;config.tiers.forEach((t,index)=>{if(meter>=t.hits)tier=index;});const next=config.tiers[tier+1];
 return {meter,tier,multiplierTenths:config.tiers[tier].tenths,multiplier:config.tiers[tier].tenths/10,maxMeter:config.maxMeter,nextHits:next?next.hits-meter:0,decaying:meter>0&&now>state.lastTapAt+config.graceMs};
}
export function advanceCombo(value:Partial<ComboState>|null|undefined,at:number){
 const state=normalizeCombo(value);if(at<state.lastTapAt)return {state,multiplierTenths:10};
 const view=comboView(state,at);
 return {state:{meter:Math.min(config.maxMeter,view.meter+1),lastTapAt:at,version:state.version},multiplierTenths:view.multiplierTenths};
}
export function awardComboTaps(value:Partial<ComboState>|null|undefined,times:number[],boostedPoints=0,boostMultiplier=1,startScore?:number){
 let state=normalizeCombo(value),ticks=0;
 times.forEach((at,index)=>{const step=advanceCombo(state,at);state=step.state;const base=startScore===undefined?1:baseUnitsForScore(addUnits(startScore,ticks/10));ticks+=base*step.multiplierTenths*(index<boostedPoints?boostMultiplier:1);});
 return {state,units:ticks/10};
}
