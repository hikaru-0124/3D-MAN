import {createGame,move,placeBomb,update,SIZE,PLAYER_SPEED,blastForecast} from './game.js';
const canvas=document.querySelector('#view'),ctx=canvas.getContext('2d'),map=document.querySelector('#map'),mc=map.getContext('2d');
mc.setTransform(3,0,0,3,0,0);
let g=createGame(),active=false,last=performance.now(),depth=new Float32Array(1400),keys=new Set();
const touchDevice=matchMedia('(pointer: coarse)').matches||navigator.maxTouchPoints>0;
document.body.classList.toggle('touch-device',touchDevice);
let touchForward=0,touchStrafe=0,stickPointer=null,lookPointer=null,lookX=0,lookY=0,pitch=0;
const touchControls=document.querySelector('#touch-controls'),stick=document.querySelector('#joystick'),knob=document.querySelector('#stick-knob');
let lastRender=0,lastHud=0,lastMap=0,quality='auto',resolutionFactor=1,renderCost=0,slowFrames=0;
const hudCache=new Map();
const hud={clock:document.querySelector('#clock'),state:document.querySelector('#state'),range:document.querySelector('#range'),capacity:document.querySelector('#capacity'),enemies:document.querySelector('#enemies'),score:document.querySelector('#score')};
function resetTouch(){touchForward=touchStrafe=0;stickPointer=lookPointer=null;knob.style.transform='translate(-50%,-50%)';}
function dropInput(){keys.clear();resetTouch();}
function rotateView(delta,vertical=0){if(online)viewAngle+=delta;else g.player.angle+=delta;pitch=Math.max(-.5,Math.min(.5,pitch-vertical));}
function bomb(){if(!active)return;if(online)send({type:'bomb'});else placeBomb(g);}
function stickMove(e){const rect=stick.getBoundingClientRect(),radius=rect.width*.32,dx=e.clientX-rect.left-rect.width/2,dy=e.clientY-rect.top-rect.height/2,norm=Math.max(radius,Math.hypot(dx,dy));touchStrafe=dx/norm;touchForward=-dy/norm;if(Math.hypot(dx,dy)<radius*.12)touchForward=touchStrafe=0;knob.style.transform=`translate(calc(-50% + ${touchStrafe*radius}px),calc(-50% - ${touchForward*radius}px))`;}
stick.addEventListener('pointerdown',e=>{if(!active||stickPointer!==null)return;e.preventDefault();stickPointer=e.pointerId;stick.setPointerCapture(e.pointerId);stickMove(e);});
stick.addEventListener('pointermove',e=>{if(e.pointerId===stickPointer)stickMove(e);});
for(const type of ['pointerup','pointercancel','lostpointercapture'])stick.addEventListener(type,e=>{if(e.pointerId===stickPointer){stickPointer=null;touchForward=touchStrafe=0;knob.style.transform='translate(-50%,-50%)';}});
canvas.addEventListener('pointerdown',e=>{if(!active||e.pointerType==='mouse'||lookPointer!==null)return;e.preventDefault();lookPointer=e.pointerId;lookX=e.clientX;lookY=e.clientY;canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(e.pointerId===lookPointer&&active){rotateView((e.clientX-lookX)*.003,(e.clientY-lookY)*.003);lookX=e.clientX;lookY=e.clientY;}});
for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,e=>{if(e.pointerId===lookPointer)lookPointer=null;});
document.querySelector('#touch-bomb').addEventListener('pointerdown',e=>{e.preventDefault();bomb();});
document.querySelector('#touch-pause').onclick=()=>{if(active)pause();};
canvas.addEventListener('contextmenu',e=>e.preventDefault());touchControls.addEventListener('contextmenu',e=>e.preventDefault());
if(touchDevice){document.querySelector('#control-help').textContent='左スティックで移動・画面をスワイプで視点・右ボタンで爆弾';document.querySelector('.bottom-hud>span:last-child').textContent='左で移動 ／ 画面をスワイプで視点 ／ ● 爆弾';}
const overlay=document.querySelector('#overlay'),button=document.querySelector('#start');
let socket=null,online=false,myId=null,room=null,viewAngle=0,nextInput=0,hasState=false;
const panel=document.querySelector('#online-panel'),networkMessage=document.querySelector('#network-message');
function send(data){if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(data));}
function show(title,description,label){dangerNotice.hidden=true;dropInput();touchControls.hidden=true;overlay.style.display='flex';document.querySelector('#message').textContent=title;document.querySelector('#description').textContent=description;button.innerHTML=label+' <span>▶</span>';}
function pause(){active=false;dropInput();send({type:'input',forward:0,strafe:0,angle:viewAngle});document.exitPointerLock?.();if(online){show('操作を中断しています','対戦は続いています。戻ってバトルを続けよう。','対戦に戻る');panel.hidden=false;}else show('一時停止','準備ができたら、ひろばへ戻ろう。','プレイ再開');}
function enter(){active=true;dropInput();overlay.style.display='none';touchControls.hidden=!touchDevice;if(!touchDevice)canvas.requestPointerLock?.()?.catch(()=>{});}
button.onclick=()=>{if(online){if(hasState&&g.status==='playing'&&g.player.alive)enter();return;}if(g.status!=='playing'){g=createGame();pitch=0;}panel.hidden=true;enter();};
document.addEventListener('pointerlockchange',()=>{if(!touchDevice&&document.pointerLockElement!==canvas&&active)pause();});
document.addEventListener('mousemove',e=>{if(active&&document.pointerLockElement===canvas){rotateView(e.movementX*.00125,e.movementY*.00125);}});
document.addEventListener('keydown',e=>{if(e.target instanceof HTMLInputElement)return;if(['Space','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.code))e.preventDefault();keys.add(e.code);if(e.code==='Space'&&active&&!e.repeat)bomb();if(e.code==='Escape'&&active)pause();});
document.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{dropInput();if(active)pause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&active)pause();});
const usernameInput=document.querySelector('#username');
try{usernameInput.value=localStorage.getItem('bomber-username')||'';}catch{}
function connect(action){
 const name=usernameInput.value.replace(/[\u0000-\u001f\u007f]/g,'').trim();
 if(Array.from(name).length>12){networkMessage.textContent='ユーザーネームは12文字以内で入力してください。';usernameInput.focus();return;}
 usernameInput.value=name;action={...action,name};
 try{localStorage.setItem('bomber-username',name);}catch{}
 if(online){networkMessage.textContent='すでに部屋に参加しています。変更する場合は退出してください。';return;}
 if(socket&&socket.readyState===WebSocket.CONNECTING){networkMessage.textContent='接続中です。少し待ってからもう一度お試しください。';return;}
 socket?.close();
 networkMessage.textContent='接続しています…';socket=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/ws`);
 const connection=socket;
 const timeout=setTimeout(()=>{
  if(socket!==connection||online)return;
  socket=null;connection.close();resetOnline();networkMessage.textContent='接続がタイムアウトしました。「部屋を作る」をもう一度押してください。';
 },10000);
 socket.onopen=()=>{if(socket===connection)connection.send(JSON.stringify(action));};
 socket.onmessage=event=>{if(socket!==connection)return;const data=JSON.parse(event.data);
  if(data.type==='error'){clearTimeout(timeout);networkMessage.textContent=data.message;if(!online){socket.close();}return;}
  if(data.type==='lobby'){
   clearTimeout(timeout);online=true;usernameInput.disabled=true;myId=data.id;room=data;document.querySelector('#room-entry').hidden=true;document.querySelector('#room-lobby').hidden=false;document.querySelector('#room-label').textContent=data.code;
   document.querySelector('#room-members').textContent=data.members.map(m=>m.name+(m.id===myId?'（あなた）':'')+(m.id===data.host?' ★':'')).join(' / ');
   const start=document.querySelector('#start-match');start.disabled=data.host!==myId||data.members.length<2||data.playing;start.textContent=hasState&&g.status==='finished'?'もう一度対戦':'対戦開始';
   networkMessage.textContent=data.playing?'対戦中です。':data.host===myId?'2人以上そろったら対戦開始を押してください。':'ホストが対戦を開始するまで待ってください。';
   if(!hasState){show('友達を待っています', '部屋コードまたは招待URLを共有して参加してもらおう。','CPUとあそぶ');button.hidden=true;panel.hidden=false;}
  }
  if(data.type==='state'){
   const first=!hasState||g.status==='finished'&&data.status==='playing',wasAlive=g.player.alive;
   const player=data.players.find(p=>p.id===myId);if(!player)return;
   if(first){viewAngle=player.angle;pitch=0;}
   g={...data,map:data.map||g.map,player:{...player,angle:viewAngle},enemies:data.players.filter(p=>p.id!==myId),score:player.score};hasState=true;
   if(first){active=false;button.hidden=false;panel.hidden=true;show('対戦スタート！','クリックして参加しよう。対戦はすでに始まっています。','対戦に参加');}
   if(data.status==='finished'){
    active=false;dropInput();document.exitPointerLock?.();const winner=data.players.find(p=>p.id===data.winner);show(data.winner===myId?'やったね！ あなたの勝ち！':winner?`${winner.name} の勝ち！`:'引き分け！','同じ部屋でもう一度対戦できます。','対戦終了');button.hidden=true;panel.hidden=false;room.playing=false;document.querySelector('#start-match').disabled=room.host!==myId||room.members.length<2;document.querySelector('#start-match').textContent='もう一度対戦';
   }else if(wasAlive&&!player.alive){active=false;dropInput();document.exitPointerLock?.();show('爆風に巻き込まれた！','ほかのプレイヤーの決着を待っています。','観戦中');button.hidden=true;panel.hidden=false;}
  }
 };
 socket.onerror=()=>{if(socket===connection)networkMessage.textContent='サーバーに接続できませんでした。「部屋を作る」をもう一度押してください。';};
 socket.onclose=()=>{clearTimeout(timeout);if(socket!==connection)return;socket=null;const interrupted=online;resetOnline();if(!interrupted&&networkMessage.textContent==='接続しています…')networkMessage.textContent='接続が切れました。「部屋を作る」をもう一度押してください。';if(interrupted){document.exitPointerLock?.();show('接続が切れました','部屋へ入り直してください。','CPUとあそぶ');networkMessage.textContent='接続が切れました。部屋へ入り直してください。';}};
}
function resetOnline(){pitch=0;usernameInput.disabled=false;online=false;active=false;dropInput();room=null;myId=null;hasState=false;g=createGame();button.hidden=false;panel.hidden=false;document.querySelector('#room-entry').hidden=false;document.querySelector('#room-lobby').hidden=true;}
document.querySelector('#create-room').onclick=()=>connect({type:'create'});
document.querySelector('#join-form').onsubmit=e=>{e.preventDefault();connect({type:'join',code:document.querySelector('#room-code').value.trim().toUpperCase()});};
document.querySelector('#start-match').onclick=()=>send({type:'start'});
document.querySelector('#leave-room').onclick=()=>{send({type:'leave'});socket?.close();resetOnline();show('ボンバーひろばへようこそ！','CPU戦や友達との通信対戦を楽しもう。','CPUとあそぶ');};
document.querySelector('#copy-room').onclick=async()=>{const url=new URL(location.href);url.searchParams.set('room',room.code);try{await navigator.clipboard.writeText(url.href);networkMessage.textContent='招待URLをコピーしました！';}catch{networkMessage.textContent=`招待URL: ${url.href}`;}};
const invite=new URLSearchParams(location.search).get('room');if(invite&&/^[a-fA-F0-9]{6}$/.test(invite)){document.querySelector('#room-code').value=invite.toUpperCase();networkMessage.textContent='「参加する」を押して友達の部屋に入ろう。';}
let danger=new Map(),dangerMap=null,dangerBombs='',dangerRevision=-1;
const dangerNotice=document.querySelector('#danger-notice');
function refreshDanger(){
 const fingerprint=g.bombs.map(b=>`${b.x},${b.y},${b.range},${b.at}`).join(';');
 if(dangerMap===g.map&&dangerBombs===fingerprint&&dangerRevision===(g.mapRevision||0))return;
 dangerMap=g.map;dangerBombs=fingerprint;dangerRevision=g.mapRevision||0;danger=blastForecast(g);
}
function render(now){
 refreshDanger();
 const w=canvas.width,h=canvas.height,p=g.player,half=h*(.47+Math.tan(pitch)*.6),fov=Math.PI/3;
 const sky=ctx.createLinearGradient(0,0,0,half);sky.addColorStop(0,'#79bff0');sky.addColorStop(1,'#d3f1fc');ctx.fillStyle=sky;ctx.fillRect(0,0,w,half);
 // Soft cartoon clouds in the open sky.
 ctx.fillStyle='#ffffffb8';
 for(let i=0;i<5;i++){const x=((i*w*.29-p.angle*w*.2)%(w*1.4)+w*1.4)%(w*1.4)-w*.15,y=h*(.09+(i%3)*.04)+half-h*.47;ctx.beginPath();ctx.ellipse(x,y,w*.055,h*.025,0,0,Math.PI*2);ctx.ellipse(x-w*.025,y+h*.005,w*.04,h*.018,0,0,Math.PI*2);ctx.ellipse(x+w*.025,y+h*.005,w*.04,h*.018,0,0,Math.PI*2);ctx.fill();}
 // Perspective ground tiles stay aligned to the world as the camera turns.
 const ca=Math.cos(p.angle),sa=Math.sin(p.angle),plane=Math.tan(fov/2);
 for(let row=Math.ceil(half)+1;row<h;row+=8){
  const distance=h*.36/(row-half);
  for(let col=0;col<w;col+=8){const lateral=(col/w-.5)*2*plane,wx=p.x+distance*(ca-sa*lateral),wy=p.y+distance*(sa+ca*lateral),checker=(Math.floor(wx)+Math.floor(wy))&1;
   const cx=Math.floor(wx),cy=Math.floor(wy),at=danger.get(cx+cy*SIZE);
   if(at!==undefined&&cx>=0&&cy>=0&&cx<SIZE&&cy<SIZE){
    const edge=wx-cx<.07||wx-cx>.93||wy-cy<.07||wy-cy>.93,stripe=(Math.floor((wx+wy)*7)&1)===0,urgent=at-g.time<=1;
    ctx.fillStyle=edge?'#fff0bb':urgent?(stripe?'#ef7650':'#f59865'):(stripe?'#eaae48':'#f6c56a');
   }else ctx.fillStyle=checker?'#82bc59':'#8ec663';
   ctx.fillRect(col,row,8,8);
  }
 }
 const step=2;
 for(let col=0;col<w;col+=step){
  const a=p.angle+Math.atan((col/w-.5)*2*Math.tan(fov/2)),dx=Math.cos(a),dy=Math.sin(a);
  let mx=Math.floor(p.x),my=Math.floor(p.y),sx=dx<0?-1:1,sy=dy<0?-1:1,tx=Math.abs(1/dx),ty=Math.abs(1/dy),vx=(dx<0?p.x-mx:mx+1-p.x)*tx,vy=(dy<0?p.y-my:my+1-p.y)*ty,side=0,dist=0;
  for(let n=0;n<40;n++){if(vx<vy){dist=vx;vx+=tx;mx+=sx;side=0;}else{dist=vy;vy+=ty;my+=sy;side=1;}if(g.map[my]?.[mx])break;}
  const corrected=Math.max(.01,dist*Math.cos(a-p.angle));depth[col]=corrected;depth[col+1]=corrected;
  const height=Math.min(h*8,h*.72/corrected),top=half-height*.5,u=((side?p.x+dist*dx:p.y+dist*dy)%1+1)%1,type=g.map[my]?.[mx],shade=Math.max(.55,1-corrected/35)*(side?.83:1);
  if(type===2){ctx.fillStyle=`rgb(${204*shade},${123*shade},${70*shade})`;}else ctx.fillStyle=`rgb(${180*shade},${190*shade},${199*shade})`;
  ctx.fillRect(col,top,step,height);
  if(type===2){
   // Four courses of staggered brickwork, with pale mortar.
   for(let course=0;course<4;course++){
    const y=top+height*course/4;
    ctx.fillStyle=`rgb(${238*shade},${190*shade},${140*shade})`;ctx.fillRect(col,y,step,Math.max(1,height*.016));
    const brick=(u*2+(course%2)*.5)%1;
    if(brick<.045){ctx.fillStyle=`rgb(${233*shade},${179*shade},${127*shade})`;ctx.fillRect(col,y,step,height/4);}
    else{ctx.fillStyle='#fff1b52b';ctx.fillRect(col,y+height*.025,step,Math.max(1,height*.012));}
   }
  }else{
   if(u<.045||u>.955){ctx.fillStyle=`rgb(${129*shade},${143*shade},${158*shade})`;ctx.fillRect(col,top,step,height);}
   ctx.fillStyle='#f6f8ed90';ctx.fillRect(col,top,step,Math.max(2,height*.035));
   ctx.fillStyle='#62768b60';ctx.fillRect(col,top+height*.94,step,height*.06);
   if(u>.1&&u<.9){ctx.fillStyle='#f4f7ed35';ctx.fillRect(col,top+height*.11,step,height*.015);}
  }

 }
 const objects=[...g.bombs.map(b=>({...b,x:b.x+.5,y:b.y+.5,type:'bomb'})),...g.enemies.filter(e=>e.alive).map(e=>({...e,type:'enemy'})),...g.items.map(i=>({...i,x:i.x+.5,y:i.y+.5,type:i.type})),...[...new Map(g.flames.map(f=>[f.x+f.y*SIZE,f])).values()].map(f=>({...f,x:f.x+.5,y:f.y+.5,type:'flame'}))].sort((a,b)=>Math.hypot(b.x-p.x,b.y-p.y)-Math.hypot(a.x-p.x,a.y-p.y));
 for(const o of objects){let a=Math.atan2(o.y-p.y,o.x-p.x)-p.angle;a=Math.atan2(Math.sin(a),Math.cos(a));if(Math.abs(a)>1.1)continue;
  const d=Math.hypot(o.x-p.x,o.y-p.y)*Math.cos(a);if(d<.1)continue;
  const x=w/2+Math.tan(a)*w/(2*Math.tan(fov/2)),size=Math.min(h*2,h*.46/d),y=half+h*.31/d;
  ctx.save();ctx.beginPath();let run=-1;
  const left=Math.max(0,Math.floor(x-size)),right=Math.min(w,Math.ceil(x+size));
  for(let c=left;c<=right;c++){const visible=c<right&&d<(depth[c]||99)+.05;if(visible&&run<0)run=c;if(!visible&&run>=0){ctx.rect(run,0,c-run,h);run=-1;}}ctx.clip();
  if(o.type==='bomb'){
   const pulse=1+.035*Math.sin(g.time*18),r=size*.3*pulse,cy=y-size*.3;
   ctx.fillStyle='#32402735';ctx.beginPath();ctx.ellipse(x,y-size*.02,r*.95,r*.2,0,0,Math.PI*2);ctx.fill();
   const sphere=ctx.createRadialGradient(x-r*.35,cy-r*.4,r*.05,x,cy,r);sphere.addColorStop(0,'#687185');sphere.addColorStop(.4,'#303645');sphere.addColorStop(1,'#121621');ctx.fillStyle=sphere;ctx.strokeStyle='#111827';ctx.lineWidth=Math.max(1,size*.016);ctx.beginPath();ctx.arc(x,cy,r,0,Math.PI*2);ctx.fill();ctx.stroke();
   ctx.strokeStyle='#b88342';ctx.lineWidth=Math.max(2,size*.04);ctx.beginPath();ctx.moveTo(x+r*.3,cy-r*.9);ctx.quadraticCurveTo(x+r*.3,cy-r*1.35,x+r*.7,cy-r*1.35);ctx.stroke();
   ctx.fillStyle='#ffb928';ctx.beginPath();ctx.arc(x+r*.7,cy-r*1.35,size*(.045+.012*Math.sin(g.time*30)),0,Math.PI*2);ctx.fill();
   ctx.fillStyle='white';ctx.font=`bold ${Math.max(9,size*.13)}px sans-serif`;ctx.textAlign='center';ctx.fillText(Math.max(0,o.at-g.time).toFixed(1),x,cy+size*.04);
  }else if(o.type==='enemy'){
   const ellipse=(cx,cy,rx,ry,color)=>{ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(cx,cy,rx,ry,0,0,Math.PI*2);ctx.fill();};
   const body=(rx,ry,rw,rh,r,color)=>{ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(rx,ry,rw,rh,r);ctx.fill();};
   const bounce=Math.sin(g.time*9+o.x)*size*.012;
   ellipse(x,y-size*.025,size*.25,size*.05,'#344c3535');
   ellipse(x-size*.14,y-size*.065,size*.13,size*.07,'#e76496');ellipse(x+size*.14,y-size*.065,size*.13,size*.07,'#e76496');
   body(x-size*.17,y-size*.4+bounce,size*.34,size*.32,size*.07,'#4773cb');
   body(x-size*.17,y-size*.2+bounce,size*.34,size*.07,size*.02,'#404255');body(x-size*.055,y-size*.2+bounce,size*.11,size*.065,size*.01,'#fbd252');
   ellipse(x-size*.24,y-size*.29+bounce,size*.08,size*.1,'#fffdf3');ellipse(x+size*.24,y-size*.29+bounce,size*.08,size*.1,'#fffdf3');
   ellipse(x-size*.26,y-size*.24+bounce,size*.085,size*.075,'#e76496');ellipse(x+size*.26,y-size*.24+bounce,size*.085,size*.075,'#e76496');
   body(x-size*.25,y-size*.76+bounce,size*.5,size*.4,size*.1,'#fafbf4');
   body(x-size*.19,y-size*.66+bounce,size*.38,size*.23,size*.06,'#ffe1b1');
   body(x-size*.1,y-size*.61+bounce,size*.035,size*.12,size*.015,'#242837');body(x+size*.065,y-size*.61+bounce,size*.035,size*.12,size*.015,'#242837');
   ellipse(x,y-size*.79+bounce,size*.075,size*.07,'#ed78a6');
  }else if(o.type==='flame'){
   const glow=ctx.createRadialGradient(x,y-size*.3,0,x,y-size*.3,size*.65);glow.addColorStop(0,'#fff8bbee');glow.addColorStop(.3,'#ffe159cc');glow.addColorStop(1,'#ff702000');ctx.fillStyle=glow;ctx.fillRect(x-size,y-size*1.3,size*2,size*2);
  }else{
   const iy=y-size*.4+Math.sin(g.time*3)*size*.025;
   ctx.fillStyle='#fff8dc';ctx.strokeStyle=o.type==='range'?'#df7941':'#4f7bcb';ctx.lineWidth=Math.max(2,size*.025);ctx.beginPath();ctx.roundRect(x-size*.18,iy,size*.36,size*.34,size*.04);ctx.fill();ctx.stroke();
   ctx.fillStyle=o.type==='range'?'#e77931':'#30384b';ctx.textAlign='center';
   if(o.type==='range'){ctx.font=`bold ${size*.23}px sans-serif`;ctx.fillText('火',x,iy+size*.25);}else{ctx.beginPath();ctx.arc(x,iy+size*.19,size*.085,0,Math.PI*2);ctx.fill();ctx.fillStyle='#a67540';ctx.fillRect(x,iy+size*.06,size*.025,size*.06);}
  }
  ctx.restore();
 }
 if(now-lastMap<100)return;lastMap=now;
 mc.fillStyle='#688e49';mc.fillRect(0,0,156,156);for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){mc.fillStyle=g.map[y][x]===1?'#c1c8d0':g.map[y][x]===2?'#cf8853':(x+y)%2?'#9bcc6f':'#8dc060';mc.fillRect(x*12+1,y*12+1,10,10);}
 for(const [key,at] of danger){const x=key%SIZE,y=Math.floor(key/SIZE);if(g.map[y]?.[x]===0){mc.fillStyle=at-g.time<=1?'#ef7650':'#efbc56';mc.fillRect(x*12+1,y*12+1,10,10);}}
 for(const i of g.items){mc.fillStyle='#fff4b6';mc.fillRect(i.x*12+3,i.y*12+3,6,6);}
 for(const f of g.flames){mc.fillStyle='#ffc23c';mc.fillRect(f.x*12+1,f.y*12+1,10,10);}for(const b of g.bombs){mc.fillStyle='#293040';mc.beginPath();mc.arc(b.x*12+6,b.y*12+6,4,0,7);mc.fill();}for(const e of g.enemies.filter(e=>e.alive)){mc.fillStyle='#e95f93';mc.fillRect(e.x*12-3,e.y*12-3,6,6);}mc.save();mc.translate(p.x*12,p.y*12);mc.rotate(p.angle);mc.fillStyle='#2466cc';mc.strokeStyle='white';mc.lineWidth=1;mc.beginPath();mc.moveTo(5,0);mc.lineTo(-3,-4);mc.lineTo(-3,4);mc.closePath();mc.fill();mc.stroke();mc.restore();

}
function frame(now){const dt=Math.min((now-last)/1000,.04);last=now;
 if(active){const p=g.player;const forward=Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown'))+touchForward,strafe=Number(keys.has('KeyD'))-Number(keys.has('KeyA'))+touchStrafe,turn=(Number(keys.has('ArrowRight'))-Number(keys.has('ArrowLeft')))*dt*2;
  if(online){viewAngle+=turn;p.angle=viewAngle;if(now>=nextInput){send({type:'input',forward,strafe,angle:viewAngle});nextInput=now+50;}}
  else{p.angle+=turn;const norm=Math.hypot(forward,strafe)||1;move(g,p,(Math.cos(p.angle)*forward-Math.sin(p.angle)*strafe)*dt*PLAYER_SPEED/norm,(Math.sin(p.angle)*forward+Math.cos(p.angle)*strafe)*dt*PLAYER_SPEED/norm);update(g,dt);
   if(g.status!=='playing'){active=false;document.exitPointerLock?.();show(g.status==='won'?'やったね！ 全員倒した！':'爆風に巻き込まれた。',`SCORE ${g.score} ・ もう一度挑戦してみよう。`,'もう一度プレイ');panel.hidden=false;}
  }
 }
 if(now-lastHud>=100){
  lastHud=now;refreshDanger();
  const at=danger.get(Math.floor(g.player.x)+Math.floor(g.player.y)*SIZE);
  dangerNotice.hidden=!active||at===undefined||!g.player.alive;
  if(!dangerNotice.hidden){const seconds=Math.max(0,at-g.time);dangerNotice.textContent=`⚠ 爆風の範囲内！ ${seconds.toFixed(1)}秒 — 離れよう`;dangerNotice.classList.toggle('urgent',seconds<=1);}

  const clock=`${String(Math.floor(g.time/60)).padStart(2,'0')}:${String(Math.floor(g.time%60)).padStart(2,'0')}`;
  if(hudCache.get('clock')!==clock){hud.clock.textContent=clock;hudCache.set('clock',clock);}
  for(const [id,val,label] of [['range',g.player.range,'爆風の長さ'],['capacity',g.player.capacity,'設置可能数'],['enemies',g.enemies.filter(e=>e.alive).length,'残りの敵'],['score',g.score,'スコア']]){
   if(hudCache.get(id)===val)continue;hudCache.set(id,val);hud[id].innerHTML=String(val).padStart(id==='score'?4:2,'0')+` <small>${label}</small>`;
  }
  const state=online?(g.status==='finished'?'対戦終了':hasState?(g.player.alive?'通信対戦中！':'脱落・観戦中'):('部屋 '+room.code)):active?'バトル中！':'準備中';
  if(hudCache.get('state')!==state){hud.state.textContent=state;hudCache.set('state',state);}
 }
 const interval=overlay.style.display!=='none'?200:touchDevice||quality==='low'?1000/30:1000/60;
 if(!document.hidden&&now-lastRender>=interval-1){
  lastRender=now;const start=performance.now();render(now);renderCost=renderCost*.9+(performance.now()-start)*.1;
  if(quality==='auto'&&renderCost>18){if(++slowFrames>30&&resolutionFactor>.55){resolutionFactor*=.8;resizeView();slowFrames=0;}}else slowFrames=0;
 }
 requestAnimationFrame(frame);
}
function resizeView(){
 const maxSide=quality==='high'?1100:quality==='low'?480:touchDevice?640:900;
 const scale=Math.min(1,maxSide/Math.max(canvas.clientWidth,canvas.clientHeight))*resolutionFactor;
 canvas.width=Math.max(1,Math.round(canvas.clientWidth*scale));canvas.height=Math.max(1,Math.round(canvas.clientHeight*scale));
 depth=new Float32Array(canvas.width+2);lastMap=0;
}
document.querySelector('#quality').onchange=e=>{quality=e.target.value;resolutionFactor=1;renderCost=0;slowFrames=0;resizeView();};
new ResizeObserver(resizeView).observe(canvas);
usernameInput.disabled=false;button.disabled=false;
document.querySelector('#create-room').disabled=false;
document.querySelector('#join-form button[type="submit"]').disabled=false;
if(!invite)networkMessage.textContent='部屋を作って、招待URLを友達に送ろう。';
document.documentElement.dataset.ready='true';
requestAnimationFrame(frame);
