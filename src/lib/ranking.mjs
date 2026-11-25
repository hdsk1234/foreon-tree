export function rankRows(rows,complexId=''){
 const sorted=rows.filter(row=>!complexId||row.complexId===complexId)
  .sort((a,b)=>b.score-a.score||a.buildingNumber-b.buildingNumber);
 let rank=0,previous=-1;
 return sorted.map((row,index)=>{if(row.score!==previous)rank=index+1;previous=row.score;return {...row,rank};});
}
// A tied group appears on the podium only when the entire group fits.
export function podiumRows(rows){
 const podium=[];
 for(const rank of [1,2,3]){
  const group=rows.filter(row=>row.rank===rank);
  if(group.length&&podium.length+group.length<=3)podium.push(...group);
 }
 const ids=new Set(podium.map(row=>row.buildingId));
 return {podium,list:rows.filter(row=>!ids.has(row.buildingId))};
}
