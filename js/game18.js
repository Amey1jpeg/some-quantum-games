// ═══════════════════════════════════════════════════════
//  GAME 18 — QUANTUM WHIP
//  Move mouse/finger to swing the rope — hit orbs with the TIP
//  90 seconds, combo multiplier, random events
// ═══════════════════════════════════════════════════════

const G18_NODES    = 14    // shorter rope = more responsive
const G18_SEG      = 28    // px per segment
const G18_GRAV     = 0.22  // lighter hang
const G18_DAMP     = 0.970 // snappier
const G18_ITER     = 18    // stiffer constraints
const G18_TIP_R    = 15
const G18_GAME_SEC = 90

let G18 = {}
let g18Canvas, g18Ctx, g18Raf
let g18Mouse = { x: 300, y: 250 }
let g18TouchUsed = false

// ─── helpers ──────────────────────────────────────────
const g18Ri  = (lo, hi) => Math.floor(Math.random() * (hi - lo)) + lo
const g18Rn  = (lo, hi) => lo + Math.random() * (hi - lo)
const g18Dist = (ax,ay,bx,by) => { const dx=ax-bx,dy=ay-by; return Math.sqrt(dx*dx+dy*dy) }
const g18Lerp = (a, b, t) => a + (b - a) * t

// ─── orb definitions ──────────────────────────────────
const G18_ORB_DEFS = [
  { type:'normal', color:'#facc15', pts:100, r:16, spd:1.2, label:'●'  },
  { type:'swift',  color:'#22d3ee', pts:150, r:12, spd:3.0, label:'●'  },
  { type:'split',  color:'#c084fc', pts:200, r:19, spd:1.1, label:'◈'  },
  { type:'bomb',   color:'#f87171', pts:300, r:21, spd:0.9, label:'💥' },
  { type:'chrono', color:'#4ade80', pts:0,   r:15, spd:1.6, label:'⏱' },
  { type:'gold',   color:'#fbbf24', pts:500, r:17, spd:0,   label:'★'  },
]
//        normal swift split bomb chrono gold
const G18_WEIGHTS = [42, 22, 14, 10,  8,     4]

// ─── init ──────────────────────────────────────────────
window.initGame18 = function() {
  g18Canvas = document.getElementById('g18-canvas')
  g18Ctx    = g18Canvas.getContext('2d')

  g18Canvas.onmousemove = e => {
    const r = g18Canvas.getBoundingClientRect()
    g18Mouse.x = (e.clientX - r.left) * (g18Canvas.width  / r.width)
    g18Mouse.y = (e.clientY - r.top)  * (g18Canvas.height / r.height)
  }
  g18Canvas.onmousedown = e => {
    SFX.resume()
    const r = g18Canvas.getBoundingClientRect()
    g18Mouse.x = (e.clientX - r.left) * (g18Canvas.width  / r.width)
    g18Mouse.y = (e.clientY - r.top)  * (g18Canvas.height / r.height)
    g18CrackWhip()
  }
  g18Canvas.ontouchmove = e => {
    e.preventDefault()
    const r = g18Canvas.getBoundingClientRect()
    const t = e.touches[0]
    g18Mouse.x = (t.clientX - r.left) * (g18Canvas.width  / r.width)
    g18Mouse.y = (t.clientY - r.top)  * (g18Canvas.height / r.height)
    g18TouchUsed = true
  }
  g18Canvas.ontouchstart = e => {
    e.preventDefault()
    SFX.resume()
    const r = g18Canvas.getBoundingClientRect()
    const t = e.touches[0]
    g18Mouse.x = (t.clientX - r.left) * (g18Canvas.width  / r.width)
    g18Mouse.y = (t.clientY - r.top)  * (g18Canvas.height / r.height)
    g18CrackWhip()
  }

  g18Reset()
}

