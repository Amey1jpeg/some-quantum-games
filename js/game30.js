// ═══════════════════════════════════════════════════════
//  GAME 30 — MICRO RTS
//  Control one unit. Click to move. Auto-attack enemies.
//  ESC = pause & shop. Survive quantum-random waves.
// ═══════════════════════════════════════════════════════
const G30 = {
  active: false, paused: false,
  px: 0, py: 0, ptx: 0, pty: 0,
  pHp: 10, pMaxHp: 10,
  pRange: 95, pAtkCd: 0, pAtkCdMax: 68,
  pSpeed: 160,
  enemies: [], bullets: [], eBullets: [],
  coins: 0, score: 0, wave: 0,
  fireLevel: 0, speedLevel: 0,
  waveTimer: 0, betweenWaves: true,
  raf: null, lastTime: 0,
}
window._g30Score = 0

// ─── Upgrade cost tables ───
const G30_FIRE_COSTS  = [15, 20, 25, 30]  // cost to go from level N → N+1
const G30_SPEED_COSTS = [15, 20, 25, 30]
const G30_REPAIR_COST = 20

function stopGame30() {
  G30.active = false
  if (G30.raf) { cancelAnimationFrame(G30.raf); G30.raf = null }
  document.removeEventListener('keydown', _g30EscKey)
}
window.stopGame30 = stopGame30

function _g30EscKey(e) {
  if (e.code === 'Escape') G30.paused ? g30CloseShop() : g30OpenShop()
}

function initGame30() {
  stopGame30()
  document.getElementById('g30-over').classList.remove('show')
  document.getElementById('g30-overlay').style.display = 'flex'
  document.getElementById('g30-score-hud').textContent = '0'
  document.getElementById('g30-wave-hud').textContent = 'Wave 0'
  document.getElementById('g30-hp-hud').textContent = '10 / 10'
  document.getElementById('g30-coin-hud').textContent = '0'
}

window.startRTS = function() {
  SFX.resume(); SFX.click()
  const c = document.getElementById('g30-canvas')
  c.width = c.parentElement.clientWidth
  c.height = c.parentElement.clientHeight
  document.getElementById('g30-overlay').style.display = 'none'
  document.getElementById('g30-shop').style.display = 'none'

  const w = c.width, h = c.height
  G30.active = true; G30.paused = false
  G30.px = w * 0.3; G30.py = h * 0.5
  G30.ptx = G30.px; G30.pty = G30.py
  G30.pHp = 10; G30.pMaxHp = 10; G30.pAtkCd = 0
  G30.pAtkCdMax = 68; G30.pSpeed = 160
  G30.fireLevel = 0; G30.speedLevel = 0
  G30.enemies = []; G30.bullets = []; G30.eBullets = []
  G30.coins = 0; G30.score = 0; G30.wave = 0
  G30.betweenWaves = true; G30.waveTimer = 90
  G30.lastTime = performance.now()
  g30SyncHUD()

  c.onclick = function(e) {
    if (!G30.active || G30.paused) return
    const r = c.getBoundingClientRect()
    G30.ptx = e.clientX - r.left
    G30.pty = e.clientY - r.top
  }

  document.addEventListener('keydown', _g30EscKey)
  G30.raf = requestAnimationFrame(g30Loop)
}

// ─── Shop ───
window.g30OpenShop = function() {
  if (!G30.active) return
  G30.paused = true
  g30RenderShop()
  document.getElementById('g30-shop').style.display = 'flex'
}
window.g30CloseShop = function() {
  G30.paused = false
  document.getElementById('g30-shop').style.display = 'none'
  G30.lastTime = performance.now()
}

function g30SyncHUD() {
  document.getElementById('g30-score-hud').textContent = G30.score
  document.getElementById('g30-coin-hud').textContent = G30.coins
  document.getElementById('g30-hp-hud').textContent = `${G30.pHp} / ${G30.pMaxHp}`
}

