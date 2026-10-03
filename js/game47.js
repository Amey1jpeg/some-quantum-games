// ═══════════════════════════════════════════════════════
//  GAME 47 — BELL TEST (the CHSH game)
//
//  The referee sends Alice a bit x and Bob a bit y, chosen at
//  random. They answer with bits a and b, with no way to talk to
//  each other. They win the round when  a XOR b == x AND y.
//
//  Answering separately, the best any agreed plan can manage is
//  75% — that is the classical bound, and it is a theorem, not a
//  limit of cleverness. Sharing an entangled pair and measuring it
//  at well-chosen angles reaches cos^2(pi/8) = 85.36%, the
//  Tsirelson bound. Beating 75% is the whole game.
//
//  The player sets four measurement angles: Alice's dial for x=0
//  and x=1, Bob's for y=0 and y=1. Then 300 rounds are played and
//  the wins are counted.
//
//  Physics: for the state (|00> + |11>)/sqrt(2) with measurements
//  in the X-Z plane, the correlation is E(a, b) = cos(2(a - b)).
//  The round is won when a XOR b == x AND y, so
//      P(win | x,y) = (1 + (-1)^(x AND y) * E(alpha_x, beta_y)) / 2
//  and the overall win rate is 1/2 + S/8, where S is the CHSH sum
//  below. S = 2 classically, S = 2*sqrt(2) at best quantumly.
// ═══════════════════════════════════════════════════════

const G47_ROUNDS   = 300          // rounds per run
const G47_CLASSICAL = 2           // CHSH sum reachable without entanglement
const G47_TSIRELSON = 2 * Math.SQRT2

const G47 = {
  // Angles in degrees. These starting values are deliberately a
  // losing setup — all four aligned gives S = 2, exactly the
  // classical bound, so the player starts at 75% and has to find
  // the rest themselves.
  a0: 0, a1: 0, b0: 0, b1: 0,
  running: false,
  round: 0,
  wins: 0,
  log: [],            // recent rounds, for the ticker
  raf: null,
  best: 0,
}

// ── The physics ─────────────────────────────────────────
// Correlation between Alice at angle a and Bob at angle b, both in
// degrees, for the entangled pair described above.
function _g47E(a, b) {
  return Math.cos(2 * (a - b) * Math.PI / 180)
}

// The CHSH sum. The (1,1) term is subtracted because that is the
// one question pair where the players must ANTI-correlate to win.
function g47Sum(s = G47) {
  return _g47E(s.a0, s.b0) + _g47E(s.a0, s.b1) +
         _g47E(s.a1, s.b0) - _g47E(s.a1, s.b1)
}

// Win rate implied by the angles, before any dice are rolled.
function g47WinRate(s = G47) { return 0.5 + g47Sum(s) / 8 }

// One round: the referee's bits are fair coins, and each side's
// answer is a biased coin whose correlation is E.
function _g47Round() {
  const x = Math.random() < 0.5 ? 0 : 1
  const y = Math.random() < 0.5 ? 0 : 1
  const E = _g47E(x ? G47.a1 : G47.a0, y ? G47.b1 : G47.b0)
  // P(a == b) = (1 + E)/2, so draw agreement first, then a fair a.
  const agree = Math.random() < (1 + E) / 2
  const a = Math.random() < 0.5 ? 0 : 1
  const b = agree ? a : a ^ 1
  const won = (a ^ b) === (x & y)
  return { x, y, a, b, won }
}

// ── Controls ────────────────────────────────────────────
window.g47Set = function(which, deg) {
  if (G47.running) return
  G47[which] = +deg
  const lab = document.getElementById('g47-lab-' + which)
  if (lab) lab.textContent = (+deg).toFixed(0) + '°'
  _g47Draw()
  _g47Readout()
}

// The known optimal setup, offered as a giveaway once someone is
// stuck. It is behind a button rather than hidden, because the
// interesting part is understanding WHY it works, not finding it.
window.g47Solve = function() {
  if (G47.running) return
  const opt = { a0: 0, a1: 45, b0: 22.5, b1: -22.5 }
  for (const k of ['a0', 'a1', 'b0', 'b1']) {
    G47[k] = opt[k]
    const el = document.getElementById('g47-' + k)
    if (el) el.value = opt[k]
    const lab = document.getElementById('g47-lab-' + k)
    if (lab) lab.textContent = opt[k].toFixed(1) + '°'
  }
  if (typeof SFX !== 'undefined') SFX.click()
  _g47Draw(); _g47Readout()
}

window.initGame47 = function() {
  _g47cReset()
  _g47Show('start')
  _g47ResetSolo()
}

