// ═══════════════════════════════════════════════════════
//  GAME 31 — RUNAWAY SNAKE
//  Classic snake but the apple uses pathfinding to dodge
//  you. The smarter you get, the harder it fights back.
// ═══════════════════════════════════════════════════════
const G31_GS = 20   // grid cell size px

const G31 = {
  active: false,
  gw: 0, gh: 0,
  snake: [],
  dir: { x: 1, y: 0 },
  nextDir: { x: 1, y: 0 },
  apple: { x: 0, y: 0 },
  score: 0,
  moveTimer: 0, movePeriod: 8,
  appleTimer: 0, appleMovePeriod: 4,
  timeLeft: 60, lastTime: 0,
  raf: null,
}
window._g31Score = 0

function stopGame31() {
  G31.active = false
  if (G31.raf) { cancelAnimationFrame(G31.raf); G31.raf = null }
}
window.stopGame31 = stopGame31

function initGame31() {
  stopGame31()
  document.getElementById('g31-over').classList.remove('show')
  document.getElementById('g31-overlay').style.display = 'flex'
  document.getElementById('g31-score-hud').textContent = '0'
}

window.startRunSnake = function() {
  SFX.resume(); SFX.click()
  const c = document.getElementById('g31-canvas')
  c.width = c.parentElement.clientWidth
  c.height = c.parentElement.clientHeight
  G31.gw = Math.floor(c.width / G31_GS)
  G31.gh = Math.floor(c.height / G31_GS)

  document.getElementById('g31-overlay').style.display = 'none'
  G31.active = true

  const sx = Math.floor(G31.gw / 2), sy = Math.floor(G31.gh / 2)
  G31.snake = [{ x: sx, y: sy }, { x: sx - 1, y: sy }, { x: sx - 2, y: sy }]
  G31.dir = { x: 1, y: 0 }
  G31.nextDir = { x: 1, y: 0 }
  G31.score = 0
  G31.moveTimer = 0; G31.appleTimer = 0
  G31.movePeriod = 8
  G31.timeLeft = 60
  G31.lastTime = performance.now()
  document.getElementById('g31-score-hud').textContent = '0'
  document.getElementById('g31-timer-hud').textContent = '60'
  g31PlaceApple()

  G31.raf = requestAnimationFrame(g31Loop)
}

function g31PlaceApple() {
  const occupied = new Set(G31.snake.map(s => `${s.x},${s.y}`))
  let best = null, bestDist = -1
  for (let i = 0; i < 40; i++) {
    const x = qRandInt(G31.gw), y = qRandInt(G31.gh)
    if (occupied.has(`${x},${y}`)) continue
    const d = Math.hypot(x - G31.snake[0].x, y - G31.snake[0].y)
    if (d > bestDist) { bestDist = d; best = { x, y } }
  }
  if (best) G31.apple = best
}

function g31MoveApple() {
  const head = G31.snake[0]
  const occupied = new Set(G31.snake.map(s => `${s.x},${s.y}`))
  const dirs = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }]
  let best = null, bestDist = -1
  for (const d of dirs) {
    const nx = ((G31.apple.x + d.x) + G31.gw) % G31.gw
    const ny = ((G31.apple.y + d.y) + G31.gh) % G31.gh
    if (occupied.has(`${nx},${ny}`)) continue
    // wrap-aware distance
    const ddx = Math.min(Math.abs(nx - head.x), G31.gw - Math.abs(nx - head.x))
    const ddy = Math.min(Math.abs(ny - head.y), G31.gh - Math.abs(ny - head.y))
    const dist = Math.hypot(ddx, ddy)
    if (dist > bestDist) { bestDist = dist; best = { x: nx, y: ny } }
  }
  if (best) G31.apple = best
}

// Key handling — attached once, gated on G31.active
document.addEventListener('keydown', function(e) {
  if (!G31.active) return
  if (e.key === 'ArrowUp'    || e.key === 'w' || e.key === 'W') { if (G31.dir.y !== 1)  G31.nextDir = { x: 0, y: -1 } }
  else if (e.key === 'ArrowDown'  || e.key === 's' || e.key === 'S') { if (G31.dir.y !== -1) G31.nextDir = { x: 0, y: 1 } }
  else if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') { if (G31.dir.x !== 1)  G31.nextDir = { x: -1, y: 0 } }
  else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { if (G31.dir.x !== -1) G31.nextDir = { x: 1, y: 0 } }
})

// Touch swipe support
let _g31TouchX = 0, _g31TouchY = 0
document.addEventListener('touchstart', e => { if (G31.active) { _g31TouchX = e.touches[0].clientX; _g31TouchY = e.touches[0].clientY } }, { passive: true })
document.addEventListener('touchend', e => {
  if (!G31.active) return
  const dx = e.changedTouches[0].clientX - _g31TouchX
  const dy = e.changedTouches[0].clientY - _g31TouchY
  if (Math.abs(dx) > Math.abs(dy)) {
    if (dx > 20 && G31.dir.x !== -1) G31.nextDir = { x: 1, y: 0 }
    if (dx < -20 && G31.dir.x !== 1)  G31.nextDir = { x: -1, y: 0 }
  } else {
    if (dy > 20 && G31.dir.y !== -1) G31.nextDir = { x: 0, y: 1 }
    if (dy < -20 && G31.dir.y !== 1)  G31.nextDir = { x: 0, y: -1 }
  }
}, { passive: true })

