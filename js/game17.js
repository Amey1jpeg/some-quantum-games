// ═══════════════════════════════════════════════════════
//  GAME 17 — QUANTUM SNAKE (slither.io style)
//  A/D or Left/Right = steer  |  W or Shift = boost
//  F = shoot  |  V = toggle auto-aim  |  ESC = pause & shop
//  Type "fartisfart" → dev mode (invincible, instant boss)
// ═══════════════════════════════════════════════════════

const G17_W = 2800
const G17_H = 2800
const G17_SEG_R = 13
const G17_GAP   = 11
const G17_BASE_SPD = 2.4
const G17_BOOST_SPD = 5.0
const G17_TURN  = 0.058

const G17_PU_DEFS = [
  { key:'magnet',    icon:'🧲', name:'Orb Magnet',       cost:60,  max:3, descs:['Attract food 80px','Attract food 180px','Attract food 300px'] },
  { key:'shield',    icon:'🛡️', name:'Shield',            cost:100, max:3, descs:['Absorb 1 hit','Absorb 3 hits','Absorb 5 hits'] },
  { key:'multishot', icon:'💥', name:'Spread Shot',       cost:120, max:2, descs:['Fire 3 bullets','Fire 5 bullets'] },
  { key:'aimlock',   icon:'🎯', name:'Target Lock',       cost:130, max:3, descs:['Auto-aim range 400px','Auto-aim range 700px + lead shots','Auto-aim range ∞ + priority boss'] },
  { key:'nospawn',   icon:'🚫', name:'Enemy Pause',       cost:150, max:3, descs:['No new enemies 20s','No new enemies 20s','No new enemies 20s'], consumable:true },
  { key:'ghost',     icon:'👻', name:'Ghost',             cost:200, max:3, descs:['6s invincibility','6s invincibility','6s invincibility'], consumable:true },
  { key:'slowmo',    icon:'🌀', name:'Quantum Slowdown',  cost:160, max:3, descs:['Slow enemies 10s','Slow enemies 10s','Slow enemies 10s'], consumable:true },
  { key:'energymax', icon:'⚡', name:'Energy Capacity',  cost:80,  max:3, descs:['Max energy 150','Max energy 225','Max energy 300'] },
  { key:'regen',     icon:'💚', name:'Energy Regen',      cost:70,  max:2, descs:['Passive regen','Faster regen'] },
  { key:'reload',    icon:'🔄', name:'Reload Speed',      cost:90,  max:3, descs:['Reload 0.5s (was 0.75s)','Reload 0.3s','Reload 0.13s'] },
]

let G17 = {}
let g17Canvas, g17Ctx, g17Raf
let g17Keys = {}
let g17SecretBuf = ''
let g17DevMode  = false
let g17AravMode = false
let g17AutoAim  = false

function g17IsPrivUser() {
  const n = (cookieGet('player_name') || '').toLowerCase()
  return n === 'arham' || n.includes('arav')
}
let g17KD, g17KU

// ─── helpers ──────────────────────────────────────────
const g17Rng = () => typeof qRandInt === 'function' ? qRandInt(10000)/10000 : Math.random()
const g17Rn  = (lo,hi) => lo + g17Rng()*(hi-lo)
const g17Ri  = n  => Math.floor(g17Rng()*n)
const g17Dist = (ax,ay,bx,by) => { const dx=ax-bx,dy=ay-by; return Math.sqrt(dx*dx+dy*dy) }
const g17Ang  = (ax,ay,bx,by) => Math.atan2(by-ay,bx-ax)
const g17Wrap = (v,max) => ((v%max)+max)%max

// ─── init ──────────────────────────────────────────────
window.initGame17 = function() {
  g17Canvas = document.getElementById('g17-canvas')
  g17Ctx    = g17Canvas.getContext('2d')

  if (g17KD) window.removeEventListener('keydown', g17KD)
  if (g17KU) window.removeEventListener('keyup',   g17KU)
  g17Keys = {}

  g17KD = e => {
    g17Keys[e.code] = true
    const ch = e.key.toLowerCase()
    if (ch.length === 1) {
      g17SecretBuf = (g17SecretBuf + ch).slice(-12)
      if (g17SecretBuf.endsWith('fartisfart')) {
        g17DevMode = !g17DevMode
        g17Msg(g17DevMode ? '💩 DEV MODE ON' : '💩 DEV MODE OFF', '#fbbf24')
      }
      if (g17IsPrivUser() && g17SecretBuf.endsWith('arav')) {
        g17AravMode = !g17AravMode
        g17Msg(g17AravMode ? '😎 ARAV EZ MODE ON' : '😎 ARAV EZ MODE OFF', '#4ade80')
      }
      if (g17SecretBuf.endsWith('boss') && G17.active && !G17.paused) {
        g17SummonCircleBosses(10)
        g17Msg('👁️ SUPER BOSS MODE — 10 CIRCLES!', '#f87171', true)
      }
    }
    if (e.code === 'Escape')  { e.preventDefault(); g17TogglePause(); return }
    if (e.code === 'KeyV')    { g17AutoAim = !g17AutoAim; g17Msg(g17AutoAim?'🎯 Auto-aim ON':'🎯 Auto-aim OFF','#22d3ee') }
    if (e.code === 'KeyF')    { g17Shoot() }
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','ShiftLeft','ShiftRight','ControlLeft','ControlRight'].includes(e.code)) e.preventDefault()
  }
  g17KU = e => { delete g17Keys[e.code] }
  window.addEventListener('keydown', g17KD)
  window.addEventListener('keyup',   g17KU)

  g17Reset()
}

function g17Reset() {
  if (g17Raf) { cancelAnimationFrame(g17Raf); g17Raf = null }
  const cx = G17_W/2, cy = G17_H/2
  const playerSegs = []
  for (let i=0; i<10; i++) playerSegs.push({ x: cx - i*G17_GAP, y: cy })

  G17 = {
    active:true, paused:false,
    score:0, lives:3, kills:0, streak:0, streakTimer:0,
    frameCount:0, wave:1, waveTimer:0,
    camX: cx, camY: cy,
    screenShake: 0,

    player:{
      segs: playerSegs,
      angle: 0,
      energy:100, maxEnergy:100,
      ghostFrames:0, shieldHP:0, invFrames:0,
    },

    food:[], specialFood:[], energyOrbs:[], powerupOrbs:[],
    bullets:[], bossBullets:[], blasts:[],
    enemies:[], boss:null,
    circleBosses:[],   // ⭕ circle bosses
    insideCircle:false,
    particles:[],
    popups:[],     // floating score popups
    msgs:[],

    huntTimer:0, huntMode:false,
    noSpawnFrames:0, slowmoFrames:0,
    puCoins:0,
    puLevels:{ magnet:0,shield:0,multishot:0,aimlock:0,nospawn:0,ghost:0,slowmo:0,energymax:0,regen:0,reload:0 },
    autoAimAngle: 0,    // smooth aim angle for auto-aim display
    autoAimTarget: null,
    bossSpawned:false, bossDefeated:0, bossRespawnTimer:0,
    shootCD:0,
    ringWave: false,
    superMagnet: false,
  }

  for (let i=0;i<22;i++) g17SpawnFood()
  for (let i=0;i<3;  i++) g17SpawnEnemy()

  document.getElementById('g17-over').classList.remove('show')
  g17Loop()
}

// ─── HUD ───────────────────────────────────────────────
function g17HUD() {
  const p = G17.player
  document.getElementById('g17-score-hud').textContent  = G17.score
  document.getElementById('g17-len-hud').textContent    = 'Len '+p.segs.length
  document.getElementById('g17-energy-hud').textContent = '⚡ '+Math.floor(p.energy)
  document.getElementById('g17-coins-hud').textContent  = '🪙 '+G17.puCoins
  document.getElementById('g17-lives-hud').textContent  = 'Lives '+G17.lives
  // reload bar
  const ammoEl = document.getElementById('g17-ammo-hud')
  if (g17AutoAim) {
    const cd = g17ReloadCD()
    const remaining = Math.max(0, G17.shootCD)
    const pct = cd>0 ? Math.round((1-remaining/cd)*100) : 100
    ammoEl.textContent = remaining>0 ? '🔄 '+pct+'%' : '🔫 READY'
    ammoEl.style.borderColor = remaining>0 ? '#a78bfa' : '#4ade80'
    ammoEl.style.color       = remaining>0 ? '#a78bfa' : '#4ade80'
  } else {
    ammoEl.textContent = '🔫 ∞'
    ammoEl.style.borderColor = '#f97316'
    ammoEl.style.color       = '#f97316'
  }
}

function g17Msg(text, color='#fff', big=false) {
  G17.msgs.push({ text, color, frames:110, big })
}

function g17Popup(x, y, text, color='#4ade80') {
  G17.popups.push({ x, y, text, color, frames:55, vy:-1.2 })
}

