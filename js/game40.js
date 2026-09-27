// ═══════════════════════════════════════════════════════
//  GAME 40 — UFO FLAP
//  Flappy-Bird style. Space / tap to thrust up.
//  Dodge the neon pillars — faster and tighter as you score.
// ═══════════════════════════════════════════════════════

const G40_GRAV      = 880
const G40_THRUST    = -400
const G40_UFO_RX    = 22
const G40_UFO_RY    = 11
const G40_PIPE_W    = 62
const G40_PIPE_GAP0 = 195
const G40_PIPE_SPD0 = 155
const G40_PIPE_SEP  = 290
const G40_ACCEL     = 3.5
// Bot playback steps on this clock, never the display's, so a stutter or a
// 144Hz screen cannot shift the plan out of step with the game.
const G40_SIM_DT    = 1 / 240
const G40_MAX_STEPS = 16
const G40_RETRY_WAIT = 0.5   // beat to see the crash before it resets

const G40 = {
  active:   false,
  phase:    'idle',
  y:        0,
  vy:       0,
  score:    0,
  pipes:    [],
  speed:    G40_PIPE_SPD0,
  gap:      G40_PIPE_GAP0,
  stars:    [],
  raf:      null,
  lastTime: 0,
  deadT:    0,
  showOver: false,
  // Gauntlet mode (beta + stall): a named level series instead of one endless run
  gauntlet: false,
  challenge: null,
  scrollX:  0,
  clearAt:  0,
  announceT: 0,
  clearedT: 0,
  // Same-device 2P: P1 on Space, P2 on the up arrow, one shared level
  multi:    false,
  p2y:      0,
  p2vy:     0,
  p1dead:   false,
  p2dead:   false,
  winner:   0,
  testLevel: null,   // editor test play
  noclip:    false,  // editor: walls flash instead of killing
  // Autopilot. The plan is a flap per simulation step, so the simulation
  // has to run on a fixed clock or the plan and the game drift apart.
  botMode:  false,
  bot:      null,
  evil:     false,
  simAcc:   0,
  practice: false,
  practiceDiff: null,
  practiceLevel: null,
  retrying: false,
  retryT:   0,
  attempts: 0,
  paused:   false,
  portals:  [],
  portalFlash: 0,
  portalCool: 0,
  hasPortal: false,
  fullTrail: [],
  taps:     0,
}


// ═══════════════════════════════════════════════════════
//  GAUNTLET MODE — a named series instead of one endless run
//  Levels are resolution-independent: `cyf` is the gap centre as a
//  fraction of canvas height, `gapf` the gap size as a fraction, and
//  `at` the world x the pillar sits at. Same idea as Wave Gauntlet's
//  keyframes, so a level plays the same on any window size.
//
//  Authoring notes (physics: gravity 880, one thrust sets vy to -400):
//    a single flap climbs ~91px before gravity wins
//    falling is far faster than climbing, so upward steps cost flaps
//  Runs on /beta and /stall; the main site keeps the endless game.
// ═══════════════════════════════════════════════════════

const P = (at, cyf, gapf) => (gapf ? { at, cyf, gapf } : { at, cyf })

// Build an evenly spaced run — keeps level definitions readable
function _g40Run(x0, step, cys, gapf) {
  return cys.map((cyf, i) => P(x0 + i * step, cyf, gapf))
}

// Mark pillars you are allowed to land on. A green pillar does not kill —
// you settle onto it and can sit there as long as you like, which gives a
// breather partway through the harder levels.
function _g40Rest(pipes, idxs, side) {
  for (const i of idxs) if (pipes[i]) pipes[i].safe = side || 'bottom'
  return pipes
}

const G40_POOL = {
  easy: [
    { name:'FIRST STEPS', diff:'easy', speed:150, gapf:0.34, clearAt:2920,
      pipes:_g40Run(520, 330, [0.50,0.44,0.56,0.48,0.54,0.46,0.52]) },
    { name:'EASY ORBIT', diff:'easy', speed:162, gapf:0.31, clearAt:2860,
      // one green pillar early on, so the mechanic is met somewhere safe
      pipes:_g40Rest(_g40Run(520, 320, [0.44,0.56,0.40,0.58,0.46,0.54,0.48]), [3]) },
  ],
  medium: [
    { name:'STAIRCASE', diff:'medium', speed:178, gapf:0.27, clearAt:3040,
      pipes:_g40Rest(_g40Run(520, 300, [0.66,0.58,0.50,0.42,0.34,0.42,0.50,0.58]), [4]) },
    { name:'ZIGZAG', diff:'medium', speed:184, gapf:0.26, clearAt:3005,
      pipes:_g40Run(520, 295, [0.36,0.62,0.36,0.62,0.36,0.62,0.40,0.58]) },
    { name:'NARROWING', diff:'medium', speed:176, gapf:0.28, clearAt:2980,
      pipes:[P(520,0.50,0.32),P(810,0.44,0.29),P(1100,0.56,0.27),P(1390,0.46,0.25),
             P(1680,0.54,0.24),P(1970,0.48,0.23),P(2260,0.52,0.22),P(2560,0.50,0.22)] },
  ],
  hard: [
    { name:'TIGHT SQUEEZE', diff:'hard', speed:198, gapf:0.205, clearAt:2865,
      pipes:_g40Run(520, 275, [0.50,0.45,0.55,0.44,0.56,0.46,0.54,0.50]) },
    { name:'THE LADDER', diff:'hard', speed:204, gapf:0.22, clearAt:3084,
      // a rest at the top of the climb, where it hurts most, then a portal
      // that drops you back to the bottom instead of flying the descent
      pipes:_g40Rest(_g40Run(520, 268, [0.70,0.62,0.54,0.46,0.38,0.30,0.38,0.50,0.62]), [5]) },
    { name:'WHIPLASH', diff:'hard', speed:208, gapf:0.235, clearAt:2844,
      pipes:_g40Run(520, 272, [0.32,0.68,0.30,0.70,0.34,0.66,0.36,0.64]) },
  ],
  extreme: [
    { name:'NEEDLE', diff:'extreme', speed:222, gapf:0.175, clearAt:2774,
      pipes:_g40Rest(_g40Run(520, 262, [0.50,0.46,0.54,0.47,0.53,0.48,0.52,0.50]), [3]) },
    { name:'THE GRINDER', diff:'extreme', speed:232, gapf:0.19, clearAt:3132,
      pipes:_g40Rest(_g40Run(520, 274, [0.42,0.58,0.38,0.62,0.44,0.56,0.40,0.60,0.50]), [2,6]) },
  ],
}

