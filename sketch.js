/* ============================================================
   ÚLTIMA BURBUJA — prototipo jugable
   TP3 · Info Aplicada 1 · p5.js
   Estados: START -> INSTRUCTIONS -> PLAY -> END (win/lose)
   Dentro de PLAY: el mundo se arma en "salas". Tocar cualquier
   borde de la pantalla te lleva a la siguiente sala, cada vez
   más oscura y más difícil, hasta llegar a la sala final con
   el arrecife.
   ============================================================ */

const W = 800, H = 500;
let state = "start";

// ---- zonas (temas visuales/de dificultad) que agrupan varias salas ----
const ZONES = [
  { name: "Arrecife Cercano",   pol: 0.05, jellyMax: 3, trashMax: 3, bigFishMax: 1, spawnStep: 260, depletion: 0.06,  bubbleGain: 13, goldenChance: 0.18 },
  { name: "Corriente Profunda", pol: 0.42, jellyMax: 5, trashMax: 5, bigFishMax: 2, spawnStep: 220, depletion: 0.09,  bubbleGain: 11, goldenChance: 0.15 },
  { name: "Marea Contaminada",  pol: 0.78, jellyMax: 7, trashMax: 6, bigFishMax: 3, spawnStep: 180, depletion: 0.12,  bubbleGain: 9,  goldenChance: 0.12 }
];
const TOTAL_ROOMS = 6; // 2 salas por zona; la última siempre tiene el arrecife
let currentRoom = 0;
let zoneIdx = 0;
let levelElapsed = 0;
let difficultyLevel = 0;
let roomBannerTimer = 0;
let transitionFlash = 0;
const EDGE_MARGIN = 23;

// paletas: limpio -> contaminado
const paletteClean = { bg1:[9,77,99], bg2:[4,34,48], fish:[255,133,82], fishFin:[255,178,140] };
const paletteDirty = { bg1:[27,28,20], bg2:[9,9,7], fish:[176,118,88], fishFin:[140,100,80] };

let fish, reef = null;
let bubbles = [], jellies = [], trashes = [], bigFishes = [], motes = [], bgFish = [];
let oxygen = 100;
let score = 0;
let bubblesCollected = 0;
let elapsed = 0;
let hitCooldown = 0;
let flash = 0;
let endResult = "";
let audioReady = false;

// ---- sonido sintetizado (sin archivos externos) ----
const SFX = {};
function initAudio(){
  if (audioReady) return;
  userStartAudio();
  SFX.collect = new p5.Oscillator('sine');
  SFX.collectEnv = new p5.Envelope(0.005, 0.5, 0.08, 0);
  SFX.collect.amp(0); SFX.collect.start();
  SFX.hit = new p5.Oscillator('square');
  SFX.hitEnv = new p5.Envelope(0.002, 0.35, 0.12, 0);
  SFX.hit.amp(0); SFX.hit.start();
  SFX.sting = new p5.Oscillator('triangle');
  SFX.stingEnv = new p5.Envelope(0.01, 0.3, 0.35, 0);
  SFX.sting.amp(0); SFX.sting.start();
  audioReady = true;
}
function playCollect(){
  if (!audioReady) return;
  SFX.collect.freq(760 + random(-20,20));
  SFX.collectEnv.play(SFX.collect);
  setTimeout(()=>{ SFX.collect.freq(1080); SFX.collectEnv.play(SFX.collect); }, 60);
}
function playHit(){
  if (!audioReady) return;
  SFX.hit.freq(140);
  SFX.hitEnv.play(SFX.hit);
}
function playWin(){
  if (!audioReady) return;
  [523,659,784,1046].forEach((f,i)=> setTimeout(()=>{ SFX.sting.freq(f); SFX.stingEnv.play(SFX.sting); }, i*130));
}
function playLose(){
  if (!audioReady) return;
  [392,330,262].forEach((f,i)=> setTimeout(()=>{ SFX.sting.freq(f); SFX.stingEnv.play(SFX.sting); }, i*180));
}
function playRoomChange(){
  if (!audioReady) return;
  [740,990].forEach((f,i)=> setTimeout(()=>{ SFX.sting.freq(f); SFX.stingEnv.play(SFX.sting); }, i*90));
}

