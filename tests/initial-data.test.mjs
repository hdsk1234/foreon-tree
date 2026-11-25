import test from 'node:test';
import assert from 'node:assert/strict';
import {apartment,complexes,buildings,apartmentId} from '../scripts/initial-data.mjs';
test('기획 초기값: 85개 고유 동과 12,032세대',()=>{
  assert.equal(buildings.length,85);assert.equal(new Set(buildings.map(b=>b.id)).size,85);
  assert.equal(complexes.reduce((n,c)=>n+c.households,0),12032);
  assert.equal(apartment.households,12032);
  for(const c of complexes){const group=buildings.filter(b=>b.complexId===c.id);assert.equal(group.length,c.buildingCount);assert.equal(group[0].buildingNumber,c.start);assert.equal(group.at(-1).buildingNumber,c.end);}
  assert.ok(buildings.every(b=>b.apartmentId===apartmentId&&b.tree.actualLevel===1));
});
