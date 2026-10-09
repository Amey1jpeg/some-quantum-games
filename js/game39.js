// ═══════════════════════════════════════════════════════
//  GAME 39 — LIMBO
//  Pure key-memory game. Memorise the glowing key, track
//  it through fast shuffles, then click the correct one.
// ═══════════════════════════════════════════════════════

const G39_COLORS  = ['#eab308','#ef4444','#a855f7','#3b82f6','#ec4899','#06b6d4','#84cc16','#34d399']
const G39_NEUTRAL = '#5a5a8a'

// 20 fast permutations — fired every 0.45s starting at t=5
const G39_PERMS = [
  [1,0,3,2,5,4,7,6],
  [2,3,0,1,6,7,4,5],
  [1,2,3,0,5,6,7,4],
  [3,0,1,2,7,4,5,6],
  [4,5,6,7,0,1,2,3],
  [1,3,0,2,5,7,4,6],
  [2,0,3,1,6,4,7,5],
  [3,2,1,0,7,6,5,4],
  [0,4,2,6,1,5,3,7],
  [6,7,4,5,2,3,0,1],
  [1,0,4,5,2,3,7,6],
  [5,4,7,6,1,0,3,2],
  [3,1,2,0,7,5,6,4],
  [2,3,4,5,6,7,0,1],
  [7,6,5,4,3,2,1,0],
  [0,2,1,3,4,6,5,7],
  [4,0,5,1,6,2,7,3],
  [1,3,0,2,6,4,7,5],
  [6,4,7,5,2,0,3,1],
  [3,2,0,1,7,6,4,5],
]
const G39_PERM_T     = Array.from({length: 20}, (_, i) => 5.0 + i * 0.45)
const G39_SHUFFLE_END = 14.0
const G39_PICK_SECS   = 5.0   // seconds to pick before timeout

let G39 = {
  active: false,
  phase: 'idle',
  t: 0,
  correct: 0,
  slotToKey: [0,1,2,3,4,5,6,7],
  keyToSlot: [0,1,2,3,4,5,6,7],
  keyPx: [],
  animFrom: null, animTo: null,
  animT: 0, isAnimating: false,
  permStep: -1,
  result: null,
  resultT: 0,
  streak: 0,
  best: 0,
  raf: null,
  lastTime: 0,
  audio: null,
}

let _g39Canvas = null

function _g39C() {
  if (!_g39Canvas) _g39Canvas = document.getElementById('g39-canvas')
  return _g39Canvas
}

function _g39SlotPx(i, w, h) {
  const col  = i % 2
  const row  = Math.floor(i / 2)
  const r    = Math.min(w * 0.08, 34)
  const gapX = r * 3.2
  const gapY = r * 3.0
  const ox   = w / 2 - gapX / 2
  const oy   = h * 0.16
  return { x: ox + col * gapX, y: oy + row * gapY }
}

async function initLimboGame() {
  stopLimboGame()
  _g39Canvas = null
  document.getElementById('g39-overlay').style.display = 'flex'
  await initCurby()
}
window.initLimboGame = initLimboGame

window.startLimboGame = function() {
  SFX.resume(); SFX.click()
  const c = _g39C()
  c.width  = c.parentElement.clientWidth
  c.height = c.parentElement.clientHeight
  document.getElementById('g39-overlay').style.display = 'none'
  _g39StartRound()
  G39.lastTime = performance.now()
  G39.raf = requestAnimationFrame(_g39Loop)
}

window.stopLimboGame = function() {
  G39.active = false
  if (G39.raf)   { cancelAnimationFrame(G39.raf); G39.raf = null }
  if (G39.audio) { try { G39.audio.pause() } catch(e) {}; G39.audio = null }
  const c = _g39C()
  if (c) { c.removeEventListener('click', _g39Click); c.removeEventListener('touchend', _g39Click) }
}