// ---- puntajes guardados ----
const SCORES_KEY = "ultimaBurbujaScores";
function loadScores(){
  try { return JSON.parse(localStorage.getItem(SCORES_KEY)) || []; }
  catch(e){ return []; }
}
function saveScore(s){
  let scores = loadScores();
  scores.push(s);
  scores.sort((a,b)=>b-a);
  scores = scores.slice(0,5);
  try { localStorage.setItem(SCORES_KEY, JSON.stringify(scores)); } catch(e){}
  return scores;
}

// ---- partículas ----
let particles = [];
function burst(x,y,col,n=10){
  for (let i=0;i<n;i++){
    let a = random(TWO_PI);
    let sp = random(1,3.4);
    particles.push({ x,y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp, life:1, col });
  }
}
function updateParticles(){
  for (let i=particles.length-1;i>=0;i--){
    let p = particles[i];
    p.x += p.vx; p.y += p.vy; p.vy += 0.03; p.life -= 0.035;
    if (p.life<=0){ particles.splice(i,1); continue; }
    noStroke();
    fill(p.col[0],p.col[1],p.col[2], p.life*220);
    ellipse(p.x,p.y, 5*p.life, 5*p.life);
  }
}

let shake = 0;

// texto con letras separadas (tracking), para labels cortos tipo HUD
function trackedText(str, x, y, size, spacing, align){
  align = align || 'center';
  textSize(size);
  let widths = [...str].map(ch => textWidth(ch));
  let total = widths.reduce((a,b)=>a+b,0) + spacing*(str.length-1);
  let startX = align==='left' ? x : (align==='right' ? x-total : x-total/2);
  textAlign(LEFT,CENTER);
  let cx = startX;
  for (let i=0;i<str.length;i++){
    text(str[i], cx, y);
    cx += widths[i] + spacing;
  }
}

function setup(){
  const c = createCanvas(W, H);
  c.parent("holder");
  textFont('Inter');
  for (let i=0;i<40;i++) motes.push(makeMote());
  for (let i=0;i<3;i++) bgFish.push(makeBgFish());
  makeKelp();
  resetGame();
}

function makeMote(){
  return { x: random(W), y: random(H), r: random(1,2.6), s: random(0.15,0.5), drift: random(-0.15,0.15) };
}
function makeBgFish(){
  return { x: random(W), y: random(60,H-60), s: random(0.4,0.8), speed: random(0.25,0.5), t: random(TWO_PI) };
}

function resetGame(){
  fish = new Fish(90, H/2);
  oxygen = 100;
  score = 0;
  bubblesCollected = 0;
  elapsed = 0;
  hitCooldown = 0;
  flash = 0;
  endResult = "";
  particles = [];
  shake = 0;
  startRoom(0, null);
}

function startRoom(i, fromEdge){
  currentRoom = i;
  zoneIdx = Math.min(ZONES.length-1, Math.floor(i/2));
  levelElapsed = 0;
  difficultyLevel = 0;
  roomBannerTimer = 110;
  fish.vx = 0; fish.vy = 0;

  if (fromEdge === 'left')      { fish.x = W-EDGE_MARGIN-2; }
  else if (fromEdge === 'right'){ fish.x = EDGE_MARGIN+2; }
  else if (fromEdge === 'top')  { fish.y = H-EDGE_MARGIN-2; }
  else if (fromEdge === 'bottom'){ fish.y = EDGE_MARGIN+2; }
  else { fish.x = 90; fish.y = H/2; }

  const Z = ZONES[zoneIdx];
  bubbles = []; jellies = []; trashes = []; bigFishes = [];
  for (let k=0;k<5;k++) spawnBubble();
  let jc = Math.min(Z.jellyMax, 1+i);
  let tc = Math.min(Z.trashMax, 1+i);
  let bc = Math.min(Z.bigFishMax, 1+Math.floor(i/2));
  for (let k=0;k<jc;k++) spawnJelly();
  for (let k=0;k<tc;k++) spawnTrash();
  for (let k=0;k<bc;k++) bigFishes.push(new BigFish());

  if (i === TOTAL_ROOMS-1){
    reef = { x: W/2, y: H/2, r: 58, t: 0 };
  } else {
    reef = null;
  }
}

