import {randomBytes,randomUUID} from 'node:crypto';
import {createGame,move,placeBomb,update,PLAYER_SPEED} from './game.js';
export class Rooms {
 constructor(){this.rooms=new Map();}
 join(client,code,name){
  if(name!==undefined&&typeof name!=='string')throw Error('ユーザーネームを文字で入力してください。');
  const username=(name||'').replace(/[\u0000-\u001f\u007f]/g,'').trim();
  if(Array.from(username).length>12)throw Error('ユーザーネームは12文字以内で入力してください。');
  if(client.room)throw Error('すでに部屋に参加しています。');
  let room;
  if(code){room=this.rooms.get(code);if(!room)throw Error('部屋が見つかりません。');}
  else{if(this.rooms.size>=100)throw Error('部屋がいっぱいです。');do{code=randomBytes(3).toString('hex').toUpperCase();}while(this.rooms.has(code));room={code,members:[],game:null};this.rooms.set(code,room);}
  if(room.game?.status==='playing')throw Error('この部屋は対戦中です。');
  if(room.members.length>=4)throw Error('部屋は満員です（最大4人）。');
  client.id=randomUUID();client.name=username||`プレイヤー ${room.members.length+1}`;client.room=room;client.input={forward:0,strafe:0,angle:0};client.lastInput=0;room.members.push(client);
  this.broadcast(room);return room;
 }
 send(client,data,encoded){client.send(data,encoded);}
 broadcast(room){const lobby={type:'lobby',code:room.code,host:room.members[0]?.id,members:room.members.map((c,i)=>({id:c.id,name:c.name})),playing:room.game?.status==='playing'};for(const c of room.members)this.send(c,{...lobby,id:c.id});}
 start(client){
  const room=client.room;if(!room||room.members[0]!==client)throw Error('ホストだけが開始できます。');
  if(room.game?.status==='playing')throw Error('対戦はすでに始まっています。');
  if(room.members.length<2)throw Error('2人以上で開始できます。');
  const game=createGame(),spawns=[[1.5,1.5,0],[11.5,11.5,Math.PI],[1.5,11.5,-Math.PI/2],[11.5,1.5,Math.PI/2]];
  game.enemies=[];game.players=room.members.map((c,i)=>{const [x,y,angle]=spawns[i];c.input={forward:0,strafe:0,angle};c.lastInput=0;return {id:c.id,name:c.name,x,y,angle,alive:true,range:2,capacity:1,score:0};});game.player=game.players[0];room.game=game;room.sentMapRevision=-1;this.snapshot(room);
 }
 input(client,data,now=Date.now()){
  if(!client.room?.game||!Number.isFinite(data.angle)||!Number.isFinite(data.forward)||!Number.isFinite(data.strafe))return;
  client.input={angle:Math.atan2(Math.sin(data.angle),Math.cos(data.angle)),forward:Math.max(-1,Math.min(1,data.forward)),strafe:Math.max(-1,Math.min(1,data.strafe))};client.lastInput=now;
 }
 bomb(client){const g=client.room?.game,p=g?.players.find(p=>p.id===client.id);if(p)placeBomb(g,p);}
 tick(dt,now=Date.now()){
  for(const room of this.rooms.values()){
   const g=room.game;if(!g||g.status!=='playing')continue;
   for(const c of room.members){const p=g.players.find(p=>p.id===c.id);if(!p?.alive)continue;const input=c.input;p.angle=input.angle;
    if(now-c.lastInput>300)continue;
    const {forward,strafe,angle}=input,norm=Math.max(1,Math.hypot(forward,strafe));
    move(g,p,(Math.cos(angle)*forward-Math.sin(angle)*strafe)*PLAYER_SPEED*dt/norm,(Math.sin(angle)*forward+Math.cos(angle)*strafe)*PLAYER_SPEED*dt/norm);
   }
   update(g,dt);this.snapshot(room);
  }
 }
 snapshot(room){const g=room.game;if(!g)return;const state={type:'state',players:g.players,bombs:g.bombs.map(b=>({x:b.x,y:b.y,at:b.at,range:b.range})),flames:g.flames,items:g.items,time:g.time,status:g.status,winner:g.winner};if(room.sentMapRevision!==(g.mapRevision||0)){state.map=g.map;room.sentMapRevision=g.mapRevision||0;}
 const encoded=JSON.stringify(state);for(const c of room.members)this.send(c,state,encoded);}
 leave(client){const room=client.room;if(!room)return;room.members=room.members.filter(c=>c!==client);const p=room.game?.players.find(p=>p.id===client.id);if(p)p.alive=false;client.room=null;if(!room.members.length)this.rooms.delete(room.code);else this.broadcast(room);}
}
