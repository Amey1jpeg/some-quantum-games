// ═══════════════════════════════════════════════════════
//  GAME 22 — GRAVITY SLING
//  Drag to aim your shot. Planets bend the trajectory.
//  Hit all targets — use gravity assists for bonus points!
// ═══════════════════════════════════════════════════════

let G22 = {}
let g22Canvas, g22Ctx, g22Raf
let g22Drag = { active:false, startX:0, startY:0, curX:0, curY:0 }

window.initGame22 = function() {
  g22Canvas = document.getElementById('g22-canvas')
  g22Ctx    = g22Canvas.getContext('2d')

  const pos = e => {
    const r = g22Canvas.getBoundingClientRect()
    return {
      x: (e.clientX - r.left) * (g22Canvas.width  / r.width),
      y: (e.clientY - r.top)  * (g22Canvas.height / r.height),
    }
  }
  g22Canvas.onmousedown  = e => { const p=pos(e); g22DragStart(p.x,p.y) }
  g22Canvas.onmousemove  = e => { const p=pos(e); g22DragMove(p.x,p.y) }
  g22Canvas.onmouseup    = ()  => g22DragEnd()
  g22Canvas.ontouchstart = e => { e.preventDefault(); const p=pos(e.touches[0]); g22DragStart(p.x,p.y) }
  g22Canvas.ontouchmove  = e => { e.preventDefault(); const p=pos(e.touches[0]); g22DragMove(p.x,p.y) }
  g22Canvas.ontouchend   = e => { e.preventDefault(); g22DragEnd() }

  g22Reset()
}

function g22Reset() {
  if (g22Raf) { cancelAnimationFrame(g22Raf); g22Raf = null }
  g22Drag = { active:false, startX:0, startY:0, curX:0, curY:0 }

  G22 = {
    active: true, score: 0, frameCount: 0,
    targetsHit: 0, totalTargets: 8,
    shotsLeft: 12,
    planets: [], targets: [],
    ball: null,     // null = ready to shoot
    trail: [],
    particles: [], msgs: [],
    screenShake: 0,
    gravAssistThisShot: 0,
  }

  g22BuildLevel()
  document.getElementById('g22-over').classList.remove('show')
  g22Loop()
}

function g22BuildLevel() {
  const W = g22Canvas.width  || 600
  const H = g22Canvas.height || 400

  G22.planets = []
  G22.targets = []

  // 3–4 planets
  const nPlanets = 3 + Math.floor(Math.random() * 2)
  for (let i=0; i<nPlanets; i++) {
    for (let t=0;t<50;t++) {
      const x = W*0.2 + Math.random()*(W*0.75)
      const y = H*0.15 + Math.random()*(H*0.7)
      // keep away from launch zone
      if (x < W*0.18) continue
      // keep away from each other
      let ok = true
      for (const p of G22.planets) {
        if (Math.hypot(x-p.x,y-p.y) < 90) { ok=false; break }
      }
      if (ok) {
        G22.planets.push({ x, y, r:22+Math.random()*16, mass:60+Math.random()*60, hue:Math.floor(Math.random()*360) })
        break
      }
    }
  }

  // targets — spread around right half
  for (let i=0; i<G22.totalTargets; i++) {
    for (let t=0;t<80;t++) {
      const x = W*0.3 + Math.random()*(W*0.65)
      const y = H*0.1  + Math.random()*(H*0.8)
      let ok=true
      for (const p of G22.planets) { if(Math.hypot(x-p.x,y-p.y)<p.r+22){ok=false;break} }
      for (const tgt of G22.targets) { if(Math.hypot(x-tgt.x,y-tgt.y)<40){ok=false;break} }
      if(ok) { G22.targets.push({x,y,r:12,hit:false,pulse:Math.random()*Math.PI*2}); break }
    }
  }
}

// launch zone (left side)
function g22LaunchPos() {
  const W = g22Canvas.width||600, H = g22Canvas.height||400
  return { x:W*0.08, y:H*0.5 }
}

