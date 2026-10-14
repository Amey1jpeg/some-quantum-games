// ═══════════════════════════════════════════════════════
//  GAME 26 — ORBIT
//  You're a moon. Click to fire a thruster burst.
//  Stay in the safe orbit band — don't burn up or drift away!
//  Dodge debris that tries to knock you off course.
// ═══════════════════════════════════════════════════════

let G26 = {}
let g26Canvas, g26Ctx, g26Raf
let g26Mouse = { x:0, y:0 }

window.initGame26 = function() {
  g26Canvas = document.getElementById('g26-canvas')
  g26Ctx    = g26Canvas.getContext('2d')

  const pos = e => {
    const r=g26Canvas.getBoundingClientRect()
    return {x:(e.clientX-r.left)*(g26Canvas.width/r.width),y:(e.clientY-r.top)*(g26Canvas.height/r.height)}
  }
  g26Canvas.onmousemove  = e => { const p=pos(e); g26Mouse.x=p.x; g26Mouse.y=p.y }
  g26Canvas.onmousedown  = e => { const p=pos(e); g26Mouse.x=p.x; g26Mouse.y=p.y; g26Thrust() }
  g26Canvas.ontouchmove  = e => { e.preventDefault(); const p=pos(e.touches[0]); g26Mouse.x=p.x; g26Mouse.y=p.y }
  g26Canvas.ontouchstart = e => { e.preventDefault(); const p=pos(e.touches[0]); g26Mouse.x=p.x; g26Mouse.y=p.y; g26Thrust() }

  g26Reset()
}

function g26Reset() {
  if (g26Raf) { cancelAnimationFrame(g26Raf); g26Raf = null }

  const W=g26Canvas.width||500, H=g26Canvas.height||500
  const cx=W/2, cy=H/2
  const orbitR = Math.min(W,H)*0.3

  G26 = {
    active:true, score:0, frameCount:0,
    planet:{ x:cx, y:cy, r:28, mass:3200 },
    player:{ x:cx+orbitR, y:cy, vx:0, vy:-2.8, r:8, thrustFlash:0 },
    safeMin: orbitR*0.65,
    safeMax: orbitR*1.38,
    debris:[],
    particles:[], msgs:[],
    screenShake:0,
    debrisTimer:300,
    thrustCooldown:0,
    trail:[],
    dangerTimer:0,
  }
  // give player correct orbital velocity
  const spd = Math.sqrt(G26.planet.mass / orbitR)
  G26.player.vx = 0
  G26.player.vy = -spd

  document.getElementById('g26-over').classList.remove('show')
  g26Loop()
}

function g26Thrust() {
  SFX.resume()
  if (!G26.active||G26.thrustCooldown>0) return
  SFX.whoosh()
  const p=G26.player, pl=G26.planet
  // thrust toward mouse direction from player
  const dx=g26Mouse.x-p.x, dy=g26Mouse.y-p.y
  const d=Math.sqrt(dx*dx+dy*dy)||1
  const power=1.8
  p.vx += dx/d*power; p.vy += dy/d*power
  p.thrustFlash=10
  G26.thrustCooldown=22
  g26Sparks(p.x,p.y,'#22d3ee',10)
}

function g26SpawnDebris() {
  const W=g26Canvas.width||500, H=g26Canvas.height||500
  const pl=G26.planet
  const angle=Math.random()*Math.PI*2
  const startR=Math.min(W,H)*0.55
  const x=pl.x+Math.cos(angle)*startR, y=pl.y+Math.sin(angle)*startR
  // velocity aimed roughly toward player with variance
  const dx=G26.player.x-x, dy=G26.player.y-y
  const d=Math.sqrt(dx*dx+dy*dy)||1
  const spd=0.8+Math.random()*0.8
  G26.debris.push({
    x,y,
    vx:dx/d*spd+(Math.random()-.5)*0.6,
    vy:dy/d*spd+(Math.random()-.5)*0.6,
    r:5+Math.random()*8,
    hue:Math.floor(Math.random()*360),
    dead:false,
  })
}

