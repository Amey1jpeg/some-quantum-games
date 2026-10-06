// ═══════════════════════════════════════════════════════
//  ENTANGLED GAUNTLET — horizontal runner
//  Quantum Entanglement meets Jet Rush. You (blue, top half) and your
//  twin (pink, bottom half) fly forward on their own; the camera follows.
//  Touch a spike and the run ends.
//    W / S   — mirrored: W thrusts each ship against its gravity, S with it
//    ↑ / ↓   — aligned: both move the same way, shifting how they line up
//    SPACE   — break the link: W/S moves only you, ↑/↓ moves only the twin
//  The ships have momentum: keys are thrust, so they fly in curved arcs.
//  Gravity: you (blue) are pulled up, the twin (pink) is pulled down, and
//  each keeps its own pull after a swap.
//  While linked, pushing the two together at the middle line swaps them:
//  each crosses into the other's half and keeps going the way it was.
//  Speed portals are optional: only a dot that flies through one changes
//  the speed, and it holds until the next portal you take.
//
//  The main mode is the Gauntlet: built-in levels back to back, drawn from
//  harder pools the more you clear (the same score gates as Wave Gauntlet).
//  One death ends the run; the score is how many levels you cleared.
//  Endless is an unscored side mode. Single levels are played from the
//  Practice picker (laid out like Wave Gauntlet's and Spider's): every level
//  is open, nothing is ever scored, and dying puts you back at the start.
//    Noclip   obstacles don't kill, hits are counted
//    Bot      flies the level with as few inputs as it can
//    Evilbot  flies the level making as many inputs as it can
//  The bots live in ascent-bot.js.
//
//  Modes: Gauntlet (the scored one), Endless (quantum-generated), Practice
//  (every level, always open), your own levels from the editor, and ?test=1
//  for the editor's Test Play.
//  Level format and generator live in ascent-levels.js.
// ═══════════════════════════════════════════════════════

const GA_FWD0      = 150    // endless: starting forward speed
const GA_FWD_MAX   = 330
// Applied to forward speed in every mode — the one dial for overall pace.
// Level speeds and generator spacing are untouched, so slowing down only
// ever leaves more room than a level was built for.
const GA_PACE      = 0.88
const GA_BREAK_DUR = 2.4
const GA_BREAK_CD  = 5.5
const GA_CAM_LEAD  = 0.28   // dots sit this far across the screen
const GA_BEST_KEY  = 'qg_ascent_best'
const GA_GBEST_KEY = 'qg_ascent_gauntlet_best'


// Quantum entropy: same pool and rejection sampling as core.js, which this
// standalone page doesn't load. Falls back to Math.random if unavailable.
let _gaBits = null, _gaBitPos = 0
async function gaLoadEntropy() {
  try {
    const res = await fetch('data/quantum.bin', { cache: 'force-cache' })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const b = new Uint8Array(await res.arrayBuffer())
    if (b.length) _gaBits = b
  } catch (e) { console.warn('Quantum data unavailable, using fallback PRNG:', e) }
  const dot = document.getElementById('ga-entropy-dot')
  const lbl = document.getElementById('ga-entropy-label')
  if (dot) dot.className = 'entropy-dot' + (_gaBits ? ' live' : '')
  if (lbl) lbl.textContent = _gaBits ? 'quantum bits' : 'local fallback'
}
function _gaBit() {
  const byte = _gaBits[(_gaBitPos >> 3) % _gaBits.length]
  const bit = (byte >> (7 - (_gaBitPos & 7))) & 1
  _gaBitPos = (_gaBitPos + 1) % (_gaBits.length * 8)
  return bit
}
function gaRand(max) {
  max = Math.floor(max)
  if (max <= 1) return 0
  if (!_gaBits) return Math.floor(Math.random() * max)
  const width = 32 - Math.clz32(max - 1)
  for (let t = 0; t < 64; t++) {
    let v = 0
    for (let i = 0; i < width; i++) v = (v << 1) | _gaBit()
    if (v < max) return v
  }
  return Math.floor(Math.random() * max)
}

const GA = {
  phase: 'idle', raf: null, last: 0,
  W: 0, H: AL_H, scale: 1,
  mode: 'gauntlet',         // 'gauntlet' | 'endless' | 'practice' | 'test'
  clears: 0,                // gauntlet: levels cleared this run
  level: null, gen: null,
  x: 0, camX: 0, fwd: GA_FWD0, mult: 1, multTarget: 1,
  py: 0, ty: 0,
  broken: false, breakT: 0, breakCD: 0,
  cols: [], blocks: [], portals: [], orbs: [], pending: [], saws: [], strips: [], triggers: [], forced: false,
  parts: [], stars: [], trail: [],
  score: 0, deadT: 0, shake: 0, flash: 0, banner: null,
  keys: {}, touches: new Map(),
}

let _gaCanvas, _gaCtx

function gaGBest() { try { return +localStorage.getItem(GA_GBEST_KEY) || 0 } catch { return 0 } }
function gaSetGBest(v) { try { localStorage.setItem(GA_GBEST_KEY, String(v)) } catch {} }
function gaBest() { try { return +localStorage.getItem(GA_BEST_KEY) || 0 } catch { return 0 } }
function gaSetBest(v) { try { localStorage.setItem(GA_BEST_KEY, String(v)) } catch {} }

const _gaQuery = new URLSearchParams(location.search)
const GA_TEST = _gaQuery.get('test') === '1'

function gaInit() {
  _gaCanvas = document.getElementById('ga-canvas')
  _gaCtx = _gaCanvas.getContext('2d')
  window.addEventListener('keydown', gaKd)
  window.addEventListener('keyup', e => { GA.keys[e.code] = false })
  window.addEventListener('blur', () => { GA.keys = {} })
  for (const ev of ['touchstart', 'touchmove', 'touchend', 'touchcancel'])
    _gaCanvas.addEventListener(ev, gaTouch, { passive: false })
  window.addEventListener('resize', () => { if (GA.phase !== 'playing') { gaSize(); gaDrawBlank() } })
  gaLoadEntropy()
  gaSize(); gaDrawBlank()
  if (GA_TEST) {
    document.querySelectorAll('.ga-back').forEach(b => {
      b.textContent = '← Back to editor'
      b.onclick = () => { location.href = 'editor.html?game=ascent' }
    })
  }
  gaShowMenu()
}

function gaSize() {
  const arena = _gaCanvas.parentElement
  _gaCanvas.width  = arena.clientWidth  || 900
  _gaCanvas.height = arena.clientHeight || 520
  GA.scale = _gaCanvas.height / AL_H
  GA.W = _gaCanvas.width / GA.scale
}