function triggerRoomTransition(edge){
  transitionFlash = 1;
  playRoomChange();
  oxygen = Math.min(100, oxygen+7);
  startRoom(currentRoom+1, edge);
}

function spawnBubble(){
  let golden = random() < ZONES[zoneIdx].goldenChance;
  bubbles.push({ x: random(60,W-60), y: random(40,H-40), r: golden?11:9, bob: random(TWO_PI), golden, squish: random(TWO_PI) });
}
function spawnJelly(){
  jellies.push({ x: random(60,W-60), baseY: random(60,H-60), y:0, t: random(TWO_PI), speed: random(0.02,0.04), r: 16 });
}
function spawnTrash(){
  trashes.push({ x: random(60,W-60), y: random(40,H-40), r: 14, vx: random(-0.9,0.9)||0.5, vy: random(-0.3,0.3), rot: random(TWO_PI), spin: random(-0.02,0.02) });
}

// ---- kelp decorativo de fondo ----
let kelp = [];
function makeKelp(){
  kelp = [];
  for (let i=0;i<9;i++){
    kelp.push({ x: random(20,W-20), h: random(50,130), w: random(10,18), t: random(TWO_PI), speed: random(0.01,0.02) });
  }
}
function drawKelp(pol){
  push();
  noStroke();
  for (const k of kelp){
    k.t += k.speed;
    let sway = Math.sin(k.t)*14;
    let col = [ lerp(20,30,pol), lerp(90,60,pol), lerp(70,40,pol) ];
    fill(col[0],col[1],col[2], 150);
    beginShape();
    vertex(k.x - k.w/2, H);
    quadraticVertex(k.x + sway*0.5, H-k.h*0.5, k.x + sway, H-k.h);
    quadraticVertex(k.x + sway*0.5, H-k.h*0.5, k.x + k.w/2, H);
    endShape(CLOSE);
  }
  pop();
}

// ---- pececitos de fondo, puramente decorativos ----
function drawBgFish(pol){
  push();
  noStroke();
  for (const b of bgFish){
    b.x -= b.speed;
    b.t += 0.05;
    if (b.x < -30) b.x = W+30;
    let by = b.y + Math.sin(b.t)*6;
    let c = lerp(60,30,pol);
    fill(c, c+20, c+25, 70);
    push();
    translate(b.x,by);
    scale(b.s);
    beginShape();
    vertex(-18,0); quadraticVertex(-6,-9,10,0); quadraticVertex(-6,9,-18,0);
    endShape(CLOSE);
    triangle(-18,0, -28,-6,-28,6);
    pop();
  }
  pop();
}

class BigFish{
  constructor(){
    this.y = random(80,H-80);
    this.baseY = this.y;
    this.x = W+60;
    this.speed = random(2.4+zoneIdx*0.4, 3.8+zoneIdx*0.6);
    this.t = random(TWO_PI);
  }
  update(){
    this.x -= this.speed;
    this.t += 0.05;
    this.y = this.baseY + Math.sin(this.t)*20;
    if (this.x < -80){ this.x = W+80; this.baseY = random(80,H-80); this.speed = random(2.4+zoneIdx*0.4, 3.8+difficultyLevel*0.25+zoneIdx*0.6); }
  }
  draw(){
    push();
    translate(this.x,this.y);
    let swish = Math.sin(this.t*2.4)*12;
    noStroke();
    // sombra/aura sutil
    fill(40,15,15,60);
    ellipse(0,2,74,34);
    // cuerpo (silueta orgánica con bezier)
    fill(96,42,40);
    beginShape();
    vertex(34,0);
    bezierVertex(30,-16, -6,-17, -34,-9+swish*0.15);
    bezierVertex(-42,-3, -42,3, -34,9+swish*0.15);
    bezierVertex(-6,17, 30,16, 34,0);
    endShape(CLOSE);
    // cola
    fill(76,30,28);
    beginShape();
    vertex(-32,0);
    vertex(-52,-16+swish);
    vertex(-44,0);
    vertex(-52,16+swish);
    endShape(CLOSE);
    // aleta dorsal
    fill(110,50,46);
    triangle(2,-16, -10,-30, 14,-15);
    // agallas
    stroke(60,22,20); strokeWeight(2); noFill();
    line(20,-8,17,8);
    noStroke();
    // ojo
    fill(255); ellipse(22,-3,9,9);
    fill(10); ellipse(24,-3,4.5,4.5);
    pop();
  }
}