function g18Reset() {
  if (g18Raf) { cancelAnimationFrame(g18Raf); g18Raf = null }

  // init rope — hangs straight down from centre-top area
  const cx = 300, cy = 80
  const nodes = []
  for (let i = 0; i < G18_NODES; i++)
    nodes.push({ x: cx, y: cy + i * G18_SEG, px: cx, py: cy + i * G18_SEG - 0.01 })
  g18Mouse = { x: cx, y: cy }

  G18 = {
    active: true,
    score: 0,
    combo: 0, comboTimer: 0,
    timeLeft: G18_GAME_SEC * 60,
    frameCount: 0,

    nodes,
    gravDir: 1,
    gravEvent: 0,
    wind: 0, windTarget: 0, windTimer: g18Ri(300,700),
    magnetEvent: 0,   // orbs pulled toward tip

    orbs: [], particles: [], msgs: [],
    tipTrail: [],
    screenShake: 0, crackFlash: 0,
    eventTimer: g18Ri(900, 1500),
  }

  for (let i = 0; i < 6; i++) g18SpawnOrb()

  document.getElementById('g18-over').classList.remove('show')
  g18Loop()
}

// ─── crack whip ───────────────────────────────────────
function g18CrackWhip() {
  if (!G18.active) return
  const nodes = G18.nodes
  const tip   = nodes[nodes.length - 1]
  const anc   = nodes[0]
  // direction from anchor to tip
  const dx = tip.x - anc.x, dy = tip.y - anc.y
  const d  = Math.sqrt(dx*dx + dy*dy) || 1
  const spd = 22
  // snap tip outward along rope direction
  tip.px = tip.x - (dx/d) * spd
  tip.py = tip.y - (dy/d) * spd
  // also give mid-nodes a kick for a whip wave effect
  for (let i = Math.floor(nodes.length*0.5); i < nodes.length; i++) {
    const t = (i - nodes.length*0.5) / (nodes.length*0.5)
    nodes[i].px = nodes[i].x - (dx/d) * spd * t * 0.5
    nodes[i].py = nodes[i].y - (dy/d) * spd * t * 0.5
  }
  G18.crackFlash = 8
  SFX.whoosh()
}

// ─── rope physics ──────────────────────────────────────
function g18UpdateRope() {
  const nodes = G18.nodes
  const W = g18Canvas.width  || 600
  const H = g18Canvas.height || 500

  // verlet step (skip anchor)
  for (let i = 1; i < nodes.length; i++) {
    const n = nodes[i]
    const vx = (n.x - n.px) * G18_DAMP
    const vy = (n.y - n.py) * G18_DAMP
    n.px = n.x; n.py = n.y
    n.x += vx + G18.wind
    n.y += vy + G18_GRAV * G18.gravDir
    // soft boundary
    if (n.x < 4)   { n.x = 4;   n.px = n.x + Math.abs(vx) * 0.4 }
    if (n.x > W-4) { n.x = W-4; n.px = n.x - Math.abs(vx) * 0.4 }
    if (n.y < 4)   { n.y = 4;   n.py = n.y + Math.abs(vy) * 0.4 }
    if (n.y > H-4) { n.y = H-4; n.py = n.y - Math.abs(vy) * 0.4 }
  }

  // anchor
  nodes[0].x = g18Mouse.x; nodes[0].y = g18Mouse.y
  nodes[0].px = g18Mouse.x; nodes[0].py = g18Mouse.y

  // constraint solve
  for (let iter = 0; iter < G18_ITER; iter++) {
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i], b = nodes[i+1]
      const dx = b.x - a.x, dy = b.y - a.y
      const dist = Math.sqrt(dx*dx + dy*dy) || 0.001
      const diff = (dist - G18_SEG) / dist * 0.5
      if (i > 0) { a.x += dx * diff; a.y += dy * diff }
      b.x -= dx * diff; b.y -= dy * diff
    }
    nodes[0].x = g18Mouse.x; nodes[0].y = g18Mouse.y
  }
}