function g31Loop(ts) {
  if (!G31.active) return

  // Real-time countdown
  const dt = (ts - G31.lastTime) / 1000
  G31.lastTime = ts
  G31.timeLeft -= dt
  if (G31.timeLeft <= 0) { endGame31(); return }
  document.getElementById('g31-timer-hud').textContent = Math.ceil(G31.timeLeft)

  G31.moveTimer++

  if (G31.moveTimer >= G31.movePeriod) {
    G31.moveTimer = 0
    G31.dir = G31.nextDir
    G31.appleTimer++

    if (G31.appleTimer >= G31.appleMovePeriod) {
      G31.appleTimer = 0
      g31MoveApple()
    }

    const head = G31.snake[0]
    const newHead = {
      x: ((head.x + G31.dir.x) + G31.gw) % G31.gw,
      y: ((head.y + G31.dir.y) + G31.gh) % G31.gh,
    }

    for (let i = 0; i < G31.snake.length - 1; i++) {
      if (G31.snake[i].x === newHead.x && G31.snake[i].y === newHead.y) {
        endGame31(); return
      }
    }

    const ate = newHead.x === G31.apple.x && newHead.y === G31.apple.y
    G31.snake.unshift(newHead)
    if (!ate) {
      G31.snake.pop()
    } else {
      G31.score++
      SFX.coin()
      document.getElementById('g31-score-hud').textContent = G31.score
      G31.movePeriod = Math.max(4, 8 - Math.floor(G31.score / 5))
      G31.appleMovePeriod = Math.max(2, 4 - Math.floor(G31.score / 8))
      G31.timeLeft = Math.max(15, 60 - G31.score)
      g31PlaceApple()
      G31.appleTimer = 0
    }
  }

  // Draw
  const c = document.getElementById('g31-canvas')
  const ctx = c.getContext('2d')
  const gs = G31_GS

  // Canvases get no CSS variables, so read the theme directly
  const _lt = typeof qgLight === 'function' && qgLight()
  ctx.fillStyle = _lt ? '#f1f4f9' : '#0d1117'
  ctx.fillRect(0, 0, c.width, c.height)

  ctx.strokeStyle = _lt ? '#dfe5ee' : '#1a2332'; ctx.lineWidth = 0.5
  for (let x = 0; x <= G31.gw; x++) { ctx.beginPath(); ctx.moveTo(x*gs, 0); ctx.lineTo(x*gs, c.height); ctx.stroke() }
  for (let y = 0; y <= G31.gh; y++) { ctx.beginPath(); ctx.moveTo(0, y*gs); ctx.lineTo(c.width, y*gs); ctx.stroke() }

  // Apple glow
  const ax = G31.apple.x * gs + gs / 2, ay = G31.apple.y * gs + gs / 2
  const aGlow = ctx.createRadialGradient(ax, ay, 0, ax, ay, gs)
  aGlow.addColorStop(0, '#ef444466'); aGlow.addColorStop(1, 'transparent')
  ctx.fillStyle = aGlow
  ctx.beginPath(); ctx.arc(ax, ay, gs, 0, Math.PI * 2); ctx.fill()

  ctx.fillStyle = '#ef4444'
  ctx.beginPath(); ctx.arc(ax, ay, gs / 2 - 2, 0, Math.PI * 2); ctx.fill()

  // Timer bar along bottom
  const maxTime = Math.max(15, 60 - (G31.score > 0 ? G31.score - 1 : 0))
  const timerFrac = Math.max(0, G31.timeLeft / maxTime)
  const timerColor = G31.timeLeft < 8 ? '#ef4444' : G31.timeLeft < 15 ? '#f97316' : '#4ade80'
  ctx.fillStyle = _lt ? '#dfe5ee' : '#1a2332'
  ctx.fillRect(0, c.height - 4, c.width, 4)
  ctx.fillStyle = timerColor
  ctx.fillRect(0, c.height - 4, c.width * timerFrac, 4)

  // Snake
  for (let i = 0; i < G31.snake.length; i++) {
    const s = G31.snake[i]
    const alpha = i === 0 ? 1 : Math.max(0.3, 0.85 - i / G31.snake.length * 0.5)
    ctx.fillStyle = i === 0 ? (_lt ? '#16a34a' : '#4ade80') : (_lt ? `rgba(22,163,74,${alpha})` : `rgba(74,222,128,${alpha})`)
    const pad = i === 0 ? 1 : 2
    ctx.fillRect(s.x * gs + pad, s.y * gs + pad, gs - pad * 2, gs - pad * 2)
  }

  G31.raf = requestAnimationFrame(g31Loop)
}

function endGame31() {
  SFX.die()
  stopGame31()
  window._g31Score = G31.score
  document.getElementById('g31-final-score').textContent = G31.score + ' apples'
  renderMedalDisplay('g31-medal-display', 'runsnake', G31.score)
  document.getElementById('g31-over').classList.add('show')
}
