// ═══════════════════════════════════════════════════════
//  GAME 44 — SPIDER
//  GD-inspired: tap to snap between floor & ceiling.
//  Challenge-based like Wave Gauntlet. Score = clears.
// ═══════════════════════════════════════════════════════

const SPD_R   = 9    // spider body radius
const SPD_OBW = 26   // obstacle block width
const SPD_RETRY_WAIT = 0.45   // seconds you see the death before it resets

// ── Challenge pool ────────────────────────────────────

const SPD_POOL = {
  easy: [
    {
      name:'FIRST STEPS', diff:'easy', speed:155,
      gen(h) {
        let col = 240, floor = true
        const obs = []
        for (let i = 0; i < 5; i++) {
          obs.push({ col, floor })
          floor = !floor; col += 195 + qRandInt(50)
        }
        return { clearAt: col + 250, obstacles: obs }
      }
    },
    {
      name:'WARM UP', diff:'easy', speed:178,
      gen(h) {
        let col = 220, floor = qRandInt(2) === 0
        const obs = []
        for (let i = 0; i < 8; i++) {
          obs.push({ col, floor })
          floor = !floor; col += 160 + qRandInt(45)
        }
        return { clearAt: col + 220, obstacles: obs }
      }
    },
  ],

  medium: [
    {
      name:'RHYTHM', diff:'medium', speed:248,
      gen(h) {
        // Evenly spaced — find the beat
        let col = 220, floor = qRandInt(2) === 0
        const obs = []
        for (let i = 0; i < 11; i++) {
          obs.push({ col, floor })
          floor = !floor; col += 128
        }
        return { clearAt: col + 220, obstacles: obs }
      }
    },
    {
      name:'SHUFFLE', diff:'medium', speed:265,
      gen(h) {
        // Irregular gaps — disrupts rhythm
        let col = 220, floor = qRandInt(2) === 0
        const obs = []
        const gaps = [100,145,100,160,95,155,95,145,100,140,100,155]
        for (let i = 0; i < 12; i++) {
          obs.push({ col, floor })
          floor = !floor; col += gaps[i] + qRandInt(20)
        }
        return { clearAt: col + 220, obstacles: obs }
      }
    },
    {
      name:'SPRINT', diff:'medium', speed:295,
      gen(h) {
        // Gradually tightening spacing
        let col = 220, floor = qRandInt(2) === 0
        const obs = []
        for (let i = 0; i < 13; i++) {
          obs.push({ col, floor })
          floor = !floor; col += Math.max(95, 148 - i * 4) + qRandInt(18)
        }
        return { clearAt: col + 220, obstacles: obs }
      }
    },
  ],

  hard: [
    {
      name:'BURST', diff:'hard', speed:325,
      gen(h) {
        // 3 bursts of 4 tight blocks — intense then relief
        let col = 230, floor = qRandInt(2) === 0
        const obs = []
        for (let b = 0; b < 3; b++) {
          for (let i = 0; i < 4; i++) {
            obs.push({ col, floor })
            floor = !floor; col += 88
          }
          col += 165
        }
        return { clearAt: col + 220, obstacles: obs }
      }
    },
    {
      name:'RAPID FIRE', diff:'hard', speed:355,
      gen(h) {
        // 16 continuous rapid blocks
        let col = 220, floor = qRandInt(2) === 0
        const obs = []
        for (let i = 0; i < 16; i++) {
          obs.push({ col, floor })
          floor = !floor; col += 82 + qRandInt(14)
        }
        return { clearAt: col + 220, obstacles: obs }
      }
    },
    {
      name:'SURGE', diff:'hard', speed:392,
      gen(h) {
        // 4 waves of 5 — fast, no mercy between waves
        let col = 230, floor = qRandInt(2) === 0
        const obs = []
        for (let b = 0; b < 4; b++) {
          for (let i = 0; i < 5; i++) {
            obs.push({ col, floor })
            floor = !floor; col += 78
          }
          col += 145
        }
        return { clearAt: col + 220, obstacles: obs }
      }
    },
  ],

  extreme: [
    {
      name:'GAUNTLET', diff:'extreme', speed:440,
      gen(h) {
        // 24 blocks, extremely tight
        let col = 220, floor = qRandInt(2) === 0
        const obs = []
        for (let i = 0; i < 24; i++) {
          obs.push({ col, floor })
          floor = !floor; col += 72 + qRandInt(10)
        }
        return { clearAt: col + 220, obstacles: obs }
      }
    },
    {
      name:'NO MERCY', diff:'extreme', speed:460,
      gen(h) {
        // Two waves of 15 at max speed
        let col = 220, floor = qRandInt(2) === 0
        const obs = []
        for (let b = 0; b < 2; b++) {
          for (let i = 0; i < 15; i++) {
            obs.push({ col, floor })
            floor = !floor; col += 70 + qRandInt(8)
          }
          col += 120
        }
        return { clearAt: col + 220, obstacles: obs }
      }
    },
  ],
}

const SPD_DIFF_COL = { easy:'#4ade80', medium:'#fbbf24', hard:'#f87171', extreme:'#c084fc' }

// ── Editor-published levels ───────────────────────────

