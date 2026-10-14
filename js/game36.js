// ═══════════════════════════════════════════════════════
//  GAME 36 — CPS TEST
//  Click or press ANY key. 10 seconds. Integer score.
// ═══════════════════════════════════════════════════════

const G36_DURATION = 10

let G36 = { active: false, done: false, clicks: 0, timeLeft: G36_DURATION, startTime: 0, ripples: [], raf: null, lastTime: 0 }
let G36_roomCode    = null
let G36_sideBySide  = false
let G36_oppClicks   = 0
let G36_opponentCPS = null
let G36_opponentDone = false
window._g36Score    = 0

// ── queue ─────────────────────────────────────────────
window.g36FindMatch = function() {
  mpFindMatch('cps', {
    statusEl: document.getElementById('g36-queue-status'),
    btnEl:    document.getElementById('g36-queue-btn'),
    onMatched: ({ code, sideBySide }) => {
      G36_roomCode    = code
      G36_sideBySide  = sideBySide
      G36_oppClicks   = 0
      G36_opponentCPS = 0
      const sock = mpGetSocket()
      sock.off('opponent-score'); sock.off('opponent-done'); sock.off('opponent-left')
      sock.on('opponent-score', ({ clicks }) => {
        G36_oppClicks   = clicks ?? 0
        const elapsed   = (G36.startTime > 0) ? (performance.now() - G36.startTime) / 1000 : 0
        G36_opponentCPS = elapsed > 0.3 ? Math.round(G36_oppClicks / elapsed) : 0
        _g36UpdateOppHud()
      })
      sock.on('opponent-done', score => {
        G36_opponentCPS  = score
        G36_opponentDone = true
        _g36UpdateOppHud()
      })
      sock.on('opponent-left', () => {
        G36_opponentCPS = null
        document.getElementById('g36-queue-status').textContent = 'Opponent disconnected.'
      })
      startCPS()
    }
  })
}

function _g36UpdateOppHud() {
  const hud  = document.getElementById('g36-opp-hud')
  const stat = document.getElementById('g36-opp-stat')
  if (!hud || !stat) return
  if (G36_roomCode && G36_opponentCPS !== null) {
    hud.style.display = 'flex'
    stat.textContent  = G36_opponentCPS + ' CPS' + (G36_sideBySide ? ' · ' + G36_oppClicks + ' clicks' : '')
  } else {
    hud.style.display = 'none'
  }
}

// ── game lifecycle ────────────────────────────────────
function stopGame36() {
  if (G36.raf) { cancelAnimationFrame(G36.raf); G36.raf = null }
  G36.active = false
  const c = document.getElementById('g36-canvas')
  if (c) { c.onclick = null; c.removeEventListener('pointerdown', _g36Pointer) }
  document.removeEventListener('keydown', _g36Key)
  document.removeEventListener('keyup',   _g36KeyUp)
}
window.stopGame36 = stopGame36

window.initGame36 = async function() {
  stopGame36()
  G36 = { active: false, done: false, clicks: 0, timeLeft: G36_DURATION, startTime: 0, ripples: [], raf: null, lastTime: 0 }
  G36_roomCode     = null
  G36_sideBySide   = false
  G36_oppClicks    = 0
  G36_opponentCPS  = null
  G36_opponentDone = false
  window._g36Score = 0
  document.getElementById('g36-over').classList.remove('show')
  document.getElementById('g36-overlay').style.display = 'flex'
  const hud = document.getElementById('g36-opp-hud')
  if (hud) hud.style.display = 'none'
  const st = document.getElementById('g36-queue-status')
  if (st) st.textContent = ''
  await initCurby()
}

