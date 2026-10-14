// ═══════════════════════════════════════════════════════
//  GAME 29 — QUANTUM BLASTER
//  Top-down shooter · mouse/WASD to move · auto-fire
//  Powerups: ⚡ Triple  🔥 Rapid  🛡️ Shield  💣 Bomb
//  ESC = use stored bomb   Shields stack!
// ═══════════════════════════════════════════════════════

const G29 = {
  active: false, canvas: null, ctx: null,
  w: 0, h: 0, _raf: null,
  score: 0, elapsed: 0, lastTime: 0,
  // player
  px: 0, py: 0, pHp: 3, pMaxHp: 3, invincible: 0,
  // input
  mouseX: 0, mouseY: 0, keys: {},
  // shooting
  shootCooldown: 0,
  // objects
  bullets: [], enemyBullets: [], enemies: [], powerups: [], particles: [], floaters: [],
  // powerups — shield & bombs are stacked counts
  tripleShot: 0, rapidFire: 0, shield: 0, bombs: 0,
  // wave / scoring
  combo: 0, comboTimer: 0, kills: 0, wave: 0, waveTimer: 0,
  boss: null, shake: 0,
}

function stopGame29() {
  if (G29._raf) cancelAnimationFrame(G29._raf)
  G29._raf = null; G29.active = false
}
window.stopGame29 = stopGame29

async function initGame29() {
  stopGame29()
  G29.canvas = document.getElementById('g29-canvas')
  G29.ctx    = G29.canvas.getContext('2d')
  const rect = document.getElementById('g29-arena').getBoundingClientRect()
  G29.canvas.width  = rect.width
  G29.canvas.height = rect.height
  G29.w = G29.canvas.width; G29.h = G29.canvas.height
  Object.assign(G29, {
    active: false, score: 0, elapsed: 0,
    px: G29.w / 2, py: G29.h * 0.75,
    pHp: 3, pMaxHp: 3, invincible: 0,
    bullets: [], enemyBullets: [], enemies: [], powerups: [], particles: [], floaters: [],
    tripleShot: 0, rapidFire: 0, shield: 0, bombs: 1, coins: 0,
    combo: 0, comboTimer: 0, kills: 0, wave: 0, waveTimer: 3,
    boss: null, shake: 0, shootCooldown: 0, keys: {},
    mouseX: G29.w / 2, mouseY: G29.h * 0.75,
  })
  document.getElementById('g29-over').classList.remove('show')
  document.getElementById('g29-pause').style.display = 'none'
  document.getElementById('g29-overlay').style.display = 'flex'
  document.getElementById('g29-score-hud').textContent = '0'
  g29SyncHUD()
  await initCurby()
}

window.startBlaster = function() {
  SFX.resume()
  document.getElementById('g29-overlay').style.display = 'none'
  G29.active = true
  G29.lastTime = performance.now()
  G29._raf = requestAnimationFrame(g29Loop)
}

// ── Enemy config ──────────────────────────────────────────
const G29_TYPES = {
  drone:  { hp: 1, spd: 70,  w: 22, h: 22, pts: 10,  col: '#f87171', shoot: 0    },
  zigzag: { hp: 2, spd: 45,  w: 24, h: 22, pts: 20,  col: '#fb923c', shoot: 0    },
  turret: { hp: 2, spd: 0,   w: 28, h: 28, pts: 35,  col: '#c084fc', shoot: 4.5  },
  heavy:  { hp: 4, spd: 24,  w: 38, h: 34, pts: 60,  col: '#ef4444', shoot: 4.5  },
}