function _g40Gauntlet() { return !!(window.QG_BETA || window.QG_STALL) }

function _g40GetPool(score) {
  const {easy,medium,hard,extreme} = G40_POOL
  if (score < 2) return [...easy]
  if (score < 4) return [...easy, ...medium]
  if (score < 7) return [...medium, ...hard]
  if (score < 10) return [...hard, ...extreme]
  return [...extreme, ...hard]
}

// Lay a level out in screen space. Pillars start off to the right and
// scroll in, exactly as the endless spawner does, so movement, drawing
// and collision are shared between both modes.
function _g40LoadLevel(w, h) {
  let pool
  if (G40.testLevel) pool = [G40.testLevel]
  else if (G40.practice && G40.practiceDiff) {
    // Practice ignores score gates so every level in the tier is reachable
    pool = [...(G40_POOL[G40.practiceDiff] || G40_POOL.easy)]
    if (G40.practiceLevel) {
      const one = pool.filter(x => x.name === G40.practiceLevel)
      if (one.length) pool = one
    }
  } else pool = _g40GetPool(G40.score)
  const tmpl = pool[qRandInt(pool.length)] || G40_POOL.easy[0]
  G40.challenge = tmpl
  G40.speed     = tmpl.speed
  G40.gap       = tmpl.gapf * h
  G40.clearAt   = tmpl.clearAt
  G40.scrollX   = 0
  // `at` is the scroll position where this pillar meets the ship, so a
  // pillar starts at `at` plus the ship's x. Laying them out relative to the
  // right edge instead made the level's real length depend on the window
  // width, and the finish fired before the last pillar had arrived —
  // FIRST STEPS ended 220 columns early on a 900px canvas.
  const ufoX0 = w * 0.20
  // Portals: fly through the mouth at (at, cf) and you come out at
  // (toAt, toCf) — a different column, a different height, or both.
  // Rolled once per load, so the pillars and the bot plan agree on which
  // version is being played. Test play always gets them.
  const wantPortals = tmpl.portals && tmpl.portals.length &&
    (G40.testLevel ? true : qRandInt(100) < Math.round((tmpl.portalChance ?? 0.35) * 100))
  G40.portals   = wantPortals ? tmpl.portals.map(p => ({
    at: p.at, cf: p.cf ?? 0.5,
    toAt: p.toAt ?? p.at, toCf: p.toCf ?? 0.5,
    mouth: p.mouth ?? 0.16,
  })) : []
  G40.hasPortal = !!wantPortals
  G40.portalFlash = 0
  G40.portalCool = 0
  G40.pipes     = tmpl.pipes.map(p => ({
    x: p.at + ufoX0, cy: p.cyf * h, gap: (p.gapf || tmpl.gapf) * h,
    safe: p.safe || null, passed: false,
  }))
  G40.y   = h / 2; G40.vy   = 0
  G40.p2y = h / 2; G40.p2vy = 0
  G40.p1dead = false; G40.p2dead = false
  G40.phase = 'announce'; G40.announceT = 0

  G40.bot = null
  G40.simAcc = 0
  G40.fullTrail = []
  G40.taps = 0
  if (G40.botMode && !G40.multi && typeof lcSolveUFOAll === 'function') {
    // Solving takes 0.5-2s of blocked main thread on a busy level, and a
    // retry reloads the same level — so without this, every crash in
    // practice froze the tab for a second or two before restarting, which
    // looks exactly like the page hanging. The plan only depends on the
    // level, the canvas height and which bot you asked for, so cache on that.
    const sig = [tmpl.name, tmpl.clearAt, tmpl.speed, tmpl.gapf,
                 (tmpl.pipes || []).length, h, G40.evil ? 1 : 0,
                 G40.hasPortal ? 'p' : '-'].join('|')
    const hit = G40._botCache
    if (hit && hit.sig === sig) {
      G40.bot = { flaps: hit.flaps, i: 0, taps: hit.taps }
    } else {
      try {
        const r = lcSolveUFOAll({ speed: tmpl.speed, clearAt: tmpl.clearAt,
                               gapf: tmpl.gapf, pipes: tmpl.pipes,
                               portals: G40.portals },
                             h, w, G40_SIM_DT, !!G40.evil)
        if (r.ok) {
          G40.bot = { flaps: r.flaps, i: 0, taps: r.taps }
          G40._botCache = { sig, flaps: r.flaps, taps: r.taps }
        } else {
          G40._botCache = { sig, flaps: null, taps: 0 }
        }
      } catch (e) { console.warn('ufo bot:', e) }
    }
    if (G40.bot && !G40.bot.flaps) G40.bot = null
  }
}

let _g40Canvas = null
function _g40C() {
  if (!_g40Canvas) _g40Canvas = document.getElementById('g40-canvas')
  return _g40Canvas
}

