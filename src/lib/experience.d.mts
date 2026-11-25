export const EXP_PER_SCORE_UNIT:number;
export function scoreTicks(units:number):number;
export function isScoreUnits(units:unknown):boolean;
export function addUnits(a:number,b:number):number;
export function toExperience(units:number):number;
export function formatXp(units:number):string;
export function levelForScore(units:number):number;
export function growthForScore(units:number):{level:number;remaining:number;value:number;max:number};

export function baseUnitsForScore(units:number):number;