function g29SpawnWave() {
  G29.wave++
  G29.waveTimer = 0

  if (G29.wave % 5 === 0) {
    const bHp = 25 + G29.wave * 8
    G29.boss = { x: G29.w/2, y: -60, targetY: 90, w: 72, h: 52, hp: bHp, maxHp: bHp, vx: 90, shootTimer: 0, shootInterval: 1.0 }
    return
  }
  const count = Math.min(4 + G29.wave * 2, 24)
  const pool  = G29.wave < 3 ? ['drone'] : G29.wave < 6 ? ['drone','drone','zigzag'] : G29.wave < 9 ? ['drone','zigzag','turret'] : ['drone','zigzag','turret','heavy']
  for (let i = 0; i < count; i++) {
    const t   = pool[qRandInt(pool.length)]
    const cfg = G29_TYPES[t]
    const col = i % 8, row = Math.floor(i / 8)
    G29.enemies.push({
      t, x: 55 + col * (G29.w - 110) / 7, y: -50 - row * 65,
      vx: t === 'zigzag' ? (qRandInt(2) ? 1 : -1) * cfg.spd : 0,
      vy: cfg.spd, hp: cfg.hp, maxHp: cfg.hp,
      w: cfg.w, h: cfg.h, pts: cfg.pts, col: cfg.col,
      shoot: cfg.shoot, shootT: qRandInt(100) / 100 * cfg.shoot,
      phase: qRandInt(628) / 100,
    })
  }
}

// ── Main loop ─────────────────────────────────────────────
function g29Loop(ts) {
  if (!G29.active) return
  const dt = Math.min((ts - G29.lastTime) / 1000, 0.05)
  G29.lastTime = ts
  g29Update(dt)
  g29Draw()
  G29._raf = requestAnimationFrame(g29Loop)
}

