// ═══════════════════════════════════════════════════════
//  GAME 15 — QUANTUM ENTANGLEMENT (v2)
//  Arrow keys = move you | twin mirrors horizontally
//  Space = break entanglement (independent WASD=twin, Arrows=you)
//  Collect BLUE orbs (yours) and PINK orbs (twin's)
//  ENTANGLED bonus: +×2 score multiplier while entangled
//  RESONANCE meter fills → triggers invincibility burst
//  SPECIAL orbs: ⭐ gold (×5pts)  🟢 green (reset break CD)  💜 purple (+1 life)
//  Hazards: normal (red), homing (orange), fast (yellow)
//  ESC = pause & shop
// ═══════════════════════════════════════════════════════

const G15_PU = {
  breakDur: { icon:'⚡', name:'Break Duration',  consumable:false, tiers:[
    { cost:80,  desc:'5s break duration' },
    { cost:200, desc:'8s break duration' },
    { cost:450, desc:'12s break duration' },
  ]},
  shield:   { icon:'🛡️', name:'Shield',           consumable:false, tiers:[
    { cost:70,  desc:'Absorb 1 hit' },
    { cost:180, desc:'Absorb 3 hits' },
    { cost:400, desc:'Absorb 5 hits' },
  ]},
  magnet:   { icon:'🧲', name:'Orb Magnet',        consumable:false, tiers:[
    { cost:100, desc:'Both attract orbs 80px' },
    { cost:260, desc:'Attract orbs 160px' },
  ]},
  speed:    { icon:'💨', name:'Speed Boost',        consumable:false, tiers:[
    { cost:90,  desc:'10% faster' },
    { cost:220, desc:'22% faster' },
    { cost:500, desc:'38% faster' },
  ]},
  resonance:{ icon:'🔮', name:'Resonance Boost',    consumable:false, tiers:[
    { cost:150, desc:'Resonance fills 30% faster' },
    { cost:350, desc:'Resonance fills 70% faster' },
  ]},
  ghost:    { icon:'👻', name:'Ghost',              consumable:true,  tiers:[
    { cost:150, desc:'5s invincibility for both' },
  ]},
}
const G15_PU_KEYS = ['breakDur','shield','magnet','speed','resonance','ghost']

let G15 = {}
let g15Canvas, g15Ctx, g15Raf, g15KD, g15KU

function g15Reset() {
  G15 = {
    score:0, lives:3, shieldHP:0, active:false, paused:false,
    px:0, py:0, pvx:0, pvy:0,
    tx:0, ty:0, tvx:0, tvy:0,
    broken:false, breakFrames:0, breakCD:0,
    maxBreak:180, breakCooldown:600,
    ghostFrames:0,
    resonance:0,  // 0-100, fills when collecting while entangled
    resonanceBurst:false, resonanceBurstFrames:0,
    orbs:[], hazards:[], particles:[],
    frameCount:0, spawnTimer:0, hazardTimer:0,
    combo:1, comboTimer:0,
    puCoins:0,
    puLevels:{ breakDur:0, shield:0, magnet:0, speed:0, resonance:0, ghost:0 },
    ghostStock:0,
    keys:{},
    wave:1, waveTimer:0,
    screenShake:0,
    beamCD:0, beamFlash:0, kills:0,
  }
}

// ── The link cuts ───────────────────────────────────────
// Until now the only answer to a hazard was to dodge it. The link
// already drawn between you and your twin is the obvious weapon: sweep
// it through an attacker and it dies.
//
// It costs nothing to fire and cannot be aimed freely, which is what
// keeps it fair — the twin mirrors you, so lining the link up means
// putting one of you somewhere you might not want to be. And it only
// exists while entangled, so breaking the link to dodge (Space) also
// disarms you. The trade-off was already in the game; this gives it
// teeth.
//
// After a cut it needs a moment to re-form, so it cannot simply hoover
// the screen. During a resonance burst that recharge is waived.
const G15_BEAM_CD    = 42   // frames before the link can cut again
const G15_BEAM_REACH = 13   // px from the curve that counts as a hit

