import {useEffect,useState} from 'react';
import {sanitizeTreeStyle,type TreeStyle} from '../engine/treeDesign.mjs';
export function useTreeStyle(scope:string|null){
 const key=scope?`foreon:tree-style:v1:${scope}`:null;
 const [saved,setSaved]=useState<{key:string|null;style:TreeStyle}>({key:null,style:{}});
 const [storageFailed,setStorageFailed]=useState(false);
 useEffect(()=>{
  setStorageFailed(false);let style:TreeStyle={};
  try{if(key)style=sanitizeTreeStyle(JSON.parse(localStorage.getItem(key)??'{}'));}catch{setStorageFailed(true);}
  setSaved({key,style});
 },[key]);
 const style=saved.key===key?saved.style:{};
 function update(next:TreeStyle){
  if(!key)return;const clean=sanitizeTreeStyle(next);setSaved({key,style:clean});
  try{localStorage.setItem(key,JSON.stringify(clean));setStorageFailed(false);}catch{setStorageFailed(true);}
 }
 return {style,update,storageFailed};
}