function g29Update(dt) {
  G29.elapsed += dt
  if (G29.shake > 0) G29.shake = Math.max(0, G29.shake - dt * 8)
  if (G29.tripleShot > 0) G29.tripleShot -= dt
  if (G29.rapidFire  > 0) G29.rapidFire  -= dt
  if (G29.comboTimer > 0) { G29.comboTimer -= dt; if (G29.comboTimer <= 0) G29.combo = 0 }
  if (G29.invincible > 0) G29.invincible -= dt

  // Player movement — follow mouse + WASD
  const spd = 280
  let tx = G29.mouseX, ty = G29.mouseY
  if (G29.keys['ArrowLeft']  || G29.keys['a'] || G29.keys['A']) tx -= 200
  if (G29.keys['ArrowRight'] || G29.keys['d'] || G29.keys['D']) tx += 200
  if (G29.keys['ArrowUp']    || G29.keys['w'] || G29.keys['W']) ty -= 200
  if (G29.keys['ArrowDown']  || G29.keys['s'] || G29.keys['S']) ty += 200
  const dx = tx - G29.px, dy = ty - G29.py, dd = Math.sqrt(dx*dx + dy*dy)
  if (dd > 4) { const m = Math.min(spd * dt, dd); G29.px += dx/dd*m; G29.py += dy/dd*m }
  G29.px = Math.max(14, Math.min(G29.w - 14, G29.px))
  G29.py = Math.max(G29.h * 0.3, Math.min(G29.h - 18, G29.py))

  // Auto-shoot
  G29.shootCooldown -= dt
  const rate = G29.rapidFire > 0 ? 0.1 : 0.28
  if (G29.shootCooldown <= 0) { G29.shootCooldown = rate; g29Shoot() }

  // Move bullets
  G29.bullets      = G29.bullets.filter(b => { b.x += b.vx*dt; b.y += b.vy*dt; return b.y > -10 && b.x > -10 && b.x < G29.w+10 })
  G29.enemyBullets = G29.enemyBullets.filter(b => { b.x += b.vx*dt; b.y += b.vy*dt; return b.y < G29.h+10 && b.y > -10 && b.x > -10 && b.x < G29.w+10 })

  // Move enemies
  for (const e of G29.enemies) {
    if (e.t === 'zigzag') { e.phase += dt * 2; e.x = Math.max(e.w/2, Math.min(G29.w-e.w/2, e.x + Math.sin(e.phase)*130*dt)); e.y += e.vy*dt }
    else if (e.t === 'turret') { e.y = Math.min(80 + qRandInt(40), e.y + e.vy * dt + 20 * dt) }
    else { e.y += e.vy*dt }
    if (e.shoot > 0) {
      e.shootT -= dt
      if (e.shootT <= 0) {
        e.shootT = e.shoot
        const dx2 = G29.px - e.x, dy2 = G29.py - e.y, d2 = Math.sqrt(dx2*dx2+dy2*dy2)
        G29.enemyBullets.push({ x: e.x, y: e.y+e.h/2, vx: dx2/d2*120, vy: dy2/d2*120, r: 5 })
        SFX.zap()
      }
    }
  }

  // Boss movement
  if (G29.boss) {
    const b = G29.boss
    b.y = Math.min(b.targetY, b.y + 40*dt)
    b.x += b.vx*dt; if (b.x < b.w/2 || b.x > G29.w-b.w/2) b.vx *= -1
    b.shootTimer -= dt
    if (b.shootTimer <= 0) {
      b.shootTimer = b.shootInterval
      for (let i = -1; i <= 1; i++) {
        const ang = Math.PI/2 + i*0.35
        G29.enemyBullets.push({ x: b.x+i*18, y: b.y+b.h/2, vx: Math.cos(ang)*140*(i===0?1:0.85), vy: Math.sin(ang)*140, r: 7 })
      }
      SFX.zap()
    }
  }

  // Bullet ↔ enemy/boss hits
  for (const b of G29.bullets) {
    for (const e of G29.enemies) {
      if (!b.dead && Math.abs(b.x-e.x) < e.w/2+4 && Math.abs(b.y-e.y) < e.h/2+4) {
        e.hp--; b.dead = true; g29Spark(b.x, b.y, '#fff', 4)
      }
    }
    if (!b.dead && G29.boss) {
      const bos = G29.boss
      if (Math.abs(b.x-bos.x) < bos.w/2+4 && Math.abs(b.y-bos.y) < bos.h/2+4) {
        bos.hp--; b.dead = true; g29Spark(b.x, b.y, '#f97316', 5)
        if (bos.hp <= 0) {
          const bonus = 300 * G29.wave
          G29.score += bonus; G29.boss = null; G29.shake = 2
          g29Spark(bos.x, bos.y, '#f97316', 40)
          g29Float(bos.x, bos.y, '💥 BOSS! +'+bonus)
          SFX.win()
          g29DropPU(bos.x-40, bos.y); g29DropPU(bos.x, bos.y); g29DropPU(bos.x+40, bos.y)
        }
      }
    }
  }
  G29.bullets = G29.bullets.filter(b => !b.dead)

  // Kill dead enemies, award score + coins
  for (const e of G29.enemies.filter(e => e.hp <= 0)) {
    G29.combo++; G29.comboTimer = 2.5
    const mult = Math.min(G29.combo, 10)
    const pts  = e.pts * mult
    const coins = g29CoinVal(e.t)
    G29.score += pts; G29.coins += coins; G29.kills++; G29.shake = 0.15
    g29Spark(e.x, e.y, e.col, 12); SFX.hit()
    if (mult > 1) g29Float(e.x, e.y - 10, `×${mult}!`)
    if (Math.random() < 0.38) g29DropPU(e.x, e.y)
  }
  g29SyncHUD()
  G29.enemies = G29.enemies.filter(e => e.hp > 0 && e.y < G29.h + 50)

  // Enemy bullets ↔ player
  if (G29.invincible <= 0) {
    for (const b of G29.enemyBullets) {
      if (Math.hypot(b.x-G29.px, b.y-G29.py) < 13+b.r) { b.dead = true; g29Hit() }
    }
    for (const e of G29.enemies) {
      if (Math.abs(e.x-G29.px) < e.w/2+11 && Math.abs(e.y-G29.py) < e.h/2+11) { e.hp = 0; g29Hit() }
    }
  }
  G29.enemyBullets = G29.enemyBullets.filter(b => !b.dead)

  // Powerup pickup
  G29.powerups = G29.powerups.filter(p => {
    p.y += 55*dt; p.bob = (p.bob||0) + dt*3
    if (Math.hypot(p.x-G29.px, p.y-G29.py) < 28) { g29ApplyPU(p.type); return false }
    return p.y < G29.h + 20
  })

  // Particles & floaters
  G29.particles = G29.particles.filter(p => { p.x+=p.vx*dt; p.y+=p.vy*dt; p.vy+=120*dt; p.life-=dt; return p.life>0 })
  G29.floaters  = G29.floaters.filter(f  => { f.y-=45*dt; f.life-=dt; return f.life>0 })

  // Next wave when clear
  if (G29.enemies.length === 0 && !G29.boss) {
    G29.waveTimer += dt
    if (G29.waveTimer > 2.5) g29SpawnWave()
  }

  document.getElementById('g29-score-hud').textContent = G29.score
}

