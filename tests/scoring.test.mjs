import test from 'node:test';
import assert from 'node:assert/strict';
import scoring from '../functions/lib/scoring.js';
const {validateBatch,addScore,levelForScore,toExperience,MAX_SCORE_UNITS,thresholds}=scoring;
test('점수 스키마/크기/범위 검증',()=>{
 const valid={eventId:'winter',batchId:'1234567890abcdef',points:1};assert.deepEqual(validateBatch(valid),valid);
 for(const points of [0,-1,1.5,101,'1',null])assert.throws(()=>validateBatch({...valid,points}));
 assert.equal(validateBatch({...valid,buildingId:'101'}).buildingId,'101');
 const timed={...valid,boostId:'timed-boost-grant-01',tapFrom:1000,tapTo:59999};assert.deepEqual(validateBatch(timed),timed);
 for(const change of [{tapFrom:-1},{tapTo:999},{tapFrom:'1000'},{tapTo:1.5}])assert.throws(()=>validateBatch({...timed,...change}));
 assert.throws(()=>validateBatch({...valid,tapFrom:1000,tapTo:2000}));
 assert.throws(()=>validateBatch({...valid,multiplier:5}));
 assert.throws(()=>validateBatch({...valid,batchId:'x'.repeat(600)}));
 assert.throws(()=>validateBatch({...valid,eventId:'../users'}));
});
test('점수 오버플로와 성장 임계점',()=>{
 assert.equal(addScore(undefined,1),1);assert.equal(addScore(99,1),100);
 assert.throws(()=>addScore(Number.MAX_SAFE_INTEGER,1));
 assert.equal(toExperience(1),1000);assert.equal(toExperience(5),5000);assert.equal(thresholds[1],100000);
 assert.throws(()=>addScore(MAX_SCORE_UNITS,1));assert.throws(()=>toExperience(MAX_SCORE_UNITS+1));
 assert.equal(levelForScore(0),1);assert.equal(levelForScore(99),1);assert.equal(levelForScore(100),2);assert.equal(levelForScore(25000000000),10);
});
