// ═══════════════════════════════════════════════════════
//  GAME 32 — GRAVITY FLIPPER
//  Auto-running side-scroller. Press SPACE or tap to flip
//  gravity. Navigate through pillar gaps. Score = pillars.
// ═══════════════════════════════════════════════════════
const G32 = {
  active: false,
  y: 0, vy: 0, flipped: false,
  cx: 0,
  score: 0,
  pillars: [],
  speed: 180,
  pillarTimer: 0,
  raf: null, lastTime: 0,
}
window._g32Score = 0

const G32_GRAV    = 900
const G32_PR      = 13     // player radius
const G32_PW      = 52     // pillar width
const G32_GAP     = 155    // gap height

function stopGame32() {
  G32.active = false
  if (G32.raf) { cancelAnimationFrame(G32.raf); G32.raf = null }
  document.removeEventListener('keydown', _g32Key)
}
window.stopGame32 = stopGame32

function _g32Key(e) {
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'KeyW') {
    e.preventDefault()
    g32Flip()
  }
}

function initGame32() {
  stopGame32()
  document.getElementById('g32-over').classList.remove('show')
  document.getElementById('g32-overlay').style.display = 'flex'
  document.getElementById('g32-score-hud').textContent = '0'
}

window.startGravFlip = function() {
  SFX.resume(); SFX.click()
  const c = document.getElementById('g32-canvas')
  c.width = c.parentElement.clientWidth
  c.height = c.parentElement.clientHeight
  document.getElementById('g32-overlay').style.display = 'none'

  G32.active = true
  G32.y = c.height / 2
  G32.vy = 0
  G32.flipped = false
  G32.score = 0
  G32.pillars = []
  G32.speed = 180
  G32.pillarTimer = 0
  G32.cx = c.width * 0.22
  G32.lastTime = performance.now()
  document.getElementById('g32-score-hud').textContent = '0'

  document.addEventListener('keydown', _g32Key)
  document.getElementById('g32-canvas').onclick = () => { if (G32.active) g32Flip() }

  G32.raf = requestAnimationFrame(g32Loop)
}

window.g32Flip = function() {
  if (!G32.active) return
  G32.flipped = !G32.flipped
  G32.vy *= 0.3
  SFX.whoosh()
}

function g32Loop(ts) {
  if (!G32.active) return
  const dt = Math.min((ts - G32.lastTime) / 1000, 0.05)
  G32.lastTime = ts
  const c = document.getElementById('g32-canvas')
  const ctx = c.getContext('2d')
  const w = c.width, h = c.height

  // Physics
  G32.vy += G32_GRAV * (G32.flipped ? -1 : 1) * dt
  G32.vy = Math.max(-700, Math.min(700, G32.vy))
  G32.y += G32.vy * dt

  // Die on floor/ceiling
  if (G32.y > h - G32_PR) { endGame32(); return }
  if (G32.y < G32_PR)      { endGame32(); return }

  // Pillar spawning
  const spawnInterval = Math.max(1.1, 2.4 - G32.score * 0.035)
  G32.pillarTimer += dt
  if (G32.pillarTimer >= spawnInterval) {
    G32.pillarTimer = 0
    const minGapY = G32_PR * 3
    const maxGapY = h - G32_GAP - G32_PR * 3
    const gapY = minGapY + qRandInt(Math.max(1, maxGapY - minGapY))
    G32.pillars.push({ x: w + G32_PW, gapY, scored: false })
  }

  // Move pillars
  G32.speed = 180 + G32.score * 5
  for (const p of G32.pillars) p.x -= G32.speed * dt
  G32.pillars = G32.pillars.filter(p => p.x > -G32_PW - 10)

  // Score + collision
  for (const p of G32.pillars) {
    if (!p.scored && p.x + G32_PW < G32.cx) {
      p.scored = true
      G32.score++
      SFX.coin()
      document.getElementById('g32-score-hud').textContent = G32.score
    }
    const inX = G32.cx + G32_PR > p.x && G32.cx - G32_PR < p.x + G32_PW
    if (!inX) continue
    const inGap = G32.y > p.gapY + G32_PR && G32.y < p.gapY + G32_GAP - G32_PR
    if (!inGap) { endGame32(); return }
  }

  // ─── Draw ───
  // Canvases get no CSS variables, so read the theme directly
  const _lt = typeof qgLight === 'function' && qgLight()
  ctx.fillStyle = _lt ? '#f6f1f5' : '#0d1117'
  ctx.fillRect(0, 0, w, h)

  // Scrolling stripe BG
  ctx.fillStyle = _lt ? '#efe6ee' : '#111827'
  const stripeW = 90
  const offset = (G32.score * 5 + ts * 0.04) % stripeW
  for (let x = -offset; x < w; x += stripeW) ctx.fillRect(x, 0, stripeW / 2, h)

  // Floor/ceiling glow lines
  ctx.strokeStyle = '#f472b666'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(w, 2); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(0, h - 2); ctx.lineTo(w, h - 2); ctx.stroke()

  // Pillars
  for (const p of G32.pillars) {
    ctx.fillStyle = _lt ? '#4a2a40' : '#1e293b'
    ctx.fillRect(p.x, 0, G32_PW, p.gapY)
    ctx.fillRect(p.x, p.gapY + G32_GAP, G32_PW, h - p.gapY - G32_GAP)
    ctx.strokeStyle = '#f472b644'; ctx.lineWidth = 1.5
    ctx.strokeRect(p.x + 1, 0, G32_PW - 2, p.gapY)
    ctx.strokeRect(p.x + 1, p.gapY + G32_GAP, G32_PW - 2, h - p.gapY - G32_GAP)
    // gap edge lines
    ctx.strokeStyle = '#f472b688'; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(p.x, p.gapY); ctx.lineTo(p.x + G32_PW, p.gapY); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(p.x, p.gapY + G32_GAP); ctx.lineTo(p.x + G32_PW, p.gapY + G32_GAP); ctx.stroke()
  }

  // Player glow
  const glow = ctx.createRadialGradient(G32.cx, G32.y, 0, G32.cx, G32.y, G32_PR * 2.5)
  glow.addColorStop(0, '#f472b677'); glow.addColorStop(1, '#f472b600')
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(G32.cx, G32.y, G32_PR * 2.5, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = _lt ? '#be185d' : '#ffffff'; ctx.beginPath(); ctx.arc(G32.cx, G32.y, G32_PR, 0, Math.PI * 2); ctx.fill()

  // Gravity direction arrow HUD
  ctx.fillStyle = '#f472b6'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center'
  ctx.fillText(G32.flipped ? '▲ FLIP' : '▼ NORMAL', w / 2, h - 8)
  ctx.textAlign = 'left'

  G32.raf = requestAnimationFrame(g32Loop)
}

function endGame32() {
  SFX.die()
  stopGame32()
  window._g32Score = G32.score
  document.getElementById('g32-final-score').textContent = G32.score + ' pillars'
  renderMedalDisplay('g32-medal-display', 'gravflip', G32.score)
  document.getElementById('g32-over').classList.add('show')
}