function g29Shoot() {
  const spread = G29.tripleShot > 0
  const shots = spread ? [{ vx:-110,vy:-600 },{ vx:0,vy:-660 },{ vx:110,vy:-600 }] : [{ vx:0,vy:-660 }]
  for (const s of shots) G29.bullets.push({ x: G29.px, y: G29.py-16, ...s, r: 4, dead: false })
  SFX.shoot()
}

function g29Hit() {
  if (G29.shield > 0) { G29.shield--; G29.invincible = 1.5; G29.shake = 0.5; g29Float(G29.px, G29.py-25, '🛡️ BLOCKED!'); SFX.hit(); return }
  G29.pHp--; G29.invincible = 1.5; G29.shake = 0.8; G29.combo = 0
  SFX.miss()
  if (G29.pHp <= 0) { G29.active = false; cancelAnimationFrame(G29._raf); g29End() }
}

function g29DropPU(x, y) {
  // shield weighted 3× so it drops more often
  const types = ['triple','rapid','shield','shield','shield','bomb']
  G29.powerups.push({ x, y, type: types[qRandInt(types.length)], bob: 0 })
}

function g29ApplyPU(type) {
  SFX.powerup()
  if (type === 'triple') { G29.tripleShot += 9; g29Float(G29.px, G29.py-30, `⚡ +9s TRIPLE${G29.tripleShot>9?' ×'+Math.round(G29.tripleShot/9):''}!`) }
  if (type === 'rapid')  { G29.rapidFire  += 9; g29Float(G29.px, G29.py-30, `🔥 +9s RAPID${G29.rapidFire>9?' ×'+Math.round(G29.rapidFire/9):''}!`) }
  if (type === 'shield') { G29.shield++;   g29Float(G29.px, G29.py-30, `🛡️ SHIELD ×${G29.shield}!`) }
  if (type === 'bomb')   { G29.bombs++;    g29Float(G29.px, G29.py-30, `💣 BOMB STORED ×${G29.bombs}  [Q]`) }
}

function g29UseBomb() {
  if (G29.bombs <= 0) return
  G29.bombs--
  SFX.win()
  for (const e of G29.enemies) { G29.score += e.pts; G29.coins += g29CoinVal(e.t); g29Spark(e.x, e.y, e.col, 8) }
  if (G29.boss) { G29.boss.hp -= 25; g29Spark(G29.boss.x, G29.boss.y, '#f97316', 20) }
  G29.enemies = []; G29.enemyBullets = []; G29.shake = 2
  g29Float(G29.w/2, G29.h/2-30, '💥 BOMB!')
  g29SyncHUD()
}

function g29SyncHUD() {
  document.getElementById('g29-coin-hud').textContent = G29.coins
  const bb = document.getElementById('g29-bomb-btn')
  if (bb) { bb.style.display = G29.bombs > 0 ? '' : 'none'; document.getElementById('g29-bomb-count').textContent = G29.bombs }
}

