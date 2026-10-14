// ═══════════════════════════════════════════════════════
//  GAME 45 — QUANTUM FREIGHTER (co-op)
//  One ship, two jobs. The PILOT flies (WASD), the GUNNER
//  aims and fires (mouse). Neither can do the other's job,
//  so surviving means talking to each other.
//
//  Online is host-authoritative: the host simulates the whole
//  world and ships state to the joiner, who sends only input.
//  Nothing is simulated twice, so the two screens cannot drift.
// ═══════════════════════════════════════════════════════

const G45_SHIP_R   = 16
const G45_HULL_MAX = 3
const G45_FIRE_CD  = 0.16   // seconds between shots
const G45_BULLET_V = 560

const G45 = {
  active:false, phase:'idle',
  ship:{ x:0, y:0, vx:0, vy:0 },
  turret:{ ang:-Math.PI/2, cool:0 },
  bullets:[], enemies:[], parts:[], stars:[],
  hull:G45_HULL_MAX, score:0, wave:1,
  spawnT:0, spawnGap:1.6,
  shake:0, hurtFlash:0, deadT:0, showOver:false,
  keys:{}, aim:{ x:0, y:0, firing:false },
  mode:'local',          // 'local' | 'online'
  role:'both',           // 'pilot' | 'gunner' | 'both'
  raf:null, lastTime:0, netT:0,
}
window._g45Score = 0

let G45_room = null, G45_isHost = false

let _g45Cvs = null
function _g45C() {
  if (!_g45Cvs) _g45Cvs = document.getElementById('g45-canvas')
  return _g45Cvs
}

async function initGame45() {
  stopGame45(); _g45Cvs = null
  document.getElementById('g45-overlay').style.display = 'flex'
  document.getElementById('g45-over').style.display    = 'none'
  _g45SetRoleLabel('')
  await initCurby()
}
window.initGame45 = initGame45

window.stopGame45 = function() {
  G45.active = false
  if (G45.raf) { cancelAnimationFrame(G45.raf); G45.raf = null }
  const c = _g45C()
  if (c) {
    c.removeEventListener('mousemove',  _g45Move)
    c.removeEventListener('mousedown',  _g45Down)
    c.removeEventListener('mouseup',    _g45Up)
    c.removeEventListener('touchstart', _g45Touch, {passive:false})
    c.removeEventListener('touchmove',  _g45Touch, {passive:false})
    c.removeEventListener('touchend',   _g45Up)
  }
  window.removeEventListener('keydown', _g45KeyDn)
  window.removeEventListener('keyup',   _g45KeyUp)
  if (G45_room) {
    const s = mpGetSocket()
    s.off('opponent-state'); s.off('force-end')
    G45_room = null; G45_isHost = false
  }
}

function _g45SetRoleLabel(t) {
  const el = document.getElementById('g45-role')
  if (el) el.textContent = t
}

// ── Start ─────────────────────────────────────────────

function _g45Start(mode, role) {
  SFX.resume(); SFX.click()
  const c = _g45C()
  c.width  = c.parentElement.clientWidth
  c.height = c.parentElement.clientHeight
  document.getElementById('g45-overlay').style.display = 'none'
  document.getElementById('g45-over').style.display    = 'none'

  const stars = []
  for (let i = 0; i < 70; i++) {
    stars.push({ x:Math.random()*c.width, y:Math.random()*c.height,
                 z:0.3 + Math.random()*0.8, r:Math.random()*1.4 + 0.3 })
  }

  Object.assign(G45, {
    active:true, phase:'playing',
    ship:{ x:c.width/2, y:c.height/2, vx:0, vy:0 },
    turret:{ ang:-Math.PI/2, cool:0 },
    bullets:[], enemies:[], parts:[], stars,
    hull:G45_HULL_MAX, score:0, wave:1,
    spawnT:0, spawnGap:1.6,
    shake:0, hurtFlash:0, deadT:0, showOver:false,
    keys:{}, aim:{ x:c.width/2, y:c.height/2 - 100, firing:false },
    mode, role, netT:0,
  })
  window._g45Score = 0
  _g45Hud()
  _g45SetRoleLabel(role === 'pilot' ? '🕹 You are the PILOT — WASD to fly'
                 : role === 'gunner' ? '🎯 You are the GUNNER — mouse to aim, hold to fire'
                 : '')

  window.addEventListener('keydown', _g45KeyDn)
  window.addEventListener('keyup',   _g45KeyUp)
  c.addEventListener('mousemove',  _g45Move)
  c.addEventListener('mousedown',  _g45Down)
  c.addEventListener('mouseup',    _g45Up)
  c.addEventListener('touchstart', _g45Touch, {passive:false})
  c.addEventListener('touchmove',  _g45Touch, {passive:false})
  c.addEventListener('touchend',   _g45Up)

  G45.lastTime = performance.now()
  G45.raf = requestAnimationFrame(_g45Loop)
}

