// ═══════════════════════════════════════════════════════
//  GAME 41 — JET RUSH
//  GD Platformer Jetpack. Free 8-direction flight, no gravity.
//  Screen scrolls right — fall behind the left edge = dead.
//  Arrow / WASD or hold-touch toward destination.
// ═══════════════════════════════════════════════════════

const G41_HSPD    = 220    // horizontal flight speed
const G41_VSPD    = 195    // vertical flight speed
const G41_OW      = 50     // obstacle block width
const G41_GAP0    = 205    // initial wall gap
const G41_GAP_MIN = 95
const G41_OBS_SEP = 285    // world-space gap between obstacle columns
const G41_CAM0    = 78     // initial scroll speed px/s
const G41_CAM_MAX = 300
const G41_CAM_ACC = 1.8    // scroll speed increase per second
const G41_PW      = 11     // player half-width
const G41_PH      = 11     // player half-height
const G41_WALL    = 5      // ceiling / floor thickness

const G41 = {
  active: false, phase: 'idle',
  x: 0, y: 0,
  vx: 0, vy: 0,
  camX: 0, camSpd: G41_CAM0,
  score: 0, gap: G41_GAP0,
  obs: [],
  keys: {},
  touchX: null, touchY: null,
  stars: [], raf: null, lastTime: 0,
  deadT: 0, showOver: false,
}
window._g41Score = 0

let _g41Canvas = null
function _g41C() {
  if (!_g41Canvas) _g41Canvas = document.getElementById('g41-canvas')
  return _g41Canvas
}

async function initGame41() {
  stopGame41()
  _g41Canvas = null
  document.getElementById('g41-overlay').style.display = 'flex'
  document.getElementById('g41-over').style.display    = 'none'
  await initCurby()
}
window.initGame41 = initGame41

window.startJetRush = function() {
  SFX.resume(); SFX.click()
  const c = _g41C()
  c.width  = c.parentElement.clientWidth
  c.height = c.parentElement.clientHeight
  document.getElementById('g41-overlay').style.display = 'none'
  document.getElementById('g41-over').style.display    = 'none'

  G41.stars = Array.from({length: 55}, () => ({
    x: Math.random() * c.width,
    y: Math.random() * c.height,
    r: Math.random() * 1.3 + 0.2,
    spd: Math.random() * 22 + 5,
    a: Math.random() * 0.45 + 0.3,
  }))

  G41.camX     = 0
  G41.camSpd   = G41_CAM0
  G41.x        = c.width * 0.28
  G41.y        = c.height / 2
  G41.vx       = 0
  G41.vy       = 0
  G41.score    = 0
  G41.gap      = G41_GAP0
  G41.obs      = []
  G41.keys     = {}
  G41.touchX   = null
  G41.touchY   = null
  G41.deadT    = 0
  G41.showOver = false
  G41.active   = true
  G41.phase    = 'playing'
  window._g41Score = 0
  document.getElementById('g41-score-hud').textContent = '0'

  // Seed first obstacles off-screen right
  let wx = G41.x + c.width * 0.6
  for (let i = 0; i < 5; i++) { _g41Spawn(wx, c.height); wx += G41_OBS_SEP }

  window.addEventListener('keydown', _g41Kd)
  window.addEventListener('keyup',   _g41Ku)
  // Clear keys on blur so held key doesn't stick
  window.addEventListener('blur', _g41Blur)
  c.addEventListener('touchstart', _g41Ts, { passive: false })
  c.addEventListener('touchmove',  _g41Tm, { passive: false })
  c.addEventListener('touchend',   _g41Te, { passive: false })

  G41.lastTime = performance.now()
  G41.raf = requestAnimationFrame(_g41Loop)
}

window.stopGame41 = function() {
  G41.active = false; G41.keys = {}
  if (G41.raf) { cancelAnimationFrame(G41.raf); G41.raf = null }
  const c = _g41C()
  if (c) {
    c.removeEventListener('touchstart', _g41Ts)
    c.removeEventListener('touchmove',  _g41Tm)
    c.removeEventListener('touchend',   _g41Te)
  }
  window.removeEventListener('keydown', _g41Kd)
  window.removeEventListener('keyup',   _g41Ku)
  window.removeEventListener('blur',    _g41Blur)
}

function _g41Kd(e) {
  const nav = ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space']
  if (nav.includes(e.code)) e.preventDefault()
  G41.keys[e.code] = true
}
function _g41Ku(e)   { G41.keys[e.code] = false }
function _g41Blur()  { G41.keys = {} }

