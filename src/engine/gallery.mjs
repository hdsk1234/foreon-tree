export function nextViewingLevel(previousActual, viewingLevel, nextActual) {
  return viewingLevel === previousActual ? nextActual : viewingLevel;
}
export function canScore(actualLevel, viewingLevel, isOwnBuilding) {
  return isOwnBuilding && viewingLevel >= 1 && viewingLevel <= actualLevel;
}
export function galleryTransition(previous,current,viewingLevel){
  if(previous.scope!==current.scope||(!previous.ready&&current.ready))
    return {viewingLevel:current.actual,levelUp:false,celebrate:false};
  const levelUp=previous.ready&&current.ready&&current.actual>previous.actual;
  return {viewingLevel:previous.actual===current.actual?viewingLevel:nextViewingLevel(previous.actual,viewingLevel,current.actual),
    levelUp,celebrate:levelUp&&viewingLevel===previous.actual};
}
