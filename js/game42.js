// ═══════════════════════════════════════════════════════
//  GAME 42 — TYPE RACER
//  Words fall from the top. Type the highlighted target
//  word before it hits the bottom. 3 lives. Gets faster.
// ═══════════════════════════════════════════════════════

const G42_WORD_LIST = [
  // short
  'atom','spin','wave','flux','code','sync','node','data','link','core',
  'loop','grid','scan','beam','chip','byte','zone','dash','jump','rush',
  'bits','hash','port','ping','blob','echo','fork','heap','swap','task',
  // medium
  'qubit','orbit','laser','pixel','phase','pulse','field','force','boost',
  'helix','prism','nexus','token','glitch','system','player','screen',
  'arcade','bubble','cursor','shadow','cipher','matrix','vector','binary',
  'random','signal','module','portal','radius','energy','launch','strike',
  'photon','proton','cosmic','turbo','sprint','reflex','buffer','filter',
  // long
  'quantum','neutron','network','program','runtime','compute','decrypt',
  'entropy','gravity','integer','pointer','process','scatter','display',
  'texture','command','package','library','function','particle','velocity',
  'momentum','reactor','waveform','entangle','algorithm','oscillate',
  'bandwidth','collision','dimension','frequency','interface','processor',
]

const G42_FALL_SPD0 = 38
const G42_SPAWN0    = 3.2
const G42_MAX_WORDS = 5

const G42 = {
  active: false, phase: 'idle',
  words: [],
  score: 0, lives: 3,
  spawnTimer: 0, spawnRate: G42_SPAWN0,
  fallSpd: G42_FALL_SPD0,
  pops: [],
  raf: null, lastTime: 0,
  deadT: 0, showOver: false,
}
window._g42Score = 0

let _g42Canvas = null
function _g42C() {
  if (!_g42Canvas) _g42Canvas = document.getElementById('g42-canvas')
  return _g42Canvas
}

async function initGame42() {
  stopGame42()
  _g42Canvas = null
  document.getElementById('g42-overlay').style.display = 'flex'
  document.getElementById('g42-over').style.display    = 'none'
  await initCurby()
}
window.initGame42 = initGame42

window.startTypeRacer = function() {
  SFX.resume(); SFX.click()
  const c = _g42C()
  c.width  = c.parentElement.clientWidth
  c.height = c.parentElement.clientHeight
  document.getElementById('g42-overlay').style.display = 'none'
  document.getElementById('g42-over').style.display    = 'none'

  Object.assign(G42, {
    active: true, phase: 'playing',
    words: [], score: 0, lives: 3,
    spawnTimer: 0, spawnRate: G42_SPAWN0,
    fallSpd: G42_FALL_SPD0,
    pops: [], deadT: 0, showOver: false,
  })
  window._g42Score = 0
  document.getElementById('g42-score-hud').textContent = '0'

  _g42SpawnWord(c.width, c.height)

  window.addEventListener('keydown', _g42Key)
  G42.lastTime = performance.now()
  G42.raf = requestAnimationFrame(_g42Loop)
}

window.stopGame42 = function() {
  G42.active = false
  if (G42.raf) { cancelAnimationFrame(G42.raf); G42.raf = null }
  window.removeEventListener('keydown', _g42Key)
}

function _g42Key(e) {
  if (G42.phase !== 'playing') return
  if (e.ctrlKey || e.metaKey || e.altKey) return
  if (e.key.length !== 1) return
  e.preventDefault()

  const t = _g42Target()
  if (!t) return

  if (e.key === t.text[t.typed]) {
    t.typed++
    t.errFlash = 0
    if (t.typed === t.text.length) {
      G42.pops.push({ text: '+1', x: t.x, y: t.y, t: 0, life: 0.75 })
      G42.words = G42.words.filter(w => w !== t)
      G42.score++
      window._g42Score = G42.score
      document.getElementById('g42-score-hud').textContent = G42.score
      if (G42.score % 5 === 0) {
        G42.fallSpd  = Math.min(200, G42.fallSpd + 7)
        G42.spawnRate = Math.max(0.9, G42.spawnRate - 0.22)
      }
      SFX.click()
    }
  } else {
    t.errFlash = 0.28
  }
}

function _g42Target() {
  // lowest word on screen (most dangerous) that isn't done
  return G42.words.reduce((a, b) => (!a || b.y > a.y) ? b : a, null)
}

