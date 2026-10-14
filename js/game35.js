// ═══════════════════════════════════════════════════════
//  GAME 35 — WAVE DASH
//  GD wave gamemode. Hold to angle up, release to go down.
//  Starts wide and slow — gets tighter and faster.
// ═══════════════════════════════════════════════════════
const G35_WAVE_SPD = 255
const G35_PR       = 7

let G35_roomCode   = null
let G35_sideBySide = false
let G35_shared     = false   // same track for both players (online)
let G35_seed       = 0       // the agreed seed — constant for the whole race
let G35_rngState   = 0       // PRNG cursor, advances as walls are generated
let G35_isHost     = false
let G35_oppAlive   = true
let G35_spectating = false   // you crashed; still watching them run

// Walls normally come from qRandInt, which differs on every machine. For a
// shared track both clients must produce byte-identical output, so online
// runs swap in this seeded generator. mulberry32 — small, fast, and the
// same sequence everywhere.
function _g35Rand(max) {
  if (!G35_shared) return qRandInt(max)
  // Advances G35_rngState, never G35_seed — the seed has to stay constant
  // or every sync packet would broadcast a different starting point and a
  // joiner rebuilding from a late packet would land on a different track.
  G35_rngState = (G35_rngState + 0x6D2B79F5) | 0
  let t = Math.imul(G35_rngState ^ (G35_rngState >>> 15), 1 | G35_rngState)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) % max
}
let G35_oppScore   = null
let G35_oppY       = null   // opponent Y (in their panel-height coordinates)
let G35_oppWallCy  = null   // opponent wall centre Y
let G35_oppWallGap = null   // opponent wall gap height
let G35_oppPanelH  = null   // opponent panel height (so we can scale correctly)
let G35_oppDone    = false
let G35_oppHistory = []  // ring buffer of { cy, gap } samples, newest at index 0

const G35 = {
  active: false,
  y: 0,
  vy: 0,
  holding: false,
  score: 0,
  scrollX: 0,
  scrollAcc: 0,
  speed: 150,
  gapH: 205,
  wallBuf: [],
  wallGenCy: 0,
  wallGenTarget: 0,
  wallGenTimer: 0,
  wallGenVel: 0,
  wallGenDist: 0,
  trail: [],
  cx: 0,
  grace: 3.5,
  panelH: 0,       // effective height for player's panel (= H/2 in side-by-side)
  lastSyncTime: 0,
  raf: null,
  lastTime: 0,
}
window._g35Score = 0

// ── LIMBO KEY MINIGAME ─────────────────────────────────
// Triggers at score 200. Fixed choreography, random correct key.

const G35_LCOLORS = ['#ff2020','#20ff20','#44fcfc','#9404d4','#fcfc84','#84fcb4','#445ccc','#f45cfc']

// 8 slot positions: 2 cols × 4 rows on right side (normalised 0-1 of canvas w / panelH)
const G35_LSLOTS = [
  {x:0.64,y:0.14},{x:0.84,y:0.14},
  {x:0.64,y:0.38},{x:0.84,y:0.38},
  {x:0.64,y:0.62},{x:0.84,y:0.62},
  {x:0.64,y:0.86},{x:0.84,y:0.86},
]

// Fixed permutation sequence (from LimboKeys shuffle patterns, 0-indexed).
// perm[i] = destination slot for whatever key is currently in slot i.
const G35_LPERMS = [
  [1,3,0,2,5,7,4,6],   // clockwise both blocks
  [4,5,6,7,0,1,2,3],   // full block-swap top↔bottom
  [2,0,1,4,3,6,5,7],   // minor local swaps
  [1,3,0,5,2,7,4,6],   // cross swaps
  [6,7,0,1,2,3,4,5],   // 2-step rotate up
  [3,2,1,0,7,6,5,4],   // X-reversal per block
  [2,3,4,5,6,7,0,1],   // 2-step shift down
  [1,3,0,2,6,4,7,5],   // mixed
  [0,2,1,4,3,7,5,6],   // minor finalise
  [2,0,4,1,6,3,7,5],   // complex finish
]
// 5s hint, then 10 shuffles at 0.9s apart (t=5 to t=14.1), pick at t=14
const G35_LPERM_T       = [5.0,5.9,6.8,7.7,8.6,9.5,10.4,11.3,12.2,13.1]
const G35_LSHUFFLE_DUR  = 14
const G35_LNEUTRAL      = '#7070a0'  // all-same colour during shuffle

let G35_limbo          = null
let _g35LimboNextScore = 100   // score that next triggers LIMBO
let _g35LimboInterval  = 100   // gap between triggers (100 or 50)
let _g35LimboResume    = false
let _g35LimboAudio     = null

let _g35Canvas = null
let _g35WallPat = null

function _g35C() {
  if (!_g35Canvas) _g35Canvas = document.getElementById('g35-canvas')
  return _g35Canvas
}

function _g35MakePat(ctx, tint) {
  const off = document.createElement('canvas')
  off.width = 24; off.height = 24
  const oc = off.getContext('2d')
  // Light mode keeps the walls a deep tone so they still read as solid
  const lt = typeof qgLight === 'function' && qgLight()
  const pal = tint === 'red'
    ? (lt ? ['#4a1f22', '#5e2a2d', '#733538'] : ['#1a0707', '#2d1010', '#3d1a1a'])
    : (lt ? ['#1f4560', '#285775', '#336a8c'] : ['#07111e', '#0f2d47', '#163d5e'])
  oc.fillStyle = pal[0]
  oc.fillRect(0, 0, 24, 24)
  oc.fillStyle = pal[1]
  oc.beginPath()
  oc.moveTo(12, 0); oc.lineTo(24, 12); oc.lineTo(12, 24); oc.lineTo(0, 12)
  oc.closePath(); oc.fill()
  oc.fillStyle = pal[2]
  oc.beginPath()
  oc.moveTo(12, 0); oc.lineTo(24, 12); oc.lineTo(12, 12)
  oc.closePath(); oc.fill()
  return ctx.createPattern(off, 'repeat')
}

