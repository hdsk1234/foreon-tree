export const apartmentId = 'olympic-park-foreon';
export const complexes = [
  {id:'1', start:101, end:124, buildingCount:24, households:2827},
  {id:'2', start:201, end:210, buildingCount:10, households:2760},
  {id:'3', start:301, end:321, buildingCount:21, households:3930},
  {id:'4', start:401, end:430, buildingCount:30, households:2515},
];
export const buildings = complexes.flatMap(c => Array.from(
  {length:c.end-c.start+1}, (_,i) => ({
    id:String(c.start+i), apartmentId, complexId:c.id, buildingNumber:c.start+i,
    tree:{actualLevel:1},
  })
));
export const apartment = {name:'올림픽파크 포레온', buildingCount:85,
  households:12032, complexCount:4, source:'기획자 제공 V2 초기값',
  verificationStatus:'출시 전 실제 정보 확인 필요'};
