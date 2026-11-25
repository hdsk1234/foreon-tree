export type Connection={browserId:string;uid:string;page:'tree'|'ranking'|'activity';active:boolean;startedAt:number;updatedAt:number};
export function presenceSummary(connections:Record<string,Connection>|null):{rows:Array<Connection&{id:string}>;browsers:number;active:number;tabs:number;accounts:number;visitors:number};
