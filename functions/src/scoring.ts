import {HttpsError} from 'firebase-functions/v2/https';
import levels from './levels.json';
import economy from './economy.json';
export const EXP_PER_SCORE_UNIT=economy.expPerScoreUnit;
export const MAX_SCORE_UNITS=Math.floor(Number.MAX_SAFE_INTEGER/EXP_PER_SCORE_UNIT);
const precision=economy.scoreTicksPerUnit;
function scoreTicks(units:number):number {
  const ticks=Math.round(units*precision);
  if(!Number.isFinite(units)||units<0||units>MAX_SCORE_UNITS||!Number.isSafeInteger(ticks)||Math.abs(units-ticks/precision)>Number.EPSILON*Math.max(1,units)*4)
    throw new HttpsError('failed-precondition','경험치 범위를 확인하세요.');
  return ticks;
}
export function toExperience(units:number):number {
  return scoreTicks(units)*(EXP_PER_SCORE_UNIT/precision);
}
export const MAX_POINTS=100;
export const MIN_BATCH_INTERVAL_MS=4000;
export type ScoreBatch={eventId:string;batchId:string;points:number;buildingId?:string;boostId?:string;tapFrom?:number;tapTo?:number;tapTimes?:number[]};
export function validateBatch(data:unknown):ScoreBatch {
  if (!data || typeof data !== 'object' || Buffer.byteLength(JSON.stringify(data),'utf8')>2048)
    throw new HttpsError('invalid-argument','요청은 2,048 bytes 이하여야 합니다.');
  const d=data as Record<string,unknown>;
  const timed=d.boostId!==undefined;
  const keys=Object.keys(d).filter(key=>!['boostId','tapFrom','tapTo','tapTimes'].includes(key)).sort().join(',');
  if (!['batchId,eventId,points','batchId,buildingId,eventId,points'].includes(keys) ||
      (!timed&&(d.tapFrom!==undefined||d.tapTo!==undefined))||
      (timed&&(typeof d.boostId!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(d.boostId)||!Number.isSafeInteger(d.tapFrom)||!Number.isSafeInteger(d.tapTo)||(d.tapFrom as number)<0||(d.tapTo as number)<(d.tapFrom as number)))||
      (d.buildingId!==undefined&&(typeof d.buildingId!=='string'||!/^\d{3}$/.test(d.buildingId)))||
      typeof d.eventId!=='string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(d.eventId) ||
      typeof d.batchId!=='string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(d.batchId) ||
      !Number.isSafeInteger(d.points) || (d.points as number)<1 || (d.points as number)>MAX_POINTS)
    throw new HttpsError('invalid-argument','유효한 이벤트/배치 ID와 1~100 정수 점수가 필요합니다.');
  if(d.tapTimes!==undefined&&(!Array.isArray(d.tapTimes)||d.tapTimes.length!==d.points||d.tapTimes.some((at,index,list)=>!Number.isSafeInteger(at)||at<0||(index>0&&at<list[index-1]))))
    throw new HttpsError('invalid-argument','입력 시각의 개수와 순서를 확인하세요.');
  return d as ScoreBatch;
}
// 향후 분산 카운터 구현은 이 인터페이스 뒤로 교체한다.
export function addScore(current:unknown, points:number):number {
  const total=current===undefined?0:current;
  const sum=(scoreTicks(total as number)+scoreTicks(points))/precision;
  scoreTicks(sum);return sum;
}
export const thresholds=levels;
// Firestore·배치·기기 원장은 기존 성장 단위를 유지한다. 레벨 설정은 사용자 EXP다.
export function levelForScore(score:number):number {const exp=toExperience(score);return thresholds.filter(n=>exp>=n).length;}

export function baseUnitsForScore(score:number):number{return economy.levelBaseUnits[levelForScore(score)-1];}