// ─── spawners ──────────────────────────────────────────
function g17SpawnFood() {
  G17.food.push({
    x:g17Rn(60,G17_W-60), y:g17Rn(60,G17_H-60),
    r:5+g17Ri(5), hue:g17Ri(360), pulse:g17Rng()*Math.PI*2
  })
}

function g17SpawnSpecialFood() {
  const types = ['speed','shield','energy']
  G17.specialFood.push({
    x:g17Rn(80,G17_W-80), y:g17Rn(80,G17_H-80),
    type:types[g17Ri(types.length)], r:10, life:900
  })
}

function g17SpawnEnergyOrb() {
  G17.energyOrbs.push({ x:g17Rn(60,G17_W-60), y:g17Rn(60,G17_H-60), r:8, life:700 })
}

function g17SpawnPowerupOrb() {
  const opts = ['magnet','shield','energymax','regen','multishot','reload','aimlock']
  G17.powerupOrbs.push({
    x:g17Rn(100,G17_W-100), y:g17Rn(100,G17_H-100),
    key:opts[g17Ri(opts.length)], r:11, life:1000
  })
}

function g17SpawnEnemy(big) {
  if (G17.noSpawnFrames > 0) return
  const side = g17Ri(4)
  let x,y
  if (side===0)      { x=g17Rn(0,G17_W); y=60 }
  else if (side===1) { x=g17Rn(0,G17_W); y=G17_H-60 }
  else if (side===2) { x=60;             y=g17Rn(0,G17_H) }
  else               { x=G17_W-60;       y=g17Rn(0,G17_H) }

  const len = big ? 22+g17Ri(18) : 7+g17Ri(9)
  const hue = g17Ri(360)
  const ang = g17Ang(x,y,G17_W/2,G17_H/2)
  const segs = []
  for (let i=0;i<len;i++) segs.push({ x:x-Math.cos(ang)*i*G17_GAP, y:y-Math.sin(ang)*i*G17_GAP })

  // scale speed/aggression with wave
  const baseSpd = 1.3 + g17Rng()*0.7 + G17.wave*0.05
  G17.enemies.push({
    segs, hue, angle:ang,
    speed:Math.min(baseSpd, 3.5),
    state:'wander',
    circleAngle:g17Rng()*Math.PI*2,
    circleDir: g17Ri(2)===0?1:-1,
    wanderTick:0, wanderTarget:ang,
    dead:false,
  })
}

function g17SpawnBoss() {
  const len = 45, cx=G17_W/2
  const segs = []
  for (let i=0;i<len;i++) segs.push({ x:cx, y:100+i*G17_GAP })
  const maxHp = 40 + G17.bossDefeated*10   // nerfed: was 80+20
  G17.boss = {
    segs, angle:Math.PI/2,
    speed:1.3+G17.bossDefeated*0.08,        // nerfed: was 1.6+0.1
    hp:maxHp, maxHp,
    shootCD:120, phase:0,                   // shoots less often: was 80
    circleAngle:g17Rng()*Math.PI*2,
    dead:false,
  }
  g17Msg('⚠️ BOSS SNAKE!','#f87171',true)
}

// ─── circle boss ──────────────────────────────────────
function g17DoSpawnCircleBoss(offsetAngle) {
  const ph=G17.player.segs[0]
  const startR = 750 + g17Rn(-80,80)
  const numSegs = 280   // very long — almost fills the circle
  const segs = []
  for (let i=0;i<numSegs;i++) {
    const a = (offsetAngle||0) + (i/numSegs)*Math.PI*2
    segs.push({ x:ph.x+Math.cos(a)*startR, y:ph.y+Math.sin(a)*startR })
  }
  const maxHp = 350                          // harder: was 200
  G17.circleBosses.push({
    segs,
    orbitAngle: offsetAngle||0,
    orbitR: startR,
    orbitSpd: 0.014 + g17Rng()*0.006,       // faster spin: was 0.007
    shrinkRate: 0.28,                        // faster shrink: was 0.15
    minR: 110,
    cx: ph.x, cy: ph.y,
    followSpeed: 0.018,                      // tighter follow: was 0.008
    hp: maxHp, maxHp,
    dead: false,
    hue: g17Ri(360),
    warningFlash: 0,
  })
}

function g17SummonCircleBosses(n) {
  for (let i=0;i<n;i++) {
    // stagger start angles and radii so they don't all overlap
    g17DoSpawnCircleBoss((i/n)*Math.PI*2)
    // offset radius slightly for each additional boss
    const cb = G17.circleBosses[G17.circleBosses.length-1]
    cb.orbitR += i * 80
    cb.shrinkRate += i * 0.02
  }
}

window.g17SummonCircleBoss = function() {
  if (!G17.active) return
  g17DoSpawnCircleBoss(g17Rng()*Math.PI*2)
  G17.paused = false
  document.getElementById('g17-pause').style.display = 'none'
  G17.screenShake = 20
  // full-screen flash for 1.4s
  const flash = document.getElementById('g17-boss-flash')
  if (flash) {
    const txtEl = document.getElementById('g17-boss-flash-text')
    if (txtEl) {
      if (g17IsPrivUser()) {
        txtEl.innerHTML = '⭕ RING BOSS SUMMONED<br><span style="font-size:1.1rem;font-weight:400">Good luck 😈</span>'
      } else {
        txtEl.innerHTML = '⭕ RING BOSS SUMMONED<br><span style="font-size:1.1rem;font-weight:400">AUTO-AIM JAMMED INSIDE</span>'
      }
    }
    flash.style.display = 'flex'
    setTimeout(() => { flash.style.display = 'none' }, 1400)
  }
  const jamMsg = g17IsPrivUser() ? '⭕ RING BOSS!' : '⭕ RING BOSS — AUTO-AIM JAMMED!'
  g17Msg(jamMsg, '#f87171', true)
}

function g17UpdateCircleBosses() {
  const p=G17.player
  const head=p.segs[0]
  G17.insideCircle = false

  G17.circleBosses = G17.circleBosses.filter(cb => {
    if (cb.dead) return false

    // orbit center follows player
    const fs = cb.followSpeed || 0.018
    cb.cx += (head.x - cb.cx)*fs
    cb.cy += (head.y - cb.cy)*fs

    // shrink
    const slow = G17.slowmoFrames>0 ? 0.3 : 1
    cb.orbitR = Math.max(cb.minR, cb.orbitR - cb.shrinkRate*slow)
    cb.orbitAngle += cb.orbitSpd

    // rebuild positions: all segs orbit at cb.orbitR
    for (let i=0;i<cb.segs.length;i++) {
      const a = cb.orbitAngle + (i/cb.segs.length)*Math.PI*2
      cb.segs[i].x = cb.cx + Math.cos(a)*cb.orbitR
      cb.segs[i].y = cb.cy + Math.sin(a)*cb.orbitR
    }

    // check if player is inside circle (priv users are immune to the jam)
    const dToCenter = g17Dist(head.x,head.y,cb.cx,cb.cy)
    if (dToCenter < cb.orbitR && !g17IsPrivUser()) G17.insideCircle = true

    // flash warning when circle is getting small
    if (cb.orbitR < 300) cb.warningFlash = (cb.warningFlash+1)%20

    // player collision with any segment
    if (p.ghostFrames<=0&&p.invFrames<=0) {
      for (const s of cb.segs) {
        if (g17Dist(head.x,head.y,s.x,s.y) < G17_SEG_R*2.2) {
          g17Hit(); break
        }
      }
    }

    // crush: if radius is at minimum, player takes constant damage
    if (cb.orbitR<=cb.minR+5 && p.ghostFrames<=0&&p.invFrames<=0 && G17.frameCount%40===0) {
      g17Msg('⭕ CRUSHED!','#f87171',true)
      g17Hit()
    }

    return !cb.dead
  })
}

function g17CircleBossHit(cb, dmg=1) {
  cb.hp -= dmg
  cb.warningFlash = 5
  if (cb.hp<=0) {
    cb.dead=true
    const pts=9_999_999_999
    const coins = 1000
    const lenGain = 400
    G17.score = Math.min(G17.score+pts, Number.MAX_SAFE_INTEGER)
    G17.puCoins = Math.min(G17.puCoins+coins, Number.MAX_SAFE_INTEGER)
    G17.kills+=8; G17.streak+=4; G17.streakTimer=300
    // grow player
    const tail = G17.player.segs[G17.player.segs.length-1]
    for (let i=0;i<lenGain;i++) G17.player.segs.push({x:tail.x,y:tail.y})
    g17Sparks(cb.cx,cb.cy,cb.hue,60)
    G17.screenShake=35
    g17Msg('💥 RING BOSS DESTROYED! +'+pts.toLocaleString()+' 🪙+'+coins+' 📏+'+lenGain,'#fbbf24',true)
    g17SpawnPowerupOrb(); g17SpawnPowerupOrb(); g17SpawnPowerupOrb()
  }
}

