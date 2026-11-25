export function rankRows<T extends {score:number;complexId:string;buildingNumber:number}>(rows:T[],complexId?:string):Array<T&{rank:number}>;
export function podiumRows<T extends {rank:number;buildingId:string}>(rows:T[]):{podium:T[];list:T[]};