window.startFreighterLocal = function() { G45_room = null; _g45Start('local', 'both') }

// ── Online ────────────────────────────────────────────

window.g45FindMatch = function() {
  const statusEl = document.getElementById('g45-match-status')
  const btnEl    = document.getElementById('g45-match-btn')
  window['mp_findMatch_freighter'] = window.g45FindMatch
  mpFindMatch('freighter', {
    onMatched: ({ code, isHost }) => {
      G45_room = code; G45_isHost = isHost
      _g45NetEvents()
      // Host flies, joiner shoots. Host is also the simulation authority.
      _g45Start('online', isHost ? 'pilot' : 'gunner')
    },
    onLeft: () => {
      G45_room = null; G45_isHost = false
      if (!G45.active) document.getElementById('g45-overlay').style.display = 'flex'
    },
    statusEl, btnEl,
  })
}

function _g45NetEvents() {
  const sock = mpGetSocket()
  sock.off('opponent-state'); sock.off('force-end')
  sock.on('opponent-state', (s) => {
    if (G45_isHost) {
      // Gunner's input; the host owns everything else.
      if (typeof s.ang === 'number') G45.turret.ang = s.ang
      G45.aim.firing = !!s.firing
    } else {
      _g45ApplyWorld(s)
    }
  })
  sock.on('force-end', () => { if (G45.phase === 'playing') _g45Die() })
}

// Host -> joiner: the whole world, normalised to 0-1 so the two
// canvases can differ in size without shifting anything.
function _g45World(w, h) {
  return {
    sx:G45.ship.x/w, sy:G45.ship.y/h, ang:G45.turret.ang,
    hull:G45.hull, score:G45.score, wave:G45.wave, phase:G45.phase,
    b:G45.bullets.map(b => [ +(b.x/w).toFixed(4), +(b.y/h).toFixed(4) ]),
    e:G45.enemies.map(e => [ +(e.x/w).toFixed(4), +(e.y/h).toFixed(4),
                             +(e.r).toFixed(1), e.hp ]),
  }
}

function _g45ApplyWorld(s) {
  const c = _g45C(); if (!c) return
  const w = c.width, h = c.height
  if (typeof s.sx === 'number') { G45.ship.x = s.sx*w; G45.ship.y = s.sy*h }
  if (typeof s.ang === 'number') G45.turret.ang = s.ang
  if (typeof s.hull === 'number') {
    if (s.hull < G45.hull) { G45.shake = 1; G45.hurtFlash = 0.4; SFX.hit() }
    G45.hull = s.hull
  }
  if (typeof s.score === 'number' && s.score !== G45.score) {
    G45.score = s.score; window._g45Score = s.score; _g45Hud()
  }
  if (typeof s.wave === 'number') G45.wave = s.wave
  if (Array.isArray(s.b)) G45.bullets = s.b.map(([x,y]) => ({ x:x*w, y:y*h }))
  if (Array.isArray(s.e)) G45.enemies = s.e.map(([x,y,r,hp]) => ({ x:x*w, y:y*h, r, hp }))
}

// ── Input ─────────────────────────────────────────────

function _g45KeyDn(e) {
  if ([32,37,38,39,40].includes(e.keyCode)) e.preventDefault()
  G45.keys[e.key.toLowerCase()] = true
}
function _g45KeyUp(e) { G45.keys[e.key.toLowerCase()] = false }

function _g45AimAt(cx, cy) {
  const c = _g45C(); if (!c) return
  const r = c.getBoundingClientRect()
  G45.aim.x = (cx - r.left) * (c.width / r.width)
  G45.aim.y = (cy - r.top)  * (c.height / r.height)
}
function _g45Move(e) { _g45AimAt(e.clientX, e.clientY) }
function _g45Down(e) { e.preventDefault(); _g45AimAt(e.clientX, e.clientY); G45.aim.firing = true }
function _g45Up()    { G45.aim.firing = false }
function _g45Touch(e) {
  e.preventDefault()
  const t = e.touches[0]; if (!t) return
  _g45AimAt(t.clientX, t.clientY); G45.aim.firing = true
}

// Does this client drive the ship?
function _g45CanPilot() { return G45.role === 'both' || G45.role === 'pilot' }
// Does this client drive the turret?
function _g45CanGun()   { return G45.role === 'both' || G45.role === 'gunner' }

