export function authorizeStudio(password:string,options:{restore:()=>Promise<{uid:string}|null>;isCurrent:(uid:string)=>boolean;authorize:(password:string)=>Promise<{developer?:boolean;expiresAt?:number}>;now?:()=>number}):Promise<number>;
export function studioAuthMessage(error:unknown):string;
export function studioTimeout<T>(task:Promise<T>,milliseconds?:number):Promise<T>;