function g26Sparks(x,y,color,n=10){for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,s=1+Math.random()*4;G26.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,color,life:24+Math.floor(Math.random()*16),r:2+Math.random()*2})}}

function g26Update() {
  G26.frameCount++
  if (G26.screenShake>0) G26.screenShake--
  if (G26.thrustCooldown>0) G26.thrustCooldown--

  const p=G26.player, pl=G26.planet
  if (p.thrustFlash>0) p.thrustFlash--

  // gravity
  const dx=pl.x-p.x, dy=pl.y-p.y
  const d2=dx*dx+dy*dy, d=Math.sqrt(d2)
  p.vx += dx/d*(pl.mass/d2)
  p.vy += dy/d*(pl.mass/d2)
  p.x += p.vx; p.y += p.vy

  // trail
  G26.trail.push({x:p.x,y:p.y})
  if (G26.trail.length>55) G26.trail.shift()

  // check safe zone
  const dist=g26Dist(p.x,p.y,pl.x,pl.y)
  const inSafe = dist>=G26.safeMin && dist<=G26.safeMax

  if (inSafe) {
    G26.score += 2
    G26.dangerTimer=0
  } else {
    G26.dangerTimer++
    G26.msgs.push({text: dist<G26.safeMin?'🔥 TOO CLOSE!':'🌌 TOO FAR!', color:dist<G26.safeMin?'#f87171':'#a78bfa', frames:30})
    if (G26.dangerTimer > 180) { g26Over(); return }
  }

  // debris
  G26.debrisTimer--
  if (G26.debrisTimer<=0) {
    g26SpawnDebris()
    G26.debrisTimer = Math.max(100, 300 - Math.floor(G26.frameCount/600)*20)
  }

  G26.debris = G26.debris.filter(db => {
    if (db.dead) return false
    // gravity from planet (weak)
    const dbdx=pl.x-db.x, dbdy=pl.y-db.y
    const dbd=Math.sqrt(dbdx*dbdx+dbdy*dbdy)||1
    db.vx+=dbdx/dbd*(pl.mass*0.0004); db.vy+=dbdy/dbd*(pl.mass*0.0004)
    db.x+=db.vx; db.y+=db.vy
    // hit player?
    if (g26Dist(db.x,db.y,p.x,p.y)<db.r+p.r) {
      db.dead=true
      SFX.miss()
      G26.screenShake=16
      // knock player
      const kx=p.x-db.x, ky=p.y-db.y, kd=Math.sqrt(kx*kx+ky*ky)||1
      p.vx+=kx/kd*2.5; p.vy+=ky/kd*2.5
      G26.msgs.push({text:'💥 KNOCKED!',color:'#f87171',frames:60,big:true})
      g26Sparks(db.x,db.y,`hsl(${db.hue},80%,55%)`,16)
      return false
    }
    // hit planet?
    if (g26Dist(db.x,db.y,pl.x,pl.y)<pl.r+db.r) { db.dead=true; return false }
    const W=g26Canvas.width||500, H=g26Canvas.height||500
    return db.x>-60&&db.x<W+60&&db.y>-60&&db.y<H+60
  })

  G26.particles=G26.particles.filter(pt=>{pt.x+=pt.vx;pt.y+=pt.vy;pt.vx*=0.88;pt.vy*=0.88;pt.life--;return pt.life>0})
  // deduplicate msgs (only keep last of same text)
  G26.msgs=G26.msgs.filter(m=>{m.frames--;return m.frames>0}).slice(-4)
}

const g26Dist=(ax,ay,bx,by)=>{const dx=ax-bx,dy=ay-by;return Math.sqrt(dx*dx+dy*dy)}

