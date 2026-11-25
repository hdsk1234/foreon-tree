export type Gift={id:string;multiplier:number;durationSeconds?:number};
export type Rewards={version:number;progress:number;target:number;boostMultiplier:number;boostStartsAt:number;boostExpiresAt:number;boostId:string|null;gift:Gift|null};
export type ServerScore={score:number;revision:number;rewards?:Rewards;combo?:ComboState};
export type Batch={batchId:string;points:number;buildingId?:string;boostId?:string;tapFrom?:number;tapTo?:number;tapTimes?:number[]};
export type BatchReceipt={accepted:number;duplicate:boolean;teamScore:number;teamRevision:number;rewards?:Rewards;combo?:ComboState;activity?:import('./LocalClicks.mjs').ClickReceipt};
export type ScoreProjection={score:number;confirmedScore:number;unconfirmed:number;revision:number};
export class OptimisticScore {
 constructor(base?:ServerScore);
 touch():void;
 begin(batchId:string,max?:number):Batch|null;
 receive(server:ServerScore):void;
 acknowledge(batchId:string,receipt:BatchReceipt):void;
 cancel():void;
 snapshot():ScoreProjection;
}
import type {ComboState} from './combo.mjs';