async function initGame40() {
  stopGame40()
  _g40Canvas = null
  document.getElementById('g40-overlay').style.display = 'flex'
  document.getElementById('g40-over').style.display    = 'none'
  // The level series and same-device 2P run on /beta and /stall only;
  // the main site keeps the original endless game and no 2P button.
  const twoP = document.getElementById('g40-2p-btn')
  if (twoP) twoP.style.display = _g40Gauntlet() ? '' : 'none'
  try { _g40BuildPracticeUI() } catch (e) { console.error('ufo practice picker:', e) }
  const hint = document.getElementById('g40-hint')
  if (hint) hint.textContent = _g40Gauntlet()
    ? 'Clear a series of named levels — each one has a finish line.'
    : 'Faster and tighter as you score!'
  await initCurby()
}
window.initGame40 = initGame40


// ── Practice picker ───────────────────────────────────
// Same shape as Wave Gauntlet's: pick a tier or a single level, with
// noclip and the bot as toggles above it. Practice never scores.
const G40_DIFF_COL = { easy:'#4ade80', medium:'#fbbf24', hard:'#f87171', extreme:'#fb923c' }

function _g40BuildPracticeUI() {
  const el = document.getElementById('g40-practice')
  if (!el) return
  el.innerHTML = ''
  if (!_g40Gauntlet()) return          // levels only exist on beta and stall

  try {
    const saved = localStorage.getItem('qg_practice_noclip_g40')
    if (saved !== null) window.g40UseNoclip = saved === '1'
  } catch {}

  const clip = window.g40UseNoclip
  const tog = document.createElement('button')
  tog.className = 'pp-toggle' + (clip ? ' on' : '')
  tog.textContent = clip ? '\ud83d\udee1 Noclip ON — pillars won\u2019t kill'
                         : '\ud83d\udc80 Noclip OFF — pillars kill'
  tog.addEventListener('click', () => g40ToggleNoclip())
  el.appendChild(tog)

  try { G40.botMode = localStorage.getItem('qg_bot_g40') === '1' } catch {}
  const bot = document.createElement('button')
  bot.className = 'pp-toggle' + (G40.botMode ? ' bot' : '')
  bot.textContent = G40.botMode
    ? (G40.evil ? '\ud83d\ude08 EVILBOT ON — the clumsiest possible clear'
                : '\ud83e\udd16 Bot ON — watch the ideal line')
    : '\ud83e\udd16 Bot OFF — you fly'
  bot.addEventListener('click', () => g40ToggleBot())
  el.appendChild(bot)

  for (const key of ['easy','medium','hard','extreme']) {
    const arr = G40_POOL[key] || []
    if (!arr.length) continue
    const c = G40_DIFF_COL[key] || '#888'
    const row = document.createElement('div')
    row.className = 'pp-row'
    const tag = document.createElement('span')
    tag.className = 'pp-tag'; tag.style.color = c; tag.textContent = key.toUpperCase()
    row.appendChild(tag)
    // Real listeners, not inline onclick — a quoted name breaks the attribute
    const mk = (text, name, any) => {
      const b = document.createElement('button')
      b.className = 'pp-btn' + (any ? ' pp-any' : '')
      b.style.color = c
      b.style.borderColor = any ? c : c + '55'
      b.style.background = c + (any ? '28' : '18')
      b.textContent = text
      b.addEventListener('click', () => startUFOPractice(key, name))
      return b
    }
    row.appendChild(mk('Any', null, true))
    for (const lv of arr) row.appendChild(mk(lv.name, lv.name, false))
    el.appendChild(row)
  }
}

window.g40ToggleNoclip = function() {
  window.g40UseNoclip = !window.g40UseNoclip
  try { localStorage.setItem('qg_practice_noclip_g40', window.g40UseNoclip ? '1' : '0') } catch {}
  _g40BuildPracticeUI()
}
window.g40ToggleBot = function() {
  G40.botMode = !G40.botMode
  try { localStorage.setItem('qg_bot_g40', G40.botMode ? '1' : '0') } catch {}
  _g40BuildPracticeUI()
}
window.startUFOPractice = function(diff, name) {
  G40.multi = false
  G40.testLevel = null
  G40.practice = true
  G40.practiceDiff = diff || null
  G40.practiceLevel = name || null
  G40.noclip = window.g40UseNoclip !== false
  _g40Begin(true)
}

window.startUFOGame = function() {
  G40.multi = false; G40.testLevel = null; G40.noclip = false
  G40.practice = false; G40.practiceDiff = null; G40.practiceLevel = null
  _g40Begin()
}

// Editor test play: one specific level, walls optional
window.g40TestLevel = function(tmpl, noclip, bot) {
  G40.multi = false
  G40.botMode = !!bot
  G40.testLevel = tmpl || null
  G40.noclip = noclip !== false
  _g40Begin(true)
}
// Same-device versus: two UFOs, one level, first to clip a pillar loses
window.startUFO2P   = function() { G40.multi = true;  _g40Begin() }

function _g40Begin(forceGauntlet) {
  // A test level is always a gauntlet level, whatever site you are on
  G40.gauntlet = forceGauntlet || !!G40.testLevel || _g40Gauntlet()
  SFX.resume(); SFX.click()
  const c = _g40C()
  c.width  = c.parentElement.clientWidth
  c.height = c.parentElement.clientHeight
  document.getElementById('g40-overlay').style.display = 'none'
  document.getElementById('g40-over').style.display    = 'none'

  G40.stars = Array.from({length: 70}, () => ({
    x:   Math.random() * c.width,
    y:   Math.random() * c.height,
    r:   Math.random() * 1.4 + 0.3,
    spd: Math.random() * 28 + 8,
    a:   Math.random() * 0.5 + 0.4,
  }))

  G40.active   = true
  G40.phase    = 'playing'
  G40.y        = c.height / 2
  G40.vy       = 0
  G40.score    = 0
  G40.pipes    = []
  G40.speed    = G40_PIPE_SPD0
  G40.gap      = G40_PIPE_GAP0
  G40.deadT    = 0
  G40.showOver = false
  G40.p2y      = c.height / 2
  G40.p2vy     = 0
  G40.p1dead   = false
  G40.p2dead   = false
  G40.winner   = 0
  G40.scrollX  = 0
  G40.retrying = false
  G40.retryT   = 0
  G40.attempts = 0
  document.getElementById('g40-score-hud').textContent = '0'

  if (G40.gauntlet) _g40LoadLevel(c.width, c.height)
  else              _g40Spawn(c.width + G40_PIPE_W, c.height)

  c.addEventListener('click',      _g40Thrust)
  c.addEventListener('touchstart', _g40Thrust, { passive: false })
  window.addEventListener('keydown', _g40Key)

  G40.lastTime = performance.now()
  G40.raf = requestAnimationFrame(_g40Loop)
}