// Swap between the three screens: the mode picker, the solo angle panel,
// and the two-player round view.
function _g47Show(which) {
  const map = { start: 'g47-start', solo: 'g47-panel', play: 'g47-play' }
  for (const [k, id] of Object.entries(map)) {
    const el = document.getElementById(id)
    if (el) el.style.display = (k === which) ? '' : 'none'
  }
  const arena = document.getElementById('g47-arena')
  if (arena) arena.style.display = (which === 'solo') ? '' : 'none'
}

function _g47ResetSolo() {
  if (G47.raf) cancelAnimationFrame(G47.raf)
  G47.raf = null
  G47.running = false
  G47.round = 0
  G47.wins = 0
  G47.log = []
  const over = document.getElementById('g47-over')
  if (over) over.classList.remove('show')
  const btn = document.getElementById('g47-run')
  if (btn) { btn.disabled = false; btn.textContent = '▶ Play ' + G47_ROUNDS + ' rounds' }
  // Push the sliders back to whatever the state says, so returning
  // to the game does not show stale positions.
  for (const k of ['a0', 'a1', 'b0', 'b1']) {
    const el = document.getElementById('g47-' + k)
    if (el) el.value = G47[k]
    const lab = document.getElementById('g47-lab-' + k)
    if (lab) lab.textContent = (+G47[k]).toFixed(1) + '°'
  }
  _g47Fit()
  _g47Draw()
  _g47Readout()
}

window.stopGame47 = function() {
  G47.running = false
  if (G47.raf) cancelAnimationFrame(G47.raf)
  G47.raf = null
  _g47cReset()
}

window.g47Run = function() {
  if (G47.running) return
  G47.running = true
  G47.round = 0
  G47.wins = 0
  G47.log = []
  const btn = document.getElementById('g47-run')
  if (btn) btn.disabled = true

  // Rounds are played on a timer rather than all at once so the
  // count visibly climbs — at a stand that reads as the machine
  // doing something, instead of a number appearing from nowhere.
  const PER_FRAME = 4
  const step = () => {
    if (!G47.running) return
    for (let i = 0; i < PER_FRAME && G47.round < G47_ROUNDS; i++) {
      const r = _g47Round()
      G47.round++
      if (r.won) G47.wins++
      G47.log.push(r)
      if (G47.log.length > 40) G47.log.shift()
    }
    _g47Draw()
    _g47Readout()
    if (G47.round >= G47_ROUNDS) return _g47Finish()
    G47.raf = requestAnimationFrame(step)
  }
  if (typeof SFX !== 'undefined') SFX.click()
  G47.raf = requestAnimationFrame(step)
}

function _g47Finish() {
  G47.running = false
  G47.raf = null
  window._g47Score = G47.wins
  if (G47.wins > G47.best) G47.best = G47.wins
  const pct = G47.wins / G47_ROUNDS * 100
  const beat = pct > 75

  const btn = document.getElementById('g47-run')
  if (btn) { btn.disabled = false; btn.textContent = '▶ Play ' + G47_ROUNDS + ' rounds' }

  const fs = document.getElementById('g47-final-score')
  if (fs) fs.textContent = G47.wins + ' / ' + G47_ROUNDS
  const head = document.getElementById('g47-over-head')
  if (head) head.textContent = beat ? 'Classical bound broken!' : 'Within the classical bound'
  const note = document.getElementById('g47-over-note')
  if (note) {
    note.textContent = beat
      ? pct.toFixed(1) + '% — no strategy without entanglement could do this.'
      : pct.toFixed(1) + '% — anything up to 75% is reachable without entanglement. Try other angles.'
  }
  if (typeof renderMedalDisplay === 'function') renderMedalDisplay('g47-medal-display', 'chsh', G47.wins)
  const over = document.getElementById('g47-over')
  if (over) over.classList.add('show')
  if (typeof SFX !== 'undefined') (beat ? SFX.win() : SFX.die())
}

// ── Readout ─────────────────────────────────────────────
function _g47Readout() {
  const S = g47Sum()
  const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt }
  set('g47-s', S.toFixed(3))
  set('g47-pred', (g47WinRate() * 100).toFixed(1) + '%')
  set('g47-hud', G47.wins + ' / ' + (G47.round || 0))
  const verdict = document.getElementById('g47-verdict')
  if (verdict) {
    // A hair of tolerance: floating point lands S on 2.0000000004
    // when the angles are dead classical, which should not read as
    // a win over the bound.
    if (S > G47_CLASSICAL + 1e-6) {
      verdict.textContent = 'Beats the classical bound'
      verdict.style.color = '#4ade80'
    } else {
      verdict.textContent = 'Classical territory (S ≤ 2)'
      verdict.style.color = 'var(--muted)'
    }
  }
}