function _spdCustomAll() {
  return (window.QG_CUSTOM_LEVELS && window.QG_CUSTOM_LEVELS.spider) || []
}

// Names of built-ins that a published edit replaces
function _spdOverridden() {
  return new Set(_spdCustomAll().map(l => l.overrides).filter(Boolean))
}

// Strip built-ins that have been overridden by an edited version
function _spdB(arr) {
  const ov = _spdOverridden()
  return ov.size ? arr.filter(t => !ov.has(t.name)) : arr
}

// Published levels → pool templates (data becomes a gen() fn)
function _spdCustom(diff, score) {
  return _spdCustomAll().filter(l => {
    if (l.diff !== diff || !Array.isArray(l.obstacles)) return false
    if (score == null) return true
    if ((l.minScore ?? 0) > score) return false
    if ((l.maxScore ?? 0) > 0 && score > l.maxScore) return false
    return true
  }).map(l => ({
    name:l.name, diff:l.diff, speed:l.speed, custom:true,
    weight: l.weight ?? 1,
    gen() {
      return { clearAt:l.clearAt, obstacles:l.obstacles.map(o => ({ ...o })), deco:l.deco || [] }
    },
  }))
}

function _spdCustomEligible(score) {
  const out = []
  for (const d of ['easy','medium','hard','extreme']) out.push(..._spdCustom(d, score))
  return out
}

// Weighted random pick — weight 1 is normal, 3 is 3× as likely
function _spdPick(pool) {
  if (!pool.length) return null
  const total = pool.reduce((s, t) => s + (t.weight ?? 1), 0)
  if (total <= 0) return pool[qRandInt(pool.length)]
  let r = (qRandInt(10000) / 10000) * total
  for (const t of pool) {
    r -= (t.weight ?? 1)
    if (r <= 0) return t
  }
  return pool[pool.length - 1]
}

function _spdGetPool(score) {
  const {easy, medium, hard, extreme} = SPD_POOL
  const B = _spdB
  let builtins
  if      (score < 3)  builtins = [...B(easy)]
  else if (score < 6)  builtins = [...B(easy), ...B(medium)]
  else if (score < 11) builtins = [...B(medium), ...B(hard)]
  else if (score < 16) builtins = [...B(hard)]
  else                 builtins = [...B(hard), ...B(extreme)]
  return [...builtins, ..._spdCustomEligible(score)]
}

// ── State ─────────────────────────────────────────────

const _NO_CHEAT_SPD = { on:false, mul:1, feed:() => false, reset() {}, label:() => '' }
const SPD_cheat = (typeof makeCheat === 'function')
  ? makeCheat('speedhack', () => cheatScreenActive('game44'))
  : _NO_CHEAT_SPD

const _SPD = {
  active:false, phase:'idle',
  onFloor:true,
  botMode:false, bot:null, evil:false,
  paused:false, taps:0,
  scrollX:0, speed:0,
  score:0,
  challenge:null, clearAt:0,
  obstacles:[], deco:[],
  trail:[], threads:[],
  announceT:0, clearedT:0, t:0,
  // Gauntlet runs roll one level into the next like Wave Gauntlet: the next
  // level is built early and drawn past the flag, the last one trails off
  // behind you, and the name fades in over the top as you cross.
  nextLv:null, prevLv:null, banner:null,
  shake:0, hitFlash:0,
  // practice = never scores. noclip = blocks don't kill. Separate flags.
  practice:false, noclip:false,
  practiceDiff:null, practiceLevel:null, testLevel:null, attempts:0,
  retrying:false, retryT:0,
  deadT:0, showOver:false,
  raf:null, lastTime:0,
}
window._spdScore = 0

let _spdCvs = null
function _spdC() {
  if (!_spdCvs) _spdCvs = document.getElementById('spd-canvas')
  return _spdCvs
}

// Generated from SPD_POOL so new levels always appear here
function _spdBuildPracticeUI() {
  const el = document.getElementById('spd-practice')
  if (!el) return
  const label = { easy:'Easy', medium:'Medium', hard:'Hard', extreme:'Extreme' }
  el.innerHTML = ''

  try {
    const saved = localStorage.getItem('qg_practice_noclip_spd')
    if (saved !== null) window.spdUseNoclip = saved === '1'
  } catch {}

  const on = window.spdUseNoclip
  const tog = document.createElement('button')
  tog.className = 'pp-toggle' + (on ? ' on' : '')
  tog.textContent = on ? '🛡 Noclip ON — blocks won\'t kill' : '💀 Noclip OFF — blocks kill'
  tog.title = 'Either way, practice never counts towards the leaderboard'
  tog.addEventListener('click', () => spdToggleNoclip())
  el.appendChild(tog)

  try { _SPD.botMode = localStorage.getItem('qg_bot_spd') === '1' } catch {}
  const bot = document.createElement('button')
  bot.className = 'pp-toggle' + (_SPD.botMode ? ' bot' : '')
  bot.textContent = _SPD.botMode
    ? (_SPD.evil ? '\ud83d\ude08 EVILBOT ON — the worst possible clear' : '\ud83e\udd16 Bot ON — watch the ideal line')
    : '\ud83e\udd16 Bot OFF — you play'
  bot.title = 'Flips at the columns the solver works out'
  bot.addEventListener('click', () => spdToggleBot())
  el.appendChild(bot)

  for (const key of ['easy','medium','hard','extreme']) {
    const arr = SPD_POOL[key] || []
    if (!arr.length) continue
    const c = SPD_DIFF_COL[key] || '#888'

    // Real listeners, not inline onclick — see the note in game43.js
    const mk = (text, name, any) => {
      const b = document.createElement('button')
      b.className = 'pp-btn' + (any ? ' pp-any' : '')
      b.style.color       = c
      b.style.borderColor = any ? c : c + '55'
      b.style.background  = c + (any ? '28' : '18')
      b.textContent = text
      b.addEventListener('click', () => startSpiderPractice(key, name))
      return b
    }

    const tier = document.createElement('span')
    tier.className = 'pp-tier'; tier.style.color = c
    tier.textContent = label[key] || key

    const levels = document.createElement('span')
    levels.className = 'pp-levels'
    levels.appendChild(mk('Any', null, true))
    for (const t of arr) levels.appendChild(mk(t.name, t.name, false))

    const row = document.createElement('div')
    row.className = 'pp-row'
    row.appendChild(tier); row.appendChild(levels)
    el.appendChild(row)
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    try { _spdBuildPracticeUI() } catch (e) { console.error('practice picker:', e) }
  })
}

