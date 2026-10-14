// ═══════════════════════════════════════════════════════
//  GAME 37 — QUANTUM RHYTHM  (ADOFAI-inspired)
//  Endless quantum-generated path. Press SPACE / click
//  when the planet aligns with the gold ring on the next tile.
//  Speed ramps from half-beat to full 120 BPM over 60 tiles.
// ═══════════════════════════════════════════════════════

const G37_COLORS = ['#f472b6','#c084fc','#818cf8','#60a5fa','#34d399','#fbbf24','#fb7185','#a78bfa','#38bdf8','#4ade80']
const G37_ORBITR  = 32     // orbit radius (px)
const G37_TILE_D  = 90     // distance between tiles (world px)
const G37_PERF    = 0.22   // ±perfect window (rad ≈ 12.6°)
const G37_GOOD    = 0.52   // ±good window (rad ≈ 29.8°)
const G37_AUTO    = 0.68   // auto-miss margin past exit angle
const G37_SPD0    = Math.PI        // starting speed: 60 BPM timing
const G37_SPD_MAX = Math.PI * 2    // max speed: 120 BPM timing
const G37_BPM     = 120
const G37_BL      = 60 / G37_BPM  // beat length in seconds (0.5 s)

let G37 = {
  active: false,
  tiles: [], headings: [], genHeading: 0,
  orbitTile: 0, dir: 1,
  arcStart: 0, arcEnd: 0, arcLen: 0, arcT: 0,
  speed: G37_SPD0,
  health: 3, score: 0, combo: 0, tilesCompleted: 0,
  hits: [], feedback: '', fbColor: '#fff', fbTimer: 0,
  trail: [],
  shake: 0,
  camX: 0, camY: 0,
  flashIdx: -1, flashT: 0,
  raf: null, lastTime: 0,
}
window._g37Score = 0

// ── audio ──────────────────────────────────────────────

let _g37AC   = null
let _g37Sched = null
let _g37NextBeat = 0
let _g37BeatIdx  = 0

function _g37GetAC() {
  if (!_g37AC) _g37AC = new (window.AudioContext || window.webkitAudioContext)()
  return _g37AC
}

function _g37Kick(t, vol = 0.65) {
  const ac = _g37GetAC(), g = ac.createGain(), o = ac.createOscillator()
  o.frequency.setValueAtTime(160, t)
  o.frequency.exponentialRampToValueAtTime(36, t + 0.13)
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.30)
  o.connect(g); g.connect(ac.destination)
  o.start(t); o.stop(t + 0.32)
}

function _g37Snare(t, vol = 0.38) {
  const ac = _g37GetAC()
  const len = Math.floor(ac.sampleRate * 0.11)
  const buf = ac.createBuffer(1, len, ac.sampleRate)
  const d   = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.max(0, 1 - i / len * 2.4)
  const src = ac.createBufferSource(); src.buffer = buf
  const g   = ac.createGain()
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.13)
  src.connect(g); g.connect(ac.destination); src.start(t); src.stop(t + 0.15)
  // body tone
  const o2 = ac.createOscillator(), g2 = ac.createGain()
  o2.frequency.setValueAtTime(190, t); o2.frequency.exponentialRampToValueAtTime(90, t + 0.05)
  g2.gain.setValueAtTime(vol * 0.35, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.07)
  o2.connect(g2); g2.connect(ac.destination); o2.start(t); o2.stop(t + 0.09)
}

function _g37Hat(t, vol = 0.18, dur = 0.032) {
  const ac = _g37GetAC()
  const len = Math.floor(ac.sampleRate * dur)
  const buf = ac.createBuffer(1, len, ac.sampleRate)
  const d   = buf.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
  const src = ac.createBufferSource(); src.buffer = buf
  const flt = ac.createBiquadFilter(); flt.type = 'highpass'; flt.frequency.value = 7500
  const g   = ac.createGain()
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur)
  src.connect(flt); flt.connect(g); g.connect(ac.destination); src.start(t); src.stop(t + dur + 0.01)
}

function _g37Ding(t, freq = 880, vol = 0.22) {
  const ac = _g37GetAC(), o = ac.createOscillator(), g = ac.createGain()
  o.frequency.setValueAtTime(freq, t)
  o.frequency.exponentialRampToValueAtTime(freq * 0.5, t + 0.12)
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18)
  o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 0.2)
}