// ── Simulation ────────────────────────────────────────

function _g45SpawnEnemy(w, h) {
  // Pick an edge, aim roughly at the ship
  const side = qRandInt(4)
  let x, y
  if      (side === 0) { x = -30;    y = qRandInt(h) }
  else if (side === 1) { x = w + 30; y = qRandInt(h) }
  else if (side === 2) { x = qRandInt(w); y = -30 }
  else                 { x = qRandInt(w); y = h + 30 }
  const spread = (qRandInt(120) - 60)
  const tx = G45.ship.x + spread, ty = G45.ship.y + spread
  const a  = Math.atan2(ty - y, tx - x)
  const sp = 52 + G45.wave * 7 + qRandInt(30)
  const big = qRandInt(4) === 0
  G45.enemies.push({
    x, y, vx:Math.cos(a)*sp, vy:Math.sin(a)*sp,
    r: big ? 26 : 16, hp: big ? 3 : 1, spin: (qRandInt(100)-50)/60,
    rot: qRandInt(628)/100,
  })
}

function _g45Burst(x, y, col, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 180
    G45.parts.push({ x, y, vx:Math.cos(a)*s, vy:Math.sin(a)*s, life:0.5, col })
  }
}

function _g45Sim(dt, w, h) {
  // Only the authority simulates. Joiners render host state, and their
  // copies of bullets/enemies carry no velocity, so running this there
  // would turn positions into NaN. Guard it here rather than relying on
  // the caller to take the right branch.
  if (G45_room && !G45_isHost) return

  const S = G45.ship

  // ── Pilot ──
  if (_g45CanPilot()) {
    const k = G45.keys
    let ax = 0, ay = 0
    if (k['a'] || k['arrowleft'])  ax -= 1
    if (k['d'] || k['arrowright']) ax += 1
    if (k['w'] || k['arrowup'])    ay -= 1
    if (k['s'] || k['arrowdown'])  ay += 1
    const m = Math.hypot(ax, ay) || 1
    S.vx += (ax/m) * 900 * dt
    S.vy += (ay/m) * 900 * dt
  }
  S.vx *= Math.pow(0.0016, dt); S.vy *= Math.pow(0.0016, dt)
  S.x = Math.max(G45_SHIP_R, Math.min(w - G45_SHIP_R, S.x + S.vx * dt))
  S.y = Math.max(G45_SHIP_R, Math.min(h - G45_SHIP_R, S.y + S.vy * dt))

  // ── Gunner ──
  if (_g45CanGun()) {
    G45.turret.ang = Math.atan2(G45.aim.y - S.y, G45.aim.x - S.x)
  }
  G45.turret.cool -= dt
  // Reached only by the authority, so an online gunner's `firing` flag
  // arrives over the wire and the host spawns the bullet.
  if (G45.aim.firing && G45.turret.cool <= 0) _g45Fire()

  // ── Bullets ──
  for (const b of G45.bullets) { b.x += b.vx * dt; b.y += b.vy * dt }
  G45.bullets = G45.bullets.filter(b => b.x > -20 && b.x < w+20 && b.y > -20 && b.y < h+20)

  // ── Enemies ──
  G45.spawnT += dt
  if (G45.spawnT >= G45.spawnGap) {
    G45.spawnT = 0
    _g45SpawnEnemy(w, h)
    if (G45.wave >= 4 && qRandInt(3) === 0) _g45SpawnEnemy(w, h)
  }
  for (const e of G45.enemies) {
    e.x += e.vx * dt; e.y += e.vy * dt; e.rot += e.spin * dt
    // gentle homing so they can't be simply outrun
    const a = Math.atan2(S.y - e.y, S.x - e.x)
    e.vx += Math.cos(a) * 26 * dt
    e.vy += Math.sin(a) * 26 * dt
  }
  G45.enemies = G45.enemies.filter(e =>
    e.x > -80 && e.x < w+80 && e.y > -80 && e.y < h+80)

  // ── Bullet vs enemy ──
  for (let i = G45.enemies.length - 1; i >= 0; i--) {
    const e = G45.enemies[i]
    for (let j = G45.bullets.length - 1; j >= 0; j--) {
      const b = G45.bullets[j]
      if (Math.hypot(b.x - e.x, b.y - e.y) > e.r + 3) continue
      G45.bullets.splice(j, 1)
      e.hp--
      _g45Burst(b.x, b.y, '#fbbf24', 5)
      if (e.hp <= 0) {
        _g45Burst(e.x, e.y, '#f472b6', 16)
        G45.enemies.splice(i, 1)
        G45.score++; window._g45Score = G45.score; _g45Hud()
        SFX.coin()
        const nw = 1 + Math.floor(G45.score / 8)
        if (nw > G45.wave) { G45.wave = nw; G45.spawnGap = Math.max(0.42, 1.6 - nw*0.13) }
      } else SFX.hit()
      break
    }
  }

  // ── Enemy vs ship ──
  for (let i = G45.enemies.length - 1; i >= 0; i--) {
    const e = G45.enemies[i]
    if (Math.hypot(e.x - S.x, e.y - S.y) > e.r + G45_SHIP_R) continue
    G45.enemies.splice(i, 1)
    _g45Burst(e.x, e.y, '#ef4444', 20)
    G45.hull--; G45.shake = 1; G45.hurtFlash = 0.5
    SFX.hit(); _g45Hud()
    if (G45.hull <= 0) { _g45Die(); return }
  }

  // ── Particles ──
  for (const p of G45.parts) {
    p.x += p.vx * dt; p.y += p.vy * dt
    p.vx *= 0.92; p.vy *= 0.92; p.life -= dt
  }
  G45.parts = G45.parts.filter(p => p.life > 0)
}