function g22DragStart(x,y) {
  if (!G22.active || G22.ball) return
  const lp = g22LaunchPos()
  if (Math.hypot(x-lp.x,y-lp.y) < 40) {
    g22Drag.active=true; g22Drag.startX=lp.x; g22Drag.startY=lp.y; g22Drag.curX=x; g22Drag.curY=y
  }
}
function g22DragMove(x,y) { if(g22Drag.active){g22Drag.curX=x;g22Drag.curY=y} }
function g22DragEnd() {
  SFX.resume()
  if (!g22Drag.active||!G22.active) return
  g22Drag.active=false
  if (G22.ball||G22.shotsLeft<=0) return
  const lp=g22LaunchPos()
  const dx=lp.x-g22Drag.curX, dy=lp.y-g22Drag.curY
  const power=Math.min(Math.hypot(dx,dy),120)/120
  SFX.shoot()
  G22.ball={
    x:lp.x, y:lp.y,
    vx:dx*0.115*power, vy:dy*0.115*power,
    life:600, r:8,
  }
  G22.trail=[]; G22.gravAssistThisShot=0
  G22.shotsLeft--
}

// ─── simulate one step ────────────────────────────────
function g22Step(bx,by,bvx,bvy,factor=1) {
  let ax=0,ay=0
  for(const p of G22.planets){
    const dx=p.x-bx,dy=p.y-by
    const d2=dx*dx+dy*dy,d=Math.sqrt(d2)
    if(d<2)continue
    const force=p.mass/d2
    ax+=dx/d*force; ay+=dy/d*force
  }
  return {x:bx+bvx*factor,y:by+bvy*factor,vx:bvx+ax*factor,vy:bvy+ay*factor}
}

// ─── update ────────────────────────────────────────────
function g22Update() {
  G22.frameCount++
  if(G22.screenShake>0)G22.screenShake--
  for(const tgt of G22.targets) tgt.pulse+=0.07

  if(G22.ball){
    const b=G22.ball
    // gravity
    let ax=0,ay=0
    for(const p of G22.planets){
      const dx=p.x-b.x,dy=p.y-b.y,d2=dx*dx+dy*dy,d=Math.sqrt(d2)
      if(d<1)continue
      const spd=Math.sqrt(b.vx*b.vx+b.vy*b.vy)
      // gravity assist detection: close pass at high speed
      if(d<p.r+40&&spd>4) G22.gravAssistThisShot++
      ax+=dx/d*(p.mass/d2); ay+=dy/d*(p.mass/d2)
    }
    b.vx+=ax; b.vy+=ay
    b.x+=b.vx; b.y+=b.vy
    b.life--

    G22.trail.push({x:b.x,y:b.y})
    if(G22.trail.length>60)G22.trail.shift()

    const W=g22Canvas.width||600,H=g22Canvas.height||400

    // hit planet?
    for(const p of G22.planets){
      if(Math.hypot(b.x-p.x,b.y-p.y)<p.r+b.r){G22.ball=null;G22.trail=[];break}
    }

    // hit target?
    if(G22.ball){
      for(const tgt of G22.targets){
        if(!tgt.hit&&Math.hypot(b.x-tgt.x,b.y-tgt.y)<tgt.r+b.r){
          tgt.hit=true
          SFX.hit()
          const bonus=G22.gravAssistThisShot>0?G22.gravAssistThisShot*100:0
          const pts=200+bonus
          G22.score+=pts
          G22.targetsHit++
          G22.screenShake=10
          const label=bonus>0?`+${pts} 🌀 ASSIST!`:`+${pts}`
          G22.msgs.push({text:label,color:bonus>0?'#fbbf24':'#4ade80',frames:80,big:bonus>0})
          G22.ball=null;G22.trail=[]
          break
        }
      }
    }

    // out of bounds or life expired
    if(G22.ball&&(b.life<=0||b.x<-80||b.x>W+80||b.y<-80||b.y>H+80)){
      G22.ball=null;G22.trail=[]
    }
  }

  // check game end
  const allHit=G22.targets.every(t=>t.hit)
  if(allHit||(G22.shotsLeft<=0&&!G22.ball&&G22.targetsHit<G22.totalTargets)){
    if(allHit){SFX.win();G22.score+=G22.shotsLeft*50;G22.msgs.push({text:'🎯 ALL TARGETS! +'+G22.shotsLeft*50,color:'#fbbf24',frames:120,big:true})}
    setTimeout(g22Over,800)
    G22.active=false
  }

  G22.particles=G22.particles.filter(p=>{p.x+=p.vx;p.y+=p.vy;p.vx*=0.88;p.vy*=0.88;p.life--;return p.life>0})
  G22.msgs=G22.msgs.filter(m=>{m.frames--;return m.frames>0})
}

