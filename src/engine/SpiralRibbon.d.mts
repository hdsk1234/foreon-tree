export const RIBBON_PARTICLE_COUNT:number;
export const RIBBON_PALETTES:Record<string,{label:string;swatch:string;colors:number[][]}>;
export type RibbonPoint={x:number;y:number;depth:number;u:number;size:number;alpha:number;color:string;glow:boolean;highlight:boolean};
export function projectRibbon(geometry:{cx:number;top:number;treeHeight:number;radius:number},time:number,treeRotation:number,palette?:string):RibbonPoint[];