function _g45Fire() {
  const S = G45.ship, a = G45.turret.ang
  G45.turret.cool = G45_FIRE_CD
  G45.bullets.push({
    x:S.x + Math.cos(a)*(G45_SHIP_R+10), y:S.y + Math.sin(a)*(G45_SHIP_R+10),
    vx:Math.cos(a)*G45_BULLET_V, vy:Math.sin(a)*G45_BULLET_V,
  })
  SFX.shoot()
}

function _g45Hud() {
  const s = document.getElementById('g45-score-hud')
  if (s) s.textContent = G45.score
  const hl = document.getElementById('g45-hull')
  if (hl) hl.textContent = '❤'.repeat(Math.max(0, G45.hull)) + '·'.repeat(Math.max(0, G45_HULL_MAX - G45.hull))
}

function _g45Die() {
  if (G45.phase === 'dead') return
  G45.phase = 'dead'; G45.deadT = 0; G45.shake = 1.4
  SFX.die()
  _g45Burst(G45.ship.x, G45.ship.y, '#22d3ee', 40)
  if (G45_room && G45_isHost) {
    mpGetSocket().emit('player-died', { code:G45_room, score:G45.score })
  }
}

// ── Loop ──────────────────────────────────────────────

function _g45Loop(ts) {
  if (!G45.active) return
  const dt = Math.min((ts - G45.lastTime) / 1000, 0.05)
  G45.lastTime = ts
  const c = _g45C(), w = c.width, h = c.height

  if (G45.shake > 0)     G45.shake     = Math.max(0, G45.shake - dt*3)
  if (G45.hurtFlash > 0) G45.hurtFlash = Math.max(0, G45.hurtFlash - dt*2)

  const authority = !G45_room || G45_isHost

  if (G45.phase === 'playing') {
    if (authority) _g45Sim(dt, w, h)
    else {
      // Joiner: aim locally for a responsive crosshair, everything
      // else arrives from the host.
      if (_g45CanGun()) G45.turret.ang = Math.atan2(G45.aim.y - G45.ship.y, G45.aim.x - G45.ship.x)
      for (const p of G45.parts) { p.x += p.vx*dt; p.y += p.vy*dt; p.vx*=0.92; p.vy*=0.92; p.life -= dt }
      G45.parts = G45.parts.filter(p => p.life > 0)
    }

    // Net sync ~20/sec
    if (G45_room) {
      G45.netT += dt
      if (G45.netT >= 0.05) {
        G45.netT = 0
        const sock = mpGetSocket()
        if (G45_isHost) sock.emit('state-sync', { code:G45_room, state:_g45World(w, h) })
        else            sock.emit('state-sync', { code:G45_room, state:{ ang:G45.turret.ang, firing:G45.aim.firing } })
      }
    }

  } else if (G45.phase === 'dead') {
    G45.deadT += dt
    for (const p of G45.parts) { p.x += p.vx*dt; p.y += p.vy*dt; p.vx*=0.92; p.vy*=0.92; p.life -= dt }
    G45.parts = G45.parts.filter(p => p.life > 0)
    if (G45.deadT >= 1.5 && !G45.showOver) {
      G45.showOver = true
      window._g45Score = G45.score
      document.getElementById('g45-final-score').textContent = `${G45.score} destroyed`
      document.getElementById('g45-over').style.display = 'flex'
    }
  }

  _g45Draw(c.getContext('2d'), w, h)
  if (G45.showOver) { G45.active = false; return }
  G45.raf = requestAnimationFrame(_g45Loop)
}