function g30RenderShop() {
  const atkCd = G30.pAtkCdMax
  const spd   = G30.pSpeed
  const fireCost  = G30.fireLevel  < 4 ? G30_FIRE_COSTS[G30.fireLevel]  : null
  const speedCost = G30.speedLevel < 4 ? G30_SPEED_COSTS[G30.speedLevel] : null
  const repairOk  = G30.pHp < G30.pMaxHp

  function btn(key, cost, enabled, label) {
    const canBuy = enabled && G30.coins >= cost
    return `<button onclick="g30Buy('${key}')" ${canBuy ? '' : 'disabled'} style="padding:.3rem .9rem;border-radius:6px;border:1px solid ${canBuy ? '#60a5fa' : '#334155'};background:${canBuy ? '#60a5fa22' : 'transparent'};color:${canBuy ? '#60a5fa' : '#475569'};cursor:${canBuy ? 'pointer' : 'default'};font-weight:700;">${label}</button>`
  }

  document.getElementById('g30-shop-content').innerHTML = `
    <div style="text-align:center;color:#fbbf24;font-size:1.1rem;font-weight:700;margin-bottom:1.2rem">🪙 ${G30.coins} coins</div>
    <div style="background:#1e293b;border-radius:8px;padding:.8rem;margin:.4rem 0;display:flex;justify-content:space-between;align-items:center;">
      <div><div style="color:#e2e8f0;font-weight:700;">🔫 Fire Rate</div><div style="color:#64748b;font-size:.8rem;">Cooldown: ${atkCd} frames · Lv ${G30.fireLevel}/4</div></div>
      ${fireCost ? btn('fire', fireCost, true, fireCost + '🪙') : '<span style="color:#475569">MAX</span>'}
    </div>
    <div style="background:#1e293b;border-radius:8px;padding:.8rem;margin:.4rem 0;display:flex;justify-content:space-between;align-items:center;">
      <div><div style="color:#e2e8f0;font-weight:700;">💨 Move Speed</div><div style="color:#64748b;font-size:.8rem;">Speed: ${spd} px/s · Lv ${G30.speedLevel}/4</div></div>
      ${speedCost ? btn('speed', speedCost, true, speedCost + '🪙') : '<span style="color:#475569">MAX</span>'}
    </div>
    <div style="background:#1e293b;border-radius:8px;padding:.8rem;margin:.4rem 0;display:flex;justify-content:space-between;align-items:center;">
      <div><div style="color:#e2e8f0;font-weight:700;">❤️ Repair +2 HP</div><div style="color:#64748b;font-size:.8rem;">HP: ${G30.pHp} / ${G30.pMaxHp}</div></div>
      ${repairOk ? btn('repair', G30_REPAIR_COST, true, G30_REPAIR_COST + '🪙') : '<span style="color:#475569">FULL</span>'}
    </div>
    <div style="text-align:center;margin-top:1rem;">
      <button onclick="g30CloseShop()" style="padding:.5rem 1.5rem;border-radius:8px;border:1px solid #60a5fa;background:transparent;color:#60a5fa;cursor:pointer;font-size:.9rem;">▶ Resume</button>
    </div>`
}

window.g30Buy = function(key) {
  if (key === 'fire' && G30.fireLevel < 4) {
    const cost = G30_FIRE_COSTS[G30.fireLevel]
    if (G30.coins < cost) return
    G30.coins -= cost; G30.fireLevel++
    G30.pAtkCdMax = Math.max(18, 68 - G30.fireLevel * 10)
    SFX.coin()
  } else if (key === 'speed' && G30.speedLevel < 4) {
    const cost = G30_SPEED_COSTS[G30.speedLevel]
    if (G30.coins < cost) return
    G30.coins -= cost; G30.speedLevel++
    G30.pSpeed = 160 + G30.speedLevel * 30
    SFX.coin()
  } else if (key === 'repair' && G30.pHp < G30.pMaxHp) {
    if (G30.coins < G30_REPAIR_COST) return
    G30.coins -= G30_REPAIR_COST
    G30.pHp = Math.min(G30.pMaxHp, G30.pHp + 2)
    SFX.coin()
  }
  g30SyncHUD()
  g30RenderShop()
}

