/* ============================================================
   ÚLTIMA BURBUJA — prototipo jugable
   TP3 · Info Aplicada 1 · p5.js
   Estados: START -> INSTRUCTIONS -> PLAY -> END (win/lose)
   ============================================================ */

const W = 800, H = 500;
let state = "start";

// paletas: limpio -> contaminado
const paletteClean = { bg1:[9,77,99], bg2:[4,34,48], glow:[255,214,140], fish:[255,133,82], fishFin:[255,178,140] };
const paletteDirty = { bg1:[27,28,20], bg2:[9,9,7], glow:[120,112,60], fish:[176,118,88], fishFin:[140,100,80] };

let fish, reef;
let bubbles = [], jellies = [], trashes = [], bigFishes = [], motes = [];
let oxygen = 100;
let score = 0;
let bubblesCollected = 0;
let elapsed = 0;
let hitCooldown = 0;
let flash = 0; // destello rojo al recibir daño
let endResult = "";
let difficultyLevel = 0;

// límites de dificultad
const MAX_JELLY = 7, MAX_TRASH = 6, MAX_BIGFISH = 4;
const DIFFICULTY_STEP = 300; // frames entre subas de dificultad (~5s a 60fps)

function setup(){
  const c = createCanvas(W, H);
  c.parent("holder");
  textFont('Inter');
  for (let i=0;i<40;i++) motes.push(makeMote());
  resetGame();
}

function makeMote(){
  return { x: random(W), y: random(H), r: random(1,2.6), s: random(0.15,0.5), drift: random(-0.15,0.15) };
}

function resetGame(){
  fish = new Fish(90, H/2);
  reef = { x: W-70, y: H/2, r: 52 };
  bubbles = []; jellies = []; trashes = []; bigFishes = [];
  for (let i=0;i<5;i++) spawnBubble();
  for (let i=0;i<2;i++) spawnJelly();
  for (let i=0;i<2;i++) spawnTrash();
  bigFishes.push(new BigFish());
  oxygen = 100;
  score = 0;
  bubblesCollected = 0;
  elapsed = 0;
  hitCooldown = 0;
  flash = 0;
  difficultyLevel = 0;
  endResult = "";
}

function spawnBubble(){
  bubbles.push({ x: random(190,W-130), y: random(40,H-40), r: 9, bob: random(TWO_PI) });
}
function spawnJelly(){
  jellies.push({ x: random(210,W-170), baseY: random(60,H-60), y:0, t: random(TWO_PI),
                 speed: random(0.02,0.04), r: 15 });
}
function spawnTrash(){
  trashes.push({ x: random(210,W-150), y: random(40,H-40), r: 13, vx: random(0.5,1.3), rot:0 });
}

class BigFish{
  constructor(){
    this.y = random(80,H-80);
    this.baseY = this.y;
    this.x = W+60;
    this.speed = random(2.6,4.2);
    this.t = random(TWO_PI);
  }
  update(){
    this.x -= this.speed;
    this.t += 0.04;
    this.y = this.baseY + Math.sin(this.t)*20;
    if (this.x < -70){ this.x = W+70; this.baseY = random(80,H-80); this.speed = random(2.6,4.2+difficultyLevel*0.3); }
  }
  draw(){
    push();
    translate(this.x,this.y);
    noStroke();
    fill(70,32,32);
    ellipse(0,0,64,28);
    triangle(-32,0,-48,-15,-48,15);
    fill(120,60,55);
    ellipse(10,-2,10,10);
    pop();
  }
}

class Fish{
  constructor(x,y){ this.x=x; this.y=y; this.vx=0; this.vy=0; this.ang=0; this.tail=0; }
  update(pol){
    let ax=0, ay=0;
    if (keyIsDown(87)) ay -= 1;
    if (keyIsDown(83)) ay += 1;
    if (keyIsDown(65)) ax -= 1;
    if (keyIsDown(68)) ax += 1;
    let mag = Math.hypot(ax,ay);
    if (mag>0){ ax/=mag; ay/=mag; }

    // una leve corriente empuja al pez: obliga a corregir el rumbo constantemente
    let current = Math.sin((elapsed+this.x*0.5)*0.01) * (0.35 + pol*0.4);

    this.vx = lerp(this.vx, ax*3.6, 0.2);
    this.vy = lerp(this.vy, ay*3.6 + current, 0.2);
    this.x = constrain(this.x+this.vx, 20, W-20);
    this.y = constrain(this.y+this.vy, 20, H-20);
    if (mag>0) this.ang = atan2(this.vy, this.vx);
    this.tail += 0.25 + mag*0.15;
  }
  draw(pal){
    push();
    translate(this.x,this.y);
    rotate(this.ang);
    noStroke();
    let wag = Math.sin(this.tail)*10;
    fill(pal.fishFin[0],pal.fishFin[1],pal.fishFin[2]);
    triangle(-14,0,-26,-9+wag*0.2,-26,9+wag*0.2);
    fill(pal.fish[0],pal.fish[1],pal.fish[2]);
    ellipse(0,0,34,19);
    fill(pal.fishFin[0],pal.fishFin[1],pal.fishFin[2]);
    triangle(2,-9,-4,-16,8,-11);
    fill(255);
    ellipse(9,-3,5,5);
    fill(20);
    ellipse(10,-3,2.4,2.4);
    pop();
  }
}

