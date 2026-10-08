import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
const base=process.env.GAME_URL||'http://localhost:3000';
const endpoint=base.replace(/^http/,'ws')+'/ws';
function connect(){return new Promise((resolve,reject)=>{const ws=new WebSocket(endpoint),messages=[],waiters=[];const timeout=setTimeout(()=>{ws.terminate();reject(Error('Connection timeout'));},10000);ws.on('error',reject);ws.on('open',()=>{clearTimeout(timeout);resolve({ws,messages,send:data=>ws.send(JSON.stringify(data)),wait:predicate=>new Promise((resolve,reject)=>{const match=messages.find(predicate);if(match){resolve(match);return;}const entry={predicate,resolve,timer:setTimeout(()=>reject(Error('Message timeout')),10000)};waiters.push(entry);})});});ws.on('message',raw=>{const data=JSON.parse(raw);messages.push(data);for(const waiter of [...waiters])if(waiter.predicate(data)){clearTimeout(waiter.timer);waiters.splice(waiters.indexOf(waiter),1);waiter.resolve(data);}});});}
let a,b;
try{
 const response=await fetch(base);assert.equal(response.status,200);assert.ok((await response.text()).includes('create-room'));
 a=await connect();b=await connect();a.send({type:'create'});const lobby=await a.wait(m=>m.type==='lobby');b.send({type:'join',code:lobby.code});const joined=await b.wait(m=>m.type==='lobby'&&m.members.length===2);assert.notEqual(lobby.id,joined.id);
 b.send({type:'start'});await b.wait(m=>m.type==='error');a.send({type:'start'});
 const ga=await a.wait(m=>m.type==='state'),gb=await b.wait(m=>m.type==='state');assert.deepEqual(ga.map,gb.map);assert.equal(ga.players.length,2);
 a.send({type:'input',forward:1,strafe:0,angle:0});await b.wait(m=>m.type==='state'&&m.players[0].x>1.5);a.send({type:'input',forward:0,strafe:0,angle:0});a.send({type:'bomb'});await b.wait(m=>m.type==='state'&&m.bombs.length===1);
 const end=await b.wait(m=>m.type==='state'&&m.status==='finished');assert.equal(end.winner,joined.id);assert.equal(end.bombs.length,0);
 a.send({type:'start'});await b.wait(m=>m.type==='state'&&m.status==='playing'&&m.players.every(p=>p.alive)&&m.time===0);
 a.ws.close();await b.wait(m=>m.type==='lobby'&&m.host===joined.id&&m.members.length===1);
 console.log('PASS: HTTP, two WebSocket clients, rooms, host permission, shared map, movement, bombs, victory, rematch, host transfer');
}finally{a?.ws.close();b?.ws.close();}