// ─── Wave spawning ───
function g30SpawnWave() {
  G30.wave++
  const c = document.getElementById('g30-canvas')
  const w = c.width, h = c.height
  const count = 5 + G30.wave * 2
  document.getElementById('g30-wave-hud').textContent = `Wave ${G30.wave}`
  for (let i = 0; i < count; i++) {
    const side = qRandInt(4)
    let ex, ey
    if (side === 0)      { ex = qRandInt(w); ey = -28 }
    else if (side === 1) { ex = w + 28; ey = qRandInt(h) }
    else if (side === 2) { ex = qRandInt(w); ey = h + 28 }
    else                 { ex = -28; ey = qRandInt(h) }

    const roll = qRandInt(10)
    let type = 'drone'
    if (G30.wave >= 4 && roll < 2)      type = 'turret'
    else if (roll < 4)                   type = 'heavy'

    if (type === 'turret') {
      G30.enemies.push({
        type: 'turret', x: ex, y: ey,
        hp: 3, maxHp: 3, speed: 0, r: 12,
        shootCd: 60 + qRandInt(60), shootCdMax: 165,
        color: '#c084fc', dead: false,
      })
    } else if (type === 'heavy') {
      G30.enemies.push({
        type: 'heavy', x: ex, y: ey,
        hp: 4, maxHp: 4, speed: 72, r: 14,
        atk: 2, atkCd: 0, atkCdMax: 80,
        color: '#ef4444', dead: false,
      })
    } else {
      G30.enemies.push({
        type: 'drone', x: ex, y: ey,
        hp: 1, maxHp: 1, speed: 115 + G30.wave * 9, r: 9,
        atk: 1, atkCd: 0, atkCdMax: 55,
        color: '#f87171', dead: false,
      })
    }
  }
  G30.betweenWaves = false
}