const G29_COINS = { drone: 5, zigzag: 8, turret: 15, heavy: 22 }
function g29CoinVal(t) { return G29_COINS[t] || 5 }

// ── Shop ──────────────────────────────────────────────────
const G29_SHOP = [
  { type:'triple', icon:'⚡', label:'Triple Shot',  desc:'+9s stacks', cost:40,  col:'#e879f9' },
  { type:'rapid',  icon:'🔥', label:'Rapid Fire',   desc:'+9s stacks', cost:40,  col:'#fbbf24' },
  { type:'shield', icon:'🛡️', label:'Shield',       desc:'+1 charge',  cost:60,  col:'#60a5fa' },
  { type:'bomb',   icon:'💣', label:'Bomb',         desc:'store 1',    cost:80,  col:'#f97316' },
  { type:'hp',     icon:'❤️', label:'Heal +1 HP',   desc:'max 5',      cost:120, col:'#f87171' },
]

window.g29UseBomb = g29UseBomb
window.g29Pause = function() {
  if (!G29.active) return
  G29.active = false
  cancelAnimationFrame(G29._raf); G29._raf = null
  const el = document.getElementById('g29-pause')
  el.style.display = 'block'
  g29ShowShop()
}

window.g29Resume = function() {
  document.getElementById('g29-pause').style.display = 'none'
  G29.active = true
  G29.lastTime = performance.now()
  G29._raf = requestAnimationFrame(g29Loop)
}

function g29ShowShop() {
  const el = document.getElementById('g29-shop-content')
  const rows = G29_SHOP.map(item => {
    const canAfford = G29.coins >= item.cost
    const maxed = item.type === 'hp' && G29.pHp >= 5
    return `<div style="display:flex;align-items:center;gap:.6rem;padding:.55rem .7rem;border:1px solid ${item.col}33;border-radius:8px;background:rgba(0,0,0,.3);">
      <span style="font-size:1.4rem">${item.icon}</span>
      <div style="flex:1">
        <div style="font-weight:700;color:${item.col};font-size:.9rem">${item.label}</div>
        <div style="font-size:.75rem;color:#888">${item.desc}</div>
      </div>
      <button onclick="g29BuyPU('${item.type}')" ${!canAfford||maxed?'disabled':''} style="padding:.3rem .8rem;border-radius:6px;border:1px solid ${item.col};background:${canAfford&&!maxed?item.col+'22':'#111'};color:${canAfford&&!maxed?item.col:'#555'};cursor:${canAfford&&!maxed?'pointer':'not-allowed'};font-size:.85rem;font-weight:700">
        ${maxed?'MAX':'🪙 '+item.cost}
      </button>
    </div>`
  }).join('')
  el.innerHTML = `
    <div style="text-align:center;margin-bottom:.8rem">
      <div style="font-size:1.3rem;font-weight:800;color:#e879f9">⏸ PAUSED — SHOP</div>
      <div style="color:#fbbf24;font-size:1rem;margin-top:.25rem">🪙 ${G29.coins} coins</div>
      <div style="font-size:.75rem;color:#666;margin-top:.1rem">Wave ${G29.wave} · Score ${G29.score}</div>
    </div>
    <div style="display:flex;flex-direction:column;gap:.4rem">${rows}</div>
    <div id="g29-shop-msg" style="text-align:center;min-height:1.2rem;font-size:.8rem;margin:.4rem 0"></div>
    <div style="text-align:center;margin-top:.4rem">
      <button onclick="g29Resume()" style="padding:.5rem 1.8rem;border-radius:8px;background:#e879f9;color:#000;font-weight:800;font-size:.95rem;border:none;cursor:pointer">▶ Resume</button>
    </div>
    <div style="text-align:center;margin-top:.5rem;font-size:.7rem;color:#555">Q = use bomb in-game · ESC = shop</div>`
}

