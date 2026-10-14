// ═══════════════════════════════════════════════════════
//  GAME 38 — QUANTUM CROSSY
//  Hop across quantum-random traffic and water.
//  Arrow keys / WASD / swipe. Score = rows crossed.
//  Quantum lanes: cars flicker — safe when transparent.
// ═══════════════════════════════════════════════════════

const G38_COLS  = 11
const G38_ROWH  = 58
const G38_SCOL  = 5
const G38_SROW  = 2
const G38_LOOK  = 35
const G38_JUMP  = 28
const G38_CAR_C = ['#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#a855f7','#ec4899','#06b6d4','#14b8a6','#f43f5e']

let G38 = {
  active: false,
  rows: {},
  colW: 60,
  p: {},
  camY: 0,
  score: 0, best: 0,
  alive: true,
  deathT: -1,
  raf: null, lastT: 0,
}
window._g38Score = 0

// ── row generation ─────────────────────────────────────

function _g38EnsureRows(upto) {
  for (let i = 0; i <= upto; i++) if (!G38.rows[i]) G38.rows[i] = _g38Row(i)
}

function _g38Row(idx) {
  if (idx <= G38_SROW + 1) return { type: 'grass', items: [], s: idx & 1 }

  let roadRun = 0, waterRun = 0
  for (let j = idx - 1; j >= Math.max(0, idx - 4); j--) {
    const r = G38.rows[j]; if (!r) break
    if (r.type === 'road' || r.type === 'rail') roadRun++
    else if (r.type === 'water') waterRun++
    else break
  }

  const diff = Math.min(1, (idx - G38_SROW) / 80)
  let type
  if (roadRun >= 3 || waterRun >= 3) type = 'grass'
  else {
    const n = qRandInt(100)
    type = n < 28 ? 'grass' : n < 62 ? 'road' : n < 82 ? 'water' : diff > 0.2 ? 'rail' : 'road'
  }

  const s = idx & 1
  const W = G38_COLS * G38.colW

  if (type === 'grass') return { type, items: [], s }

  if (type === 'road') {
    const dir    = qRandInt(2) ? 1 : -1
    const spd    = dir * (45 + diff * 110 + qRandInt(55))
    const isQ    = qRandInt(6) === 0
    const cw     = G38.colW * (0.85 + Math.random() * 0.7)
    const gapMin = G38.colW * (0.7 + (1 - diff) * 1.6)
    const items  = []
    let x = Math.random() * W
    for (let n = 0; n < 5 + Math.floor(diff * 5); n++) {
      items.push({ x, w: cw, c: G38_CAR_C[qRandInt(G38_CAR_C.length)], qo: Math.random() * Math.PI * 2 })
      x += cw + gapMin + Math.random() * G38.colW * 2
    }
    return { type, items, dir, spd, s, isQ }
  }

  if (type === 'water') {
    const dir  = qRandInt(2) ? 1 : -1
    const spd  = dir * (28 + diff * 50 + qRandInt(20))
    const lw   = G38.colW * (1.5 + qRandInt(3) * 0.7)
    const items = []
    for (let x = -lw; x < W * 1.2; x += lw + G38.colW * (0.5 + Math.random() * 2)) {
      items.push({ x, w: lw })
    }
    return { type, items, dir, spd, s }
  }

  // rail
  const dir = qRandInt(2) ? 1 : -1
  const spd = dir * (220 + diff * 160)
  const tw  = G38.colW * (3 + qRandInt(3))
  const tx  = dir > 0 ? -tw - G38.colW * 4 : W + G38.colW * 4
  return { type: 'rail', items: [{ x: tx, w: tw }], dir, spd, s, nextT: 3 + Math.random() * 4 }
}

// ── lifecycle ──────────────────────────────────────────

function stopGame38() {
  G38.active = false
  if (G38.raf) { cancelAnimationFrame(G38.raf); G38.raf = null }
  document.removeEventListener('keydown', _g38Key)
  const c = document.getElementById('g38-canvas')
  if (c) { c.removeEventListener('touchstart', _g38Ts); c.removeEventListener('touchend', _g38Te) }
}
window.stopGame38 = stopGame38