class Fish{
  constructor(x,y){ this.x=x; this.y=y; this.vx=0; this.vy=0; this.ang=0; this.tail=0; this.blink=0; }
  update(pol){
    let ax=0, ay=0;
    if (keyIsDown(87)) ay -= 1;
    if (keyIsDown(83)) ay += 1;
    if (keyIsDown(65)) ax -= 1;
    if (keyIsDown(68)) ax += 1;
    let mag = Math.hypot(ax,ay);
    if (mag>0){ ax/=mag; ay/=mag; }
    let current = Math.sin((elapsed+this.x*0.5)*0.01) * (0.35 + pol*0.4);
    this.vx = lerp(this.vx, ax*3.6, 0.2);
    this.vy = lerp(this.vy, ay*3.6 + current, 0.2);
    this.x += this.vx;
    this.y += this.vy;
    if (mag>0) this.ang = atan2(this.vy, this.vx);
    this.tail += 0.25 + mag*0.18;
    if (random()<0.004) this.blink = 6;
    if (this.blink>0) this.blink--;
  }
  clampInside(){
    this.x = constrain(this.x, 20, W-20);
    this.y = constrain(this.y, 20, H-20);
  }
  draw(pal){
    push();
    translate(this.x,this.y);
    rotate(this.ang);
    let wag = Math.sin(this.tail)*11;
    noStroke();
    // aura suave
    fill(pal.fish[0],pal.fish[1],pal.fish[2], 40);
    ellipse(0,0,46,26);
    // cola (bezier, más orgánica que un triángulo)
    fill(pal.fishFin[0],pal.fishFin[1],pal.fishFin[2]);
    beginShape();
    vertex(-13,0);
    bezierVertex(-20,-4, -24,-12+wag*0.3, -30,-10+wag);
    bezierVertex(-22,-2, -22,2, -30,10+wag);
    bezierVertex(-24,12-wag*0.3, -20,4, -13,0);
    endShape(CLOSE);
    // cuerpo
    fill(pal.fish[0],pal.fish[1],pal.fish[2]);
    beginShape();
    vertex(17,0);
    bezierVertex(15,-11, -6,-11, -14,-4);
    bezierVertex(-17,-1, -17,1, -14,4);
    bezierVertex(-6,11, 15,11, 17,0);
    endShape(CLOSE);
    // aleta dorsal
    fill(pal.fishFin[0],pal.fishFin[1],pal.fishFin[2]);
    triangle(1,-8, -5,-16, 7,-9);
    // aleta pectoral, animada
    let finFlap = Math.sin(this.tail*1.4)*4;
    fill(pal.fishFin[0],pal.fishFin[1],pal.fishFin[2], 220);
    triangle(4,3, 0,12+finFlap, 10,7);
    // ojo (con parpadeo)
    fill(255);
    ellipse(9,-3, 6, this.blink>0?1.5:6);
    if (this.blink===0){ fill(15); ellipse(10,-3,2.6,2.6); }
    pop();
  }
}

function draw(){
  if (state==="start") drawStart();
  else if (state==="instructions") drawInstructions();
  else if (state==="play") drawPlay();
  else if (state==="end") drawEnd();
}

function pollution(){
  let base = ZONES[zoneIdx].pol;
  let oxPol = constrain(1 - oxygen/100, 0, 1);
  return constrain(base + oxPol*(1-base), 0, 1);
}