function _g42SpawnWord(w, h) {
  const text = G42_WORD_LIST[qRandInt(G42_WORD_LIST.length)]
  const pad  = 60
  const x    = pad + qRandInt(Math.max(1, w - pad * 2))
  G42.words.push({ text, x, y: -24, typed: 0, errFlash: 0 })
}

function _g42Loop(ts) {
  if (!G42.active) return
  const dt = Math.min((ts - G42.lastTime) / 1000, 0.05)
  G42.lastTime = ts
  const c = _g42C(); const w = c.width, h = c.height

  if (G42.phase === 'playing') {
    // Spawn
    G42.spawnTimer += dt
    if (G42.spawnTimer >= G42.spawnRate && G42.words.length < G42_MAX_WORDS) {
      G42.spawnTimer = 0
      _g42SpawnWord(w, h)
    }

    // Fall
    const target = _g42Target()
    for (const word of G42.words) {
      word.y += G42.fallSpd * dt
      if (word.errFlash > 0) word.errFlash -= dt
    }

    // Pops
    for (const p of G42.pops) p.t += dt
    G42.pops = G42.pops.filter(p => p.t < p.life)

    // Bottom collision
    const BOTTOM = h - 48
    for (const word of [...G42.words]) {
      if (word.y >= BOTTOM) {
        G42.words = G42.words.filter(w => w !== word)
        G42.lives--
        SFX.die()
        if (G42.lives <= 0) { _g42Die(); break }
      }
    }

  } else if (G42.phase === 'dead') {
    G42.deadT += dt
    if (G42.deadT >= 1.8 && !G42.showOver) {
      G42.showOver     = true
      window._g42Score = G42.score
      document.getElementById('g42-final-score').textContent = `${G42.score} word${G42.score !== 1 ? 's' : ''}`
      document.getElementById('g42-over').style.display = 'flex'
    }
  }

  _g42Draw(c.getContext('2d'), w, h)
  if (G42.showOver) { G42.active = false; return }
  G42.raf = requestAnimationFrame(_g42Loop)
}

function _g42Die() {
  if (G42.phase === 'dead') return
  G42.phase = 'dead'; G42.deadT = 0
  window.removeEventListener('keydown', _g42Key)
}