function gaDrawBlank() {
  _gaCtx.setTransform(1, 0, 0, 1, 0, 0)
  _gaCtx.fillStyle = '#05050f'; _gaCtx.fillRect(0, 0, _gaCanvas.width, _gaCanvas.height)
}

function gaKd(e) {
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault()
  GA.keys[e.code] = true
  if (e.code === 'Space' && GA.phase === 'playing') gaBreak()
  if (e.code === 'Enter' && GA.phase === 'over') gaRetry()
  if (e.code === 'Escape' && GA.phase === 'playing') { gaEndRun(); gaShowMenu() }
}

function gaTouch(e) {
  e.preventDefault()
  const rect = _gaCanvas.getBoundingClientRect()
  GA.touches.clear()
  for (const t of e.touches) GA.touches.set(t.identifier, {
    x: (t.clientX - rect.left) * (GA.W / rect.width),
    y: (t.clientY - rect.top)  * (AL_H / rect.height),
  })
}

window.gaBreak = function() {
  if (GA.phase !== 'playing' || GA.broken || GA.breakCD > 0) return
  GA.broken = true; GA.breakT = GA_BREAK_DUR; GA.breakCD = GA_BREAK_CD
  if (typeof SFX !== 'undefined') SFX.whoosh()
}

// ── Menu ─────────────────────────────────────────────────
function _gaEsc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])) }

// ── Practice picker ──────────────────────────────────────
// Same layout and classes as the Wave Gauntlet / Spider pickers: toggles on
// top, then one row per difficulty with a button per level.
const GA_PRAC_KEY = 'qg_ascent_practice'
const gaPrac = { noclip: true, bot: false, evil: false }
try { Object.assign(gaPrac, JSON.parse(localStorage.getItem(GA_PRAC_KEY) || '{}')) } catch {}
window.gaTogglePrac = function(k) {
  gaPrac[k] = !gaPrac[k]
  if (k === 'evil' && gaPrac.evil) gaPrac.bot = true        // Evilbot is a kind of bot
  if (k === 'bot' && !gaPrac.bot) gaPrac.evil = false
  try { localStorage.setItem(GA_PRAC_KEY, JSON.stringify(gaPrac)) } catch {}
  gaBuildPractice()
}

function gaBuildPractice() {
  const el = document.getElementById('ga-practice'); if (!el) return
  el.innerHTML = ''
  const toggle = (key, cls, on, off, title) => {
    const b = document.createElement('button')
    b.className = 'pp-toggle' + (gaPrac[key] ? ' ' + cls : '')
    b.textContent = gaPrac[key] ? on : off
    b.title = title
    b.addEventListener('click', () => gaTogglePrac(key))
    el.appendChild(b)
  }
  toggle('bot', 'bot', '\ud83e\udd16 Bot ON — watch it fly the level', '\ud83e\udd16 Bot OFF — you play',
    'Flies the level with as few inputs as it can. Portals and swapping are off for bot runs.')
  toggle('evil', 'bot', '\ud83d\ude08 Evilbot ON — as many inputs as possible', '\ud83d\ude08 Evilbot OFF',
    'Same level, but the bot changes input whenever it safely can.')
  toggle('noclip', 'on', '\ud83d\udee1 Noclip ON — spikes won\u2019t kill', '\ud83d\udc80 Noclip OFF — spikes kill',
    'Either way, practice never counts towards the leaderboard')

  const row = (label, col, levels, any) => {
    if (!levels.length) return
    const mk = (text, get, isAny) => {
      const b = document.createElement('button')
      b.className = 'pp-btn' + (isAny ? ' pp-any' : '')
      b.style.color = col; b.style.borderColor = isAny ? col : col + '55'; b.style.background = col + (isAny ? '28' : '18')
      b.textContent = text
      b.addEventListener('click', () => gaPlayPractice(get))
      return b
    }
    const tier = document.createElement('span'); tier.className = 'pp-tier'; tier.style.color = col; tier.textContent = label
    const box = document.createElement('span'); box.className = 'pp-levels'
    if (any) box.appendChild(mk('Any', () => levels[gaRand(levels.length)], true))
    for (const l of levels) box.appendChild(mk(l.name, () => l, false))
    const r = document.createElement('div'); r.className = 'pp-row'; r.appendChild(tier); r.appendChild(box)
    el.appendChild(r)
  }
  if (GA_TEST) { const t = gaTestLevel(); if (t) row('Test', '#22d3ee', [t], false); return }
  const all = alBuiltinLevels()
  for (const d of AL_DIFFS) row(d.id === 'fp' ? 'Frame P.' : d.label, d.col, all.filter(l => l.diff === d.id), true)
  row('Yours', '#22d3ee', alLoadDrafts().map(alCleanLevel).filter(Boolean), false)
}

// Start a practice run. `get` returns the level, so "Any" re-rolls on retry.
window.gaPlayPractice = function(get) {
  const lv = get(); if (!lv) return
  GA.mode = 'practice'; GA.pracGet = get; GA.attempts = 1; _gaPracticeNext = true
  gaStart(lv)
}
// Dying in practice puts you straight back at the start of the same level
function gaRespawn() {
  GA.attempts++; _gaPracticeNext = true
  gaStart(GA.level)
}
let _gaPracticeNext = false

function gaShowMenu() {
  GA.phase = 'idle'
  gaBuildPractice()
  document.getElementById('ga-over').classList.remove('show')
  document.getElementById('ga-overlay').style.display = 'flex'
  document.getElementById('ga-endless-best').textContent = gaBest()
  const gb = document.getElementById('ga-gauntlet-best'); if (gb) gb.textContent = gaGBest()
  const cust = document.getElementById('ga-custom')
  cust.innerHTML = '<div class="ga-sub">Make your own levels in the <a href="editor.html?game=ascent">level editor</a> — they show up under Practice.</div>'

  if (GA_TEST) {
    const t = gaTestLevel()
    cust.innerHTML = t ? `<div class="ga-sub">Testing “${_gaEsc(t.name)}”</div>` : '<div class="ga-sub">No test level found.</div>'
    document.getElementById('ga-endless-row').style.display = 'none'
    document.getElementById('ga-test-row').style.display = t ? 'flex' : 'none'
  }
}

function gaDiffBadge(id) {
  const d = alDiff(id)
  return `<em class="ga-diff" style="color:${d.col};border-color:${d.col}66">${d.label}</em>`
}