// The link is drawn as a quadratic curve, so the hit test samples that
// same curve rather than the straight chord between the two. At the
// current bow (25px) the curve only ever departs from the chord by half
// that, which is inside the hit tolerance, so this does not change many
// outcomes today — it is here so the test still matches what is drawn if
// the bow is ever made deeper.
function g15BeamPoint(t, W, midY) {
  const u = 1 - t
  return {
    x: u*u*G15.px + 2*u*t*(W/2) + t*t*G15.tx,
    y: u*u*G15.py + 2*u*t*midY  + t*t*G15.ty,
  }
}

function g15BeamCut(W, midY) {
  if (G15.broken) return                       // no link, no weapon
  if (G15.beamCD > 0 && !G15.resonanceBurst) return

  // Sample the curve and take the closest approach to each hazard
  const pts = []
  for (let i = 0; i <= 14; i++) pts.push(g15BeamPoint(i/14, W, midY))

  for (const h of G15.hazards) {
    if (h.dead) continue
    let near = Infinity
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i-1], b = pts[i]
      const dx = b.x-a.x, dy = b.y-a.y
      const len2 = dx*dx + dy*dy
      // Project the hazard onto this segment, clamped to its ends
      let t = len2 ? ((h.x-a.x)*dx + (h.y-a.y)*dy) / len2 : 0
      t = Math.max(0, Math.min(1, t))
      const d = Math.hypot(h.x - (a.x + dx*t), h.y - (a.y + dy*t))
      if (d < near) near = d
    }
    if (near > G15_BEAM_REACH + h.r) continue

    h.dead = true
    G15.kills++
    // Worth less than an orb, so hunting never beats collecting — this
    // is relief from pressure, not a better way to score.
    const pts2 = 20 * G15.combo
    G15.score   += pts2
    G15.puCoins += Math.ceil(pts2 / 10)
    G15.resonance = Math.min(G15.resonance + 6, 100)
    if (G15.resonance >= 100 && !G15.resonanceBurst) g15TriggerResonance()
    G15.beamFlash = 10
    G15.screenShake = Math.max(G15.screenShake, 5)
    if (typeof SFX !== 'undefined') SFX.bounce()
    for (let i = 0; i < 10; i++)
      G15.particles.push({ x:h.x, y:h.y, vx:(Math.random()-.5)*7, vy:(Math.random()-1)*6,
                           life:26, col:'#c4b5fd' })
    if (!G15.resonanceBurst) { G15.beamCD = G15_BEAM_CD; break }
  }
}

async function initGame15() {
  g15Reset()
  document.getElementById('g15-over').classList.remove('show')
  document.getElementById('g15-pause').style.display = 'none'
  g15Canvas = document.getElementById('g15-canvas')
  g15Ctx = g15Canvas.getContext('2d')
  const arena = document.getElementById('g15-arena')
  g15Canvas.width  = arena.clientWidth  || 800
  g15Canvas.height = arena.clientHeight || 500
  setEntropyLive(false)
  await initCurby()
  g15Start()
}

function g15Start() {
  const W = g15Canvas.width, H = g15Canvas.height
  G15.px = W/4;   G15.py = H/2
  G15.tx = 3*W/4; G15.ty = H/2
  document.getElementById('g15-lives-hud').textContent = '❤️❤️❤️'
  if (g15KD) document.removeEventListener('keydown', g15KD)
  if (g15KU) document.removeEventListener('keyup',   g15KU)
  g15KD = e => {
    G15.keys[e.code] = true
    if (e.code === 'Escape') { e.preventDefault(); g15TogglePause(); return }
    if (G15.paused || !G15.active) return
    if (e.code === 'Space') { e.preventDefault(); g15BreakEntanglement() }
  }
  g15KU = e => { G15.keys[e.code] = false }
  document.addEventListener('keydown', g15KD)
  document.addEventListener('keyup',   g15KU)
  G15.active = true
  cancelAnimationFrame(g15Raf)
  g15Loop()
}

