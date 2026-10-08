import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Rooms} from '../src/rooms.js';
const client=()=>({messages:[],send(data){this.messages.push(structuredClone(data));}});
function pair(){const rooms=new Rooms(),a=client(),b=client(),room=rooms.join(a);rooms.join(b,room.code);rooms.start(a);return {rooms,a,b,room};}
test('room joining, host permissions, capacity and isolated rooms',()=>{
 const rooms=new Rooms(),a=client(),b=client(),room=rooms.join(a);assert.throws(()=>rooms.start(a));rooms.join(b,room.code);assert.throws(()=>rooms.start(b));rooms.join(client(),room.code);rooms.join(client(),room.code);assert.throws(()=>rooms.join(client(),room.code));const other=rooms.join(client());assert.notEqual(other.code,room.code);rooms.start(a);assert.throws(()=>rooms.start(a));assert.throws(()=>rooms.join(client(),room.code));assert.equal(room.game.players.length,4);
});
test('server clamps movement and owns shared bombs and time',()=>{
 const {rooms,a,b,room}=pair(),g=room.game;
 rooms.input(a,{forward:999,strafe:0,angle:0},1000);rooms.tick(.05,1000);assert.ok(Math.abs(g.players[0].x-1.62)<1e-9);rooms.bomb(a);assert.equal(g.bombs.length,1);rooms.bomb(a);assert.equal(g.bombs.length,1);
 const last=b.messages.at(-1);assert.equal(last.type,'state');assert.equal(last.players[0].x,g.players[0].x);
 rooms.input(a,{forward:NaN,strafe:0,angle:0},1000);const x=g.players[0].x;rooms.tick(.05,1400);assert.equal(g.players[0].x,x);
 rooms.tick(2.6,4000);assert.equal(g.status,'finished');assert.equal(g.winner,b.id);
});
test('all players collect items and simultaneous deaths draw',()=>{
 const {rooms,a,b,room}=pair(),g=room.game;const p=g.players[1];g.items.push({x:11,y:11,type:'capacity'});rooms.tick(.05);assert.equal(p.capacity,2);
 for(const p of g.players){g.flames.push({x:Math.floor(p.x),y:Math.floor(p.y),until:10});}rooms.tick(.05);assert.equal(g.status,'finished');assert.equal(g.winner,null);
 rooms.start(a);assert.equal(room.game.status,'playing');assert.ok(room.game.players.every(p=>p.alive));
});
test('disconnect ends match, transfers host and cleans empty rooms',()=>{
 const {rooms,a,b,room}=pair();rooms.leave(a);rooms.tick(.05);assert.equal(room.game.winner,b.id);assert.equal(room.members[0],b);rooms.leave(b);assert.equal(rooms.rooms.size,0);
});
test('map is sent initially and only again after blocks change',()=>{
 const {rooms,a,room}=pair();assert.ok(a.messages.at(-1).map);
 rooms.tick(.05);assert.equal(a.messages.at(-1).map,undefined);
 room.game.map[1][2]=2;rooms.bomb(a);room.game.players[0].x=1.5;room.game.players[0].y=3.5;
 rooms.tick(2.6);assert.ok(a.messages.at(-1).map);assert.equal(a.messages.at(-1).map[1][2],0);
});
test('custom names survive lobby, game snapshots, host transfer and rematches',()=>{
 const rooms=new Rooms(),a=client(),b=client(),c=client(),room=rooms.join(a,undefined,'  たろう  ');rooms.join(b,room.code,'ボム💣');rooms.join(c,room.code,'<b>さくら</b>');
 assert.deepEqual(a.messages.at(-1).members.map(p=>p.name),['たろう','ボム💣','<b>さくら</b>']);
 rooms.start(a);assert.deepEqual(room.game.players.map(p=>p.name),['たろう','ボム💣','<b>さくら</b>']);
 rooms.leave(a);assert.equal(b.messages.at(-1).members[0].name,'ボム💣');
 room.game.status='finished';rooms.start(b);assert.equal(room.game.players[0].name,'ボム💣');
});
test('names validate before creating rooms and support 12 emoji characters',()=>{
 const rooms=new Rooms();assert.throws(()=>rooms.join(client(),undefined,'あ'.repeat(13)));assert.throws(()=>rooms.join(client(),undefined,{}));assert.equal(rooms.rooms.size,0);
 const a=client();rooms.join(a,undefined,'💣'.repeat(12));assert.equal(a.name,'💣'.repeat(12));
 const b=client();rooms.join(b,undefined,' \n ');assert.equal(b.name,'プレイヤー 1');
});