function g26Draw() {
  const cv=g26Canvas,c=g26Ctx
  const arena=document.getElementById('g26-arena')
  if(cv.width!==arena.clientWidth||cv.height!==arena.clientHeight){
    cv.width=arena.clientWidth;cv.height=arena.clientHeight
    const cx2=cv.width/2,cy2=cv.height/2
    G26.planet.x=cx2;G26.planet.y=cy2
    const orb=Math.min(cv.width,cv.height)*.3
    G26.safeMin=orb*.65;G26.safeMax=orb*1.38
    G26.player.x=cx2+orb;G26.player.y=cy2
    G26.player.vx=0;G26.player.vy=-Math.sqrt(G26.planet.mass/orb)
  }
  const W=cv.width,H=cv.height,pl=G26.planet,p=G26.player

  c.clearRect(0,0,W,H)
  // Canvases get no CSS variables, so read the theme directly
  const _lt = typeof qgLight === 'function' && qgLight()
  c.fillStyle=_lt?'#eef2fb':'#020610';c.fillRect(0,0,W,H)

  // stars
  c.fillStyle=_lt?'rgba(30,41,59,.28)':'rgba(255,255,255,.3)'
  for(let i=0;i<60;i++)c.fillRect((i*317+11)%W,(i*211+7)%H,1,1)

  c.save()
  if(G26.screenShake>0){const s=G26.screenShake*.5;c.translate((Math.random()-.5)*s,(Math.random()-.5)*s)}

  // safe zone rings
  c.beginPath();c.arc(pl.x,pl.y,G26.safeMin,0,Math.PI*2)
  c.strokeStyle='rgba(239,68,68,.25)';c.lineWidth=1.5;c.setLineDash([5,6]);c.stroke();c.setLineDash([])
  c.beginPath();c.arc(pl.x,pl.y,G26.safeMax,0,Math.PI*2)
  c.strokeStyle='rgba(239,68,68,.25)';c.lineWidth=1.5;c.setLineDash([5,6]);c.stroke();c.setLineDash([])
  // safe fill (very faint)
  c.beginPath();c.arc(pl.x,pl.y,G26.safeMax,0,Math.PI*2)
  c.arc(pl.x,pl.y,G26.safeMin,0,Math.PI*2,true)
  c.fillStyle=_lt?'rgba(34,197,94,.08)':'rgba(74,222,128,.04)';c.fill()

  // player trail
  for(let i=0;i<G26.trail.length-1;i++){
    const frac=i/G26.trail.length
    c.beginPath();c.arc(G26.trail[i].x,G26.trail[i].y,2*frac,0,Math.PI*2)
    c.globalAlpha=frac*.5;c.fillStyle='#22d3ee';c.fill()
  }
  c.globalAlpha=1

  // debris
  for(const db of G26.debris){
    c.beginPath();c.arc(db.x,db.y,db.r,0,Math.PI*2)
    c.fillStyle=`hsl(${db.hue},65%,50%)`;c.shadowColor=`hsl(${db.hue},80%,55%)`;c.shadowBlur=10;c.fill();c.shadowBlur=0
  }

  // planet
  const pg=c.createRadialGradient(pl.x-pl.r*.3,pl.y-pl.r*.3,3,pl.x,pl.y,pl.r)
  pg.addColorStop(0,'#f97316');pg.addColorStop(0.6,'#c2410c');pg.addColorStop(1,'#7c2d12')
  c.beginPath();c.arc(pl.x,pl.y,pl.r,0,Math.PI*2)
  c.fillStyle=pg;c.shadowColor='#f97316';c.shadowBlur=24;c.fill();c.shadowBlur=0
  // planet ring
  c.beginPath();c.ellipse(pl.x,pl.y,pl.r*1.7,pl.r*.35,0.3,0,Math.PI*2)
  c.strokeStyle='rgba(251,146,60,.5)';c.lineWidth=3;c.stroke()

  // particles
  for(const pt of G26.particles){c.globalAlpha=pt.life/40;c.beginPath();c.arc(pt.x,pt.y,pt.r,0,Math.PI*2);c.fillStyle=pt.color;c.fill()}
  c.globalAlpha=1

  // player moon
  const dist=g26Dist(p.x,p.y,pl.x,pl.y)
  const inSafe=dist>=G26.safeMin&&dist<=G26.safeMax
  const moonCol=p.thrustFlash>0?'#22d3ee':inSafe?(_lt?'#64748b':'#e2e8f0'):'#f87171'
  c.beginPath();c.arc(p.x,p.y,p.r,0,Math.PI*2)
  c.fillStyle=moonCol;c.shadowColor=moonCol;c.shadowBlur=inSafe?14:22;c.fill();c.shadowBlur=0
  c.beginPath();c.arc(p.x-p.r*.28,p.y-p.r*.28,p.r*.32,0,Math.PI*2)
  c.fillStyle='rgba(255,255,255,.3)';c.fill()

  // thrust line to mouse
  if(G26.thrustCooldown===0){
    c.strokeStyle='rgba(34,211,238,.25)';c.lineWidth=1;c.setLineDash([4,5])
    c.beginPath();c.moveTo(p.x,p.y);c.lineTo(g26Mouse.x,g26Mouse.y);c.stroke();c.setLineDash([])
  }

  // danger arc (how long until death)
  if(G26.dangerTimer>0&&!inSafe){
    const pct=G26.dangerTimer/180
    c.beginPath();c.arc(p.x,p.y,p.r+10,0,Math.PI*2*pct)
    c.strokeStyle=`rgba(239,68,68,${pct*.8})`;c.lineWidth=3;c.stroke()
  }

  c.restore()

  // HUD
  c.font='bold 22px monospace';c.textAlign='left';c.fillStyle=_lt?'#14152b':'#f1f5f9'
  c.shadowColor=_lt?'rgba(255,255,255,.8)':'#000';c.shadowBlur=4;c.fillText(G26.score.toLocaleString(),12,40);c.shadowBlur=0
  c.font='13px sans-serif';c.fillStyle=_lt?'#475569':'#94a3b8'
  const secs=Math.floor(G26.frameCount/60)
  c.fillText(`Time: ${secs}s  Dist: ${Math.floor(g26Dist(p.x,p.y,pl.x,pl.y))}px`,12,58)

  // cooldown bar
  if(G26.thrustCooldown>0){
    const pct=1-G26.thrustCooldown/22
    c.fillStyle=_lt?'rgba(0,0,0,.12)':'rgba(0,0,0,.4)';c.fillRect(W-70,H-22,62,8)
    c.fillStyle='#22d3ee';c.fillRect(W-70,H-22,62*pct,8)
    c.font='10px monospace';c.textAlign='center';c.fillStyle=_lt?'#475569':'#94a3b8'
    c.fillText('THRUST',W-39,H-26)
  }

  const uniqueMsgs=[...new Map(G26.msgs.map(m=>[m.text,m])).values()]
  let my=H/2-60
  for(const m of uniqueMsgs){
    c.globalAlpha=Math.min(1,m.frames/20)
    c.font=`bold ${m.big?20:14}px sans-serif`;c.textAlign='center'
    c.fillStyle=m.color;c.shadowColor=m.color;c.shadowBlur=8
    c.fillText(m.text,W/2,my);c.shadowBlur=0;my+=m.big?28:20
  }
  c.globalAlpha=1

  if(G26.frameCount<200){
    c.globalAlpha=Math.min(1,(200-G26.frameCount)/60)*.7
    c.font='13px sans-serif';c.textAlign='center';c.fillStyle='#7dd3fc'
    c.fillText('Click to fire thruster toward cursor — stay in the green orbit band!',W/2,H-16)
    c.globalAlpha=1
  }
}

function g26Loop(){
  g26Raf=requestAnimationFrame(g26Loop)
  if(!G26.active||!document.getElementById('game26').classList.contains('active')){cancelAnimationFrame(g26Raf);g26Raf=null;return}
  g26Update();g26Draw()
}

function g26Over(){
  SFX.die()
  G26.active=false;window._g26Score=G26.score
  document.getElementById('g26-final-score').textContent=G26.score.toLocaleString()
  const m=G26.score>=4000?'🥇 Gold':G26.score>=1500?'🥈 Silver':G26.score>=500?'🥉 Bronze':''
  document.getElementById('g26-medal').textContent=m
  document.getElementById('g26-over').classList.add('show')
}
