import {initializeApp} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {apartmentId, apartment, complexes, buildings} from './initial-data.mjs';
const projectId=process.env.GCLOUD_PROJECT;
if (!projectId) throw new Error('GCLOUD_PROJECT를 명시하세요.');
if (!process.env.FIRESTORE_EMULATOR_HOST && !process.argv.includes('--production'))
  throw new Error('실제 데이터 생성은 --production을 명시해야 합니다.');
initializeApp({projectId});
const db=getFirestore();
// 재실행 시 기존 트리/점수/운영 데이터를 덮어쓰지 않는다.
const docs=[
  [`apartments/${apartmentId}`,apartment],
  ...complexes.map(({id,...data})=>[`apartments/${apartmentId}/complexes/${id}`,{...data,apartmentId}]),
  ...buildings.map(({id,...data})=>[`apartments/${apartmentId}/buildings/${id}`,data]),
];
for (const [path,data] of docs) {
  await db.runTransaction(async tx=>{const ref=db.doc(path);if (!(await tx.get(ref)).exists) tx.create(ref,data);});
}
console.log(`초기 데이터 확인 완료: ${buildings.length}개 동/트리. 기존 문서는 유지됨.`);