// ─── auto-aim intercept prediction ────────────────────
function g17FindAimTarget() {
  const h=G17.player.segs[0]
  const lvl=G17.puLevels.aimlock
  const range = lvl>=3?Infinity:lvl>=2?700:lvl>=1?400:300  // base 300 when V toggled without upgrade
  const BSPD=11

  // priority: boss if aimlock lvl3, otherwise nearest enemy head
  let tx=null,ty=null,tvx=0,tvy=0,best=Infinity

  if (lvl>=3&&G17.boss&&!G17.boss.dead) {
    const bH=G17.boss.segs[0]
    const bH2=G17.boss.segs[1]||bH
    tx=bH.x; ty=bH.y
    tvx=bH.x-bH2.x; tvy=bH.y-bH2.y
    best=g17Dist(h.x,h.y,tx,ty)
  }

  for (const en of G17.enemies) {
    if (en.dead) continue
    const eH=en.segs[0]
    const d=g17Dist(h.x,h.y,eH.x,eH.y)
    if (d<best&&d<range) {
      const eH2=en.segs[1]||eH
      best=d; tx=eH.x; ty=eH.y
      tvx=eH.x-eH2.x; tvy=eH.y-eH2.y
    }
  }
  // also consider boss if not already selected
  if (tx===null&&G17.boss&&!G17.boss.dead) {
    const bH=G17.boss.segs[0]
    const d=g17Dist(h.x,h.y,bH.x,bH.y)
    if (d<range) { const bH2=G17.boss.segs[1]||bH; tx=bH.x;ty=bH.y;tvx=bH.x-bH2.x;tvy=bH.y-bH2.y }
  }

  if (tx===null) return null

  // intercept solve: same quadratic as game10
  const dx=tx-h.x, dy=ty-h.y
  const lead = lvl>=2  // lead shots only at level 2+
  let aimX=tx, aimY=ty
  if (lead) {
    const a=tvx*tvx+tvy*tvy-BSPD*BSPD
    const b=2*(dx*tvx+dy*tvy)
    const cc=dx*dx+dy*dy
    if (Math.abs(a)<0.001) {
      if (Math.abs(b)>0.001) { const t=-cc/b; if(t>0){aimX=tx+tvx*t;aimY=ty+tvy*t} }
    } else {
      const disc=b*b-4*a*cc
      if (disc>=0) {
        const t1=(-b-Math.sqrt(disc))/(2*a), t2=(-b+Math.sqrt(disc))/(2*a)
        const t=t1>0&&t2>0?Math.min(t1,t2):t1>0?t1:t2>0?t2:null
        if (t!==null) { aimX=tx+tvx*t; aimY=ty+tvy*t }
      }
    }
  }
  return { aimX, aimY }
}

// ─── shooting ──────────────────────────────────────────
function g17ReloadCD() {
  // frames of cooldown per reload level, only applies when auto-aim ON
  return [45, 30, 18, 8][Math.min(G17.puLevels.reload, 3)]
}

function g17Shoot(overrideAngle) {
  if (G17.paused||!G17.active) return
  if (G17.shootCD>0) return   // unified cooldown gate (auto-aim sets it; manual never sets it)
  SFX.shoot()
  const cd = g17AutoAim && !g17IsPrivUser() ? g17ReloadCD() : 0
  G17.shootCD = cd

  const p=G17.player
  const lvl = G17.puLevels.multishot
  const h=p.segs[0]
  const aim = overrideAngle !== undefined ? overrideAngle : p.angle

  // levels 3+ = AOE blast (no bullets, no lag)
  if (lvl >= 3) {
    const radius = lvl>=6?500:lvl>=5?350:lvl>=4?250:150
    g17DoBlast(h.x, h.y, radius)
    return
  }

  const shots = lvl>=2?5:lvl>=1?3:1
  const spread = shots>1?0.22:0
  for (let i=0;i<shots;i++) {
    const a=aim+(i-(shots-1)/2)*spread
    G17.bullets.push({ x:h.x,y:h.y,vx:Math.cos(a)*11,vy:Math.sin(a)*11,life:90 })
  }
}

function g17DoBlast(x, y, radius) {
  G17.screenShake = Math.max(G17.screenShake, 12)
  g17Sparks(x, y, 30, 30)

  if (G17.ringWave) {
    // persistent expanding wave — damage is handled per-frame in update
    G17.blasts.push({ x, y, r:0, wave:true, speed:18, life:220 })
    return
  }

  // instant AOE — kill/damage everything in radius
  G17.blasts.push({ x, y, r:0, maxR:radius, life:28 })

  for (const en of G17.enemies) {
    if (en.dead) continue
    if (g17Dist(x,y,en.segs[0].x,en.segs[0].y) < radius) {
      en.dead = true; g17KillEnemy(en)
    }
  }
  if (G17.boss && !G17.boss.dead) {
    if (g17Dist(x,y,G17.boss.segs[0].x,G17.boss.segs[0].y) < radius) {
      G17.boss.hp -= 15
      g17Sparks(G17.boss.segs[0].x,G17.boss.segs[0].y,0,20)
      if (G17.boss.hp<=0) g17KillBoss()
    }
  }
  for (const cb of G17.circleBosses) {
    if (cb.dead) continue
    let hits = 0
    for (const s of cb.segs) {
      if (g17Dist(x,y,s.x,s.y) < radius) hits++
    }
    if (hits > 0) g17CircleBossHit(cb, Math.ceil(hits/4))
  }
}

// ─── main loop ─────────────────────────────────────────
function g17Loop() {
  g17Raf = requestAnimationFrame(g17Loop)
  if (!G17.active||!document.getElementById('game17').classList.contains('active')) {
    cancelAnimationFrame(g17Raf); g17Raf=null; return
  }
  if (G17.paused) return
  g17Update()
  g17Draw()
  g17HUD()
}