window.g29BuyPU = function(type) {
  const item = G29_SHOP.find(i => i.type === type)
  const msg  = document.getElementById('g29-shop-msg')
  if (G29.coins < item.cost) { msg.style.color='#f87171'; msg.textContent=`Need ${item.cost} coins!`; return }
  if (type === 'hp' && G29.pHp >= 5) { msg.style.color='#f87171'; msg.textContent='HP already maxed!'; return }
  G29.coins -= item.cost
  SFX.powerup()
  if (type === 'triple') G29.tripleShot += 9
  if (type === 'rapid')  G29.rapidFire  += 9
  if (type === 'shield') G29.shield++
  if (type === 'bomb')   G29.bombs++
  if (type === 'hp')     { G29.pHp = Math.min(G29.pHp + 1, 5); G29.pMaxHp = Math.max(G29.pMaxHp, G29.pHp) }
  msg.style.color = '#4ade80'; msg.textContent = `${item.icon} Bought ${item.label}!`
  g29SyncHUD()
  g29ShowShop()
}

function g29Spark(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random()*Math.PI*2, s = 60+Math.random()*220
    G29.particles.push({ x, y, vx: Math.cos(a)*s, vy: Math.sin(a)*s-60, color, life: 0.25+Math.random()*0.45, r: 2+Math.random()*3 })
  }
}
function g29Float(x, y, text) { G29.floaters.push({ x, y, text, life: 1.3 }) }

