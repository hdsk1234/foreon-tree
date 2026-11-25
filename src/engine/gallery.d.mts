export function nextViewingLevel(previousActual:number, viewingLevel:number, nextActual:number):number;
export function canScore(actualLevel:number, viewingLevel:number, isOwnBuilding:boolean):boolean;
export function galleryTransition(previous:{scope:string;actual:number;ready:boolean},current:{scope:string;actual:number;ready:boolean},viewingLevel:number):{viewingLevel:number;levelUp:boolean;celebrate:boolean};
