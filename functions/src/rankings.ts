import {Timestamp,type Firestore,type Query} from 'firebase-admin/firestore';
import complexes from './buildings.json';
import {levelForScore} from './scoring';
export const BUILDINGS=complexes.flatMap(group=>Array.from({length:group.count},(_,index)=>({buildingId:String(group.start+index),buildingNumber:group.start+index,complexId:group.id})));
type Row={buildingId:string;buildingNumber:number;complexId:string;score:number;revision:number;actualLevel:number;rank?:number};
export function rankingRows(previous:Row[],changes:Array<{id:string;score:number;revision:number}>){
 const byId=new Map(previous.map(row=>[row.buildingId,row]));
 for(const change of changes){const old=byId.get(change.id);if(!old||change.revision>=old.revision)byId.set(change.id,{...old,score:change.score,revision:change.revision} as Row);}
 const sorted=BUILDINGS.map(building=>{const value=byId.get(building.buildingId);return {...building,score:value?.score??0,revision:value?.revision??0,actualLevel:levelForScore(value?.score??0)};}).sort((a,b)=>b.score-a.score||a.buildingNumber-b.buildingNumber);
 let rank=0,score=-1;return sorted.map((row,index)=>{if(row.score!==score)rank=index+1;score=row.score;return {...row,rank};});
}
export async function publishRankingBoards(db:Firestore){
 const events=await db.collection('events').where('status','in',['active','finalizing']).limit(10).get();
 let scoreDocuments=0,boardWrites=0;
 for(const event of events.docs){
  const result=await db.runTransaction(async tx=>{
   const board=event.ref.collection('results').doc('leaderboard');
   const [current,old]=await tx.getAll(event.ref,board);
   if(!['active','finalizing'].includes(current.get('status')))return {reads:0,writes:0};
   const cursor=old.get('syncCursor'),initial=old.get('syncVersion')!==1||!(cursor instanceof Timestamp)||!Array.isArray(old.get('rows'));
   let query:Query=event.ref.collection('teamScores');
   if(!initial)query=query.where('updatedAt','>',cursor);
   const changes=await tx.get(query);
   if(initial||!changes.empty){
    const rows=rankingRows(initial?[]:old.get('rows'),changes.docs.map(doc=>({id:doc.id,score:doc.get('score')??0,revision:doc.get('revision')??0})));
    // Cursor is an authoritative server read time. Score writers use commit-time
    // serverTimestamp, so a concurrent commit cannot fall behind this cursor.
    tx.set(board,{rows,syncVersion:1,syncCursor:changes.readTime,updatedAt:Timestamp.now()});
   }
   const endsAt=current.get('endsAt');
   if(endsAt instanceof Timestamp&&endsAt.toMillis()<=Date.now())tx.update(event.ref,{status:'closed'});
   return {reads:changes.size,writes:initial||!changes.empty?1:0};
  });
  scoreDocuments+=result.reads;boardWrites+=result.writes;
 }
 return {events:events.size,scoreDocuments,boardWrites};
}
