import {writeFile} from 'node:fs/promises';
const output=new URL('./',import.meta.url);
const pages=await(await fetch('http://127.0.0.1:9226/json/list')).json();
const ws=new WebSocket(pages.find(page=>page.type==='page').webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
let sequence=0;const pending=new Map();
ws.onmessage=event=>{const data=JSON.parse(event.data);if(!data.id)return;const task=pending.get(data.id);if(!task)return;pending.delete(data.id);clearTimeout(task.timer);data.error?task.reject(new Error(data.error.message)):task.resolve(data.result);};
function call(method,params={}){return new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Timeout: '+method));},30000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.text+': '+result.exceptionDetails.exception?.description);return result.result.value;}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(expression){for(let i=0;i<100;i++){if(await evaluate(expression))return;await wait(200);}throw new Error('Page not ready: '+expression);}
async function navigate(url){await call('Page.navigate',{url});await until('document.readyState==="complete"');}
async function saveData(name,data){await writeFile(new URL(name,output),Buffer.from(data.split(',')[1],'base64'));}
await call('Page.enable');await call('Runtime.enable');
try{
 const action=process.argv[2]??'contact';
 if(action==='inspect'){console.log(JSON.stringify(await evaluate('({scrollY,innerHeight,viewport:{top:visualViewport.offsetTop,pageTop:visualViewport.pageTop,height:visualViewport.height},header:document.querySelector(".app-header").getBoundingClientRect().toJSON()})')));console.log(JSON.stringify(await call('Page.getLayoutMetrics')));}
 if(action==='contact'||action==='trees'||action==='remaining'){
  await navigate('http://127.0.0.1:5196/exports/instagram/render-trees.html');await until('window.captureReady===true');
  if(action==='contact'){await saveData('frame-contact-sheet.png',await evaluate('window.contactSheet'));console.log('프레임 비교 이미지 저장 완료');}
  else {
   const frames=action==='remaining'?[[2,3.5],[3,3.5],[4,3.5],[6,9],[7,9],[8,9],[9,9]]:[[1,3.5],[5,6],[10,9]];
   for(const [level,time] of frames){await saveData(`tree-lv${level}.png`,await evaluate(`window.exportTree(${level},${time})`));console.log(`tree-lv${level}.png · ${time}s · 1280×1760`);}
   if(action==='remaining')await saveData('remaining-contact-sheet.png',await evaluate(`(async()=>{
    const frames=${JSON.stringify([[2,3.5],[3,3.5],[4,3.5],[6,9],[7,9],[8,9],[9,9]])};
    const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=960;const ctx=canvas.getContext('2d');ctx.fillStyle='#101923';ctx.fillRect(0,0,1280,960);
    for(let i=0;i<frames.length;i++){const [level,time]=frames[i],image=new Image();image.src=window.exportTree(level,time);await image.decode();const x=i%4*320,y=Math.floor(i/4)*480;ctx.drawImage(image,x,y,320,440);ctx.fillStyle='#edcf97';ctx.font='16px sans-serif';ctx.textAlign='center';ctx.fillText('Lv.'+level,x+160,y+465);}
    return canvas.toDataURL('image/png');
   })()`));
  }
 }else if(action==='mobile'){
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:3,mobile:true});
  await call('Emulation.setTouchEmulationEnabled',{enabled:true});
  await navigate('https://foreon-tree-20261125.web.app/#tree');
  await until('document.querySelector(".score-total output")?.textContent!=="—" && document.querySelector(".ranking-board")?.getAttribute("aria-busy")==="false"');
  await wait(1500);await evaluate('window.scrollTo(0,0)');
  await writeFile(new URL('game-mobile.png',output),Buffer.from((await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:390,height:844,scale:1}})).data,'base64'));
  await evaluate('document.querySelector("[aria-controls=ranking-panel]").click()');await wait(1000);
  await until('!document.querySelector("#ranking-panel").hidden');
  await evaluate('document.activeElement?.blur();window.scrollTo({top:0,behavior:"instant"})');await wait(300);
  await writeFile(new URL('ranking-mobile.png',output),Buffer.from((await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:390,height:844,scale:1}})).data,'base64'));
  console.log('운영 사이트 비로그인 모바일 화면 캡처 완료 · 390×844 CSS px / 1170×2532 PNG');
 }
}finally{ws.close();}