function g17Update() {
  const p=G17.player
  G17.frameCount++
  if (G17.shootCD>0) G17.shootCD--
  if (G17.screenShake>0) G17.screenShake--
  if (G17.streakTimer>0) { G17.streakTimer--; if (!G17.streakTimer) G17.streak=0 }

  // wave progression
  G17.waveTimer++
  if (G17.waveTimer>=1800) { G17.waveTimer=0; G17.wave++ }

  // ── auto-aim steering + auto-fire ─────
  // auto-aim is jammed when player is inside a circle boss
  if (g17AutoAim && !G17.insideCircle) {
    const tgt = g17FindAimTarget()
    G17.autoAimTarget = tgt
    if (tgt) {
      const h=p.segs[0]
      const wantAngle = g17Ang(h.x,h.y,tgt.aimX,tgt.aimY)
      G17.autoAimAngle = wantAngle
      // fire toward target regardless of snake direction
      if (G17.shootCD<=0) g17Shoot(wantAngle)
    }
  } else {
    G17.autoAimTarget = null
  }

  // ── steer ─────────────────────────────
  const wasBoost = (g17Keys['KeyW']||g17Keys['ShiftLeft']||g17Keys['ShiftRight']) && p.energy>0
  if (wasBoost && !G17._lastBoost) SFX.whoosh()
  G17._lastBoost = wasBoost
  const boost = wasBoost
  // Ctrl = energy shield (hold to stay invincible, drains energy)
  const ctrlHeld = g17Keys['ControlLeft'] || g17Keys['ControlRight']
  if (ctrlHeld && p.energy>0) {
    p.invFrames = Math.max(p.invFrames, 4)
    p.energy = Math.max(0, p.energy - 0.9)
    if (G17.frameCount%60===0) g17Msg('🛡️ Shield active','#60a5fa')
  }
  if (g17Keys['ArrowLeft']  || g17Keys['KeyA']) p.angle -= G17_TURN
  if (g17Keys['ArrowRight'] || g17Keys['KeyD']) p.angle += G17_TURN

  if (g17DevMode) { p.energy=p.maxEnergy; p.ghostFrames=10 }

  const spd = boost ? G17_BOOST_SPD : G17_BASE_SPD
  const nx = g17Wrap(p.segs[0].x+Math.cos(p.angle)*spd, G17_W)
  const ny = g17Wrap(p.segs[0].y+Math.sin(p.angle)*spd, G17_H)
  p.segs.unshift({ x:nx,y:ny })
  p.segs.pop()

  if (boost) p.energy=Math.max(0,p.energy-1)
  if (G17.puLevels.regen>0) p.energy=Math.min(p.maxEnergy,p.energy+(G17.puLevels.regen>=2?0.18:0.08))
  if (p.ghostFrames>0) p.ghostFrames--
  if (p.invFrames>0)   p.invFrames--

  const magR = G17.superMagnet ? 99999 : ([0,80,180,300][G17.puLevels.magnet]||0)
  if (G17.noSpawnFrames>0) G17.noSpawnFrames--
  if (G17.slowmoFrames>0)  G17.slowmoFrames--

  const head=p.segs[0]

  // ── food collection ────────────────────
  G17.food = G17.food.filter(f => {
    f.pulse+=0.07
    if (magR>0) {
      const d=g17Dist(head.x,head.y,f.x,f.y)
      if (d<magR) { const a=g17Ang(f.x,f.y,head.x,head.y); f.x+=Math.cos(a)*4; f.y+=Math.sin(a)*4 }
    }
    if (g17Dist(head.x,head.y,f.x,f.y)<G17_SEG_R+f.r) {
      SFX.coin()
      for (let i=0;i<3;i++) { const t=p.segs[p.segs.length-1]; p.segs.push({x:t.x,y:t.y}) }
      p.energy=Math.min(p.maxEnergy,p.energy+16)
      G17.score+=10+(G17.streak?G17.streak*2:0)
      G17.puCoins+=2
      G17.huntTimer=0; G17.huntMode=false
      g17Sparks(f.x,f.y,f.hue,8)
      g17Popup(f.x,f.y-10,'+10','#4ade80')
      g17SpawnFood()
      return false
    }
    return true
  })

  // ── special food ───────────────────────
  G17.specialFood = G17.specialFood.filter(sf => {
    sf.life--
    if (sf.life<=0) return false
    if (g17Dist(head.x,head.y,sf.x,sf.y)<G17_SEG_R+sf.r) {
      if (sf.type==='speed')  { p.ghostFrames=Math.max(p.ghostFrames,180); g17Msg('💨 Speed Burst!','#22d3ee') }
      if (sf.type==='shield') { p.shieldHP=Math.min(p.shieldHP+2,5); g17Msg('🛡️ Shield +2','#60a5fa') }
      if (sf.type==='energy') { p.energy=p.maxEnergy; g17Msg('⚡ Full energy!','#facc15') }
      G17.score+=30; G17.puCoins+=5
      g17Sparks(sf.x,sf.y,60,12)
      return false
    }
    return true
  })

  // ── energy orbs ────────────────────────
  G17.energyOrbs = G17.energyOrbs.filter(o => {
    o.life--
    if (o.life<=0) return false
    if (magR>0) {
      const d=g17Dist(head.x,head.y,o.x,o.y)
      if (d<magR) { const a=g17Ang(o.x,o.y,head.x,head.y); o.x+=Math.cos(a)*5; o.y+=Math.sin(a)*5 }
    }
    if (g17Dist(head.x,head.y,o.x,o.y)<G17_SEG_R+o.r) {
      p.energy=Math.min(p.maxEnergy,p.energy+40)
      G17.score+=8; g17Sparks(o.x,o.y,55,8)
      return false
    }
    return true
  })

  // ── powerup orbs ───────────────────────
  G17.powerupOrbs = G17.powerupOrbs.filter(o => {
    o.life--
    if (o.life<=0) return false
    if (magR>0) {
      const d=g17Dist(head.x,head.y,o.x,o.y)
      if (d<magR) { const a=g17Ang(o.x,o.y,head.x,head.y); o.x+=Math.cos(a)*5; o.y+=Math.sin(a)*5 }
    }
    if (g17Dist(head.x,head.y,o.x,o.y)<G17_SEG_R+o.r) {
      const def=G17_PU_DEFS.find(d=>d.key===o.key)
      if (def) {
        const cur=G17.puLevels[o.key]
        if (cur<def.max) { G17.puLevels[o.key]=cur+1; g17Msg(def.icon+' '+def.name+' level '+(cur+1),'#fbbf24'); g17ApplyPU(o.key,cur+1) }
        else { G17.puCoins+=60; g17Popup(o.x,o.y,'🪙+60','#fbbf24') }
      }
      g17Sparks(o.x,o.y,280,15)
      return false
    }
    return true
  })

  // ── hunt mode ──────────────────────────
  if (!G17.huntMode) {
    G17.huntTimer++
    if (G17.huntTimer>600) { G17.huntMode=true; G17.screenShake=20; g17Msg('🚨 HUNT MODE! Eat now!','#f87171',true) }
  }

  // ── enemy AI ───────────────────────────
  const slow = G17.slowmoFrames>0 ? 0.35 : 1

  for (const en of G17.enemies) {
    if (en.dead) continue
    const eH=en.segs[0]
    const dToPlayer=g17Dist(eH.x,eH.y,head.x,head.y)

    // state machine
    if (G17.huntMode)          en.state='circle'
    else if (dToPlayer<350)    en.state='hunt'
    else                       en.state='wander'

    let target=en.angle
    if (en.state==='hunt') {
      target=g17Ang(eH.x,eH.y,head.x,head.y)
    } else if (en.state==='circle') {
      en.circleAngle += 0.014*en.circleDir
      const r=Math.max(120,Math.min(280,dToPlayer))
      target=g17Ang(eH.x,eH.y, head.x+Math.cos(en.circleAngle)*r, head.y+Math.sin(en.circleAngle)*r)
    } else {
      // wander with occasional target changes
      en.wanderTick++
      if (en.wanderTick>90+g17Ri(120)) {
        en.wanderTick=0
        en.wanderTarget=en.angle+(g17Rng()-.5)*Math.PI
      }
      target=en.wanderTarget
    }

    let da=target-en.angle
    while(da>Math.PI)  da-=2*Math.PI
    while(da<-Math.PI) da+=2*Math.PI
    en.angle+=Math.sign(da)*Math.min(Math.abs(da),0.045)

    const espd=en.speed*slow
    en.segs.unshift({ x:g17Wrap(eH.x+Math.cos(en.angle)*espd,G17_W), y:g17Wrap(eH.y+Math.sin(en.angle)*espd,G17_H) })
    en.segs.pop()
  }

  // ── boss AI ────────────────────────────
  if (G17.boss&&!G17.boss.dead) {
    const b=G17.boss, bH=b.segs[0]
    b.circleAngle+=0.010
    const bR=280+Math.sin(G17.frameCount*0.005)*80
    const btx=head.x+Math.cos(b.circleAngle)*bR
    const bty=head.y+Math.sin(b.circleAngle)*bR
    let bDa=g17Ang(bH.x,bH.y,btx,bty)-b.angle
    while(bDa>Math.PI)  bDa-=2*Math.PI
    while(bDa<-Math.PI) bDa+=2*Math.PI
    b.angle+=Math.sign(bDa)*Math.min(Math.abs(bDa),0.025)

    const bspd=b.speed*slow
    b.segs.unshift({ x:g17Wrap(bH.x+Math.cos(b.angle)*bspd,G17_W), y:g17Wrap(bH.y+Math.sin(b.angle)*bspd,G17_H) })
    b.segs.pop()

  }

  // ── bullets ────────────────────────────
  G17.bullets = G17.bullets.filter(b => {
    b.x+=b.vx; b.y+=b.vy; b.life--
    if (b.life<=0||b.x<0||b.x>G17_W||b.y<0||b.y>G17_H) return false
    for (const en of G17.enemies) {
      if (en.dead) continue
      for (let si=0;si<en.segs.length;si++) {
        if (g17Dist(b.x,b.y,en.segs[si].x,en.segs[si].y)<G17_SEG_R+3) {
          en.segs.splice(si,1)
          g17Sparks(b.x,b.y,en.hue,6)
          G17.score+=20; G17.puCoins++
          g17Popup(b.x,b.y,'+20','#f97316')
          if (en.segs.length<3) { en.dead=true; g17KillEnemy(en) }
          return false
        }
      }
    }
    if (G17.boss&&!G17.boss.dead) {
      const bH=G17.boss.segs[0]
      if (g17Dist(b.x,b.y,bH.x,bH.y)<G17_SEG_R*2.5) {
        G17.boss.hp--
        g17Sparks(b.x,b.y,0,6)
        G17.score+=30; g17Popup(b.x,b.y,'+30','#fbbf24')
        if (G17.boss.hp<=0) g17KillBoss()
        return false
      }
    }
    // hit circle bosses
    for (const cb of G17.circleBosses) {
      if (cb.dead) continue
      for (let si=0;si<cb.segs.length;si+=3) {  // check every 3rd seg for perf
        if (g17Dist(b.x,b.y,cb.segs[si].x,cb.segs[si].y)<G17_SEG_R*2) {
          g17CircleBossHit(cb,1)
          g17Sparks(b.x,b.y,cb.hue,6)
          g17Popup(b.x,b.y,'+30','#f87171')
          G17.score+=30
          return false
        }
      }
    }
    return true
  })

  // ── collision ─────────────────────────
  // enemy head → player body = enemy dies
  for (const en of G17.enemies) {
    if (en.dead) continue
    for (let si=1;si<p.segs.length;si++) {
      if (g17Dist(en.segs[0].x,en.segs[0].y,p.segs[si].x,p.segs[si].y)<G17_SEG_R*1.6) {
        en.dead=true; g17KillEnemy(en); break
      }
    }
  }

  // player head → enemy body = player hit
  if (p.ghostFrames<=0&&p.invFrames<=0) {
    outer: for (const en of G17.enemies) {
      if (en.dead) continue
      for (const s of en.segs) {
        if (g17Dist(head.x,head.y,s.x,s.y)<G17_SEG_R*1.5) { g17Hit(); break outer }
      }
    }
    if (G17.boss&&!G17.boss.dead) {
      for (const s of G17.boss.segs) {
        if (g17Dist(head.x,head.y,s.x,s.y)<G17_SEG_R*1.8) { g17Hit(); break }
      }
    }
  }

  G17.enemies = G17.enemies.filter(e=>!e.dead)

  // ── circle bosses ─────────────────────
  g17UpdateCircleBosses()

  // ── visual updates ─────────────────────
  G17.blasts = G17.blasts.filter(b => {
    if (b.wave) {
      const prevR = b.r
      b.r += b.speed
      b.life--
      const hit = G17_SEG_R + b.speed
      for (const en of G17.enemies) {
        if (en.dead) continue
        const d = g17Dist(b.x,b.y,en.segs[0].x,en.segs[0].y)
        if (d >= prevR - hit && d < b.r + hit) { en.dead=true; g17KillEnemy(en) }
      }
      if (G17.boss && !G17.boss.dead) {
        const d = g17Dist(b.x,b.y,G17.boss.segs[0].x,G17.boss.segs[0].y)
        if (d >= prevR - hit && d < b.r + hit) {
          G17.boss.hp -= 5
          if (G17.boss.hp<=0) g17KillBoss()
        }
      }
      for (const cb of G17.circleBosses) {
        if (cb.dead) continue
        let hits = 0
        for (const s of cb.segs) {
          const d = g17Dist(b.x,b.y,s.x,s.y)
          if (d >= prevR - hit && d < b.r + hit) hits++
        }
        if (hits > 0) g17CircleBossHit(cb, Math.ceil(hits/6))
      }
      return b.r < 2600 && b.life > 0
    }
    b.r += (b.maxR - b.r) * 0.35
    b.life--; return b.life > 0
  })
  G17.particles = G17.particles.filter(pt => {
    pt.x+=pt.vx; pt.y+=pt.vy; pt.vx*=0.88; pt.vy*=0.88; pt.life--; return pt.life>0
  })
  G17.popups = G17.popups.filter(pp => {
    pp.y+=pp.vy; pp.frames--; return pp.frames>0
  })
  G17.msgs = G17.msgs.filter(m=>{ m.frames--; return m.frames>0 })

  // ── spawning ───────────────────────────
  if (G17.food.length<18)  g17SpawnFood()
  if (G17.frameCount%700===0)  g17SpawnEnergyOrb()
  if (G17.frameCount%1100===0) g17SpawnPowerupOrb()
  if (G17.frameCount%500===0)  g17SpawnSpecialFood()
  if (G17.frameCount%420===0&&G17.enemies.length<6+G17.wave&&G17.noSpawnFrames<=0) g17SpawnEnemy()
  if (G17.frameCount%900===0&&G17.enemies.length<10&&G17.noSpawnFrames<=0) g17SpawnEnemy(true)

  if (G17.bossRespawnTimer>0) G17.bossRespawnTimer--
  if (!G17.bossSpawned && G17.bossRespawnTimer<=0 && G17.kills>=(g17DevMode?3:12+G17.bossDefeated*5)) {
    G17.bossSpawned=true; g17SpawnBoss()
  }

  // ── camera ─────────────────────────────
  const W=g17Canvas.width, H=g17Canvas.height
  G17.camX += (head.x - G17.camX)*0.1
  G17.camY += (head.y - G17.camY)*0.1
}