window.stopGame40 = function() {
  G40.active = false
  if (G40.raf) { cancelAnimationFrame(G40.raf); G40.raf = null }
  const c = _g40C()
  if (c) {
    c.removeEventListener('click',      _g40Thrust)
    c.removeEventListener('touchstart', _g40Thrust)
  }
  window.removeEventListener('keydown', _g40Key)
}

function _g40Key(e) {
  // preventDefault before the auto-repeat check — see the note in game43
  const ours = e.code === 'Space' || e.key === 'ArrowUp'
  if (ours) e.preventDefault()
  if (e.repeat) return
  if (e.code === 'Space') _g40DoThrust()
  else if (e.key === 'ArrowUp') { G40.multi ? _g40DoThrust2() : _g40DoThrust() }
}
function _g40DoThrust2() {
  if (G40.phase !== 'playing' || G40.p2dead) return
  G40.p2vy = G40_THRUST * (G40.gauntlet ? _g40C().height / 560 : 1)
  SFX.tap()
}
function _g40Thrust(e) { e.preventDefault(); _g40DoThrust() }
function _g40DoThrust() {
  if (G40.phase !== 'playing' || G40.p1dead) return
  G40.taps = (G40.taps || 0) + 1
  G40.vy = G40_THRUST * (G40.gauntlet ? _g40C().height / 560 : 1)
  SFX.tap()
}

function _g40Spawn(x, h) {
  const margin = Math.floor(h * 0.18)
  const range  = Math.floor(h * 0.64)
  const cy = margin + (range > 0 ? qRandInt(range + 1) : 0)
  G40.pipes.push({ x, cy, passed: false })
}

