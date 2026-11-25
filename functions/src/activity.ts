import {addScore} from './scoring';
type Counts={score:number;taps:number};
type BuildingCounts=Counts&{epoch:number;activeScore:number;activeTaps:number};
export type Activity={tapCount?:number;trackedScore?:number;trackingStartedAt?:number;daily?:Record<string,Counts>;buildings?:Record<string,BuildingCounts>;activityVersion?:number;recentBatchIds?:string[]};
export function clickReceipt(value:Activity){
 return {version:value.activityVersion??0,tapCount:value.tapCount??0,daily:Object.fromEntries(Object.entries(value.daily??{}).map(([day,count])=>[day,count.taps])),recentBatchIds:value.recentBatchIds??[]};
}
export function recordActivity(previous:Activity,buildingId:string,xp:number,taps:number,epoch:number,now:number,batchId?:string,tapTimes?:number[]){
 const day=new Date(now+9*3600000).toISOString().slice(0,10);
 const daily={...previous.daily},today=daily[day]??{score:0,taps:0};
 daily[day]={score:addScore(today.score,xp),taps:today.taps+(tapTimes?0:taps)};
 // 오프라인 입력도 실제 클릭한 한국 날짜에 집계한다.
 for(const at of tapTimes??[]){const date=new Date(at+9*3600000).toISOString().slice(0,10);const old=daily[date]??{score:0,taps:0};daily[date]={...old,taps:old.taps+1};}
 // 개인 원장은 한 문서에 유지하고 일별 내역은 최근 31일만 보관한다.
 const recent=Object.fromEntries(Object.entries(daily).sort(([a],[b])=>b.localeCompare(a)).slice(0,31));
 const old=previous.buildings?.[buildingId],sameEpoch=old?.epoch===epoch;
 const building={score:addScore(old?.score,xp),taps:(old?.taps??0)+taps,epoch,
  activeScore:addScore(sameEpoch?old.activeScore:0,xp),activeTaps:(sameEpoch?old.activeTaps:0)+taps};
 return {tapCount:(previous.tapCount??0)+taps,trackedScore:addScore(previous.trackedScore,xp),trackingStartedAt:previous.trackingStartedAt??now,
  activityVersion:(previous.activityVersion??0)+1,recentBatchIds:batchId?[...(previous.recentBatchIds??[]),batchId].slice(-128):previous.recentBatchIds??[],
  daily:recent,buildings:{...previous.buildings,[buildingId]:building}};
}