function gaTestLevel() {
  try { return alCleanLevel(JSON.parse(localStorage.getItem(AL_TEST_KEY) || 'null')) } catch { return null }
}

// ── Gauntlet ─────────────────────────────────────────────
// Which levels the next one is drawn from, by how many you have cleared.
// These are Wave Gauntlet's score gates (_g43GetPool), tier for tier; this
// game has no boss tier yet, so its slots fall through to what exists.
function gaGauntletPool(clears) {
  const all = alBuiltinLevels(), T = d => all.filter(l => l.diff === d)
  const easy = T('easy'), medium = T('medium'), hard = T('hard'), extreme = T('extreme'), fp = T('fp')
  let pool
  if      (clears < 3)  pool = easy
  else if (clears < 5)  pool = [...easy, ...medium]
  else if (clears < 9)  pool = [...medium, ...hard, ...extreme.slice(0, 1)]
  else if (clears < 13) pool = [...hard, ...extreme]
  else if (clears < 17) pool = extreme
  else                  pool = fp
  if (!pool.length) pool = extreme.length ? extreme : all      // a tier with nothing in it yet
  return pool
}
function gaGauntletNext() {
  let pool = gaGauntletPool(GA.clears)
  if (pool.length > 1 && GA.level) pool = pool.filter(l => l.name !== GA.level.name)   // never the same level twice running
  const lv = pool[gaRand(pool.length)]
  if (!lv) return gaPlayEndless()                              // no built-in levels at all
  const cleared = GA.clears
  gaStart(lv)
  GA.banner = { text: (cleared ? '✓ ' + cleared + ' · ' : '') + lv.name + ' — ' + alDiff(lv.diff).label.toUpperCase(), col: alDiff(lv.diff).col, t: 2.4 }
}
window.gaPlayGauntlet = function() { GA.mode = 'gauntlet'; GA.clears = 0; GA.level = null; gaGauntletNext() }
window.gaPlayEndless = function() { GA.mode = 'endless'; gaStart(null) }
window.gaPlayTest = function() { const lv = gaTestLevel(); if (lv) { GA.mode = 'test'; gaStart(lv) } }
window.gaRetry = function() {
  if (GA.mode === 'test') gaPlayTest()
  else if (GA.mode === 'practice') gaPlayPractice(GA.pracGet)
  else if (GA.mode === 'endless') gaPlayEndless()
  else gaPlayGauntlet()
}
window.gaMenu = function() { gaEndRun(); gaShowMenu() }

// ── Run setup ────────────────────────────────────────────
function gaStart(level) {
  if (typeof SFX !== 'undefined') { SFX.resume(); SFX.click() }
  gaSize()
  document.getElementById('ga-overlay').style.display = 'none'
  document.getElementById('ga-over').classList.remove('show')
  Object.assign(GA, {
    phase: 'playing', level, gen: null,
    x: 0, camX: -GA.W * GA_CAM_LEAD, fwd: level ? level.speed : GA_FWD0, mult: 1, multTarget: 1,
    py: AL_HALF * 0.5, ty: AL_HALF * 1.5, swapped: false, swapCD: 0, pv: 0, tv: 0,
    broken: false, breakT: 0, breakCD: 0,
    cols: [], blocks: [], portals: [], orbs: [], pending: [], saws: [], strips: [], triggers: [], forced: false,
    parts: [], trail: [],
    score: 0, deadT: 0, shake: 0, flash: 0, banner: null,
    submit: 0,   // what Submit Score sends; set when the run ends
    keys: {},
  })
  GA.touches.clear()
  GA.stars = Array.from({ length: 70 }, () => ({
    x: Math.random() * GA.W, y: Math.random() * AL_H,
    r: Math.random() * 1.3 + 0.2, par: Math.random() * 0.5 + 0.1, a: Math.random() * 0.45 + 0.25,
  }))
  GA.endX = level ? alEndX(level) : Infinity
  // Practice: never scored. Noclip turns deaths into counted hits; the bots
  // plan the whole level first, and a bot run is always noclip so that a
  // rare clipped corner shows up as a hit instead of ending the demo.
  GA.practice = _gaPracticeNext; _gaPracticeNext = false
  GA.hits = 0; GA.hitNow = false; GA.plan = null; GA.evil = false
  GA.noclip = GA.practice && gaPrac.noclip
  if (GA.practice && gaPrac.bot) {
    GA.plan = typeof abPlan === 'function' ? abPlan(level, GA.W, level.speed * GA_PACE) : null
    if (GA.plan) { GA.evil = gaPrac.evil; GA.noclip = true }
    else GA.banner = { text: 'Bot found no route — you fly', col: '#facc15', t: 2.5 }
  }
  if (level) GA.pending = level.objects.map(o => Object.assign({}, o)).sort((a, b) => a.x - b.x)
  else { GA.gen = alGenerator(gaRand, {}); GA.gen.x = 900 }
  const gauntlet = GA.mode === 'gauntlet'
  document.getElementById('ga-score-label').textContent = gauntlet ? 'Clears' : level ? 'Progress' : 'Columns'
  document.getElementById('ga-score').textContent = gauntlet ? GA.clears : level ? '0%' : '0'
  cancelAnimationFrame(GA.raf)
  GA.last = performance.now()
  GA.raf = requestAnimationFrame(gaLoop)
}

function gaEndRun() { cancelAnimationFrame(GA.raf); GA.raf = null; GA.phase = 'idle'; GA.keys = {} }

// Move objects that are about to come on screen into the live arrays
function gaFeed() {
  const horizon = GA.camX + GA.W + 200
  if (GA.gen) {
    while (GA.gen.x < horizon + 400) GA.gen.next(Math.min(GA_FWD_MAX, GA.fwd + 60))
    GA.pending.push(...GA.gen.objs.splice(0))
  }
  while (GA.pending.length && GA.pending[0].x - 120 < horizon) {
    const o = GA.pending.shift()
    if (o.t === 'col') GA.cols.push({ x: o.x, w: o.w || AL_COL_W, gaps: [o.top, o.bot], desync: alIsDesync(o), passed: false })
    else if (o.t === 'block') {
      const inTop = o.y < AL_HALF
      GA.blocks.push({ x: o.x, y: o.y, s: AL_BLOCK, vy: o.slide || 0, dir: 1,
        lo: (inTop ? 0 : AL_HALF) + AL_BLOCK / 2 + 4, hi: (inTop ? AL_HALF : AL_H) - AL_BLOCK / 2 - 4 })
    }
    else if (o.t === 'portal') GA.portals.push({ x: o.x, y: o.y, kind: o.kind, used: false })
    else if (o.t === 'orb') GA.orbs.push({ x: o.x, y: o.y, type: o.kind })
    else if (o.t === 'saw') GA.saws.push({ x: o.x, y: o.y, r: o.r || AL_SAW_R })
    else if (o.t === 'strip') GA.strips.push({ x: o.x, len: o.len, edge: o.edge })
    else if (o.t === 'trigger') GA.triggers.push({ x: o.x, mode: o.mode, fired: false })
  }
  if (GA.gen) GA.pending.sort((a, b) => a.x - b.x)
}