// ─── orb spawning ──────────────────────────────────────
function g18SpawnOrb(ox, oy, typeOverride, small=false) {
  const W = g18Canvas.width  || 600
  const H = g18Canvas.height || 500

  let idx = 0
  if (typeOverride) {
    idx = G18_ORB_DEFS.findIndex(d => d.type === typeOverride)
    if (idx < 0) idx = 0
  } else {
    const roll = Math.random() * 100
    let cum = 0
    for (let i = 0; i < G18_WEIGHTS.length; i++) {
      cum += G18_WEIGHTS[i]
      if (roll < cum) { idx = i; break }
    }
  }
  const def = G18_ORB_DEFS[idx]
  const x = ox !== undefined ? ox : g18Rn(50, W - 50)
  const y = oy !== undefined ? oy : g18Rn(50, H - 50)
  const angle = Math.random() * Math.PI * 2
  const spd   = def.type === 'gold'
    ? 0  // gold starts still, then drifts erratically
    : def.spd * (small ? 1.6 : 1)

  G18.orbs.push({
    x, y, vx: Math.cos(angle)*spd, vy: Math.sin(angle)*spd,
    r: small ? def.r * 0.65 : def.r,
    type: def.type, color: def.color,
    pts: small ? Math.floor(def.pts * 0.6) : def.pts,
    pulse: Math.random() * Math.PI * 2,
    wanderTick: 0, wanderAngle: angle,
    small, dead: false,
  })
}

function g18Sparks(x, y, color, n=14) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2
    const s = 1 + Math.random() * 5
    G18.particles.push({ x, y, vx:Math.cos(a)*s, vy:Math.sin(a)*s, color, life:30+g18Ri(20), r:2+Math.random()*2.5 })
  }
}

function g18Msg(text, color='#fff', big=false) {
  G18.msgs.push({ text, color, frames: big ? 110 : 85, big })
}

// ─── collect orb ──────────────────────────────────────
function g18CollectOrb(orb) {
  SFX.hit()
  if (G18.comboTimer > 0) G18.combo++
  else G18.combo = 1
  G18.comboTimer = 95

  const mult = G18.combo >= 5 ? 3 : G18.combo >= 3 ? 2 : 1
  const pts = orb.pts * mult
  G18.score = Math.min(G18.score + pts, Number.MAX_SAFE_INTEGER)

  g18Sparks(orb.x, orb.y, orb.color, orb.type === 'bomb' ? 30 : 16)
  G18.screenShake = Math.max(G18.screenShake, orb.type === 'bomb' ? 15 : orb.type === 'gold' ? 14 : 5)

  // popup above orb
  const comboLabel = G18.combo > 1 ? `×${G18.combo}  +${pts}` : `+${pts}`
  G18.msgs.push({ text: comboLabel, color: G18.combo >= 3 ? '#fbbf24' : orb.color,
    frames: 65, big: G18.combo >= 3, wx: orb.x, wy: orb.y - 24 })

  if (orb.type === 'split') {
    g18SpawnOrb(orb.x - 22, orb.y, 'normal', true)
    g18SpawnOrb(orb.x + 22, orb.y, 'normal', true)
    g18Msg('✂️ SPLIT!', '#c084fc')
  }
  if (orb.type === 'bomb') {
    let chained = 0
    for (const o of G18.orbs) {
      if (!o.dead && o !== orb && g18Dist(orb.x, orb.y, o.x, o.y) < 130) {
        o.dead = true
        G18.score = Math.min(G18.score + o.pts, Number.MAX_SAFE_INTEGER)
        g18Sparks(o.x, o.y, o.color, 10)
        chained++
      }
    }
    if (chained > 0) g18Msg('💥 CHAIN ×' + chained + '!', '#f87171', true)
    G18.screenShake = 20
  }
  if (orb.type === 'chrono') {
    G18.timeLeft = Math.min(G18.timeLeft + 180, G18_GAME_SEC * 60)
    g18Msg('⏱ +3 SECONDS!', '#4ade80', true)
  }
  if (orb.type === 'gold') {
    g18Msg('⭐ GOLDEN ORB! +500', '#fbbf24', true)
  }
  if (G18.combo >= 5) g18Msg('🔥 ' + G18.combo + 'x COMBO!', '#fbbf24', true)
  else if (G18.combo === 3) g18Msg('⚡ TRIPLE COMBO!', '#a78bfa')
}

