export type ClickReceipt={version:number;tapCount:number;daily:Record<string,number>;recentBatchIds:string[]};
export const CLICK_EVENT:string;
export function clickDay(at:number):string;
export class LocalClicks{
 constructor(options:{projectId:string;uid:string;eventId:string;storage?:Storage});
 readonly scope:string;readonly prefix:string;
 changed():void;receive(value:ClickReceipt):void;seal(batchId:string,operations:string[]):void;acknowledge(batchId:string,value?:ClickReceipt):void;
 reject(batches:{batchId:string;status:string;operations:string[]}[]):void;
 project():{tapCount:number;daily:Record<string,number>;base:ClickReceipt}|null;prune():void;
}