// ── Draw ──────────────────────────────────────────────

function _g45Draw(ctx, w, h) {
  ctx.save()
  if (G45.shake > 0) {
    const s = G45.shake * 9
    ctx.translate((Math.random()-0.5)*s, (Math.random()-0.5)*s)
  }

  // Canvases get no CSS variables, so read the theme directly
  const _lt = typeof qgLight === 'function' && qgLight()
  ctx.fillStyle = _lt ? '#eef3fb' : '#04030c'; ctx.fillRect(-14, -14, w+28, h+28)

  for (const st of G45.stars) {
    ctx.globalAlpha = st.z * 0.7
    ctx.fillStyle = _lt ? '#3b82f6' : '#93c5fd'
    ctx.fillRect(st.x, st.y, st.r, st.r)
  }
  ctx.globalAlpha = 1

  // Enemies
  for (const e of G45.enemies) {
    ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.rot || 0)
    ctx.beginPath()
    for (let i = 0; i < 7; i++) {
      const a = i/7 * Math.PI*2
      const rr = e.r * (i % 2 ? 0.78 : 1)
      i ? ctx.lineTo(Math.cos(a)*rr, Math.sin(a)*rr) : ctx.moveTo(Math.cos(a)*rr, Math.sin(a)*rr)
    }
    ctx.closePath()
    ctx.fillStyle = e.hp > 1 ? '#7f1d1d' : '#3f1d2b'
    ctx.fill()
    ctx.strokeStyle = e.hp > 1 ? '#f87171' : '#f472b6'
    ctx.lineWidth = 2; ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 10
    ctx.stroke(); ctx.shadowBlur = 0
    ctx.restore()
  }

  // Bullets
  ctx.fillStyle = '#fde047'; ctx.shadowColor = '#facc15'; ctx.shadowBlur = 8
  for (const b of G45.bullets) { ctx.beginPath(); ctx.arc(b.x, b.y, 3, 0, Math.PI*2); ctx.fill() }
  ctx.shadowBlur = 0

  // Particles
  for (const p of G45.parts) {
    ctx.globalAlpha = Math.max(0, p.life * 2)
    ctx.fillStyle = p.col
    ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3)
  }
  ctx.globalAlpha = 1

  // Ship
  const S = G45.ship
  if (G45.phase !== 'dead') {
    ctx.save(); ctx.translate(S.x, S.y)
    ctx.beginPath(); ctx.arc(0, 0, G45_SHIP_R + 5, 0, Math.PI*2)
    ctx.fillStyle = 'rgba(34,211,238,0.07)'; ctx.fill()
    ctx.beginPath(); ctx.arc(0, 0, G45_SHIP_R, 0, Math.PI*2)
    ctx.fillStyle = _lt ? '#cffafe' : '#0e2a3a'; ctx.fill()
    ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 2.5
    ctx.shadowColor = '#22d3ee'; ctx.shadowBlur = 12; ctx.stroke(); ctx.shadowBlur = 0

    // Turret barrel
    ctx.rotate(G45.turret.ang)
    ctx.fillStyle = _lt ? '#0891b2' : '#67e8f9'
    ctx.fillRect(G45_SHIP_R - 3, -3.5, 16, 7)
    ctx.restore()

    // Crosshair for whoever is shooting
    if (_g45CanGun()) {
      ctx.strokeStyle = 'rgba(253,224,71,0.5)'; ctx.lineWidth = 1
      ctx.beginPath(); ctx.arc(G45.aim.x, G45.aim.y, 9, 0, Math.PI*2); ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(G45.aim.x-13, G45.aim.y); ctx.lineTo(G45.aim.x-4, G45.aim.y)
      ctx.moveTo(G45.aim.x+4, G45.aim.y);  ctx.lineTo(G45.aim.x+13, G45.aim.y)
      ctx.moveTo(G45.aim.x, G45.aim.y-13); ctx.lineTo(G45.aim.x, G45.aim.y-4)
      ctx.moveTo(G45.aim.x, G45.aim.y+4);  ctx.lineTo(G45.aim.x, G45.aim.y+13)
      ctx.stroke()
    }
  }

  // Hurt flash
  if (G45.hurtFlash > 0) {
    ctx.fillStyle = `rgba(239,68,68,${G45.hurtFlash * 0.35})`
    ctx.fillRect(-14, -14, w+28, h+28)
  }

  // Wave label
  ctx.textAlign = 'center'
  ctx.font = 'bold 11px monospace'; ctx.fillStyle = _lt ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.30)'
  ctx.fillText('WAVE ' + G45.wave, w/2, 18)

  ctx.restore()
}