// ─── random events ─────────────────────────────────────
function g18TriggerEvent() {
  const pool = ['wind_gust','wind_gust','gravity_flip','orb_frenzy','golden_rain','magnet_pull','gravity_flip']
  const ev   = pool[g18Ri(0, pool.length)]

  if (ev === 'wind_gust') {
    G18.windTarget = (Math.random() < 0.5 ? -1 : 1) * g18Rn(1.2, 2.2)
    G18.windTimer  = 180
    g18Msg('🌬️ WIND GUST!', '#7dd3fc', true)
  }
  if (ev === 'gravity_flip') {
    G18.gravDir    = -1
    G18.gravEvent  = 240
    g18Msg('⬆️ GRAVITY FLIPPED!', '#c084fc', true)
  }
  if (ev === 'orb_frenzy') {
    for (let i = 0; i < 9; i++) g18SpawnOrb()
    g18Msg('🌀 ORB FRENZY!', '#22d3ee', true)
  }
  if (ev === 'golden_rain') {
    for (let i = 0; i < 3; i++) g18SpawnOrb(undefined, undefined, 'gold')
    g18Msg('⭐ GOLDEN RAIN!', '#fbbf24', true)
  }
  if (ev === 'magnet_pull') {
    G18.magnetEvent = 300   // 5s — orbs drift toward rope tip
    g18Msg('🧲 MAGNET PULL — orbs fly to your tip!', '#a78bfa', true)
  }
}

// ─── main update ──────────────────────────────────────
function g18Update() {
  G18.frameCount++
  G18.timeLeft--
  if (G18.timeLeft <= 0) { g18Over(); return }

  if (G18.comboTimer > 0) G18.comboTimer--
  else { if (G18.combo > 1) SFX.miss(); G18.combo = 0 }
  if (G18.screenShake > 0) G18.screenShake--
  if (G18.crackFlash  > 0) G18.crackFlash--

  // wind
  G18.windTimer--
  if (G18.windTimer <= 0) {
    G18.windTarget = g18Rn(-0.5, 0.5)
    G18.windTimer  = g18Ri(300, 700)
  }
  G18.wind += (G18.windTarget - G18.wind) * 0.025

  // timed events
  if (G18.gravEvent > 0) {
    G18.gravEvent--
    if (G18.gravEvent === 0) { G18.gravDir = 1; g18Msg('Gravity restored', '#94a3b8') }
  }
  if (G18.magnetEvent > 0) G18.magnetEvent--

  // random event trigger
  G18.eventTimer--
  if (G18.eventTimer <= 0) {
    g18TriggerEvent()
    G18.eventTimer = g18Ri(750, 1600)
  }

  g18UpdateRope()

  // tip trail
  const tip = G18.nodes[G18.nodes.length - 1]
  G18.tipTrail.unshift({ x: tip.x, y: tip.y })
  if (G18.tipTrail.length > 14) G18.tipTrail.pop()

  const W = g18Canvas.width  || 600
  const H = g18Canvas.height || 500

  // orb update + collision
  G18.orbs = G18.orbs.filter(orb => {
    if (orb.dead) return false
    orb.pulse += 0.07

    // gold wanders erratically
    if (orb.type === 'gold') {
      orb.wanderTick++
      if (orb.wanderTick > 40 + g18Ri(40)) {
        orb.wanderTick = 0
        orb.wanderAngle += (Math.random() - 0.5) * Math.PI
        orb.vx = Math.cos(orb.wanderAngle) * 2.5
        orb.vy = Math.sin(orb.wanderAngle) * 2.5
      }
    }

    // magnet: drift orb toward tip
    if (G18.magnetEvent > 0) {
      const d = g18Dist(orb.x, orb.y, tip.x, tip.y)
      if (d > 1) {
        orb.vx += (tip.x - orb.x) / d * 0.25
        orb.vy += (tip.y - orb.y) / d * 0.25
        // dampen to avoid runaway speed
        const spd = Math.sqrt(orb.vx*orb.vx + orb.vy*orb.vy)
        if (spd > 5) { orb.vx = orb.vx/spd*5; orb.vy = orb.vy/spd*5 }
      }
    }

    orb.x += orb.vx; orb.y += orb.vy
    if (orb.x < orb.r)   { orb.x = orb.r;   orb.vx *= -0.85 }
    if (orb.x > W-orb.r) { orb.x = W-orb.r; orb.vx *= -0.85 }
    if (orb.y < orb.r)   { orb.y = orb.r;   orb.vy *= -0.85 }
    if (orb.y > H-orb.r) { orb.y = H-orb.r; orb.vy *= -0.85 }

    // tip collision
    if (g18Dist(tip.x, tip.y, orb.x, orb.y) < G18_TIP_R + orb.r) {
      g18CollectOrb(orb); return false
    }
    return true
  })

  // keep orbs topped up
  if (G18.orbs.length < 4)  g18SpawnOrb()
  if (G18.frameCount % 25 === 0 && G18.orbs.length < 7) g18SpawnOrb()

  G18.particles = G18.particles.filter(p => {
    p.x += p.vx; p.y += p.vy; p.vx *= 0.88; p.vy *= 0.88; p.life--; return p.life > 0
  })
  G18.msgs = G18.msgs.filter(m => { m.frames--; return m.frames > 0 })
}