// ── Drawing ─────────────────────────────────────────────
function _g47Fit() {
  const c = document.getElementById('g47-canvas')
  if (!c) return null
  const r = c.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height))
  if (c.width !== w * dpr || c.height !== h * dpr) {
    c.width = w * dpr; c.height = h * dpr
  }
  const ctx = c.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return { ctx, w, h }
}

function _g47Dial(ctx, cx, cy, r, angles, colors, label) {
  ctx.save()
  ctx.strokeStyle = 'rgba(148,163,184,.30)'
  ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke()
  // A measurement axis has no arrowhead — the two ends are the two
  // outcomes — so each setting draws as a full diameter, not a ray.
  angles.forEach((deg, i) => {
    const t = -deg * Math.PI / 180
    ctx.strokeStyle = colors[i]
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(cx - Math.cos(t) * r, cy - Math.sin(t) * r)
    ctx.lineTo(cx + Math.cos(t) * r, cy + Math.sin(t) * r)
    ctx.stroke()
  })
  ctx.fillStyle = 'rgba(203,213,225,.85)'
  ctx.font = '600 12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(label, cx, cy + r + 20)
  ctx.restore()
}

function _g47Draw() {
  const f = _g47Fit()
  if (!f) return
  const { ctx, w, h } = f
  ctx.clearRect(0, 0, w, h)

  // Two dials side by side, sized to whatever space there is
  const r = Math.max(26, Math.min(62, Math.min(w / 7, h / 4)))
  const cy = r + 26
  _g47Dial(ctx, w * 0.27, cy, r, [G47.a0, G47.a1], ['#38bdf8', '#818cf8'], 'ALICE')
  _g47Dial(ctx, w * 0.73, cy, r, [G47.b0, G47.b1], ['#f472b6', '#fbbf24'], 'BOB')

  // ── The S meter ───────────────────────────────────────
  // Scaled so the classical bound and Tsirelson both sit on it,
  // because the gap between those two marks is the entire point.
  const S = g47Sum()
  const bx = Math.round(w * 0.10), bw = Math.round(w * 0.80)
  const by = cy + r + 44, bh = 16
  const toX = v => bx + (Math.max(0, Math.min(G47_TSIRELSON, v)) / G47_TSIRELSON) * bw

  ctx.fillStyle = 'rgba(148,163,184,.14)'
  ctx.fillRect(bx, by, bw, bh)
  // classical region
  ctx.fillStyle = 'rgba(148,163,184,.18)'
  ctx.fillRect(bx, by, toX(G47_CLASSICAL) - bx, bh)
  // the bar itself
  const over = S > G47_CLASSICAL + 1e-6
  ctx.fillStyle = over ? '#4ade80' : '#94a3b8'
  ctx.fillRect(bx, by, Math.max(0, toX(S) - bx), bh)

  const mark = (v, col, txt) => {
    const x = toX(v)
    ctx.strokeStyle = col; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(x, by - 5); ctx.lineTo(x, by + bh + 5); ctx.stroke()
    ctx.fillStyle = col
    ctx.font = '600 10px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(txt, x, by + bh + 18)
  }
  mark(G47_CLASSICAL, '#f87171', 'classical 2.00')
  mark(G47_TSIRELSON, '#4ade80', 'max 2.83')

  ctx.fillStyle = 'rgba(226,232,240,.92)'
  ctx.font = '700 13px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText('S = ' + S.toFixed(3), bx, by - 12)

  // ── Round ticker ──────────────────────────────────────
  // Only drawn when there is room; on a short arena the dials and
  // the meter matter more than the history.
  const ty = by + bh + 34
  if (h - ty > 26 && G47.log.length) {
    const cell = 13, gap = 3
    const fit = Math.max(1, Math.floor((w - 2 * bx + gap) / (cell + gap)))
    const shown = G47.log.slice(-fit)
    shown.forEach((rd, i) => {
      ctx.fillStyle = rd.won ? 'rgba(74,222,128,.85)' : 'rgba(248,113,113,.85)'
      ctx.fillRect(bx + i * (cell + gap), ty, cell, cell)
    })
  }
}

// Redraw on resize so the dials and meter stay inside the arena
window.addEventListener('resize', () => {
  const s = document.getElementById('game47')
  if (s && s.classList.contains('active')) _g47Draw()
})

