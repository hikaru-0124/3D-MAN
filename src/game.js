export const SIZE=13;
export const PLAYER_SPEED=2.4;
const actors=g=>g.players||[g.player,...g.enemies];
const ACTOR_RADIUS=.22;
const overlapsBomb=(actor,b)=>actor.x+ACTOR_RADIUS>b.x&&actor.x-ACTOR_RADIUS<b.x+1&&actor.y+ACTOR_RADIUS>b.y&&actor.y-ACTOR_RADIUS<b.y+1;
export function createGame(random=Math.random){
 const map=Array.from({length:SIZE},(_,y)=>Array.from({length:SIZE},(_,x)=>x===0||y===0||x===SIZE-1||y===SIZE-1||(x%2===0&&y%2===0)?1:random()<.48?2:0));
 for(const [x,y] of [[1,1],[1,2],[2,1],[11,11],[10,11],[11,10],[1,11],[1,10],[2,11],[11,1],[10,1],[11,2]])map[y][x]=0;
 return {map,player:{x:1.5,y:1.5,angle:0,alive:true,range:2,capacity:1},enemies:[{x:11.5,y:11.5,alive:true,next:0},{x:1.5,y:11.5,alive:true,next:0},{x:11.5,y:1.5,alive:true,next:0}],bombs:[],flames:[],items:[],time:0,score:0,status:'playing',random};
}
export function solid(g,x,y,actor){
 const cx=Math.floor(x),cy=Math.floor(y);
 return !g.map[cy]||g.map[cy][cx]!==0||g.bombs.some(b=>b.x===cx&&b.y===cy&&!b.passThrough.has(actor));
}
export function move(g,actor,dx,dy){
 const radius=ACTOR_RADIUS;
 const clear=(x,y)=>[-radius,radius].every(rx=>[-radius,radius].every(ry=>!solid(g,x+rx,y+ry,actor)));
 if(clear(actor.x+dx,actor.y))actor.x+=dx;
 if(clear(actor.x,actor.y+dy))actor.y+=dy;
 for(const b of g.bombs)if(b.passThrough.has(actor)&&!overlapsBomb(actor,b))b.passThrough.delete(actor);
}
export function placeBomb(g,actor=g.player){
 if(g.status!=='playing'||!actor.alive)return false;
 const x=Math.floor(actor.x),y=Math.floor(actor.y);
 if(g.bombs.some(b=>b.x===x&&b.y===y)||g.bombs.filter(b=>b.owner===actor).length>=(actor.capacity||1))return false;
 const bomb={x,y,owner:actor,range:actor.range||2,at:g.time+2.5,passThrough:new Set()};
 for(const a of actors(g))if(overlapsBomb(a,bomb))bomb.passThrough.add(a);
 g.bombs.push(bomb);return true;
}
export function blastCells(g,b){
 const cells=[[b.x,b.y]];
 for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])for(let n=1;n<=b.range;n++){
  const x=b.x+dx*n,y=b.y+dy*n;
  if(g.map[y]?.[x]===undefined||g.map[y][x]===1)break;
  cells.push([x,y]);if(g.map[y][x]===2)break;
 }
 return cells;
}
// Simulate pending explosions on a copy, including chain reactions and destroyed walls.
export function blastForecast(g){
 const simulation={map:g.map.map(row=>[...row])},pending=[...g.bombs],danger=new Map();
 function forecast(b,at){
  const index=pending.indexOf(b);if(index<0)return;pending.splice(index,1);
  const cells=blastCells(simulation,b);
  for(const [x,y] of cells){
   const key=x+y*SIZE;danger.set(key,Math.min(danger.get(key)??Infinity,at));
   if(simulation.map[y][x]===2)simulation.map[y][x]=0;
  }
  for(const [x,y] of cells)for(const next of [...pending])if(next.x===x&&next.y===y)forecast(next,at);
 }
 while(pending.length){const next=pending.reduce((a,b)=>a.at<=b.at?a:b);forecast(next,next.at);}
 return danger;
}
function explode(g,b){
 if(!g.bombs.includes(b))return;
 g.bombs.splice(g.bombs.indexOf(b),1);
 const cells=blastCells(g,b);
 for(const [x,y] of cells)if(g.map[y][x]===2){
  g.map[y][x]=0;g.mapRevision=(g.mapRevision||0)+1;g.score+=10;
  if(g.players)b.owner.score+=10;
  if(g.random()<.28)g.items.push({x,y,type:g.random()<.5?'range':'capacity'});
 }
 for(const [x,y] of cells){g.flames.push({x,y,until:g.time+.75});for(const next of [...g.bombs])if(next.x===x&&next.y===y)explode(g,next);}
}
const CPU_SPEED=PLAYER_SPEED;
const directions=[[1,0],[-1,0],[0,1],[0,-1]];
function cpuRoutes(g,e,danger){
 const x=Math.floor(e.x),y=Math.floor(e.y),start={x,y,arrival:Math.hypot(e.x-x-.5,e.y-y-.5)/CPU_SPEED,path:[{x:x+.5,y:y+.5}]};
 const queue=[start],seen=new Set([x+y*SIZE]);
 const flames=new Set(g.flames.map(f=>f.x+f.y*SIZE));
 for(let i=0;i<queue.length;i++){
  const node=queue[i],deadline=danger.get(node.x+node.y*SIZE);
  if(deadline!==undefined&&g.time+node.arrival+.5/CPU_SPEED+.2>=deadline)continue;
  for(const [dx,dy] of directions){
   const nx=node.x+dx,ny=node.y+dy,key=nx+ny*SIZE,arrival=node.arrival+1/CPU_SPEED;
   if(seen.has(key)||g.map[ny]?.[nx]!==0||flames.has(key)||g.bombs.some(b=>b.x===nx&&b.y===ny))continue;
   const at=danger.get(key);if(at!==undefined&&g.time+arrival+.2>=at)continue;
   seen.add(key);queue.push({x:nx,y:ny,arrival,path:[...node.path,{x:nx+.5,y:ny+.5}]});
  }
 }
 return queue.filter(n=>!flames.has(n.x+n.y*SIZE));
}
function cpuThink(g,e){
 const danger=blastForecast(g),routes=cpuRoutes(g,e,danger),safe=routes.filter(n=>!danger.has(n.x+n.y*SIZE));
 const currentDanger=danger.has(Math.floor(e.x)+Math.floor(e.y)*SIZE);
 if(currentDanger){
  // Reach the closest refuge; never lay another bomb while escaping.
  const refuge=safe.sort((a,b)=>a.arrival-b.arrival)[0];
  e.route=refuge?.path||[];return;
 }
 const centered=Math.hypot(e.x-Math.floor(e.x)-.5,e.y-Math.floor(e.y)-.5)<.09;
 if(centered&&g.time>=(e.bombCooldown||0)&&g.bombs.filter(b=>b.owner===e).length<(e.capacity||1)){
  const bomb={x:Math.floor(e.x),y:Math.floor(e.y),range:e.range||2,at:g.time+2.5};
  const blast=blastCells(g,bomb),hitsPlayer=blast.some(([x,y])=>x===Math.floor(g.player.x)&&y===Math.floor(g.player.y)),breaksBlock=blast.some(([x,y])=>g.map[y][x]===2);
  if(hitsPlayer||breaksBlock){
   const future={...g,bombs:[...g.bombs,bomb]},prediction=blastForecast(future);
   const escape=cpuRoutes(future,e,prediction).filter(n=>!prediction.has(n.x+n.y*SIZE)).sort((a,b)=>a.arrival-b.arrival)[0];
   if(escape&&placeBomb(g,e)){e.bombCooldown=g.time+3;e.route=escape.path;return;}
  }
 }
 // Collect upgrades and close the distance, without stepping into future fire.
 let best=null,bestScore=-Infinity;
 for(const node of safe){
  const distance=Math.abs(node.x-Math.floor(g.player.x))+Math.abs(node.y-Math.floor(g.player.y));
  const item=g.items.some(i=>i.x===node.x&&i.y===node.y),score=-distance*2-node.arrival*.3+(item?12:0);
  if(score>bestScore){best=node;bestScore=score;}
 }
 e.route=best?.path||[];
}
function cpuMove(g,e,dt){
 const centered=Math.hypot(e.x-Math.floor(e.x)-.5,e.y-Math.floor(e.y)-.5)<.025;
 const signature=g.bombs.map(b=>`${b.x},${b.y},${b.at}`).join(';');
 if(signature!==e.bombSignature||g.time>=e.next&&(centered||!e.route?.length)){
  e.next=g.time+.2;cpuThink(g,e);e.bombSignature=g.bombs.map(b=>`${b.x},${b.y},${b.at}`).join(';');
 }
 while(e.route?.length&&Math.hypot(e.route[0].x-e.x,e.route[0].y-e.y)<.025)e.route.shift();
 const target=e.route?.[0];if(!target)return;
 const dx=target.x-e.x,dy=target.y-e.y,distance=Math.hypot(dx,dy),step=Math.min(distance,CPU_SPEED*dt);
 const beforeX=e.x,beforeY=e.y;move(g,e,dx/distance*step,dy/distance*step);
 if(Math.hypot(e.x-beforeX,e.y-beforeY)<step*.2)e.next=0;
}
export function update(g,dt){
 if(g.status!=='playing')return;
 g.time+=dt;g.flames=g.flames.filter(f=>f.until>g.time);
 for(const b of [...g.bombs])if(b.at<=g.time)explode(g,b);
 for(const a of actors(g))if(a.alive&&g.flames.some(f=>f.x===Math.floor(a.x)&&f.y===Math.floor(a.y))){a.alive=false;if(a!==g.player)g.score+=100;}
 g.items=g.items.filter(i=>{
  const a=actors(g).find(a=>a.alive&&i.x===Math.floor(a.x)&&i.y===Math.floor(a.y));
  if(!a)return true;
  if(i.type==='range')a.range=Math.min(6,a.range+1);else a.capacity=Math.min(5,a.capacity+1);
  return false;
 });
 if(g.players){
  const alive=g.players.filter(p=>p.alive);
  if(alive.length<=1){g.status='finished';g.winner=alive[0]?.id||null;}
  return;
 }
 for(const e of g.enemies)if(e.alive)cpuMove(g,e,dt);
 if(!g.player.alive)g.status='lost';else if(g.enemies.every(e=>!e.alive))g.status='won';
}
