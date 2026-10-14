// ═══════════════════════════════════════════════════════
//  GAME 13 — PARTICLE COLLIDER
//  ←/→ or A/D = rotate aim | Space = fire
//  Particles bounce off circular wall; collide them for points
//  ESC = pause & shop
// ═══════════════════════════════════════════════════════

const G13_PU = {
  size:     { icon:'🔵', name:'Big Particles',   consumable:false, tiers:[
    { cost:60,  desc:'Radius +4 px' },
    { cost:150, desc:'Radius +8 px' },
    { cost:300, desc:'Radius +14 px' },
  ]},
  multi:    { icon:'🔱', name:'Multi-Shot',       consumable:false, tiers:[
    { cost:100, desc:'Fire 2 particles' },
    { cost:250, desc:'Fire 3 particles' },
    { cost:500, desc:'Fire 5 particles' },
  ]},
  attract:  { icon:'🧲', name:'Particle Magnet',  consumable:false, tiers:[
    { cost:150, desc:'Particles attract each other' },
    { cost:350, desc:'Strong attraction' },
  ]},
  shield:   { icon:'🛡️', name:'Shield',           consumable:false, tiers:[
    { cost:80,  desc:'1 free anti-particle hit' },
    { cost:200, desc:'3 free hits' },
    { cost:450, desc:'5 free hits' },
  ]},
  cooldown: { icon:'⚡', name:'Rapid Fire',        consumable:false, tiers:[
    { cost:120, desc:'Fire every 20 frames' },
    { cost:280, desc:'Fire every 12 frames' },
    { cost:600, desc:'Fire every 5 frames' },
  ]},
  antimatter:{ icon:'⚫', name:'Antimatter',       consumable:true,  tiers:[
    { cost:200, desc:'Next 5 shots score on any contact' },
  ]},
}
const G13_PU_KEYS = ['size','multi','attract','shield','cooldown','antimatter']

let G13 = {}
let g13Canvas, g13Ctx, g13Raf, g13KD, g13KU

function g13Reset() {
  G13 = {
    score:0, lives:3, shieldHP:0, active:false, paused:false,
    angle: -Math.PI/2,
    particles:[], antiParticles:[], sparks:[],
    frameCount:0, fireCD:0, lastCollision:0,
    combo:1, comboTimer:0,
    antimatterShots:0,
    puCoins:0,
    puLevels:{ size:0, multi:0, attract:0, shield:0, cooldown:0, antimatter:0 },
    keys:{},
    spawnTimer:0,
  }
}

async function initGame13() {
  g13Reset()
  document.getElementById('g13-over').classList.remove('show')
  document.getElementById('g13-pause').style.display = 'none'
  g13Canvas = document.getElementById('g13-canvas')
  g13Ctx = g13Canvas.getContext('2d')
  const arena = document.getElementById('g13-arena')
  g13Canvas.width  = arena.clientWidth  || 700
  g13Canvas.height = arena.clientHeight || 500
  setEntropyLive(false)
  await initCurby()
  g13Start()
}

function g13Start() {
  document.getElementById('g13-lives').textContent = '❤️❤️❤️'
  if (g13KD) document.removeEventListener('keydown', g13KD)
  if (g13KU) document.removeEventListener('keyup',   g13KU)
  g13KD = e => {
    G13.keys[e.code] = true
    if (e.code === 'Escape') { e.preventDefault(); g13TogglePause(); return }
    if (G13.paused || !G13.active) return
    if (e.code === 'Space') { e.preventDefault(); g13Fire() }
  }
  g13KU = e => { G13.keys[e.code] = false }
  document.addEventListener('keydown', g13KD)
  document.addEventListener('keyup',   g13KU)
  G13.active = true
  cancelAnimationFrame(g13Raf)
  g13Loop()
}

function g13Fire() {
  const cdLevels = [30, 20, 12, 5]
  if (G13.fireCD > 0) return
  SFX.shoot()
  G13.fireCD = cdLevels[G13.puLevels.cooldown] || 30
  const W = g13Canvas.width, H = g13Canvas.height
  const cx = W/2, cy = H/2
  const count = [1,2,3,5][G13.puLevels.multi] || 1
  const spread = count > 1 ? 0.18 : 0
  for (let i = 0; i < count; i++) {
    const angle = G13.angle + (i - (count-1)/2) * spread
    const isAnti = G13.antimatterShots > 0
    if (isAnti) G13.antimatterShots--
    G13.particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * 7,
      vy: Math.sin(angle) * 7,
      r: 7 + G13.puLevels.size * 4 + (G13.puLevels.size > 1 ? 2 : 0),
      life: 600, antimatter: isAnti, id: Math.random(), age: 0,
    })
  }
}