window.startCPS = function() {
  SFX.resume()
  document.getElementById('g36-overlay').style.display = 'none'
  if (G36_roomCode) {
    const hud = document.getElementById('g36-opp-hud')
    if (hud) hud.style.display = 'flex'
  }
  const c = document.getElementById('g36-canvas')
  c.width  = c.parentElement.clientWidth
  c.height = c.parentElement.clientHeight
  G36 = { active: true, done: false, clicks: 0, timeLeft: G36_DURATION, startTime: 0, ripples: [], raf: null, lastTime: performance.now(), heldKeys: new Set() }
  G36_opponentCPS  = G36_roomCode ? (G36_opponentCPS ?? 0) : null
  G36_opponentDone = false
  // pointerdown, not click. `click` only fires after release AND requires
  // the press and release to land on the same spot, so jitter clicking —
  // shaking the mouse while clicking — silently loses clicks. pointerdown
  // fires the instant the button goes down and covers mouse, touch and pen
  // with one handler.
  c.addEventListener('pointerdown', _g36Pointer)
  c.style.touchAction = 'none'          // stop touch scrolling eating presses
  document.addEventListener('keydown', _g36Key)
  document.addEventListener('keyup',   _g36KeyUp)
  G36.raf = requestAnimationFrame(_g36Loop)
}

function _g36Pointer(e) {
  e.preventDefault()
  const r = e.currentTarget.getBoundingClientRect()
  const c = e.currentTarget
  // Map to canvas pixels — the canvas is usually scaled by CSS
  const x = (e.clientX - r.left) * (c.width  / r.width)
  const y = (e.clientY - r.top)  * (c.height / r.height)
  _g36Click(x, y)
}

function _g36Key(e) {
  if (!document.getElementById('game36').classList.contains('active')) return
  if (e.repeat) return
  if (G36.heldKeys && G36.heldKeys.size >= 1 && !G36.heldKeys.has(e.code)) return
  if (G36.heldKeys) G36.heldKeys.add(e.code)
  e.preventDefault()
  _g36Click(null, null)
}
function _g36KeyUp(e) {
  if (G36.heldKeys) G36.heldKeys.delete(e.code)
}

function _g36Click(x, y) {
  if (!G36.active || G36.done) return
  if (G36.startTime === 0) G36.startTime = performance.now()
  G36.clicks++
  SFX.click?.()
  if (x !== null) {
    // x/y already arrive in canvas pixels from _g36Pointer
    G36.ripples.push({ x, y, r: 0, maxR: 60, alpha: 1, t: 0 })
  } else {
    const c = document.getElementById('g36-canvas')
    G36.ripples.push({ x: c.width/2, y: G36_sideBySide ? c.height * 0.75 : c.height/2, r: 0, maxR: 80, alpha: 1, t: 0 })
  }
}

function _g36Loop(ts) {
  if (!G36.active) return
  const dt = Math.min((ts - G36.lastTime) / 1000, 0.05)
  G36.lastTime = ts

  if (G36.startTime > 0 && !G36.done) {
    G36.timeLeft = Math.max(0, G36_DURATION - (ts - G36.startTime) / 1000)
    if (G36.timeLeft === 0) { _g36End(); return }

    if (G36_roomCode && Math.round(ts / 500) !== Math.round((ts - dt*1000) / 500)) {
      mpGetSocket().emit('score-update', { code: G36_roomCode, score: { clicks: G36.clicks } })
      const elapsed = (ts - G36.startTime) / 1000
      G36_opponentCPS = G36_oppClicks > 0 && elapsed > 0.3 ? Math.round(G36_oppClicks / elapsed) : 0
      _g36UpdateOppHud()
    }
  }

  G36.ripples = G36.ripples.filter(r => {
    r.t += dt; r.r += 180 * dt; r.alpha = Math.max(0, 1 - r.t * 2.5)
    return r.alpha > 0
  })

  _g36Draw()
  G36.raf = requestAnimationFrame(_g36Loop)
}

