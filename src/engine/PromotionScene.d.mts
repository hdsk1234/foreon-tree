export type PromotionProfile={title:string;unlocks:string[];color:string;accent:string;points:number;rings:number;wings:number;sparks:number;duration:number;crown?:boolean};
export const PROMOTIONS:PromotionProfile[];
export function promotionFor(level:number):PromotionProfile;
export function paintPromotion(ctx:CanvasRenderingContext2D,width:number,height:number,level:number,seconds:number,reduced?:boolean):void;