// ── Main loop ────────────────────────────────────────────
function gaLoop(ts) {
  const dt = Math.min((ts - GA.last) / 1000, 0.05)
  GA.last = ts
  if (GA.phase === 'playing') gaUpdate(dt)
  else if (GA.phase === 'dead' || GA.phase === 'won') {
    GA.deadT += dt
    if (GA.phase === 'won') { const v = GA.fwd * GA.mult * GA_PACE; GA.x += v * dt; GA.camX += v * dt * 0.4 }
    for (const p of GA.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 300 * dt; p.life -= dt }
    GA.parts = GA.parts.filter(p => p.life > 0)
    if (GA.shake > 0) GA.shake = Math.max(0, GA.shake - dt * 30)
    if (GA.phase === 'dead' && GA.practice) { if (GA.deadT > 0.55) return gaRespawn() }
    else if (GA.phase === 'won' && GA.mode === 'gauntlet') { if (GA.deadT > 0.7) return gaGauntletNext() }   // straight into the next level
    else if (GA.deadT > 1.1) gaShowOver()
  }
  if (GA.phase === 'idle') return
  gaDraw()
  if (GA.phase !== 'over') GA.raf = requestAnimationFrame(gaLoop)
}

function gaUpdate(dt) {
  const H = AL_H, half = AL_HALF

  if (!GA.level) GA.fwd = Math.min(GA_FWD_MAX, GA_FWD0 + GA.score * 4)
  GA.mult += (GA.multTarget - GA.mult) * Math.min(1, dt * 8)
  const v = GA.fwd * GA.mult * GA_PACE
  GA.x += v * dt
  GA.camX = GA.x - GA.W * GA_CAM_LEAD
  for (const s of GA.stars) {
    s.x -= v * s.par * dt
    if (s.x < 0) { s.x = GA.W + 2; s.y = Math.random() * H }
  }
  GA.trail.push({ x: GA.x, py: GA.py, ty: GA.ty })
  if (GA.trail.length > 14) GA.trail.shift()

  if (GA.broken) { GA.breakT -= dt; if (GA.breakT <= 0) GA.broken = false }
  if (GA.breakCD > 0) GA.breakCD = Math.max(0, GA.breakCD - dt)
  if (GA.shake > 0) GA.shake = Math.max(0, GA.shake - dt * 30)
  if (GA.flash > 0) GA.flash = Math.max(0, GA.flash - dt * 3)
  if (GA.banner) { GA.banner.t -= dt; if (GA.banner.t <= 0) GA.banner = null }
  for (const tr of GA.triggers) if (!tr.fired && GA.x >= tr.x) {
    tr.fired = true
    if (tr.mode === 'finish') continue        // handled by the end-of-level check below
    GA.forced = tr.mode === 'desync'
    GA.banner = GA.forced
      ? { text: '⚡ DESYNC — W/S you · ↑/↓ twin', col: '#f87171', t: 1.6 }
      : { text: '🔗 RE-ENTANGLED', col: '#a78bfa', t: 1.2 }
    if (typeof SFX !== 'undefined') SFX.whoosh()
  }

  // Input. Positive = down the screen.
  const k = GA.keys
  // W is the thrust key: it pushes each ship against its own gravity (blue
  // down, pink up — toward each other from their home sides). S is the
  // opposite, pushing with gravity.
  const mir = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0)
  const ali = (k.ArrowDown ? 1 : 0) - (k.ArrowUp ? 1 : 0)    // ↑/↓
  let pdy, tdy
  if (GA.broken || GA.forced) { pdy = mir; tdy = ali }
  else           { pdy = mir + ali; tdy = -mir + ali }
  // A finger steers whichever dot is in the half it touches
  for (const t of GA.touches.values()) {
    const blue = (t.y < half) !== GA.swapped
    if (blue) pdy = Math.abs(t.y - GA.py) > 6 ? Math.sign(t.y - GA.py) : 0
    else      tdy = Math.abs(t.y - GA.ty) > 6 ? Math.sign(t.y - GA.ty) : 0
  }
  pdy = Math.max(-1, Math.min(1, pdy)); tdy = Math.max(-1, Math.min(1, tdy))
  if (GA.plan) [pdy, tdy] = abControl(GA.plan, GA.evil, GA.x, GA.py, GA.pv, GA.ty, GA.tv)

  // Thrust + gravity → velocity. Gravity belongs to the ship, not the half:
  // blue falls up, pink falls down.
  const lim = v => Math.max(-AL_VMAX, Math.min(AL_VMAX, v))
  GA.pv = lim(GA.pv + (pdy * AL_THRUST - AL_GRAV) * dt)
  GA.tv = lim(GA.tv + (tdy * AL_THRUST + AL_GRAV) * dt)

  // Swap: while linked, whenever the two meet at the middle line moving
  // toward each other they pass through and trade halves — whichever colour
  // is on which side, and whether thrust or gravity brought them together.
  // Each keeps its own controls, speed and gravity, so a swapped pair falls
  // back through the line to its home side unless you hold it apart. Not in
  // desync sections.
  if (GA.swapCD > 0) GA.swapCD -= dt
  const closing = Math.sign(GA.pv) === Math.sign(GA.ty - GA.py) && Math.sign(GA.tv) === Math.sign(GA.py - GA.ty)
  if (!GA.plan && !GA.broken && !GA.forced && GA.swapCD <= 0 && closing &&
      // reach ahead by this frame's travel, so they cross at speed instead of bumping the line first
      Math.abs(GA.ty - GA.py) < AL_R * 2 + 8 + (Math.abs(GA.pv) + Math.abs(GA.tv)) * dt) {
    const y = GA.py; GA.py = GA.ty; GA.ty = y
    GA.swapped = !GA.swapped
    GA.swapCD = 0.2
    GA.flash = Math.max(GA.flash, 0.6)
    gaBurst(GA.x, half, '#c4b5fd', 10)
    if (typeof SFX !== 'undefined') SFX.whoosh()
  }

  // Velocity → position. Each ship stays in the half it is currently in,
  // and stops dead against an edge.
  const move = (y, v, top) => {
    const lo = top ? AL_R : half + AL_R + 2, hi = top ? half - AL_R - 2 : H - AL_R
    const ny = y + v * dt
    return ny < lo ? [lo, Math.max(0, v)] : ny > hi ? [hi, Math.min(0, v)] : [ny, v]
  }
  ;[GA.py, GA.pv] = move(GA.py, GA.pv, !GA.swapped)
  ;[GA.ty, GA.tv] = move(GA.ty, GA.tv, GA.swapped)

  gaFeed()

  for (const c of GA.cols) {
    if (!c.passed && c.x + c.w / 2 < GA.x - AL_R) {
      c.passed = true
      GA.score++
      if (!GA.level) document.getElementById('ga-score').textContent = GA.score
      if (typeof SFX !== 'undefined') SFX.tick()
    }
  }
  for (const b of GA.blocks) if (b.vy) {
    b.y += b.vy * b.dir * dt
    if (b.y < b.lo) { b.y = b.lo; b.dir = 1 }
    if (b.y > b.hi) { b.y = b.hi; b.dir = -1 }
  }
  const off = c => c.x - GA.camX > -80
  GA.cols = GA.cols.filter(off); GA.blocks = GA.blocks.filter(off)
  GA.portals = GA.portals.filter(off); GA.orbs = GA.orbs.filter(off)
  GA.saws = GA.saws.filter(off); GA.triggers = GA.triggers.filter(t => t.x - GA.camX > -80 || !t.fired)
  GA.strips = GA.strips.filter(st => st.x + st.len - GA.camX > -80)

  // Portals: only a dot that actually flies through one takes effect
  for (const p of GA.portals) {
    if (p.used || GA.plan) continue
    const inX = Math.abs(GA.x - p.x) < AL_PORTAL_W / 2 + AL_R
    const hit = inX && (Math.abs(GA.py - p.y) < AL_PORTAL_H / 2 + AL_R - 4 || Math.abs(GA.ty - p.y) < AL_PORTAL_H / 2 + AL_R - 4)
    if (!hit) continue
    p.used = true
    GA.multTarget = AL_MULT[p.kind]
    GA.banner = { text: p.kind === 'fast' ? '»» FAST ×1.45' : p.kind === 'slow' ? '«« SLOW ×0.65' : '= NORMAL SPEED', col: AL_PORTAL_COL[p.kind], t: 1.2 }
    if (typeof SFX !== 'undefined') SFX.powerup()
    gaBurst(p.x, GA.py < half && Math.abs(GA.py - p.y) < AL_PORTAL_H ? GA.py : GA.ty, AL_PORTAL_COL[p.kind], 12)
  }

  GA.orbs = GA.orbs.filter(o => {
    const hitP = Math.hypot(GA.x - o.x, GA.py - o.y) < AL_R + 10
    const hitT = Math.hypot(GA.x - o.x, GA.ty - o.y) < AL_R + 10
    if (!hitP && !hitT) return true
    if (o.type === 'gold') { GA.score += GA.broken ? 5 : 10; if (!GA.level) document.getElementById('ga-score').textContent = GA.score }
    if (o.type === 'green') GA.breakCD = 0
    if (typeof SFX !== 'undefined') SFX.coin()
    GA.flash = 1
    gaBurst(o.x, o.y, o.type === 'gold' ? '#fde68a' : '#86efac', 10)
    return false
  })

  if (GA.level) {
    const pct = Math.max(0, Math.min(100, Math.floor(GA.x / GA.endX * 100)))
    if (GA.mode !== 'gauntlet') document.getElementById('ga-score').textContent = pct + '%'
    if (GA.x >= GA.endX) {
      if (GA.mode === 'gauntlet') { GA.clears++; document.getElementById('ga-score').textContent = GA.clears }
      return gaWin()
    }
  }

  const hit = GA.cols.some(c => gaHitsCol(c, GA.x, GA.py) || gaHitsCol(c, GA.x, GA.ty)) ||
    GA.blocks.some(b => gaHitsBlock(b, GA.x, GA.py) || gaHitsBlock(b, GA.x, GA.ty)) ||
    GA.saws.some(w => Math.hypot(GA.x - w.x, GA.py - w.y) < w.r + AL_R - 3 || Math.hypot(GA.x - w.x, GA.ty - w.y) < w.r + AL_R - 3) ||
    GA.strips.some(st => { const r = alStripRect(st); return _gaCircleRect(GA.x, GA.py, ...r) || _gaCircleRect(GA.x, GA.ty, ...r) })
  if (GA.noclip) {
    // Noclip never ends a run: count each separate touch instead
    if (hit && !GA.hitNow) { GA.hits++; GA.shake = 6; if (typeof SFX !== 'undefined') SFX.error() }
    GA.hitNow = hit
  } else if (hit) return gaDie()
}