function _g42Draw(ctx, w, h) {
  ctx.save()
  ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'

  // Background — canvases get no CSS variables, so read the theme directly
  const _lt = typeof qgLight === 'function' && qgLight()
  ctx.fillStyle = _lt ? '#eef6f9' : '#030710'
  ctx.fillRect(0, 0, w, h)

  // Subtle grid
  ctx.strokeStyle = _lt ? 'rgba(8,145,178,0.10)' : 'rgba(6,182,212,0.04)'
  ctx.lineWidth = 1
  for (let y = 0; y < h; y += 22) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
  }

  // Danger zone at bottom
  const BOTTOM = h - 48
  const dg = ctx.createLinearGradient(0, BOTTOM - 20, 0, h)
  dg.addColorStop(0, 'rgba(239,68,68,0)')
  dg.addColorStop(1, 'rgba(239,68,68,0.12)')
  ctx.fillStyle = dg
  ctx.fillRect(0, BOTTOM - 20, w, h - BOTTOM + 20)
  ctx.strokeStyle = 'rgba(239,68,68,0.55)'; ctx.lineWidth = 1.5
  ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 8
  ctx.beginPath(); ctx.moveTo(0, BOTTOM); ctx.lineTo(w, BOTTOM); ctx.stroke()
  ctx.shadowBlur = 0

  const target = _g42Target()

  // Falling words
  for (const word of G42.words) {
    const isTarget = word === target
    _g42DrawWord(ctx, word, isTarget)
  }

  // Score popups
  for (const p of G42.pops) {
    const a = 1 - p.t / p.life
    ctx.globalAlpha = a
    ctx.textAlign   = 'center'
    ctx.font        = 'bold 18px monospace'
    ctx.fillStyle   = '#4ade80'
    ctx.shadowColor = '#4ade80'; ctx.shadowBlur = 12
    ctx.fillText(p.text, p.x, p.y - p.t * 40)
    ctx.shadowBlur  = 0
    ctx.globalAlpha = 1
  }

  // Current target word display (bottom bar)
  if (target && G42.phase === 'playing') {
    ctx.textAlign = 'center'
    ctx.font      = '13px monospace'
    ctx.fillStyle = _lt ? 'rgba(8,145,178,0.75)' : 'rgba(6,182,212,0.5)'
    ctx.fillText('▲ type this', w / 2, h - 28)

    const charW = 11
    const totalW = target.text.length * charW
    let cx = w / 2 - totalW / 2 + charW / 2
    for (let i = 0; i < target.text.length; i++) {
      ctx.font      = 'bold 15px monospace'
      ctx.textAlign = 'center'
      if (i < target.typed) {
        ctx.fillStyle = _lt ? '#16a34a' : '#4ade80'; ctx.shadowColor = '#4ade80'; ctx.shadowBlur = 6
      } else if (i === target.typed) {
        ctx.fillStyle = _lt ? '#0f172a' : '#ffffff'; ctx.shadowColor = '#06b6d4'; ctx.shadowBlur = 10
      } else {
        ctx.fillStyle = _lt ? 'rgba(8,145,178,0.8)' : 'rgba(6,182,212,0.55)'; ctx.shadowBlur = 0
      }
      ctx.fillText(target.text[i], cx, h - 10)
      ctx.shadowBlur = 0
      cx += charW
    }
  }

  // Score
  ctx.textAlign   = 'center'
  ctx.font        = 'bold 26px monospace'
  ctx.fillStyle   = _lt ? 'rgba(20,21,43,0.9)' : 'rgba(255,255,255,0.9)'
  ctx.shadowColor = '#06b6d4'; ctx.shadowBlur = 16
  ctx.fillText(G42.score, w / 2, 44)
  ctx.shadowBlur  = 0

  // Lives
  ctx.textAlign = 'right'; ctx.font = '18px monospace'
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i < G42.lives ? '#ef4444' : (_lt ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.15)')
    ctx.shadowColor = '#ef4444'; ctx.shadowBlur = i < G42.lives ? 8 : 0
    ctx.fillText('❤', w - 14 - i * 22, 38)
  }
  ctx.shadowBlur = 0

  // Speed
  ctx.textAlign = 'left'; ctx.font = '11px monospace'
  ctx.fillStyle = _lt ? 'rgba(8,145,178,0.7)' : 'rgba(6,182,212,0.4)'
  ctx.fillText(`${Math.round(G42.fallSpd)} px/s`, 12, 38)

  ctx.restore()
}

function _g42DrawWord(ctx, word, isTarget) {
  const fontSize = isTarget ? 20 : 15
  ctx.font = `bold ${fontSize}px monospace`

  const charW   = isTarget ? 13 : 10
  const totalW  = word.text.length * charW
  let cx = word.x - totalW / 2 + charW / 2

  const err = word.errFlash > 0
  // Pale cyan washes out on a light page, so light mode uses a deeper one
  const lt  = typeof qgLight === 'function' && qgLight()
  const cy  = lt ? '8,145,178' : '6,182,212'

  for (let i = 0; i < word.text.length; i++) {
    if (i < word.typed) {
      ctx.fillStyle   = lt ? '#16a34a' : '#4ade80'
      ctx.shadowColor = '#4ade80'; ctx.shadowBlur = 6
    } else if (err && i === word.typed) {
      ctx.fillStyle   = '#ef4444'
      ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 12
    } else if (isTarget) {
      const alpha = i === word.typed ? 1 : 0.65
      ctx.fillStyle   = `rgba(${cy},${alpha})`
      ctx.shadowColor = '#06b6d4'; ctx.shadowBlur = isTarget && i === word.typed ? 14 : 4
    } else {
      ctx.fillStyle = `rgba(${cy},${lt ? 0.6 : 0.35})`; ctx.shadowBlur = 0
    }
    ctx.textAlign = 'center'
    ctx.fillText(word.text[i], cx, word.y)
    ctx.shadowBlur = 0
    cx += charW
  }

  // Underline for target
  if (isTarget) {
    ctx.strokeStyle = 'rgba(6,182,212,0.4)'
    ctx.lineWidth   = 1.5
    ctx.beginPath()
    ctx.moveTo(word.x - totalW / 2, word.y + 4)
    ctx.lineTo(word.x + totalW / 2, word.y + 4)
    ctx.stroke()
  }
}