function _g36End() {
  G36.done   = true
  G36.active = false
  cancelAnimationFrame(G36.raf); G36.raf = null
  document.removeEventListener('keydown', _g36Key)

  const cps = Math.round(G36.clicks / G36_DURATION)
  window._g36Score = cps

  if (G36_roomCode) {
    mpGetSocket().emit('game-over', { code: G36_roomCode, score: cps })
  }

  let resultHtml = `${cps} CPS  (${G36.clicks} clicks)`
  if (G36_roomCode && G36_opponentCPS !== null) {
    const oppFinal = G36_opponentDone ? G36_opponentCPS : '…'
    const won      = G36_opponentDone && cps > G36_opponentCPS
    const lost     = G36_opponentDone && cps < G36_opponentCPS
    const verdict  = G36_opponentDone
      ? (won ? '🏆 You win!' : lost ? '😔 They win!' : '🤝 Tie!')
      : ''
    if (G36_opponentDone && typeof recordMpResult === 'function') recordMpResult('cps', won)
    resultHtml += `<br><span style="font-size:.9rem;color:#a5b4fc;">Opponent: ${oppFinal} CPS ${verdict}</span>`
  }

  document.getElementById('g36-final-score').innerHTML = resultHtml
  renderMedalDisplay('g36-medal-display', 'cps', cps)
  document.getElementById('g36-over').classList.add('show')
  SFX.win()
}

function _g36Draw() {
  const c   = document.getElementById('g36-canvas')
  const ctx = c.getContext('2d')
  const W = c.width, H = c.height

  if (G36_sideBySide && G36_roomCode) {
    _g36DrawSplit(ctx, W, H)
  } else {
    _g36DrawFull(ctx, W, H)
  }
}

function _g36DrawSplit(ctx, W, H) {
  const HH = H / 2  // half height

  // Canvases get no CSS variables, so read the theme directly
  const _lt = typeof qgLight === 'function' && qgLight()

  // Opponent panel (top)
  ctx.fillStyle = _lt ? '#e8eaf7' : '#070712'
  ctx.fillRect(0, 0, W, HH)
  ctx.fillStyle = 'rgba(165,180,252,0.08)'
  ctx.fillRect(0, 0, W, HH)

  ctx.fillStyle = _lt ? 'rgba(79,70,229,0.6)' : 'rgba(165,180,252,0.4)'
  ctx.font = `bold ${Math.min(W/24, 14)}px monospace`
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'
  ctx.fillText('👤 OPPONENT', W/2, 8)

  const elapsed = G36.startTime > 0 ? (performance.now() - G36.startTime) / 1000 : 0
  const oppCPS  = G36_oppClicks > 0 && elapsed > 0.3 ? Math.round(G36_oppClicks / elapsed) : 0
  ctx.fillStyle = _lt ? '#4f46e5' : '#a5b4fc'
  ctx.font = `bold ${Math.min(W/4, 72)}px monospace`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.shadowColor = '#6366f1'; ctx.shadowBlur = 16
  ctx.fillText(G36_oppClicks, W/2, HH * 0.52)
  ctx.shadowBlur = 0
  ctx.fillStyle = _lt ? 'rgba(79,70,229,0.75)' : 'rgba(165,180,252,0.6)'
  ctx.font = `bold ${Math.min(W/20, 18)}px monospace`
  ctx.fillText(oppCPS + ' CPS', W/2, HH * 0.82)

  // Divider
  ctx.strokeStyle = 'rgba(99,102,241,0.4)'
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(0, HH); ctx.lineTo(W, HH); ctx.stroke()

  // You panel (bottom)
  ctx.fillStyle = _lt ? '#f4f5fc' : '#0a0a1a'
  ctx.fillRect(0, HH, W, HH)

  ctx.fillStyle = _lt ? 'rgba(79,70,229,0.6)' : 'rgba(129,140,248,0.4)'
  ctx.font = `bold ${Math.min(W/24, 14)}px monospace`
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'
  ctx.fillText('YOU', W/2, HH + 8)

  // Ripples (bottom half only)
  for (const r of G36.ripples) {
    ctx.strokeStyle = `rgba(129,140,248,${r.alpha})`
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI*2); ctx.stroke()
  }

  const liveCPS = elapsed > 0.3 ? Math.round(G36.clicks / elapsed) : 0
  ctx.fillStyle = _lt ? '#1e1b4b' : '#ffffff'
  ctx.font = `bold ${Math.min(W/4, 72)}px monospace`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.shadowColor = '#6366f1'; ctx.shadowBlur = 20
  ctx.fillText(G36.clicks, W/2, HH + HH * 0.52)
  ctx.shadowBlur = 0
  ctx.fillStyle = _lt ? '#4f46e5' : '#a5b4fc'
  ctx.font = `bold ${Math.min(W/20, 18)}px monospace`
  ctx.fillText((G36.startTime === 0 ? 'CPS' : liveCPS + ' CPS'), W/2, HH + HH * 0.82)

  // Timer bar along very bottom
  const progress = G36.startTime === 0 ? 1 : G36.timeLeft / G36_DURATION
  const col = progress > 0.5 ? '#6366f1' : progress > 0.25 ? '#f59e0b' : '#ef4444'
  ctx.fillStyle = _lt ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)'
  ctx.fillRect(0, H - 6, W, 6)
  ctx.fillStyle = col
  ctx.fillRect(0, H - 6, W * progress, 6)
}

