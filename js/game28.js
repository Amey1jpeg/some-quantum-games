// ═══════════════════════════════════════════════════════
//  GAME 28 — PARKOUR
//  Tile side-scroller. Reach the ★ to advance. Infinite levels.
//  ← → / A D to move   Space / ↑ / W to jump
// ═══════════════════════════════════════════════════════

let G28 = {}
let g28Canvas, g28Ctx, g28Raf
let g28Keys = {}

let G28_roomCode  = null
let G28_sideBySide = false
let G28_oppScore  = null
let G28_oppDone   = false
let G28_iDied     = false   // I died first, now watching opponent
let G28_oppPos    = null    // { x, y } tile pos for ghost rendering
let G28_seed      = 0       // agreed room seed; 0 = solo, generate freely
let G28_isHost    = false
let G28_lastSync  = 0

// Levels used to come out of Math.random(), so each player in a match got a
// different layout — and the opponent ghost was then drawn at coordinates
// from a level you were not playing. Both sides now build the same level
// from one agreed seed. Level N is seeded from (seed, N) rather than from a
// running cursor, so the two players stay in step even though they reach
// each level at different times.
function _g28Rng(seed) {
  let s = seed | 0
  return function() {
    s = (s + 0x6D2B79F5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function _g28ShowFinalResult(myScore, oppScore, won) {
  document.getElementById('g28-final-score').textContent = myScore.toLocaleString()
  const m = myScore >= 3000 ? '🥇 Gold' : myScore >= 1200 ? '🥈 Silver' : myScore >= 400 ? '🥉 Bronze' : ''
  document.getElementById('g28-medal').textContent = m
  document.getElementById('g28-mp-result').innerHTML = won
    ? `Opponent: ${oppScore.toLocaleString()} pts. 🏆 <b>You win!</b>`
    : myScore === oppScore
    ? `🤝 Tie! Both ${myScore.toLocaleString()} pts`
    : `Opponent: ${oppScore.toLocaleString()} pts. 😔 <b>They win!</b>`
  document.getElementById('g28-over').classList.add('show')
  SFX.win()
}

function _g28UpdateOppHud() {
  const hud  = document.getElementById('g28-opp-hud')
  const stat = document.getElementById('g28-opp-stat')
  if (!hud || !stat) return
  if (G28_roomCode && G28_oppScore !== null) {
    hud.style.display = 'flex'
    stat.textContent  = G28_oppScore.toLocaleString() + ' pts'
  }
  // Update spectate overlay too
  const specOpp = document.getElementById('g28-spec-opp-score')
  if (specOpp && G28_oppScore !== null) specOpp.textContent = G28_oppScore.toLocaleString()
}

window.g28FindMatch = function() {
  mpFindMatch('parkour', {
    statusEl: document.getElementById('g28-queue-status'),
    btnEl:    document.getElementById('g28-queue-btn'),
    onMatched: ({ code, sideBySide, isHost }) => {
      G28_roomCode   = code
      G28_sideBySide = sideBySide
      G28_isHost     = !!isHost
      // Host chooses the layout for both players
      G28_seed       = isHost ? ((Date.now() ^ (qRandInt(1e9) << 4)) | 0) || 1 : 0
      G28_oppScore   = 0
      G28_iDied      = false
      G28_oppPos     = null
      const sock = mpGetSocket()
      sock.off('opponent-score'); sock.off('opponent-state'); sock.off('opponent-died')
      sock.off('opponent-left'); sock.off('force-end')

      sock.on('opponent-score', score => { G28_oppScore = score; _g28UpdateOppHud() })
      sock.on('opponent-state', (st) => {
        if (!st) return
        if (typeof st.x === 'number') G28_oppPos = { x: st.x, y: st.y, level: st.level }
        // Joiner takes the host's seed and rebuilds the level it is standing
        // on, so both players are on the identical layout from here.
        if (typeof st.seed === 'number' && !G28_isHost && st.seed !== G28_seed) {
          G28_seed = st.seed
          // Rebuild the level we are standing on from the agreed seed
          if (G28 && G28.grid) { G28.grid = g28GenLevel(G28.level); g28SpawnPlayer() }
        }
      })

      // Parkour: opponent died — they're spectating us now. We keep playing!
      sock.on('opponent-died', score => {
        G28_oppScore = score
        G28_oppDone  = true
        _g28UpdateOppHud()
        // Show a brief message that opponent died
        G28.msgs?.push({ text: `Opponent died! ${score.toLocaleString()} pts`, color: '#fdba74', frames: 120, big: false })
      })

      sock.on('opponent-left', () => {
        G28_oppScore = null
        document.getElementById('g28-queue-status').textContent = 'Opponent disconnected.'
      })

      g28StartSolo()
    }
  })
}

window.g28StartSolo = function() {
  document.getElementById('g28-overlay').style.display = 'none'
  document.getElementById('g28-spectate').style.display = 'none'
  if (G28_roomCode) {
    const hud = document.getElementById('g28-opp-hud')
    if (hud) hud.style.display = 'flex'
  }
  g28Reset()
}

// Fixed tile grid: 20 cols × 12 rows. One tile = S px (computed per draw).
const G28_COLS = 20
const G28_ROWS = 12
// Tile codes: 0=air  1=solid  2=spike  5=goal
// Player position stored in TILE units (floating point), converted to px in draw.

window.initGame28 = function() {
  g28Canvas = document.getElementById('g28-canvas')
  g28Ctx    = g28Canvas.getContext('2d')
  g28Keys   = {}
  G28_roomCode  = null
  G28_oppScore  = null
  G28_oppDone   = false
  G28_iDied     = false
  G28_oppPos    = null
  G28_seed      = 0      // solo generates its own layouts again
  G28_isHost    = false
  const arena = document.getElementById('g28-arena')
  g28Canvas.width  = Math.max(arena.clientWidth,  300)
  g28Canvas.height = Math.max(arena.clientHeight, 240)

  window.addEventListener('keydown', g28KD)
  window.addEventListener('keyup',   g28KU)
  g28Canvas.onmousedown  = () => { g28Keys.up = true }
  g28Canvas.onmouseup    = () => { g28Keys.up = false }
  g28Canvas.ontouchstart = e => { e.preventDefault(); g28TouchStart(e) }
  g28Canvas.ontouchend   = e => { e.preventDefault(); g28TouchEnd(e) }

  const hud = document.getElementById('g28-opp-hud')
  if (hud) hud.style.display = 'none'
  const spec = document.getElementById('g28-spectate')
  if (spec) spec.style.display = 'none'
  const st = document.getElementById('g28-queue-status')
  if (st) st.textContent = ''
  document.getElementById('g28-overlay').style.display = 'flex'
}

let g28KeyBuf = ''
function g28KD(e) {
  if (!document.getElementById('game28').classList.contains('active')) return
  if (e.code === 'Escape') {
    e.preventDefault()
    // Always open the shop when the player presses ESC during Parkour
    const hint = document.getElementById('g28-level-clear')
    if (hint) hint.remove()
    g28OpenShop()
    return
  }
  if (['ArrowLeft','KeyA'].includes(e.code))  g28Keys.left  = true
  if (['ArrowRight','KeyD'].includes(e.code)) g28Keys.right = true
  if (['Space','ArrowUp','KeyW'].includes(e.code)) { e.preventDefault(); g28Keys.up = true }
  if (e.key.length === 1) {
    g28KeyBuf = (g28KeyBuf + e.key.toLowerCase()).slice(-12)
    if (g28KeyBuf.endsWith('fartisfart')) { g28KeyBuf = ''; g28OpenEditor() }
  }
}
function g28KU(e) {
  if (['ArrowLeft','KeyA'].includes(e.code))  g28Keys.left  = false
  if (['ArrowRight','KeyD'].includes(e.code)) g28Keys.right = false
  if (['Space','ArrowUp','KeyW'].includes(e.code)) g28Keys.up = false
}
let g28TIds = {}
function g28TouchStart(e) {
  const W = g28Canvas.width, H = g28Canvas.height
  for (const t of e.changedTouches) {
    const r  = g28Canvas.getBoundingClientRect()
    const tx = (t.clientX - r.left) * (W / r.width)
    const ty = (t.clientY - r.top)  * (H / r.height)
    if (ty < H * 0.45) { g28Keys.up    = true;  g28TIds.jump  = t.identifier }
    else if (tx < W * 0.45) { g28Keys.left  = true;  g28TIds.left  = t.identifier }
    else                    { g28Keys.right = true;  g28TIds.right = t.identifier }
  }
}
function g28TouchEnd(e) {
  for (const t of e.changedTouches) {
    if (t.identifier === g28TIds.left)  { g28Keys.left  = false; g28TIds.left  = null }
    if (t.identifier === g28TIds.right) { g28Keys.right = false; g28TIds.right = null }
    if (t.identifier === g28TIds.jump)  { g28Keys.up    = false; g28TIds.jump  = null }
  }
}

// ─── level generation ──────────────────────────────────
// Tile codes: 0=air  1=solid  3=lava  5=goal
// Lava levels: enable every 5th level (Lvls 5,10,15,...)
function g28IsLavaLevel(lvl) { return lvl > 0 && (lvl % 5 === 0) }
function g28TimeLimit(lvl)   { return Math.max(300, 1500 - lvl * 40) }  // frames; 25s → min 5s

function g28GenLevel(lvl) {
  // use handcrafted level if one exists for this index
  if (g28CustomLevels[lvl]) return g28CustomLevels[lvl].grid.map(row => [...row])

  // In a match every level comes from the agreed seed, so both players get
  // the identical layout. Solo keeps using unseeded randomness.
  const rand = G28_seed ? _g28Rng(Math.imul(G28_seed ^ (lvl + 1), 0x9E3779B1)) : Math.random

  const R = G28_ROWS, C = G28_COLS
  const g = Array.from({length: R}, () => Array(C).fill('0'))
  const lava = g28IsLavaLevel(lvl)

  // ceiling + side walls
  for (let c = 0; c < C; c++) g[0][c] = '1'
  for (let r = 0; r < R; r++) { g[r][0] = '1'; g[r][C-1] = '1' }

  // bottom: lava or solid pit
  for (let c = 0; c < C; c++) {
    g[R-1][c] = lava ? '3' : '1'
    g[R-2][c] = lava ? '3' : '1'
  }

  // ── platform path ──
  // Physics (tile units, ~60fps):
  //   hspd=0.20  jump=-0.50  grav=0.030
  //   max jump height ≈ 4.1 tiles
  //   max jump distance (full run) ≈ 6.6 tiles
  //   Difficult: keep gaps 3-5, platforms 1-3 wide, big height changes

  const diff = Math.min(lvl / 6, 1.0)   // reaches full diff at level 6

  // platform width: starts at 3, shrinks to 1 at full diff
  const platW = () => Math.max(1, 3 - Math.floor(diff * 2) + (rand() < 0.3 ? 1 : 0))
  // gap: 2–5 tiles (never more than 5 so it's always jumpable)
  const gap   = () => 2 + Math.floor(rand() * (2 + diff * 2))
  // height change per step: bigger swings at higher diff
  const dH    = () => Math.round((rand() - 0.5) * (2 + diff * 4))

  const path = []
  // start platform — always wide enough to spawn on
  let pc = 1, pr = R - 3
  const startW = 4
  path.push({ c: pc, r: pr, w: startW })
  pc += startW

  while (pc < C - 3) {
    const gp = gap(), w = platW()
    pc += gp
    pr = Math.max(2, Math.min(R - 3, pr + dH()))
    if (pc + w > C - 2) break
    path.push({ c: pc, r: pr, w })
    pc += w
  }

  // place platforms
  for (const p of path) {
    for (let c = p.c; c < p.c + p.w && c < C - 1; c++) {
      g[p.r][c] = '1'
      if (p.r + 1 < R - 1) g[p.r + 1][c] = '1'  // one tile of depth
    }
  }

  // starting solid ground under spawn (so player doesn't fall into lava immediately)
  const spawnEndC = path[0].c + path[0].w
  for (let c = 1; c < spawnEndC && c < C - 1; c++) {
    g[R-2][c] = '1'; g[R-1][c] = '1'
  }

  // goal: centre of last platform, one tile above
  const last = path[path.length - 1]
  const goalCol = last.c + Math.floor(last.w / 2)
  const goalRow = last.r - 1
  if (goalRow >= 1 && goalCol < C - 1) g[goalRow][goalCol] = '5'

  return g
}

// ─── reset ─────────────────────────────────────────────
function g28Reset() {
  if (g28Raf) { cancelAnimationFrame(g28Raf); g28Raf = null }
  g28Keys = {}
  const prev = typeof G28 === 'object' ? G28 : {}
  G28 = {
    active: true,
    score: 0,
    bestScore: prev.bestScore || 0,
    frameCount: 0,
    level: 0,
    levelTime: 0,
    timeLeft: g28TimeLimit(0),
    coins: 0,
    lives: 1,
    extraJumps: 0,
    bonusTime: 0,
    fade: 255,
    fadeDir: 0,
    nextLevel: -1,
    pausedWaitingShop: false,
    dead: false,
    scrollX: 0,
    p: { tx: 1.5, ty: G28_ROWS - 4, vtx: 0, vty: 0, onGround: false, jumping: false, jumpCool: 0, jumpsLeft: 2, jumpWasUp: false, facing: 1, runFrame: 0 },
    grid: null,
    particles: [], msgs: [], screenShake: 0,
  }
  G28.grid = g28GenLevel(0)
  // place player standing on floor
  g28SpawnPlayer()
  document.getElementById('g28-over').classList.remove('show')
  g28Loop()
}

function g28SpawnPlayer() {
  // Spawn standing on top of the first path platform (row pr, stand at pr - PH)
  // Scan down each col from row 1 to find a solid tile to stand on
  const g = G28.grid
  for (let c = 1; c < G28_COLS - 1; c++) {
    for (let r = 1; r < G28_ROWS - 1; r++) {
      if (g[r][c] === '1' && g[r-1][c] === '0') {
        G28.p.tx = c + 0.1
        G28.p.ty = r - G28_PH
        G28.p.vtx = 0; G28.p.vty = 0; G28.p.onGround = true; G28.p.jumping = false; G28.p.jumpsLeft = 2 + G28.extraJumps; G28.p.jumpWasUp = false
        return
      }
    }
  }
  // fallback
  G28.p.tx = 1.5; G28.p.ty = 2; G28.p.vtx = 0; G28.p.vty = 0
}

// ─── tile lookup ────────────────────────────────────────
function g28T(row, col) {
  const g = G28.grid
  if (!g || row < 0 || row >= G28_ROWS || col < 0 || col >= G28_COLS) return '1'
  return g[row][col]
}

// ─── update ─────────────────────────────────────────────
// All physics in TILE units/frame (assumes ~60fps).
const G28_HSPD   = 0.20    // horizontal speed (tiles/frame)
const G28_JUMP   = -0.50   // jump initial velocity (tiles/frame, upward)
const G28_GRAV   = 0.030   // gravity (tiles/frame²)
const G28_TVEL   = 0.55    // terminal velocity (tiles/frame)
const G28_PW     = 0.75    // player width  (tile units)
const G28_PH     = 0.90    // player height (tile units)

function g28Update() {
  if (!G28.active) return
  G28.frameCount++; G28.levelTime++
  if (G28.screenShake > 0) G28.screenShake--
  G28.msgs      = G28.msgs.filter(m => { m.frames--; return m.frames > 0 })
  G28.particles = G28.particles.filter(p => {
    p.tx += p.vtx; p.ty += p.vty; p.vty += 0.007; p.vtx *= 0.92; p.life--; return p.life > 0
  })

  // fade transitions
  if (G28.fadeDir !== 0) {
    G28.fade = Math.max(0, Math.min(255, G28.fade + G28.fadeDir * 18))
    if (G28.fadeDir < 0 && G28.fade <= 0) {
      G28.fadeDir = 0
      if (G28.dead) { g28Over(); return }
    }
    if (G28.fadeDir > 0 && G28.fade >= 255) { G28.fade = 255; G28.fadeDir = 0 }
  }
  if (G28.fade < 100) return   // pause physics when screen is dark (covers shop state too)

  const p = G28.p
  if (!p || G28.dead) return

  // ── countdown timer ──
  G28.timeLeft--
  if (G28.timeLeft <= 0) { g28Die(); return }

  // ── horizontal ──
  if (g28Keys.left)        { p.vtx = -G28_HSPD; p.facing = -1 }
  else if (g28Keys.right)  { p.vtx =  G28_HSPD; p.facing =  1 }
  else                     { p.vtx *= 0.4 }

  // ── jump (double jump) ──
  if (g28Keys.up && !p.jumpWasUp && p.jumpsLeft > 0 && p.jumpCool <= 0) {
    SFX.jump()
    p.vty      = G28_JUMP
    p.onGround = false
    p.jumping  = true
    p.jumpCool = 8
    p.jumpsLeft--
    g28SparksTile(p.tx, p.ty + G28_PH, '#38bdf8', 4)
  }
  p.jumpWasUp = g28Keys.up
  if (p.jumpCool > 0) p.jumpCool--

  // ── gravity ──
  p.vty = Math.min(p.vty + G28_GRAV, G28_TVEL)

  // ── move X then resolve ──
  p.tx += p.vtx
  g28SolveX()

  // ── move Y then resolve ──
  const wasOnGround = p.onGround
  p.onGround = false
  p.ty += p.vty
  g28SolveY()
  if (!wasOnGround && p.onGround) { SFX.land(); p.jumpsLeft = 2 + G28.extraJumps }

  if (p.onGround && Math.abs(p.vtx) > 0.02) p.runFrame += 0.2

  // ── camera: follow player (in tile units) ──
  const viewTiles = G28_COLS   // how many tiles wide the view is
  G28.scrollX = Math.max(0, Math.min(G28_COLS - viewTiles, p.tx - viewTiles * 0.4))

  // ── special tile checks ──
  const testPoints = [
    [p.tx + G28_PW*0.25, p.ty + G28_PH*0.85],
    [p.tx + G28_PW*0.75, p.ty + G28_PH*0.85],
    [p.tx + G28_PW*0.5,  p.ty + G28_PH*0.5 ],
  ]
  for (const [ttx, tty] of testPoints) {
    const ch = g28T(Math.floor(tty), Math.floor(ttx))
    if (ch === '2' || ch === '3') { g28Die(); return }
    if (ch === '5') { g28Finish(); return }
  }

  // fell off bottom
  if (p.ty > G28_ROWS + 1) g28Die()
}

function g28SolveX() {
  const p = G28.p
  // check left and right edges at top, middle, bottom of player
  for (const dy of [0.05, G28_PH * 0.5, G28_PH - 0.05]) {
    const row = Math.floor(p.ty + dy)
    const lc  = Math.floor(p.tx)
    const rc  = Math.floor(p.tx + G28_PW - 0.01)
    if (g28T(row, lc) === '1') { p.tx = lc + 1;           p.vtx = 0 }
    if (g28T(row, rc) === '1') { p.tx = rc - G28_PW;      p.vtx = 0 }
  }
  p.tx = Math.max(1, Math.min(G28_COLS - 1 - G28_PW, p.tx))
}

function g28SolveY() {
  const p = G28.p
  // floor: check bottom edge
  for (const dx of [0.05, G28_PW * 0.5, G28_PW - 0.05]) {
    const col = Math.floor(p.tx + dx)
    const br  = Math.floor(p.ty + G28_PH)
    if (g28T(br, col) === '1' && p.vty >= 0) {
      p.ty = br - G28_PH; p.vty = 0
      p.onGround = true; p.jumping = false
    }
  }
  // ceiling: check top edge
  for (const dx of [0.05, G28_PW - 0.05]) {
    const col = Math.floor(p.tx + dx)
    const tr  = Math.floor(p.ty)
    if (g28T(tr, col) === '1' && p.vty < 0) {
      p.ty = tr + 1; p.vty = 0
    }
  }
}

function g28Die() {
  if (G28.playtest) { g28SpawnPlayer(); G28.scrollX = 0; return }
  if (G28.dead || G28.fadeDir !== 0) return
  SFX.die()
  if (G28.lives > 1) {
    G28.lives--
    G28.screenShake = 12
    G28.timeLeft = Math.min(G28.timeLeft + 600, g28TimeLimit(G28.level))
    g28SpawnPlayer(); G28.scrollX = 0
    G28.msgs.push({ text: '❤ 1UP used!', color: '#f87171', frames: 70, big: false })
    return
  }
  G28.dead = true; G28.screenShake = 16
  const p = G28.p
  for (let i = 0; i < 12; i++) {
    const a = Math.random() * Math.PI * 2, sp = 0.06 + Math.random() * 0.18
    G28.particles.push({ tx: p.tx + G28_PW/2, ty: p.ty + G28_PH/2, vtx: Math.cos(a)*sp, vty: Math.sin(a)*sp - 0.05, color: i%2 ? '#f87171' : '#fbbf24', life: 35, r: 0.15 + Math.random()*0.1 })
  }
  G28.fadeDir = -1
}

function g28Finish() {
  if (G28.fadeDir !== 0) return
  SFX.win()
  const secsLeft = Math.ceil(G28.timeLeft / 60)
  const bonus = 100 + secsLeft * 25
  G28.score += bonus
  G28.coins += secsLeft
  if (G28.score > G28.bestScore) G28.bestScore = G28.score
  if (G28_roomCode) mpGetSocket().emit('score-update', { code: G28_roomCode, score: G28.score })
  G28.msgs.push({ text: `LVL ${G28.level+1} ✓  +${bonus}  +${secsLeft}🪙`, color: '#fbbf24', frames: 90, big: true })

  // Immediate seamless transition to next level
  G28.level = G28.level + 1
  G28.timeLeft = g28TimeLimit(G28.level) + G28.bonusTime
  G28.bonusTime = 0
  G28.levelTime = 0
  G28.dead = false
  G28.grid = g28GenLevel(G28.level)
  g28SpawnPlayer(); G28.scrollX = 0
}

function g28OpenShop() {
  const prev = document.getElementById('g28-shop')
  if (prev) prev.remove()
  const hint = document.getElementById('g28-level-clear')
  if (hint) hint.remove()

  const overlay = document.createElement('div')
  overlay.id = 'g28-shop'
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:9999;overflow:hidden;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    font-family:monospace;color:#f1f5f9;gap:12px;
    background:radial-gradient(ellipse at 50% 60%,#0a1628 0%,#030710 70%);
  `

  // starfield
  const stars = document.createElement('canvas')
  stars.style.cssText = 'position:absolute;inset:0;pointer-events:none;'
  stars.width = window.innerWidth; stars.height = window.innerHeight
  const sc = stars.getContext('2d')
  for (let i = 0; i < 120; i++) {
    const x = Math.random() * stars.width, y = Math.random() * stars.height
    const r = Math.random() * 1.4
    sc.beginPath(); sc.arc(x, y, r, 0, Math.PI*2)
    sc.fillStyle = `rgba(255,255,255,${0.15 + Math.random()*0.6})`; sc.fill()
  }
  // gravity-well rings
  const cx = stars.width * 0.5, cy = stars.height * 0.5
  for (let r = 40; r < Math.max(stars.width, stars.height) * 0.9; r += 55) {
    sc.beginPath(); sc.arc(cx, cy, r, 0, Math.PI*2)
    sc.strokeStyle = `rgba(56,189,248,${0.06 - r*0.00005})`; sc.lineWidth = 1; sc.stroke()
  }
  overlay.appendChild(stars)

  const inner = document.createElement('div')
  inner.style.cssText = 'position:relative;display:flex;flex-direction:column;align-items:center;gap:12px;width:min(360px,92vw);'

  const title = document.createElement('div')
  title.style.cssText = 'font-size:20px;font-weight:bold;color:#fbbf24;letter-spacing:3px;text-shadow:0 0 18px #fbbf2488;'
  title.textContent = '★ LEVEL CLEAR'
  inner.appendChild(title)

  const sub = document.createElement('div')
  sub.style.cssText = 'font-size:12px;color:#64748b;'
  sub.textContent = `Next: Level ${G28.level + 1}  •  Time limit: ${Math.round(g28TimeLimit(G28.level) / 60)}s`
  inner.appendChild(sub)

  const coinEl = document.createElement('div')
  coinEl.style.cssText = 'font-size:17px;color:#fbbf24;font-weight:bold;text-shadow:0 0 10px #fbbf2466;'
  const renderCoins = () => { coinEl.textContent = `🪙 ${G28.coins} coins` }
  renderCoins()
  inner.appendChild(coinEl)

  const grid = document.createElement('div')
  grid.style.cssText = 'display:flex;flex-direction:column;gap:7px;width:100%;'

  function makeItem(icon, label, desc, price, canBuy, onBuy) {
    const row = document.createElement('div')
    row.style.cssText = `display:flex;align-items:center;gap:10px;
      background:rgba(15,23,42,0.85);border:1px solid #1e3a8a55;
      border-radius:8px;padding:9px 12px;backdrop-filter:blur(4px);`
    const info = document.createElement('div')
    info.style.cssText = 'flex:1;'
    info.innerHTML = `<div style="font-size:14px;font-weight:bold;">${icon} ${label}</div>
      <div style="font-size:10px;color:#475569;margin-top:1px;">${desc}</div>`
    const btn = document.createElement('button')
    btn.classList.add('g28-shop-btn')
    const refresh = () => {
      const ok = canBuy() && G28.coins >= price
      btn.style.cssText = `border:none;padding:5px 11px;border-radius:5px;
        cursor:${ok ? 'pointer' : 'default'};font-family:monospace;font-size:12px;white-space:nowrap;
        background:${ok ? '#1d4ed8' : '#1e293b'};color:${ok ? '#fff' : '#475569'};
        box-shadow:${ok ? '0 0 8px #3b82f655' : 'none'};`
      btn.textContent = `${price}🪙`
    }
    refresh()
    btn.onclick = () => {
      if (!canBuy() || G28.coins < price) return
      G28.coins -= price; onBuy(); renderCoins()
      overlay.querySelectorAll('.g28-shop-btn').forEach(b => b._refresh && b._refresh())
    }
    btn._refresh = refresh
    row.append(info, btn); grid.appendChild(row)
  }

  const maxJumps = 4
  makeItem('❤', 'Extra Life', `${G28.lives}/3 lives · respawn instead of game over`, 20,
    () => G28.lives < 3, () => { G28.lives++ })

  makeItem('⬆', `Extra Jump`, `${2 + G28.extraJumps}→${3 + G28.extraJumps} mid-air jumps (max ${maxJumps})`, 40,
    () => G28.extraJumps < maxJumps - 2, () => { G28.extraJumps++ })

  makeItem('⏱', '+10 seconds', 'Added to this next level\'s timer', 15,
    () => true, () => { G28.bonusTime += 600 })

  inner.appendChild(grid)

  // Continue + Quit row
  const btns = document.createElement('div')
  btns.style.cssText = 'display:flex;gap:10px;width:100%;margin-top:4px;'

  const quit = document.createElement('button')
  quit.style.cssText = `flex:0 0 auto;background:#7f1d1d;border:none;color:#fca5a5;
    padding:10px 18px;border-radius:8px;cursor:pointer;font-family:monospace;font-size:13px;`
  quit.textContent = '✕ End Run'
  quit.onclick = () => { overlay.remove(); G28.active = false; g28Over() }
  btns.appendChild(quit)

  const cont = document.createElement('button')
  cont.style.cssText = `flex:1;background:#15803d;border:none;color:#fff;padding:10px 0;
    border-radius:8px;cursor:pointer;font-family:monospace;font-size:15px;font-weight:bold;
    letter-spacing:1px;box-shadow:0 0 14px #16a34a66;`
  cont.textContent = '▶ CONTINUE'
  cont.onclick = () => {
    overlay.remove()
    G28.nextLevel = -1
    G28.timeLeft = g28TimeLimit(G28.level) + G28.bonusTime; G28.bonusTime = 0
    G28.levelTime = 0; G28.dead = false
    G28.grid = g28GenLevel(G28.level)
    g28SpawnPlayer(); G28.scrollX = 0
    G28.fadeDir = 1
  }
  btns.appendChild(cont)
  inner.appendChild(btns)
  overlay.appendChild(inner)
  document.body.appendChild(overlay)
}

function g28SparksTile(tx, ty, col, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = 0.04 + Math.random() * 0.1
    G28.particles.push({ tx, ty, vtx: Math.cos(a)*sp, vty: Math.sin(a)*sp, color: col, life: 18, r: 0.1 + Math.random()*0.08 })
  }
}

function g28ShowLevelClearHint() {
  if (document.getElementById('g28-level-clear')) return
  const el = document.createElement('div')
  el.id = 'g28-level-clear'
  el.style.cssText = `position:fixed;left:50%;top:16px;transform:translateX(-50%);z-index:9998;
    background:rgba(10,12,20,0.88);color:#e6edf3;padding:10px 14px;border-radius:10px;border:1px solid rgba(99,102,241,0.12);
    font-family:monospace;font-size:13px;display:flex;gap:10px;align-items:center;box-shadow:0 6px 30px rgba(2,6,23,0.6);`

  const msg = document.createElement('div')
  msg.textContent = `LEVEL ${G28.level} CLEAR — press ESC to open shop`
  el.appendChild(msg)

  const openBtn = document.createElement('button')
  openBtn.textContent = 'Open Shop'
  openBtn.style.cssText = 'background:#1d4ed8;color:#fff;border:none;padding:6px 10px;border-radius:6px;cursor:pointer;font-family:monospace;'
  openBtn.onclick = () => { el.remove(); G28.pausedWaitingShop = false; g28OpenShop() }
  el.appendChild(openBtn)

  const contBtn = document.createElement('button')
  contBtn.textContent = 'Skip Shop'
  contBtn.style.cssText = 'background:#374151;color:#fff;border:none;padding:6px 10px;border-radius:6px;cursor:pointer;font-family:monospace;'
  contBtn.onclick = () => {
    el.remove()
    G28.pausedWaitingShop = false
    G28.timeLeft = g28TimeLimit(G28.level) + G28.bonusTime; G28.bonusTime = 0
    G28.levelTime = 0; G28.dead = false
    G28.grid = g28GenLevel(G28.level)
    g28SpawnPlayer(); G28.scrollX = 0
    G28.fadeDir = 1
  }
  el.appendChild(contBtn)

  document.body.appendChild(el)
}

// ─── draw ───────────────────────────────────────────────
function g28Draw() {
  const cv = g28Canvas, c = g28Ctx
  const arena = document.getElementById('g28-arena')
  // Resize canvas if container changed
  const aw = Math.max(arena.clientWidth, 300), ah = Math.max(arena.clientHeight, 240)
  if (cv.width !== aw || cv.height !== ah) { cv.width = aw; cv.height = ah }
  const W = cv.width, H = cv.height

  // Tile size in px — fit the grid exactly
  const S = Math.min(W / G28_COLS, H / G28_ROWS)
  // Offset to centre the grid
  const OX = (W - S * G28_COLS) / 2
  const OY = (H - S * G28_ROWS) / 2

  const fa = G28.fade / 255

  // Helper: tile world → screen
  const tx2sx = tx => OX + (tx - G28.scrollX) * S
  const ty2sy = ty => OY + ty * S

  // Canvases get no CSS variables, so read the theme directly
  const _lt = typeof qgLight === 'function' && qgLight()
  c.fillStyle = _lt ? '#eef1f8' : '#050810'; c.fillRect(0, 0, W, H)

  // bg grid lines
  c.strokeStyle = _lt ? 'rgba(99,102,241,0.12)' : 'rgba(99,102,241,0.05)'; c.lineWidth = 1
  for (let col = 0; col <= G28_COLS; col++) {
    const x = OX + (col - G28.scrollX) * S
    c.beginPath(); c.moveTo(x, OY); c.lineTo(x, OY + G28_ROWS * S); c.stroke()
  }
  for (let row = 0; row <= G28_ROWS; row++) {
    const y = OY + row * S
    c.beginPath(); c.moveTo(OX, y); c.lineTo(OX + G28_COLS * S, y); c.stroke()
  }

  c.save()
  if (G28.screenShake > 0) { const sh = G28.screenShake * 0.4; c.translate((Math.random()-.5)*sh, (Math.random()-.5)*sh) }

  // tiles
  const g = G28.grid
  if (g) {
    for (let row = 0; row < G28_ROWS; row++) {
      for (let col = 0; col < G28_COLS; col++) {
        const ch = g[row][col]
        if (ch === '0') continue
        const sx = tx2sx(col), sy = ty2sy(row)
        if (sx + S < OX || sx > OX + G28_COLS * S) continue

        if (ch === '1') {
          c.fillStyle = `rgba(30,58,138,${fa})`
          c.fillRect(sx, sy, S, S)
          // top highlight
          c.fillStyle = `rgba(96,165,250,${fa * 0.9})`
          c.fillRect(sx, sy, S, S * 0.22)
          // right/bottom shadow
          c.fillStyle = `rgba(0,0,0,${fa * 0.35})`
          c.fillRect(sx, sy + S * 0.78, S, S * 0.22)
          c.fillRect(sx + S * 0.78, sy, S * 0.22, S)
          // border
          c.strokeStyle = `rgba(59,130,246,${fa * 0.3})`; c.lineWidth = 1
          c.strokeRect(sx + 0.5, sy + 0.5, S - 1, S - 1)

        } else if (ch === '3') {
          // lava — animated orange/red
          const lf = 0.55 + Math.sin(G28.frameCount * 0.08 + col * 0.7) * 0.3
          const lf2 = 0.55 + Math.sin(G28.frameCount * 0.11 + col * 0.5 + 1.5) * 0.3
          c.fillStyle = `rgba(180,30,0,${fa})`; c.fillRect(sx, sy, S, S)
          c.fillStyle = `rgba(255,${Math.floor(80 + lf * 80)},0,${fa * lf})`
          c.fillRect(sx, sy + S * 0.25, S, S * 0.75)
          c.fillStyle = `rgba(255,220,0,${fa * lf2 * 0.6})`
          c.fillRect(sx + S*0.1, sy + S*0.5, S*0.8, S*0.3)
          // bubble
          if ((G28.frameCount + col * 3) % 40 < 8) {
            const bubY = sy + S * 0.4 - ((G28.frameCount + col*3) % 40) * S * 0.04
            c.fillStyle = `rgba(255,160,0,${fa * 0.8})`
            c.beginPath(); c.arc(sx + S*0.5, bubY, S*0.1, 0, Math.PI*2); c.fill()
          }
          c.shadowColor = '#ff4400'; c.shadowBlur = S * 0.5
          c.fillStyle = `rgba(255,80,0,${fa * 0.25 * lf})`
          c.fillRect(sx, sy, S, S * 0.25); c.shadowBlur = 0

        } else if (ch === '5') {
          const pulse = 0.55 + Math.sin(G28.frameCount * 0.13) * 0.35
          c.fillStyle = `rgba(251,191,36,${fa * 0.18 * pulse})`
          c.fillRect(sx, sy, S, S)
          c.strokeStyle = `rgba(251,191,36,${fa * pulse})`; c.lineWidth = 3
          c.shadowColor = '#fbbf24'; c.shadowBlur = S * 0.6
          c.strokeRect(sx + 3, sy + 3, S - 6, S - 6); c.shadowBlur = 0
          c.font = `bold ${Math.floor(S * 0.65)}px sans-serif`
          c.textAlign = 'center'; c.textBaseline = 'middle'
          c.fillStyle = `rgba(251,191,36,${fa * pulse})`
          c.fillText('★', sx + S/2, sy + S/2)
          c.textBaseline = 'alphabetic'
        }
      }
    }
  }

  // particles
  for (const pt of G28.particles) {
    const psx = tx2sx(pt.tx), psy = ty2sy(pt.ty)
    c.globalAlpha = (pt.life / 35) * fa
    c.beginPath(); c.arc(psx, psy, pt.r * S, 0, Math.PI*2)
    c.fillStyle = pt.color; c.fill()
  }
  c.globalAlpha = 1

  // Opponent ghost — same seed means the same layout, so their tile
  // position is meaningful on our screen. Only drawn while we are both on
  // the same level; otherwise it would float over unrelated geometry.
  if (G28_oppPos && G28_oppPos.level === G28.level) {
    const gx = tx2sx(G28_oppPos.x), gy = ty2sy(G28_oppPos.y)
    const gw = G28_PW * S, gh = G28_PH * S
    c.save()
    c.globalAlpha = 0.45
    c.fillStyle = '#7dd3fc'
    c.shadowColor = '#7dd3fc'; c.shadowBlur = S * 0.35
    c.fillRect(gx, gy, gw, gh)
    c.shadowBlur = 0
    c.globalAlpha = 0.9
    c.font = `bold ${Math.max(9, S * 0.32)}px sans-serif`
    c.textAlign = 'center'; c.fillStyle = _lt ? '#0369a1' : '#7dd3fc'
    c.fillText('OPP', gx + gw / 2, gy - S * 0.15)
    c.restore()
    c.globalAlpha = 1
  }

  // player
  const p = G28.p
  if (p && (!G28.dead || G28.frameCount % 8 < 5)) {
    const px = tx2sx(p.tx)
    const py = ty2sy(p.ty)
    const pw = G28_PW * S, ph = G28_PH * S
    const res = pw / 5   // pixel art resolution

    // lean while running
    const lean = p.facing * Math.sin(p.runFrame) * (S * 0.04)

    c.save()
    c.translate(px + pw/2 + lean, py + ph/2)
    c.scale(p.facing, 1)
    c.translate(-pw/2, -ph/2)

    c.shadowColor = '#fb923c'; c.shadowBlur = S * 0.3
    // 5×5 pixel art character
    const charMap = [
      '01110',
      '11111',
      '10101',
      '11111',
      '10001',
    ]
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) {
        if (charMap[i][j] === '1') {
          c.fillStyle = `rgba(253,186,116,${fa})`
          if (i === 0) c.fillStyle = `rgba(255,220,150,${fa})`   // head lighter
          if (i >= 3)  c.fillStyle = `rgba(194,65,12,${fa})`     // legs darker
          c.fillRect(j * res, i * res + (ph - 5*res)/2, res - 0.5, res - 0.5)
        }
      }
    }
    // eyes
    c.fillStyle = `rgba(15,23,42,${fa})`
    c.fillRect(res,     (ph - 5*res)/2 + res*0.2, res*0.7, res*0.7)
    c.fillRect(res*3.3, (ph - 5*res)/2 + res*0.2, res*0.7, res*0.7)

    c.shadowBlur = 0
    c.restore()

    // player arrow indicator (always visible even if near edge)
    if (fa > 0.5) {
      c.fillStyle = `rgba(251,191,36,${(fa-0.5)*2})`
      c.beginPath()
      c.moveTo(px + pw/2 - S*0.15, py - S*0.35)
      c.lineTo(px + pw/2 + S*0.15, py - S*0.35)
      c.lineTo(px + pw/2, py - S*0.12)
      c.closePath(); c.fill()
    }
  }

  c.restore()

  // fade overlay
  if (G28.fade < 255) {
    c.fillStyle = _lt ? `rgba(238,241,248,${1 - fa})` : `rgba(5,8,16,${1 - fa})`
    c.fillRect(0, 0, W, H)
  }

  // low-time urgency vignette
  if (G28.timeLeft <= 300 && G28.timeLeft > 0 && !G28.dead) {
    const urgency = 1 - G28.timeLeft / 300
    const pulse = 0.5 + Math.sin(G28.frameCount * 0.25) * 0.4
    const vg = c.createRadialGradient(W/2, H/2, H*0.25, W/2, H/2, H*0.8)
    vg.addColorStop(0, 'rgba(0,0,0,0)')
    vg.addColorStop(1, `rgba(220,38,38,${urgency * pulse * 0.45})`)
    c.fillStyle = vg; c.fillRect(0, 0, W, H)
  }

  // HUD
  c.font = 'bold 14px monospace'; c.textAlign = 'left'
  c.fillStyle = _lt ? '#14152b' : '#f1f5f9'; c.shadowColor = _lt ? 'rgba(255,255,255,.8)' : '#000'; c.shadowBlur = 4
  c.fillText(`LVL ${G28.level + 1}   ${G28.score.toLocaleString()} pts`, 10, 22)
  c.shadowBlur = 0
  c.font = '11px monospace'; c.fillStyle = '#64748b'
  const jumpLabel = G28.extraJumps > 0 ? `  ⬆×${2 + G28.extraJumps}` : ''
  c.fillText(`BEST ${G28.bestScore}   🪙${G28.coins}${jumpLabel}`, 10, 38)

  // Lives (right side, left-to-right)
  c.textAlign = 'left'; c.font = 'bold 13px monospace'
  for (let i = 0; i < 3; i++) {
    c.fillStyle = i < G28.lives ? '#f87171' : '#334155'
    c.fillText('❤', W - 68 + i * 22, 22)
  }

  // Countdown timer
  const secsLeft = Math.ceil(G28.timeLeft / 60)
  const timerColor = secsLeft <= 5 ? '#ef4444' : secsLeft <= 10 ? '#f59e0b' : '#4ade80'
  c.fillStyle = timerColor
  c.shadowColor = timerColor; c.shadowBlur = secsLeft <= 5 ? 14 : 0
  c.font = `bold ${secsLeft <= 5 ? 16 : 14}px monospace`
  c.textAlign = 'right'
  c.fillText(`⏱ ${secsLeft}s`, W - 10, 38)
  c.shadowBlur = 0; c.textAlign = 'left'

  if (G28.playtest) {
    c.fillStyle = '#fb923c'; c.textAlign = 'right'; c.font = '11px monospace'
    c.fillText('PLAYTEST — no death', W - 10, 54)
    c.textAlign = 'left'
  }

  let my = H * 0.38
  for (const m of G28.msgs) {
    c.globalAlpha = Math.min(1, m.frames / 18)
    c.font = `bold ${m.big ? 18 : 13}px sans-serif`; c.textAlign = 'center'
    c.fillStyle = m.color; c.shadowColor = m.color; c.shadowBlur = 8
    c.fillText(m.text, W/2, my); c.shadowBlur = 0; my += m.big ? 26 : 18
  }
  c.globalAlpha = 1

  if (G28.frameCount < 200) {
    c.globalAlpha = Math.min(1, (200 - G28.frameCount) / 60) * 0.65
    c.font = '12px sans-serif'; c.textAlign = 'center'; c.fillStyle = '#7dd3fc'
    c.fillText('← → / A D to move  •  Space / ↑ / W to jump  •  reach the ★!', W/2, H - 14)
    c.globalAlpha = 1
  }
}

function g28Loop() {
  g28Raf = requestAnimationFrame(g28Loop)
  if (!G28.active || !document.getElementById('game28').classList.contains('active')) {
    cancelAnimationFrame(g28Raf); g28Raf = null; return
  }
  g28Update(); g28Draw()

  // Broadcast our tile position ~20/s so the other player can see our ghost.
  // The host also repeats the seed until the joiner has it.
  if (G28_roomCode && G28.p) {
    const now = Date.now()
    if (now - G28_lastSync >= 50) {
      G28_lastSync = now
      mpGetSocket().emit('state-sync', { code: G28_roomCode, state: {
        x: G28.p.tx, y: G28.p.ty, level: G28.level,
        ...(G28_isHost ? { seed: G28_seed } : {}),
      } })
    }
  }
}

function g28Over() {
  G28.active = false
  if (G28.score > G28.bestScore) G28.bestScore = G28.score
  window._g28Score = G28.score
  window.removeEventListener('keydown', g28KD)
  window.removeEventListener('keyup',   g28KU)

  if (G28_roomCode) {
    mpGetSocket().emit('player-died', { code: G28_roomCode, score: G28.score })
    G28_iDied = true

    // If opponent already died while we were still playing, compare immediately
    if (G28_oppDone && G28_oppScore !== null) {
      const won = G28.score > G28_oppScore
      _g28ShowFinalResult(G28.score, G28_oppScore, won)
      if (typeof recordMpResult === 'function') recordMpResult('parkour', won)
      return
    }

    // Show spectate overlay — wait for opponent to finish
    const spec = document.getElementById('g28-spectate')
    const myScoreEl = document.getElementById('g28-spec-your-score')
    if (spec) { spec.style.display = 'flex' }
    if (myScoreEl) myScoreEl.textContent = G28.score.toLocaleString()
    _g28UpdateOppHud()

    // Wait for opponent to die too, then show full result
    const sock = mpGetSocket()
    sock.on('opponent-died', oppScore => {
      const spec2 = document.getElementById('g28-spectate')
      if (spec2) spec2.style.display = 'none'
      const won = G28.score > oppScore
      _g28ShowFinalResult(G28.score, oppScore, won)
      if (typeof recordMpResult === 'function') recordMpResult('parkour', won)
    })
    return  // don't show game-over yet
  }

  document.getElementById('g28-final-score').textContent = G28.score.toLocaleString()
  const m = G28.score >= 3000 ? '🥇 Gold' : G28.score >= 1200 ? '🥈 Silver' : G28.score >= 400 ? '🥉 Bronze' : ''
  document.getElementById('g28-medal').textContent = m
  document.getElementById('g28-mp-result').textContent = ''
  document.getElementById('g28-over').classList.add('show')
}

// ─── custom handcrafted levels ──────────────────────────
// Each entry: { grid: string[][] (G28_ROWS arrays of G28_COLS chars), difficulty: number }
// Level n uses g28CustomLevels[n] if it exists, else procedural generation.
const g28CustomLevels = []

// ─── secret level editor ────────────────────────────────
// Type "fartisfart" during gameplay to open.
function g28OpenEditor() {
  if (document.getElementById('g28-editor')) return
  const R = G28_ROWS, C = G28_COLS
  // snapshot current level grid as starting canvas
  const editGrid = G28.grid
    ? G28.grid.map(row => [...row])
    : Array.from({length: R}, (_, r) => Array(C).fill(r === 0 || r === R-1 ? '1' : '0'))

  let selectedTile = '1'
  let isLava = g28IsLavaLevel(G28.level)
  let difficulty = Math.min(10, Math.max(1, Math.round((G28.level / 6) * 10) || 3))
  let painting = false

  const TILE_COLORS = { '0': '#0d1424', '1': '#1e3a8a', '3': '#991b1b', '5': '#92400e' }
  const TILE_LABELS = { '0': 'Air', '1': 'Solid', '3': 'Lava', '5': 'Goal' }

  const overlay = document.createElement('div')
  overlay.id = 'g28-editor'
  overlay.style.cssText = `
    position:absolute;inset:0;background:rgba(5,8,16,0.97);z-index:999;
    display:flex;flex-direction:column;align-items:center;justify-content:flex-start;
    padding:10px;box-sizing:border-box;font-family:monospace;color:#f1f5f9;overflow:auto;
  `

  const title = document.createElement('div')
  title.style.cssText = 'font-size:16px;font-weight:bold;color:#fb923c;margin-bottom:6px;'
  title.textContent = '🗺 LEVEL EDITOR — secret mode'
  overlay.appendChild(title)

  // palette
  const palette = document.createElement('div')
  palette.style.cssText = 'display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap;justify-content:center;'
  for (const [code, label] of Object.entries(TILE_LABELS)) {
    const btn = document.createElement('button')
    btn.dataset.tile = code
    btn.style.cssText = `background:${TILE_COLORS[code]};border:2px solid ${code === selectedTile ? '#fb923c' : '#334155'};
      color:#f1f5f9;padding:4px 10px;cursor:pointer;border-radius:4px;font-family:monospace;font-size:12px;`
    btn.textContent = label
    btn.onclick = () => {
      selectedTile = code
      palette.querySelectorAll('button').forEach(b => b.style.borderColor = b.dataset.tile === code ? '#fb923c' : '#334155')
    }
    palette.appendChild(btn)
  }
  overlay.appendChild(palette)

  // grid
  const gridEl = document.createElement('div')
  gridEl.style.cssText = `display:grid;grid-template-columns:repeat(${C},1fr);gap:1px;
    background:#1e293b;border:1px solid #334155;cursor:crosshair;user-select:none;
    max-width:min(700px,95vw);width:100%;`

  const cells = []
  function updateCell(r, c2) {
    editGrid[r][c2] = selectedTile
    cells[r][c2].style.background = TILE_COLORS[selectedTile]
    if (selectedTile === '5') {
      // clear any other goal
      for (let rr = 0; rr < R; rr++) for (let cc = 0; cc < C; cc++) {
        if ((rr !== r || cc !== c2) && editGrid[rr][cc] === '5') {
          editGrid[rr][cc] = '0'; cells[rr][cc].style.background = TILE_COLORS['0']
        }
      }
    }
  }

  for (let r = 0; r < R; r++) {
    cells.push([])
    for (let c2 = 0; c2 < C; c2++) {
      const cell = document.createElement('div')
      cell.style.cssText = `aspect-ratio:1;background:${TILE_COLORS[editGrid[r][c2]] || '#0d1424'};min-width:4px;`
      cell.onmousedown  = e => { painting = true; updateCell(r, c2); e.preventDefault() }
      cell.onmouseover  = () => { if (painting) updateCell(r, c2) }
      gridEl.appendChild(cell)
      cells[r].push(cell)
    }
  }
  document.onmouseup = () => { painting = false }
  overlay.appendChild(gridEl)

  // controls row
  const controls = document.createElement('div')
  controls.style.cssText = 'display:flex;gap:10px;margin-top:8px;align-items:center;flex-wrap:wrap;justify-content:center;'

  const diffLabel = document.createElement('label')
  diffLabel.style.cssText = 'font-size:12px;color:#94a3b8;'
  const diffInput = document.createElement('input')
  diffInput.type = 'range'; diffInput.min = 1; diffInput.max = 10; diffInput.value = difficulty
  diffInput.style.cssText = 'width:80px;'
  diffInput.oninput = () => { difficulty = parseInt(diffInput.value); diffVal.textContent = difficulty }
  const diffVal = document.createElement('span')
  diffVal.textContent = difficulty
  diffLabel.append('Difficulty: ', diffInput, ' ', diffVal)
  controls.appendChild(diffLabel)

  const lavaLabel = document.createElement('label')
  lavaLabel.style.cssText = 'font-size:12px;color:#94a3b8;'
  const lavaCheck = document.createElement('input')
  lavaCheck.type = 'checkbox'; lavaCheck.checked = isLava
  lavaCheck.onchange = () => { isLava = lavaCheck.checked }
  lavaLabel.append(lavaCheck, ' Lava level')
  controls.appendChild(lavaLabel)

  overlay.appendChild(controls)

  // action buttons
  const actions = document.createElement('div')
  actions.style.cssText = 'display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;justify-content:center;'

  function makeBtn(label, bg, fn) {
    const b = document.createElement('button')
    b.textContent = label
    b.style.cssText = `background:${bg};border:none;color:#fff;padding:6px 14px;cursor:pointer;border-radius:4px;font-family:monospace;font-size:13px;`
    b.onclick = fn; return b
  }

  actions.appendChild(makeBtn('📋 Copy Export', '#0f766e', () => {
    const rows = editGrid.map(row => row.join('')).join('\n')
    const out = `DIFFICULTY:${difficulty}\nLAVA:${isLava}\n${rows}`
    navigator.clipboard.writeText(out).then(() => {
      copyBtn.textContent = '✓ Copied!'
      setTimeout(() => { copyBtn.textContent = '📋 Copy Export' }, 2000)
    })
  }))
  const copyBtn = actions.lastChild

  actions.appendChild(makeBtn('▶ Test Level', '#1d4ed8', () => {
    overlay.remove(); document.onmouseup = null
    G28.grid = editGrid.map(row => [...row])
    G28.level = 0; G28.levelTime = 0
    G28.dead = false; G28.fadeDir = 0; G28.fade = 255
    G28.nextLevel = -1; G28.particles = []; G28.screenShake = 0
    G28.playtest = true; G28.active = true
    g28SpawnPlayer(); G28.scrollX = 0
    document.getElementById('g28-over').classList.remove('show')
    window.addEventListener('keydown', g28KD)
    window.addEventListener('keyup', g28KU)
    if (!g28Raf) g28Loop()
  }))

  actions.appendChild(makeBtn('✕ Close', '#4b5563', () => {
    overlay.remove(); document.onmouseup = null
  }))

  overlay.appendChild(actions)

  const hint = document.createElement('div')
  hint.style.cssText = 'font-size:10px;color:#475569;margin-top:6px;text-align:center;'
  hint.textContent = 'Left-click to paint • Select tile type above • Copy Export → paste to dev to save as permanent level'
  overlay.appendChild(hint)

  document.getElementById('g28-arena').appendChild(overlay)
}