function _g40Loop(ts) {
  if (!G40.active) return
  // Hold the level still behind a clear card rather than running the next one
  if (G40.paused) {
    G40.lastTime = ts
    G40.raf = requestAnimationFrame(_g40Loop)
    return
  }
  const dt = Math.min((ts - G40.lastTime) / 1000, 0.05)
  G40.lastTime = ts

  const c = _g40C()
  const w = c.width, h = c.height
  const ufoX = w * 0.20
  // Gauntlet levels are authored as fractions of the canvas, but gravity and
  // thrust are absolute px/s^2 — so on a short window the UFO fell twice as
  // fast relative to the screen and half the levels became unclearable.
  // Scaling the physics with height makes a level play the same everywhere.
  // Endless mode keeps k = 1 so the main site is untouched.
  const k     = G40.gauntlet ? h / 560 : 1
  const GRAV  = G40_GRAV * k
  const RY    = G40_UFO_RY * k
  const RX    = G40_UFO_RX * k
  const spd   = G40.speed * k

  for (const s of G40.stars) {
    s.x -= s.spd * dt
    if (s.x < 0) { s.x = w + 2; s.y = Math.random() * h }
  }

  if (G40.portalFlash > 0) G40.portalFlash = Math.max(0, G40.portalFlash - dt)

  if (G40.retrying) {
    G40.retryT += dt
    if (G40.retryT >= G40_RETRY_WAIT) {
      G40.retrying = false
      G40.retryT   = 0
      _g40LoadLevel(w, h)
    }
    _g40Draw(c.getContext('2d'), w, h)
    G40.raf = requestAnimationFrame(_g40Loop)
    return
  }

  if (G40.phase === 'announce') {
    G40.announceT += dt
    if (G40.announceT >= 0.9) G40.phase = 'playing'

  } else if (G40.phase === 'cleared') {
    G40.clearedT += dt
    if (G40.clearedT >= 0.75) {
      G40.score++
      window._g40Score = G40.score
      document.getElementById('g40-score-hud').textContent = G40.score
      _g40LoadLevel(w, h)
    }

  } else if (G40.phase === 'playing') {
    // One simulation step, split out so bot mode can run it on a fixed
    // clock rather than the display's, which is what keeps a replayed plan
    // in step with the game.
    const playStep = (sdt) => {
      // Autopilot presses on the steps the plan says to
      if (G40.bot) {
        // Index by scroll, like Wave Gauntlet does. A portal jumps the scroll
        // forward and the plan is laid out against absolute steps, so a
        // running counter would drift out of step the moment one fires.
        const bstep = (G40.challenge ? G40.challenge.speed : 160) *
                      (G40.gauntlet ? h / 560 : 1) * G40_SIM_DT
        const bi = Math.min(G40.bot.flaps.length - 1,
                            Math.max(0, Math.round(G40.scrollX / bstep)))
        if (bi !== G40.bot.i && G40.bot.flaps[bi]) {
          G40.vy = G40_THRUST * (G40.gauntlet ? h / 560 : 1)
          G40.taps = (G40.taps || 0) + 1
          SFX.tap()
        }
        G40.bot.i = bi
      }
      if (!G40.p1dead) { G40.vy += GRAV * sdt; G40.y += G40.vy * sdt }
      if (G40.multi && !G40.p2dead) { G40.p2vy += GRAV * sdt; G40.p2y += G40.p2vy * sdt }

      for (const p of G40.pipes) p.x -= spd * sdt

      if (G40.gauntlet) {
        G40.scrollX += spd * sdt
        // Practice keeps the whole path so a clear can be drawn as one picture
        if (G40.practice || G40.testLevel) {
          const ft = G40.fullTrail
          if (!ft.length || G40.scrollX - ft[ft.length-1].sx >= 2) ft.push({ sx:G40.scrollX, y:G40.y })
        }
      } else {
        // Endless: a passed pillar is a point, and the run tightens as you go
        for (const p of G40.pipes) {
          if (!p.passed && p.x + G40_PIPE_W < ufoX - RX) {
            p.passed = true
            G40.score++
            window._g40Score = G40.score
            document.getElementById('g40-score-hud').textContent = G40.score
            G40.speed = G40_PIPE_SPD0 + G40.score * G40_ACCEL
            G40.gap   = Math.max(95, G40_PIPE_GAP0 - G40.score * 2.2)
          }
        }
        G40.pipes = G40.pipes.filter(p => p.x > -G40_PIPE_W - 20)
        const last = G40.pipes[G40.pipes.length - 1]
        if (!last || last.x < w - G40_PIPE_SEP) _g40Spawn(w + G40_PIPE_W, h)
      }

      // Portals. You have to hit the mouth, so it is something to aim for.
      // Checked before collision, so the pillar tested is the one you came
      // out beside. Pillars are laid out in screen space, so they shift by
      // the same amount the scroll jumps.
      if (G40.portalCool > 0) G40.portalCool -= spd * sdt
      if (G40.portals && G40.portals.length && G40.portalCool <= 0) {
        for (const p of G40.portals) {
          // Crossing the column is enough — no need to line up with anything
          if (Math.abs(G40.scrollX - p.at) > spd * sdt) continue
          const jump = p.toAt - G40.scrollX
          G40.scrollX = p.toAt
          for (const q of G40.pipes) q.x -= jump
          G40.y = Math.max(RY + 2, Math.min(h - RY - 2, p.toCf * h))
          G40.vy = 0
          G40.portalFlash = 0.3
          G40.portalCool = 40
          if (G40.multi) { G40.p2y = G40.y; G40.p2vy = 0 }
          SFX.powerup()
          break
        }
      }

      // Collision, checked per player so a 2P round can name a winner.
      // A pillar marked safe does not kill: you land on it and can sit there,
      // which is the point — it is somewhere to rest mid-level.
      const resolve = (y, vy) => {
        if (y - RY <= 0 || y + RY >= h) return { dead: true, y, vy }
        for (const p of G40.pipes) {
          const half = (p.gap != null ? p.gap : G40.gap) / 2
          const inX  = ufoX + RX > p.x && ufoX - RX < p.x + G40_PIPE_W
          if (!inX) continue
          if (y + RY > p.cy + half) {           // came down onto the lower pillar
            if (p.safe !== 'bottom') return { dead: true, y, vy }
            return { dead: false, y: p.cy + half - RY, vy: 0, rest: true }
          }
          if (y - RY < p.cy - half) {           // went up into the upper pillar
            if (p.safe !== 'top') return { dead: true, y, vy }
            return { dead: false, y: p.cy - half + RY, vy: 0, rest: true }
          }
        }
        return { dead: false, y, vy }
      }
      if (!G40.p1dead) {
        const r = resolve(G40.y, G40.vy)
        if (r.dead && G40.noclip) {
          // Editor test play: show the hit, keep flying
          G40.y = Math.max(RY + 2, Math.min(h - RY - 2, G40.y)); G40.vy = 0
        } else if (r.dead) { G40.p1dead = true; if (!G40.multi) _g40Die() }
        else { G40.y = r.y; G40.vy = r.vy }
      }
      if (G40.multi && !G40.p2dead) {
        const r = resolve(G40.p2y, G40.p2vy)
        if (r.dead) G40.p2dead = true
        else { G40.p2y = r.y; G40.p2vy = r.vy }
      }
      // 2P is a race: the first to clip a pillar loses the round outright
      if (G40.multi && (G40.p1dead || G40.p2dead)) {
        G40.winner = G40.p1dead && G40.p2dead ? 0 : (G40.p1dead ? 2 : 1)
        _g40Die()
      }

      if (G40.gauntlet && !G40.p1dead && G40.scrollX >= G40.clearAt) {
        G40.phase = 'cleared'; G40.clearedT = 0
        if (G40.practice || G40.testLevel) _g40TrailCard()
        SFX.win()
      }
    }

    if (G40.bot) {
      G40.simAcc = (G40.simAcc || 0) + dt
      let steps = 0
      while (G40.simAcc >= G40_SIM_DT && steps < G40_MAX_STEPS && G40.phase === 'playing') {
        G40.simAcc -= G40_SIM_DT
        steps++
        playStep(G40_SIM_DT)
      }
      if (steps >= G40_MAX_STEPS) G40.simAcc = 0
    } else {
      playStep(dt)
    }

  } else if (G40.phase === 'dead') {
    G40.vy   += GRAV * dt
    G40.y    += G40.vy * dt
    if (G40.multi) { G40.p2vy += GRAV * dt; G40.p2y += G40.p2vy * dt }
    G40.deadT += dt
    if (G40.deadT >= 1.5 && !G40.showOver) {
      G40.showOver = true
      window._g40Score = G40.score
      const s = G40.score
      let label
      if (G40.multi) label = G40.winner ? `Player ${G40.winner} wins — ${s} level${s !== 1 ? 's' : ''}`
                                        : `Draw — ${s} level${s !== 1 ? 's' : ''}`
      else if (G40.gauntlet) label = `${s} level${s !== 1 ? 's' : ''}`
      else label = `${s} pipe${s !== 1 ? 's' : ''}`
      document.getElementById('g40-final-score').textContent = label
      // The leaderboard counts pillars passed in the endless game. Gauntlet
      // mode scores cleared levels, which is a different scale entirely, so
      // it does not submit rather than mixing the two in one table.
      const sub = document.getElementById('g40-submit-btn')
      if (sub) sub.style.display = G40.gauntlet ? 'none' : ''
      document.getElementById('g40-over').style.display = 'flex'
    }
  }

  _g40Draw(c.getContext('2d'), w, h)

  if (G40.showOver) { G40.active = false; return }
  G40.raf = requestAnimationFrame(_g40Loop)
}

