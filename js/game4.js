// ═══════════════════════════════════════════════════════
//  GAME 4 — QUANTUM DODGE
//  Mouse, touch, WASD, and arrow key controls
// ═══════════════════════════════════════════════════════
const G4 = {
  active: false,
  startTime: null,
  elapsed: 0,
  spawnInterval: null,
  tickInterval: null,
  obstacles: [],
  playerX: 120, playerY: 0,
  arenaRect: null,
  // Keyboard state
  keys: {},
  keyInterval: null,
}

function stopDodge() {
  clearInterval(G4.spawnInterval)
  clearInterval(G4.tickInterval)
  clearInterval(G4.keyInterval)
  G4.spawnInterval = null
  G4.tickInterval = null
  G4.keyInterval = null
}
window.stopDodge = stopDodge

// Online: whoever survives longer wins. Scored in tenths of a second, the
// same unit the leaderboard stores, so the bar and the board agree.
window.g4FindMatch = function() {
  qgMpRace.find({
    game: 'dodge',
    btn: 'g4-queue-btn', status: 'g4-queue-status',
    hud: 'g4-opp-hud',   stat: 'g4-opp-stat',
    fmt: ds => (ds / 10).toFixed(1) + 's',
    onMatched: () => startDodge(),
    onVerdict: v => qgMpVerdict('g4-mp-verdict', v),
  })
}

async function initGame4() {
  qgMpVerdict('g4-mp-verdict', null)
  stopDodge()
  G4.active = false; G4.elapsed = 0; G4.obstacles = []; G4.keys = {}
  document.getElementById('g4-over').classList.remove('show')
  document.getElementById('dodge-overlay').style.display = 'flex'
  document.querySelectorAll('.dodge-obstacle').forEach(e => e.remove())
  document.getElementById('g4-score').textContent = '0.0s'
  document.getElementById('dodge-timer-display').textContent = ''
  const arena = document.getElementById('g4-arena')
  const rect = arena.getBoundingClientRect()
  G4.playerY = rect.height / 2
  G4.playerX = 120
  updateDodgePlayer()
  await initCurby()
}

window.startDodge = function(e) {
  SFX.resume()
  e.stopPropagation()
  document.getElementById('dodge-overlay').style.display = 'none'
  const arena = document.getElementById('g4-arena')
  G4.arenaRect = arena.getBoundingClientRect()
  G4.playerX = 120
  G4.playerY = G4.arenaRect.height / 2
  updateDodgePlayer()
  G4.active = true
  G4.startTime = Date.now()
  G4.keys = {}
  G4.lastMilestone = 0

  arena.addEventListener('mousemove', dodgeMouseMove)
  arena.addEventListener('touchmove', dodgeTouchMove, { passive: false })

  // Keyboard movement: update arenaRect on resize, move player by key
  const SPEED = 4 // px per frame at 60fps
  G4.keyInterval = setInterval(() => {
    if (!G4.active) return
    G4.arenaRect = document.getElementById('g4-arena').getBoundingClientRect()
    let moved = false
    if (G4.keys['ArrowUp']    || G4.keys['w'] || G4.keys['W']) { G4.playerY -= SPEED; moved = true }
    if (G4.keys['ArrowDown']  || G4.keys['s'] || G4.keys['S']) { G4.playerY += SPEED; moved = true }
    if (G4.keys['ArrowLeft']  || G4.keys['a'] || G4.keys['A']) { G4.playerX -= SPEED; moved = true }
    if (G4.keys['ArrowRight'] || G4.keys['d'] || G4.keys['D']) { G4.playerX += SPEED; moved = true }
    if (moved) {
      // Clamp to arena bounds
      const pad = 11
      G4.playerX = Math.max(pad, Math.min(G4.arenaRect.width - pad, G4.playerX))
      G4.playerY = Math.max(pad, Math.min(G4.arenaRect.height - pad, G4.playerY))
      updateDodgePlayer()
    }
  }, 16)

  G4.tickInterval = setInterval(dodgeTick, 16)
  scheduleDodgeSpawn()
}

// Key listeners — only active when game4 is the active screen
document.addEventListener('keydown', e => {
  if (!document.getElementById('game4').classList.contains('active')) return
  G4.keys[e.key] = true
  // Prevent page scroll with arrow keys while playing
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault()
})
document.addEventListener('keyup', e => {
  G4.keys[e.key] = false
})