// ═══════════════════════════════════════════════════════
//  THE TWO-PLAYER GAME — classical CHSH
//
//  Two real people. Each round the referee deals Alice a bit x and Bob a
//  bit y. Each answers with a bit of their own, without seeing the
//  other's bit OR their answer. The pair wins the round when
//  a XOR b == x AND y.
//
//  They are on the SAME side: one shared score. They may agree any plan
//  beforehand — that is allowed, and it is why this is interesting.
//
//  Two people pressing buttons can only ever play a classical strategy,
//  and every classical strategy wins at most 3 of the 4 question pairs.
//  So 75% is a ceiling no cleverness gets past. That wall IS the game;
//  the solo practice mode above is where you see entanglement break it.
//
//  Why each player must not see the other's bit: knowing both x and y
//  lets one of them just compute x AND y and answer it, winning every
//  round. The whole problem is that they are kept apart.
// ═══════════════════════════════════════════════════════

const G47_CROUNDS = 20       // ~a minute; short enough for a queue at a stand

const G47C = {
  mode: null,        // 'local' | 'online'
  phase: 'idle',     // 'ask' | 'handoff' | 'wait' | 'reveal' | 'done'
  round: 0, wins: 0,
  x: 0, y: 0, a: null, b: null,
  turn: 'alice',     // local: who is at the screen now
  role: 'alice',     // online: which side we are
  code: null, rng: null, timer: null, log: [],
}

function _g47cReset() {
  if (G47C.timer) { clearTimeout(G47C.timer); G47C.timer = null }
  const sock = (G47C.mode === 'online' && typeof mpGetSocket === 'function') ? mpGetSocket() : null
  if (sock) { sock.off('opponent-state'); sock.off('opponent-left') }
  Object.assign(G47C, { mode: null, phase: 'idle', round: 0, wins: 0,
    a: null, b: null, turn: 'alice', code: null, rng: null, log: [] })
}

// Both clients must deal the SAME bits each round, or the two screens
// disagree about who won. Seeding off the shared room code means neither
// side has to send them and there is no round-trip before you can play.
function _g47cSeed(str) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
function _g47cRng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const _g47q = id => document.getElementById(id)
const _g47set = (id, txt) => { const e = _g47q(id); if (e) e.textContent = txt }

window.g47Mode = function(mode) {
  if (mode === 'solo') { _g47cReset(); _g47Show('solo'); _g47ResetSolo(); return }
  if (mode === 'local') {
    _g47cReset()
    G47C.mode = 'local'
    _g47Show('play')
    _g47cStartRound()
    return
  }
  if (mode === 'online') {
    _g47cReset()
    if (typeof mpFindMatch !== 'function') return
    mpFindMatch('chsh', {
      statusEl: _g47q('g47-match-status'),
      btnEl:    _g47q('g47-match-btn'),
      onMatched: ({ code, isHost }) => {
        G47C.mode = 'online'
        G47C.code = code
        G47C.role = isHost ? 'alice' : 'bob'
        G47C.rng  = _g47cRng(_g47cSeed(code))
        _g47cNet()
        _g47Show('play')
        _g47cStartRound()
      },
      onLeft: () => {
        if (G47C.mode !== 'online') return
        _g47set('g47-whose', 'Your partner left')
        _g47set('g47-bit', '')
        _g47cButtons(false)
        G47C.phase = 'done'
      },
    })
  }
}

function _g47cNet() {
  const sock = mpGetSocket()
  sock.off('opponent-state')
  sock.on('opponent-state', state => {
    if (!state || state.t !== 'ans' || state.round !== G47C.round) return
    if (G47C.role === 'alice') G47C.b = state.v
    else                      G47C.a = state.v
    _g47cMaybeResolve()
  })
}

function _g47cStartRound() {
  if (G47C.round >= G47_CROUNDS) return _g47cFinish()
  G47C.round++
  G47C.a = null; G47C.b = null
  // Deal the referee's two bits
  const r = (G47C.mode === 'online') ? G47C.rng : Math.random
  G47C.x = r() < 0.5 ? 0 : 1
  G47C.y = r() < 0.5 ? 0 : 1
  G47C.turn = 'alice'
  G47C.phase = 'ask'
  _g47cRender()
}

// Who is being asked right now, and which bit are they shown
function _g47cAsking() {
  if (G47C.mode === 'online') return G47C.role
  return G47C.turn
}

