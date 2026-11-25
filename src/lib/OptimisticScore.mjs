// 서버 점수는 revision으로 비교한다. 전송 중 집계는 응답까지 보류해 이중 합산을 막는다.
import {isScoreUnits,addUnits} from './experience.mjs';
export class OptimisticScore {
  constructor(base={score:0,revision:0}) {
    this.base={...base};this.pending=0;this.inflight=null;this.deferred=null;
  }
  touch(){this.pending++;}
  begin(batchId,max=100){
    if(!this.inflight&&this.pending){
      const points=Math.min(this.pending,max);this.pending-=points;
      this.inflight={batchId,points};
    }
    return this.inflight?{...this.inflight}:null;
  }
  newer(a,b){
    // 초기화도 revision을 증가시킨다. 이전 집계로 점수를 되살리지 않는다.
    return a.revision>b.revision||(a.revision===b.revision&&a.score>b.score);
  }
  receive(server){
    if(!isScoreUnits(server.score)||!Number.isSafeInteger(server.revision)||server.revision<0)return;
    if(this.inflight){
      if(!this.deferred||this.newer(server,this.deferred))this.deferred={...server};
    }else if(this.newer(server,this.base))this.base={...server};
  }
  acknowledge(batchId,receipt){
    if(this.inflight?.batchId!==batchId)return;
    if(receipt.accepted!==this.inflight.points||!isScoreUnits(receipt.teamScore)||
       !Number.isSafeInteger(receipt.teamRevision)||receipt.teamRevision<0)throw new Error('점수 응답을 확인할 수 없습니다.');
    this.inflight=null;
    this.receive({score:receipt.teamScore,revision:receipt.teamRevision});
    if(this.deferred){const deferred=this.deferred;this.deferred=null;this.receive(deferred);}
  }
  cancel(){this.inflight=null;this.pending=0;if(this.deferred){this.receive(this.deferred);this.deferred=null;}}
  snapshot(){
    const unconfirmed=this.pending+(this.inflight?.points??0);
    return {score:addUnits(this.base.score,unconfirmed),confirmedScore:this.base.score,unconfirmed,revision:this.base.revision};
  }
}