function drawOceanBackground(pol){
  let top = [ lerp(paletteClean.bg1[0],paletteDirty.bg1[0],pol), lerp(paletteClean.bg1[1],paletteDirty.bg1[1],pol), lerp(paletteClean.bg1[2],paletteDirty.bg1[2],pol) ];
  let bot = [ lerp(paletteClean.bg2[0],paletteDirty.bg2[0],pol), lerp(paletteClean.bg2[1],paletteDirty.bg2[1],pol), lerp(paletteClean.bg2[2],paletteDirty.bg2[2],pol) ];
  noFill();
  for (let y=0;y<H;y+=2){
    let t = y/H;
    stroke(lerp(top[0],bot[0],t), lerp(top[1],bot[1],t), lerp(top[2],bot[2],t));
    strokeWeight(2);
    line(0,y,W,y);
  }
  push();
  blendMode(ADD);
  noStroke();
  for (let i=0;i<4;i++){
    let x = (i*220 + (elapsed*0.15)%220) % (W+200) - 100;
    fill(255,255,240, (14*(1-pol)));
    quad(x,-20, x+70,-20, x-30+160,H, x-100+160,H);
  }
  pop();
  noStroke();
  for (const m of motes){
    m.y -= m.s;
    m.x += m.drift;
    if (m.y < -5) m.y = H+5;
    if (m.x < -5) m.x = W+5;
    if (m.x > W+5) m.x = -5;
    fill(lerp(210,140,pol), lerp(235,140,pol), lerp(240,120,pol), 90);
    ellipse(m.x, m.y, m.r*2, m.r*2);
  }
}

function drawVignette(pol){
  push();
  noStroke();
  for (let i=0;i<40;i++){
    let a = map(i,0,40,0,90+pol*60);
    fill(0,0,0, a*0.03);
    rect(-i*2,-i*2, W+i*4, H+i*4);
  }
  pop();
}

function drawStart(){
  drawOceanBackground(0);
  drawKelp(0);
  drawBgFish(0);
  let bobble = Math.sin(frameCount*0.03)*6;
  noStroke();
  textAlign(CENTER,CENTER);
  fill(255,255,255,235);
  textFont('Fraunces');
  textStyle(BOLD);
  textSize(50);
  text("Última Burbuja", W/2, H/2 - 55 + bobble);
  textStyle(NORMAL);
  textFont('Inter');
  textSize(15);
  fill(200,222,222,220);
  text("Un pez, un océano que se apaga, un camino de vuelta a casa.", W/2, H/2 - 12 + bobble);
  textSize(13.5);
  let pulse = 150 + Math.sin(frameCount*0.08)*80;
  fill(255,197,140, pulse);
  text("Presioná  ESPACIO  para continuar", W/2, H/2 + 44);
  noStroke();
  fill(180,205,205,150);
  textSize(11.5);
  text("Un juego de Camilo Vargas · TP3 Info Aplicada 1", W/2, H-26);
  drawVignette(0);
}

function drawInstructions(){
  drawOceanBackground(0.12);
  drawKelp(0.12);
  noStroke();
  textAlign(CENTER,TOP);
  fill(255,255,255,235);
  textFont('Fraunces');
  textStyle(BOLD);
  textSize(30);
  text("Instrucciones", W/2, 46);
  textStyle(NORMAL);
  textFont('Inter');
  textAlign(LEFT,TOP);
  textSize(14.5);
  const lines = [
    "Movete con W A S D.",
    "Una corriente te empuja: vas a tener que corregir el rumbo.",
    "Recolectá burbujas: dan oxígeno y puntos (más si son doradas).",
    "Evitá medusas, basura y peces grandes: te quitan oxígeno al contacto.",
    "Tocar cualquier borde te cruza a una sala nueva, más oscura y difícil.",
    "En la sala final aparece el arrecife: llegá con oxígeno para ganar."
  ];
  let y = 100;
  const leftX = 86, rightX = W-86;
  for (const l of lines){
    fill(255,197,140);
    textStyle(BOLD);
    text("—", leftX, y);
    textStyle(NORMAL);
    fill(220,235,235,235);
    text(l, leftX+22, y, W-220);
    y += 30;
    stroke(255,255,255,35);
    strokeWeight(1);
    line(leftX, y-8, rightX, y-8);
    noStroke();
    y += 8;
  }
  textAlign(CENTER,CENTER);
  fill(255,197,140);
  textSize(13.5);
  text("Presioná  ESPACIO  para empezar a nadar", W/2, H-32);
  drawVignette(0.12);
}

