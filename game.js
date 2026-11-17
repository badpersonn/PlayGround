import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';

(() => {
  const canvas = document.getElementById('game');
  const countdown = document.getElementById('countdown');
  const renderer = new THREE.WebGLRenderer({antialias:true, powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  canvas.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#101116');
  scene.fog = new THREE.Fog('#101116', 18, 38);
  const camera = new THREE.PerspectiveCamera(37, 1, .1, 70);
  camera.position.set(0, 9.5, 17.8);
  camera.lookAt(0, 1.3, 0);
  let arena = null;
  const fighterMeshes = new Map();
  const clock = new THREE.Clock();
  const $ = (id) => document.getElementById(id);
  const ui = { timer: $('timer'), round: $('roundLabel'), overlay: $('centerMessage'), result: $('resultOverlay'), callout: $('callout') };
  const keys = new Set();
  let W = 0, H = 0, last = 0, running = false, phase = 'intro', phaseTime = 0, round = 1, seconds = 180, soundOn = true, audio;
  let redWins = 0, blueWins = 0, particles = [], shake = 0, callTimer = 0, totalTime = 0, clinch = null;
  let totalRounds = 3;
  const fighters = [];
  const createFighter = (name, side) => ({name, side, face: side === 'red' ? 1 : -1, x: side === 'red' ? .29 : .71, depth: side === 'red' ? .57 : .43, head: 100, body: 100, stamina: 100, stun: 0, attack: null, dodge: '', dodgeTime: 0, guard: false, hitFlash: 0, bob: 0, wins: 0, roundDamage: 0, movement: 0, actionLock: 0, fouls: 0, foulPoints: 0});
  fighters.push(createFighter('RED','red'), createFighter('BLUE','blue'));
  const config = {
    red: { left:'a', right:'d', up:'w', down:'s', slipL:'q', slipR:'e', guard:'f', roll:'g', punches:{j:'jab',k:'cross',l:'leadHook',';':'rearHook',h:'uppercut'}, illegal:{y:'lowBlow',t:'rabbitPunch'}, clinch:'c' },
    blue: { left:'arrowleft', right:'arrowright', up:'arrowup', down:'arrowdown', slipL:',', slipR:'.', guard:'i', roll:'o', punches:{'1':'jab','2':'cross','3':'leadHook','4':'rearHook','6':'uppercut'}, illegal:{'7':'lowBlow','8':'rabbitPunch'}, clinch:'5' }
  };
  function resize(){const r=canvas.getBoundingClientRect();W=r.width;H=r.height;if(W&&H){renderer.setSize(W,H,false);camera.aspect=W/H;camera.updateProjectionMatrix()}}
  new ResizeObserver(resize).observe(canvas); resize();
  function keyName(e){if(e.code==='Semicolon')return ';';if(e.code.startsWith('Arrow'))return e.code.toLowerCase();return e.key.toLowerCase()}
  window.addEventListener('keydown',e=>{const k=keyName(e);if(['arrowup','arrowdown','arrowleft','arrowright',' '].includes(k))e.preventDefault();if(!keys.has(k)){keys.add(k);onPress(k,e.shiftKey)} });
  window.addEventListener('keyup',e=>keys.delete(keyName(e)));
  window.addEventListener('blur',()=>keys.clear());
  $('startButton').onclick=()=>{if(phase==='between'){round++;startRound()}else beginMatch()}; $('rematchButton').onclick=()=>beginMatch();
  $('roundCount').addEventListener('change',()=>{if(phase==='intro'){totalRounds=Number($('roundCount').value);updateWins()}});
  $('soundToggle').onclick=()=>{soundOn=!soundOn;$('soundLabel').textContent=soundOn?'SOUND ON':'SOUND OFF';$('soundToggle').style.color=soundOn?'#e4bd70':''};
  function onPress(k,shifted=false){
    if(k==='escape'&&running){running=false;phase='paused';ui.overlay.classList.remove('hidden');ui.overlay.querySelector('.eyebrow').textContent='PAUSED';ui.overlay.querySelector('h1').innerHTML='TAKE A<br><em>BREATHER.</em>';ui.overlay.querySelector('p').textContent='Press ENTER to get back in the fight.';$('startButton').textContent='BACK TO THE FIGHT →';return}
    if(k==='enter'&&phase==='paused'){running=true;phase='fight';ui.overlay.classList.add('hidden');last=performance.now();return}
    if(!running)return;
    for(const f of fighters){const c=config[f.side];if(c.punches[k])strike(f,c.punches[k],shifted?'body':'head');if(c.illegal[k])strike(f,c.illegal[k],c.illegal[k]==='lowBlow'?'body':'head');if(k===c.clinch)startClinch(f)}
  }
  function beginMatch(){totalRounds=Number($('roundCount').value);for(const f of fighters){f.head=100;f.body=100;f.stamina=100;f.stun=0;f.attack=null;f.dodge='';f.wins=0;f.roundDamage=0;f.actionLock=0;f.fouls=0;f.foulPoints=0}clinch=null;round=1;redWins=blueWins=0;updateWins();startRound()}
  function startRound(){seconds=180;clinch=null;for(const f of fighters){f.head=100;f.body=100;f.stamina=100;f.stun=0;f.attack=null;f.dodge='';f.guard=false;f.x=f.side==='red'?.29:.71;f.depth=f.side==='red'?.57:.43;f.roundDamage=0;f.actionLock=0;f.foulPoints=0}ui.result.classList.add('hidden');ui.overlay.classList.add('hidden');updateWins();updateBars();ui.timer.textContent='3:00';running=true;phase='count';phaseTime=3;last=performance.now();}
  function strike(f,type,targetZone){
    const moves={
      jab:{style:'straight',arm:'lead',wind:.12,active:.10,recover:.22,cost:6,damage:7,reach:.13,label:'JAB'},
      cross:{style:'straight',arm:'rear',wind:.19,active:.12,recover:.31,cost:10,damage:11,reach:.145,label:'CROSS'},
      leadHook:{style:'hook',arm:'lead',wind:.20,active:.13,recover:.32,cost:11,damage:12,reach:.11,label:'LEFT HOOK'},
      rearHook:{style:'hook',arm:'rear',wind:.25,active:.14,recover:.39,cost:14,damage:15,reach:.12,label:'RIGHT HOOK'},
      uppercut:{style:'uppercut',arm:'lead',wind:.22,active:.12,recover:.36,cost:12,damage:13,reach:.10,label:'UPPERCUT'},
      lowBlow:{style:'hook',arm:'rear',wind:.28,active:.14,recover:.48,cost:18,damage:18,reach:.16,label:'ILLEGAL LOW BLOW',illegal:true},
      rabbitPunch:{style:'hook',arm:'rear',wind:.30,active:.12,recover:.52,cost:18,damage:17,reach:.15,label:'ILLEGAL RABBIT PUNCH',illegal:true}
    };
    const move=moves[type];if(!move||clinch||f.stun>0||f.actionLock>0||f.attack||phase!=='fight'||f.stamina<move.cost)return;
    const body=targetZone==='body';const damage=move.damage*(body?(type==='jab'?.85:1):1);
    const labels={jab:body?'BODY JAB':'JAB',cross:body?'BODY CROSS':'CROSS',leadHook:body?'LEFT BODY HOOK':'LEFT HOOK',rearHook:body?'RIGHT BODY HOOK':'RIGHT HOOK',uppercut:body?'BODY UPPERCUT':'UPPERCUT',lowBlow:'ILLEGAL LOW BLOW',rabbitPunch:'ILLEGAL RABBIT PUNCH'};
    f.stamina-=move.cost;f.attack={type,elapsed:0,hit:false,...move,target:targetZone,damage,label:labels[type]};f.dodge='';f.guard=false;
  }
  function startClinch(f){if(clinch||phase!=='fight'||f.stun>0||f.attack||f.actionLock>0)return;const other=fighters[f.side==='red'?1:0];if(Math.abs(other.x-f.x)>.19||Math.abs(other.depth-f.depth)>.13){showCall('TOO FAR TO CLINCH');return}const middle=(f.x+other.x)/2;f.x=middle-(f.side==='red'?.045:-.045);other.x=middle-(other.side==='red'?.045:-.045);const depth=(f.depth+other.depth)/2;f.depth=other.depth=depth;clinch={initiator:f.side,time:0,escape:0};for(const boxer of fighters){boxer.attack=null;boxer.guard=false;boxer.dodge='';boxer.actionLock=.25}showCall('CLINCH! MOVE TO BREAK');}
  function soundHit(strong=false){if(!soundOn)return;try{audio=audio||new(window.AudioContext||window.webkitAudioContext)();const osc=audio.createOscillator(),gain=audio.createGain();osc.type='triangle';osc.frequency.setValueAtTime(strong?110:170,audio.currentTime);osc.frequency.exponentialRampToValueAtTime(45,audio.currentTime+.12);gain.gain.setValueAtTime(.12,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.14);osc.connect(gain);gain.connect(audio.destination);osc.start();osc.stop(audio.currentTime+.15)}catch{}}
  function showCall(text){ui.callout.textContent=text;ui.callout.classList.add('show');callTimer=.8}
  function attackUpdate(f,dt){if(!f.attack)return;const a=f.attack;a.elapsed+=dt;if(!a.hit&&a.elapsed>=a.wind&&a.elapsed<=a.wind+a.active){a.hit=true;const target=fighters[f.side==='red'?1:0];const dx=Math.abs(target.x-f.x);const reach=a.reach*(H/390);const depthOk=Math.abs(target.depth-f.depth)<.30;if(dx<reach+.15&&depthOk){resolveHit(f,target,a)}else if(Math.random()<.28)showCall('JUST OUT OF RANGE');}if(a.elapsed>a.wind+a.active+a.recover){f.attack=null;f.actionLock=.08}}
  function resolveHit(attacker,target,a){
    const kind=a.type, avoided=(a.style==='hook'&&target.dodge==='roll')||((a.style==='straight'||a.style==='uppercut')&&target.dodge==='slip');
    if(avoided){target.stamina=Math.max(0,target.stamina-2);showCall(a.style==='hook'?'ROLLED UNDER!':'SLIPPED!');spawnText(target.x*W,H*(.49-target.depth*.03),a.style==='hook'?'ROLL':'SLIP',target.side);attacker.actionLock=.18;return}
    let foulMessage='';
    if(a.illegal){attacker.fouls++;if(attacker.fouls===1)foulMessage='FOUL WARNING';else if(attacker.fouls===2){attacker.foulPoints+=10;foulMessage='FOUL — POINT DEDUCTED'}else{showCall('DISQUALIFIED — THIRD FOUL');endRound(target.side,true,'DISQUALIFICATION');return}}
    let damage=a.damage;let text=a.illegal?foulMessage:a.label+'!';
    if(target.guard){damage*=a.target==='body'?.55:a.style==='uppercut'?.55:.30;target.stamina=Math.max(0,target.stamina-(a.style==='hook'?11:7));if(!a.illegal)text='BLOCKED';if(target.stamina<=0){target.stun=.38;target.guard=false}}
    else{target.stun=a.target==='body'?.20:kind==='jab'?.22:.34;target.hitFlash=.18;target.x+=attacker.face*.018;}
    target[a.target]=Math.max(0,target[a.target]-damage);target.roundDamage+=damage;attacker.stamina=Math.min(100,attacker.stamina+2);shake=Math.max(shake,a.style==='uppercut'?5:a.style==='hook'?4:2);soundHit(kind!=='jab');showCall(text);spawnText(target.x*W,H*(.52-target.depth*.04),Math.round(damage)+'',target.side);updateBars();
    if(target.head<=0||target.body<=0){endRound(attacker.side,true)}
  }
  function spawnText(x,y,text,side){particles.push({x,y,text,side,life:.8})}
  function update(dt){totalTime+=dt;if(callTimer>0){callTimer-=dt;if(callTimer<=0)ui.callout.classList.remove('show')}
    if(phase==='count'){phaseTime-=dt;if(phaseTime<=0){phase='fight';phaseTime=0;showCall('FIGHT!')}return}
    if(phase!=='fight')return;
    seconds-=dt;if(seconds<=0){seconds=0;const score=f=>f.head+f.body-f.foulPoints;endRound(score(fighters[0])===score(fighters[1])?null:score(fighters[0])>score(fighters[1])?'red':'blue',false);return}
    for(const f of fighters){const c=config[f.side],enemy=fighters[f.side==='red'?1:0];f.bob+=dt*7;f.face=enemy.x>=f.x?1:-1;f.stun=Math.max(0,f.stun-dt);f.hitFlash=Math.max(0,f.hitFlash-dt);f.actionLock=Math.max(0,f.actionLock-dt);f.dodgeTime=Math.max(0,f.dodgeTime-dt);if(f.dodgeTime<=0)f.dodge='';
      f.guard=!clinch&&keys.has(c.guard)&&f.stun<=0&&!f.attack;if(f.guard)f.stamina=Math.max(0,f.stamina-dt*9);else f.stamina=Math.min(100,f.stamina+dt*(f.attack?3:12));if(f.stamina<=0)f.guard=false;
      if(!clinch&&f.dodgeTime<=0&&f.actionLock<=0&&f.stun<=0&&!f.attack){if(keys.has(c.slipL)){f.dodge='slip';f.dodgeTime=.18;f.actionLock=.18;f.x-=f.face*.018;f.stamina=Math.max(0,f.stamina-5)}else if(keys.has(c.slipR)){f.dodge='slip';f.dodgeTime=.18;f.actionLock=.18;f.x+=f.face*.018;f.stamina=Math.max(0,f.stamina-5)}else if(keys.has(c.roll)){f.dodge='roll';f.dodgeTime=.39;f.actionLock=.39;f.stamina=Math.max(0,f.stamina-12)}}
      f.movement=0;if(!clinch&&f.stun<=0&&!f.attack&&!f.dodge){const dx=(keys.has(c.right)?1:0)-(keys.has(c.left)?1:0),dy=(keys.has(c.down)?1:0)-(keys.has(c.up)?1:0),length=Math.hypot(dx,dy)||1;if(dx||dy){f.x+=dx/length*dt*.25;f.depth+=dy/length*dt*.19;f.movement=dx||dy}}
      const minX=.12-Math.max(0,f.depth-.38)*.25,maxX=1-minX;f.x=Math.max(minX,Math.min(maxX,f.x));f.depth=Math.max(.38,Math.min(.68,f.depth));attackUpdate(f,dt);
    }
    if(clinch){clinch.time+=dt;let effort=0;for(const f of fighters){const c=config[f.side];if(keys.has(c.left)||keys.has(c.right)||keys.has(c.up)||keys.has(c.down))effort+=1}clinch.escape+=effort*dt;if(clinch.escape>.65||clinch.time>1.8){clinch=null;for(const f of fighters)f.actionLock=Math.max(f.actionLock,.25);showCall('BREAK!');}}
    else{const [red,blue]=fighters,dx=blue.x-red.x;if(dx<.16&&Math.abs(blue.depth-red.depth)<.11){const push=(.16-dx)*.5;red.x-=push;blue.x+=push}}
    particles=particles.filter(p=>{p.life-=dt;p.y-=dt*22;return p.life>0});shake=Math.max(0,shake-dt*22);updateBars();
  }
  function endRound(winner,ko,cause=''){if(phase!=='fight')return;running=false;phase='between';if(winner==='red')redWins++;if(winner==='blue')blueWins++;updateWins();const label=winner?`${winner==='red'?'RED':'BLUE'} CORNER TAKES ROUND ${round}`:'ROUND '+round+' IS A DRAW';showCall(cause|| (ko?'KNOCKDOWN!':'BELL!'));
    const clinched=redWins>totalRounds/2||blueWins>totalRounds/2;
    if(cause==='DISQUALIFICATION'||clinched||round>=totalRounds){phase='result';ui.result.classList.remove('hidden');$('resultTitle').textContent=cause==='DISQUALIFICATION'?`${winner.toUpperCase()} WINS BY DISQUALIFICATION`:redWins===blueWins?'DRAW — WHAT A FIGHT':redWins>blueWins?'RED CORNER WINS':'BLUE CORNER WINS';$('resultCopy').textContent=cause==='DISQUALIFICATION'?'The opponent is disqualified after three illegal shots.':ko?'A decisive finish under the lights.':`${redWins}–${blueWins} on the judges’ cards.`;return}
    ui.overlay.classList.remove('hidden');ui.overlay.querySelector('.eyebrow').textContent='BETWEEN ROUNDS';ui.overlay.querySelector('h1').innerHTML=label.replace(' TAKES ROUND '+round,'<br><em>TAKES IT.</em>').replace(' IS A DRAW','<br><em>EVEN.</em>');ui.overlay.querySelector('p').textContent='Catch your breath. The next round is waiting.';$('startButton').textContent='START ROUND '+(round+1)+' →';
  }
  function updateWins(){$('redWins').textContent=String(redWins).padStart(2,'0');$('blueWins').textContent=String(blueWins).padStart(2,'0');ui.round.textContent=`ROUND ${round} OF ${totalRounds}`;const holder=document.querySelector('.clock-pips');holder.replaceChildren(...Array.from({length:totalRounds},(_,i)=>{const pip=document.createElement('i');pip.classList.toggle('active',i<round);return pip}))}
  function updateBars(){for(const f of fighters){const pre=f.side;$(pre+'Head').style.width=f.head+'%';$(pre+'Body').style.width=f.body+'%';$(pre+'Stamina').style.width=f.stamina+'%';$(pre+'HeadText').textContent=Math.ceil(f.head);$(pre+'BodyText').textContent=Math.ceil(f.body);$(pre+'StaminaText').textContent=Math.ceil(f.stamina);const condition=clinch?'CLINCHED':f.stun?'ROCKED':f.dodge==='roll'?'ROLLING':f.dodge==='slip'?'SLIPPING':f.guard?'COVERED':f.stamina<20?'GASSED':'READY';$(pre+'Condition').textContent=condition}}

  const mat=(color,roughness=.72,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
  const mats={floor:mat('#14151b'),ring:mat('#a8a79d'),ringEdge:mat('#514b48'),white:mat('#e5dfd1'),red:mat('#cf3f3c'),blue:mat('#3284bd'),gold:mat('#c7a466'),skinRed:mat('#ad725d'),skinBlue:mat('#c18b6d'),dark:mat('#24252b'),hair:mat('#242126'),gloveRed:mat('#ed4642',.36),gloveBlue:mat('#42a8e8',.36)};
  const standardLight=new THREE.HemisphereLight('#d9e3ff','#30282a',2.1);scene.add(standardLight);
  const keyLight=new THREE.DirectionalLight('#fff0d4',3.3);keyLight.position.set(-5,12,8);keyLight.castShadow=true;keyLight.shadow.mapSize.set(1024,1024);scene.add(keyLight);
  const rimLight=new THREE.DirectionalLight('#8bbaff',2.2);rimLight.position.set(6,7,-8);scene.add(rimLight);
  function box(parent,name,material,x,y,z,sx,sy,sz){const m=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),material);m.name=name;m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m}
  function ball(parent,material,x,y,z,sx,sy,sz){const m=new THREE.Mesh(new THREE.SphereGeometry(1,16,12),material);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;parent.add(m);return m}
  function cylinderBetween(mesh,a,b,radius){const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),d=new THREE.Vector3().subVectors(B,A);mesh.position.copy(A).add(B).multiplyScalar(.5);mesh.scale.set(radius,d.length()*.58,radius);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize())}
  function buildArena(){
    const floor=box(scene,'arena floor',mats.floor,0,-.38,0,200,.5,200);floor.receiveShadow=true;
    box(scene,'ring apron',mats.dark,0,.03,0,10.6,.38,8.6);
    box(scene,'canvas',mats.ring,0,.24,0,9.6,.12,7.6);
    for(let i=0;i<8;i++){const x=-4.15+i*1.18;box(scene,'canvas seam',mat('#77776f'),x,.305,0,.012,.008,7.5)}
    for(const z of [-3.35,3.35])for(const x of [-4.65,4.65]){const post=box(scene,'corner post',mats.dark,x,1.35,z,.20,2.7,.20);post.material=mat(x<0?'#b93a37':x>0?'#2976a9':'#b59a68')}
    for(let i=0;i<4;i++){const y=.82+i*.48;const geometry=new THREE.CatmullRomCurve3([new THREE.Vector3(-4.62,y,-3.38),new THREE.Vector3(0,y,-3.38),new THREE.Vector3(4.62,y,-3.38)]);const geometry2=new THREE.CatmullRomCurve3([new THREE.Vector3(-4.62,y,3.38),new THREE.Vector3(0,y,3.38),new THREE.Vector3(4.62,y,3.38)]);const ropeMat=mat(i===1?'#bd4540':'#dedbd0',.38);scene.add(new THREE.Mesh(new THREE.TubeGeometry(geometry,30,.045,8,false),ropeMat));scene.add(new THREE.Mesh(new THREE.TubeGeometry(geometry2,30,.045,8,false),ropeMat));for(const x of [-4.62,4.62]){const sideCurve=new THREE.LineCurve3(new THREE.Vector3(x,y,-3.38),new THREE.Vector3(x,y,3.38));scene.add(new THREE.Mesh(new THREE.TubeGeometry(sideCurve,8,.045,8,false),ropeMat))}}
    for(const [x,z,color] of [[-4.25,-3.05,'#c83c39'],[4.25,3.05,'#347fb2'],[-4.25,3.05,'#ddd7c8'],[4.25,-3.05,'#ddd7c8']]){const pad=box(scene,'corner cushion',mat(color),x,1.43,z,.48,.66,.35);pad.castShadow=true}
    for(let row=0;row<5;row++){for(let i=0;i<56;i++){const theta=(i/56)*Math.PI*2;const radius=7.6+row*.68;const hue=(i*17+row*23)%3;const material=mat(hue===0?'#574b50':hue===1?'#364957':'#615947');const spectator=ball(scene,material,Math.cos(theta)*radius,1.4+row*.07,Math.sin(theta)*radius,.17,.27,.15);spectator.castShadow=false}}
    for(const x of [-7,7]){const lamp=new THREE.PointLight('#ffe3af',85,20,2);lamp.position.set(x,9,2);scene.add(lamp);const housing=ball(scene,mat('#fff0d5',.25),x,8.8,2,.42,.12,.22)}
  }
  function buildFighter(f){
    const root=new THREE.Group();scene.add(root);const body=new THREE.Group();root.add(body);const skin=f.side==='red'?mats.skinRed:mats.skinBlue;const shorts=f.side==='red'?mats.red:mats.blue;const glove=f.side==='red'?mats.gloveRed:mats.gloveBlue;
    ball(body,skin,0,1.58,0,.43,.63,.30);ball(body,mats.white,0,.88,0,.36,.33,.31);box(body,'waistband',shorts,0,1.08,0,.79,.12,.60);
    ball(body,skin,0,2.32,0,.14,.23,.15);ball(body,skin,0,2.68,.02,.29,.34,.27);ball(body,mats.hair,0,2.89,-.015,.30,.15,.28);
    const eyes=mat('#211d1c');ball(body,eyes,-.115,2.72,.255,.035,.035,.025);ball(body,eyes,.115,2.72,.255,.035,.035,.025);
    const limbs={};for(const side of ['left','right']){const leg=new THREE.Mesh(new THREE.CylinderGeometry(.13,.16,1,12),skin);leg.castShadow=true;body.add(leg);limbs[side+'Leg']=leg;const shoe=ball(body,mats.white,0,.18,0,.22,.13,.36);limbs[side+'Shoe']=shoe;
      const arm=new THREE.Mesh(new THREE.CylinderGeometry(.12,.16,1,12),skin);arm.castShadow=true;body.add(arm);limbs[side+'Arm']=arm;const fist=ball(body,glove,0,0,0,.22,.20,.25);limbs[side+'Fist']=fist;ball(body,mats.white,0,1.02,.08,.23,.045,.025)}
    const shadow=new THREE.Mesh(new THREE.CircleGeometry(.65,24),new THREE.MeshBasicMaterial({color:'#050509',transparent:true,opacity:.35}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.32;root.add(shadow);
    fighterMeshes.set(f,{root,body,limbs,shadow});
  }
  function buildScene(){buildArena();for(const f of fighters)buildFighter(f);resize()}
  buildScene();
  function animateFighter(f){const model=fighterMeshes.get(f);if(!model)return;const {root,body,limbs}=model;const bob=Math.sin(f.bob)*.035,crouch=f.dodge==='roll'?.35:0;root.position.set((f.x-.5)*9,.32,(.53-f.depth)*10);root.rotation.y=f.face===1?Math.PI/2:-Math.PI/2;body.position.y=bob-crouch;body.rotation.z=f.dodge==='slip'?.16:f.stun?-.1:0;
    const a=f.attack,t=a?.elapsed||0,progress=a?Math.min(1,t/a.wind):0,active=a&&t>=a.wind&&t<a.wind+a.active;const punch=a?Math.sin(Math.min(1,t/(a.wind+a.active+a.recover))*Math.PI):0;
    for(const side of ['left','right']){const lead=side==='left';const shoulder=[lead?-.25:.25,2.08,.02];const hipX=lead?-.20:.20;const knee=[hipX,.48,lead?.12:-.12];const ankle=[hipX,.15,lead?.20:-.18];cylinderBetween(limbs[side+'Leg'],[hipX,.9,0],knee,.16);limbs[side+'Shoe'].position.set(ankle[0],ankle[1],ankle[2]+.16);
      let hand=[lead?-.36:.36,1.92,.47],elbow=[lead?-.42:.42,1.78,.24];if(f.guard)hand=[lead?-.31:.31,2.22,.42];
      if(a&&((a.arm==='lead')===lead)){const extension=a.style==='straight'?1.0:a.style==='hook'?.68:.55;const targetY=a.target==='body'?1.35:2.48;hand=[lead?-.30:.30,1.92+(targetY-1.92)*Math.max(progress,active?1:punch),.48+extension*(active?1:punch)];elbow=[lead?-.40:.40,1.86,.28+extension*.35*(active?1:punch)];if(a.type==='lowBlow')hand[1]=.98;if(a.type==='rabbitPunch')hand[1]=2.48;}
      cylinderBetween(limbs[side+'Arm'],shoulder,elbow,.14);limbs[side+'Fist'].position.set(...hand)
    }
  }
  function draw(){for(const f of fighters)animateFighter(f);camera.position.x=Math.sin(totalTime*.08)*.16;camera.lookAt(0,1.2,0);renderer.render(scene,camera);countdown.textContent=phase==='count'?String(Math.max(1,Math.ceil(phaseTime))):''}
  function frame(now){const dt=Math.min(.04,(now-last)/1000||0);last=now;if(running)update(dt);draw();if(phase==='fight'||phase==='count')ui.timer.textContent=`${Math.floor(seconds/60)}:${String(Math.ceil(seconds%60)).padStart(2,'0')}`;requestAnimationFrame(frame)}
  requestAnimationFrame(frame);
})();
