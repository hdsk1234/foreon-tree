// 난이도 검산: 모든 입력에서 최대 콤보·5배 선물이 적용된다는 실제보다 유리한 하한.
import levels from '../functions/src/levels.json' with {type:'json'};
import economy from '../functions/src/economy.json' with {type:'json'};
export function minimumInputsToLevel10(){
 let exp=0,inputs=0;
 for(let level=1;level<levels.length;level++){
  const perInput=economy.expPerScoreUnit*economy.levelBaseUnits[level-1]*10;
  const count=Math.ceil(Math.max(0,levels[level]-exp)/perInput);
  inputs+=count;exp+=count*perInput;
 }
 return inputs;
}
const users=500,minutesPerDay=60,inputsPerSecond=3;
const weeklyInputs=users*minutesPerDay*60*inputsPerSecond*7;
if(process.argv[1]?.endsWith('balance-economy.mjs'))console.log(JSON.stringify({users,minutesPerDay,inputsPerSecond,weeklyInputs,minimumInputs:minimumInputsToLevel10(),minimumDays:minimumInputsToLevel10()/(weeklyInputs/7),level10Exp:levels.at(-1)},null,2));