function drawPlay(){
  elapsed++;
  let pol = pollution();

  push();
  let sx = shake>0 ? random(-shake,shake) : 0;
  let sy = shake>0 ? random(-shake,shake) : 0;
  translate(sx, sy);
  if (shake>0){ shake *= 0.85; if (shake<0.3) shake = 0; }

  drawOceanBackground(pol);
  drawBgFish(pol);
  drawKelp(pol);

  const Z = ZONES[zoneIdx];
  levelElapsed++;
  let target = Math.floor(levelElapsed / Z.spawnStep);
  if (target > difficultyLevel){
    difficultyLevel = target;
    if (jellies.length < Z.jellyMax) spawnJelly();
    if (trashes.length < Z.trashMax) spawnTrash();
    if (bigFishes.length < Z.bigFishMax && difficultyLevel % 2 === 0) bigFishes.push(new BigFish());
  }

  oxygen -= Z.depletion + pol*0.035 + difficultyLevel*0.006;
  if (hitCooldown>0) hitCooldown--;
  if (flash>0) flash -= 0.06;

  if (reef){ drawReef(); }

  for (let i=bubbles.length-1;i>=0;i--){
    let b = bubbles[i];
    b.bob += 0.05; b.squish += 0.08;
    let by = b.y + Math.sin(b.bob)*4;
    let sq = 1 + Math.sin(b.squish)*0.08;
    drawBubble(b, by, sq);
    if (dist(fish.x,fish.y,b.x,by) < b.r+14){
      bubbles.splice(i,1);
      let gain = b.golden ? Z.bubbleGain*2 : Z.bubbleGain;
      let pts = b.golden ? 35 : 10;
      oxygen = Math.min(100, oxygen+gain);
      score += pts;
      bubblesCollected++;
      burst(b.x,by, b.golden?[255,220,140]:[200,240,255], b.golden?18:10);
      playCollect();
      spawnBubble();
    }
  }

  for (const j of jellies){
    j.t += j.speed*1.6;
    j.y = j.baseY + Math.sin(j.t)*18;
    drawJelly(j);
    if (hitCooldown===0 && dist(fish.x,fish.y,j.x,j.y) < j.r+11){
      oxygen -= 15; hitCooldown = 34; flash = 1; shake = 5;
      burst(fish.x,fish.y,[205,130,225],8); playHit();
    }
  }

  for (const t of trashes){
    t.x += t.vx; t.y += t.vy; t.rot += t.spin;
    if (t.x < -25) t.x = W+25; if (t.x > W+25) t.x = -25;
    if (t.y < -25) t.y = H+25; if (t.y > H+25) t.y = -25;
    drawTrash(t);
    if (hitCooldown===0 && dist(fish.x,fish.y,t.x,t.y) < t.r+11){
      oxygen -= 12; hitCooldown = 34; flash = 1; shake = 4;
      burst(fish.x,fish.y,[150,140,110],8); playHit();
    }
  }

  for (const bf of bigFishes){
    bf.update(); bf.draw();
    if (hitCooldown===0 && dist(fish.x,fish.y,bf.x,bf.y) < 30){
      oxygen -= 24; hitCooldown = 45; flash = 1; shake = 8;
      burst(fish.x,fish.y,[200,90,80],12); playHit();
    }
  }

  fish.update(pol);

  // ---- salas: si no es la sala final, tocar un borde te cruza a la próxima ----
  let edge = null;
  if (!reef){
    if (fish.x <= EDGE_MARGIN) edge = 'left';
    else if (fish.x >= W-EDGE_MARGIN) edge = 'right';
    else if (fish.y <= EDGE_MARGIN) edge = 'top';
    else if (fish.y >= H-EDGE_MARGIN) edge = 'bottom';
  }
  fish.clampInside();
  fish.draw(pol>0.55?paletteDirty:paletteClean);

  updateParticles();
  drawVignette(pol);

  if (flash>0){ noStroke(); fill(255,60,60, flash*90); rect(0,0,W,H); }
  if (transitionFlash>0){
    noStroke();
    fill(210,240,255, transitionFlash*130);
    rect(0,0,W,H);
    transitionFlash -= 0.07;
  }
  pop(); // cierra el push del screen shake

  drawHUD(pol);
  if (roomBannerTimer>0) drawRoomBanner();

  if (edge){ triggerRoomTransition(edge); }

  if (reef && dist(fish.x,fish.y,reef.x,reef.y) < reef.r && oxygen>0){
    endResult = "win"; saveScore(score); playWin(); state = "end";
  }
  if (oxygen <= 0){
    oxygen = 0; endResult = "lose"; saveScore(score); playLose(); state = "end";
  }
}

