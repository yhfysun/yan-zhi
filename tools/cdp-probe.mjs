// CDP 探测：扫所有 *.card-grid / *.market-grid / *.list-grid 容器
// + 同款「stretch 拉伸」症状的卡片（高度全等且远超内容）
import WebSocket from 'file:///C:/Users/Administrator/Desktop/github/yan-zhi-master/node_modules/.pnpm/ws@8.21.3/node_modules/ws/index.js';
import fs from 'fs';

const WS = process.argv[2];
const EXPR = fs.readFileSync(process.argv[3],'utf8');

const ws = new WebSocket(WS, { perMessageDeflate:false, maxPayload: 200*1024*1024 });
let id=1;
const waiters=new Map();
const send=(m,p)=>new Promise(r=>{const i=id++;waiters.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:p}));});
ws.on('open', async ()=>{
  const r = await send('Runtime.evaluate',{expression:EXPR,returnByValue:true,awaitPromise:true});
  console.log(JSON.stringify(r?.result ?? r, null, 1));
  ws.close(); process.exit(0);
});
ws.on('message', d=>{const m=JSON.parse(d.toString());if(m.id&&waiters.has(m.id)){waiters.get(m.id)(m.result||m.error);waiters.delete(m.id);}});
ws.on('error', e=>{console.log('WSERR',e.message);process.exit(1);});
setTimeout(()=>{console.log('TIMEOUT');process.exit(1);},30000);