async function initSpider() {
  try { _spdBuildPracticeUI() } catch (e) { console.error('practice picker:', e) }
  stopSpider(); _spdCvs = null
  document.getElementById('spd-overlay').style.display = 'flex'
  document.getElementById('spd-over').style.display    = 'none'
  await initCurby()
}
window.initSpider = initSpider
window.initGame44 = initSpider
window.stopGame44 = function() { stopSpider() }

function _spdStart(practice, practiceDiff, noclip) {
  SFX.resume(); SFX.click()
  const c = _spdC()
  c.width  = c.parentElement.clientWidth
  c.height = c.parentElement.clientHeight
  document.getElementById('spd-overlay').style.display = 'none'
  document.getElementById('spd-over').style.display    = 'none'

  if (!practice) SPD_cheat.reset()

  Object.assign(_SPD, {
    active:true, score:0, shake:0, hitFlash:0, deadT:0, showOver:false,
    practice:!!practice, noclip:practice ? (noclip !== false) : false,
    practiceDiff:practiceDiff||null, attempts:0, retrying:false, retryT:0,
    practiceLevel:_SPD.practiceLevel || null,
    testLevel:_SPD.testLevel || null,
  })
  window._spdScore = 0
  document.getElementById('spd-score-hud').textContent = practice ? '—' : '0'

  _spdLoadChallenge()

  window.addEventListener('keydown', _spdKeyDn)
  c.addEventListener('mousedown',  _spdInput, {passive:false})
  c.addEventListener('touchstart', _spdInput, {passive:false})

  _SPD.lastTime = performance.now()
  _SPD.raf = requestAnimationFrame(_spdLoop)
}
window.startSpider = function() { _SPD.testLevel = null; _SPD.practiceLevel = null; _spdStart(false, null) }

window.spdUseNoclip = true
window.spdToggleBot = function() {
  _SPD.botMode = !_SPD.botMode
  try { localStorage.setItem('qg_bot_spd', _SPD.botMode ? '1' : '0') } catch {}
  _spdBuildPracticeUI()
}

window.spdToggleNoclip = function() {
  window.spdUseNoclip = !window.spdUseNoclip
  // Save BEFORE rebuilding: the builder re-reads this key, so rebuilding
  // first would immediately overwrite the flip with the old value.
  try { localStorage.setItem('qg_practice_noclip_spd', window.spdUseNoclip ? '1' : '0') } catch {}
  _spdBuildPracticeUI()
}

// name omitted -> random within the tier; name given -> that level on repeat
window.startSpiderPractice = function(d, name, noclip) {
  _SPD.testLevel     = null
  _SPD.practiceLevel = name || null
  _spdStart(true, d, noclip === undefined ? window.spdUseNoclip : noclip)
}

// Editor / review test play. Practice rules, noclip optional.
window.spdTestLevel = function(tmpl, noclip, bot) {
  _SPD.botMode = !!bot
  _SPD.testLevel = tmpl
  _spdStart(true, null, noclip === undefined ? true : noclip)
}

window.stopSpider = function() {
  _SPD.active = false
  if (_SPD.raf) { cancelAnimationFrame(_SPD.raf); _SPD.raf = null }
  const c = _spdC()
  if (c) {
    c.removeEventListener('mousedown',  _spdInput)
    c.removeEventListener('touchstart', _spdInput)
  }
  window.removeEventListener('keydown', _spdKeyDn)
}