function _g41TouchPos(e) {
  const c = _g41C(), rect = c.getBoundingClientRect(), t = e.touches[0]
  return {
    x: (t.clientX - rect.left) * (c.width  / rect.width),
    y: (t.clientY - rect.top)  * (c.height / rect.height),
  }
}
function _g41Ts(e) { e.preventDefault(); const p = _g41TouchPos(e); G41.touchX = p.x; G41.touchY = p.y }
function _g41Tm(e) { e.preventDefault(); const p = _g41TouchPos(e); G41.touchX = p.x; G41.touchY = p.y }
function _g41Te(e) { e.preventDefault(); if (!e.touches.length) { G41.touchX = null; G41.touchY = null } }

// Obstacle types: 'gap' | 'top' | 'bot' | 'float'
function _g41Spawn(wx, h) {
  const t = qRandInt(4)
  const margin = Math.floor(h * 0.11)

  if (t === 0) {
    // Top + bottom blocks with a gap
    const range = Math.floor(h - margin * 2 - G41.gap)
    const topH  = margin + (range > 0 ? qRandInt(range + 1) : 0)
    const botH  = Math.max(margin, h - topH - G41.gap)
    G41.obs.push({ wx, kind: 'gap', topH, botH })
  } else if (t === 1) {
    // Top ledge only (player flies below)
    const topH = margin + qRandInt(Math.floor(h * 0.35))
    G41.obs.push({ wx, kind: 'top', topH })
  } else if (t === 2) {
    // Bottom ledge only (player flies above)
    const botH = margin + qRandInt(Math.floor(h * 0.35))
    G41.obs.push({ wx, kind: 'bot', botH })
  } else {
    // Floating platform in the middle
    const fw    = G41_OW + 28
    const floatY = margin + qRandInt(Math.floor(h - margin * 2 - 20))
    G41.obs.push({ wx, kind: 'float', floatY, floatH: 18, floatW: fw })
  }
}

function _g41Loop(ts) {
  if (!G41.active) return
  const dt = Math.min((ts - G41.lastTime) / 1000, 0.05)
  G41.lastTime = ts
  const c = _g41C(); const w = c.width, h = c.height

  for (const s of G41.stars) {
    s.x -= s.spd * dt
    if (s.x < 0) { s.x = w + 2; s.y = Math.random() * h }
  }

  if (G41.phase === 'playing') {
    // Camera scroll
    G41.camSpd = Math.min(G41_CAM_MAX, G41.camSpd + G41_CAM_ACC * dt)
    G41.camX  += G41.camSpd * dt

    // Input
    const up    = G41.keys['ArrowUp']    || G41.keys['KeyW']
    const down  = G41.keys['ArrowDown']  || G41.keys['KeyS']
    const left  = G41.keys['ArrowLeft']  || G41.keys['KeyA']
    const right = G41.keys['ArrowRight'] || G41.keys['KeyD']

    // Touch direction (relative to player screen pos)
    let tDx = 0, tDy = 0
    if (G41.touchX !== null) {
      const dx = G41.touchX - (G41.x - G41.camX)
      const dy = G41.touchY - G41.y
      const len = Math.sqrt(dx * dx + dy * dy)
      if (len > 18) { tDx = dx / len; tDy = dy / len }
    }

    // Free flight — no gravity, instant velocity
    G41.vx = right ? G41_HSPD : left  ? -G41_HSPD : (G41.touchX !== null ? tDx * G41_HSPD : 0)
    G41.vy = up    ? -G41_VSPD : down ? G41_VSPD  : (G41.touchX !== null ? tDy * G41_VSPD : 0)

    G41.x += G41.vx * dt
    G41.y += G41.vy * dt

    // Clamp to visible area (ceiling / floor)
    G41.y = Math.max(G41_WALL + G41_PH, Math.min(h - G41_WALL - G41_PH, G41.y))
    // Don't let player fly too far right
    const maxSx = G41.camX + w * 0.82
    if (G41.x > maxSx) G41.x = maxSx

    // Score obstacles
    for (const o of G41.obs) {
      if (!o.passed && o.wx + G41_OW < G41.x - G41_PW) {
        o.passed = true
        G41.score++
        window._g41Score = G41.score
        document.getElementById('g41-score-hud').textContent = G41.score
        G41.camSpd = Math.min(G41_CAM_MAX, G41_CAM0 + G41.score * 2.2)
        G41.gap = Math.max(G41_GAP_MIN, G41_GAP0 - G41.score * 1.6)
      }
    }
    G41.obs = G41.obs.filter(o => o.wx - G41.camX > -G41_OW - 20)

    const last = G41.obs[G41.obs.length - 1]
    if (!last || last.wx - G41.camX < w - G41_OBS_SEP) _g41Spawn(G41.camX + w + 60, h)

    // Death: left edge
    if (G41.x - G41.camX <= G41_PW) { _g41Die() }
    else {
      // Death: obstacle collision
      const pSx = G41.x - G41.camX
      for (const o of G41.obs) {
        const oSx = o.wx - G41.camX
        const ow  = o.kind === 'float' ? o.floatW : G41_OW
        if (pSx + G41_PW <= oSx || pSx - G41_PW >= oSx + ow) continue
        let hit = false
        if (o.kind === 'gap')   hit = G41.y - G41_PH < o.topH || G41.y + G41_PH > h - o.botH
        if (o.kind === 'top')   hit = G41.y - G41_PH < o.topH
        if (o.kind === 'bot')   hit = G41.y + G41_PH > h - o.botH
        if (o.kind === 'float') hit = G41.y + G41_PH > o.floatY && G41.y - G41_PH < o.floatY + o.floatH
        if (hit) { _g41Die(); break }
      }
    }

  } else if (G41.phase === 'dead') {
    G41.camX  += G41.camSpd * 0.4 * dt
    G41.deadT += dt
    if (G41.deadT >= 1.5 && !G41.showOver) {
      G41.showOver     = true
      window._g41Score = G41.score
      const s = G41.score
      document.getElementById('g41-final-score').textContent = `${s} block${s !== 1 ? 's' : ''}`
      document.getElementById('g41-over').style.display = 'flex'
    }
  }

  _g41Draw(c.getContext('2d'), w, h)
  if (G41.showOver) { G41.active = false; return }
  G41.raf = requestAnimationFrame(_g41Loop)
}