function g15BreakEntanglement() {
  if (G15.broken || G15.breakCD > 0) return
  SFX.whoosh()
  G15.broken = true; G15.breakFrames = 0
  G15.breakCD = G15.breakCooldown
}

function g15Loop() {
  if (!G15.active) return
  g15Raf = requestAnimationFrame(g15Loop)
  if (G15.paused) return

  const W = g15Canvas.width, H = g15Canvas.height
  const ctx = g15Ctx
  const spd = 3.5 * (1 + G15.puLevels.speed * 0.13)
  const friction = 0.80

  G15.frameCount++
  if (G15.screenShake > 0) G15.screenShake--

  // Break / cooldown
  if (G15.broken) {
    G15.breakFrames++
    const maxBreak = [180,300,480,720][G15.puLevels.breakDur] || 180
    if (G15.breakFrames >= maxBreak) G15.broken = false
  }
  if (G15.breakCD > 0) G15.breakCD--
  if (G15.ghostFrames > 0) G15.ghostFrames--

  // Resonance burst
  if (G15.resonanceBurst) {
    G15.resonanceBurstFrames--
    if (G15.resonanceBurstFrames <= 0) G15.resonanceBurst = false
  }

  // Combo decay
  if (G15.comboTimer > 0) G15.comboTimer--
  else G15.combo = 1

  // Wave scaling
  G15.waveTimer++
  if (G15.waveTimer >= 600) { G15.waveTimer = 0; G15.wave++ }

  // Movement
  let pdx=0,pdy=0,tdx=0,tdy=0
  if (G15.broken) {
    if (G15.keys['ArrowUp'])    pdy -= spd
    if (G15.keys['ArrowDown'])  pdy += spd
    if (G15.keys['ArrowLeft'])  pdx -= spd
    if (G15.keys['ArrowRight']) pdx += spd
    if (G15.keys['KeyW']) tdy -= spd
    if (G15.keys['KeyS']) tdy += spd
    if (G15.keys['KeyA']) tdx -= spd
    if (G15.keys['KeyD']) tdx += spd
  } else {
    if (G15.keys['ArrowUp'])    { pdy -= spd; tdy -= spd }
    if (G15.keys['ArrowDown'])  { pdy += spd; tdy += spd }
    if (G15.keys['ArrowLeft'])  { pdx -= spd; tdx += spd }
    if (G15.keys['ArrowRight']) { pdx += spd; tdx -= spd }
  }
  G15.pvx = (G15.pvx + pdx) * friction; G15.pvy = (G15.pvy + pdy) * friction
  G15.tvx = (G15.tvx + tdx) * friction; G15.tvy = (G15.tvy + tdy) * friction
  G15.px = Math.max(10, Math.min(W/2-10, G15.px + G15.pvx))
  G15.py = Math.max(10, Math.min(H-10,  G15.py + G15.pvy))
  G15.tx = Math.max(W/2+10, Math.min(W-10, G15.tx + G15.tvx))
  G15.ty = Math.max(10, Math.min(H-10,  G15.ty + G15.tvy))

  // Spawn orbs
  G15.spawnTimer++
  const spawnRate = Math.max(30, 55 - G15.wave * 2)
  if (G15.spawnTimer >= spawnRate) {
    G15.spawnTimer = 0
    const roll = qRandInt(10)
    if (roll < 1) {
      // Gold orb (rare)
      G15.orbs.push({ x:20+qRandInt(W/2-40), y:20+qRandInt(H-40), type:'gold', r:11 })
      G15.orbs.push({ x:W/2+20+qRandInt(W/2-40), y:20+qRandInt(H-40), type:'gold', r:11 })
    } else if (roll < 2) {
      // Green orb (restore break)
      G15.orbs.push({ x:20+qRandInt(W/2-40), y:20+qRandInt(H-40), type:'green', r:10 })
    } else if (roll < 3) {
      // Purple orb (+1 life)
      G15.orbs.push({ x:W/2+20+qRandInt(W/2-40), y:20+qRandInt(H-40), type:'purple', r:10 })
    } else {
      G15.orbs.push({ x:20+qRandInt(W/2-40),     y:20+qRandInt(H-40), type:'blue', r:9 })
      G15.orbs.push({ x:W/2+20+qRandInt(W/2-40), y:20+qRandInt(H-40), type:'pink', r:9 })
    }
  }

  // Spawn hazards
  G15.hazardTimer++
  const hazardRate = Math.max(35, 100 - G15.wave * 5)
  if (G15.hazardTimer >= hazardRate) {
    G15.hazardTimer = 0
    const side = qRandInt(4)
    const htype = qRandInt(3) === 0 ? (qRandInt(2) === 0 ? 'homing' : 'fast') : 'normal'
    const hspd = htype === 'fast' ? 5 : (htype === 'homing' ? 1.2 : 2)
    let hx, hy, hvx, hvy
    if (side===0) { hx=qRandInt(W); hy=-12; hvx=(Math.random()-.5)*2; hvy=hspd }
    else if(side===1) { hx=qRandInt(W); hy=H+12; hvx=(Math.random()-.5)*2; hvy=-hspd }
    else if(side===2) { hx=-12; hy=qRandInt(H); hvx=hspd; hvy=(Math.random()-.5)*2 }
    else { hx=W+12; hy=qRandInt(H); hvx=-hspd; hvy=(Math.random()-.5)*2 }
    G15.hazards.push({ x:hx,y:hy,vx:hvx,vy:hvy,r:htype==='fast'?7:11,type:htype,dead:false })
  }

  // Update hazards
  for (const h of G15.hazards) {
    if (h.type === 'homing') {
      // Home toward nearest particle
      const tgtX = Math.hypot(G15.px-h.x,G15.py-h.y) < Math.hypot(G15.tx-h.x,G15.ty-h.y) ? G15.px : G15.tx
      const tgtY = Math.hypot(G15.px-h.x,G15.py-h.y) < Math.hypot(G15.tx-h.x,G15.ty-h.y) ? G15.py : G15.ty
      const dx=tgtX-h.x, dy=tgtY-h.y, d=Math.hypot(dx,dy)
      if (d>1) { h.vx += dx/d*0.12; h.vy += dy/d*0.12 }
      const spd2=Math.hypot(h.vx,h.vy); if(spd2>2.5){h.vx=h.vx/spd2*2.5;h.vy=h.vy/spd2*2.5}
    }
    h.x += h.vx; h.y += h.vy
  }
  G15.hazards = G15.hazards.filter(h => !h.dead && h.x>-40&&h.x<W+40&&h.y>-40&&h.y<H+40)

  // Particles
  for (const p of G15.particles) { p.x+=p.vx; p.y+=p.vy; p.vy+=0.15; p.life-- }
  G15.particles = G15.particles.filter(p => p.life>0)

  const magR = [0,80,160][G15.puLevels.magnet]||0
  const ghost = G15.ghostFrames>0||G15.resonanceBurst

  // Orb collection
  G15.orbs = G15.orbs.filter(o => {
    if (o.col) return o.life-- > 0
    const dpd=Math.hypot(G15.px-o.x,G15.py-o.y)
    const dtd=Math.hypot(G15.tx-o.x,G15.ty-o.y)
    // Magnet
    if ((o.type==='blue'||o.type==='gold'||o.type==='green') && dpd<magR && dpd>1) { o.x+=(G15.px-o.x)/dpd*5; o.y+=(G15.py-o.y)/dpd*5 }
    if ((o.type==='pink'||o.type==='gold'||o.type==='purple') && dtd<magR && dtd>1) { o.x+=(G15.tx-o.x)/dtd*5; o.y+=(G15.ty-o.y)/dtd*5 }
    // Collect
    const pHit = dpd<16, tHit = dtd<16
    if ((o.type==='blue' && pHit)||(o.type==='pink' && tHit)||(o.type==='gold' && (pHit||tHit))||
        (o.type==='green' && pHit)||(o.type==='purple' && tHit)) {
      g15OrbCollect(o, pHit?G15.px:G15.tx, pHit?G15.py:G15.ty)
      return false
    }
    return true
  })

  // The link cuts anything it sweeps through, before hazards get to hit
  if (G15.beamCD > 0) G15.beamCD--
  if (G15.beamFlash > 0) G15.beamFlash--
  g15BeamCut(W, (G15.py + G15.ty) / 2 + Math.sin(G15.frameCount * 0.06) * 25)
  G15.hazards = G15.hazards.filter(h => !h.dead)

  // Hazard collision
  if (!ghost) {
    for (const h of G15.hazards) {
      const hitP = Math.hypot(G15.px-h.x,G15.py-h.y) < 14+h.r/2
      const hitT = Math.hypot(G15.tx-h.x,G15.ty-h.y) < 14+h.r/2
      if (hitP||hitT) {
        h.dead = true
        g15Hit(hitP?G15.px:G15.tx, hitP?G15.py:G15.ty)
        if (!G15.active) break
      }
    }
  }

  // ── Draw ────────────────────────────────────
  ctx.save()
  if (G15.screenShake > 0) {
    const s = G15.screenShake * 0.5
    ctx.translate((Math.random()-.5)*s, (Math.random()-.5)*s)
  }

  ctx.clearRect(-10,-10,W+20,H+20)
  ctx.fillStyle = '#07071a'
  ctx.fillRect(-10,-10,W+20,H+20)

  // Grid
  ctx.strokeStyle='rgba(139,92,246,0.05)'; ctx.lineWidth=1
  for(let x=0;x<W;x+=50){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke()}
  for(let y=0;y<H;y+=50){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}

  // Divider
  ctx.strokeStyle=G15.broken?'#ef4444':'rgba(139,92,246,0.5)'
  ctx.lineWidth=G15.broken?2:1.5; ctx.setLineDash(G15.broken?[6,4]:[])
  ctx.beginPath();ctx.moveTo(W/2,0);ctx.lineTo(W/2,H);ctx.stroke()
  ctx.setLineDash([])

  // Entanglement line (when not broken). It is also the weapon, so it has
  // to read at a glance as armed or re-forming — a thin dashed line means
  // sweeping a hazard will not kill it.
  if (!G15.broken) {
    const midY = (G15.py+G15.ty)/2+Math.sin(G15.frameCount*0.06)*25
    const armed = G15.beamCD <= 0 || G15.resonanceBurst
    const pulse = 0.3+0.2*Math.sin(G15.frameCount*0.08)
    if (G15.beamFlash > 0) {
      ctx.strokeStyle = `rgba(233,213,255,${0.55+0.45*(G15.beamFlash/10)})`
      ctx.lineWidth = 5
      ctx.shadowBlur = 16; ctx.shadowColor = '#a78bfa'
    } else if (armed) {
      ctx.strokeStyle = `rgba(167,139,250,${pulse+0.3})`
      ctx.lineWidth = 3
      ctx.shadowBlur = 8; ctx.shadowColor = 'rgba(167,139,250,0.7)'
    } else {
      // Re-forming: dim, thin and dashed
      ctx.strokeStyle = `rgba(139,92,246,${pulse*0.5})`
      ctx.lineWidth = 1.5
      ctx.setLineDash([4,6])
    }
    ctx.beginPath();ctx.moveTo(G15.px,G15.py);ctx.quadraticCurveTo(W/2,midY,G15.tx,G15.ty);ctx.stroke()
    ctx.setLineDash([]); ctx.shadowBlur = 0; ctx.lineWidth=1
  }

  // Labels
  ctx.font='10px monospace'; ctx.textAlign='center'
  ctx.fillStyle='rgba(99,102,241,0.4)'; ctx.fillText('YOU →',W/4,18)
  ctx.fillStyle='rgba(236,72,153,0.4)'; ctx.fillText('← TWIN',3*W/4,18)

  // Side labels for orb types
  ctx.fillStyle='rgba(59,130,246,0.3)'; ctx.font='9px monospace'
  ctx.fillText('BLUE ORBS',W/4,H-8)
  ctx.fillStyle='rgba(236,72,153,0.3)'
  ctx.fillText('PINK ORBS',3*W/4,H-8)
  ctx.textAlign='left'

  // Orbs
  for (const o of G15.orbs) {
    const col = o.type==='blue'?'#3b82f6':o.type==='pink'?'#ec4899':o.type==='gold'?'#fbbf24':o.type==='green'?'#22c55e':'#a78bfa'
    ctx.beginPath(); ctx.arc(o.x,o.y,o.r,0,Math.PI*2)
    ctx.fillStyle=col; ctx.fill()
    if(o.type==='gold'){ctx.shadowBlur=12;ctx.shadowColor='#fbbf24'}
    ctx.strokeStyle='rgba(255,255,255,0.4)'; ctx.lineWidth=1.5; ctx.stroke()
    ctx.shadowBlur=0; ctx.lineWidth=1
    // Type icon
    if(o.type==='gold'){ctx.fillStyle='#fff';ctx.font='8px sans-serif';ctx.textAlign='center';ctx.fillText('★',o.x,o.y+3);ctx.textAlign='left'}
    if(o.type==='green'){ctx.fillStyle='#fff';ctx.font='8px sans-serif';ctx.textAlign='center';ctx.fillText('⚡',o.x,o.y+3);ctx.textAlign='left'}
    if(o.type==='purple'){ctx.fillStyle='#fff';ctx.font='8px sans-serif';ctx.textAlign='center';ctx.fillText('♥',o.x,o.y+3);ctx.textAlign='left'}
  }

  // Hazards
  for (const h of G15.hazards) {
    const col=h.type==='homing'?'#f97316':h.type==='fast'?'#fbbf24':'#dc2626'
    ctx.beginPath(); ctx.arc(h.x,h.y,h.r,0,Math.PI*2)
    ctx.fillStyle=col; ctx.fill()
    ctx.shadowBlur=10; ctx.shadowColor=col
    ctx.strokeStyle='rgba(255,255,255,0.3)'; ctx.lineWidth=1.5; ctx.stroke()
    ctx.shadowBlur=0; ctx.lineWidth=1
    // Homing indicator
    if(h.type==='homing'){ctx.fillStyle='rgba(255,255,255,0.5)';ctx.font='9px sans-serif';ctx.textAlign='center';ctx.fillText('◎',h.x,h.y+3);ctx.textAlign='left'}
  }

  // Particles
  for (const p of G15.particles) {
    ctx.globalAlpha=p.life/30; ctx.beginPath(); ctx.arc(p.x,p.y,3,0,Math.PI*2)
    ctx.fillStyle=p.col; ctx.fill()
  }
  ctx.globalAlpha=1

  // Resonance burst glow
  if (G15.resonanceBurst) {
    const a = G15.resonanceBurstFrames/180*0.25
    ctx.fillStyle=`rgba(139,92,246,${a})`
    ctx.fillRect(0,0,W,H)
  }

  const pAlpha = (ghost?0.35+0.45*Math.abs(Math.sin(G15.frameCount*0.22)):1)

  // Player (blue dot)
  ctx.globalAlpha=pAlpha
  ctx.beginPath(); ctx.arc(G15.px,G15.py,13,0,Math.PI*2)
  ctx.fillStyle='#3b82f6'; ctx.fill()
  ctx.shadowBlur=G15.shieldHP>0?18:7; ctx.shadowColor='#60a5fa'
  ctx.strokeStyle='#93c5fd'; ctx.lineWidth=2; ctx.stroke()
  ctx.shadowBlur=0; ctx.lineWidth=1; ctx.globalAlpha=1

  // Twin (pink dot)
  ctx.globalAlpha=pAlpha
  ctx.beginPath(); ctx.arc(G15.tx,G15.ty,13,0,Math.PI*2)
  ctx.fillStyle='#ec4899'; ctx.fill()
  ctx.shadowBlur=G15.shieldHP>0?18:7; ctx.shadowColor='#f9a8d4'
  ctx.strokeStyle='#f9a8d4'; ctx.lineWidth=2; ctx.stroke()
  ctx.shadowBlur=0; ctx.lineWidth=1; ctx.globalAlpha=1

  // Break cooldown bar
  const bBarW=160, bBarX=W/2-bBarW/2
  ctx.fillStyle='rgba(255,255,255,0.06)'; ctx.fillRect(bBarX,H-14,bBarW,5)
  if (G15.broken) {
    const maxB=[180,300,480,720][G15.puLevels.breakDur]||180
    ctx.fillStyle='#f97316'; ctx.fillRect(bBarX,H-14,bBarW*(1-G15.breakFrames/maxB),5)
  } else if (G15.breakCD>0) {
    ctx.fillStyle='rgba(99,102,241,0.5)'; ctx.fillRect(bBarX,H-14,bBarW*(1-G15.breakCD/G15.breakCooldown),5)
  } else {
    ctx.fillStyle='#22d3ee'; ctx.fillRect(bBarX,H-14,bBarW,5)
  }

  // Resonance bar
  const resW=120, resX=W/2-resW/2
  ctx.fillStyle='rgba(255,255,255,0.06)'; ctx.fillRect(resX,H-24,resW,5)
  const resCol = G15.resonance>=100?'#a78bfa':'rgba(139,92,246,0.7)'
  ctx.fillStyle=resCol; ctx.fillRect(resX,H-24,resW*Math.min(G15.resonance/100,1),5)
  if(G15.resonance>=100&&!G15.resonanceBurst){ctx.fillStyle='#c4b5fd';ctx.font='9px monospace';ctx.textAlign='center';ctx.fillText('RESONANCE READY! collect orb',W/2,H-28);ctx.textAlign='left'}

  ctx.restore()

  // HUD
  document.getElementById('g15-score-hud').textContent = G15.score
  document.getElementById('g15-combo-hud').textContent = G15.combo>1?'×'+G15.combo:''
  document.getElementById('g15-coins-hud').textContent = '🪙 '+G15.puCoins
  const statusEl = document.getElementById('g15-status-hud')
  if (statusEl) statusEl.textContent = G15.broken?'🔴 BROKEN':'🟢 ENTANGLED ×2'
  const ghostEl = document.getElementById('g15-ghost-hud')
  if (ghostEl) ghostEl.textContent = G15.ghostStock>0?'👻×'+G15.ghostStock:''
}