// ─── draw ──────────────────────────────────────────────
function g22Draw() {
  const cv=g22Canvas,c=g22Ctx
  const arena=document.getElementById('g22-arena')
  if(cv.width!==arena.clientWidth||cv.height!==arena.clientHeight){cv.width=arena.clientWidth;cv.height=arena.clientHeight;g22BuildLevel()}
  const W=cv.width,H=cv.height

  c.clearRect(0,0,W,H)
  // Canvases get no CSS variables, so read the theme directly
  const _lt = typeof qgLight === 'function' && qgLight()
  c.fillStyle=_lt?'#eef2fb':'#020617';c.fillRect(0,0,W,H)

  // stars
  c.fillStyle=_lt?'rgba(30,41,59,.3)':'rgba(255,255,255,.35)'
  for(let i=0;i<80;i++){
    const sx=(i*237+13)%W,sy=(i*193+7)%H
    c.fillRect(sx,sy,1,1)
  }

  c.save()
  if(G22.screenShake>0){const s=G22.screenShake*.5;c.translate((Math.random()-.5)*s,(Math.random()-.5)*s)}

  // gravity well visualisation
  for(const p of G22.planets){
    for(let ring=1;ring<=3;ring++){
      const r2=p.r+ring*25
      c.beginPath();c.arc(p.x,p.y,r2,0,Math.PI*2)
      c.strokeStyle=`hsla(${p.hue},70%,${_lt?45:55}%,${(_lt?0.16:0.08)-ring*(_lt?0.04:0.02)})`;c.lineWidth=1;c.stroke()
    }
    // planet body
    const grad=c.createRadialGradient(p.x-p.r*.3,p.y-p.r*.3,2,p.x,p.y,p.r)
    grad.addColorStop(0,`hsl(${p.hue},70%,75%)`);grad.addColorStop(1,`hsl(${p.hue},60%,30%)`)
    c.beginPath();c.arc(p.x,p.y,p.r,0,Math.PI*2)
    c.fillStyle=grad;c.shadowColor=`hsl(${p.hue},80%,55%)`;c.shadowBlur=18;c.fill();c.shadowBlur=0
  }

  // targets
  for(const tgt of G22.targets){
    if(tgt.hit)continue
    const pulse=1+Math.sin(tgt.pulse)*.15
    c.beginPath();c.arc(tgt.x,tgt.y,tgt.r*pulse,0,Math.PI*2)
    c.fillStyle='rgba(239,68,68,.3)';c.fill()
    c.strokeStyle='#ef4444';c.lineWidth=2;c.shadowColor='#ef4444';c.shadowBlur=14;c.stroke();c.shadowBlur=0
    c.font=`bold ${Math.floor(tgt.r*1.4)}px sans-serif`;c.textAlign='center';c.textBaseline='middle'
    c.fillStyle='#fff';c.fillText('✕',tgt.x,tgt.y+1);c.textBaseline='alphabetic'
  }

  // trajectory preview (while dragging)
  if(g22Drag.active){
    const lp=g22LaunchPos()
    const dx=lp.x-g22Drag.curX,dy=lp.y-g22Drag.curY
    const power=Math.min(Math.hypot(dx,dy),120)/120
    let sx=lp.x,sy=lp.y,svx=dx*.115*power,svy=dy*.115*power
    c.setLineDash([4,5]);c.strokeStyle='rgba(251,191,36,.5)';c.lineWidth=1.5
    c.beginPath();c.moveTo(sx,sy)
    for(let i=0;i<80;i++){
      const next=g22Step(sx,sy,svx,svy)
      sx=next.x;sy=next.y;svx=next.vx;svy=next.vy
      c.lineTo(sx,sy)
      if(sx<-60||sx>W+60||sy<-60||sy>H+60)break
    }
    c.stroke();c.setLineDash([])
    // power meter
    c.beginPath();c.arc(lp.x,lp.y,12+power*18,0,Math.PI*2)
    c.strokeStyle=`rgba(251,191,36,${power*.7})`;c.lineWidth=2;c.stroke()
  }

  // ball trail
  for(let i=0;i<G22.trail.length;i++){
    const t=G22.trail[i],frac=i/G22.trail.length
    c.globalAlpha=frac*.6;c.beginPath();c.arc(t.x,t.y,4*frac,0,Math.PI*2)
    c.fillStyle='#22d3ee';c.fill()
  }
  c.globalAlpha=1

  // ball
  if(G22.ball){
    const b=G22.ball
    c.beginPath();c.arc(b.x,b.y,b.r,0,Math.PI*2)
    c.fillStyle='#22d3ee';c.shadowColor='#22d3ee';c.shadowBlur=20;c.fill();c.shadowBlur=0
    c.beginPath();c.arc(b.x,b.y,b.r*.4,0,Math.PI*2);c.fillStyle='#fff';c.fill()
  }

  // launch zone
  const lp=g22LaunchPos()
  c.beginPath();c.arc(lp.x,lp.y,18,0,Math.PI*2)
  c.fillStyle='rgba(34,197,94,.2)';c.fill()
  c.strokeStyle='#22c55e';c.lineWidth=2;c.shadowColor='#22c55e';c.shadowBlur=12;c.stroke();c.shadowBlur=0
  c.font='bold 11px sans-serif';c.textAlign='center';c.fillStyle='#22c55e'
  c.fillText('DRAG',lp.x,lp.y+28)

  // particles
  c.globalAlpha=1
  for(const p of G22.particles){c.globalAlpha=p.life/46;c.beginPath();c.arc(p.x,p.y,p.r,0,Math.PI*2);c.fillStyle=p.color;c.fill()}
  c.globalAlpha=1
  c.restore()

  // HUD
  c.font='bold 20px monospace';c.textAlign='left';c.fillStyle=_lt?'#14152b':'#f1f5f9'
  c.shadowColor=_lt?'rgba(255,255,255,.8)':'#000';c.shadowBlur=4;c.fillText(G22.score.toLocaleString(),12,36);c.shadowBlur=0
  c.font='13px sans-serif';c.fillStyle=_lt?'#475569':'#94a3b8'
  c.fillText(`🎯 ${G22.targetsHit}/${G22.totalTargets}  💥 ${G22.shotsLeft} shots left`,12,54)

  let my=H/2-60
  for(const m of G22.msgs){
    c.globalAlpha=Math.min(1,m.frames/20)
    c.font=`bold ${m.big?21:15}px sans-serif`;c.textAlign='center'
    c.fillStyle=m.color;c.shadowColor=m.color;c.shadowBlur=8
    c.fillText(m.text,W/2,my);c.shadowBlur=0;my+=m.big?30:22
  }
  c.globalAlpha=1

  if(G22.frameCount<200){
    c.globalAlpha=Math.min(1,(200-G22.frameCount)/60)*.7
    c.font='13px sans-serif';c.textAlign='center';c.fillStyle='#fbbf24'
    c.fillText('Drag from the green circle to aim & set power — planets bend your shot!',W/2,H-16)
    c.globalAlpha=1
  }
}

function g22Loop(){
  g22Raf=requestAnimationFrame(g22Loop)
  if(!G22.active||!document.getElementById('game22').classList.contains('active')){cancelAnimationFrame(g22Raf);g22Raf=null;return}
  g22Update();g22Draw()
}

function g22Over(){
  G22.active=false;window._g22Score=G22.score
  document.getElementById('g22-final-score').textContent=G22.score.toLocaleString()
  const m=G22.score>=2000?'🥇 Gold':G22.score>=900?'🥈 Silver':G22.score>=350?'🥉 Bronze':''
  document.getElementById('g22-medal').textContent=m
  document.getElementById('g22-over').classList.add('show')
}