window.initGame38 = async function() {
  stopGame38()
  document.getElementById('g38-over').classList.remove('show')
  document.getElementById('g38-overlay').style.display = 'flex'
  await initCurby()
}

window.startCrossy = function() {
  SFX.resume(); SFX.click()
  const c = document.getElementById('g38-canvas')
  c.width  = c.parentElement.clientWidth
  c.height = c.parentElement.clientHeight
  document.getElementById('g38-overlay').style.display = 'none'
  G38.colW = c.width / G38_COLS

  G38.rows = {}
  const swx = (G38_SCOL + 0.5) * G38.colW
  const swy = (G38_SROW + 0.5) * G38_ROWH
  G38.p = {
    row: G38_SROW, col: G38_SCOL,
    wx: swx, wy: swy,
    pwx: swx, pwy: swy,
    twx: swx, twy: swy,
    hopT: 0, hopD: 0.13,
  }
  G38.camY   = swy
  G38.score  = 0
  G38.alive  = true
  G38.deathT = -1
  G38.active = true

  _g38EnsureRows(G38_SROW + G38_LOOK)
  document.getElementById('g38-score-hud').textContent = '0'
  document.addEventListener('keydown', _g38Key)
  c.addEventListener('touchstart', _g38Ts, { passive: false })
  c.addEventListener('touchend',   _g38Te, { passive: false })
  G38.lastT = performance.now()
  G38.raf   = requestAnimationFrame(_g38Loop)
}

// ── input ──────────────────────────────────────────────

let _g38Txy = null

function _g38Key(e) {
  if (!document.getElementById('game38').classList.contains('active')) return
  const d = { ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right',
               KeyW:'up', KeyS:'down', KeyA:'left', KeyD:'right', Space:'up' }[e.code]
  if (d) { e.preventDefault(); _g38Move(d) }
}
function _g38Ts(e) {
  e.preventDefault()
  _g38Txy = [e.changedTouches[0].clientX, e.changedTouches[0].clientY]
}
function _g38Te(e) {
  e.preventDefault()
  if (!_g38Txy) return
  const dx = e.changedTouches[0].clientX - _g38Txy[0]
  const dy = e.changedTouches[0].clientY - _g38Txy[1]
  const ax = Math.abs(dx), ay = Math.abs(dy)
  if (ax < 10 && ay < 10) _g38Move('up')
  else if (ay > ax)       _g38Move(dy < 0 ? 'up' : 'down')
  else                    _g38Move(dx < 0 ? 'left' : 'right')
  _g38Txy = null
}

function _g38Move(dir) {
  if (!G38.active || !G38.alive || G38.p.hopT > 0) return
  const p = G38.p
  let nr = p.row, nc = p.col
  if (dir === 'up')    nr++
  if (dir === 'down')  nr = Math.max(0, nr - 1)
  if (dir === 'left')  nc--
  if (dir === 'right') nc++
  if (nc < 0 || nc >= G38_COLS) { _g38Die(); return }
  if (nr === p.row && nc === p.col) return

  p.pwx = p.wx; p.pwy = p.wy
  p.row = nr; p.col = nc
  p.twx = (nc + 0.5) * G38.colW
  p.twy = (nr + 0.5) * G38_ROWH
  p.hopT = p.hopD
  SFX.click?.()

  const s = Math.max(0, nr - G38_SROW)
  if (s > G38.score) {
    G38.score = s
    document.getElementById('g38-score-hud').textContent = G38.score
  }
  _g38EnsureRows(nr + G38_LOOK)
}

// ── physics ────────────────────────────────────────────

function _g38Die() {
  if (!G38.alive) return
  G38.alive  = false
  G38.deathT = 0.75
  if (G38.score > G38.best) G38.best = G38.score
  window._g38Score = G38.score
}