// ─── events ────────────────────────────────────────────
function g17Hit() {
  const p=G17.player
  if (p.ghostFrames>0||p.invFrames>0) return
  if (g17AravMode) { p.invFrames=90; return }
  if (p.shieldHP>0) {
    p.shieldHP--; p.invFrames=60; G17.screenShake=8
    g17Msg('🛡️ Shield! ('+(p.shieldHP)+' left)','#60a5fa')
    return
  }
  G17.lives--; p.invFrames=150; G17.streak=0; G17.screenShake=25
  g17Msg('💥 OUCH! Lives: '+G17.lives,'#f87171',true)
  // shed tail on hit
  const newLen=Math.max(8,Math.floor(p.segs.length*0.65))
  const shed=p.segs.splice(newLen)
  for (const s of shed.slice(0,8)) G17.food.push({x:s.x+(g17Rng()-.5)*30,y:s.y+(g17Rng()-.5)*30,r:6,hue:120,pulse:0})
  if (G17.lives<=0) g17Over()
}

function g17KillEnemy(en) {
  G17.kills++; G17.streak++; G17.streakTimer=180
  const pts=60+en.segs.length*2+(G17.streak>1?G17.streak*15:0)
  G17.score+=pts; G17.puCoins+=5+Math.floor(G17.streak/2)
  for (const s of en.segs.slice(0,6)) G17.food.push({x:s.x+(g17Rng()-.5)*20,y:s.y+(g17Rng()-.5)*20,r:6,hue:en.hue,pulse:0})
  g17Sparks(en.segs[0].x,en.segs[0].y,en.hue,22)
  const label=G17.streak>1?'×'+G17.streak+' STREAK! +'+pts:'+'+pts
  g17Popup(en.segs[0].x,en.segs[0].y-15,label,G17.streak>2?'#fbbf24':'#4ade80')
  if (G17.streak>=3) g17Msg('🔥 '+G17.streak+'x KILL STREAK!','#fbbf24',true)
  p17RefillAmmo()
}

function p17RefillAmmo() {
  // no-op: ammo replaced by reload cooldown
}

function g17KillBoss() {
  const pts=1000+G17.bossDefeated*500
  const coins = 100 + G17.bossDefeated*50
  G17.score+=pts; G17.puCoins+=coins; G17.bossDefeated++
  G17.kills+=5; G17.streak+=3; G17.streakTimer=300
  g17Sparks(G17.boss.segs[0].x,G17.boss.segs[0].y,0,50)
  G17.boss.dead=true; G17.boss=null
  G17.bossSpawned=false
  // random cooldown 45–120 seconds before next boss
  G17.bossRespawnTimer = Math.floor(g17Rn(2700, 7200))
  G17.screenShake=30
  g17Msg('🏆 BOSS DOWN! +'+pts+' pts  🪙+'+coins,'#fbbf24',true)
  g17SpawnPowerupOrb(); g17SpawnPowerupOrb()
}

function g17Sparks(x,y,hue,n=14) {
  for (let i=0;i<n;i++) {
    const a=g17Rng()*Math.PI*2, s=1+g17Rng()*4
    G17.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,hue,life:28+g17Ri(18),r:2+g17Rng()*2})
  }
}

function g17ApplyPU(key,lvl) {
  const p=G17.player
  if (key==='energymax') { const mx=[100,150,225,300]; p.maxEnergy=mx[Math.min(lvl,3)]; p.energy=Math.min(p.energy,p.maxEnergy) }
  if (key==='shield')    { const hp=[0,1,3,5]; p.shieldHP=hp[Math.min(lvl,3)] }
  if (key==='reload')    { /* no state to set — g17ReloadCD() reads the level directly */ }
  if (key==='aimlock')   { g17Msg('🎯 Target Lock Lv'+lvl+' — auto-aim upgraded!','#22d3ee') }
}

function g17Over() {
  SFX.die()
  G17.active=false
  window._g17Score=G17.score
  document.getElementById('g17-final-score').textContent=G17.score
  const m=G17.score>=2000?'🥇 Gold':G17.score>=600?'🥈 Silver':G17.score>=150?'🥉 Bronze':''
  document.getElementById('g17-medal-display').textContent=m
  document.getElementById('g17-over').classList.add('show')
}

// ─── pause ─────────────────────────────────────────────
window.g17TogglePause = function() {
  if (!G17.active) return
  G17.paused=!G17.paused
  const el=document.getElementById('g17-pause')
  if (G17.paused) { el.style.display='flex'; g17BuildShop() }
  else            el.style.display='none'
}