// Pick and generate a level without touching the run, so the one after this
// can be built early and drawn past the finish line. `score` is the gate to
// draw from — one higher for the next level, since this one will be cleared
// by the time it arrives.
function _spdBuildChallenge(score) {
  const c    = _spdC()
  let pool = _SPD.testLevel
    ? [_SPD.testLevel]
    : (_SPD.practice && _SPD.practiceDiff)
      // Practice ignores score gates so every level in the tier is reachable
      ? [..._spdB(SPD_POOL[_SPD.practiceDiff] || SPD_POOL.easy), ..._spdCustom(_SPD.practiceDiff, null)]
      : _spdGetPool(score)
  if (_SPD.practiceLevel && !_SPD.testLevel) {
    const one = pool.filter(t => t.name === _SPD.practiceLevel)
    if (one.length) pool = one
  }
  if (!pool.length) pool = [...SPD_POOL.easy]
  const tmpl = _spdPick(pool)
  const data = tmpl.gen(c.height)
  return {
    challenge:  { name: tmpl.name, diff: tmpl.diff, speed: tmpl.speed },
    speed:      tmpl.speed,
    clearAt:    data.clearAt,
    obstacles:  data.obstacles,
    deco:       data.deco || [],
  }
}

// Bot line. The spider is only ever on the floor or the ceiling and a
// block kills only on its own surface, so the required surface at each
// block is forced — the plan is just the columns to flip at. Flips are
// keyed to scroll position, so frame timing cannot shift them.
function _spdSolveBot() {
  _SPD.bot = null
  if (!_SPD.botMode || typeof lcSolveSpider !== 'function') return
  try {
    const r = lcSolveSpider(_SPD, !!_SPD.evil, _SPD.onFloor)
    if (r.ok) _SPD.bot = { flips: r.flips, next: 0, taps: r.taps }
  } catch (e) { console.warn('spider bot:', e) }
}

function _spdLoadChallenge() {
  Object.assign(_SPD, _spdBuildChallenge(_SPD.score), {
    scrollX:    0,
    trail:      [],
    fullTrail:  [],
    taps:       0,
    threads:    [],
    onFloor:    true,
    phase:      'announce',
    announceT:  0,
    t:          0,
    attempts:   0,
    retrying:   false,
    retryT:     0,
    bot:        null,
    banner:     null,
    prevLv:     null,
  })
  _spdSolveBot()
  // One level ahead is kept built so it can be drawn past the finish line.
  // Practice and test play fly a single level, so neither looks ahead.
  _SPD.nextLv = (!_SPD.practice && !_SPD.testLevel) ? _spdBuildChallenge(_SPD.score + 1) : null
}

// Hand over to the level that has been visible past the finish line.
//
// Nothing stops and nothing is reset: the spider stays on whichever surface
// it was on, the scroll origin moves back by the finished level's length so
// the flag you crossed sits at column zero and scrolls away behind you, and
// the level after next is built so there is always one more to see.
function _spdMerge() {
  const lv  = _SPD.nextLv || _spdBuildChallenge(_SPD.score)
  const was = _SPD.clearAt
  _SPD.prevLv = { challenge: _SPD.challenge, clearAt: was, obstacles: _SPD.obstacles, deco: _SPD.deco }
  Object.assign(_SPD, lv)
  _SPD.scrollX -= was
  for (const t of _SPD.trail)   t.worldX -= was
  for (const t of _SPD.threads) t.worldX -= was
  _SPD.nextLv = _spdBuildChallenge(_SPD.score + 1)
  _SPD.phase  = 'playing'
  _SPD.taps   = 0
  _spdSolveBot()
  _SPD.banner = { name: lv.challenge.name, diff: lv.challenge.diff, t: 1.6 }
}

function _spdKeyDn(e) {
  if (e.code !== 'Space') return
  e.preventDefault()
  // Holding Space makes the OS repeat keydown about thirty times a second,
  // and every one of those was a flip — so resting on the key flipped the
  // spider back and forth on its own. A flip is one press.
  if (e.repeat) return
  _spdDoFlip()
}

// A tap on a touchscreen fires touchstart and then a synthetic mousedown.
// preventDefault on touchstart suppresses that on most browsers, but not
// all, and a double flip puts you straight back where you started — which
// reads as the tap doing nothing.
let _spdLastTouch = 0
function _spdInput(e) {
  e.preventDefault()
  const now = performance.now()
  if (e.type === 'touchstart') _spdLastTouch = now
  else if (now - _spdLastTouch < 700) return   // synthetic mouse after a tap
  _spdDoFlip()
}

function _spdDoFlip() {
  if (!_SPD.active || _SPD.phase !== 'playing') return
  _SPD.taps = (_SPD.taps || 0) + 1
  const h     = _spdC().height
  const fromY = _SPD.onFloor ? h - SPD_R - 4 : SPD_R + 4
  _SPD.onFloor = !_SPD.onFloor
  const toY   = _SPD.onFloor ? h - SPD_R - 4 : SPD_R + 4
  _SPD.threads.push({ worldX: _SPD.scrollX, y1: fromY, y2: toY, age: 0 })
  if (_SPD.threads.length > 10) _SPD.threads.shift()
  SFX.tap()
}

// ── Game loop ─────────────────────────────────────────