function _g38Overlap(px, pr, lx, lw, W) {
  for (const ox of [0, W, -W])
    if (px + pr > lx + ox && px - pr < lx + ox + lw) return true
  return false
}

function _g38CheckLanding() {
  const p = G38.p
  const row = G38.rows[p.row]; if (!row) return
  const W  = G38_COLS * G38.colW
  const pr = G38.colW * 0.28
  if (row.type === 'water') {
    let on = false
    for (const log of row.items) if (_g38Overlap(p.wx, pr, log.x, log.w, W)) { on = true; break }
    if (!on) _g38Die()
  }
}

function _g38CheckCarHit(nowMs) {
  if (!G38.alive) return
  const p = G38.p; if (p.hopT > 0) return
  const row = G38.rows[p.row]; if (!row) return
  if (row.type !== 'road' && row.type !== 'rail') return
  const W = G38_COLS * G38.colW, pr = G38.colW * 0.28
  for (const car of row.items) {
    if (row.isQ && Math.sin(nowMs * 0.0035 + car.qo) <= 0) continue
    if (_g38Overlap(p.wx, pr, car.x, car.w, W)) { _g38Die(); return }
  }
}

function _g38RideLog(dt) {
  const p = G38.p; if (p.hopT > 0) return
  const row = G38.rows[p.row]; if (!row || row.type !== 'water') return
  const W = G38_COLS * G38.colW, pr = G38.colW * 0.28
  let onLog = false
  for (const log of row.items) {
    if (_g38Overlap(p.wx, pr, log.x, log.w, W)) {
      p.wx  += row.spd * dt
      p.twx += row.spd * dt
      onLog = true
      if (p.wx < 0 || p.wx > W) _g38Die()
      break
    }
  }
  if (!onLog) _g38Die()
}

// ── loop ───────────────────────────────────────────────

function _g38Loop(ts) {
  if (!G38.active) return
  const dt  = Math.min((ts - G38.lastT) / 1000, 0.05)
  G38.lastT = ts

  const W    = G38_COLS * G38.colW
  const pRow = G38.p.row
  const uMin = Math.max(0, pRow - 8)
  const uMax = pRow + G38_LOOK

  for (let ri = uMin; ri <= uMax; ri++) {
    const row = G38.rows[ri]; if (!row) continue
    if (row.type === 'road') {
      for (const car of row.items) {
        car.x += row.spd * dt
        if (row.spd > 0 && car.x > W + car.w)   car.x -= W + car.w
        if (row.spd < 0 && car.x + car.w < -car.w) car.x += W + car.w
      }
    }
    if (row.type === 'water') {
      for (const log of row.items) {
        log.x += row.spd * dt
        if (row.spd > 0 && log.x > W + log.w)   log.x -= W + log.w
        if (row.spd < 0 && log.x + log.w < -log.w) log.x += W + log.w
      }
    }
    if (row.type === 'rail') {
      const tr = row.items[0]
      tr.x += row.spd * dt
      if (row.spd > 0 && tr.x > W + 60)         tr.x = -tr.w - G38.colW * (3 + Math.random() * 5)
      if (row.spd < 0 && tr.x + tr.w < -60)     tr.x = W + G38.colW * (3 + Math.random() * 5)
    }
  }

  const p = G38.p
  if (p.hopT > 0) {
    p.hopT = Math.max(0, p.hopT - dt)
    const t    = 1 - p.hopT / p.hopD
    const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
    p.wx = p.pwx + (p.twx - p.pwx) * ease
    p.wy = p.pwy + (p.twy - p.pwy) * ease
    if (p.hopT === 0) { p.wx = p.twx; p.wy = p.twy; _g38CheckLanding() }
  } else {
    _g38RideLog(dt)
    _g38CheckCarHit(ts)
  }

  // Camera: follow upward freely, return slower
  const tCam = p.wy
  G38.camY += (tCam - G38.camY) * (tCam > G38.camY ? 0.10 : 0.05)

  if (!G38.alive) {
    G38.deathT -= dt
    if (G38.deathT <= 0) { _g38End(); return }
  }

  _g38Draw(ts)
  G38.raf = requestAnimationFrame(_g38Loop)
}