// ── Draw ──────────────────────────────────────────────────
function g29Draw() {
  const c = G29.ctx
  const sk = G29.shake > 0 ? (Math.random()-.5)*G29.shake*7 : 0
  c.save(); c.translate(sk, sk*.5)
  c.clearRect(-10,-10,G29.w+20,G29.h+20)

  // Canvases get no CSS variables, so read the theme directly
  const _lt = typeof qgLight === 'function' && qgLight()

  // Grid bg
  c.strokeStyle = _lt ? 'rgba(192,38,211,0.10)' : 'rgba(232,121,249,0.05)'; c.lineWidth = 1
  for (let x = 0; x < G29.w; x += 44) { c.beginPath(); c.moveTo(x,0); c.lineTo(x,G29.h); c.stroke() }
  for (let y = 0; y < G29.h; y += 44) { c.beginPath(); c.moveTo(0,y); c.lineTo(G29.w,y); c.stroke() }

  // Particles
  for (const p of G29.particles) {
    c.globalAlpha = Math.max(0, p.life*2.5); c.fillStyle = p.color
    c.beginPath(); c.arc(p.x,p.y,p.r,0,Math.PI*2); c.fill()
  }
  c.globalAlpha = 1

  // Player bullets
  const bColor = G29.tripleShot > 0 ? '#e879f9' : '#a78bfa'
  c.shadowBlur = 10; c.shadowColor = bColor; c.fillStyle = bColor
  for (const b of G29.bullets) { c.beginPath(); c.arc(b.x,b.y,b.r,0,Math.PI*2); c.fill() }

  // Enemy bullets
  c.shadowColor = '#f97316'; c.fillStyle = '#f97316'
  for (const b of G29.enemyBullets) { c.beginPath(); c.arc(b.x,b.y,b.r,0,Math.PI*2); c.fill() }
  c.shadowBlur = 0

  // Enemies
  for (const e of G29.enemies) {
    c.fillStyle = e.col; c.shadowBlur = 12; c.shadowColor = e.col
    if (e.t === 'drone') {
      c.beginPath(); c.moveTo(e.x,e.y-e.h/2); c.lineTo(e.x+e.w/2,e.y); c.lineTo(e.x,e.y+e.h/2); c.lineTo(e.x-e.w/2,e.y); c.closePath(); c.fill()
    } else if (e.t === 'zigzag') {
      c.beginPath(); c.arc(e.x,e.y,e.w/2,0,Math.PI*2); c.fill()
    } else {
      c.fillRect(e.x-e.w/2, e.y-e.h/2, e.w, e.h)
    }
    c.shadowBlur = 0
    if (e.maxHp > 1) {
      c.fillStyle = _lt ? 'rgba(0,0,0,.12)' : 'rgba(255,255,255,.12)'; c.fillRect(e.x-e.w/2, e.y-e.h/2-8, e.w, 4)
      c.fillStyle = e.col;                   c.fillRect(e.x-e.w/2, e.y-e.h/2-8, e.w*e.hp/e.maxHp, 4)
    }
  }

  // Boss
  if (G29.boss) {
    const b = G29.boss
    c.fillStyle = '#ef4444'; c.shadowBlur = 25; c.shadowColor = '#ef4444'
    c.beginPath(); c.moveTo(b.x,b.y-b.h/2); c.lineTo(b.x+b.w/2,b.y+b.h*.1); c.lineTo(b.x+b.w*.3,b.y+b.h/2); c.lineTo(b.x-b.w*.3,b.y+b.h/2); c.lineTo(b.x-b.w/2,b.y+b.h*.1); c.closePath(); c.fill()
    c.shadowBlur = 0
    // boss hp bar
    c.fillStyle=_lt?'rgba(0,0,0,.12)':'rgba(255,255,255,.15)'; c.fillRect(20,8,G29.w-40,10)
    c.fillStyle='#ef4444';               c.fillRect(20,8,(G29.w-40)*b.hp/b.maxHp,10)
    c.fillStyle=_lt?'#111':'#fff'; c.font='bold 10px monospace'; c.textAlign='center'; c.fillText(`⚠ BOSS  ${b.hp}/${b.maxHp}`,G29.w/2,22)
  }

  // Powerups
  const puCol  = { triple:'#e879f9', rapid:'#fbbf24', shield:'#60a5fa', bomb:'#f97316' }
  const puIcon = { triple:'⚡', rapid:'🔥', shield:'🛡️', bomb:'💣' }
  for (const p of G29.powerups) {
    const bob = Math.sin(p.bob)*4
    c.fillStyle = puCol[p.type]; c.shadowBlur=12; c.shadowColor=puCol[p.type]
    c.beginPath(); c.arc(p.x,p.y+bob,13,0,Math.PI*2); c.fill(); c.shadowBlur=0
    c.font='15px serif'; c.textAlign='center'; c.textBaseline='middle'; c.fillText(puIcon[p.type],p.x,p.y+bob)
  }

  // Player ship
  const blink = G29.invincible > 0 ? (Math.sin(G29.elapsed*25)*.5+.5) : 1
  c.globalAlpha = blink
  if (G29.shield > 0) {
    c.strokeStyle='#60a5fa'; c.lineWidth=2.5+G29.shield*.5; c.shadowBlur=18+G29.shield*4; c.shadowColor='#60a5fa'
    c.beginPath(); c.arc(G29.px,G29.py,26+G29.shield*2,0,Math.PI*2); c.stroke(); c.shadowBlur=0
  }
  if (G29.tripleShot>0) {
    c.strokeStyle=`rgba(232,121,249,${Math.min(1,G29.tripleShot*.4)})`; c.lineWidth=2
    c.beginPath(); c.arc(G29.px,G29.py,22,0,Math.PI*2); c.stroke()
  }
  // ship body
  c.fillStyle=_lt?'#581c87':'#ffffff'; c.shadowBlur=22; c.shadowColor='#e879f9'
  c.beginPath()
  c.moveTo(G29.px, G29.py-20)
  c.lineTo(G29.px-15, G29.py+12)
  c.lineTo(G29.px-6,  G29.py+7)
  c.lineTo(G29.px,    G29.py+13)
  c.lineTo(G29.px+6,  G29.py+7)
  c.lineTo(G29.px+15, G29.py+12)
  c.closePath(); c.fill(); c.shadowBlur=0
  // engine glow
  c.fillStyle=`hsl(${280+qRandInt(40)},100%,70%)`; c.shadowBlur=14; c.shadowColor='#e879f9'
  c.beginPath(); c.arc(G29.px, G29.py+14, 5+Math.random()*3, 0, Math.PI*2); c.fill()
  c.shadowBlur=0; c.globalAlpha=1

  // Floaters
  c.textAlign='center'; c.textBaseline='middle'
  for (const f of G29.floaters) {
    c.globalAlpha=Math.min(1,f.life); c.fillStyle=_lt?'#111':'#fff'; c.font='bold 13px monospace'
    c.fillText(f.text, f.x, f.y)
  }
  c.globalAlpha=1

  // HP
  c.font='17px serif'; c.textAlign='left'; c.textBaseline='alphabetic'
  for (let i=0;i<G29.pMaxHp;i++) c.fillText(i<G29.pHp?'❤️':'🖤', 8+i*22, G29.h-8)

  // Combo
  if (G29.combo>1) {
    c.fillStyle='#fbbf24'; c.font=`bold ${11+Math.min(G29.combo,8)}px monospace`; c.textAlign='right'
    c.fillText(`×${Math.min(G29.combo,10)} COMBO`, G29.w-8, G29.h-8)
  }

  // Wave clear / incoming text
  if (G29.enemies.length===0 && !G29.boss && G29.waveTimer < 2.5) {
    const alpha = Math.sin(G29.waveTimer/2.5*Math.PI)
    c.globalAlpha=alpha; c.fillStyle=_lt?'#111':'#fff'; c.font='bold 22px monospace'; c.textAlign='center'
    c.fillText(G29.waveTimer<0.2?`WAVE ${G29.wave} CLEAR! ✓`:`WAVE ${G29.wave+1} INCOMING...`, G29.w/2, G29.h/2)
    c.globalAlpha=1
  }

  // Powerup HUD timers
  let hx=8; c.textAlign='left'; c.font='bold 11px monospace'; c.textBaseline='alphabetic'
  if (G29.tripleShot>0) { c.fillStyle='#e879f9'; c.fillText(`⚡ ${G29.tripleShot.toFixed(1)}s`,hx,20); hx+=72 }
  if (G29.rapidFire>0)  { c.fillStyle='#fbbf24'; c.fillText(`🔥 ${G29.rapidFire.toFixed(1)}s`,hx,20); hx+=72 }
  if (G29.shield>0)     { c.fillStyle='#60a5fa'; c.fillText(`🛡️×${G29.shield}`,hx,20); hx+=54 }
  if (G29.bombs>0)      { c.fillStyle='#f97316'; c.fillText(`💣×${G29.bombs}[Q]`,hx,20) }

  c.restore()
}

