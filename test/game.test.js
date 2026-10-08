import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame,placeBomb,update,move} from '../src/game.js';
test('spawn is clear and walls block movement',()=>{const g=createGame(()=>0);assert.equal(g.map[1][1],0);move(g,g.player,-1,0);assert.equal(g.player.x,1.5);});
test('bomb capacity and explosion damage',()=>{const g=createGame(()=>.9);assert.ok(placeBomb(g));assert.equal(placeBomb(g),false);update(g,2.6);assert.equal(g.bombs.length,0);assert.equal(g.status,'lost');});
test('destructible block stops fire and permanent wall survives',()=>{const g=createGame(()=>.9);g.map[1][2]=2;placeBomb(g);g.player.x=1.5;g.player.y=3.5;update(g,2.6);assert.equal(g.map[1][2],0);assert.ok(!g.flames.some(f=>f.x===3&&f.y===1));assert.equal(g.map[0][1],1);});
test('chain reaction detonates another bomb',()=>{const g=createGame(()=>.9);placeBomb(g);g.player.capacity=2;g.player.x=3.5;placeBomb(g);g.bombs[1].at=10;g.player.y=3.5;update(g,2.6);assert.equal(g.bombs.length,0);});
test('player can fully leave a bomb in all four directions, but cannot reenter',()=>{
 for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
  const g=createGame(()=>.9);g.player.x=5.5;g.player.y=5.5;placeBomb(g);
  for(let i=0;i<20;i++)move(g,g.player,dx*.05,dy*.05);
  assert.ok(Math.abs(g.player.x-(5.5+dx))+Math.abs(g.player.y-(5.5+dy))<.00001);
  assert.equal(g.bombs[0].passThrough.has(g.player),false);
  for(let i=0;i<20;i++)move(g,g.player,-dx*.05,-dy*.05);
  assert.ok(dx?Math.abs(g.player.x-5.5)>=.72:Math.abs(g.player.y-5.5)>=.72);
 }
});
test('CPU can leave its own bomb and other actors cannot enter',()=>{
 const g=createGame(()=>.9),e=g.enemies[0];e.x=5.5;e.y=5.5;placeBomb(g,e);
 for(let i=0;i<20;i++)move(g,e,.05,0);
 assert.ok(e.x>6.4);assert.equal(g.bombs[0].passThrough.has(e),false);
 g.player.x=4.5;g.player.y=5.5;
 for(let i=0;i<20;i++)move(g,g.player,.05,0);
 assert.ok(g.player.x<4.8);
});
test('forecast respects walls, includes first brick and never mutates game',async()=>{
 const {blastForecast,SIZE}=await import('../src/game.js');const g=createGame(()=>.9);g.map[1][2]=2;placeBomb(g);const before=structuredClone(g.map),danger=blastForecast(g);
 assert.equal(danger.get(1+SIZE),2.5);assert.equal(danger.get(2+SIZE),2.5);assert.equal(danger.has(3+SIZE),false);assert.equal(danger.has(1),false);assert.deepEqual(g.map,before);assert.equal(g.bombs.length,1);
});
test('forecast includes chain timing and routes opened by earlier explosions',async()=>{
 const {blastForecast,SIZE}=await import('../src/game.js');const g=createGame(()=>.9);g.bombs=[{x:1,y:1,range:2,at:2.5},{x:3,y:1,range:3,at:5},{x:7,y:1,range:4,at:6}];g.map[1][6]=2;
 const danger=blastForecast(g);assert.equal(danger.get(5+SIZE),2.5);assert.equal(danger.get(6+SIZE),2.5);assert.equal(danger.get(4+SIZE),2.5);assert.equal(danger.get(3+SIZE),2.5);
 assert.equal(g.map[1][6],2);
});
test('CPU destroys a block and escapes its own bomb',()=>{
 const g=createGame(()=>.9),e={x:5.5,y:5.5,alive:true,next:0};g.enemies=[e];g.player.x=9.5;g.player.y=9.5;g.map[5][6]=2;
 update(g,.025);assert.equal(g.bombs.length,1);
 for(let n=0;n<120&&g.status==='playing';n++)update(g,.025);
 assert.equal(g.map[5][6],0);assert.equal(e.alive,true);assert.ok(Math.hypot(e.x-5.5,e.y-5.5)>1);
});
test('CPU will not plant a bomb when there is no escape route',()=>{
 const g=createGame(()=>.9),e={x:5.5,y:5.5,alive:true,next:0};g.enemies=[e];g.player.x=9.5;g.player.y=9.5;
 for(const [x,y] of [[4,5],[6,5],[5,4],[5,6]])g.map[y][x]=2;
 for(let n=0;n<120;n++)update(g,.025);
 assert.equal(g.bombs.length,0);assert.equal(e.alive,true);
});
test('CPU closes in on the player and attacks without self-destructing',()=>{
 const g=createGame(()=>.9);g.enemies=[g.enemies[0]];
 for(let n=0;n<800&&g.status==='playing';n++)update(g,.025);
 assert.equal(g.status,'lost');assert.equal(g.enemies[0].alive,true);
});
test('CPU runs out of an opponent bomb footprint',()=>{
 const g=createGame(()=>.9),e={x:1.5,y:2.5,alive:true,next:0};g.enemies=[e];placeBomb(g);g.player.x=7.5;g.player.y=7.5;
 for(let n=0;n<120&&g.status==='playing';n++)update(g,.025);
 assert.equal(e.alive,true);assert.ok(e.x>=2||e.y>=4);
});