function g17BuildShop() {
  const el=document.getElementById('g17-pu-list')
  document.getElementById('g17-pause-coins').textContent='🪙 '+G17.puCoins
  el.innerHTML=''

  // Circle boss summon button (always available)
  const cbDiv=document.createElement('div')
  cbDiv.style.cssText='display:flex;align-items:center;background:rgba(239,68,68,.12);border:1px solid #ef444466;border-radius:8px;padding:.45rem .7rem;gap:.5rem;margin-bottom:.3rem;'
  const cbCount=G17.circleBosses.filter(c=>!c.dead).length
  cbDiv.innerHTML=`<span style="font-size:1.2rem">⭕</span>
    <div style="flex:1;min-width:0">
      <div style="font-size:.8rem;font-weight:600;color:#fca5a5">Circle Boss${cbCount>0?' ('+cbCount+' active)':''}</div>
      <div style="font-size:.7rem;color:var(--muted)">Giant snake orbits &amp; shrinks around you. Auto-aim jammed inside!</div>
    </div>
    <button onmousedown="g17SummonCircleBoss()" ontouchstart="g17SummonCircleBoss();event.preventDefault()"
      style="background:#ef4444;color:#fff;border:none;border-radius:6px;padding:.28rem .6rem;cursor:pointer;font-size:.78rem;white-space:nowrap">
      ⭕ Summon</button>`
  el.appendChild(cbDiv)

  for (const def of G17_PU_DEFS) {
    const cur=G17.puLevels[def.key]
    const maxed=cur>=def.max
    const cost=Math.round(def.cost*Math.pow(1.3,cur))
    const desc=def.descs[Math.min(cur,def.descs.length-1)]
    const canBuy=!maxed&&G17.puCoins>=cost
    const div=document.createElement('div')
    div.style.cssText='display:flex;align-items:center;background:rgba(255,255,255,.06);border-radius:8px;padding:.45rem .7rem;gap:.5rem;'
    div.innerHTML=`<span style="font-size:1.2rem">${def.icon}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:.8rem;font-weight:600;color:#e2e8f0">${def.name}${cur>0?' Lv'+cur:''}</div>
        <div style="font-size:.7rem;color:var(--muted)">${maxed?'MAXED':desc}</div>
      </div>
      <button onmousedown="g17Buy('${def.key}')" ontouchstart="g17Buy('${def.key}');event.preventDefault()"
        style="background:${canBuy?'var(--accent)':'rgba(255,255,255,.08)'};color:${canBuy?'#000':'var(--muted)'};border:none;border-radius:6px;padding:.28rem .6rem;cursor:${canBuy?'pointer':'default'};font-size:.78rem;white-space:nowrap"
        ${maxed||!canBuy?'disabled':''}>
        ${maxed?'MAX':'🪙'+cost}</button>`
    el.appendChild(div)
  }

  // ── priv-only: ring wave + super magnet ──
  if (g17IsPrivUser()) {
    const privSpecials = [
      {
        key:'ringWave', icon:'🌊', label:'Ring Wave',
        desc_off:'Shots fire an expanding ring that kills everything it passes through',
        desc_on:'Active — shots fire a spreading death ring',
        cost:30, fn:'g17BuyRingWave'
      },
      {
        key:'superMagnet', icon:'🧲', label:'Super Magnet',
        desc_off:'Every orb &amp; food on the entire map flies straight to you',
        desc_on:'Active — all orbs pulled to you from anywhere',
        cost:40, fn:'g17BuySuperMagnet'
      },
    ]
    for (const ps of privSpecials) {
      const bought = G17[ps.key]
      const canBuy = !bought && G17.puCoins >= ps.cost
      const div = document.createElement('div')
      div.style.cssText='display:flex;align-items:center;background:rgba(167,139,250,.08);border:1px solid #a78bfa44;border-radius:8px;padding:.45rem .7rem;gap:.5rem;margin-bottom:.1rem;'
      div.innerHTML=`<span style="font-size:1.2rem">${ps.icon}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:.8rem;font-weight:600;color:#a78bfa">${ps.label} <span style="font-size:.65rem;opacity:.7">🌟 special</span></div>
          <div style="font-size:.7rem;color:var(--muted)">${bought?ps.desc_on:ps.desc_off}</div>
        </div>
        <button onmousedown="${ps.fn}()" ontouchstart="${ps.fn}();event.preventDefault()"
          style="background:${bought?'#14532d':canBuy?'#a78bfa':'rgba(255,255,255,.08)'};color:${bought?'#4ade80':canBuy?'#000':'var(--muted)'};border:none;border-radius:6px;padding:.28rem .6rem;cursor:${bought||!canBuy?'default':'pointer'};font-size:.78rem;white-space:nowrap"
          ${bought||!canBuy?'disabled':''}>
          ${bought?'✓ ON':'🪙'+ps.cost}</button>`
      el.appendChild(div)
    }
  }

  // ── priv-only: extra multishot tiers ──
  if (g17IsPrivUser()) {
    const privTiers = [
      { level:3, label:'150px AOE blast', cost:5 },
      { level:4, label:'250px AOE blast', cost:5 },
      { level:5, label:'350px AOE blast', cost:5 },
      { level:6, label:'500px AOE blast', cost:5 },
    ]
    const cur = G17.puLevels.multishot
    for (const t of privTiers) {
      if (cur >= t.level) continue   // already bought, skip
      const canBuy = G17.puCoins >= t.cost
      const div = document.createElement('div')
      div.style.cssText='display:flex;align-items:center;background:rgba(251,191,36,.08);border:1px solid #fbbf2444;border-radius:8px;padding:.45rem .7rem;gap:.5rem;'
      div.innerHTML=`<span style="font-size:1.2rem">💥</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:.8rem;font-weight:600;color:#fbbf24">Spread Shot Lv${t.level} <span style="font-size:.65rem;opacity:.7">🌟 special</span></div>
          <div style="font-size:.7rem;color:var(--muted)">${t.label}</div>
        </div>
        <button onmousedown="g17BuyPrivMultishot(${t.level},${t.cost})" ontouchstart="g17BuyPrivMultishot(${t.level},${t.cost});event.preventDefault()"
          style="background:${canBuy?'#fbbf24':'rgba(255,255,255,.08)'};color:${canBuy?'#000':'var(--muted)'};border:none;border-radius:6px;padding:.28rem .6rem;cursor:${canBuy?'pointer':'default'};font-size:.78rem;white-space:nowrap"
          ${!canBuy?'disabled':''}>🪙${t.cost}</button>`
      el.appendChild(div)
      break  // only show the next tier to buy
    }
  }
}

window.g17BuyRingWave = function() {
  if (!g17IsPrivUser() || G17.ringWave) return
  const cost = 30
  if (G17.puCoins < cost) return
  G17.puCoins -= cost
  G17.ringWave = true
  g17Msg('🌊 RING WAVE — shots expand forever!', '#a78bfa', true)
  g17BuildShop()
}

window.g17BuySuperMagnet = function() {
  if (!g17IsPrivUser() || G17.superMagnet) return
  const cost = 40
  if (G17.puCoins < cost) return
  G17.puCoins -= cost
  G17.superMagnet = true
  g17Msg('🧲 SUPER MAGNET — all orbs fly to you!', '#a78bfa', true)
  g17BuildShop()
}

window.g17BuyPrivMultishot = function(level, cost) {
  if (!g17IsPrivUser()) return
  if (G17.puLevels.multishot >= level) return
  if (G17.puCoins < cost) return
  G17.puCoins -= cost
  G17.puLevels.multishot = level
  const radii=[0,0,0,150,250,350,500]
  g17Msg('💥 AOE BLAST LV'+level+' — '+radii[level]+'px radius!', '#fbbf24', true)
  g17BuildShop()
}

window.g17Buy = function(key) {
  const def=G17_PU_DEFS.find(d=>d.key===key)
  if (!def) return
  const cur=G17.puLevels[key]
  if (cur>=def.max) return
  const cost=Math.round(def.cost*Math.pow(1.3,cur))
  if (G17.puCoins<cost) return
  G17.puCoins-=cost; G17.puLevels[key]++
  g17ApplyPU(key,G17.puLevels[key])
  if (key==='nospawn')  { G17.noSpawnFrames=1200; g17Msg('🚫 No new enemies 20s','#f97316') }
  if (key==='ghost')    { G17.player.ghostFrames=360; g17Msg('👻 Ghost 6s!','#a78bfa') }
  if (key==='slowmo')   { G17.slowmoFrames=600; g17Msg('🌀 Enemies slowed!','#22d3ee') }
  g17BuildShop()
}

window.g17EndGame = function() {
  document.getElementById('g17-pause').style.display='none'
  G17.paused=false
  g17Over()
}

