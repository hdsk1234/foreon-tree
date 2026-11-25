import type {Batch,BatchReceipt,ScoreProjection,ServerScore,Gift} from './OptimisticScore.mjs';
export type PersistentProjection=ScoreProjection&{known:boolean;blocked:boolean;boostRemainingMs:number;boostExpiresAt:number;boostStartsAt:number;boostId:string|null;boostMultiplier:number;nextXp:number;baseXp:number;rewardLevel:number;gift:Gift|null;comboMeter:number;comboMultiplier:number;comboTier:number;comboDecaying:boolean;comboNextHits:number;comboMaxMeter:number};
export type QueueOptions={projectId:string;uid:string;eventId:string;buildingId:string;send:(batch:Batch)=>Promise<BatchReceipt>;status:(text:string)=>void;changed:(state:PersistentProjection)=>void;isCurrent:()=>boolean;initial?:ServerScore;comboEnabled?:boolean;};
export class ScoreQueue {
 constructor(options:QueueOptions);
 readonly buildingId:string;
 readonly readyPromise:Promise<void>;
 touch():boolean;xpPerTap():number;receive(server:ServerScore):void;refresh(ingest?:boolean):void;
 flushNow():Promise<void>;settle():Promise<void>;dispose():void;
}