// ── draw ───────────────────────────────────────────────

function _g38Draw(now) {
  const cv  = document.getElementById('g38-canvas')
  const ctx = cv.getContext('2d')
  const W = cv.width, H = cv.height
  const cw = G38.colW

  const toSX = wx => wx
  const toSY = wy => H * 0.62 + (G38.camY - wy)

  const rowBot = Math.floor((G38.camY - H * 0.62) / G38_ROWH) - 1
  const rowTop = Math.ceil((G38.camY + H * 0.40) / G38_ROWH) + 1

  // Canvases get no CSS variables, so read the theme directly — light
  // mode is the same crossing by day
  const _lt = typeof qgLight === 'function' && qgLight()
  ctx.fillStyle = _lt ? '#e2e8f0' : '#0f172a'
  ctx.fillRect(0, 0, W, H)

  for (let ri = rowBot; ri <= rowTop; ri++) {
    const row = G38.rows[ri]; if (!row) continue
    const sy  = toSY((ri + 1) * G38_ROWH)
    const rH  = G38_ROWH

    if (row.type === 'grass') {
      ctx.fillStyle = _lt ? (row.s ? '#a3e6b4' : '#b6efc4') : (row.s ? '#14532d' : '#166534')
      ctx.fillRect(0, sy, W, rH)
      ctx.fillStyle = _lt ? (row.s ? '#86d39a' : '#97dcaa') : (row.s ? '#166534' : '#15803d')
      for (let x = cw * 0.5; x < W; x += cw) {
        ctx.fillRect(x - 2, sy + rH * 0.3, 4, rH * 0.4)
      }
    }

    if (row.type === 'road') {
      ctx.fillStyle = _lt ? (row.s ? '#71717a' : '#6b7280') : (row.s ? '#1f2937' : '#111827')
      ctx.fillRect(0, sy, W, rH)
      ctx.strokeStyle = 'rgba(253,224,71,0.5)'
      ctx.lineWidth = 2; ctx.setLineDash([cw * 0.42, cw * 0.28])
      ctx.beginPath(); ctx.moveTo(0, sy + rH / 2); ctx.lineTo(W, sy + rH / 2); ctx.stroke()
      ctx.setLineDash([])
      if (row.isQ) {
        ctx.fillStyle = 'rgba(139,92,246,0.12)'
        ctx.fillRect(0, sy, W, rH)
        ctx.fillStyle = 'rgba(139,92,246,0.35)'
        ctx.fillRect(0, sy, 5, rH); ctx.fillRect(W - 5, sy, 5, rH)
      }
      for (const car of row.items) {
        for (const ox of [0, W, -W]) {
          const cx = car.x + ox
          if (cx + car.w < -10 || cx > W + 10) continue
          let alpha = 1
          if (row.isQ) {
            const s = Math.sin(now * 0.0035 + car.qo)
            alpha = Math.max(0.12, (s + 1) / 2)
          }
          ctx.globalAlpha = alpha
          _g38DrawCar(ctx, cx, sy + rH * 0.12, car.w, rH * 0.76, car.c, row.dir)
          ctx.globalAlpha = 1
        }
      }
    }

    if (row.type === 'water') {
      ctx.fillStyle = _lt ? (row.s ? '#60a5fa' : '#3b82f6') : (row.s ? '#1e3a8a' : '#1e40af')
      ctx.fillRect(0, sy, W, rH)
      const wOff = (now * 0.055 * (row.dir > 0 ? 1 : -1)) % (cw * 1.4)
      ctx.strokeStyle = _lt ? 'rgba(255,255,255,0.5)' : 'rgba(96,165,250,0.38)'; ctx.lineWidth = 1.5
      for (let x = -cw + wOff; x < W + cw; x += cw * 0.9) {
        ctx.beginPath()
        ctx.moveTo(x, sy + rH * 0.38)
        ctx.quadraticCurveTo(x + cw * 0.2, sy + rH * 0.22, x + cw * 0.45, sy + rH * 0.38)
        ctx.quadraticCurveTo(x + cw * 0.7, sy + rH * 0.54, x + cw * 0.9, sy + rH * 0.38)
        ctx.stroke()
      }
      for (const log of row.items) {
        for (const ox of [0, W, -W]) {
          const lx = log.x + ox
          if (lx + log.w < -10 || lx > W + 10) continue
          _g38DrawLog(ctx, lx, sy + rH * 0.15, log.w, rH * 0.70)
        }
      }
    }

    if (row.type === 'rail') {
      ctx.fillStyle = _lt ? (row.s ? '#d6d3d1' : '#e7e5e4') : (row.s ? '#292524' : '#1c1917')
      ctx.fillRect(0, sy, W, rH)
      ctx.strokeStyle = _lt ? 'rgba(87,83,78,0.6)' : 'rgba(161,161,170,0.4)'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(0, sy + rH * 0.28); ctx.lineTo(W, sy + rH * 0.28); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(0, sy + rH * 0.72); ctx.lineTo(W, sy + rH * 0.72); ctx.stroke()
      ctx.strokeStyle = _lt ? 'rgba(120,113,108,0.6)' : 'rgba(120,113,108,0.45)'; ctx.lineWidth = 3
      for (let x = 0; x < W; x += cw * 0.55) {
        ctx.beginPath(); ctx.moveTo(x, sy + rH * 0.22); ctx.lineTo(x, sy + rH * 0.78); ctx.stroke()
      }
      const tr = row.items[0]
      if (tr.x + tr.w > -20 && tr.x < W + 20) {
        const tx = tr.x, ty = sy + rH * 0.12, tw = tr.w, th = rH * 0.76
        const r  = 4
        ctx.fillStyle = '#dc2626'
        ctx.shadowColor = '#dc2626'; ctx.shadowBlur = 10
        ctx.beginPath()
        ctx.moveTo(tx + r, ty); ctx.lineTo(tx + tw - r, ty)
        ctx.quadraticCurveTo(tx + tw, ty, tx + tw, ty + r)
        ctx.lineTo(tx + tw, ty + th - r)
        ctx.quadraticCurveTo(tx + tw, ty + th, tx + tw - r, ty + th)
        ctx.lineTo(tx + r, ty + th); ctx.quadraticCurveTo(tx, ty + th, tx, ty + th - r)
        ctx.lineTo(tx, ty + r); ctx.quadraticCurveTo(tx, ty, tx + r, ty)
        ctx.closePath(); ctx.fill()
        ctx.shadowBlur = 0
        ctx.fillStyle = 'rgba(253,224,71,0.7)'
        for (let wx = tx + 6; wx < tx + tw - 14; wx += 18)
          ctx.fillRect(wx, ty + th * 0.2, 12, th * 0.36)
        const frontX = row.dir > 0 ? tx + tw : tx
        ctx.fillStyle = '#fde047'; ctx.shadowColor = '#fde047'; ctx.shadowBlur = 14
        ctx.beginPath(); ctx.arc(frontX, ty + th / 2, 5.5, 0, Math.PI * 2); ctx.fill()
        ctx.shadowBlur = 0
      }
    }
  }

  // player
  const p = G38.p
  const flash = !G38.alive && Math.floor(now / 85) % 2 === 0
  if (G38.alive || flash) {
    const t       = p.hopT > 0 ? (1 - p.hopT / p.hopD) : 1
    const jumpOff = p.hopT > 0 ? -Math.sin(t * Math.PI) * G38_JUMP : 0
    const sx = toSX(p.wx)
    const sy = toSY(p.wy) + jumpOff
    const pr = cw * 0.30

    ctx.fillStyle = _lt ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.30)'
    ctx.beginPath(); ctx.ellipse(sx, toSY(p.wy) + 3, pr * 0.75, pr * 0.22, 0, 0, Math.PI * 2); ctx.fill()

    ctx.fillStyle = 'rgba(129,140,248,0.22)'
    ctx.shadowColor = '#818cf8'; ctx.shadowBlur = 20
    ctx.beginPath(); ctx.arc(sx, sy, pr + 5, 0, Math.PI * 2); ctx.fill()
    ctx.shadowBlur = 0

    ctx.fillStyle = _lt ? '#15803d' : '#4ade80'; ctx.shadowColor = '#4ade80'; ctx.shadowBlur = 10
    ctx.beginPath(); ctx.arc(sx, sy, pr, 0, Math.PI * 2); ctx.fill()
    ctx.shadowBlur = 0

    ctx.fillStyle = '#fff'
    ctx.beginPath(); ctx.arc(sx - pr * 0.32, sy - pr * 0.22, pr * 0.22, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(sx + pr * 0.32, sy - pr * 0.22, pr * 0.22, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#0f172a'
    ctx.beginPath(); ctx.arc(sx - pr * 0.28, sy - pr * 0.26, pr * 0.09, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(sx + pr * 0.28, sy - pr * 0.26, pr * 0.09, 0, Math.PI * 2); ctx.fill()
  }

  // HUD
  ctx.fillStyle = _lt ? 'rgba(255,255,255,0.75)' : 'rgba(3,7,18,0.60)'
  ctx.fillRect(0, 0, W, 42)
  ctx.fillStyle = _lt ? '#14152b' : '#e2e8f0'; ctx.font = 'bold 15px monospace'; ctx.textAlign = 'left'
  ctx.fillText('🐸 ' + G38.score, 12, 27)
  if (G38.best > 0) {
    ctx.fillStyle = _lt ? '#b45309' : '#fbbf24'; ctx.textAlign = 'center'
    ctx.fillText('Best  ' + G38.best, W / 2, 27)
  }
  ctx.textAlign = 'left'
}

function _g38DrawCar(ctx, x, y, w, h, col, dir) {
  const r = Math.min(5, h / 3)
  ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 8
  ctx.beginPath()
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath(); ctx.fill()
  ctx.shadowBlur = 0
  ctx.fillStyle = 'rgba(255,255,255,0.25)'
  ctx.fillRect(x + w * 0.14, y + h * 0.16, w * 0.72, h * 0.38)
  const lx = dir > 0 ? x + w - 5 : x + 3
  ctx.fillStyle = '#fde047'; ctx.shadowColor = '#fde047'; ctx.shadowBlur = 8
  ctx.beginPath(); ctx.arc(lx, y + h * 0.3, 2.5, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.arc(lx, y + h * 0.7, 2.5, 0, Math.PI * 2); ctx.fill()
  ctx.shadowBlur = 0
}

function _g38DrawLog(ctx, x, y, w, h) {
  const r = Math.min(h / 2, 8)
  ctx.fillStyle = '#92400e'; ctx.shadowColor = '#78350f'; ctx.shadowBlur = 4
  ctx.beginPath()
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath(); ctx.fill()
  ctx.shadowBlur = 0
  ctx.strokeStyle = 'rgba(120,53,15,0.55)'; ctx.lineWidth = 1.5
  const step = w / 4
  for (let lx = x + step; lx < x + w - 5; lx += step) {
    ctx.beginPath(); ctx.moveTo(lx, y + 3); ctx.lineTo(lx, y + h - 3); ctx.stroke()
  }
  ctx.fillStyle = '#a16207'
  ctx.beginPath(); ctx.ellipse(x + 5, y + h / 2, 4, h * 0.38, 0, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath(); ctx.ellipse(x + w - 5, y + h / 2, 4, h * 0.38, 0, 0, Math.PI * 2); ctx.fill()
}

// ── end ────────────────────────────────────────────────

function _g38End() {
  stopGame38()
  window._g38Score = G38.score
  document.getElementById('g38-final-score').textContent = G38.score + ' rows'
  renderMedalDisplay('g38-medal-display', 'crossy', G38.score)
  document.getElementById('g38-over').classList.add('show')
}