// ─── draw ──────────────────────────────────────────────
function g17Draw() {
  const cv=g17Canvas, c=g17Ctx
  const arena=document.getElementById('g17-arena')
  if (cv.width!==arena.clientWidth||cv.height!==arena.clientHeight) {
    cv.width=arena.clientWidth; cv.height=arena.clientHeight
  }
  const W=cv.width, H=cv.height

  c.clearRect(0,0,W,H)
  // Canvases get no CSS variables, so read the theme directly
  const _lt = typeof qgLight === 'function' && qgLight()
  c.fillStyle=_lt?'#eef1f7':'#080c14'; c.fillRect(0,0,W,H)

  // shake transform
  c.save()
  if (G17.screenShake>0) {
    const s=G17.screenShake*0.7
    c.translate((g17Rng()-.5)*s,(g17Rng()-.5)*s)
  }
  c.translate(W/2-G17.camX, H/2-G17.camY)

  // ── grid ───────────────────────────────
  c.strokeStyle=_lt?'rgba(0,0,0,.06)':'rgba(255,255,255,.035)'; c.lineWidth=1
  const gs=120, gx0=Math.floor((G17.camX-W/2)/gs)*gs, gy0=Math.floor((G17.camY-H/2)/gs)*gs
  for (let x=gx0;x<G17.camX+W/2+gs;x+=gs) { c.beginPath();c.moveTo(x,G17.camY-H/2);c.lineTo(x,G17.camY+H/2);c.stroke() }
  for (let y=gy0;y<G17.camY+H/2+gs;y+=gs) { c.beginPath();c.moveTo(G17.camX-W/2,y);c.lineTo(G17.camX+W/2,y);c.stroke() }

  // ── world border ───────────────────────
  c.strokeStyle='#4ade8055'; c.lineWidth=4
  c.strokeRect(0,0,G17_W,G17_H)
  // soft glow on border
  c.strokeStyle='#4ade8011'; c.lineWidth=20
  c.strokeRect(0,0,G17_W,G17_H)

  // ── food ───────────────────────────────
  for (const f of G17.food) {
    const r=f.r*(1+Math.sin(f.pulse)*0.18)
    c.beginPath(); c.arc(f.x,f.y,r,0,Math.PI*2)
    c.fillStyle=`hsl(${f.hue},80%,62%)`
    c.shadowColor=`hsl(${f.hue},80%,62%)`; c.shadowBlur=10
    c.fill(); c.shadowBlur=0
  }

  // ── special food ───────────────────────
  for (const sf of G17.specialFood) {
    const col=sf.type==='speed'?'#22d3ee':sf.type==='shield'?'#60a5fa':'#f97316'
    const ico=sf.type==='speed'?'💨':sf.type==='shield'?'🛡️':'🔫'
    c.beginPath(); c.arc(sf.x,sf.y,sf.r,0,Math.PI*2)
    c.fillStyle=col+'88'; c.strokeStyle=col; c.lineWidth=2
    c.fill(); c.stroke()
    c.font='11px sans-serif'; c.textAlign='center'; c.textBaseline='middle'
    c.fillText(ico,sf.x,sf.y)
  }

  // ── energy orbs ────────────────────────
  for (const o of G17.energyOrbs) {
    c.beginPath(); c.arc(o.x,o.y,o.r,0,Math.PI*2)
    c.fillStyle='#facc15aa'; c.shadowColor='#facc15'; c.shadowBlur=14
    c.fill(); c.shadowBlur=0
    c.font='11px sans-serif'; c.textAlign='center'; c.textBaseline='middle'
    c.fillText('⚡',o.x,o.y)
  }

  // ── powerup orbs ───────────────────────
  for (const o of G17.powerupOrbs) {
    const def=G17_PU_DEFS.find(d=>d.key===o.key)
    c.beginPath(); c.arc(o.x,o.y,o.r,0,Math.PI*2)
    c.fillStyle='#7c3aed99'; c.strokeStyle='#a78bfa'; c.lineWidth=2
    c.fill(); c.stroke()
    c.font='12px sans-serif'; c.textAlign='center'; c.textBaseline='middle'
    c.fillText(def?def.icon:'?',o.x,o.y)
  }

  // ── particles ──────────────────────────
  c.globalAlpha=1
  for (const pt of G17.particles) {
    c.beginPath(); c.arc(pt.x,pt.y,pt.r,0,Math.PI*2)
    c.globalAlpha=pt.life/46
    c.fillStyle=`hsl(${pt.hue},90%,66%)`; c.fill()
  }
  c.globalAlpha=1

  // ── bullets ────────────────────────────
  c.fillStyle='#f97316'; c.shadowColor='#f97316'; c.shadowBlur=10
  for (const b of G17.bullets) { c.beginPath();c.arc(b.x,b.y,4,0,Math.PI*2);c.fill() }
  c.shadowBlur=0
  // ── AOE blasts ─────────────────────────
  for (const b of G17.blasts) {
    if (b.wave) {
      // travelling ring wave — bright thin ring that fades as it expands
      const a = Math.min(1, b.life/60)
      c.beginPath(); c.arc(b.x,b.y,b.r,0,Math.PI*2)
      c.strokeStyle=`rgba(167,139,250,${a*0.95})`; c.lineWidth=5+a*6
      c.shadowColor='#a78bfa'; c.shadowBlur=25
      c.stroke()
      c.beginPath(); c.arc(b.x,b.y,b.r-14,0,Math.PI*2)
      c.strokeStyle=`rgba(236,72,153,${a*0.5})`; c.lineWidth=3
      c.stroke()
      c.shadowBlur=0
    } else {
      const a = b.life/28
      c.beginPath(); c.arc(b.x,b.y,b.r,0,Math.PI*2)
      c.strokeStyle=`rgba(249,115,22,${a*0.9})`; c.lineWidth=8+a*12
      c.shadowColor='#f97316'; c.shadowBlur=30
      c.stroke()
      c.beginPath(); c.arc(b.x,b.y,b.r*0.55,0,Math.PI*2)
      c.strokeStyle=`rgba(251,191,36,${a*0.5})`; c.lineWidth=4
      c.stroke()
      c.shadowBlur=0
    }
  }
  // ── enemies ────────────────────────────
  for (const en of G17.enemies) {
    if (en.dead) continue
    g17DrawSnake(c,en.segs,`hsl(${en.hue},65%,52%)`,`hsl(${en.hue},75%,72%)`)
  }

  // ── circle bosses ──────────────────────
  for (const cb of G17.circleBosses) {
    if (cb.dead) continue
    const rage = cb.hp < cb.maxHp*0.4
    const warn = cb.orbitR < 300
    const flash = warn && cb.warningFlash > 10

    // draw the ring body as a thick arc — use canvas arc for performance
    // but also draw segment dots for the snake look
    const segStep = Math.max(1, Math.floor(cb.segs.length/120))  // at most 120 draw points
    c.lineWidth = G17_SEG_R*2.2
    c.strokeStyle = flash ? '#fff' : rage ? `hsl(${cb.hue},90%,55%)` : `hsl(${cb.hue},75%,48%)`
    c.shadowColor = flash ? '#fff' : `hsl(${cb.hue},90%,60%)`
    c.shadowBlur = rage ? 28 : 14
    c.lineCap = 'round'
    c.beginPath()
    let first=true
    for (let i=0;i<cb.segs.length;i+=segStep) {
      if (first) { c.moveTo(cb.segs[i].x,cb.segs[i].y); first=false }
      else        c.lineTo(cb.segs[i].x,cb.segs[i].y)
    }
    // close the loop back to first
    c.lineTo(cb.segs[0].x,cb.segs[0].y)
    c.stroke()
    c.shadowBlur=0; c.lineWidth=1

    // head dot
    const cH=cb.segs[0]
    c.beginPath(); c.arc(cH.x,cH.y,G17_SEG_R+6,0,Math.PI*2)
    c.fillStyle=rage?'#fca5a5':`hsl(${cb.hue},85%,72%)`
    c.shadowColor=c.fillStyle; c.shadowBlur=20
    c.fill(); c.shadowBlur=0

    // HP bar floating at top of circle
    const bw=100, bh=7
    const barX=cb.cx-bw/2, barY=cb.cy-cb.orbitR-30
    c.fillStyle='#1f2937'; c.fillRect(barX,barY,bw,bh)
    c.fillStyle=rage?'#ef4444':`hsl(${cb.hue},75%,55%)`
    c.fillRect(barX,barY,bw*(cb.hp/cb.maxHp),bh)
    c.fillStyle=_lt?'#111':'#fff'; c.font='bold 10px sans-serif'; c.textAlign='center'
    c.fillText(rage?'⚠️ CIRCLE BOSS ⚠️':'⭕ CIRCLE BOSS', cb.cx, barY-4)

    // radius ring (faint, shows boundary)
    if (warn) {
      c.beginPath(); c.arc(cb.cx,cb.cy,cb.orbitR,0,Math.PI*2)
      c.strokeStyle=`rgba(239,68,68,${flash?0.5:0.2})`; c.lineWidth=2
      c.setLineDash([10,8]); c.stroke(); c.setLineDash([])
    }
  }

  // ── boss ───────────────────────────────
  if (G17.boss&&!G17.boss.dead) {
    const b=G17.boss
    // pulsing red aura at low hp
    const rage=b.hp<b.maxHp*0.4
    g17DrawSnake(c,b.segs,rage?'#dc2626':'#b91c1c',rage?'#fca5a5':'#f87171',true)
    const bH=b.segs[0]
    // boss hp bar
    const bw=90,bh=7
    c.fillStyle='#1f2937'; c.fillRect(bH.x-bw/2,bH.y-G17_SEG_R-22,bw,bh)
    c.fillStyle=rage?'#ef4444':'#f87171'
    c.fillRect(bH.x-bw/2,bH.y-G17_SEG_R-22,bw*(b.hp/b.maxHp),bh)
    c.fillStyle=_lt?'#111':'#fff'; c.font='bold 11px sans-serif'; c.textAlign='center'
    c.fillText(rage?'⚠️BOSS⚠️':'BOSS',bH.x,bH.y-G17_SEG_R-24)
  }

  // ── player ─────────────────────────────
  const p=G17.player
  const ghost=p.ghostFrames>0
  const blink=p.invFrames>0&&Math.floor(G17.frameCount/5)%2===0
  if (!blink) {
    c.globalAlpha=ghost?0.45:1
    g17DrawSnake(c,p.segs,'#22c55e','#86efac',false,true)
    c.globalAlpha=1
  }

  // aim indicator
  if (g17AutoAim&&!blink) {
    const h=p.segs[0]
    if (G17.autoAimTarget) {
      // line to predicted intercept point
      c.strokeStyle='#22d3eeaa'; c.lineWidth=1.5; c.setLineDash([6,5])
      c.beginPath(); c.moveTo(h.x,h.y); c.lineTo(G17.autoAimTarget.aimX,G17.autoAimTarget.aimY); c.stroke()
      // crosshair at intercept
      c.strokeStyle='#22d3ee'; c.lineWidth=1.5; c.setLineDash([])
      const cx2=G17.autoAimTarget.aimX, cy2=G17.autoAimTarget.aimY, cr=9
      c.beginPath(); c.moveTo(cx2-cr,cy2); c.lineTo(cx2+cr,cy2); c.stroke()
      c.beginPath(); c.moveTo(cx2,cy2-cr); c.lineTo(cx2,cy2+cr); c.stroke()
      c.beginPath(); c.arc(cx2,cy2,cr,0,Math.PI*2); c.stroke()
    } else {
      c.strokeStyle='#22d3ee44'; c.lineWidth=1; c.setLineDash([5,7])
      c.beginPath(); c.moveTo(h.x,h.y); c.lineTo(h.x+Math.cos(p.angle)*160,h.y+Math.sin(p.angle)*160)
      c.stroke()
    }
    c.setLineDash([])
  }

  // world-space popups
  for (const pp of G17.popups) {
    c.globalAlpha=pp.frames/55
    c.font='bold 15px sans-serif'; c.textAlign='center'; c.fillStyle=pp.color
    c.shadowColor=pp.color; c.shadowBlur=6
    c.fillText(pp.text,pp.x,pp.y)
    c.shadowBlur=0
  }
  c.globalAlpha=1

  c.restore()

  // ── screen-space overlays ──────────────
  // messages
  let my=H/2-90
  for (const m of G17.msgs) {
    const a=Math.min(1,m.frames/20)
    c.globalAlpha=a
    c.font=`bold ${m.big?20:16}px sans-serif`; c.textAlign='center'
    c.fillStyle=m.color; c.shadowColor=m.color; c.shadowBlur=10
    c.fillText(m.text,W/2,my); c.shadowBlur=0; my+=m.big?28:22
  }
  c.globalAlpha=1

  // kill streak banner
  if (G17.streak>=3&&G17.streakTimer>0) {
    const a=Math.min(1,G17.streakTimer/30)
    c.globalAlpha=a*0.9
    c.fillStyle='#fbbf2433'; c.fillRect(0,H-44,W,40)
    c.font='bold 18px sans-serif'; c.textAlign='center'; c.fillStyle='#fbbf24'
    c.fillText('🔥 '+G17.streak+'x KILL STREAK!',W/2,H-18)
    c.globalAlpha=1
  }

  // auto-aim jammed indicator
  if (G17.insideCircle && g17AutoAim) {
    const a=0.6+Math.sin(G17.frameCount*0.15)*0.3
    c.globalAlpha=a; c.fillStyle='#f87171'
    c.font='bold 13px sans-serif'; c.textAlign='center'
    c.fillText('🚫 AUTO-AIM JAMMED — INSIDE CIRCLE',W/2,72)
    c.globalAlpha=1
  }

  // hunt mode warning
  if (G17.huntMode) {
    const a=0.5+Math.sin(G17.frameCount*0.12)*0.3
    c.globalAlpha=a; c.fillStyle='#ef4444'
    c.font='bold 14px sans-serif'; c.textAlign='center'
    c.fillText('🚨 HUNT MODE — EAT SOMETHING! 🚨',W/2,56)
    c.globalAlpha=1
  }

  // energy bar (bottom-centre)
  const barW=200, barX=W/2-barW/2, barY=H-26
  c.fillStyle=_lt?'rgba(0,0,0,.12)':'rgba(0,0,0,.4)'; c.fillRect(barX-2,barY-8,barW+4,10)
  c.fillStyle=p.energy>30?'#facc15':'#ef4444'
  c.fillRect(barX,barY-7,barW*(p.energy/p.maxEnergy),8)
  c.fillStyle=_lt?'rgba(0,0,0,.45)':'rgba(255,255,255,.3)'; c.font='9px monospace'; c.textAlign='center'
  c.fillText('⚡ ENERGY',W/2,barY-10)

  // reload bar (only when auto-aim on)
  if (g17AutoAim) {
    const rcd=g17ReloadCD(), rem=Math.max(0,G17.shootCD)
    const pct=rcd>0?1-rem/rcd:1
    const ry=H-10
    c.fillStyle=_lt?'rgba(0,0,0,.12)':'rgba(0,0,0,.4)'; c.fillRect(barX-2,ry-8,barW+4,10)
    c.fillStyle=rem>0?'#a78bfa':'#4ade80'
    c.fillRect(barX,ry-7,barW*pct,8)
    c.fillStyle=_lt?'rgba(0,0,0,.45)':'rgba(255,255,255,.3)'; c.font='9px monospace'; c.textAlign='center'
    c.fillText(rem>0?'🔄 RELOADING':'🔫 READY',W/2,ry-10)
  }

  // wave badge
  c.fillStyle=_lt?'rgba(0,0,0,.06)':'rgba(255,255,255,.08)'; c.fillRect(W-68,6,62,20)
  c.fillStyle=_lt?'#475569':'#94a3b8'; c.font='11px monospace'; c.textAlign='center'
  c.fillText('Wave '+G17.wave,W-37,20)

  // minimap
  const mmW=90,mmH=90,mmX=W-mmW-8,mmY=H-mmH-50
  c.fillStyle=_lt?'rgba(255,255,255,.8)':'rgba(0,0,0,.6)'; c.fillRect(mmX,mmY,mmW,mmH)
  c.strokeStyle=_lt?'rgba(0,0,0,.15)':'rgba(255,255,255,.12)'; c.lineWidth=1; c.strokeRect(mmX,mmY,mmW,mmH)
  const sx=mmW/G17_W, sy=mmH/G17_H
  c.fillStyle=_lt?'rgba(0,0,0,.25)':'rgba(255,255,255,.2)'
  for (const f of G17.food) c.fillRect(mmX+f.x*sx,mmY+f.y*sy,1,1)
  for (const en of G17.enemies) {
    if (en.dead) continue
    c.fillStyle=`hsl(${en.hue},70%,55%)`
    c.beginPath();c.arc(mmX+en.segs[0].x*sx,mmY+en.segs[0].y*sy,2.5,0,Math.PI*2);c.fill()
  }
  if (G17.boss&&!G17.boss.dead) {
    c.fillStyle='#f87171'
    c.beginPath();c.arc(mmX+G17.boss.segs[0].x*sx,mmY+G17.boss.segs[0].y*sy,4.5,0,Math.PI*2);c.fill()
  }
  for (const cb of G17.circleBosses) {
    if (cb.dead) continue
    c.strokeStyle=`hsl(${cb.hue},75%,55%)`; c.lineWidth=1.5
    c.beginPath(); c.arc(mmX+cb.cx*sx,mmY+cb.cy*sy,cb.orbitR*sx,0,Math.PI*2); c.stroke()
  }
  c.fillStyle='#4ade80'
  c.beginPath();c.arc(mmX+p.segs[0].x*sx,mmY+p.segs[0].y*sy,3.5,0,Math.PI*2);c.fill()

  if (g17DevMode)  { c.fillStyle='#fbbf24';c.font='11px monospace';c.textAlign='left';c.fillText('DEV',8,15) }
}