function _g35UpdateOppHud() {
  const hud  = document.getElementById('g35-opp-hud')
  const stat = document.getElementById('g35-opp-stat')
  if (!hud || !stat) return
  if (G35_roomCode && G35_oppScore !== null && !G35_sideBySide) {
    hud.style.display = 'flex'
    stat.textContent  = G35_oppScore + ' blocks'
  } else if (G35_sideBySide) {
    hud.style.display = 'none'  // HUD hidden in split mode (rendered on canvas)
  }
}

window.g35FindMatch = function() {
  mpFindMatch('wavedash', {
    statusEl: document.getElementById('g35-queue-status'),
    btnEl:    document.getElementById('g35-queue-btn'),
    onMatched: ({ code, sideBySide, isHost }) => {
      G35_roomCode   = code
      // Same track for both, overlaid — not split screen on separate tracks
      G35_sideBySide = false
      G35_shared     = true
      G35_isHost     = !!isHost
      G35_oppAlive   = true
      G35_spectating = false
      // Host mints the seed and ships it; the joiner waits for it so both
      // buffers start from the same state.
      G35_seed = isHost ? (Date.now() ^ (qRandInt(1e9) << 4)) | 0 : 0
      G35_rngState = G35_seed
      G35_oppScore   = 0
      G35_oppY       = null
      G35_oppWallCy  = null
      G35_oppWallGap = null
      G35_oppPanelH  = null
      G35_oppHistory = []
      const sock = mpGetSocket()
      sock.off('opponent-score'); sock.off('opponent-state'); sock.off('opponent-done')
      sock.off('force-end'); sock.off('opponent-left')
      sock.on('opponent-score', score => { G35_oppScore = score; _g35UpdateOppHud() })
      sock.on('opponent-state', (st) => {
        if (typeof st.seed === 'number' && !G35_isHost && st.seed !== G35_seed) {
          // First packet from the host carries the seed — rebuild the track
          G35_seed = st.seed
          _g35RebuildTrack()
        }
        if (typeof st.y === 'number')     G35_oppY     = st.y
        if (typeof st.panelH === 'number')G35_oppPanelH = st.panelH
        if (typeof st.alive === 'boolean')G35_oppAlive = st.alive
        if (typeof st.score === 'number') { G35_oppScore = st.score; _g35UpdateOppHud() }
      })
      sock.on('opponent-done',  score  => { G35_oppScore = score; G35_oppDone = true; _g35UpdateOppHud() })
      // They crashed — you keep going. Surviving longer is the whole point,
      // so ending your run here would throw away the lead you just earned.
      sock.on('force-end', ({ loserScore }) => {
        G35_oppAlive = false
        G35_oppScore = loserScore
        _g35UpdateOppHud()
      })
      sock.on('opponent-left', () => {
        G35_oppScore = null
        document.getElementById('g35-queue-status').textContent = 'Opponent disconnected.'
      })
      startWaveDash()
    }
  })
}

function stopGame35() {
  G35.active = false
  if (G35.raf) { cancelAnimationFrame(G35.raf); G35.raf = null }
  G35_limbo          = null
  _g35LimboResume    = false
  _g35LimboStopMusic()
  document.removeEventListener('keydown',  _g35KD)
  document.removeEventListener('keyup',    _g35KU)
  const c = _g35C()
  if (c) {
    c.removeEventListener('mousedown',  _g35MD)
    c.removeEventListener('mouseup',    _g35MU)
    c.removeEventListener('touchstart', _g35TD)
    c.removeEventListener('touchend',   _g35TU)
  }
}
window.stopGame35 = stopGame35

function _g35KD(e) { if (e.code==='Space'||e.code==='KeyW'||e.code==='ArrowUp') { e.preventDefault(); G35.holding=true } }
function _g35KU(e) { if (e.code==='Space'||e.code==='KeyW'||e.code==='ArrowUp') { e.preventDefault(); G35.holding=false } }
function _g35MD() { G35.holding = true }
function _g35MU() { G35.holding = false }
function _g35TD(e) { e.preventDefault(); G35.holding = true }
function _g35TU(e) { e.preventDefault(); G35.holding = false }

async function initGame35() {
  stopGame35()
  _g35Canvas   = null
  _g35WallPat  = null
  G35_roomCode = null
  G35_sideBySide = false
  G35_shared     = false   // back to solo: quantum walls, no opponent
  G35_spectating = false
  G35_isHost     = false
  G35_oppAlive   = true
  G35_oppScore   = null
  G35_oppY       = null
  G35_oppWallCy  = null
  G35_oppWallGap = null
  G35_oppPanelH  = null
  G35_oppHistory = []
  G35_oppDone    = false
  document.getElementById('g35-over').classList.remove('show')
  document.getElementById('g35-overlay').style.display = 'flex'
  const hud = document.getElementById('g35-opp-hud')
  if (hud) hud.style.display = 'none'
  const st = document.getElementById('g35-queue-status')
  if (st) st.textContent = ''
  await initCurby()
}

