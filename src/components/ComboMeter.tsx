import {COMBO_CONFIG} from '../lib/combo.mjs';
export function ComboMeter({meter=0,multiplier=1,tier=0,decaying=false}:{meter?:number;multiplier?:number;tier?:number;decaying?:boolean}){
 return <div className={`combo-track combo-tier-${tier} ${decaying?'combo-decaying':''}`} aria-label="콤보 배율">
  <div className="combo-heading"><span>COMBO <b>×{multiplier.toFixed(1)}</b></span></div>
  <div className="combo-meter" role="progressbar" aria-label="콤보 게이지" aria-valuemin={0} aria-valuemax={COMBO_CONFIG.maxMeter} aria-valuenow={meter} aria-valuetext={`${multiplier.toFixed(1)}배 콤보`}><i style={{width:`${meter/COMBO_CONFIG.maxMeter*100}%`}}/></div>

 </div>;
}