function gaColRects(c) {
  const x = c.x - c.w / 2
  const [[ta, tb], [ba, bb]] = c.gaps
  return [[x, 0, c.w, ta], [x, tb, c.w, AL_HALF - tb], [x, AL_HALF, c.w, ba - AL_HALF], [x, bb, c.w, AL_H - bb]]
}

function _gaCircleRect(x, y, rx, ry, rw, rh) {
  if (rw <= 0 || rh <= 0) return false
  const rr = AL_R - 2   // a little forgiveness on the spike tips
  const cx = Math.max(rx, Math.min(x, rx + rw)), cy = Math.max(ry, Math.min(y, ry + rh))
  return (x - cx) ** 2 + (y - cy) ** 2 < rr * rr
}
function gaHitsCol(c, x, y) { return gaColRects(c).some(r => _gaCircleRect(x, y, ...r)) }
function gaHitsBlock(b, x, y) { return _gaCircleRect(x, y, b.x - b.s / 2, b.y - b.s / 2, b.s, b.s) }

function gaBurst(x, y, col, n) {
  for (let i = 0; i < n; i++) GA.parts.push({
    x, y, vx: (Math.random() - 0.3) * 260, vy: (Math.random() - 0.5) * 260, life: 0.6 + Math.random() * 0.4, col,
  })
}

function gaDie() {
  GA.phase = 'dead'; GA.deadT = 0; GA.shake = 14
  if (typeof SFX !== 'undefined') SFX.die()
  gaBurst(GA.x, GA.py, '#60a5fa', 16)
  gaBurst(GA.x, GA.ty, '#f9a8d4', 16)
}