function g29End() {
  document.getElementById('g29-pause').style.display = 'none'
  window._g29Score = G29.score
  document.getElementById('g29-final-score').textContent = G29.score + ' pts'
  renderMedalDisplay('g29-medal-display','qblaster',G29.score)
  document.getElementById('g29-over').classList.add('show')
  SFX.die()
}

// ── Input ─────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (!document.getElementById('game29').classList.contains('active')) return
  if (e.key === 'Escape') {
    e.preventDefault()
    if (G29.active) { g29Pause() }
    else if (document.getElementById('g29-pause').style.display !== 'none') { g29Resume() }
    return
  }
  if ((e.key === 'q' || e.key === 'Q') && G29.active) { g29UseBomb(); return }
  G29.keys[e.key] = true
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key)) e.preventDefault()
})
document.addEventListener('keyup', e => { G29.keys[e.key] = false })

document.addEventListener('mousemove', e => {
  if (!G29.active) return
  const rect = G29.canvas?.getBoundingClientRect()
  if (rect) { G29.mouseX = e.clientX-rect.left; G29.mouseY = e.clientY-rect.top }
})
document.addEventListener('touchmove', e => {
  if (!G29.active) return
  const rect = G29.canvas?.getBoundingClientRect()
  if (rect) { G29.mouseX = e.touches[0].clientX-rect.left; G29.mouseY = e.touches[0].clientY-rect.top }
}, { passive: true })