window.startWaveDash = function() {
  SFX.resume(); SFX.click()
  if (G35_roomCode && !G35_sideBySide) {
    const hud = document.getElementById('g35-opp-hud')
    if (hud) hud.style.display = 'flex'
  }
  const c = _g35C()
  c.width  = c.parentElement.clientWidth
  c.height = c.parentElement.clientHeight
  document.getElementById('g35-overlay').style.display = 'none'

  const w = c.width, h = c.height
  // In side-by-side mode, player uses bottom half — generate corridor for half-height
  const panelH = G35_sideBySide ? Math.floor(h / 2) : h

  G35.active    = true
  G35.y         = panelH / 2
  G35.vy        = 0
  G35.holding   = false
  G35.score     = 0
  G35.scrollX   = 0
  G35.scrollAcc = 0
  G35.speed     = 150
  G35.gapH      = 205
  G35.grace     = 3.5
  G35.trail     = []
  G35.cx        = Math.floor(w * 0.18)
  G35.panelH    = panelH
  G35.lastSyncTime = 0
  _g35WallPat   = null
  G35_limbo          = null
  _g35LimboNextScore = _g35LimboInterval
  _g35LimboResume    = false

  G35_rngState      = G35_seed
  G35.wallBuf       = []
  G35.wallGenCy     = panelH / 2
  G35.wallGenTarget = panelH / 2
  G35.wallGenTimer  = 240
  G35.wallGenVel    = 0
  G35.wallGenDist   = 0

  const safeLen = Math.max(420, Math.floor(w * 0.70))
  for (let x = 0; x < safeLen; x++) G35.wallBuf.push({ cy: panelH / 2, gapH: G35.gapH })
  g35GenCols(w + 250 - safeLen, panelH)

  document.getElementById('g35-score-hud').textContent = '0'
  document.addEventListener('keydown',   _g35KD)
  document.addEventListener('keyup',     _g35KU)
  c.addEventListener('mousedown',  _g35MD)
  c.addEventListener('mouseup',    _g35MU)
  c.addEventListener('touchstart', _g35TD, { passive: false })
  c.addEventListener('touchend',   _g35TU, { passive: false })

  G35.lastTime = performance.now()
  G35.raf = requestAnimationFrame(g35Loop)
}

// Joiner got the host's seed after starting — throw away the locally
// generated walls and regenerate from the agreed seed.
function _g35RebuildTrack() {
  const c = _g35C(); if (!c || !G35.active) return
  const pH = G35.panelH || c.height
  G35_rngState      = G35_seed        // rewind to the agreed start
  G35.wallBuf       = []
  G35.wallGenCy     = pH / 2
  G35.wallGenTarget = pH / 2
  G35.wallGenVel    = 0
  G35.wallGenDist   = 0
  const need = Math.ceil(c.width) + 400
  for (let x = 0; x < Math.min(need, 400); x++) G35.wallBuf.push({ cy: pH / 2, gapH: G35.gapH })
  g35GenCols(need - Math.min(need, 400), pH)
  G35.scrollX = 0
  G35.score   = 0
}

function g35GenCols(n, h) {
  for (let i = 0; i < n; i++) {
    G35.wallGenDist++
    const margin   = G35.gapH / 2 + 24
    const progress = Math.min(1, G35.wallGenDist / 2400)
    const spread   = (0.12 + progress * 0.28) * h
    const lo       = Math.max(margin, h / 2 - spread)
    const hi       = Math.min(h - margin, h / 2 + spread)
    const step     = G35_WAVE_SPD / G35.speed

    if (Math.abs(G35.wallGenTarget - G35.wallGenCy) <= step) {
      G35.wallGenCy = G35.wallGenTarget
      const mid = (lo + hi) / 2
      if (G35.wallGenCy <= mid) {
        G35.wallGenTarget = mid + _g35Rand(Math.max(1, Math.floor(hi - mid + 1)))
      } else {
        G35.wallGenTarget = lo + _g35Rand(Math.max(1, Math.floor(mid - lo + 1)))
      }
    } else {
      G35.wallGenCy += Math.sign(G35.wallGenTarget - G35.wallGenCy) * step
    }

    G35.wallBuf.push({ cy: G35.wallGenCy, gapH: G35.gapH })
  }
}

// Shared track: send your line, your score and whether you're still up.
// The host repeats the seed every packet so a joiner that missed the first
// one still converges. Called during the countdown as well, so the joiner
// has the right track before GO rather than popping to it afterwards.
function _g35Sync(ts, pH) {
  if (!G35_roomCode || !G35_shared) return
  if (ts - G35.lastSyncTime <= 100) return
  G35.lastSyncTime = ts
  mpGetSocket().emit('state-sync', { code: G35_roomCode, state: {
    y: G35.y, panelH: pH, score: G35.score,
    alive: !G35_spectating,
    ...(G35_isHost ? { seed: G35_seed } : {}),
  }})
}