function _spdLoop(ts) {
  if (!_SPD.active) return
  // A clear card is up: hold the level where it is rather than running the
  // next one behind the picture
  if (_SPD.paused) {
    _SPD.lastTime = ts
    _SPD.raf = requestAnimationFrame(_spdLoop)
    return
  }
  let dt = Math.min((ts - _SPD.lastTime) / 1000, 0.05)
  _SPD.lastTime = ts
  // Time dilation, so scroll and flip speed scale together
  if (_SPD.practice && SPD_cheat.on) dt *= SPD_cheat.mul
  const c = _spdC(), w = c.width, h = c.height
  const spX = Math.round(w * 0.25)
  const oh  = Math.round(h * 0.44)

  if (_SPD.retrying) {
    _SPD.retryT += dt
    if (_SPD.shake    > 0) _SPD.shake    = Math.max(0, _SPD.shake    - dt * 4)
    if (_SPD.hitFlash > 0) _SPD.hitFlash = Math.max(0, _SPD.hitFlash - dt * 5)
    if (_SPD.retryT >= SPD_RETRY_WAIT) {
      _SPD.retrying = false; _SPD.retryT = 0
      _SPD.scrollX  = 0; _SPD.onFloor = true
      _SPD.trail    = []; _SPD.threads = []
    }
    _spdDraw(c.getContext('2d'), w, h)
    _SPD.raf = requestAnimationFrame(_spdLoop)
    return
  }

  _SPD.t += dt
  if (_SPD.banner) { _SPD.banner.t -= dt; if (_SPD.banner.t <= 0) _SPD.banner = null }
  if (_SPD.shake   > 0) _SPD.shake   = Math.max(0, _SPD.shake   - dt * 4)
  if (_SPD.hitFlash > 0) _SPD.hitFlash = Math.max(0, _SPD.hitFlash - dt * 5)

  if (_SPD.phase === 'announce') {
    _SPD.announceT += dt
    if (_SPD.announceT >= 0.9) _SPD.phase = 'playing'

  } else if (_SPD.phase === 'playing') {
    _SPD.scrollX += _SPD.speed * dt
    // Autopilot: flip as the agreed columns go past. Position-based, so it
    // plays the same at any refresh rate and through any stutter.
    if (_SPD.bot) {
      const b = _SPD.bot
      while (b.next < b.flips.length && _SPD.scrollX >= b.flips[b.next]) {
        b.next++
        _spdDoFlip()
      }
    }
    const spY = _SPD.onFloor ? h - SPD_R - 4 : SPD_R + 4

    _SPD.trail.push({ worldX: _SPD.scrollX, y: spY })
    if (_SPD.trail.length > 40) _SPD.trail.shift()
    // Practice keeps the whole path so a clear can be drawn as one picture
    if (_SPD.practice) {
      const ft = _SPD.fullTrail
      if (!ft.length || _SPD.scrollX - ft[ft.length-1].sx >= 2) ft.push({ sx:_SPD.scrollX, y:spY })
    }

    for (const t of _SPD.threads) t.age += dt
    _SPD.threads = _SPD.threads.filter(t => t.age < 2)

    for (const obs of _SPD.obstacles) {
      const ox = obs.col - _SPD.scrollX + spX
      if (Math.abs(ox - spX) < SPD_OBW / 2 + SPD_R) {
        const hit = obs.floor ? spY + SPD_R > h - oh : spY - SPD_R < oh
        if (hit) {
          if (_SPD.noclip) {
            if (_SPD.hitFlash <= 0) {
          _SPD.hitFlash = 0.22
          // A bump, not a death. This used to play the death sound and
          // flash red, which is indistinguishable from actually dying —
          // so noclip looked broken even though it was working.
          SFX.bounce()
        }
          } else {
            _spdDie(); break
          }
        }
      }
    }

    if (_SPD.phase === 'playing' && _SPD.scrollX >= _SPD.clearAt) {
      if (_SPD.practice) _spdTrailCard()
      if (!_SPD.practice) {
        _SPD.score++
        window._spdScore = _SPD.score
        document.getElementById('spd-score-hud').textContent = _SPD.score
      }
      SFX.win()
      // Run the levels together, the way Wave Gauntlet does: cross the flag
      // and the next level is simply there. Practice and test play are one
      // level, so they still stop.
      if (_SPD.nextLv) _spdMerge()
      else { _SPD.phase = 'cleared'; _SPD.clearedT = 0 }
    }

  } else if (_SPD.phase === 'cleared') {
    _SPD.clearedT += dt
    if (_SPD.clearedT >= 0.75) _spdLoadChallenge()

  } else if (_SPD.phase === 'dead') {
    _SPD.deadT += dt
    if (_SPD.deadT >= 1.6 && !_SPD.showOver) {
      _SPD.showOver = true
      window._spdScore = _SPD.score
      document.getElementById('spd-final-score').textContent =
        `${_SPD.score} clear${_SPD.score !== 1 ? 's' : ''}`
      document.getElementById('spd-over').style.display = 'flex'
    }
  }

  _spdDraw(c.getContext('2d'), w, h)
  if (_SPD.showOver) { _SPD.active = false; return }
  _SPD.raf = requestAnimationFrame(_spdLoop)
}

function _spdDie() {
  if (_SPD.phase === 'dead') return
  if (_SPD.retrying) return   // already mid-retry; don't double-count

  // Practice restarts the attempt immediately
  if (_SPD.practice) {
    // Hold on the death for a beat, then restart
    _SPD.attempts = (_SPD.attempts || 0) + 1
    _SPD.retrying = true
    _SPD.retryT   = 0
    _SPD.shake    = 0.9
    _SPD.hitFlash = 0.55
    SFX.die()
    return
  }

  _SPD.phase = 'dead'; _SPD.deadT = 0; _SPD.shake = 1.2
  SFX.die()
  window.removeEventListener('keydown', _spdKeyDn)
}

