export type ComboState={meter:number;lastTapAt:number;version:number};
export type ComboView={meter:number;tier:number;multiplierTenths:number;multiplier:number;maxMeter:number;nextHits:number;decaying:boolean};
export const COMBO_CONFIG:{tiers:{hits:number;tenths:number}[];maxMeter:number;graceMs:number;decayStepMs:number};
export function normalizeCombo(value?:Partial<ComboState>|null):ComboState;
export function comboView(value:Partial<ComboState>|null|undefined,now:number):ComboView;
export function advanceCombo(value:Partial<ComboState>|null|undefined,at:number):{state:ComboState;multiplierTenths:number};
export function awardComboTaps(value:Partial<ComboState>|null|undefined,times:number[],boostedPoints?:number,boostMultiplier?:number,startScore?:number):{state:ComboState;units:number};