function g15OrbCollect(o, cx, cy) {
  SFX.coin()
  let pts = 25
  if (o.type==='gold') pts = 125
  const entBonus = !G15.broken ? 2 : 1
  G15.combo = Math.min(G15.combo+1, 10); G15.comboTimer=90
  pts = pts * G15.combo * entBonus
  G15.score   += pts
  G15.puCoins += Math.ceil(pts / 10)

  // Special effects
  if (o.type==='green') { G15.breakCD=0 }
  if (o.type==='purple') {
    G15.lives = Math.min(G15.lives+1, 5)
    document.getElementById('g15-lives-hud').textContent = '❤️'.repeat(Math.max(0,G15.lives))+'🖤'.repeat(Math.max(0,3-Math.max(0,G15.lives-3)))
  }

  // Resonance (only when entangled)
  if (!G15.broken) {
    const resFill = [15, 19.5, 25.5][G15.puLevels.resonance-1] || 15
    G15.resonance = Math.min(G15.resonance + resFill, 100)
    if (G15.resonance >= 100 && !G15.resonanceBurst) g15TriggerResonance()
  }

  // Screen flash for gold
  if (o.type==='gold') G15.screenShake = 8

  for (let i=0;i<8;i++)
    G15.particles.push({x:cx,y:cy,vx:(Math.random()-.5)*6,vy:-Math.random()*5,life:28,
      col:o.type==='blue'?'#60a5fa':o.type==='pink'?'#f9a8d4':o.type==='gold'?'#fef08a':'#86efac'})
}