function dodgeMouseMove(e) {
  if (!G4.active) return
  const rect = document.getElementById('g4-arena').getBoundingClientRect()
  G4.playerX = e.clientX - rect.left
  G4.playerY = e.clientY - rect.top
  updateDodgePlayer()
}

function dodgeTouchMove(e) {
  if (!G4.active) return
  e.preventDefault()
  const rect = document.getElementById('g4-arena').getBoundingClientRect()
  G4.playerX = e.touches[0].clientX - rect.left
  G4.playerY = e.touches[0].clientY - rect.top
  updateDodgePlayer()
}

function updateDodgePlayer() {
  const p = document.getElementById('dodge-player')
  p.style.transform = `translate(${G4.playerX - 11}px, ${G4.playerY - 11}px)`
}

function scheduleDodgeSpawn() {
  const rate = Math.max(400, 1600 - G4.elapsed * 20)
  G4.spawnInterval = setTimeout(() => {
    if (!G4.active) return
    spawnObstacle()
    scheduleDodgeSpawn()
  }, rate)
}

function spawnObstacle() {
  const arena = document.getElementById('g4-arena')
  const rect = arena.getBoundingClientRect()
  const size = 18 + qRandInt(28)
  const yFrac = qRandInt(100) / 99
  const y = size/2 + yFrac * (rect.height - size)
  const speed = 180 + G4.elapsed * 8 + qRandInt(80)
  const hue = qRandInt(360)

  SFX.whoosh()
  const el = document.createElement('div')
  el.className = 'dodge-obstacle'
  const startX = rect.width + size + 10
  el.style.cssText = `
    width:${size}px; height:${size}px;
    left:${startX}px; top:${y}px;
    background: radial-gradient(circle at 35% 35%, hsl(${hue},90%,70%), hsl(${hue+40},80%,40%));
    box-shadow: 0 0 ${size*.5}px hsl(${hue},90%,55%);
  `
  arena.appendChild(el)

  const spawnedAt = Date.now()
  const endX = -(size + 10)
  const travelDist = startX - endX
  const duration = (travelDist / speed) * 1000

  el.animate(
    [{ left: `${startX}px` }, { left: `${endX}px` }],
    { duration, easing: 'linear', fill: 'forwards' }
  )

  G4.obstacles.push({ el, size, y, spawnedAt, speed, startX: startX + size / 2, warned: false })

  setTimeout(() => {
    el.remove()
    G4.obstacles = G4.obstacles.filter(o => o.el !== el)
  }, duration + 100)
}

function dodgeTick() {
  if (!G4.active) return
  G4.elapsed = (Date.now() - G4.startTime) / 1000
  document.getElementById('g4-score').textContent = G4.elapsed.toFixed(1) + 's'
  qgMpRace.send(Math.round(G4.elapsed * 10))
  document.getElementById('dodge-timer-display').textContent = G4.elapsed.toFixed(1) + 's'
  const milestone = Math.floor(G4.elapsed / 10)
  if (milestone > G4.lastMilestone) { G4.lastMilestone = milestone; SFX.coin() }

  for (const obs of G4.obstacles) {
    const elapsed = (Date.now() - obs.spawnedAt) / 1000
    const obsX = obs.startX - obs.speed * elapsed
    const obsY = obs.y
    const dx = G4.playerX - obsX
    const dy = G4.playerY - obsY
    const dist = Math.sqrt(dx*dx + dy*dy)
    const hitR = 11 + obs.size / 2
    if (dist < hitR) {
      SFX.miss()
      endGame4()
      return
    }
    if (!obs.warned && dist < hitR + 30) {
      obs.warned = true
      SFX.tick()
    }
  }
}

function endGame4() {
  SFX.die()
  G4.active = false
  stopDodge()
  const arena = document.getElementById('g4-arena')
  arena.removeEventListener('mousemove', dodgeMouseMove)
  arena.removeEventListener('touchmove', dodgeTouchMove)
  document.querySelectorAll('.dodge-obstacle').forEach(e => e.remove())

  const survived = parseFloat(G4.elapsed.toFixed(1))
  const survivedDs = Math.round(survived * 10)
  window._g4Score = survivedDs
  qgMpVerdict('g4-mp-verdict', qgMpRace.finish(survivedDs))

  document.getElementById('g4-final-score').textContent = survived.toFixed(1) + 's'
  document.getElementById('g4-over-stats').textContent = `Survived ${survived.toFixed(1)} seconds`
  renderMedalDisplay('g4-medal-display', 'dodge', survivedDs)
  document.getElementById('g4-over').classList.add('show')
}