function g35Loop(ts) {
  if (!G35.active) return
  const dt = Math.min((ts - G35.lastTime) / 1000, 0.05)
  G35.lastTime = ts

  const c   = _g35C()
  const w   = c.width, h = c.height
  const ctx = c.getContext('2d')
  const pH  = G35.panelH  // player's effective height

  // Grace period
  if (G35.grace > 0) {
    G35.grace -= dt
    g35Draw(ctx, w, h)
    if (!_g35LimboResume) {
      const label = G35.grace > 2.5 ? '3' : G35.grace > 1.5 ? '2' : G35.grace > 0.4 ? '1' : 'GO!'
      const alpha  = G35.grace > 0.4 ? 1 : G35.grace / 0.4
      ctx.globalAlpha = alpha
      ctx.font = 'bold 80px monospace'
      ctx.textAlign = 'center'
      ctx.fillStyle = '#4ade80'
      ctx.shadowColor = '#22c55e'; ctx.shadowBlur = 32
      const countY = G35_sideBySide ? h * 0.75 : h / 2
      ctx.fillText(label, w / 2, countY + 28)
      ctx.shadowBlur = 0; ctx.globalAlpha = 1; ctx.textAlign = 'left'
    }
    _g35Sync(ts, G35.panelH || h)
    G35.raf = requestAnimationFrame(g35Loop)
    return
  }
  if (_g35LimboResume) _g35LimboResume = false

  // Scroll
  G35.scrollAcc += G35.speed * dt
  const px = Math.floor(G35.scrollAcc)
  if (px > 0) {
    G35.scrollAcc -= px
    G35.scrollX   += px
    G35.wallBuf.splice(0, px)
    G35.gapH  = Math.max(88, G35.gapH - px * 0.003)
    G35.speed = Math.min(380, 150 + G35.scrollX * 0.018)
    g35GenCols(px, pH)
  }

  // Score
  const newScore = Math.floor(G35.scrollX / 80)
  if (newScore !== G35.score) {
    if (!G35_spectating) G35.score = newScore
    document.getElementById('g35-score-hud').textContent = G35.score
    if (G35_roomCode && G35.score % 5 === 0) {
      mpGetSocket().emit('score-update', { code: G35_roomCode, score: G35.score })
    }
  }

  // Trigger LIMBO every _g35LimboInterval score
  if (!G35_limbo && G35.score >= _g35LimboNextScore) {
    _g35LimboNextScore += _g35LimboInterval
    _g35LimboStart()
  }

  _g35Sync(ts, pH)

  // Wave physics
  G35.vy = G35.holding ? -G35_WAVE_SPD : G35_WAVE_SPD
  G35.y  += G35.vy * dt
  G35.y   = Math.max(G35_PR, Math.min(pH - G35_PR, G35.y))

  // Trail
  G35.trail.push({ sx: G35.scrollX, y: G35.y })
  if (G35.trail.length > 120) G35.trail.shift()

  // Update limbo minigame
  if (G35_limbo) _g35LimboUpdate(dt)

  // Collision — skipped during limbo open/done phases
  const inLimboOpen = G35_limbo && (G35_limbo.phase === 'open' || G35_limbo.phase === 'done')
  if (!inLimboOpen) {
    const wallIdx = Math.min(G35.cx, G35.wallBuf.length - 1)
    const wall    = G35.wallBuf[wallIdx]
    if (!G35_spectating &&
        (G35.y <= wall.cy - wall.gapH / 2 + G35_PR || G35.y >= wall.cy + wall.gapH / 2 - G35_PR)) {
      endGame35(); return
    }
  }

  // Watching them run: once they're down too, show the comparison.
  if (G35_spectating && !G35_oppAlive) {
    G35_spectating = false
    endGame35(); return
  }

  g35Draw(ctx, w, h)

  // Draw limbo keys overlay
  if (G35_limbo) {
    const yOff = G35_sideBySide ? Math.floor(h / 2) : 0
    _g35LimboDrawKeys(ctx, w, yOff)
  }

  G35.raf = requestAnimationFrame(g35Loop)
}

// ── drawing ────────────────────────────────────────────

function g35Draw(ctx, w, h) {
  if (G35_sideBySide) {
    _g35DrawSplit(ctx, w, h)
  } else {
    _g35DrawCore(ctx, w, h, G35.panelH, 0)
  }
}