// ---------- dibujo de entidades con más estética ----------

function drawBubble(b, by, sq){
  noStroke();
  if (b.golden){
    fill(255,220,140,60);
    ellipse(b.x, by, b.r*3.4, b.r*3.4);
    fill(255,222,150,150);
    ellipse(b.x, by, b.r*2.2*sq, b.r*2.2/sq);
    fill(255,238,200,220);
    ellipse(b.x, by, b.r*1.5*sq, b.r*1.5/sq);
  } else {
    fill(210,245,255,55);
    ellipse(b.x, by, b.r*3, b.r*3);
    fill(190,230,250,130);
    ellipse(b.x, by, b.r*2.1*sq, b.r*2.1/sq);
    fill(225,250,255,220);
    ellipse(b.x, by, b.r*1.4*sq, b.r*1.4/sq);
  }
  fill(255,255,255,200);
  ellipse(b.x - b.r*0.35, by - b.r*0.4, b.r*0.5, b.r*0.5);
}

function drawJelly(j){
  push();
  translate(j.x, j.y);
  let pulse = 1 + Math.sin(j.t*1.6)*0.12;
  noStroke();
  fill(205,130,225,50);
  ellipse(0,0, j.r*3.2, j.r*2.6);
  fill(205,130,225,150);
  beginShape();
  bezierVertex(-j.r,4, -j.r*pulse,-j.r*1.1*pulse, 0,-j.r*1.3*pulse);
  bezierVertex(j.r*pulse,-j.r*1.1*pulse, j.r,4, j.r*0.7,6);
  bezierVertex(0,10, -j.r*0.7,6, -j.r,4);
  endShape(CLOSE);
  fill(230,190,240,180);
  ellipse(-j.r*0.25,-j.r*0.5, j.r*0.6, j.r*0.4);
  stroke(205,130,225,120);
  strokeWeight(2);
  noFill();
  for (let k=-1;k<=1;k++){
    beginShape();
    for (let s=0; s<=3; s++){
      let yy = 8 + s*7;
      let wig = Math.sin(j.t*2 + k + s*0.8)*5;
      curveVertex(k*6+wig, yy);
    }
    endShape();
  }
  pop();
}

function drawTrash(t){
  push();
  translate(t.x,t.y);
  rotate(t.rot);
  noStroke();
  fill(120,112,90,190);
  beginShape();
  bezierVertex(-t.r,-t.r*0.6, -t.r*0.4,-t.r*1.3, t.r*0.5,-t.r*0.8);
  bezierVertex(t.r*1.3,-t.r*0.3, t.r*1.1,t.r*0.7, t.r*0.2,t.r*1.1);
  bezierVertex(-t.r*0.7,t.r*1.3, -t.r*1.3,t.r*0.3, -t.r,-t.r*0.6);
  endShape(CLOSE);
  fill(150,142,116,140);
  ellipse(-t.r*0.2,-t.r*0.3, t.r*0.5, t.r*0.3);
  pop();
}

function drawReef(){
  push();
  reef.t += 0.03;
  let pulse = 6*Math.sin(reef.t);
  noStroke();
  fill(255,205,110,50);
  ellipse(reef.x, reef.y, reef.r*2+30+pulse, reef.r*2+30+pulse);
  const blobs = [ [0,0,1], [-30,18,0.6], [28,20,0.65], [-18,-24,0.55], [22,-20,0.5], [0,30,0.5] ];
  const hues = [ [255,150,120], [255,190,110], [255,205,150], [240,130,140], [255,170,90], [255,210,170] ];
  for (let k=0;k<blobs.length;k++){
    let [ox,oy,s] = blobs[k];
    let c = hues[k%hues.length];
    fill(c[0],c[1],c[2], 210);
    ellipse(reef.x+ox, reef.y+oy, reef.r*s*1.15, reef.r*s*1.15);
  }
  fill(255,235,210,230);
  ellipse(reef.x, reef.y, reef.r*0.6, reef.r*0.6);
  textAlign(CENTER,CENTER);
  textFont('Inter');
  fill(70,30,20);
  textSize(11.5);
  text("Arrecife", reef.x, reef.y);
  pop();
}