function draw(){
  if (state==="start") drawStart();
  else if (state==="instructions") drawInstructions();
  else if (state==="play") drawPlay();
  else if (state==="end") drawEnd();
}

function pollution(){ return constrain(1 - oxygen/100, 0, 1); }

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
  // rayos de luz tenues, se apagan con la contaminación
  push();
  blendMode(ADD);
  noStroke();
  for (let i=0;i<4;i++){
    let x = (i*220 + (elapsed*0.15)%220) % (W+200) - 100;
    fill(255,255,240, (14*(1-pol)));
    quad(x,-20, x+70,-20, x-30+160,H, x-100+160,H);
  }
  pop();

  // partículas / motas flotando
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
    rectMode(CORNER);
    rect(-i*2,-i*2, W+i*4, H+i*4);
  }
  pop();
}

function drawStart(){
  drawOceanBackground(0);
  let bobble = Math.sin(frameCount*0.03)*6;
  noStroke();
  textAlign(CENTER,CENTER);
  fill(255,255,255,235);
  textFont('Fraunces');
  textSize(50);
  text("Última burbuja", W/2, H/2 - 55 + bobble);
  textFont('Inter');
  textSize(15);
  fill(200,222,222,220);
  text("Un pez, un océano que se apaga, un camino de vuelta a casa.", W/2, H/2 - 12 + bobble);
  textSize(13.5);
  fill(255,197,140);
  let pulse = 150 + Math.sin(frameCount*0.08)*80;
  fill(255,197,140, pulse);
  text("presioná  ESPACIO  para continuar", W/2, H/2 + 44);
  drawVignette(0);
}

function drawInstructions(){
  drawOceanBackground(0.12);
  noStroke();
  textAlign(CENTER,TOP);
  fill(255,255,255,235);
  textFont('Fraunces');
  textSize(30);
  text("Instrucciones", W/2, 56);
  textFont('Inter');
  textAlign(LEFT,TOP);
  textSize(15);
  fill(220,235,235,230);
  const lines = [
    "Movete con  W A S D.  Una corriente te empuja: vas a tener que corregir el rumbo.",
    "Recolectá burbujas — recuperan oxígeno y suman puntos.",
    "Evitá medusas, basura y peces grandes — te quitan oxígeno al contacto.",
    "A medida que pasa el tiempo aparecen más obstáculos y el agua se oscurece.",
    "Llegá al arrecife dorado (derecha) antes de quedarte sin oxígeno."
  ];
  let y = 120;
  for (const l of lines){ text("·  "+l, 110, y, W-220); y += 42; }
  textAlign(CENTER,CENTER);
  fill(255,197,140);
  textSize(13.5);
  text("presioná  ESPACIO  para empezar a nadar", W/2, H-40);
  drawVignette(0.12);
}