// ── Draw ─────────────────────────────────────────────────────

function _spdDraw(ctx, w, h) {
  const S  = _SPD
  const ch = S.challenge
  const mainCol = ch ? (SPD_DIFF_COL[ch.diff] || '#a855f7') : '#a855f7'
  const spX = Math.round(w * 0.25)
  const spY = S.onFloor ? h - SPD_R - 4 : SPD_R + 4
  const oh  = Math.round(h * 0.44)

  ctx.save()
  if (S.shake > 0) {
    const s = S.shake * 7
    ctx.translate((Math.random()-0.5)*s, (Math.random()-0.5)*s)
  }

  // Background — read the theme directly; canvases get no CSS variables
  const _lt = typeof qgLight === 'function' && qgLight()
  ctx.fillStyle = _lt ? '#efe9f6' : '#05010a'
  ctx.fillRect(-12, -12, w+24, h+24)

  // Grid
  ctx.strokeStyle = _lt ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.018)'
  ctx.lineWidth = 1
  for (let y = 0; y < h; y += 28) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
  }

  // Surfaces (color matches current diff)
  const surfH = 6
  ctx.fillStyle = _lt ? '#3a1f4a' : '#150020'
  ctx.fillRect(0, 0, w, surfH)
  ctx.fillRect(0, h - surfH, w, surfH)
  ctx.strokeStyle = mainCol; ctx.lineWidth = 1.5
  ctx.shadowColor = mainCol; ctx.shadowBlur = 8
  ctx.beginPath(); ctx.moveTo(0, surfH);   ctx.lineTo(w, surfH);   ctx.stroke()
  ctx.beginPath(); ctx.moveTo(0, h-surfH); ctx.lineTo(w, h-surfH); ctx.stroke()
  ctx.shadowBlur = 0

  // Web threads (scroll left with world)
  ctx.setLineDash([3, 5])
  for (const t of S.threads) {
    const tx = Math.round(t.worldX - S.scrollX + spX)
    if (tx < -30 || tx > w + 30) continue
    const a = Math.max(0, 1 - t.age * 0.65)
    ctx.globalAlpha = a * 0.5
    ctx.strokeStyle = mainCol; ctx.lineWidth = 1
    ctx.shadowColor = mainCol; ctx.shadowBlur = 4
    ctx.beginPath(); ctx.moveTo(tx, t.y1); ctx.lineTo(tx, t.y2); ctx.stroke()
    ctx.shadowBlur = 0
  }
  ctx.setLineDash([])
  ctx.globalAlpha = 1

  // Trail
  for (let i = 1; i < S.trail.length; i++) {
    const tx = Math.round(S.trail[i].worldX - S.scrollX + spX)
    if (tx < -20 || tx > w + 20) continue
    const a = i / S.trail.length
    ctx.globalAlpha = a * a * 0.4
    ctx.fillStyle = mainCol
    ctx.shadowColor = mainCol; ctx.shadowBlur = 3
    ctx.beginPath(); ctx.arc(tx, S.trail[i].y, 2.5, 0, Math.PI*2); ctx.fill()
    ctx.shadowBlur = 0
  }
  ctx.globalAlpha = 1

  // The level just finished trails off behind, and the next one is already
  // laid out past the flag. Each is drawn at its own offset, in its own
  // difficulty colour, so what is coming reads before you get there.
  const layers = [{ lv: S, off: 0, col: mainCol }]
  if (S.prevLv) layers.push({ lv: S.prevLv, off: -S.prevLv.clearAt,
                              col: SPD_DIFF_COL[S.prevLv.challenge.diff] || mainCol })
  if (S.nextLv) layers.push({ lv: S.nextLv, off: S.clearAt,
                              col: SPD_DIFF_COL[S.nextLv.challenge.diff] || mainCol })

  // Deco sits behind the obstacles so it can never read as a block
  if (typeof drawDeco === 'function') {
    for (const L of layers) drawDeco(ctx, L.lv.deco, w, h, S.scrollX - L.off, spX, { time: S.t })
  }

  // Obstacles
  for (const L of layers) for (const obs of L.lv.obstacles) {
    const ox   = Math.round(obs.col + L.off - S.scrollX + spX)
    if (ox < -SPD_OBW - 10 || ox > w + SPD_OBW) continue
    const half  = SPD_OBW / 2
    const oy    = obs.floor ? h - oh : 0
    const edgeY = obs.floor ? h - oh : oh

    ctx.fillStyle = _lt ? '#3a1f4a' : '#1e0030'
    ctx.fillRect(ox - half, oy, SPD_OBW, oh)
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1
    ctx.strokeRect(ox - half, oy, SPD_OBW, oh)

    ctx.strokeStyle = L.col; ctx.lineWidth = 2
    ctx.shadowColor = L.col; ctx.shadowBlur = 10
    ctx.beginPath(); ctx.moveTo(ox - half, edgeY); ctx.lineTo(ox + half, edgeY)
    ctx.stroke(); ctx.shadowBlur = 0
  }

  // Spider (flash red on noclip hit)
  const spiderCol  = S.hitFlash > 0 ? '#ff4444' : mainCol
  const deadAlpha  = S.phase === 'dead' ? Math.max(0, 1 - S.deadT * 2.5) : 1
  if (deadAlpha > 0.01) {
    ctx.globalAlpha = deadAlpha
    if (S.clearAt) _spdDrawFinish(ctx, spX + (S.clearAt - S.scrollX), h)
    // The flag you just crossed sits at column zero and scrolls away
    if (S.prevLv)  _spdDrawFinish(ctx, spX - S.scrollX, h)
    _spdDrawSpider(ctx, spX, spY, S.onFloor, spiderCol)
    ctx.globalAlpha = 1
  }

  // Score
  ctx.textAlign = 'center'
  ctx.font = 'bold 26px monospace'
  ctx.fillStyle = _lt ? 'rgba(0,0,0,0.86)' : 'rgba(255,255,255,0.92)'
  ctx.shadowColor = mainCol; ctx.shadowBlur = 16
  ctx.fillText(S.practice ? '—' : S.score, w/2, 42); ctx.shadowBlur = 0

  // Noclip label
  if (S.practice) {
    ctx.font = '11px monospace'; ctx.fillStyle = _lt ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.30)'
    ctx.fillText((S.noclip ? 'PRACTICE · NOCLIP' : 'PRACTICE') +
                 (S.practiceDiff ? ' — ' + S.practiceDiff.toUpperCase() : '') +
                 (S.attempts ? '   att ' + S.attempts : ''), w/2, 18)
    if (SPD_cheat.on) {
      ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 11px monospace'
      ctx.fillText(SPD_cheat.label(), w/2, 32)
    }
  }

  // ── Merge banner ──
  // Shown over the running game when one level rolls into the next, so the
  // name is still there to read without anything stopping to tell you.
  // Sits below the score, which this game draws at the top centre.
  if (S.banner) {
    const b = S.banner
    const a = Math.min(1, (1.6 - b.t) * 6) * Math.min(1, b.t * 2.5)
    if (a > 0.01) {
      const col = SPD_DIFF_COL[b.diff] || '#fff'
      ctx.globalAlpha = a
      ctx.textAlign = 'center'
      ctx.font = 'bold 11px monospace'
      ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 10
      ctx.fillText(String(b.diff || '').toUpperCase(), w / 2, 70)
      ctx.font = 'bold 20px monospace'
      ctx.fillStyle = _lt ? '#111' : '#fff'
      ctx.fillText(b.name, w / 2, 94)
      ctx.shadowBlur = 0
      ctx.globalAlpha = 1
    }
  }

  // ── Announce overlay ──
  if (S.phase === 'announce' && ch) {
    const a = Math.min(1, S.announceT * 7)
    ctx.globalAlpha = a
    ctx.fillStyle = _lt ? 'rgba(255,255,255,0.62)' : 'rgba(0,0,0,0.55)'; ctx.fillRect(0,0,w,h)
    ctx.textAlign = 'center'
    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = mainCol; ctx.shadowColor = mainCol; ctx.shadowBlur = 12
    ctx.fillText(ch.diff.toUpperCase(), w/2, h/2 - 48)
    ctx.font = 'bold 28px monospace'
    ctx.fillStyle = _lt ? '#111' : '#fff'; ctx.shadowColor = mainCol; ctx.shadowBlur = 22
    ctx.fillText(ch.name, w/2, h/2 - 10); ctx.shadowBlur = 0
    ctx.font = '12px monospace'; ctx.fillStyle = _lt ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.36)'
    ctx.fillText('tap / space to flip', w/2, h/2 + 18)
    ctx.globalAlpha = 1
  }

  // ── Cleared overlay ──
  if (S.phase === 'cleared') {
    const t = S.clearedT
    const a = Math.min(1, t*8) * Math.max(0, 1 - (t - 0.25)*5.5)
    if (a > 0.01) {
      ctx.globalAlpha = a
      ctx.textAlign = 'center'; ctx.font = 'bold 36px monospace'
      ctx.fillStyle = '#4ade80'; ctx.shadowColor = '#22c55e'; ctx.shadowBlur = 30
      ctx.fillText('CLEARED!', w/2, h/2); ctx.shadowBlur = 0
      ctx.globalAlpha = 1
    }
  }

  ctx.restore()
}