function g15TriggerResonance() {
  G15.resonanceBurst = true
  G15.resonanceBurstFrames = 180
  G15.ghostFrames = 180
  G15.resonance = 0
  // Big score bonus
  G15.score += 500 * G15.wave
  G15.puCoins += 50
  for (let i=0;i<20;i++)
    G15.particles.push({x:G15.px+(Math.random()-.5)*60,y:G15.py+(Math.random()-.5)*60,
      vx:(Math.random()-.5)*8,vy:-Math.random()*6,life:40,col:'#a78bfa'})
  G15.screenShake = 15
}

function g15Hit(hx, hy) {
  if (G15.ghostFrames>0||G15.resonanceBurst) return
  if (G15.shieldHP>0) { G15.shieldHP--; G15.ghostFrames=60; return }
  G15.lives--; G15.combo=1; G15.comboTimer=0; G15.screenShake=20
  for (let i=0;i<16;i++)
    G15.particles.push({x:hx,y:hy,vx:(Math.random()-.5)*9,vy:(Math.random()-1)*7,life:38,col:'#ef4444'})
  if (G15.lives<=0) { endGame15(); return }
  G15.ghostFrames=120
  document.getElementById('g15-lives-hud').textContent='❤️'.repeat(Math.max(0,G15.lives))+'🖤'.repeat(Math.max(0,3-G15.lives))
}