function gaWin() {
  GA.phase = 'won'; GA.deadT = 0
  if (typeof SFX !== 'undefined') SFX.win()
  for (const c of ['#60a5fa', '#f9a8d4', '#fde68a']) gaBurst(GA.x, AL_HALF, c, 14)
}

function gaShowOver() {
  const won = GA.phase === 'won'
  GA.phase = 'over'
  const title = document.getElementById('ga-over-title')
  const final = document.getElementById('ga-final')
  const sub   = document.getElementById('ga-final-best')
  const btns  = document.getElementById('ga-over-btns')
  let html = ''
  if (GA.mode === 'gauntlet') {
    const best = Math.max(gaGBest(), GA.clears)
    gaSetGBest(best)
    title.textContent = 'Decohered!'
    final.textContent = GA.clears
    sub.innerHTML = `level${GA.clears === 1 ? '' : 's'} cleared · fell on ${_gaEsc(GA.level.name)} ${gaDiffBadge(GA.level.diff)}<br>` +
      (GA.clears >= best && GA.clears > 0 ? 'New best!' : 'Best: ' + best)
  } else if (GA.level) {
    const pct = won ? 100 : Math.max(0, Math.min(99, Math.floor(GA.x / GA.endX * 100)))
    title.textContent = won ? 'Level complete!' : 'Decohered!'
    final.textContent = pct + '%'
    sub.innerHTML = _gaEsc(GA.level.name) + ' ' + gaDiffBadge(GA.level.diff)
  } else {
    const best = GA.practice ? gaBest() : Math.max(gaBest(), GA.score)
    if (!GA.practice) gaSetBest(best)
    title.textContent = 'Decohered!'
    final.textContent = GA.score
    sub.textContent = GA.score >= best && GA.score > 0 ? 'New best!' : 'Best: ' + best
  }
  // Submit Score, same as every other game. Custom and test levels are
  // whatever the player made them, so they never count.
  const medal = document.getElementById('ga-medal-display'); if (medal) medal.innerHTML = ''
  if (GA.practice) {
    // Nothing from a practice run is saved or submitted
    title.textContent = GA.plan ? (GA.evil ? 'Evilbot run' : 'Bot run') : won ? 'Practice clear!' : 'Practice run'
    sub.innerHTML += '<br>' + [GA.plan ? GA.plan.inputs + ' inputs' : '', GA.noclip ? GA.hits + ' hit' + (GA.hits === 1 ? '' : 's') : '', 'not scored'].filter(Boolean).join(' · ')
  } else if (GA.mode === 'gauntlet' && typeof openSubmit === 'function') {
    GA.submit = GA.clears
    const n = gaLeaderboardScore()
    html += `<button class="btn-primary" style="background:#a78bfa;border-color:#a78bfa;color:#13092b" onclick="openSubmit('ascent')">Submit Score</button><br><br>`
    if (typeof renderMedalDisplay === 'function') renderMedalDisplay('ga-medal-display', 'ascent', n)
  }
  html += `<button class="btn-primary" onclick="gaRetry()">${won ? 'Play again' : 'Retry'}</button><br><br>`
  html += GA_TEST
    ? `<button class="btn-back" onclick="location.href='editor.html?game=ascent'">← Back to editor</button>`
    : `<button class="btn-back" onclick="gaMenu()">☰ Menu</button>`
  btns.innerHTML = html
  document.getElementById('ga-over').classList.add('show')
}