// ─── draw ──────────────────────────────────────────────
function g18Draw() {
  const cv = g18Canvas, c = g18Ctx
  const arena = document.getElementById('g18-arena')
  if (cv.width !== arena.clientWidth || cv.height !== arena.clientHeight) {
    cv.width = arena.clientWidth; cv.height = arena.clientHeight
    // re-centre anchor on resize
    g18Mouse.x = cv.width / 2; g18Mouse.y = cv.height * 0.15
  }
  const W = cv.width, H = cv.height

  c.clearRect(0, 0, W, H)
  // Canvases get no CSS variables, so read the theme directly
  const _lt = typeof qgLight === 'function' && qgLight()
  c.fillStyle = _lt ? '#eef1f7' : '#060a12'; c.fillRect(0, 0, W, H)

  c.save()
  if (G18.screenShake > 0) {
    const s = G18.screenShake * 0.55
    c.translate((Math.random()-.5)*s, (Math.random()-.5)*s)
  }

  // grid
  c.strokeStyle = _lt ? 'rgba(0,0,0,.05)' : 'rgba(255,255,255,.022)'; c.lineWidth = 1
  for (let x = 0; x < W; x += 80) { c.beginPath(); c.moveTo(x,0); c.lineTo(x,H); c.stroke() }
  for (let y = 0; y < H; y += 80) { c.beginPath(); c.moveTo(0,y); c.lineTo(W,y); c.stroke() }

  // magnet event radial glow from tip
  if (G18.magnetEvent > 0) {
    const tip0 = G18.nodes[G18.nodes.length-1]
    const a = G18.magnetEvent / 300
    const grad = c.createRadialGradient(tip0.x, tip0.y, 10, tip0.x, tip0.y, 180)
    grad.addColorStop(0, `rgba(167,139,250,${a*0.18})`)
    grad.addColorStop(1, 'transparent')
    c.fillStyle = grad; c.fillRect(0, 0, W, H)
  }

  // particles
  c.globalAlpha = 1
  for (const p of G18.particles) {
    c.globalAlpha = p.life / 50
    c.beginPath(); c.arc(p.x, p.y, p.r, 0, Math.PI*2)
    c.fillStyle = p.color; c.fill()
  }
  c.globalAlpha = 1

  // orbs
  for (const orb of G18.orbs) {
    if (orb.dead) continue
    const pulse = 1 + Math.sin(orb.pulse) * (orb.type === 'gold' ? 0.2 : 0.1)
    const r = orb.r * pulse

    // outer glow
    c.beginPath(); c.arc(orb.x, orb.y, r + 8, 0, Math.PI*2)
    c.fillStyle = orb.color + '1a'; c.fill()

    c.beginPath(); c.arc(orb.x, orb.y, r, 0, Math.PI*2)
    c.fillStyle = orb.color + 'bb'
    c.shadowColor = orb.color; c.shadowBlur = orb.type === 'gold' ? 28 : 16
    c.fill(); c.shadowBlur = 0

    // inner shine
    c.beginPath(); c.arc(orb.x - r*0.25, orb.y - r*0.25, r*0.28, 0, Math.PI*2)
    c.fillStyle = 'rgba(255,255,255,0.25)'; c.fill()

    // label / emoji
    c.font = `bold ${Math.floor(r * 0.88)}px sans-serif`
    c.textAlign = 'center'; c.textBaseline = 'middle'
    c.fillStyle = '#fff'
    const def = G18_ORB_DEFS.find(d => d.type === orb.type)
    c.fillText(def ? def.label : '●', orb.x, orb.y + 1)
  }

  // tip ghost trail
  for (let i = 0; i < G18.tipTrail.length; i++) {
    const t = G18.tipTrail[i]
    const frac = 1 - i / G18.tipTrail.length
    c.globalAlpha = frac * 0.55
    c.beginPath(); c.arc(t.x, t.y, G18_TIP_R * frac * 0.65, 0, Math.PI*2)
    c.fillStyle = '#a78bfa'; c.fill()
  }
  c.globalAlpha = 1

  // rope body — gradient from anchor (green) to tip (purple)
  const nodes = G18.nodes
  c.lineCap = 'round'; c.lineJoin = 'round'
  for (let i = 0; i < nodes.length - 1; i++) {
    const t = i / (nodes.length - 1)
    // colour lerps: #22c55e → #a78bfa
    const r = Math.round(g18Lerp(34,  167, t))
    const g = Math.round(g18Lerp(197, 139, t))
    const b = Math.round(g18Lerp(94,  250, t))
    c.strokeStyle = `rgba(${r},${g},${b},${0.45 + t*0.55})`
    c.lineWidth   = g18Lerp(5.5, 1.5, t)
    c.beginPath(); c.moveTo(nodes[i].x, nodes[i].y); c.lineTo(nodes[i+1].x, nodes[i+1].y)
    c.stroke()
  }

  // rope segment dots (subtle)
  for (let i = 2; i < nodes.length - 1; i += 2) {
    const t = i / nodes.length
    c.beginPath(); c.arc(nodes[i].x, nodes[i].y, 2 - t * 1.2, 0, Math.PI * 2)
    c.fillStyle = `rgba(150,200,255,${0.18 + t*0.1})`; c.fill()
  }

  // tip
  const tip = nodes[nodes.length - 1]
  const tipGlow = G18.crackFlash > 0 ? 60 : 30
  const tipCol  = G18.crackFlash > 0 ? '#fff' : '#a78bfa'
  c.beginPath(); c.arc(tip.x, tip.y, G18_TIP_R * (G18.crackFlash > 0 ? 1.4 : 1), 0, Math.PI*2)
  c.fillStyle = tipCol
  c.shadowColor = tipCol; c.shadowBlur = tipGlow
  c.fill(); c.shadowBlur = 0
  c.beginPath(); c.arc(tip.x, tip.y, G18_TIP_R * 0.45, 0, Math.PI*2)
  c.fillStyle = '#ede9fe'; c.fill()

  // anchor dot
  const anc = nodes[0]
  c.beginPath(); c.arc(anc.x, anc.y, 9, 0, Math.PI*2)
  c.fillStyle = '#22c55e'
  c.shadowColor = '#22c55e'; c.shadowBlur = 16
  c.fill(); c.shadowBlur = 0

  c.restore()

  // ── screen-space HUD ──────────────────────────────────
  const secsLeft = Math.ceil(G18.timeLeft / 60)
  const timePct  = G18.timeLeft / (G18_GAME_SEC * 60)
  const timerCol = timePct > 0.4 ? '#4ade80' : timePct > 0.2 ? '#facc15' : '#ef4444'

  // timer bar (full width top)
  const barW = W - 20
  c.fillStyle = _lt ? 'rgba(0,0,0,.12)' : 'rgba(0,0,0,.5)'; c.fillRect(10, 8, barW, 9)
  c.fillStyle = timerCol; c.fillRect(10, 8, barW * timePct, 9)

  // score
  c.font = 'bold 22px monospace'; c.textAlign = 'left'
  c.fillStyle = _lt ? '#14152b' : '#f1f5f9'; c.shadowColor = _lt ? 'rgba(255,255,255,.8)' : '#000'; c.shadowBlur = 4
  c.fillText(G18.score.toLocaleString(), 12, 40)
  c.shadowBlur = 0

  // combo
  if (G18.combo > 1 && G18.comboTimer > 0) {
    const ca = Math.min(1, G18.comboTimer / 30)
    c.globalAlpha = ca
    c.font = `bold ${13 + G18.combo * 1.8}px sans-serif`
    c.textAlign = 'left'
    c.fillStyle  = G18.combo >= 5 ? '#fbbf24' : '#c084fc'
    c.shadowColor = c.fillStyle; c.shadowBlur = 8
    c.fillText(`×${G18.combo}`, 14, 62)
    c.shadowBlur = 0; c.globalAlpha = 1
  }

  // time badge (top right)
  c.font = 'bold 15px monospace'; c.textAlign = 'right'
  c.fillStyle = timerCol
  c.shadowColor = timerCol; c.shadowBlur = 6
  c.fillText(secsLeft + 's', W - 12, 22)
  c.shadowBlur = 0

  // wind arrow
  if (Math.abs(G18.wind) > 0.15) {
    const arrows = Math.min(3, Math.ceil(Math.abs(G18.wind)))
    const dir    = G18.wind > 0 ? '→' : '←'
    c.font = '12px sans-serif'; c.textAlign = 'center'; c.fillStyle = '#7dd3fc'
    c.fillText(dir.repeat(arrows) + ' wind', W/2, 24)
  }

  // gravity flip notice
  if (G18.gravEvent > 0) {
    const ga = Math.min(1, G18.gravEvent / 40)
    c.globalAlpha = ga
    c.font = 'bold 13px sans-serif'; c.textAlign = 'center'; c.fillStyle = '#c084fc'
    c.fillText('⬆️ GRAVITY FLIPPED', W/2, 44)
    c.globalAlpha = 1
  }
  // magnet notice
  if (G18.magnetEvent > 0) {
    c.font = 'bold 13px sans-serif'; c.textAlign = 'center'; c.fillStyle = '#a78bfa'
    c.fillText('🧲 MAGNET ACTIVE', W/2, G18.gravEvent > 0 ? 62 : 44)
  }

  // world-space msg popups (score pop above orb)
  // screen-space msgs (centre)
  let my = H / 2 - 70
  for (const m of G18.msgs) {
    const a = Math.min(1, m.frames / 20)
    c.globalAlpha = a
    c.font = `bold ${m.big ? 20 : 15}px sans-serif`
    c.shadowColor = m.color; c.shadowBlur = 8
    c.fillStyle = m.color
    if (m.wx !== undefined) {
      // world-space popup
      c.textAlign = 'center'
      c.fillText(m.text, m.wx, m.wy - (1 - m.frames/65)*30)
    } else {
      c.textAlign = 'center'
      c.fillText(m.text, W/2, my)
      my += m.big ? 28 : 22
    }
    c.shadowBlur = 0
  }
  c.globalAlpha = 1

  // first-time hint
  if (!g18TouchUsed && G18.frameCount < 200) {
    const ha = Math.min(1, (200 - G18.frameCount) / 50)
    c.globalAlpha = ha * 0.7
    c.font = '13px sans-serif'; c.textAlign = 'center'; c.fillStyle = '#94a3b8'
    c.fillText('Move mouse to swing • Click to crack the whip — hit orbs with the glowing TIP!', W/2, H - 16)
    c.globalAlpha = 1
  }

  // orb legend (top right, compact)
  const legend = [
    { color:'#facc15', label:'●  100' },
    { color:'#22d3ee', label:'●  150' },
    { color:'#c084fc', label:'◈  200 (splits)' },
    { color:'#f87171', label:'💥 300 (chain)' },
    { color:'#4ade80', label:'⏱ +3s' },
    { color:'#fbbf24', label:'★  500' },
  ]
  c.font = '10px monospace'; c.textAlign = 'right'
  let ly = 40
  for (const l of legend) {
    c.fillStyle = l.color + 'aa'; c.fillText(l.label, W - 12, ly); ly += 14
  }
}

// ─── game loop ─────────────────────────────────────────
function g18Loop() {
  g18Raf = requestAnimationFrame(g18Loop)
  if (!G18.active || !document.getElementById('game18').classList.contains('active')) {
    cancelAnimationFrame(g18Raf); g18Raf = null; return
  }
  g18Update()
  g18Draw()
}

function g18Over() {
  G18.active = false
  window._g18Score = G18.score
  document.getElementById('g18-final-score').textContent = G18.score.toLocaleString()
  const m = G18.score >= 8000 ? '🥇 Gold' : G18.score >= 3500 ? '🥈 Silver' : G18.score >= 1200 ? '🥉 Bronze' : ''
  document.getElementById('g18-medal').textContent = m
  document.getElementById('g18-over').classList.add('show')
}

window.g18Restart = function() {
  document.getElementById('g18-over').classList.remove('show')
  g18Reset()
}