function _g39StartRound() {
  const c = _g39C()
  const w = c.width, h = c.height
  G39.phase      = 'hint'
  G39.t          = 0
  G39.correct    = qRandInt(8)
  G39.slotToKey  = [0,1,2,3,4,5,6,7]
  G39.keyToSlot  = [0,1,2,3,4,5,6,7]
  G39.permStep   = -1
  G39.isAnimating = false
  G39.result     = null
  G39.resultT    = 0
  G39.active     = true
  G39.keyPx      = Array.from({length: 8}, (_, k) => _g39SlotPx(k, w, h))

  if (G39.audio) { try { G39.audio.pause() } catch(e) {}; G39.audio = null }
  // The stand runs this on loop all day next to other games and people
  // talking, so the track is off there. Everywhere else it plays as usual.
  if (!window.QG_STALL) {
    try {
      G39.audio = new Audio('limbo-keys-made-with-Voicemod.mp3')
      G39.audio.play().catch(() => {})
    } catch(e) {}
  }

  c.removeEventListener('click', _g39Click)
  c.removeEventListener('touchend', _g39Click)
}

function _g39ApplyPerm(step, w, h) {
  const perm = G39_PERMS[step]
  const newSlotToKey = new Array(8)
  for (let s = 0; s < 8; s++) newSlotToKey[perm[s]] = G39.slotToKey[s]
  const newKeyToSlot = new Array(8)
  for (let s = 0; s < 8; s++) newKeyToSlot[newSlotToKey[s]] = s
  G39.animFrom = G39.keyPx.map(p => ({...p}))
  G39.animTo   = new Array(8)
  for (let k = 0; k < 8; k++) G39.animTo[k] = _g39SlotPx(newKeyToSlot[k], w, h)
  G39.slotToKey = newSlotToKey
  G39.keyToSlot = newKeyToSlot
  G39.isAnimating = true
  G39.animT = 0
}

function _g39Loop(ts) {
  if (!G39.active) return
  const dt = Math.min((ts - G39.lastTime) / 1000, 0.05)
  G39.lastTime = ts

  const c = _g39C()
  const w = c.width, h = c.height
  G39.t += dt

  const eio = t => t < 0.5 ? 2*t*t : -1+(4-2*t)*t

  if (G39.phase === 'hint' && G39.t >= 5.0) G39.phase = 'shuffle'

  if (G39.phase === 'shuffle') {
    const next = G39.permStep + 1
    if (next < G39_PERMS.length && G39.t >= G39_PERM_T[next]) {
      _g39ApplyPerm(next, w, h)
      G39.permStep = next
    }
    if (G39.isAnimating) {
      G39.animT = Math.min(1, G39.animT + dt / 0.28)
      const e = eio(G39.animT)
      for (let k = 0; k < 8; k++) {
        const f = G39.animFrom[k], to = G39.animTo[k]
        G39.keyPx[k] = { x: f.x + (to.x - f.x) * e, y: f.y + (to.y - f.y) * e - Math.sin(Math.PI * e) * 28 }
      }
      if (G39.animT >= 1) {
        for (let k = 0; k < 8; k++) G39.keyPx[k] = {...G39.animTo[k]}
        G39.isAnimating = false
      }
    }
    if (G39.t >= G39_SHUFFLE_END) {
      G39.phase = 'pick'
      G39.t     = 0
      c.addEventListener('click', _g39Click)
      c.addEventListener('touchend', _g39Click, { passive: false })
    }
  }

  if (G39.phase === 'pick' && G39.t >= G39_PICK_SECS) {
    _g39Resolve(-1)  // timeout
  }

  if (G39.phase === 'result') {
    G39.resultT += dt
    if (G39.resultT >= 2.2) _g39StartRound()
  }

  _g39Draw(c.getContext('2d'), w, h)
  G39.raf = requestAnimationFrame(_g39Loop)
}

function _g39Click(e) {
  e.preventDefault()
  if (G39.phase !== 'pick') return
  const c = _g39C()
  const rect = c.getBoundingClientRect()
  const src  = e.changedTouches ? e.changedTouches[0] : e
  const mx   = (src.clientX - rect.left) * (c.width  / rect.width)
  const my   = (src.clientY - rect.top)  * (c.height / rect.height)
  const r    = Math.min(c.width * 0.08, 34) * 1.5  // generous hit area

  let picked = -1, best = Infinity
  for (let k = 0; k < 8; k++) {
    const dx = mx - G39.keyPx[k].x, dy = my - G39.keyPx[k].y
    const d  = dx*dx + dy*dy
    if (d < r*r && d < best) { best = d; picked = k }
  }
  if (picked < 0) return
  _g39Resolve(picked)
}