// ── Drawing ──────────────────────────────────────────────
function gaDraw() {
  const ctx = _gaCtx, W = GA.W, H = AL_H, half = AL_HALF
  const sx = x => x - GA.camX
  ctx.setTransform(GA.scale, 0, 0, GA.scale, 0, 0)
  ctx.save()
  if (GA.shake > 0) ctx.translate((Math.random() - 0.5) * GA.shake, (Math.random() - 0.5) * GA.shake)

  ctx.fillStyle = '#05050f'; ctx.fillRect(-20, -20, W + 40, H + 40)
  for (const s of GA.stars) {
    ctx.globalAlpha = s.a; ctx.fillStyle = '#fff'
    ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill()
  }
  ctx.globalAlpha = 1

  const unlinked = GA.broken || GA.forced
  ctx.strokeStyle = unlinked ? '#ef4444' : 'rgba(139,92,246,0.45)'
  ctx.lineWidth = unlinked ? 2 : 1.5
  ctx.setLineDash(unlinked ? [6, 5] : [])
  ctx.beginPath(); ctx.moveTo(0, half); ctx.lineTo(W, half); ctx.stroke()
  ctx.setLineDash([])

  if (GA.level) gaDrawFinish(ctx, sx(GA.endX), H)
  for (const p of GA.portals) gaDrawPortal(ctx, sx(p.x), p.y, p.kind, p.used)

  for (const c of GA.cols) {
    const col = c.desync ? '#ef4444' : '#a78bfa'
    for (const [rx, ry, rw, rh] of gaColRects(c)) if (rh > 0) gaSpikes(ctx, sx(rx), ry, rw, rh, col, false)
    if (c.desync) {
      ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#fca5a5'
      ctx.fillText('⚡ DESYNC', sx(c.x), half - 6)
    }
  }
  for (const b of GA.blocks) gaSpikes(ctx, sx(b.x) - b.s / 2, b.y - b.s / 2, b.s, b.s, '#f97316', true)
  for (const st of GA.strips) gaDrawStrip(ctx, st, sx(st.x))
  for (const w of GA.saws) gaDrawSaw(ctx, sx(w.x), w.y, w.r)
  for (const tr of GA.triggers) gaDrawTrigger(ctx, sx(tr.x), tr.mode, tr.fired)

  for (const o of GA.orbs) {
    const col = o.type === 'gold' ? '#fbbf24' : '#22c55e'
    ctx.beginPath(); ctx.arc(sx(o.x), o.y, 9, 0, Math.PI * 2)
    ctx.fillStyle = col; ctx.shadowBlur = 12; ctx.shadowColor = col; ctx.fill(); ctx.shadowBlur = 0
    ctx.fillStyle = '#fff'; ctx.font = '9px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(o.type === 'gold' ? '★' : '⚡', sx(o.x), o.y + 3)
  }

  const alive = GA.phase === 'playing' || GA.phase === 'won'
  if (alive) {
    for (let i = 0; i < GA.trail.length; i++) {
      const t = GA.trail[i]
      ctx.globalAlpha = (i / GA.trail.length) * 0.35
      ctx.fillStyle = '#3b82f6'; ctx.beginPath(); ctx.arc(sx(t.x), t.py, AL_R * 0.7, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#ec4899'; ctx.beginPath(); ctx.arc(sx(t.x), t.ty, AL_R * 0.7, 0, Math.PI * 2); ctx.fill()
    }
    ctx.globalAlpha = 1
    if (!unlinked) {
      const pulse = 0.45 + 0.25 * Math.sin(performance.now() / 160)
      ctx.strokeStyle = `rgba(167,139,250,${pulse})`; ctx.lineWidth = 2.5
      ctx.shadowBlur = 8; ctx.shadowColor = '#a78bfa'
      const midX = sx(GA.x) + Math.sin(performance.now() / 260) * 18
      ctx.beginPath(); ctx.moveTo(sx(GA.x), GA.py); ctx.quadraticCurveTo(midX, half, sx(GA.x), GA.ty); ctx.stroke()
      ctx.shadowBlur = 0
    }
    gaShip(ctx, sx(GA.x), GA.py, '#3b82f6', '#93c5fd', -1, GA.pv / AL_VMAX)
    gaShip(ctx, sx(GA.x), GA.ty, '#ec4899', '#f9a8d4', 1, GA.tv / AL_VMAX)
  }

  for (const p of GA.parts) {
    ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.col
    ctx.beginPath(); ctx.arc(sx(p.x), p.y, 3, 0, Math.PI * 2); ctx.fill()
  }
  ctx.globalAlpha = 1
  if (GA.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${GA.flash * 0.06})`; ctx.fillRect(0, 0, W, H) }
  ctx.restore()

  // HUD
  if (GA.level) {
    const pw = Math.min(360, W * 0.4), px = (W - pw) / 2
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(px, 10, pw, 4)
    ctx.fillStyle = '#a78bfa'; ctx.fillRect(px, 10, pw * Math.min(1, Math.max(0, GA.x / GA.endX)), 4)
  }
  const bw = 170, bx = W - bw - 16, by = 22
  ctx.fillStyle = 'rgba(5,5,15,0.6)'; ctx.fillRect(bx - 8, by - 8, bw + 16, 34)
  ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(bx, by, bw, 5)
  let label
  if (GA.forced) {
    ctx.fillStyle = '#ef4444'; ctx.fillRect(bx, by, bw, 5)
    label = 'DESYNC · W/S you · ↑/↓ twin'
  } else if (GA.broken) {
    ctx.fillStyle = '#f97316'; ctx.fillRect(bx, by, bw * (GA.breakT / GA_BREAK_DUR), 5)
    label = 'BROKEN · W/S you · ↑/↓ twin'
  } else if (GA.breakCD > 0) {
    ctx.fillStyle = 'rgba(99,102,241,0.6)'; ctx.fillRect(bx, by, bw * (1 - GA.breakCD / GA_BREAK_CD), 5)
    label = 'ENTANGLED · recharging'
  } else {
    ctx.fillStyle = '#22d3ee'; ctx.fillRect(bx, by, bw, 5)
    label = 'ENTANGLED · SPACE to break'
  }
  ctx.textAlign = 'center'; ctx.font = '10px monospace'; ctx.fillStyle = 'rgba(226,232,240,0.7)'
  ctx.fillText(label, bx + bw / 2, by + 19)

  if (GA.practice) {
    const txt = GA.plan ? `${GA.evil ? '😈 EVILBOT' : '🤖 BOT'} · inputs ${GA.plan.inputs}${GA.hits ? ' · hits ' + GA.hits : ''}`
              : GA.noclip ? `PRACTICE · NOCLIP · hits ${GA.hits}` : `PRACTICE · attempt ${GA.attempts || 1}`
    ctx.textAlign = 'left'; ctx.font = 'bold 13px monospace'
    ctx.fillStyle = GA.hitNow || GA.evil ? '#f87171' : '#38bdf8'
    ctx.fillText(txt, 16, 52)
  }
  if (Math.abs(GA.mult - 1) > 0.05 && alive) {
    ctx.textAlign = 'left'; ctx.font = 'bold 14px monospace'
    ctx.fillStyle = GA.mult > 1 ? '#fb923c' : '#22d3ee'
    ctx.fillText('×' + GA.mult.toFixed(2) + ' speed', 16, 30)
  }
  if (GA.banner) {
    ctx.globalAlpha = Math.min(1, GA.banner.t * 2)
    ctx.textAlign = 'center'; ctx.font = 'bold 22px monospace'; ctx.fillStyle = GA.banner.col
    ctx.shadowBlur = 14; ctx.shadowColor = GA.banner.col
    ctx.fillText(GA.banner.text, W / 2, 52); ctx.shadowBlur = 0; ctx.globalAlpha = 1
  }
  if (GA.score < 3 && GA.phase === 'playing' && GA.x < 1200) {
    ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(167,139,250,0.75)'; ctx.font = '12px monospace'
    ctx.fillText('W = thrust · S = other way · ↑/↓ = move both together · portals are optional', W / 2, H - 14)
  }
}

function gaDrawPortal(ctx, x, y, kind, used) {
  const col = AL_PORTAL_COL[kind]
  ctx.save()
  ctx.globalAlpha = used ? 0.25 : 1
  ctx.strokeStyle = col; ctx.lineWidth = 4
  ctx.shadowBlur = used ? 0 : 16; ctx.shadowColor = col
  ctx.beginPath(); ctx.ellipse(x, y, AL_PORTAL_W / 2, AL_PORTAL_H / 2, 0, 0, Math.PI * 2); ctx.stroke()
  ctx.shadowBlur = 0
  ctx.fillStyle = col; ctx.globalAlpha *= 0.15
  ctx.fill()
  ctx.globalAlpha = used ? 0.3 : 1
  ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center'; ctx.fillStyle = col
  ctx.fillText(kind === 'fast' ? '»»' : kind === 'slow' ? '««' : '==', x, y + 4)
  ctx.font = '9px monospace'
  ctx.fillText(kind.toUpperCase(), x, y - AL_PORTAL_H / 2 - 6)
  ctx.restore()
}

function gaDrawStrip(ctx, st, x) {
  const [, y, w, h] = alStripRect(st)
  const down = st.edge === 'top' || st.edge === 'midbot'      // teeth point away from what they're attached to
  const baseY = down ? y : y + h - 5
  ctx.fillStyle = '#0b0b1e'; ctx.fillRect(x, baseY, w, 5)
  ctx.fillStyle = '#f43f5e'; ctx.shadowBlur = 8; ctx.shadowColor = '#f43f5e'
  const n = Math.max(1, Math.round(w / 14)), sw = w / n
  for (let i = 0; i < n; i++) {
    const tx = x + i * sw
    ctx.beginPath()
    if (down) { ctx.moveTo(tx, y + 5); ctx.lineTo(tx + sw / 2, y + h); ctx.lineTo(tx + sw, y + 5) }
    else      { ctx.moveTo(tx, y + h - 5); ctx.lineTo(tx + sw / 2, y); ctx.lineTo(tx + sw, y + h - 5) }
    ctx.fill()
  }
  ctx.shadowBlur = 0
}

function gaDrawSaw(ctx, x, y, r) {
  const a = performance.now() / 160
  ctx.save(); ctx.translate(x, y); ctx.rotate(a)
  ctx.fillStyle = '#94a3b8'; ctx.shadowBlur = 10; ctx.shadowColor = '#e2e8f0'
  ctx.beginPath()
  const teeth = 12
  for (let i = 0; i < teeth * 2; i++) {
    const rr = i % 2 ? r * 0.78 : r, an = (i / (teeth * 2)) * Math.PI * 2
    ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr)
  }
  ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0
  ctx.fillStyle = '#1e293b'; ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
}

function gaDrawTrigger(ctx, x, mode, fired) {
  if (mode === 'finish') return               // drawn as the finish line
  const col = mode === 'desync' ? '#f87171' : '#a78bfa'
  ctx.globalAlpha = fired ? 0.15 : 0.55
  ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash([2, 6])
  ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, AL_H); ctx.stroke(); ctx.setLineDash([])
  ctx.fillStyle = col; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'left'
  ctx.fillText(mode === 'desync' ? '⚡ DESYNC ▶' : '🔗 SYNC ▶', x + 4, AL_HALF + 14)
  ctx.globalAlpha = 1
}

function gaDrawFinish(ctx, x, H) {
  const sq = 12
  for (let y = 0, i = 0; y < H; y += sq, i++) {
    ctx.fillStyle = i % 2 ? '#e2e8f0' : '#1e1b4b'; ctx.fillRect(x, y, sq, sq)
    ctx.fillStyle = i % 2 ? '#1e1b4b' : '#e2e8f0'; ctx.fillRect(x + sq, y, sq, sq)
  }
}

function gaSpikes(ctx, x, y, w, h, col, block) {
  ctx.fillStyle = '#0b0b1e'; ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = col; ctx.lineWidth = 1.5
  ctx.shadowBlur = 10; ctx.shadowColor = col
  ctx.strokeRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5)
  ctx.shadowBlur = 0
  ctx.fillStyle = col
  const tooth = 8
  const n = Math.max(1, Math.floor(h / tooth)), st = h / n
  for (let i = 0; i < n; i++) {
    const ty = y + i * st
    ctx.beginPath(); ctx.moveTo(x, ty); ctx.lineTo(x - 6, ty + st / 2); ctx.lineTo(x, ty + st); ctx.fill()
    ctx.beginPath(); ctx.moveTo(x + w, ty); ctx.lineTo(x + w + 6, ty + st / 2); ctx.lineTo(x + w, ty + st); ctx.fill()
  }
  if (block) {
    const m = Math.max(1, Math.floor(w / tooth)), sw = w / m
    for (let i = 0; i < m; i++) {
      const tx = x + i * sw
      ctx.beginPath(); ctx.moveTo(tx, y); ctx.lineTo(tx + sw / 2, y - 6); ctx.lineTo(tx + sw, y); ctx.fill()
      ctx.beginPath(); ctx.moveTo(tx, y + h); ctx.lineTo(tx + sw / 2, y + h + 6); ctx.lineTo(tx + sw, y + h); ctx.fill()
    }
  }
}

// A small ship flying right. grav: -1 = falls up, 1 = falls down — the ship
// is drawn belly-toward-gravity, so blue flies upside down and you can read
// each one's pull at a glance. tilt (-1..1) noses it toward where it is
// heading (its vertical speed). The hit area is still the AL_R circle around (x, y).
function gaShip(ctx, x, y, fill, ring, grav, tilt) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate((tilt || 0) * 0.6)
  ctx.scale(1, grav)                       // flip so the fin points away from gravity
  // Engine flame
  const fl = 9 + Math.random() * 7
  const g = ctx.createLinearGradient(-AL_R, 0, -AL_R - fl, 0)
  g.addColorStop(0, 'rgba(253,224,71,0.95)'); g.addColorStop(1, 'rgba(249,115,22,0)')
  ctx.fillStyle = g
  ctx.beginPath(); ctx.moveTo(-AL_R + 2, -4); ctx.lineTo(-AL_R - fl, 0); ctx.lineTo(-AL_R + 2, 4); ctx.closePath(); ctx.fill()
  // Hull
  ctx.beginPath()
  ctx.moveTo(AL_R + 4, 0)                  // nose
  ctx.lineTo(1, -6); ctx.lineTo(-AL_R + 1, -7)
  ctx.lineTo(-AL_R - 2, -AL_R - 2)         // tail fin
  ctx.lineTo(-AL_R + 3, -2)
  ctx.lineTo(-AL_R, 0)
  ctx.lineTo(-AL_R + 1, 7); ctx.lineTo(2, 6)
  ctx.closePath()
  ctx.fillStyle = fill; ctx.shadowBlur = 12; ctx.shadowColor = ring; ctx.fill()
  ctx.shadowBlur = 0; ctx.strokeStyle = ring; ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.stroke()
  // Cockpit
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.beginPath(); ctx.ellipse(3, -1.5, 4, 2.4, 0, 0, Math.PI * 2); ctx.fill()
  ctx.restore()
}

// ── Site integration ─────────────────────────────────────
// This used to be its own page, so it set itself up on DOMContentLoaded.
// As a section in index.html it has to start when the player opens it and
// stop when they leave, like every other game.
let _gaReady = false

window.initGame48 = function() {
  if (!_gaReady) { gaInit(); _gaReady = true }
  else { gaSize(); gaDrawBlank(); gaShowMenu() }
}

window.stopGame48 = function() {
  GA.phase = 'menu'
  GA.keys = {}
  if (GA.raf) { cancelAnimationFrame(GA.raf); GA.raf = null }
}

// What the leaderboard ranks: levels cleared in the Gauntlet run just played
// — one number from one run, like Wave Gauntlet. Endless and Practice never
// score.
window.gaLeaderboardScore = function() { return Math.max(0, GA.submit || 0) }