// 16-step drum pattern (each step = 1 sixteenth note = G37_BL/4 sec)
// K=kick  S=snare  H=hihat(closed)  O=hihat(open)
const _g37Pat = [
  {k:1      }, // 1
  {         }, // e
  {     h:1 }, // +
  {         }, // a
  {         }, // 2
  {     h:1 }, // e
  {         }, // +
  {         }, // a
  {k:1      }, // 3
  {  s:1    }, // e  (snare on the "e" of 3)
  {     h:1 }, // +
  {         }, // a
  {         }, // 4
  {     h:1 }, // e
  {         }, // +
  {     h:1, o:1 }, // a  (open hat)
]

function _g37SchedBeats() {
  if (!G37.active) return
  const ac = _g37GetAC()
  const step = G37_BL / 4
  while (_g37NextBeat < ac.currentTime + 0.28) {
    const p = _g37Pat[_g37BeatIdx % _g37Pat.length]
    if (p.k) _g37Kick(_g37NextBeat)
    if (p.s) _g37Snare(_g37NextBeat)
    if (p.h) _g37Hat(_g37NextBeat, p.o ? 0.22 : 0.16, p.o ? 0.10 : 0.032)
    _g37NextBeat += step
    _g37BeatIdx++
  }
  _g37Sched = setTimeout(_g37SchedBeats, 25)
}

function _g37StartAudio() {
  const ac = _g37GetAC(); ac.resume()
  _g37NextBeat = ac.currentTime + 0.06
  _g37BeatIdx  = 0
  _g37SchedBeats()
}

function _g37StopAudio() {
  if (_g37Sched) { clearTimeout(_g37Sched); _g37Sched = null }
}

// ── tile generation ────────────────────────────────────

function _g37GenTiles(count) {
  const diff = Math.min(1, G37.tilesCompleted / 60)
  for (let k = 0; k < count; k++) {
    const n    = G37.tiles.length
    const last = G37.tiles[n - 1]
    let opts
    if (diff < 0.25)      opts = [0, 0, 0, -90, 90]
    else if (diff < 0.55) opts = [0, 0, -90, 90, -45, 45]
    else                  opts = [0, -90, 90, -90, 90, -45, 45]
    const turn = opts[qRandInt(opts.length)]
    G37.genHeading = ((G37.genHeading + turn * Math.PI / 180) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)
    G37.tiles.push({
      x: last.x + G37_TILE_D * Math.cos(G37.genHeading),
      y: last.y + G37_TILE_D * Math.sin(G37.genHeading),
    })
    G37.headings.push(G37.genHeading)
  }
}

// ── arc mechanics ──────────────────────────────────────

function _g37ArcLen(from, to, dir) {
  let d = ((to - from) * dir % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)
  return d < 0.001 ? Math.PI * 2 : d
}

