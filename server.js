import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {WebSocketServer} from 'ws';
import {Rooms} from './src/rooms.js';
const root=resolve('.'),rooms=new Rooms();
const assets=new Map([['/','index.html'],['/index.html','index.html'],['/style.css','style.css'],['/src/main.js','src/main.js'],['/src/game.js','src/game.js']]);
const server=http.createServer(async(req,res)=>{
 try{const path=assets.get(new URL(req.url,'http://localhost').pathname);if(!path){res.writeHead(404);res.end('Not found');return;}const body=await readFile(resolve(root,path));res.writeHead(200,{'Content-Type':path.endsWith('.js')?'text/javascript; charset=utf-8':path.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(body);}catch{res.writeHead(404);res.end('Not found');}
});
const wss=new WebSocketServer({server,path:'/ws',maxPayload:2048});
wss.on('connection',ws=>{
 const client={send:(data,encoded)=>{if(ws.readyState===1&&ws.bufferedAmount<256000)ws.send(encoded||JSON.stringify(data));}},opened=Date.now();let messages=0,windowStart=opened;ws.alive=true;
 ws.on('pong',()=>ws.alive=true);
 ws.on('message',raw=>{try{
  const now=Date.now();if(now-windowStart>=1000){windowStart=now;messages=0;}if(++messages>100){ws.close(1008,'Too many messages');return;}
  const data=JSON.parse(raw);if(!data||typeof data!=='object')return;
  if(data.type==='create')rooms.join(client,undefined,data.name);
  else if(data.type==='join'){if(typeof data.code!=='string'||!/^[A-F0-9]{6}$/.test(data.code))throw Error('6桁の部屋コードを入力してください。');rooms.join(client,data.code,data.name);}
  else if(data.type==='start')rooms.start(client);
  else if(data.type==='input')rooms.input(client,data);
  else if(data.type==='bomb')rooms.bomb(client);
  else if(data.type==='leave')rooms.leave(client);
 }catch(e){client.send({type:'error',message:e.message||'通信エラーが発生しました。'});}});
 ws.on('close',()=>rooms.leave(client));ws.on('error',()=>{});
});
let previous=performance.now();const tick=setInterval(()=>{const now=performance.now();rooms.tick(Math.min((now-previous)/1000,.1));previous=now;},50);
const heartbeat=setInterval(()=>{for(const ws of wss.clients){if(!ws.alive){ws.terminate();continue;}ws.alive=false;ws.ping();}},15000);
server.on('close',()=>{clearInterval(tick);clearInterval(heartbeat);});
server.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('ボンバーひろば → http://localhost:'+(process.env.PORT||3000)));