function drawRoomBanner(){
  roomBannerTimer--;
  let a = constrain(roomBannerTimer/40, 0, 1) * 255;
  push();
  noStroke();
  const cy = 108, panelW = 340, panelH = 56;
  fill(6,14,20, 150*(a/255));
  rectMode(CENTER);
  rect(W/2, cy, panelW, panelH, 12);
  fill(255,180,120, a*0.9);
  let tag = (currentRoom === TOTAL_ROOMS-1) ? "SALA FINAL" : "SALA " + (currentRoom+1) + " DE " + TOTAL_ROOMS;
  trackedText(tag, W/2, cy-16, 10.5, 2.5);
  fill(255,232,210, a);
  textAlign(CENTER,CENTER);
  textFont('Fraunces');
  textStyle(BOLD);
  textSize(18);
  text(ZONES[zoneIdx].name, W/2, cy+10);
  textStyle(NORMAL);
  pop();
}

function drawHUD(pol){
  const PAD = 16;

  // ---- panel de oxígeno ----
  push();
  noStroke();
  fill(6,14,20,150);
  rect(16,16,236,52,10);
  fill(255,235,220);
  trackedText("OXÍGENO", 16+PAD, 30, 9.5, 2, 'left');
  fill(255,255,255,50);
  rect(16+PAD, 42, 236-PAD*2, 15, 7);
  let oxCol = [ lerp(120,220,pol), lerp(220,60,pol), lerp(200,60,pol) ];
  fill(oxCol[0],oxCol[1],oxCol[2]);
  rect(16+PAD, 42, (236-PAD*2)*(oxygen/100), 15, 7);
  pop();

  // ---- panel de puntos / burbujas ----
  push();
  const panelX = W-188, panelW = 172, panelH = 66;
  fill(6,14,20,150);
  noStroke();
  rect(panelX,16,panelW,panelH,10);
  const labelX = panelX+PAD, valueX = panelX+panelW-PAD;
  const row1Y = 16+22, row2Y = 16+panelH-22;
  fill(255,220,190);
  trackedText("PUNTOS", labelX, row1Y, 9, 1.8, 'left');
  trackedText("BURBUJAS", labelX, row2Y, 9, 1.8, 'left');
  fill(255);
  textStyle(BOLD);
  textAlign(RIGHT,CENTER);
  textFont('Inter');
  textSize(15);
  text(score, valueX, row1Y);
  text(bubblesCollected, valueX, row2Y);
  textStyle(NORMAL);
  pop();
}

function drawEnd(){
  let dark = endResult==="win" ? 0.05 : 0.92;
  drawOceanBackground(dark);
  drawKelp(dark);
  noStroke();
  textAlign(CENTER,CENTER);
  fill(255);
  textFont('Fraunces');
  textStyle(BOLD);
  textSize(36);
  text(endResult==="win" ? "Llegaste al arrecife" : "Te quedaste sin oxígeno", W/2, H/2-42);
  textStyle(NORMAL);
  textFont('Inter');
  textSize(15.5);
  fill(215,232,232);
  text("Puntaje " + score + "   ·   Burbujas recolectadas " + bubblesCollected, W/2, H/2+2);
  let top = loadScores();
  if (top.length){
    textSize(12.5);
    fill(180,205,205);
    text("Mejores: " + top.join("  ·  "), W/2, H/2+26);
  }
  textSize(13);
  let pulse = 150 + Math.sin(frameCount*0.08)*80;
  fill(255,197,140,pulse);
  text("Presioná  R  para volver a intentarlo", W/2, H/2+58);
  drawVignette(dark);
}

function keyPressed(){
  initAudio();
  if (key===' ' || keyCode===32){
    if (state==="start") state="instructions";
    else if (state==="instructions") state="play";
  }
  if (key==='r' || key==='R'){
    resetGame();
    state = "start";
  }
}