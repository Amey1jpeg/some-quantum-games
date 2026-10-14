// ═══════════════════════════════════════════════════════
//  GAME 34 — MANUAL SORT
//  Drag a bar onto another to swap, or tap one then tap
//  another. Timer starts on first swap. Sort ascending.
// ═══════════════════════════════════════════════════════

const G34 = {
  active: false,
  bars: [],
  n: 10,
  selected: -1,
  moves: 0,
  timeMs: 0,
  started: false,
  sorted: false,
  bestMs: null,
  raf: null,
  lastTime: 0,
}
window._g34Score = 0

let _g34Canvas = null
function _g34C() {
  if (!_g34Canvas) _g34Canvas = document.getElementById('g34-canvas')
  return _g34Canvas
}

// drag state: idx = bar being dragged, curX = current pointer x in client coords
const _g34Drag = { on: false, idx: -1, startX: 0, curX: 0 }

function stopGame34() {
  G34.active = false
  if (G34.raf) { cancelAnimationFrame(G34.raf); G34.raf = null }
  const c = _g34C()
  if (c) {
    c.removeEventListener('mousedown',  _g34MouseDown)
    c.removeEventListener('mousemove',  _g34MouseMove)
    c.removeEventListener('mouseup',    _g34MouseUp)
    c.removeEventListener('mouseleave', _g34MouseLeave)
    c.removeEventListener('touchstart', _g34TouchStart)
    c.removeEventListener('touchmove',  _g34TouchMove)
    c.removeEventListener('touchend',   _g34TouchEnd)
  }
}
window.stopGame34 = stopGame34

function initGame34() {
  stopGame34()
  _g34Canvas = null
  document.getElementById('g34-over').classList.remove('show')
  document.getElementById('g34-overlay').style.display = 'flex'
  initCurby()
}