// ─── Game loop ───
function g30Loop(ts) {
  if (!G30.active) return
  if (G30.paused) { G30.raf = requestAnimationFrame(g30Loop); return }

  const dt = Math.min((ts - G30.lastTime) / 1000, 0.05)
  G30.lastTime = ts
  const c = document.getElementById('g30-canvas')
  const ctx = c.getContext('2d')
  const w = c.width, h = c.height

  // Wave management
  if (G30.betweenWaves) {
    G30.waveTimer--
    if (G30.waveTimer <= 0) g30SpawnWave()
  } else if (G30.enemies.every(e => e.dead)) {
    G30.betweenWaves = true; G30.waveTimer = 90
    G30.pHp = Math.min(G30.pMaxHp, G30.pHp + 1)
    SFX.coin(); g30SyncHUD()
  }

  // Move player toward target
  const tdx = G30.ptx - G30.px, tdy = G30.pty - G30.py
  const tdist = Math.hypot(tdx, tdy)
  if (tdist > 3) {
    const step = Math.min(G30.pSpeed * dt, tdist)
    G30.px += (tdx / tdist) * step
    G30.py += (tdy / tdist) * step
  }

  // Auto-attack: find nearest enemy in range
  G30.pAtkCd = Math.max(0, G30.pAtkCd - 1)
  let nearest = null, nearDist = Infinity
  for (const e of G30.enemies) {
    if (e.dead) continue
    const d = Math.hypot(e.x - G30.px, e.y - G30.py)
    if (d < nearDist) { nearDist = d; nearest = e }
  }
  if (nearest && nearDist < G30.pRange && G30.pAtkCd === 0) {
    G30.pAtkCd = G30.pAtkCdMax
    G30.bullets.push({ x: G30.px, y: G30.py, target: nearest, speed: 320, r: 5, alive: true })
    SFX.tick()
  }

  // Player bullets (homing)
  for (const b of G30.bullets) {
    if (!b.alive) continue
    if (b.target.dead) { b.alive = false; continue }
    const bdx = b.target.x - b.x, bdy = b.target.y - b.y
    const bd = Math.hypot(bdx, bdy)
    if (bd < 8) {
      b.alive = false
      b.target.hp -= 1
      if (b.target.hp <= 0) {
        b.target.dead = true
        const pts   = b.target.type === 'turret' ? 30 : b.target.type === 'heavy' ? 25 : 10
        const coins = b.target.type === 'turret' ? 12 : b.target.type === 'heavy' ?  8 :  3
        G30.score += pts; G30.coins += coins
        SFX.hit(); g30SyncHUD()
      }
    } else {
      b.x += (bdx / bd) * b.speed * dt
      b.y += (bdy / bd) * b.speed * dt
    }
  }
  G30.bullets = G30.bullets.filter(b => b.alive)

  // Enemy logic
  for (const e of G30.enemies) {
    if (e.dead) continue
    if (e.type === 'turret') {
      e.shootCd = Math.max(0, e.shootCd - 1)
      if (e.shootCd === 0) {
        e.shootCd = e.shootCdMax
        const edx = G30.px - e.x, edy = G30.py - e.y
        const ed = Math.hypot(edx, edy)
        G30.eBullets.push({ x: e.x, y: e.y, vx: (edx/ed)*160, vy: (edy/ed)*160, r: 5, alive: true })
        SFX.shoot()
      }
    } else {
      const edx = G30.px - e.x, edy = G30.py - e.y
      const ed = Math.hypot(edx, edy)
      if (ed > e.r + 14) {
        e.x += (edx / ed) * e.speed * dt
        e.y += (edy / ed) * e.speed * dt
      } else {
        e.atkCd = Math.max(0, e.atkCd - 1)
        if (e.atkCd === 0) {
          e.atkCd = e.atkCdMax
          G30.pHp -= e.atk; SFX.error(); g30SyncHUD()
          if (G30.pHp <= 0) { endGame30(); return }
        }
      }
    }
  }

  // Enemy bullets
  for (const b of G30.eBullets) {
    b.x += b.vx * dt; b.y += b.vy * dt
    if (b.x < -30 || b.x > w+30 || b.y < -30 || b.y > h+30) { b.alive = false; continue }
    if (Math.hypot(b.x - G30.px, b.y - G30.py) < 14) {
      b.alive = false; G30.pHp -= 1; SFX.error(); g30SyncHUD()
      if (G30.pHp <= 0) { endGame30(); return }
    }
  }
  G30.eBullets = G30.eBullets.filter(b => b.alive)

  // ─── Draw ───
  // Canvases get no CSS variables, so read the theme directly
  const _lt = typeof qgLight === 'function' && qgLight()
  ctx.fillStyle = _lt ? '#f1f4f9' : '#0d1117'; ctx.fillRect(0, 0, w, h)

  ctx.strokeStyle = _lt ? '#dfe5ee' : '#1a2332'; ctx.lineWidth = 1
  for (let x = 0; x < w; x += 48) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke() }
  for (let y = 0; y < h; y += 48) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke() }

  // Move target marker
  if (tdist > 10) {
    ctx.beginPath(); ctx.arc(G30.ptx, G30.pty, 6, 0, Math.PI*2)
    ctx.strokeStyle = '#60a5fa44'; ctx.lineWidth = 1.5; ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(G30.ptx-10, G30.pty); ctx.lineTo(G30.ptx+10, G30.pty)
    ctx.moveTo(G30.ptx, G30.pty-10); ctx.lineTo(G30.ptx, G30.pty+10)
    ctx.strokeStyle = '#60a5fa33'; ctx.stroke()
  }

  // Range ring
  ctx.beginPath(); ctx.arc(G30.px, G30.py, G30.pRange, 0, Math.PI*2)
  ctx.strokeStyle = _lt ? '#2563eb30' : '#60a5fa18'; ctx.lineWidth = 1; ctx.stroke()

  // Player bullets
  ctx.fillStyle = '#93c5fd'
  for (const b of G30.bullets) {
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI*2); ctx.fill()
  }

  // Enemy bullets
  ctx.fillStyle = '#f97316'
  for (const b of G30.eBullets) {
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI*2); ctx.fill()
  }

  // Enemies
  for (const e of G30.enemies) {
    if (e.dead) continue
    if (e.type === 'turret') {
      // draw as purple octagon-ish ring with rotating cannon
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI*2)
      ctx.fillStyle = _lt ? '#f3e8ff' : '#1e1533'; ctx.fill()
      ctx.strokeStyle = '#c084fc'; ctx.lineWidth = 2.5; ctx.stroke()
      // cannon pointing at player
      const ang = Math.atan2(G30.py - e.y, G30.px - e.x)
      ctx.beginPath()
      ctx.moveTo(e.x, e.y)
      ctx.lineTo(e.x + Math.cos(ang) * e.r * 1.5, e.y + Math.sin(ang) * e.r * 1.5)
      ctx.strokeStyle = '#c084fc'; ctx.lineWidth = 3; ctx.stroke()
    } else {
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI*2)
      ctx.fillStyle = e.color; ctx.fill()
    }
    if (e.maxHp > 1 || e.type === 'turret') {
      const bx = e.x - e.r, by = e.y - e.r - 8
      ctx.fillStyle = _lt ? '#d4d4d8' : '#333'; ctx.fillRect(bx, by, e.r*2, 4)
      ctx.fillStyle = e.type === 'turret' ? '#c084fc' : '#ef4444'
      ctx.fillRect(bx, by, e.r*2 * (e.hp/e.maxHp), 4)
    }
  }

  // Player glow + body
  const pGrad = ctx.createRadialGradient(G30.px, G30.py, 0, G30.px, G30.py, 22)
  pGrad.addColorStop(0, '#60a5fa88'); pGrad.addColorStop(1, '#60a5fa00')
  ctx.beginPath(); ctx.arc(G30.px, G30.py, 22, 0, Math.PI*2)
  ctx.fillStyle = pGrad; ctx.fill()
  ctx.beginPath(); ctx.arc(G30.px, G30.py, 12, 0, Math.PI*2)
  ctx.fillStyle = _lt ? '#1d4ed8' : '#ffffff'; ctx.fill()

  // Player HP bar
  ctx.fillStyle = _lt ? '#d4d4d8' : '#333'; ctx.fillRect(G30.px-30, G30.py-28, 60, 5)
  ctx.fillStyle = G30.pHp > G30.pMaxHp*0.4 ? '#60a5fa' : '#ef4444'
  ctx.fillRect(G30.px-30, G30.py-28, 60*(G30.pHp/G30.pMaxHp), 5)

  // Wave countdown banner
  if (G30.betweenWaves && G30.waveTimer > 0) {
    ctx.fillStyle = _lt ? 'rgba(255,255,255,.85)' : 'rgba(0,0,0,.65)'; ctx.fillRect(w/2-90, 14, 180, 26)
    ctx.fillStyle = '#60a5fa'; ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center'
    ctx.fillText(`Wave ${G30.wave+1} in ${Math.ceil(G30.waveTimer/60)}s`, w/2, 31)
    ctx.textAlign = 'left'
  }

  G30.raf = requestAnimationFrame(g30Loop)
}

function endGame30() {
  SFX.die(); stopGame30()
  window._g30Score = G30.score
  document.getElementById('g30-final-score').textContent = G30.score + ' pts'
  renderMedalDisplay('g30-medal-display', 'mrts', G30.score)
  document.getElementById('g30-over').classList.add('show')
}