function drawPlay(){
  elapsed++;
  let pol = pollution();
  drawOceanBackground(pol);

  // dificultad progresiva
  let targetLevel = Math.floor(elapsed / DIFFICULTY_STEP);
  if (targetLevel > difficultyLevel){
    difficultyLevel = targetLevel;
    if (jellies.length < MAX_JELLY) spawnJelly();
    if (trashes.length < MAX_TRASH) spawnTrash();
    if (bigFishes.length < MAX_BIGFISH && difficultyLevel % 2 === 0) bigFishes.push(new BigFish());
  }

  oxygen -= 0.075 + pol*0.035 + difficultyLevel*0.006;
  if (hitCooldown>0) hitCooldown--;
  if (flash>0) flash -= 0.06;

  // arrecife
  push();
  noStroke();
  let pulse = 6*Math.sin(frameCount*0.05);
  fill(255,205,110,60);
  ellipse(reef.x, reef.y, reef.r*2+18+pulse, reef.r*2+18+pulse);
  fill(255,205,110,210);
  ellipse(reef.x, reef.y, reef.r*2, reef.r*2);
  fill(255,240,205);
  textAlign(CENTER,CENTER);
  textFont('Inter');
  textSize(12);
  text("arrecife", reef.x, reef.y);
  pop();

  for (let i=bubbles.length-1;i>=0;i--){
    let b = bubbles[i];
    b.bob += 0.05;
    let by = b.y + Math.sin(b.bob)*4;
    noStroke();
    fill(210,245,255,90);
    ellipse(b.x, by, b.r*2.6, b.r*2.6);
    fill(220,248,255,210);
    ellipse(b.x, by, b.r*2, b.r*2);
    if (dist(fish.x,fish.y,b.x,by) < b.r+14){
      bubbles.splice(i,1);
      oxygen = Math.min(100, oxygen+11);
      score += 10;
      bubblesCollected++;
      spawnBubble();
    }
  }

  for (const j of jellies){
    j.t += j.speed*1.6;
    j.y = j.baseY + Math.sin(j.t)*18;
    push();
    noStroke();
    fill(205,130,225,170);
    ellipse(j.x, j.y, j.r*2, j.r*1.6);
    for (let k=-1;k<=1;k++){
      stroke(205,130,225,130);
      strokeWeight(2);
      let wig = Math.sin(j.t*2 + k)*4;
      line(j.x+k*6, j.y+9, j.x+k*6+wig, j.y+24);
    }
    noStroke();
    pop();
    if (hitCooldown===0 && dist(fish.x,fish.y,j.x,j.y) < j.r+12){
      oxygen -= 15; hitCooldown = 34; flash = 1;
    }
  }

  for (const t of trashes){
    t.x -= t.vx;
    t.rot += 0.02;
    if (t.x < -20) t.x = W+20;
    push();
    translate(t.x,t.y);
    rotate(t.rot);
    noStroke();
    fill(115,105,85,210);
    rectMode(CENTER);
    rect(0,0,t.r*1.8,t.r*1.2,3);
    pop();
    if (hitCooldown===0 && dist(fish.x,fish.y,t.x,t.y) < t.r+12){
      oxygen -= 12; hitCooldown = 34; flash = 1;
    }
  }

  for (const bf of bigFishes){
    bf.update(); bf.draw();
    if (hitCooldown===0 && dist(fish.x,fish.y,bf.x,bf.y) < 32){
      oxygen -= 24; hitCooldown = 45; flash = 1;
    }
  }

  fish.update(pol);
  fish.draw(pol>0.55?paletteDirty:paletteClean);

  drawVignette(pol);
  if (flash>0){
    noStroke();
    fill(255,60,60, flash*90);
    rect(0,0,W,H);
  }
  drawHUD(pol);

  if (dist(fish.x,fish.y,reef.x,reef.y) < reef.r && oxygen>0){
    endResult = "win"; state = "end";
  }
  if (oxygen <= 0){
    oxygen = 0; endResult = "lose"; state = "end";
  }
}

function drawHUD(pol){
  push();
  noStroke();
  fill(6,14,20,150);
  rect(16,16,232,34,10);
  fill(255,255,255,50);
  rect(28,26,196,14,7);
  let oxCol = [ lerp(120,220,pol), lerp(220,60,pol), lerp(200,60,pol) ];
  fill(oxCol[0],oxCol[1],oxCol[2]);
  rect(28,26, 196*(oxygen/100), 14, 7);
  fill(255);
  textFont('Inter'); textSize(11);
  textAlign(LEFT,CENTER);
  text("OXÍGENO", 28, 43);
  pop();

  push();
  fill(6,14,20,150);
  noStroke();
  rect(W-176,16,160,58,10);
  fill(255);
  textAlign(LEFT,TOP);
  textSize(13);
  text("puntos    " + score, W-160, 26);
  text("burbujas  " + bubblesCollected, W-160, 46);
  pop();
}

function drawEnd(){
  let dark = endResult==="win" ? 0.05 : 0.92;
  drawOceanBackground(dark);
  noStroke();
  textAlign(CENTER,CENTER);
  fill(255);
  textFont('Fraunces');
  textSize(36);
  text(endResult==="win" ? "Llegaste al arrecife" : "Te quedaste sin oxígeno", W/2, H/2-42);
  textFont('Inter');
  textSize(15.5);
  fill(215,232,232);
  text("puntaje " + score + "   ·   burbujas recolectadas " + bubblesCollected, W/2, H/2+2);
  textSize(13);
  let pulse = 150 + Math.sin(frameCount*0.08)*80;
  fill(255,197,140,pulse);
  text("presioná  R  para volver a intentarlo", W/2, H/2+44);
  drawVignette(dark);
}

function keyPressed(){
  if (key===' ' || keyCode===32){
    if (state==="start") state="instructions";
    else if (state==="instructions") state="play";
  }
  if (key==='r' || key==='R'){
    resetGame();
    state = "start";
  }
}
