import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
const url=(process.env.GAME_URL||'http://localhost:3000').replace(/^http/,'ws')+'/ws';
const clients=[];
function wait(c,predicate){return new Promise((resolve,reject)=>{const found=c.messages.find(predicate);if(found)return resolve(found);const timer=setTimeout(()=>{c.ws.off('message',listener);reject(Error('Message timeout'));},10000);function listener(raw){const data=JSON.parse(raw);if(predicate(data)){clearTimeout(timer);c.ws.off('message',listener);resolve(data);}}c.ws.on('message',listener);});}
async function connect(){const c={ws:new WebSocket(url),messages:[],bytes:0};clients.push(c);c.ws.on('message',raw=>{c.bytes+=raw.length;c.messages.push(JSON.parse(raw));});await new Promise((resolve,reject)=>{c.ws.once('open',resolve);c.ws.once('error',reject);});return c;}
const send=(c,data)=>c.ws.send(JSON.stringify(data));
try{
 const a=await connect();send(a,{type:'create'});const lobby=await wait(a,m=>m.type==='lobby');
 for(let i=0;i<3;i++){const c=await connect();send(c,{type:'join',code:lobby.code});await wait(c,m=>m.type==='lobby'&&m.members.length===i+2);}
 send(a,{type:'start'});await Promise.all(clients.map(c=>wait(c,m=>m.type==='state'&&m.players.length===4&&m.map)));
 const initial=clients.map(c=>c.messages.find(m=>m.type==='state'));
 for(const state of initial)assert.deepEqual(state.map,initial[0].map);
 for(const c of clients.slice(0,3))send(c,{type:'bomb'});
 await Promise.all(clients.map(c=>wait(c,m=>m.type==='state'&&m.bombs.length===3)));
 const done=await Promise.all(clients.map(c=>wait(c,m=>m.type==='state'&&m.status==='finished')));
 const survivor=initial[0].players[3].id;for(const state of done)assert.equal(state.winner,survivor);
 const full=JSON.stringify(initial[0]).length;
 const delta=clients[0].messages.find(m=>m.type==='state'&&!m.map);assert.ok(delta);assert.ok(JSON.stringify(delta).length<full);
 console.log(`PASS: four clients, shared map, three simultaneous bombs, consistent victory; unchanged-map snapshot ${JSON.stringify(delta).length} B vs initial ${full} B`);
}finally{for(const c of clients)c.ws.close();}