// Draw the player corridor.
// `panelH` = the logical height of the corridor (wallBuf values are in [0, panelH])
// `yOff`   = vertical pixel offset to render into (0 for full, h/2 for bottom half)
function _g35DrawCore(ctx, w, h, panelH, yOff) {
  // Canvases get no CSS variables, so read the theme directly
  const _lt = typeof qgLight === 'function' && qgLight()
  ctx.fillStyle = _lt ? '#e9f1f7' : '#030710'
  ctx.fillRect(0, yOff, w, panelH)

  const pat = _g35MakePat(ctx, null)
  // During LIMBO open/done: expand corridor visually; walls fade to ghost
  const lmOpen = (G35_limbo && G35_limbo.phase !== 'shuffle') ? (G35_limbo.openT ?? 0) : 0
  const getGap = e => e.gapH + (panelH * 2.5 - e.gapH) * lmOpen
  if (lmOpen > 0) ctx.globalAlpha = Math.max(0.18, 1 - lmOpen * 0.82)

  // Top wall
  ctx.beginPath()
  ctx.moveTo(0, yOff)
  for (let x = 0; x < w; x += 2) {
    const e = G35.wallBuf[Math.min(x, G35.wallBuf.length - 1)]
    ctx.lineTo(x, yOff + e.cy - getGap(e) / 2)
  }
  ctx.lineTo(w, yOff)
  ctx.closePath()
  ctx.fillStyle = pat
  ctx.fill()

  // Bottom wall
  ctx.beginPath()
  ctx.moveTo(0, yOff + panelH)
  for (let x = 0; x < w; x += 2) {
    const e = G35.wallBuf[Math.min(x, G35.wallBuf.length - 1)]
    ctx.lineTo(x, yOff + e.cy + getGap(e) / 2)
  }
  ctx.lineTo(w, yOff + panelH)
  ctx.closePath()
  ctx.fillStyle = pat
  ctx.fill()

  // Edge lines
  ctx.lineWidth = 2.5
  ctx.shadowColor = '#06b6d4'; ctx.shadowBlur = 14
  ctx.beginPath()
  for (let x = 0; x < w; x += 2) {
    const e = G35.wallBuf[Math.min(x, G35.wallBuf.length - 1)]
    const y = yOff + e.cy - getGap(e) / 2
    x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  }
  ctx.strokeStyle = '#67e8f9'; ctx.stroke()
  ctx.beginPath()
  for (let x = 0; x < w; x += 2) {
    const e = G35.wallBuf[Math.min(x, G35.wallBuf.length - 1)]
    const y = yOff + e.cy + getGap(e) / 2
    x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  }
  ctx.strokeStyle = '#67e8f9'; ctx.stroke()
  ctx.shadowBlur = 0
  if (lmOpen > 0) ctx.globalAlpha = 1

  // Trail
  if (G35.trail.length > 1) {
    const pts = []
    for (let i = 0; i < G35.trail.length; i++) {
      const p = G35.trail[i]
      const sx = G35.cx - (G35.scrollX - p.sx)
      if (sx >= -4) pts.push({ x: sx, y: yOff + p.y })
    }
    if (pts.length > 1) {
      ctx.shadowColor = '#4ade80'; ctx.shadowBlur = 10
      ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(74,222,128,0.25)'
      ctx.lineJoin = 'round'; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y)
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
      ctx.stroke()
      ctx.shadowBlur = 6; ctx.lineWidth = 2; ctx.strokeStyle = '#4ade80'
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y)
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
      ctx.stroke()
    }
  }

  // Opponent's wave, on the same corridor. Drawn first so yours sits on
  // top, and scaled by their panel height in case the windows differ.
  if (G35_shared && G35_oppY !== null) {
    const scale = (G35_oppPanelH && G35_oppPanelH > 0) ? (panelH / G35_oppPanelH) : 1
    const oy = yOff + G35_oppY * scale
    ctx.save()
    ctx.globalAlpha = G35_oppAlive ? 0.85 : 0.3
    ctx.translate(G35.cx, oy)
    const os = G35_PR
    ctx.shadowColor = '#38bdf8'; ctx.shadowBlur = 14
    ctx.fillStyle = G35_oppAlive ? '#bae6fd' : '#475569'
    ctx.beginPath()
    ctx.moveTo(os * 1.5, 0)
    ctx.lineTo(-os * 0.5, -os)
    ctx.lineTo(-os * 0.1, 0)
    ctx.lineTo(-os * 0.5, os)
    ctx.closePath(); ctx.fill()
    ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 1.5; ctx.stroke()
    ctx.shadowBlur = 0; ctx.globalAlpha = 1
    ctx.restore()
    if (!G35_oppAlive) {
      ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(G35.cx - 7, oy - 7); ctx.lineTo(G35.cx + 7, oy + 7)
      ctx.moveTo(G35.cx + 7, oy - 7); ctx.lineTo(G35.cx - 7, oy + 7)
      ctx.stroke()
    }
  }

  // Your wave — hidden once you've crashed and are just watching
  if (G35_spectating) {
    ctx.textAlign = 'center'
    ctx.font = 'bold 13px monospace'; ctx.fillStyle = '#f87171'
    ctx.fillText(`YOU CRASHED AT ${G35.score} — watching them run`, ctx.canvas.width / 2, 26)
  } else {
  const angle = Math.atan2(G35.vy, G35.speed)
  ctx.save()
  ctx.translate(G35.cx, yOff + G35.y)
  ctx.rotate(angle)
  const s = G35_PR
  ctx.shadowColor = '#4ade80'; ctx.shadowBlur = 18
  ctx.fillStyle = _lt ? '#166534' : '#ffffff'
  ctx.beginPath()
  ctx.moveTo(s * 1.5, 0)
  ctx.lineTo(-s * 0.5, -s)
  ctx.lineTo(-s * 0.1, 0)
  ctx.lineTo(-s * 0.5, s)
  ctx.closePath(); ctx.fill()
  ctx.strokeStyle = '#4ade80'; ctx.lineWidth = 1.5; ctx.stroke()
  ctx.shadowBlur = 0
  ctx.restore()
  }

  // "YOU" label in player panel
  if (G35_sideBySide) {
    ctx.fillStyle = 'rgba(74,222,128,0.5)'
    ctx.font = `bold ${Math.min(w/24, 14)}px monospace`
    ctx.textAlign = 'center'
    ctx.fillText('YOU', w / 2, yOff + 16)
    // Score
    ctx.fillStyle = '#4ade80'
    ctx.font = `bold ${Math.min(w/20, 16)}px monospace`
    ctx.textAlign = 'right'
    ctx.fillText(G35.score + ' blocks', w - 10, yOff + panelH - 8)
    ctx.textAlign = 'left'
  }
}