function _g37StartTile(i) {
  G37.orbitTile = i
  G37.arcT = 0
  let arcStart = i === 0
    ? G37.headings[0] + Math.PI
    : G37.headings[i - 1] + Math.PI
  arcStart = ((arcStart % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
  G37.arcStart = arcStart
  if (i >= G37.headings.length) { G37.arcEnd = arcStart; G37.arcLen = 0; G37.dir = 1; return }
  const arcEnd = ((G37.headings[i] % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
  G37.arcEnd = arcEnd
  const cw = _g37ArcLen(arcStart, arcEnd, +1), ccw = _g37ArcLen(arcStart, arcEnd, -1)
  if (cw <= ccw) { G37.dir = +1; G37.arcLen = cw } else { G37.dir = -1; G37.arcLen = ccw }
}

// ── lifecycle ──────────────────────────────────────────

const G37_FIRE = '#ff6b35'   // fire ball color
const G37_ICE  = '#4ecdc4'   // ice ball color

function stopGame37() {
  G37.active = false
  _g37StopAudio()
  if (G37.raf) { cancelAnimationFrame(G37.raf); G37.raf = null }
  document.removeEventListener('keydown', _g37Key)
  const c = document.getElementById('g37-canvas')
  if (c) c.onclick = null
}
window.stopGame37 = stopGame37

window.initGame37 = async function() {
  stopGame37()
  G37 = {
    active: false, tiles: [], headings: [], genHeading: 0,
    orbitTile: 0, staticTile: -1, oddStep: false,
    dir: 1, arcStart: 0, arcEnd: 0, arcLen: 0, arcT: 0,
    speed: G37_SPD0, health: 3, score: 0, combo: 0, tilesCompleted: 0,
    hits: [], feedback: '', fbColor: '#fff', fbTimer: 0,
    trail: [], particles: [],
    shake: 0, bgFlash: 0, ringRot: 0,
    camX: 0, camY: 0, flashIdx: -1, flashT: 0,
    raf: null, lastTime: 0,
  }
  window._g37Score = 0
  document.getElementById('g37-score-hud').textContent = '—'
  document.getElementById('g37-over').classList.remove('show')
  document.getElementById('g37-overlay').style.display = 'flex'
  await initCurby()
}

window.startRhythm = function() {
  SFX.resume(); SFX.click()
  const c = document.getElementById('g37-canvas')
  c.width  = c.parentElement.clientWidth
  c.height = c.parentElement.clientHeight
  document.getElementById('g37-overlay').style.display = 'none'

  const W = c.width, H = c.height
  G37.tiles      = [{ x: W / 2, y: H * 0.58 }]
  G37.headings   = []
  G37.genHeading = 0
  G37.camX = W / 2; G37.camY = H * 0.58
  _g37GenTiles(35)
  _g37StartTile(0)
  G37.active = true

  c.onclick = _g37Press
  document.addEventListener('keydown', _g37Key)
  _g37StartAudio()
  G37.lastTime = performance.now()
  G37.raf = requestAnimationFrame(_g37Loop)
}

function _g37Key(e) {
  if (!document.getElementById('game37').classList.contains('active')) return
  if (e.code === 'Space') { e.preventDefault(); _g37Press() }
}

// ── hit logic ──────────────────────────────────────────

function _g37Press() {
  if (!G37.active) return
  const diff = Math.abs(G37.arcLen - G37.arcT)
  _g37ApplyResult(diff < G37_PERF ? 'perfect' : diff < G37_GOOD ? 'good' : 'miss')
}

function _g37Burst(wx, wy, color, count) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.5
    const spd = 55 + Math.random() * 90
    G37.particles.push({
      x: wx, y: wy,
      vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
      color, life: 1,
      size: 2.5 + Math.random() * 3.5,
      rot: Math.random() * Math.PI * 2,
      rotV: (Math.random() - 0.5) * 10,
    })
  }
}

function _g37ApplyResult(rating) {
  G37.hits.push(rating)
  G37.feedback = rating
  G37.fbTimer  = 0.65

  if (rating === 'miss') {
    G37.combo   = 0
    G37.health--
    G37.shake   = 0.44
    G37.fbColor = '#f87171'
    if (_g37AC) _g37Snare(_g37AC.currentTime, 0.55)
    if (G37.health <= 0) { setTimeout(_g37EndGame, 380); return }
  } else {
    G37.staticTile = G37.orbitTile
    G37.oddStep    = !G37.oddStep
    G37.combo++
    const mul = Math.min(4, Math.floor(G37.combo / 8) + 1)
    G37.score += (rating === 'perfect' ? 100 : 50) * mul
    G37.tilesCompleted++
    G37.fbColor = rating === 'perfect' ? '#fbbf24' : '#4ade80'

    const ct = G37.tiles[G37.orbitTile]
    if (ct) _g37Burst(ct.x, ct.y, rating === 'perfect' ? '#fbbf24' : '#4ade80', rating === 'perfect' ? 12 : 7)

    if (rating === 'perfect') {
      G37.flashIdx = G37.orbitTile
      G37.flashT   = 0.30
      G37.bgFlash  = 0.25
      if (_g37AC) _g37Ding(_g37AC.currentTime, 880 + (G37.tilesCompleted % 8) * 110, 0.22)
    }
    document.getElementById('g37-score-hud').textContent = G37.score.toLocaleString()
    G37.speed = G37_SPD0 + (G37_SPD_MAX - G37_SPD0) * Math.min(1, G37.tilesCompleted / 60)
  }

  if (G37.tiles.length - G37.orbitTile < 25) _g37GenTiles(25)
  _g37StartTile(G37.orbitTile + 1)
}

// ── loop ───────────────────────────────────────────────

function _g37Loop(ts) {
  if (!G37.active) return
  const dt = Math.min((ts - G37.lastTime) / 1000, 0.05)
  G37.lastTime = ts

  G37.fbTimer  = Math.max(0, G37.fbTimer  - dt)
  G37.shake    = Math.max(0, G37.shake    - dt * 3.5)
  G37.flashT   = Math.max(0, G37.flashT   - dt * 3.5)
  G37.bgFlash  = Math.max(0, G37.bgFlash  - dt * 4)
  G37.ringRot += dt * Math.PI   // half-turn/sec, like Circle.ts

  for (let i = G37.particles.length - 1; i >= 0; i--) {
    const p = G37.particles[i]
    p.x += p.vx * dt; p.y += p.vy * dt
    p.vy += 140 * dt
    p.vx *= 0.88; p.vy *= 0.88
    p.rot += p.rotV * dt
    p.life -= dt * 2.2
    if (p.life <= 0) G37.particles.splice(i, 1)
  }

  G37.arcT += G37.speed * dt
  if (G37.arcT > G37.arcLen + G37_AUTO) _g37ApplyResult('miss')

  const angle = ((G37.arcStart + G37.arcT * G37.dir) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)
  const ct = G37.tiles[G37.orbitTile]
  const px = ct.x + G37_ORBITR * Math.cos(angle)
  const py = ct.y + G37_ORBITR * Math.sin(angle)

  G37.trail.push({ x: px, y: py })
  if (G37.trail.length > 60) G37.trail.shift()

  const ahead = Math.min(G37.orbitTile + 1, G37.tiles.length - 1)
  G37.camX += (G37.tiles[ahead].x - G37.camX) * 0.12
  G37.camY += (G37.tiles[ahead].y - G37.camY) * 0.12

  _g37Draw(px, py, angle)
  G37.raf = requestAnimationFrame(_g37Loop)
}

// ── draw ───────────────────────────────────────────────

function _g37Draw(px, py, angle) {
  const c   = document.getElementById('g37-canvas')
  const ctx = c.getContext('2d')
  const W = c.width, H = c.height

  // Canvases get no CSS variables, so read the theme directly
  const _lt = typeof qgLight === 'function' && qgLight()
  ctx.fillStyle = _lt ? '#eeeff8' : '#03030a'
  ctx.fillRect(0, 0, W, H)
  if (G37.bgFlash > 0) {
    ctx.fillStyle = `rgba(251,191,36,${G37.bgFlash * 0.10})`
    ctx.fillRect(0, 0, W, H)
  }

  const shk = G37.shake
  const sx = shk > 0 ? (Math.random() - .5) * shk * 18 : 0
  const sy = shk > 0 ? (Math.random() - .5) * shk * 18 : 0
  const toX = wx => (wx - G37.camX) + W / 2 + sx
  const toY = wy => (wy - G37.camY) + H / 2 + sy

  const oi    = G37.orbitTile
  const tiles = G37.tiles
  const n     = tiles.length
  const vS    = Math.max(0, oi - 8)
  const vE    = Math.min(n - 1, oi + 28)
  const now   = Date.now()

  // ── path lines ──
  for (let i = vS; i < vE; i++) {
    const done  = i < oi
    const isCur = i === oi
    ctx.strokeStyle = done
      ? 'rgba(67,56,202,0.5)'
      : _lt ? (isCur ? 'rgba(0,0,0,0.32)' : 'rgba(0,0,0,0.14)')
      : isCur ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.11)'
    ctx.lineWidth = done ? 2.5 : isCur ? 2 : 1.5
    ctx.beginPath()
    ctx.moveTo(toX(tiles[i].x),   toY(tiles[i].y))
    ctx.lineTo(toX(tiles[i+1].x), toY(tiles[i+1].y))
    ctx.stroke()
  }

  // ── rotating dashed ring around current tile (Circle.ts style) ──
  if (oi < n) {
    ctx.save()
    ctx.translate(toX(tiles[oi].x), toY(tiles[oi].y))
    ctx.rotate(G37.ringRot)
    ctx.strokeStyle = _lt ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.20)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([6, 5])
    ctx.beginPath(); ctx.arc(0, 0, G37_ORBITR, 0, Math.PI * 2); ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()
  }

  // ── dashed remaining sweep arc (shows how far left to hit point) ──
  if (oi < n - 1 && G37.arcLen - G37.arcT > 0.08) {
    ctx.save()
    ctx.translate(toX(tiles[oi].x), toY(tiles[oi].y))
    ctx.strokeStyle = 'rgba(251,191,36,0.28)'
    ctx.lineWidth = 2
    ctx.setLineDash([3, 6])
    ctx.beginPath()
    if (G37.dir > 0) {
      ctx.arc(0, 0, G37_ORBITR, angle, G37.arcEnd)
    } else {
      ctx.arc(0, 0, G37_ORBITR, angle, G37.arcEnd, true)
    }
    ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()
  }

  // ── tiles (rotating diamonds) ──
  for (let i = vS; i <= vE && i < n; i++) {
    const tx = toX(tiles[i].x), ty = toY(tiles[i].y)
    const isCur    = i === oi
    const isNext   = i === oi + 1
    const isDone   = i < oi
    const isStatic = i === G37.staticTile
    const col = _g37TileColor(i)
    const sz  = isCur ? 13 : isStatic ? 11 : isNext ? 10 : isDone ? 5 : 8
    const spd = isCur ? 2.0 : isStatic ? 1.2 : 0.45
    const rot = now * 0.001 * spd * (i % 2 ? 1 : -1)

    let flash = 0
    if (i === G37.flashIdx && G37.flashT > 0) flash = G37.flashT / 0.30

    ctx.save()
    ctx.translate(tx, ty)
    ctx.rotate(Math.PI / 4 + rot)

    if (flash > 0) {
      ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 55 * flash
    } else if (isCur || isStatic) {
      ctx.shadowColor = col; ctx.shadowBlur = isCur ? 30 : 18
    } else if (isNext) {
      ctx.shadowColor = col; ctx.shadowBlur = 12
    } else {
      ctx.shadowBlur = 0
    }

    ctx.globalAlpha = isDone ? 0.30 : 1
    ctx.fillStyle   = isDone ? (_lt ? '#a5b4fc' : '#312e81') : col
    ctx.fillRect(-sz, -sz, sz * 2, sz * 2)

    if (isCur || isStatic) {
      ctx.fillStyle = 'rgba(255,255,255,0.28)'
      ctx.fillRect(-sz * 0.44, -sz * 0.44, sz * 0.88, sz * 0.88)
    }
    if (flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${flash * 0.65})`
      ctx.fillRect(-sz * 1.6, -sz * 1.6, sz * 3.2, sz * 3.2)
    }
    ctx.restore()
    ctx.shadowBlur = 0; ctx.globalAlpha = 1
  }

  // ── pulsing gold target ring ──
  if (oi < n - 1) {
    const pulse = 0.6 + Math.sin(now / 110) * 0.4
    const ex = toX(tiles[oi].x + G37_ORBITR * Math.cos(G37.arcEnd))
    const ey = toY(tiles[oi].y + G37_ORBITR * Math.sin(G37.arcEnd))
    ctx.strokeStyle = `rgba(251,191,36,${0.65 + pulse * 0.35})`
    ctx.lineWidth = 2.5
    ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 20 * pulse
    ctx.beginPath(); ctx.arc(ex, ey, 7, 0, Math.PI * 2); ctx.stroke()
    ctx.shadowBlur = 0
  }

  // ── particles ──
  for (const p of G37.particles) {
    ctx.save()
    ctx.translate(toX(p.x), toY(p.y))
    ctx.rotate(p.rot)
    ctx.globalAlpha = p.life * p.life
    ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 7
    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size)
    ctx.restore()
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0

  // ── trail ──
  const ballCol = G37.oddStep ? G37_ICE : G37_FIRE
  ctx.lineCap = 'round'
  for (let i = 1; i < G37.trail.length; i++) {
    const a = i / G37.trail.length
    ctx.globalAlpha = a * a * 0.80
    ctx.strokeStyle = ballCol
    ctx.lineWidth = 1.5 + a * 4
    ctx.beginPath()
    ctx.moveTo(toX(G37.trail[i-1].x), toY(G37.trail[i-1].y))
    ctx.lineTo(toX(G37.trail[i].x),   toY(G37.trail[i].y))
    ctx.stroke()
  }
  ctx.globalAlpha = 1

  // ── static ball (sits on last-completed tile, opposite color) ──
  if (G37.staticTile >= 0 && G37.staticTile < tiles.length) {
    const st  = tiles[G37.staticTile]
    const sbx = toX(st.x), sby = toY(st.y)
    const sbc = G37.oddStep ? G37_FIRE : G37_ICE
    ctx.fillStyle = sbc; ctx.shadowColor = sbc; ctx.shadowBlur = 22
    ctx.beginPath(); ctx.arc(sbx, sby, 8, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#ffffff'; ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 8
    ctx.beginPath(); ctx.arc(sbx, sby, 4.5, 0, Math.PI * 2); ctx.fill()
    ctx.shadowBlur = 0
  }

  // ── orbiting ball ──
  const spx = toX(px), spy = toY(py)
  ctx.fillStyle = ballCol; ctx.shadowColor = ballCol; ctx.shadowBlur = 28
  ctx.beginPath(); ctx.arc(spx, spy, 10, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#ffffff'; ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 12
  ctx.beginPath(); ctx.arc(spx, spy, 5.5, 0, Math.PI * 2); ctx.fill()
  ctx.shadowBlur = 0

  // ── HUD ──
  for (let i = 0; i < 3; i++) {
    const alive = i < G37.health
    ctx.fillStyle = alive ? '#f472b6' : 'rgba(255,255,255,0.10)'
    ctx.shadowColor = '#f472b6'; ctx.shadowBlur = alive ? 10 : 0
    ctx.font = '18px sans-serif'; ctx.textAlign = 'left'
    ctx.fillText('♥', 10 + i * 24, 28)
  }
  ctx.shadowBlur = 0

  ctx.fillStyle = '#e2e8f0'; ctx.font = 'bold 14px monospace'; ctx.textAlign = 'right'
  ctx.fillText(G37.score.toLocaleString() + ' pts', W - 10, 25)

  if (G37.combo >= 5) {
    const mul = Math.min(4, Math.floor(G37.combo / 8) + 1)
    ctx.fillStyle = mul >= 4 ? '#fbbf24' : mul >= 3 ? '#f472b6' : '#c084fc'
    ctx.font = `bold ${mul >= 3 ? 13 : 11}px monospace`
    ctx.fillText(`${G37.combo}× COMBO${mul > 1 ? ' ×'+mul : ''}`, W - 10, 44)
  }

  const spd = (G37.speed - G37_SPD0) / (G37_SPD_MAX - G37_SPD0)
  if (spd > 0) {
    const barW = 80, barH = 4, bx = W / 2 - 40, by = 8
    const tcol = _g37TileColor(oi)
    ctx.fillStyle = 'rgba(255,255,255,0.08)'
    ctx.fillRect(bx, by, barW, barH)
    ctx.fillStyle = tcol; ctx.shadowColor = tcol; ctx.shadowBlur = 6
    ctx.fillRect(bx, by, barW * spd, barH)
    ctx.shadowBlur = 0
  }

  if (G37.fbTimer > 0) {
    const a   = G37.fbTimer / 0.65
    const txt = G37.feedback === 'perfect' ? 'PERFECT!'
              : G37.feedback === 'good'    ? 'GOOD' : 'MISS'
    ctx.globalAlpha = a
    ctx.fillStyle = G37.fbColor; ctx.shadowColor = G37.fbColor; ctx.shadowBlur = 20
    ctx.font = `bold ${G37.feedback === 'perfect' ? 28 : 22}px monospace`
    ctx.textAlign = 'center'
    ctx.fillText(txt, W / 2, H * 0.17 - (1 - a) * 20)
    ctx.shadowBlur = 0; ctx.globalAlpha = 1
  }

  ctx.textAlign = 'left'
}

function _g37TileColor(i) { return G37_COLORS[i % G37_COLORS.length] }

function _g37EndGame() {
  stopGame37()
  const p = G37.hits.filter(h => h === 'perfect').length
  const g = G37.hits.filter(h => h === 'good').length
  const m = G37.hits.filter(h => h === 'miss').length
  const acc = G37.hits.length > 0 ? Math.round((p + g * 0.5) / G37.hits.length * 100) : 0
  window._g37Score = G37.score
  document.getElementById('g37-final-score').textContent = G37.score.toLocaleString() + ' pts'
  document.getElementById('g37-over-stats').textContent  =
    `${G37.tilesCompleted} tiles · ${acc}% acc · ${p}× Perfect  ${g}× Good  ${m}× Miss`
  renderMedalDisplay('g37-medal-display', 'rhythm', G37.score)
  document.getElementById('g37-over').classList.add('show')
  SFX.win?.()
}