function _g40Die() {
  if (G40.phase === 'dead') return
  if (G40.retrying) return              // already mid-retry

  // Practice and editor test play restart the same level straight away.
  // Without this a crash in the editor just stopped, with nothing to click:
  // the game-over card only exists on the main page, not in the test host.
  if (G40.practice || G40.testLevel) {
    G40.attempts = (G40.attempts || 0) + 1
    G40.retrying = true
    G40.retryT   = 0
    G40.p1dead   = false
    SFX.die()
    return
  }

  G40.phase = 'dead'
  G40.deadT = 0
  G40.vy    = G40_THRUST * 0.45
  SFX.die()
  const c = _g40C()
  c.removeEventListener('click',      _g40Thrust)
  c.removeEventListener('touchstart', _g40Thrust)
  window.removeEventListener('keydown', _g40Key)
}

function _g40Draw(ctx, w, h) {
  ctx.save()
  ctx.shadowBlur = 0; ctx.shadowColor = 'transparent'

  // Background — read the theme directly; canvases get no CSS variables
  const _lt = typeof qgLight === 'function' && qgLight()
  ctx.fillStyle = _lt ? '#eef2fb' : '#030710'
  ctx.fillRect(0, 0, w, h)

  // Nebula glow
  const ng = ctx.createRadialGradient(w * 0.72, h * 0.38, 0, w * 0.72, h * 0.38, w * 0.55)
  ng.addColorStop(0, 'rgba(88,28,135,0.14)')
  ng.addColorStop(1, 'rgba(88,28,135,0)')
  ctx.fillStyle = ng
  ctx.fillRect(0, 0, w, h)

  // Stars
  for (const s of G40.stars) {
    ctx.globalAlpha = s.a
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
    ctx.fillStyle = _lt ? '#8a93b5' : '#ffffff'; ctx.fill()
  }
  ctx.globalAlpha = 1

  for (const p of G40.pipes) {
    const halfGap = (p.gap != null ? p.gap : G40.gap) / 2
    _g40DrawPipe(ctx, p.x, 0,              G40_PIPE_W, p.cy - halfGap,            true,  p.safe === 'top')
    _g40DrawPipe(ctx, p.x, p.cy + halfGap, G40_PIPE_W, h - (p.cy + halfGap), false, p.safe === 'bottom')
  }

  const ufoX  = w * 0.20
  const _mouth = (px, cy, half, col) => {
    ctx.save()
    ctx.strokeStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 12
    ctx.lineWidth = 3
    ctx.beginPath(); ctx.ellipse(px, cy, 7, half, 0, 0, Math.PI * 2); ctx.stroke()
    ctx.globalAlpha = 0.22; ctx.fillStyle = col; ctx.fill()
    ctx.globalAlpha = 1; ctx.shadowBlur = 0
    ctx.lineWidth = 4
    ctx.beginPath(); ctx.moveTo(px - 9, cy - half); ctx.lineTo(px + 9, cy - half); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(px - 9, cy + half); ctx.lineTo(px + 9, cy + half); ctx.stroke()
    ctx.restore()
  }
  for (const p of (G40.portals || [])) {
    const half = p.mouth * h / 2
    const ax = ufoX + (p.at - G40.scrollX)
    const bx = ufoX + (p.toAt - G40.scrollX)
    if (ax > -30 && ax < w + 30) _mouth(ax, p.cf * h, half, '#38bdf8')
    if (bx > -30 && bx < w + 30) _mouth(bx, p.toCf * h, half, '#f97316')
  }
  if (G40.portalFlash > 0) {
    ctx.fillStyle = `rgba(56,189,248,${Math.min(0.3, G40.portalFlash)})`
    ctx.fillRect(0, 0, w, h)
  }
  // Only the gauntlet has an end; the endless run never reaches one
  if (G40.gauntlet && G40.clearAt) _g40DrawFinish(ctx, ufoX + (G40.clearAt - G40.scrollX), h)
  const alpha = G40.phase === 'dead' ? Math.max(0.15, 1 - G40.deadT * 1.4) : 1
  const scale = G40.gauntlet ? h / 560 : 1
  if (G40.multi) {
    // P2 first so P1 reads on top when they overlap
    ctx.globalAlpha = G40.p2dead ? 0.28 : alpha
    _g40DrawUFO(ctx, ufoX, G40.p2y, scale, '#fb923c')
    ctx.globalAlpha = G40.p1dead ? 0.28 : alpha
    _g40DrawUFO(ctx, ufoX, G40.y, scale, '#22d3ee')
  } else {
    ctx.globalAlpha = alpha
    _g40DrawUFO(ctx, ufoX, G40.y, scale)
  }
  ctx.globalAlpha = 1

  // Score
  ctx.textAlign   = 'center'
  ctx.font        = 'bold 28px monospace'
  ctx.fillStyle   = 'rgba(255,255,255,0.92)'
  ctx.shadowColor = '#a855f7'; ctx.shadowBlur = 18
  ctx.fillText(G40.score, w / 2, 46)
  ctx.shadowBlur  = 0

  // Practice HUD — attempts, and what the bot is doing
  if (G40.practice || G40.testLevel) {
    ctx.textAlign = 'center'
    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = _lt ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.4)'
    ctx.fillText((G40.noclip ? 'PRACTICE \u00b7 NOCLIP' : 'PRACTICE') +
                 (G40.attempts ? '   att ' + G40.attempts : '') +
                 (G40.bot ? (G40.evil ? '   \ud83d\ude08 EVILBOT ' : '   \ud83e\udd16 BOT ') + G40.bot.taps + ' taps'
                          : (G40.botMode ? '   \ud83e\udd16 NO BOT LINE HERE' : '')), w/2, 18)
  }

  // Level announce
  if (G40.phase === 'announce' && G40.challenge) {
    const fade = Math.min(1, G40.announceT / 0.18)
    ctx.globalAlpha = fade
    ctx.fillStyle = 'rgba(3,7,16,.72)'
    ctx.fillRect(0, h / 2 - 62, w, 124)
    ctx.textAlign = 'center'
    ctx.font = 'bold 13px monospace'
    ctx.fillStyle = '#a855f7'
    ctx.fillText(G40.challenge.diff.toUpperCase() + (G40.hasPortal ? '  \u00b7  PORTAL' : ''),
                 w / 2, h / 2 - 22)
    ctx.font = 'bold 32px monospace'
    ctx.fillStyle = '#fff'
    ctx.shadowColor = '#a855f7'; ctx.shadowBlur = 20
    ctx.fillText(G40.challenge.name, w / 2, h / 2 + 16)
    ctx.shadowBlur = 0
    ctx.globalAlpha = 1
  }

  // 2P result
  if (G40.multi && G40.phase === 'dead' && G40.winner) {
    ctx.textAlign = 'center'
    ctx.font = 'bold 26px monospace'
    ctx.fillStyle = G40.winner === 1 ? '#22d3ee' : '#fb923c'
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 18
    ctx.fillText(`PLAYER ${G40.winner} WINS`, w / 2, h / 2)
    ctx.shadowBlur = 0
  }

  ctx.restore()
}