// Draw opponent corridor in the top half using history buffer
function _g35DrawOpp(ctx, w, HH) {
  const _lt = typeof qgLight === 'function' && qgLight()
  ctx.fillStyle = _lt ? '#f6ecef' : '#07030f'
  ctx.fillRect(0, 0, w, HH)

  if (G35_oppHistory.length > 1) {
    const srcH  = G35_oppPanelH ?? HH
    const scale = HH / srcH
    const n     = G35_oppHistory.length

    // Build per-pixel top/bottom arrays by interpolating history
    // x = w-1 is newest (opponent's current pos), x = 0 is oldest
    const topY = new Float32Array(w)
    const botY = new Float32Array(w)
    for (let x = 0; x < w; x++) {
      const t       = (w - 1 - x) / (w - 1)          // 0=newest, 1=oldest
      const fi      = t * (n - 1)
      const lo      = Math.floor(fi)
      const hi      = Math.min(lo + 1, n - 1)
      const frac    = fi - lo
      const cy  = (G35_oppHistory[lo].cy  + (G35_oppHistory[hi].cy  - G35_oppHistory[lo].cy)  * frac) * scale
      const gap = (G35_oppHistory[lo].gap + (G35_oppHistory[hi].gap - G35_oppHistory[lo].gap) * frac) * scale
      topY[x] = Math.max(0, cy - gap / 2)
      botY[x] = Math.min(HH, cy + gap / 2)
    }

    const pat = _g35MakePat(ctx, 'red')

    // Top wall filled polygon
    ctx.beginPath()
    ctx.moveTo(0, 0)
    for (let x = 0; x < w; x++) ctx.lineTo(x, topY[x])
    ctx.lineTo(w, 0)
    ctx.closePath()
    ctx.fillStyle = pat; ctx.fill()

    // Bottom wall filled polygon
    ctx.beginPath()
    ctx.moveTo(0, HH)
    for (let x = 0; x < w; x++) ctx.lineTo(x, botY[x])
    ctx.lineTo(w, HH)
    ctx.closePath()
    ctx.fillStyle = pat; ctx.fill()

    // Edge lines with glow
    ctx.lineWidth = 2.5
    ctx.strokeStyle = '#f87171'
    ctx.shadowColor = '#f87171'; ctx.shadowBlur = 10
    ctx.beginPath()
    for (let x = 0; x < w; x++) { x === 0 ? ctx.moveTo(x, topY[x]) : ctx.lineTo(x, topY[x]) }
    ctx.stroke()
    ctx.beginPath()
    for (let x = 0; x < w; x++) { x === 0 ? ctx.moveTo(x, botY[x]) : ctx.lineTo(x, botY[x]) }
    ctx.stroke()
    ctx.shadowBlur = 0

    // Opponent dot at their current position (rightmost, x = cx)
    if (G35_oppY !== null) {
      const oppY = G35_oppY * scale
      ctx.fillStyle = '#f87171'
      ctx.shadowColor = '#f87171'; ctx.shadowBlur = 16
      ctx.beginPath(); ctx.arc(G35.cx, oppY, G35_PR, 0, Math.PI * 2); ctx.fill()
      ctx.shadowBlur = 0
    }
  } else if (G35_oppY !== null && G35_oppWallCy !== null) {
    // Not enough history yet — fall back to flat corridor
    const srcH  = G35_oppPanelH ?? HH
    const scale = HH / srcH
    const cy    = G35_oppWallCy  * scale
    const gap   = G35_oppWallGap * scale
    ctx.fillStyle = _g35MakePat(ctx, 'red')
    ctx.fillRect(0, 0, w, Math.max(0, cy - gap / 2))
    ctx.fillRect(0, cy + gap / 2, w, HH - (cy + gap / 2))
    ctx.strokeStyle = '#f87171'; ctx.lineWidth = 2.5
    ctx.shadowColor = '#f87171'; ctx.shadowBlur = 10
    ctx.beginPath(); ctx.moveTo(0, cy - gap/2); ctx.lineTo(w, cy - gap/2); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, cy + gap/2); ctx.lineTo(w, cy + gap/2); ctx.stroke()
    ctx.shadowBlur = 0
  }

  // Label + score
  ctx.fillStyle = 'rgba(248,113,113,0.6)'
  ctx.font = `bold ${Math.min(w/24, 14)}px monospace`
  ctx.textAlign = 'center'
  ctx.fillText('👤 OPPONENT', w / 2, 16)
  if (G35_oppScore !== null) {
    ctx.fillStyle = '#f87171'
    ctx.font = `bold ${Math.min(w/20, 16)}px monospace`
    ctx.textAlign = 'right'
    ctx.fillText(G35_oppScore + ' blocks', w - 10, HH - 8)
    ctx.textAlign = 'left'
  }
}

function _g35DrawSplit(ctx, w, h) {
  const HH = Math.floor(h / 2)

  // Opponent panel (top)
  _g35DrawOpp(ctx, w, HH)

  // Player panel (bottom)
  _g35DrawCore(ctx, w, h, HH, HH)

  // Divider
  ctx.strokeStyle = 'rgba(6,182,212,0.4)'
  ctx.lineWidth = 1
  ctx.setLineDash([])
  ctx.beginPath(); ctx.moveTo(0, HH); ctx.lineTo(w, HH); ctx.stroke()
}

// ── LIMBO functions ────────────────────────────────────

function _g35LSlotPx(i, w, pH) {
  const s = G35_LSLOTS[i]
  return { x: s.x * w, y: s.y * pH }
}

function _g35LimboPlayMusic() {
  try {
    _g35LimboAudio = new Audio('limbo-keys-made-with-Voicemod.mp3')
    _g35LimboAudio.play().catch(() => {})
  } catch(e) {}
}

function _g35LimboStopMusic() {
  if (_g35LimboAudio) {
    try { _g35LimboAudio.pause(); _g35LimboAudio.currentTime = 0 } catch(e) {}
    _g35LimboAudio = null
  }
}