function g13Loop() {
  if (!G13.active) return
  g13Raf = requestAnimationFrame(g13Loop)
  if (G13.paused) return

  const W = g13Canvas.width, H = g13Canvas.height
  const ctx = g13Ctx
  const cx = W/2, cy = H/2
  const arenaR = Math.min(W,H)*0.43

  G13.frameCount++
  if (G13.fireCD > 0) G13.fireCD--

  // Rotate aim with keys
  const rotSpeed = 0.045
  if (G13.keys['ArrowLeft']  || G13.keys['KeyA']) G13.angle -= rotSpeed
  if (G13.keys['ArrowRight'] || G13.keys['KeyD']) G13.angle += rotSpeed

  // Combo decay
  if (G13.comboTimer > 0) G13.comboTimer--
  else G13.combo = 1

  // Spawn anti-particles
  G13.spawnTimer++
  const spawnInterval = Math.max(150, 400 - G13.frameCount / 40)
  if (G13.spawnTimer >= spawnInterval) {
    G13.spawnTimer = 0
    const a = Math.random() * Math.PI * 2
    const spd = 0.7 + Math.random() * 0.6
    G13.antiParticles.push({
      x: cx + Math.cos(a) * (arenaR - 10),
      y: cy + Math.sin(a) * (arenaR - 10),
      vx: Math.cos(a + Math.PI) * spd,
      vy: Math.sin(a + Math.PI) * spd,
      r: 10, life: 500,
    })
  }

  // Update particles — bounce off circle wall
  for (const p of G13.particles) {
    p.x += p.vx; p.y += p.vy; p.life--; p.age++

    // Attraction to other particles
    if (G13.puLevels.attract > 0) {
      const force = G13.puLevels.attract * 0.008
      for (const q of G13.particles) {
        if (q === p) continue
        const dx = q.x - p.x, dy = q.y - p.y
        const d = Math.hypot(dx, dy)
        if (d < 150 && d > 1) { p.vx += dx/d*force; p.vy += dy/d*force }
      }
    }

    const dx = p.x - cx, dy = p.y - cy
    const dist = Math.hypot(dx, dy)
    if (dist + p.r >= arenaR) {
      const nx = dx/dist, ny = dy/dist
      const dot = p.vx*nx + p.vy*ny
      p.vx -= 2*dot*nx
      p.vy -= 2*dot*ny
      p.x = cx + nx*(arenaR - p.r - 1)
      p.y = cy + ny*(arenaR - p.r - 1)
    }
  }

  // Update anti-particles
  for (const a of G13.antiParticles) {
    a.x += a.vx; a.y += a.vy; a.life--
    // Bounce
    const dx = a.x - cx, dy = a.y - cy
    const dist = Math.hypot(dx, dy)
    if (dist + a.r >= arenaR) {
      const nx = dx/dist, ny = dy/dist
      const dot = a.vx*nx + a.vy*ny
      a.vx -= 2*dot*nx; a.vy -= 2*dot*ny
      a.x = cx + nx*(arenaR - a.r - 1)
      a.y = cy + ny*(arenaR - a.r - 1)
    }
    // Any player particle destroys anti-particle (antimatter gives bonus points)
    G13.particles = G13.particles.filter(p => {
      if (Math.hypot(p.x-a.x, p.y-a.y) < p.r + a.r) {
        a.life = 0
        const pts = p.antimatter ? 40 * G13.combo : 15
        G13.score += pts
        G13.puCoins += p.antimatter ? 15 : 5
        g13Spark(p.x, p.y, p.antimatter ? '#f97316' : '#a78bfa', 10)
        G13.sparks.push({ x:p.x, y:p.y-20, text:'+'+pts, life:40, col: p.antimatter ? '#f97316' : '#a78bfa' })
        return false
      }
      return true
    })
  }

  // Anti-particle hits player area (center 20px)
  G13.antiParticles = G13.antiParticles.filter(a => {
    if (a.life <= 0) return false
    if (Math.hypot(a.x-cx, a.y-cy) < 20) {
      g13Hit()
      g13Spark(cx, cy, '#ef4444', 12)
      return false
    }
    return true
  })

  // Player particle collisions
  const alive = G13.particles.filter(p => p.life > 0)
  const toRemove = new Set()
  for (let i = 0; i < alive.length; i++) {
    for (let j = i+1; j < alive.length; j++) {
      const a = alive[i], b = alive[j]
      if (a.age > 20 && b.age > 20 && Math.hypot(a.x-b.x, a.y-b.y) < a.r + b.r) {
        toRemove.add(a); toRemove.add(b)
        SFX.hit()
        const pts = 50 * G13.combo
        G13.score += pts
        SFX.coin()
        G13.puCoins += 20
        G13.combo = Math.min(G13.combo + 1, 10)
        G13.comboTimer = 90
        g13Spark((a.x+b.x)/2, (a.y+b.y)/2, '#a78bfa', 16)
        // score popup
        G13.sparks.push({ x:(a.x+b.x)/2, y:(a.y+b.y)/2-20, text:'+'+pts, life:40, col:'#a78bfa' })
      }
    }
  }
  G13.particles = alive.filter(p => !toRemove.has(p) && p.life > 0)

  // Sparks
  for (const s of G13.sparks) { s.y -= 1.5; s.life-- }
  G13.sparks = G13.sparks.filter(s => s.life > 0)

  // Draw
  ctx.clearRect(0, 0, W, H)
  // Canvases get no CSS variables, so read the theme directly
  const _lt = typeof qgLight === 'function' && qgLight()
  ctx.fillStyle = _lt ? '#eceefa' : '#050510'
  ctx.fillRect(0, 0, W, H)

  // Arena circle
  ctx.beginPath()
  ctx.arc(cx, cy, arenaR, 0, Math.PI*2)
  ctx.fillStyle = _lt ? '#ffffff' : '#0d0d20'
  ctx.fill()
  ctx.strokeStyle = '#6366f1'
  ctx.lineWidth = 3
  ctx.shadowBlur = 12
  ctx.shadowColor = '#6366f1'
  ctx.stroke()
  ctx.shadowBlur = 0

  // Arena rings (decoration)
  for (let r = 60; r < arenaR; r += 60) {
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI*2)
    ctx.strokeStyle = _lt ? 'rgba(99,102,241,0.16)' : 'rgba(99,102,241,0.08)'
    ctx.lineWidth = 1
    ctx.stroke()
  }
  ctx.lineWidth = 1

  // Anti-particles
  for (const a of G13.antiParticles) {
    ctx.beginPath()
    ctx.arc(a.x, a.y, a.r, 0, Math.PI*2)
    ctx.fillStyle = '#1f2937'
    ctx.fill()
    ctx.strokeStyle = '#ef4444'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.lineWidth = 1
  }

  // Player particles
  for (const p of G13.particles) {
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.r, 0, Math.PI*2)
    const pg = ctx.createRadialGradient(p.x-p.r/3,p.y-p.r/3,1,p.x,p.y,p.r)
    pg.addColorStop(0, p.antimatter ? '#fed7aa' : '#e0e7ff')
    pg.addColorStop(1, p.antimatter ? '#f97316' : '#6366f1')
    ctx.fillStyle = pg
    ctx.fill()
    ctx.shadowBlur = 8
    ctx.shadowColor = p.antimatter ? '#f97316' : '#818cf8'
    ctx.strokeStyle = p.antimatter ? '#f97316' : '#a5b4fc'
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.shadowBlur = 0
    ctx.lineWidth = 1
  }

  // Sparks (text + particles via sparks array used for text)
  for (const s of G13.sparks) {
    if (s.text) {
      ctx.globalAlpha = s.life / 40
      ctx.fillStyle = s.col
      ctx.font = 'bold 16px monospace'
      ctx.textAlign = 'center'
      ctx.fillText(s.text, s.x, s.y)
      ctx.globalAlpha = 1
    } else {
      ctx.globalAlpha = s.life / 30
      ctx.beginPath()
      ctx.arc(s.x, s.y, 3, 0, Math.PI*2)
      ctx.fillStyle = s.col
      ctx.fill()
      ctx.globalAlpha = 1
    }
  }

  // Aim arrow
  const aimLen = 36
  const ax = cx + Math.cos(G13.angle) * 24
  const ay = cy + Math.sin(G13.angle) * 24
  ctx.strokeStyle = G13.antimatterShots > 0 ? '#f97316' : '#a78bfa'
  ctx.lineWidth = 2.5
  ctx.beginPath()
  ctx.moveTo(ax, ay)
  ctx.lineTo(cx + Math.cos(G13.angle)*(24+aimLen), cy + Math.sin(G13.angle)*(24+aimLen))
  ctx.stroke()
  ctx.lineWidth = 1

  // Center dot
  ctx.beginPath()
  ctx.arc(cx, cy, 6, 0, Math.PI*2)
  ctx.fillStyle = '#6366f1'
  ctx.fill()

  // HUD
  document.getElementById('g13-score-hud').textContent = G13.score
  document.getElementById('g13-combo-hud').textContent = G13.combo > 1 ? '×'+G13.combo : ''
  document.getElementById('g13-coins-hud').textContent = '🪙 ' + G13.puCoins
  document.getElementById('g13-ammo-hud').textContent  = G13.antimatterShots > 0 ? '⚫ ×'+G13.antimatterShots : ''
  ctx.textAlign = 'left'
}