// `safe` draws the pillar green: landing on it is allowed, so it has to be
// obvious at a glance which side you can rest on and which will kill you.
function _g40DrawPipe(ctx, x, y, pw, ph, isTop, safe) {
  if (ph <= 0) return
  const capH = 18, capX = x - 5, capW = pw + 10
  const capY = isTop ? y + ph - capH : y
  const edge = safe ? '#22c55e' : '#a855f7'

  ctx.fillStyle = safe ? '#04140b' : '#06091a'
  ctx.fillRect(x, y, pw, ph)
  ctx.fillStyle = safe ? '#0a2a17' : '#0d1533'
  ctx.fillRect(capX, capY, capW, capH)

  ctx.strokeStyle = edge
  ctx.lineWidth   = 1.8
  ctx.shadowColor = edge; ctx.shadowBlur = safe ? 16 : 12
  ctx.strokeRect(x + 0.9, y, pw - 1.8, ph)
  ctx.strokeRect(capX + 0.9, capY, capW - 1.8, capH)
  ctx.shadowBlur  = 0

  ctx.fillStyle = safe ? 'rgba(34,197,94,0.16)' : 'rgba(168,85,247,0.10)'
  ctx.fillRect(x + 4, y, 7, ph)

  // A bright lip on the face you can actually stand on
  if (safe) {
    ctx.fillStyle = '#4ade80'
    ctx.shadowColor = '#4ade80'; ctx.shadowBlur = 14
    ctx.fillRect(capX, isTop ? capY + capH - 3 : capY, capW, 3)
    ctx.shadowBlur = 0
  }
}

// `scale` keeps the saucer in proportion with the gauntlet's scaled physics;
// `tint` distinguishes the two players in a same-device round.
function _g40DrawUFO(ctx, x, y, scale, tint) {
  const s  = scale || 1
  const rx = G40_UFO_RX * s, ry = G40_UFO_RY * s
  const hull = tint || '#a855f7'
  const edge = tint || '#c084fc'

  // Tractor beam
  const bGrad = ctx.createLinearGradient(x, y + ry, x, y + ry + 32)
  bGrad.addColorStop(0, tint ? tint + '48' : 'rgba(168,85,247,0.28)')
  bGrad.addColorStop(1, tint ? tint + '00' : 'rgba(168,85,247,0)')
  ctx.beginPath()
  ctx.moveTo(x - rx * 0.45, y + ry)
  ctx.lineTo(x - rx,        y + ry + 32)
  ctx.lineTo(x + rx,        y + ry + 32)
  ctx.lineTo(x + rx * 0.45, y + ry)
  ctx.closePath()
  ctx.fillStyle = bGrad; ctx.fill()

  // Saucer body
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
  ctx.fillStyle   = '#1e0d38'
  ctx.shadowColor = hull; ctx.shadowBlur = 28
  ctx.fill(); ctx.shadowBlur = 0
  ctx.strokeStyle = edge; ctx.lineWidth = 2
  ctx.shadowColor = hull; ctx.shadowBlur = 12
  ctx.stroke(); ctx.shadowBlur = 0

  // Dome
  ctx.beginPath()
  ctx.ellipse(x, y - ry * 0.15, rx * 0.48, ry * 1.15, 0, Math.PI, 0)
  ctx.fillStyle = 'rgba(168,85,247,0.30)'; ctx.fill()
  ctx.strokeStyle = 'rgba(216,180,254,0.6)'; ctx.lineWidth = 1.2; ctx.stroke()

  // Rim lights
  const rimColors = ['#fbbf24', '#4ade80', '#fbbf24', '#06b6d4', '#fbbf24']
  for (let i = 0; i < 5; i++) {
    const t  = Math.PI * 0.08 + (i / 4) * Math.PI * 0.84
    const lx = x + Math.cos(t) * rx * 0.76
    const ly = y + Math.sin(t) * ry * 0.6
    ctx.beginPath(); ctx.arc(lx, ly, 2.2, 0, Math.PI * 2)
    ctx.fillStyle   = rimColors[i]
    ctx.shadowColor = rimColors[i]; ctx.shadowBlur = 8
    ctx.fill(); ctx.shadowBlur = 0
  }
}