function g15TogglePause() {
  if (!G15.active) return
  G15.paused=!G15.paused
  const p=document.getElementById('g15-pause')
  if(G15.paused){p.style.display='flex';setTimeout(()=>g15RenderPause(),0)}
  else p.style.display='none'
}

function g15RenderPause() {
  const cont=document.getElementById('g15-pu-list')
  cont.innerHTML=''
  document.getElementById('g15-pause-coins').textContent='🪙 '+G15.puCoins
  for (const key of G15_PU_KEYS) {
    const pu=G15_PU[key]; const lvl=G15.puLevels[key]
    const tier=pu.tiers[pu.consumable?0:Math.min(lvl,pu.tiers.length-1)]
    const maxed=!pu.consumable&&lvl>=pu.tiers.length
    const stockStr=key==='ghost'?` (×${G15.ghostStock})`:''
    const label=`${pu.icon} ${pu.name}${stockStr} ${maxed?'(MAX)':pu.consumable?'':`Lvl ${lvl}→${lvl+1}`}`
    const d=document.createElement('div'); d.className='g15-pu-item'
    d.innerHTML=`<span>${label}</span><small style="color:var(--muted)">${maxed?'✓':tier.desc}</small><button class="btn-primary" style="font-size:.75rem;padding:.25rem .7rem" ${maxed||G15.puCoins<tier.cost?'disabled':''} onclick="g15BuyPU('${key}')">${maxed?'MAX':'🪙 '+tier.cost}</button>`
    cont.appendChild(d)
  }
}

window.g15BuyPU = function(key) {
  const pu=G15_PU[key]; const lvl=G15.puLevels[key]
  if(!pu.consumable&&lvl>=pu.tiers.length)return
  const tier=pu.tiers[pu.consumable?0:lvl]
  if(G15.puCoins<tier.cost)return
  G15.puCoins-=tier.cost
  if(pu.consumable){if(key==='ghost'){G15.ghostStock++;G15.ghostFrames=300}}
  else{G15.puLevels[key]++;if(key==='shield')G15.shieldHP=[1,3,5][G15.puLevels.shield-1]||1}
  setTimeout(()=>g15RenderPause(),0)
}

function endGame15() {
  SFX.die()
  G15.active=false; cancelAnimationFrame(g15Raf)
  if(g15KD)document.removeEventListener('keydown',g15KD)
  if(g15KU)document.removeEventListener('keyup',g15KU)
  window._g15Score=G15.score
  document.getElementById('g15-final-score').textContent=G15.score
  renderMedalDisplay('g15-medal-display','entanglement',G15.score)
  document.getElementById('g15-over').classList.add('show')
}

window.g15EndGame = function() { document.getElementById('g15-pause').style.display='none'; G15.paused=false; endGame15() }