function _g41Die() {
  if (G41.phase === 'dead') return
  G41.phase = 'dead'; G41.deadT = 0
  G41.keys = {}; G41.touchX = null; G41.touchY = null
  SFX.die()
  const c = _g41C()
  c.removeEventListener('touchstart', _g41Ts)
  c.removeEventListener('touchmove',  _g41Tm)
  c.removeEventListener('touchend',   _g41Te)
  window.removeEventListener('keydown', _g41Kd)
  window.removeEventListener('keyup',   _g41Ku)
  window.removeEventListener('blur',    _g41Blur)
}

function _g41Draw(ctx, w, h) {
  ctx.save()
  ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'

  // Canvases get no CSS variables, so read the theme directly
  const _lt = typeof qgLight === 'function' && qgLight()
  ctx.fillStyle = _lt ? '#f6f1ec' : '#030710'
  ctx.fillRect(0, 0, w, h)

  // Scan lines
  ctx.strokeStyle = _lt ? 'rgba(234,88,12,0.08)' : 'rgba(249,115,22,0.04)'
  ctx.lineWidth = 1
  for (let y = 0; y < h; y += 20) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
  }

  // Stars
  for (const s of G41.stars) {
    ctx.globalAlpha = s.a
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
    ctx.fillStyle = _lt ? '#9a8f86' : '#fff'; ctx.fill()
  }
  ctx.globalAlpha = 1

  // Ceiling & floor
  ctx.fillStyle = _lt ? '#3d2a1f' : '#0f1f35'
  ctx.fillRect(0, 0, w, G41_WALL)
  ctx.fillRect(0, h - G41_WALL, w, G41_WALL)
  ctx.strokeStyle = '#f97316'; ctx.lineWidth = 1.6
  ctx.shadowColor = '#f97316'; ctx.shadowBlur = 10
  ctx.beginPath(); ctx.moveTo(0, G41_WALL);     ctx.lineTo(w, G41_WALL);     ctx.stroke()
  ctx.beginPath(); ctx.moveTo(0, h - G41_WALL); ctx.lineTo(w, h - G41_WALL); ctx.stroke()
  ctx.shadowBlur = 0

  // Obstacles
  for (const o of G41.obs) _g41DrawObs(ctx, o, h)

  // Left-edge danger line
  ctx.strokeStyle = 'rgba(239,68,68,0.5)'
  ctx.lineWidth   = 2
  ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 6
  ctx.setLineDash([6, 6])
  ctx.beginPath(); ctx.moveTo(G41_PW + 2, G41_WALL); ctx.lineTo(G41_PW + 2, h - G41_WALL); ctx.stroke()
  ctx.setLineDash([])
  ctx.shadowBlur = 0

  // Player
  const pSx  = G41.x - G41.camX
  const fade = G41.phase === 'dead' ? Math.max(0.1, 1 - G41.deadT * 1.5) : 1
  const thrusting = G41.phase === 'playing' && (
    G41.keys['ArrowUp'] || G41.keys['KeyW'] || G41.keys['ArrowDown'] || G41.keys['KeyS'] ||
    G41.keys['ArrowLeft'] || G41.keys['KeyA'] || G41.keys['ArrowRight'] || G41.keys['KeyD'] ||
    G41.touchX !== null
  )
  ctx.globalAlpha = fade
  _g41DrawPlayer(ctx, pSx, G41.y, thrusting)
  ctx.globalAlpha = 1

  // Score
  ctx.textAlign   = 'center'
  ctx.font        = 'bold 28px monospace'
  ctx.fillStyle   = _lt ? 'rgba(20,21,43,0.9)' : 'rgba(255,255,255,0.92)'
  ctx.shadowColor = '#f97316'; ctx.shadowBlur = 16
  ctx.fillText(G41.score, w / 2, 46)
  ctx.shadowBlur  = 0

  // Speed
  ctx.textAlign = 'right'; ctx.font = '11px monospace'
  ctx.fillStyle = _lt ? 'rgba(194,65,12,0.75)' : 'rgba(249,115,22,0.5)'
  ctx.fillText(`${Math.round(G41.camSpd)} px/s`, w - 12, 36)

  // Hint (first 3 blocks)
  if (G41.score < 3 && G41.phase === 'playing') {
    ctx.globalAlpha = Math.max(0, 0.65 - G41.score * 0.2)
    ctx.textAlign   = 'center'; ctx.font = '12px monospace'
    ctx.fillStyle   = '#f97316'
    ctx.fillText('Arrow keys / WASD — or hold-touch toward where you want to go', w / 2, h - 18)
    ctx.globalAlpha = 1
  }

  ctx.restore()
}