// evilbot: same line, most presses instead of fewest (practice only)
const game40_evilbot = (typeof makeEvilbot === 'function')
  ? makeEvilbot(() => cheatScreenActive('game40'), (on) => {
      G40.evil = on
      try { _g40BuildPracticeUI() } catch {}
    })
  : null

// A chequered band marking the finish, drawn at the clear column. Scrolls
// with the level like everything else, so it is genuinely the end line
// rather than an overlay that appears when you get there.
function _g40DrawFinish(ctx, x, h, cell) {
  if (x < -40 || x > 100000) return
  const c = cell || 13
  const cols = 2
  ctx.save()
  for (let r = 0; r * c < h + c; r++) {
    for (let q = 0; q < cols; q++) {
      ctx.fillStyle = ((r + q) % 2 === 0) ? 'rgba(255,255,255,0.92)' : 'rgba(10,10,14,0.92)'
      ctx.fillRect(x + q * c, r * c, c, c)
    }
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'
  ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.moveTo(x - 1, 0); ctx.lineTo(x - 1, h); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(x + cols * c + 1, 0); ctx.lineTo(x + cols * c + 1, h); ctx.stroke()
  ctx.restore()
}


// ── Clear card ────────────────────────────────────────
// The level laid out flat with the line you flew drawn over it, same idea
// as Wave Gauntlet's. Landable pillars are drawn green here too, so the
// picture shows which ones you were allowed to sit on.
function _g40TrailCard() {
  const src = _g40C()
  if (!src || G40.fullTrail.length < 2) return
  const H = src.height
  const cols = Math.max(1, G40.clearAt)
  const W = Math.round(Math.min(2400, Math.max(900, cols)))
  const sx = W / cols
  const top = 46
  const cv = document.createElement('canvas')
  cv.width = W; cv.height = H + top
  const g = cv.getContext('2d')
  const ch = G40.challenge || { name:'LEVEL', diff:'easy' }
  const col = (typeof G40_DIFF_COL !== 'undefined' && G40_DIFF_COL[ch.diff]) || '#a855f7'

  g.fillStyle = '#030710'; g.fillRect(0, 0, W, H + top)

  const PW = Math.max(3, G40_PIPE_W * sx)
  for (const p of G40.pipes) {
    // p.x has already scrolled, so recover the authored column
    const at = p.x + G40.scrollX - src.width * 0.20
    const x = at * sx
    const half = (p.gap != null ? p.gap : G40.gap) / 2
    const safeTop = p.safe === 'top', safeBot = p.safe === 'bottom'
    g.fillStyle = safeTop ? 'rgba(34,197,94,0.30)' : 'rgba(168,85,247,0.22)'
    g.fillRect(x - PW/2, top, PW, Math.max(0, p.cy - half))
    g.fillStyle = safeBot ? 'rgba(34,197,94,0.30)' : 'rgba(168,85,247,0.22)'
    g.fillRect(x - PW/2, top + p.cy + half, PW, Math.max(0, H - (p.cy + half)))
    g.strokeStyle = safeTop ? '#22c55e' : col; g.lineWidth = 1.4
    g.beginPath(); g.moveTo(x - PW/2, top + p.cy - half); g.lineTo(x + PW/2, top + p.cy - half); g.stroke()
    g.strokeStyle = safeBot ? '#22c55e' : col
    g.beginPath(); g.moveTo(x - PW/2, top + p.cy + half); g.lineTo(x + PW/2, top + p.cy + half); g.stroke()
  }

  const pts = G40.fullTrail.map(p => ({ x: p.sx * sx, y: top + p.y }))
  const stroke = () => {
    g.beginPath(); g.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y)
    g.stroke()
  }
  g.lineJoin = 'round'; g.lineCap = 'round'
  g.shadowColor = '#22d3ee'; g.shadowBlur = 12
  g.strokeStyle = 'rgba(34,211,238,0.30)'; g.lineWidth = 6; stroke()
  g.shadowBlur = 7
  g.strokeStyle = '#22d3ee'; g.lineWidth = 2; stroke()
  g.shadowBlur = 0

  g.textAlign = 'left'
  g.font = 'bold 20px monospace'; g.fillStyle = '#fff'
  g.fillText(ch.name, 16, 30)
  g.font = '12px monospace'; g.fillStyle = col
  g.fillText((ch.diff || '').toUpperCase(), 18 + g.measureText(ch.name).width + 90, 30)
  g.textAlign = 'right'
  g.fillStyle = 'rgba(255,255,255,0.45)'; g.font = '12px monospace'
  const att = G40.attempts ? (G40.attempts + 1) + ' attempts' : 'first try'
  const secs = G40.clearAt / (G40.speed || 160)
  g.fillText((G40.taps || 0) + ' taps  \u00b7  ' + att + '  \u00b7  ' + secs.toFixed(1) + 's  \u00b7  UFO Flap', W - 16, 30)

  const wrap = document.getElementById('g40-card')
  const img  = document.getElementById('g40-card-img')
  if (!wrap || !img) return
  try { img.src = cv.toDataURL('image/png') } catch { return }
  wrap.dataset.name = (ch.name || 'run').toLowerCase().replace(/[^a-z0-9]+/g, '-')
  wrap.style.display = 'flex'
  G40.paused = true
}

window.g40CloseCard = function() {
  const wrap = document.getElementById('g40-card')
  if (wrap) wrap.style.display = 'none'
  if (!G40.active || !G40.paused) return
  G40.paused = false
  G40.lastTime = performance.now()
  const c = _g40C()
  _g40LoadLevel(c.width, c.height)
}
window.g40SaveCard = function() {
  const img  = document.getElementById('g40-card-img')
  const wrap = document.getElementById('g40-card')
  if (!img || !img.src) return
  const a = document.createElement('a')
  a.href = img.src
  a.download = (wrap.dataset.name || 'run') + '-clear.png'
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
}