function _spdDrawSpider(ctx, x, y, onFloor, col) {
  const R = SPD_R
  ctx.save()
  ctx.translate(x, y)
  if (!onFloor) ctx.scale(1, -1)

  ctx.strokeStyle = col; ctx.lineWidth = 1.5
  ctx.shadowColor = col; ctx.shadowBlur = 3
  for (const deg of [22, 44, 66, 84]) {
    const rad = deg * Math.PI / 180
    const sx = Math.cos(rad) * R * 0.85, sy = Math.sin(rad) * R * 0.85
    const ex = Math.cos(rad) * R * 2.4,  ey = Math.sin(rad) * R * 1.9
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(-sx, sy); ctx.lineTo(-ex, ey); ctx.stroke()
  }
  ctx.shadowBlur = 0

  ctx.beginPath(); ctx.arc(0, 0, R * 1.6, 0, Math.PI*2)
  ctx.fillStyle = col + '15'; ctx.fill()

  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI*2)
  ctx.fillStyle = col + '40'; ctx.fill()

  ctx.beginPath(); ctx.arc(0, 0, R * 0.62, 0, Math.PI*2)
  ctx.fillStyle = '#fff'
  ctx.shadowColor = col; ctx.shadowBlur = 12
  ctx.fill(); ctx.shadowBlur = 0

  ctx.fillStyle = '#05010a'
  ctx.beginPath(); ctx.arc(-R*0.22, -R*0.2, 1.4, 0, Math.PI*2); ctx.fill()
  ctx.beginPath(); ctx.arc( R*0.22, -R*0.2, 1.4, 0, Math.PI*2); ctx.fill()

  ctx.restore()
}