function g17DrawSnake(c, segs, bodyCol, headCol, isBoss=false, isPlayer=false) {
  if (!segs.length) return
  for (let i=segs.length-1;i>=1;i--) {
    const s=segs[i]
    const t=1-i/segs.length
    const r=G17_SEG_R*(0.55+0.45*t)
    c.globalAlpha=0.5+t*0.5
    c.beginPath(); c.arc(s.x,s.y,r,0,Math.PI*2)
    c.fillStyle=bodyCol; c.fill()
  }
  c.globalAlpha=1
  const h=segs[0]
  const hr=G17_SEG_R+(isBoss?4:isPlayer?2:1)
  c.beginPath(); c.arc(h.x,h.y,hr,0,Math.PI*2)
  c.fillStyle=headCol
  c.shadowColor=headCol; c.shadowBlur=isBoss?20:12
  c.fill(); c.shadowBlur=0

  // eyes
  if (segs.length>1) {
    const a=g17Ang(segs[1].x,segs[1].y,h.x,h.y)
    for (const side of [-1,1]) {
      const ex=h.x+Math.cos(a+side*Math.PI/2)*5
      const ey=h.y+Math.sin(a+side*Math.PI/2)*5
      c.beginPath();c.arc(ex,ey,3,0,Math.PI*2);c.fillStyle='#fff';c.fill()
      c.beginPath();c.arc(ex+Math.cos(a),ey+Math.sin(a),1.5,0,Math.PI*2);c.fillStyle='#000';c.fill()
    }
  }
}