function _g41DrawObs(ctx, o, h) {
  function block(x, y, bw, bh) {
    if (bw <= 0 || bh <= 0) return
    // Blocks stay a deep tone on a light page so they still read as solid
    ctx.fillStyle = (typeof qgLight === 'function' && qgLight()) ? '#3d2a1f' : '#080e1c'
    ctx.fillRect(x, y, bw, bh)
    ctx.strokeStyle = '#f97316'; ctx.lineWidth = 1.8
    ctx.shadowColor = '#f97316'; ctx.shadowBlur = 12
    ctx.strokeRect(x + 0.9, y, bw - 1.8, bh)
    ctx.shadowBlur  = 0
    ctx.fillStyle   = 'rgba(249,115,22,0.09)'
    ctx.fillRect(x + 4, y, 8, bh)
  }

  const sx = o.wx - G41.camX
  if      (o.kind === 'gap')   { block(sx, 0, G41_OW, o.topH); block(sx, h - o.botH, G41_OW, o.botH) }
  else if (o.kind === 'top')   { block(sx, 0, G41_OW, o.topH) }
  else if (o.kind === 'bot')   { block(sx, h - o.botH, G41_OW, o.botH) }
  else if (o.kind === 'float') { block(sx - (o.floatW - G41_OW) / 2, o.floatY, o.floatW, o.floatH) }
}

function _g41DrawPlayer(ctx, x, y, thrusting) {
  const pw = G41_PW, ph = G41_PH

  if (thrusting) {
    const spd = Math.sqrt(G41.vx * G41.vx + G41.vy * G41.vy)
    const fdx = spd > 5 ? -G41.vx / spd : 0
    const fdy = spd > 5 ? -G41.vy / spd : 1
    const fl  = 20 + Math.random() * 9
    const fg  = ctx.createLinearGradient(x, y, x + fdx * fl, y + fdy * fl)
    fg.addColorStop(0,   'rgba(251,191,36,0.95)')
    fg.addColorStop(0.5, 'rgba(249,115,22,0.7)')
    fg.addColorStop(1,   'rgba(249,115,22,0)')
    ctx.beginPath()
    ctx.moveTo(x - ph * 0.35 * (1 - Math.abs(fdx)), y - ph * 0.35 * (1 - Math.abs(fdy)))
    ctx.lineTo(x + fdx * fl, y + fdy * fl)
    ctx.lineTo(x + ph * 0.35 * (1 - Math.abs(fdx)), y + ph * 0.35 * (1 - Math.abs(fdy)))
    ctx.closePath(); ctx.fillStyle = fg; ctx.fill()
  }

  ctx.fillStyle   = '#1c0a30'
  ctx.shadowColor = '#f97316'; ctx.shadowBlur = 22
  ctx.fillRect(x - pw, y - ph, pw * 2, ph * 2)
  ctx.shadowBlur  = 0
  ctx.strokeStyle = '#fb923c'; ctx.lineWidth = 2
  ctx.shadowColor = '#f97316'; ctx.shadowBlur = 8
  ctx.strokeRect(x - pw + 1, y - ph + 1, pw * 2 - 2, ph * 2 - 2)
  ctx.shadowBlur  = 0

  ctx.beginPath()
  ctx.arc(x, y - ph * 0.1, ph * 0.38, 0, Math.PI * 2)
  ctx.fillStyle   = thrusting ? 'rgba(251,191,36,0.8)' : 'rgba(249,115,22,0.4)'
  ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 8
  ctx.fill(); ctx.shadowBlur = 0
}