function _g35LimboStart() {
  const c = _g35C()
  const w = c.width, pH = G35.panelH
  const keyPx = []
  for (let k = 0; k < 8; k++) keyPx.push(_g35LSlotPx(k, w, pH))
  G35_limbo = {
    phase: 'shuffle',
    t: 0,
    correct: qRandInt(8),
    slotToKey: [0,1,2,3,4,5,6,7],
    keyToSlot: [0,1,2,3,4,5,6,7],
    keyPx,
    animFrom: null, animTo: null,
    animT: 0, animDur: 0.7, isAnimating: false,
    permStep: -1,
    openT: 0,
    openStep: 'arrange',
    arrangeT: 0, arrangeFrom: null, arrangeTo: null,
    lineX: 0, lineSpd: 0, lineOrder: null,
    result: null, resultT: 0,
  }
  _g35LimboPlayMusic()
}

function _g35LApplyPerm(step) {
  const c = _g35C()
  const w = c.width, pH = G35.panelH
  const lm = G35_limbo
  const perm = G35_LPERMS[step]
  const newSlotToKey = new Array(8)
  for (let s = 0; s < 8; s++) newSlotToKey[perm[s]] = lm.slotToKey[s]
  const newKeyToSlot = new Array(8)
  for (let s = 0; s < 8; s++) newKeyToSlot[newSlotToKey[s]] = s
  lm.animFrom = lm.keyPx.map(p => ({...p}))
  lm.animTo   = new Array(8)
  for (let k = 0; k < 8; k++) lm.animTo[k] = _g35LSlotPx(newKeyToSlot[k], w, pH)
  lm.slotToKey = newSlotToKey
  lm.keyToSlot = newKeyToSlot
  lm.isAnimating = true
  lm.animT = 0
}

function _g35LOpenKeys() {
  const c = _g35C()
  const w = c.width, pH = G35.panelH
  const lm = G35_limbo
  lm.phase       = 'open'
  lm.openStep    = 'arrange'
  lm.arrangeT    = 0
  lm.arrangeFrom = lm.keyPx.map(p => ({...p}))
  // Sort by current y so they form a clean vertical line
  const order = Array.from({length: 8}, (_, k) => k)
    .sort((a, b) => lm.keyPx[a].y - lm.keyPx[b].y)
  lm.lineOrder = order
  lm.lineX     = w * 0.85
  lm.lineSpd   = (w * 0.85 - G35.cx) / 3.0
  lm.arrangeTo = new Array(8)
  for (let i = 0; i < 8; i++) {
    lm.arrangeTo[order[i]] = { x: lm.lineX, y: pH * 0.05 + i * (pH * 0.90 / 7) }
  }
}

function _g35LimboUpdate(dt) {
  const lm = G35_limbo
  if (!lm) return
  lm.t += dt

  const eio = t => t < 0.5 ? 2*t*t : -1+(4-2*t)*t

  if (lm.phase === 'shuffle') {
    const next = lm.permStep + 1
    if (next < G35_LPERMS.length && lm.t >= G35_LPERM_T[next]) {
      _g35LApplyPerm(next)
      lm.permStep = next
    }
    if (lm.isAnimating) {
      lm.animT = Math.min(1, lm.animT + dt / lm.animDur)
      const e = eio(lm.animT)
      for (let k = 0; k < 8; k++) {
        const f = lm.animFrom[k], to = lm.animTo[k]
        lm.keyPx[k] = { x: f.x + (to.x - f.x) * e, y: f.y + (to.y - f.y) * e - Math.sin(Math.PI * e) * 40 }
      }
      if (lm.animT >= 1) {
        for (let k = 0; k < 8; k++) lm.keyPx[k] = {...lm.animTo[k]}
        lm.isAnimating = false
      }
    }
    if (lm.t >= G35_LSHUFFLE_DUR) _g35LOpenKeys()

  } else if (lm.phase === 'open') {
    lm.openT = Math.min(1, lm.openT + dt * 1.4)
    if (lm.openStep === 'arrange') {
      lm.arrangeT = Math.min(1, lm.arrangeT + dt / 0.45)
      const e = eio(lm.arrangeT)
      for (let k = 0; k < 8; k++) {
        const f = lm.arrangeFrom[k], to = lm.arrangeTo[k]
        lm.keyPx[k] = { x: f.x + (to.x - f.x) * e, y: f.y + (to.y - f.y) * e }
      }
      if (lm.arrangeT >= 1) {
        for (let k = 0; k < 8; k++) lm.keyPx[k] = {...lm.arrangeTo[k]}
        lm.openStep = 'slide'
      }

    } else if (lm.openStep === 'slide') {
      lm.lineX -= lm.lineSpd * dt
      for (let k = 0; k < 8; k++) lm.keyPx[k].x = lm.lineX

      if (lm.lineX <= G35.cx) {
        let picked = 0, minDist = Infinity
        for (let k = 0; k < 8; k++) {
          const dy = Math.abs(G35.y - lm.keyPx[k].y)
          if (dy < minDist) { minDist = dy; picked = k }
        }
        lm.result = (picked === lm.correct) ? 'correct' : 'wrong'
        lm.phase  = 'done'
        if (lm.result === 'correct') {
          G35.score += 150
          document.getElementById('g35-score-hud').textContent = G35.score
          window._g35Score = G35.score
        }
        return
      }
      if (lm.t - G35_LSHUFFLE_DUR > 9) {
        lm.result = 'timeout'; lm.phase = 'done'
        _g35LimboStopMusic()
      }
    }
  }

  if (lm.phase === 'done') {
    lm.resultT += dt
    // Hold result banner for 0.5s then close corridor
    if (lm.resultT > 0.5) {
      lm.openT = Math.max(0, lm.openT - dt * 1.4)
      if (lm.openT <= 0) {
        const wall = G35.wallBuf[Math.min(G35.cx, G35.wallBuf.length - 1)]
        if (wall) G35.y = wall.cy   // snap to corridor centre before collision resumes
        G35_limbo = null
        G35.grace = 1.2
        _g35LimboResume = true
      }
    }
  }
}