function _g34GenBars(n) {
  const vals = new Set()
  while (vals.size < n) vals.add(1 + qRandInt(999))
  const arr = [...vals]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = qRandInt(i + 1)
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function _g34IsSorted(arr) {
  for (let i = 1; i < arr.length; i++) if (arr[i] < arr[i - 1]) return false
  return true
}

window.startManualSort = function(n) {
  SFX.resume(); SFX.click()
  G34.n = n || 10
  const c = _g34C()
  c.width  = c.parentElement.clientWidth
  c.height = c.parentElement.clientHeight
  document.getElementById('g34-overlay').style.display = 'none'

  G34.bars     = _g34GenBars(G34.n)
  G34.selected = -1
  G34.moves    = 0
  G34.timeMs   = 0
  G34.started  = false
  G34.sorted   = false
  G34.active   = true
  _g34Drag.on  = false

  document.getElementById('g34-moves-hud').textContent = '0'
  document.getElementById('g34-time-hud').textContent  = '00:00.00'
  document.getElementById('g34-best-hud').textContent  = G34.bestMs !== null ? _g34FmtTime(G34.bestMs) : '--'

  c.addEventListener('mousedown',  _g34MouseDown)
  c.addEventListener('mousemove',  _g34MouseMove)
  c.addEventListener('mouseup',    _g34MouseUp)
  c.addEventListener('mouseleave', _g34MouseLeave)
  c.addEventListener('touchstart', _g34TouchStart, { passive: false })
  c.addEventListener('touchmove',  _g34TouchMove,  { passive: false })
  c.addEventListener('touchend',   _g34TouchEnd,   { passive: false })

  G34.lastTime = performance.now()
  G34.raf = requestAnimationFrame(g34Loop)
}

function _g34HitIdx(clientX, c) {
  const rect = c.getBoundingClientRect()
  const x    = (clientX - rect.left) * (c.width / rect.width)
  return Math.max(0, Math.min(G34.n - 1, Math.floor(x / (c.width / G34.n))))
}

// ── mouse ─────────────────────────────────────────────
function _g34MouseDown(e) {
  if (!G34.active || G34.sorted) return
  _g34Drag.on     = true
  _g34Drag.idx    = _g34HitIdx(e.clientX, _g34C())
  _g34Drag.startX = e.clientX
  _g34Drag.curX   = e.clientX
}
function _g34MouseMove(e) {
  if (!_g34Drag.on) return
  _g34Drag.curX = e.clientX
}
function _g34MouseUp(e) {
  if (!_g34Drag.on) return
  _g34PointerEnd(e.clientX)
}
function _g34MouseLeave() {
  if (_g34Drag.on) { _g34Drag.on = false; _g34Drag.curX = _g34Drag.startX }
}

// ── touch ─────────────────────────────────────────────
function _g34TouchStart(e) {
  if (!G34.active || G34.sorted) return
  e.preventDefault()
  const t = e.changedTouches[0]
  _g34Drag.on     = true
  _g34Drag.idx    = _g34HitIdx(t.clientX, _g34C())
  _g34Drag.startX = t.clientX
  _g34Drag.curX   = t.clientX
}
function _g34TouchMove(e) {
  if (!_g34Drag.on) return
  e.preventDefault()
  _g34Drag.curX = e.changedTouches[0].clientX
}
function _g34TouchEnd(e) {
  if (!_g34Drag.on) return
  e.preventDefault()
  _g34PointerEnd(e.changedTouches[0].clientX)
}

// ── unified pointer-end ───────────────────────────────
function _g34PointerEnd(clientX) {
  _g34Drag.on = false
  const moved = Math.abs(clientX - _g34Drag.startX)
  if (moved > 12) {
    const toIdx = _g34HitIdx(clientX, _g34C())
    if (toIdx !== _g34Drag.idx) _g34DoSwap(_g34Drag.idx, toIdx)
  } else {
    _g34TrySelect(_g34Drag.idx)
  }
  _g34Drag.curX = 0
}

// ── selection / swap ──────────────────────────────────
function _g34DoSwap(from, to) {
  if (!G34.started) { G34.started = true; G34.lastTime = performance.now() }
  ;[G34.bars[from], G34.bars[to]] = [G34.bars[to], G34.bars[from]]
  G34.moves++
  document.getElementById('g34-moves-hud').textContent = G34.moves
  G34.selected = -1
  SFX.coin()
  if (_g34IsSorted(G34.bars)) G34.sorted = true
}

function _g34TrySelect(idx) {
  if (G34.selected === -1) {
    G34.selected = idx
    SFX.click()
  } else if (G34.selected === idx) {
    G34.selected = -1
  } else {
    _g34DoSwap(G34.selected, idx)
  }
}

function _g34FmtTime(ms) {
  const cs = Math.floor(ms / 10) % 100
  const s  = Math.floor(ms / 1000) % 60
  const m  = Math.floor(ms / 60000)
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(cs).padStart(2,'0')}`
}

function g34Loop(ts) {
  if (!G34.active) return
  const dt = Math.min((ts - G34.lastTime) / 1000, 0.1)
  G34.lastTime = ts

  if (G34.started && !G34.sorted) {
    G34.timeMs += dt * 1000
    document.getElementById('g34-time-hud').textContent = _g34FmtTime(G34.timeMs)
  }

  if (G34.sorted) { endGame34(); return }

  g34Draw()
  G34.raf = requestAnimationFrame(g34Loop)
}

function g34Draw() {
  const c   = _g34C()
  const ctx = c.getContext('2d')
  const w   = c.width, h = c.height
  const n   = G34.n

  // Canvases get no CSS variables, so read the theme directly
  const _lt = typeof qgLight === 'function' && qgLight()
  ctx.fillStyle = _lt ? '#f2f4f8' : '#1a1f2e'
  ctx.fillRect(0, 0, w, h)

  const barW   = w / n
  const gap    = Math.max(1, Math.floor(barW * 0.12))
  const maxVal = Math.max(...G34.bars)
  const labelH = n <= 30 ? 26 : 0
  const areaH  = h - labelH - 8
  const bw     = Math.floor(barW - gap)

  // Compute drag target column (only when actually dragging)
  const isDragging = _g34Drag.on && Math.abs(_g34Drag.curX - _g34Drag.startX) > 12
  const dragTarget = isDragging ? _g34HitIdx(_g34Drag.curX, c) : -1

  for (let i = 0; i < n; i++) {
    const val      = G34.bars[i]
    const bh       = Math.max(4, Math.floor((val / maxVal) * (areaH - 10)))
    const x        = Math.floor(i * barW + gap / 2)
    const y        = areaH - bh + 4
    const isSel    = i === G34.selected
    const isDragSrc = isDragging && i === _g34Drag.idx
    const isDragTgt = isDragging && i === dragTarget && dragTarget !== _g34Drag.idx

    // Glow column
    if (isSel || isDragSrc) {
      ctx.fillStyle = 'rgba(245,158,11,0.15)'
      ctx.fillRect(x - 2, 0, bw + 4, areaH + 4)
    }
    if (isDragTgt) {
      ctx.fillStyle = 'rgba(99,102,241,0.18)'
      ctx.fillRect(x - 2, 0, bw + 4, areaH + 4)
    }

    const barColor = isDragSrc ? '#f59e0b' : isDragTgt ? '#818cf8' : isSel ? '#f59e0b' : '#4a7c59'
    ctx.fillStyle = barColor
    const r = Math.min(3, bw / 2)
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.lineTo(x + bw - r, y)
    ctx.quadraticCurveTo(x + bw, y, x + bw, y + r)
    ctx.lineTo(x + bw, areaH + 4)
    ctx.lineTo(x, areaH + 4)
    ctx.lineTo(x, y + r)
    ctx.quadraticCurveTo(x, y, x + r, y)
    ctx.closePath()
    ctx.fill()

    if (n <= 30) {
      ctx.fillStyle = (isSel || isDragSrc) ? '#fbbf24' : isDragTgt ? (_lt ? '#4f46e5' : '#a5b4fc') : (_lt ? '#3f6e4d' : '#6aab7c')
      ctx.font = `${Math.max(9, Math.min(13, bw - 3))}px monospace`
      ctx.textAlign = 'center'
      ctx.fillText(val, x + bw / 2, h - 6)
    }
  }

  // Arrow from drag source to drag target
  if (isDragging && dragTarget !== -1 && dragTarget !== _g34Drag.idx) {
    const srcX = (_g34Drag.idx + 0.5) * barW
    const tgtX = (dragTarget + 0.5) * barW
    ctx.strokeStyle = 'rgba(245,158,11,0.5)'
    ctx.lineWidth = 2
    ctx.setLineDash([4, 4])
    ctx.beginPath(); ctx.moveTo(srcX, 18); ctx.lineTo(tgtX, 18); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#f59e0b'
    const dir = tgtX > srcX ? 1 : -1
    ctx.beginPath()
    ctx.moveTo(tgtX + dir * 7, 18)
    ctx.lineTo(tgtX - dir * 4, 12)
    ctx.lineTo(tgtX - dir * 4, 24)
    ctx.closePath(); ctx.fill()
  }

  // Tap-selected indicator triangle at top
  if (G34.selected !== -1 && !isDragging) {
    const x = (G34.selected + 0.5) * barW
    ctx.fillStyle = '#f59e0b'
    ctx.beginPath()
    ctx.moveTo(x, 4)
    ctx.lineTo(x - 7, 14)
    ctx.lineTo(x + 7, 14)
    ctx.closePath()
    ctx.fill()
  }

  ctx.textAlign = 'left'
}

function endGame34() {
  SFX.coin()
  stopGame34()
  if (G34.bestMs === null || G34.timeMs < G34.bestMs) G34.bestMs = G34.timeMs
  const score = Math.max(0, 1000 - Math.floor(G34.timeMs / 100))
  window._g34Score = score
  document.getElementById('g34-final-score').textContent = _g34FmtTime(G34.timeMs) + ' · ' + G34.moves + ' swaps'
  renderMedalDisplay('g34-medal-display', 'manualsort', score)
  document.getElementById('g34-over').classList.add('show')
}