function _g47cRender() {
  const who = _g47cAsking()
  const isAlice = who === 'alice'
  const label = G47C.mode === 'online'
    ? (isAlice ? 'YOU ARE ALICE' : 'YOU ARE BOB')
    : (isAlice ? 'PLAYER 1 — ALICE' : 'PLAYER 2 — BOB')
  _g47set('g47-whose', label)
  _g47set('g47-roundline', 'Round ' + G47C.round + ' of ' + G47_CROUNDS)
  _g47set('g47-tally', G47C.wins + ' / ' + (G47C.round - (G47C.phase === 'reveal' ? 0 : 1)) + ' won')

  const bitEl = _g47q('g47-bit')
  if (G47C.phase === 'ask') {
    if (bitEl) bitEl.innerHTML = 'Your bit is <b>' + (isAlice ? G47C.x : G47C.y) + '</b>'
    _g47set('g47-reveal', '')
    _g47cButtons(true)
  } else if (G47C.phase === 'wait') {
    if (bitEl) bitEl.innerHTML = ''
    _g47set('g47-reveal', 'Waiting for your partner…')
    _g47cButtons(false)
  }
  const hand = _g47q('g47-handoff')
  if (hand) hand.style.display = (G47C.phase === 'handoff') ? '' : 'none'
  const main = _g47q('g47-main')
  if (main) main.style.display = (G47C.phase === 'handoff') ? 'none' : ''
}

function _g47cButtons(on) {
  for (const v of [0, 1]) {
    const b = _g47q('g47-btn-' + v)
    if (b) b.disabled = !on
  }
}

window.g47Answer = function(v) {
  if (G47C.phase !== 'ask') return
  if (typeof SFX !== 'undefined') SFX.tap()
  const who = _g47cAsking()
  if (who === 'alice') G47C.a = v; else G47C.b = v

  if (G47C.mode === 'online') {
    mpGetSocket().emit('state-sync',
      { code: G47C.code, state: { t: 'ans', round: G47C.round, v } })
    G47C.phase = 'wait'
    _g47cRender()
    _g47cMaybeResolve()
    return
  }
  // Same device: hand over without the next player seeing the last answer
  if (G47C.turn === 'alice') {
    G47C.turn = 'bob'
    G47C.phase = 'handoff'
    _g47cRender()
  } else {
    _g47cMaybeResolve()
  }
}

// Same-device hand-over screen, so Bob never sees Alice's bit or answer
window.g47Handoff = function() {
  if (G47C.phase !== 'handoff') return
  G47C.phase = 'ask'
  _g47cRender()
}

function _g47cMaybeResolve() {
  if (G47C.a === null || G47C.b === null) return
  const won = ((G47C.a ^ G47C.b) === (G47C.x & G47C.y))
  if (won) G47C.wins++
  G47C.log.push(won)
  G47C.phase = 'reveal'
  _g47cButtons(false)
  const rule = `x AND y = ${G47C.x & G47C.y} · a XOR b = ${G47C.a ^ G47C.b}`
  _g47set('g47-reveal', (won ? '✓ WON — ' : '✗ LOST — ') + rule)
  const rev = _g47q('g47-reveal')
  if (rev) rev.style.color = won ? '#4ade80' : '#f87171'
  _g47set('g47-bit', '')
  _g47set('g47-whose', `ALICE got ${G47C.x}, answered ${G47C.a}   ·   BOB got ${G47C.y}, answered ${G47C.b}`)
  _g47set('g47-tally', G47C.wins + ' / ' + G47C.round + ' won')
  if (typeof SFX !== 'undefined') (won ? SFX.click() : SFX.bounce())
  G47C.timer = setTimeout(_g47cStartRound, 1500)
}

function _g47cFinish() {
  G47C.phase = 'done'
  const pct = G47C.wins / G47_CROUNDS * 100
  _g47set('g47-final-score', G47C.wins + ' / ' + G47_CROUNDS)
  _g47set('g47-over-head', 'Together you won ' + G47C.wins)
  const note = _g47q('g47-over-note')
  if (note) {
    // The honest message either way: the ceiling is a theorem, and the
    // only thing that gets past it is entanglement.
    note.textContent = pct > 75
      ? `${pct.toFixed(0)}% — above 75%, but over only ${G47_CROUNDS} rounds that is luck. No agreed plan can average more than 75%: every classical strategy loses at least one of the four question pairs. Entangled particles reach 85.4% — try Practice to see how.`
      : `${pct.toFixed(0)}%. The ceiling here is 75%, and it is a theorem rather than a difficulty setting — every classical strategy loses at least one of the four question pairs. Entangled particles reach 85.4%. Try Practice to see how.`
  }
  const medal = _g47q('g47-medal-display')
  if (medal) medal.innerHTML = ''     // co-op pair, not a leaderboard run
  const sub = _g47q('g47-submit-btn')
  if (sub) sub.style.display = 'none'
  const over = _g47q('g47-over')
  if (over) over.classList.add('show')
  if (typeof SFX !== 'undefined') SFX.win()
}