function _g35LimboDrawKeys(ctx, w, yOff) {
  const lm = G35_limbo
  if (!lm) return
  const pH = G35.panelH
  ctx.save()
  ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'  // clear any wave glow bleed

  if (lm.phase === 'shuffle') {
    ctx.fillStyle = (typeof qgLight === 'function' && qgLight()) ? 'rgba(255,255,255,0.45)' : 'rgba(3,7,16,0.38)'
    ctx.fillRect(0, yOff, w, pH)
  }

  ctx.save()
  ctx.textAlign = 'center'
  if (lm.phase === 'shuffle') {
    ctx.font = 'bold 22px monospace'
    ctx.fillStyle = '#fbbf24'
    ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 18
    ctx.fillText('LIMBO', w / 2, yOff + 30)
    ctx.shadowBlur = 0
    ctx.font = '13px monospace'
    ctx.fillStyle = (typeof qgLight === 'function' && qgLight()) ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)'
    ctx.fillText(lm.t < 5.0 ? 'remember the glowing key!' : 'track it...', w / 2, yOff + 50)
  } else if (lm.phase === 'open') {
    ctx.font = 'bold 20px monospace'
    ctx.fillStyle = '#4ade80'
    ctx.shadowColor = '#4ade80'; ctx.shadowBlur = 14
    ctx.fillText('ALIGN WITH YOUR KEY!', w / 2, yOff + 30)
    ctx.shadowBlur = 0
  } else if (lm.phase === 'done') {
    const label = lm.result === 'correct' ? '+150  CORRECT!' : lm.result === 'timeout' ? 'TIME UP' : 'WRONG KEY'
    ctx.font = 'bold 24px monospace'
    ctx.fillStyle = lm.result === 'correct' ? '#4ade80' : '#f87171'
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 22
    ctx.fillText(label, w / 2, yOff + pH / 2 - 20)
    ctx.shadowBlur = 0
    ctx.textAlign = 'left'; ctx.restore()
    return
  }
  ctx.textAlign = 'left'
  ctx.restore()

  const isSlide = lm.phase === 'open' && lm.openStep === 'slide'
  for (let k = 0; k < 8; k++) {
    const kp = lm.keyPx[k]
    const isCorrect = k === lm.correct
    const inHint    = lm.t < 5.0 && lm.phase === 'shuffle'
    // Hint: gold (not wave-green) for correct key; neutral for all during shuffle; colours in slide
    const col = isSlide ? G35_LCOLORS[k]
              : inHint && isCorrect ? '#fbbf24'
              : G35_LNEUTRAL
    _g35LDrawKey(ctx, kp.x, yOff + kp.y, col, 14,
      inHint && isCorrect,   // gold glow during hint
      false)                 // no reveal during slide
  }
  ctx.restore()
}

function _g35LDrawKey(ctx, x, y, color, r, highlighted, phase2correct) {
  ctx.save()
  if (highlighted || phase2correct) {
    ctx.beginPath(); ctx.arc(x, y, r + 6, 0, Math.PI * 2)
    const lt = typeof qgLight === 'function' && qgLight()
    ctx.strokeStyle = lt ? '#1e1b4b' : '#ffffff'; ctx.lineWidth = 2.5
    ctx.shadowColor = lt ? '#fbbf24' : '#ffffff'; ctx.shadowBlur = 20
    ctx.stroke(); ctx.shadowBlur = 0
  }
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.shadowColor = color; ctx.shadowBlur = highlighted || phase2correct ? 22 : 8
  ctx.fill(); ctx.shadowBlur = 0
  ctx.beginPath(); ctx.arc(x, y, r * 0.35, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fill()
  ctx.restore()
}

function endGame35() {
  SFX.die()
  stopGame35()
  window._g35Score = G35.score

  if (G35_roomCode && G35_shared && !G35_spectating) {
    mpGetSocket().emit('player-died', { code: G35_roomCode, score: G35.score })
    // Don't end the run — watch them finish theirs, then compare.
    if (G35_oppAlive) {
      G35_spectating = true
      return
    }
  } else if (G35_roomCode) {
    mpGetSocket().emit('player-died', { code: G35_roomCode, score: G35.score })
    if (typeof recordMpResult === 'function') recordMpResult('wavedash', false)
  }

  document.getElementById('g35-final-score').textContent = G35.score + ' blocks'
  renderMedalDisplay('g35-medal-display', 'wavedash', G35.score)

  const mpEl = document.getElementById('g35-mp-result')
  if (mpEl && G35_roomCode) {
    if (G35_shared && G35_oppScore !== null) {
      const won = G35.score > G35_oppScore
      const tie = G35.score === G35_oppScore
      mpEl.innerHTML = tie
        ? `Dead heat — both of you reached ${G35.score} blocks.`
        : won
          ? `You ${G35.score} · them ${G35_oppScore}. 🏆 <b>You went further!</b>`
          : `You ${G35.score} · them ${G35_oppScore}. 😔 <b>They went further.</b>`
      if (typeof recordMpResult === 'function' && !tie) recordMpResult('wavedash', won)
    } else {
      mpEl.innerHTML = G35_oppScore !== null
        ? `Opponent was at ${G35_oppScore} blocks. 😔 <b>You crashed first!</b>`
        : ''
    }
  }

  document.getElementById('g35-over').classList.add('show')
}