// evilbot: same line, most presses instead of fewest (practice only)
const game44_evilbot = (typeof makeEvilbot === 'function')
  ? makeEvilbot(() => cheatScreenActive('game44'), (on) => {
      _SPD.evil = on
      try { _spdBuildPracticeUI() } catch {}
    })
  : null

// A chequered band marking the finish, drawn at the clear column. Scrolls
// with the level like everything else, so it is genuinely the end line
// rather than an overlay that appears when you get there.
function _spdDrawFinish(ctx, x, h, cell) {
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
// The picture of a cleared run, same idea as Wave Gauntlet's: the whole
// level laid out flat with the line you actually took drawn over it.
function _spdTrailCard() {
  const src = _spdC()
  if (!src || _SPD.fullTrail.length < 2) return
  const H = src.height
  const cols = Math.max(1, _SPD.clearAt)
  const W = Math.round(Math.min(2400, Math.max(900, cols)))
  const sx = W / cols
  const top = 46
  const cv = document.createElement('canvas')
  cv.width = W; cv.height = H + top
  const g = cv.getContext('2d')
  const col = SPD_DIFF_COL[_SPD.challenge.diff] || '#a855f7'
  const oh = Math.round(H * 0.44)

  g.fillStyle = '#05010a'; g.fillRect(0, 0, W, H + top)
  g.fillStyle = '#150020'
  g.fillRect(0, top, W, 4); g.fillRect(0, top + H - 4, W, 4)

  for (const o of _SPD.obstacles) {
    const x = o.col * sx
    const bw = Math.max(3, SPD_OBW * sx)
    const y = top + (o.floor ? H - oh : 0)
    g.fillStyle = '#1e0030'; g.fillRect(x - bw/2, y, bw, oh)
    g.strokeStyle = col; g.lineWidth = 1.4
    const edgeY = top + (o.floor ? H - oh : oh)
    g.beginPath(); g.moveTo(x - bw/2, edgeY); g.lineTo(x + bw/2, edgeY); g.stroke()
  }

  const pts = _SPD.fullTrail.map(p => ({ x: p.sx * sx, y: top + p.y }))
  const stroke = () => {
    g.beginPath(); g.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y)
    g.stroke()
  }
  g.lineJoin = 'round'; g.lineCap = 'round'
  g.shadowColor = '#4ade80'; g.shadowBlur = 12
  g.strokeStyle = 'rgba(74,222,128,0.30)'; g.lineWidth = 6; stroke()
  g.shadowBlur = 7
  g.strokeStyle = '#4ade80'; g.lineWidth = 2; stroke()
  g.shadowBlur = 0

  g.textAlign = 'left'
  g.font = 'bold 20px monospace'; g.fillStyle = '#fff'
  g.fillText(_SPD.challenge.name, 16, 30)
  g.font = '12px monospace'; g.fillStyle = col
  g.fillText((_SPD.challenge.diff || '').toUpperCase(),
             18 + g.measureText(_SPD.challenge.name).width + 90, 30)
  g.textAlign = 'right'
  g.fillStyle = 'rgba(255,255,255,0.45)'; g.font = '12px monospace'
  const att = _SPD.attempts ? `${_SPD.attempts + 1} attempts` : 'first try'
  const secs = _SPD.clearAt / _SPD.speed
  g.fillText(`${_SPD.taps || 0} flips  ·  ${att}  ·  ${secs.toFixed(1)}s  ·  Spider`, W - 16, 30)

  const wrap = document.getElementById('spd-card')
  const img  = document.getElementById('spd-card-img')
  if (!wrap || !img) return
  try { img.src = cv.toDataURL('image/png') } catch { return }
  wrap.dataset.name = (_SPD.challenge.name || 'run').toLowerCase().replace(/[^a-z0-9]+/g, '-')
  wrap.style.display = 'flex'
  _SPD.paused = true
}

window.spdCloseCard = function() {
  const wrap = document.getElementById('spd-card')
  if (wrap) wrap.style.display = 'none'
  if (!_SPD.active || !_SPD.paused) return
  _SPD.paused = false
  _SPD.lastTime = performance.now()
  _spdLoadChallenge()
}
window.spdSaveCard = function() {
  const img  = document.getElementById('spd-card-img')
  const wrap = document.getElementById('spd-card')
  if (!img || !img.src) return
  const a = document.createElement('a')
  a.href = img.src
  a.download = (wrap.dataset.name || 'run') + '-clear.png'
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
}