function _g36DrawFull(ctx, W, H) {
  // Canvases get no CSS variables, so read the theme directly
  const _lt = typeof qgLight === 'function' && qgLight()
  ctx.fillStyle = _lt ? '#f4f5fc' : '#0a0a1a'
  ctx.fillRect(0, 0, W, H)

  const notStarted = G36.startTime === 0
  if (notStarted) {
    ctx.strokeStyle = 'rgba(99,102,241,0.2)'
    ctx.lineWidth = 2
    ctx.setLineDash([8, 8])
    const pad = 24
    ctx.strokeRect(pad, pad, W - pad*2, H - pad*2)
    ctx.setLineDash([])
    ctx.fillStyle = 'rgba(99,102,241,0.5)'
    ctx.font = `bold ${Math.min(W/12, 32)}px monospace`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText('CLICK OR SPACE TO START', W/2, H/2 + 60)
  }

  for (const r of G36.ripples) {
    ctx.strokeStyle = `rgba(129,140,248,${r.alpha})`
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI*2); ctx.stroke()
  }

  const cx = W/2, cy = H * 0.38, arcR = Math.min(W, H) * 0.28
  const progress = G36.startTime === 0 ? 1 : G36.timeLeft / G36_DURATION
  ctx.strokeStyle = _lt ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'; ctx.lineWidth = 10; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.arc(cx, cy, arcR, -Math.PI/2, Math.PI*2 - Math.PI/2); ctx.stroke()
  const col = progress > 0.5 ? '#6366f1' : progress > 0.25 ? '#f59e0b' : '#ef4444'
  ctx.strokeStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 18
  ctx.beginPath(); ctx.arc(cx, cy, arcR, -Math.PI/2, Math.PI*2 * progress - Math.PI/2); ctx.stroke()
  ctx.shadowBlur = 0

  ctx.fillStyle = _lt ? '#1e1b4b' : '#fff'; ctx.font = `bold ${Math.floor(arcR * 0.7)}px monospace`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(G36.startTime === 0 ? G36_DURATION : Math.ceil(G36.timeLeft), cx, cy)

  const elapsed  = G36.startTime > 0 ? (performance.now() - G36.startTime) / 1000 : 0
  const liveCPS  = elapsed > 0.3 ? Math.round(G36.clicks / elapsed) : 0
  ctx.fillStyle = _lt ? '#4f46e5' : '#a5b4fc'; ctx.font = `bold ${Math.floor(arcR * 0.25)}px monospace`
  ctx.fillText(G36.startTime === 0 ? 'CPS' : `${liveCPS} CPS`, cx, cy + arcR * 0.55)

  ctx.fillStyle = _lt ? '#1e1b4b' : '#ffffff'
  ctx.font = `bold ${Math.min(W/5, 90)}px monospace`
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
  ctx.shadowColor = '#6366f1'; ctx.shadowBlur = 20
  ctx.fillText(G36.clicks, W/2, H * 0.82)
  ctx.shadowBlur = 0

  ctx.fillStyle = _lt ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.35)'; ctx.font = `${Math.min(W/20, 18)}px monospace`
  ctx.fillText('CLICKS', W/2, H * 0.82 + 22)
}