function g13Spark(x, y, col, count) {
  for (let i = 0; i < count; i++)
    G13.sparks.push({ x, y, vx:(Math.random()-0.5)*6, vy:(Math.random()-0.5)*6, life:28, col })
}

function g13Hit() {
  if (G13.shieldHP > 0) { G13.shieldHP--; return }
  G13.lives--
  G13.combo = 1; G13.comboTimer = 0
  if (G13.lives <= 0) { endGame13(); return }
  document.getElementById('g13-lives').textContent = '❤️'.repeat(Math.max(0,G13.lives)) + '🖤'.repeat(Math.max(0,3-G13.lives))
}

function g13TogglePause() {
  if (!G13.active) return
  G13.paused = !G13.paused
  const p = document.getElementById('g13-pause')
  if (G13.paused) { p.style.display = 'flex'; setTimeout(() => g13RenderPause(), 0) }
  else p.style.display = 'none'
}

function g13RenderPause() {
  const cont = document.getElementById('g13-pu-list')
  cont.innerHTML = ''
  document.getElementById('g13-pause-coins').textContent = '🪙 ' + G13.puCoins
  for (const key of G13_PU_KEYS) {
    const pu = G13_PU[key]
    const lvl = G13.puLevels[key]
    const tier = pu.tiers[pu.consumable ? 0 : Math.min(lvl, pu.tiers.length-1)]
    const maxed = !pu.consumable && lvl >= pu.tiers.length
    const label = pu.consumable
      ? `${pu.icon} ${pu.name} (×${key==='antimatter'?G13.antimatterShots:0})`
      : `${pu.icon} ${pu.name} ${maxed?'(MAX)':`Lvl ${lvl}→${lvl+1}`}`
    const d = document.createElement('div')
    d.className = 'g13-pu-item'
    d.innerHTML = `<span>${label}</span><small style="color:var(--muted)">${maxed?'✓':tier.desc}</small><button class="btn-primary" style="font-size:.75rem;padding:.25rem .7rem" ${maxed||G13.puCoins<tier.cost?'disabled':''} onclick="g13BuyPU('${key}')">${maxed?'MAX':'🪙 '+tier.cost}</button>`
    cont.appendChild(d)
  }
}

window.g13BuyPU = function(key) {
  const pu = G13_PU[key]
  const lvl = G13.puLevels[key]
  if (!pu.consumable && lvl >= pu.tiers.length) return
  const tier = pu.tiers[pu.consumable ? 0 : lvl]
  if (G13.puCoins < tier.cost) return
  G13.puCoins -= tier.cost
  if (pu.consumable) {
    if (key === 'antimatter') G13.antimatterShots += 5
  } else {
    G13.puLevels[key]++
    if (key === 'shield') G13.shieldHP = [1,3,5][G13.puLevels.shield - 1] || 1
  }
  setTimeout(() => g13RenderPause(), 0)
}

function endGame13() {
  G13.active = false
  cancelAnimationFrame(g13Raf)
  if (g13KD) document.removeEventListener('keydown', g13KD)
  if (g13KU) document.removeEventListener('keyup',   g13KU)
  window._g13Score = G13.score
  document.getElementById('g13-final-score').textContent = G13.score
  renderMedalDisplay('g13-medal-display', 'collider', G13.score)
  document.getElementById('g13-over').classList.add('show')
}

window.g13EndGame = function() { document.getElementById('g13-pause').style.display='none'; G13.paused=false; endGame13() }