function _g39Resolve(picked) {
  const c = _g39C()
  c.removeEventListener('click', _g39Click)
  c.removeEventListener('touchend', _g39Click)

  if (picked < 0) {
    G39.result  = 'timeout'
    G39.streak  = 0
  } else if (picked === G39.correct) {
    G39.result  = 'correct'
    G39.streak++
    G39.best    = Math.max(G39.best, G39.streak)
    SFX.click()
  } else {
    G39.result  = 'wrong'
    G39.streak  = 0
    SFX.die()
  }
  G39.phase   = 'result'
  G39.resultT = 0
}

function _g39Draw(ctx, w, h) {
  ctx.save()
  ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'
  ctx.fillStyle = '#030710'
  ctx.fillRect(0, 0, w, h)

  // Title
  ctx.textAlign = 'center'
  ctx.font = 'bold 30px monospace'
  ctx.fillStyle = '#fbbf24'
  ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 22
  ctx.fillText('LIMBO', w / 2, 42)
  ctx.shadowBlur = 0

  // Streak display
  ctx.font = 'bold 15px monospace'
  ctx.fillStyle = '#fbbf24'
  ctx.textAlign = 'right'
  ctx.fillText(`Streak: ${G39.streak}`, w - 14, 34)
  ctx.font = '11px monospace'
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.fillText(`Best: ${G39.best}`, w - 14, 52)

  // Phase status
  ctx.textAlign = 'center'
  ctx.font = '14px monospace'
  if (G39.phase === 'hint') {
    const rem = Math.max(0, 5.0 - G39.t).toFixed(1)
    ctx.fillStyle = '#fbbf24'
    ctx.fillText(`Remember the key!  ${rem}s`, w / 2, 68)
  } else if (G39.phase === 'shuffle') {
    const rem = Math.max(0, G39_SHUFFLE_END - G39.t).toFixed(1)
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.fillText(`Shuffling…  ${rem}s`, w / 2, 68)
  } else if (G39.phase === 'pick') {
    const rem = Math.max(0, G39_PICK_SECS - G39.t).toFixed(1)
    ctx.fillStyle = '#4ade80'
    ctx.shadowColor = '#4ade80'; ctx.shadowBlur = 12
    ctx.fillText(`Click your key!  ${rem}s`, w / 2, 68)
    ctx.shadowBlur = 0
  } else if (G39.phase === 'result') {
    const label = G39.result === 'correct' ? '+1  CORRECT!' : G39.result === 'timeout' ? 'TIME UP' : 'WRONG KEY'
    ctx.font = 'bold 20px monospace'
    ctx.fillStyle = G39.result === 'correct' ? '#4ade80' : '#f87171'
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 20
    ctx.fillText(label, w / 2, 68)
    ctx.shadowBlur = 0
  }
  ctx.textAlign = 'left'

  // Keys
  const R = Math.min(w * 0.08, 34)
  for (let k = 0; k < 8; k++) {
    const kp = G39.keyPx[k]
    const isCorrect = k === G39.correct

    let col   = G39_NEUTRAL
    let glow  = false
    let ring  = false

    if (G39.phase === 'hint' && isCorrect) {
      col = '#fbbf24'; glow = true; ring = true
    } else if (G39.phase === 'pick') {
      col = G39_COLORS[k]
    } else if (G39.phase === 'result') {
      col = G39_COLORS[k]
      if (isCorrect) { glow = true; ring = true }
    }

    if (ring) {
      ctx.beginPath(); ctx.arc(kp.x, kp.y, R + 7, 0, Math.PI * 2)
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5
      ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 18
      ctx.stroke(); ctx.shadowBlur = 0
    }
    ctx.beginPath(); ctx.arc(kp.x, kp.y, R, 0, Math.PI * 2)
    ctx.fillStyle   = col
    ctx.shadowColor = col; ctx.shadowBlur = glow ? 26 : 10
    ctx.fill(); ctx.shadowBlur = 0
    ctx.beginPath(); ctx.arc(kp.x, kp.y, R * 0.33, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fill()
  }

  ctx.restore()
}
