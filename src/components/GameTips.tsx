import {useEffect,useState} from 'react';
const RULES=[
 '트리 레벨이 오르면 클릭당 경험치가 증가해요.',
 '트리 레벨이 오를수록 새로운 요소가 해금돼요.',
 '콤보를 이어 가면 최대 2배의 경험치를 얻어요.',
 '선물 효과는 60초 동안 콤보와 함께 적용돼요.',
 '이전 레벨 트리를 눌러도 최고 해금 레벨 기준으로 경험치를 얻어요.',
 '트리 꾸미기에서 해금한 장식과 색상을 바꿔 보세요.',
];
export function GameTips({active,intro}:{active:boolean;intro?:string}){
 const [index,setIndex]=useState(0),tips=intro?[intro,...RULES]:RULES;
 useEffect(()=>{
  setIndex(0);let timer:ReturnType<typeof setInterval>|undefined;
  const sync=()=>{clearInterval(timer);if(active&&!document.hidden)timer=setInterval(()=>setIndex(value=>value+1),5000);};
  sync();document.addEventListener('visibilitychange',sync);
  return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',sync);};
 },[active,intro]);
 return <p className="tree-hint game-tip" aria-live="off"><span key={index}>{tips[index%tips.length]}</span></p>;
}
