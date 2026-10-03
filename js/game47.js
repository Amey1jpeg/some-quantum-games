// ═══════════════════════════════════════════════════════
//  GAME 47 — BELL TEST (the CHSH game, classical)
//
//  Two real people, kept apart. Each round the referee deals Alice a bit
//  x and Bob a bit y. Each answers with one bit — a and b — without
//  seeing the other's bit or their answer. The pair wins the round when
//
//      a XOR b  ==  x AND y
//
//  They are on the same side: one shared score. They may agree any plan
//  beforehand, which is allowed and is what makes this interesting.
//
//  Two people pressing buttons can only play a CLASSICAL strategy, and
//  every classical strategy wins at most 3 of the 4 question pairs. So
//  75% is a ceiling that no cleverness gets past — a theorem, not a
//  difficulty setting. Hitting that wall is the point of the game.
//  (Entangled particles reach cos^2(pi/8) = 85.4%, which is why real
//  Bell tests matter; the end screen says so.)
//
//  Why the two players must not see each other's bit: anyone who knows
//  both x and y can simply answer x AND y and win every round. The whole
//  problem is that Alice and Bob are separated.
// ═══════════════════════════════════════════════════════

const G47_ROUNDS = 20       // about a minute — short enough for a queue at a stand

const G47 = {
  mode: null,        // 'local' | 'online'
  phase: 'idle',     // 'ask' | 'handoff' | 'wait' | 'reveal' | 'done'
  round: 0, wins: 0,
  x: 0, y: 0, a: null, b: null,
  turn: 'alice',     // same device: who is at the screen now
  role: 'alice',     // online: which side we are
  code: null, rng: null, timer: null,
}

const _g47q   = id => document.getElementById(id)
const _g47set = (id, txt) => { const e = _g47q(id); if (e) e.textContent = txt }

// ── Shared randomness ───────────────────────────────────
// Online, both clients must deal the SAME bits each round or the two
// screens disagree about who won. Seeding off the shared room code means
// neither side has to send them and there is no round-trip before you
// can play — only the one-bit answers go over the wire.
function _g47Seed(str) {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
function _g47Rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── Lifecycle ───────────────────────────────────────────
window.initGame47 = function() {
  _g47Reset()
  _g47Show('start')
  const over = _g47q('g47-over')
  if (over) over.classList.remove('show')
  const btn = _g47q('g47-match-btn')
  if (btn) { btn.disabled = false; btn.textContent = '🌐 Find a partner online' }
  _g47set('g47-match-status', '')
}

window.stopGame47 = function() { _g47Reset() }

function _g47Reset() {
  if (G47.timer) { clearTimeout(G47.timer); G47.timer = null }
  if (G47.mode === 'online' && typeof mpGetSocket === 'function') {
    const sock = mpGetSocket()
    sock.off('opponent-state')
  }
  Object.assign(G47, { mode: null, phase: 'idle', round: 0, wins: 0,
    a: null, b: null, turn: 'alice', code: null, rng: null })
}

function _g47Show(which) {
  for (const [k, id] of Object.entries({ start: 'g47-start', play: 'g47-play' })) {
    const el = _g47q(id)
    if (el) el.style.display = (k === which) ? '' : 'none'
  }
}

// ── Starting a game ─────────────────────────────────────
window.g47Local = function() {
  _g47Reset()
  G47.mode = 'local'
  _g47Show('play')
  _g47StartRound()
}

window.g47Online = function() {
  _g47Reset()
  if (typeof mpFindMatch !== 'function') return
  mpFindMatch('chsh', {
    statusEl: _g47q('g47-match-status'),
    btnEl:    _g47q('g47-match-btn'),
    onMatched: ({ code, isHost }) => {
      G47.mode = 'online'
      G47.code = code
      G47.role = isHost ? 'alice' : 'bob'
      G47.rng  = _g47Rng(_g47Seed(code))
      _g47Net()
      _g47Show('play')
      _g47StartRound()
    },
    onLeft: () => {
      if (G47.mode !== 'online') return
      if (G47.timer) { clearTimeout(G47.timer); G47.timer = null }
      G47.phase = 'done'
      _g47set('g47-whose', 'Your partner left')
      _g47set('g47-bit', '')
      _g47set('g47-reveal', '')
      _g47Buttons(false)
    },
  })
}

function _g47Net() {
  const sock = mpGetSocket()
  sock.off('opponent-state')
  sock.on('opponent-state', state => {
    // Late or replayed messages from an earlier round must not land on
    // this one, so the round number is checked rather than trusted.
    if (!state || state.t !== 'ans' || state.round !== G47.round) return
    if (G47.role === 'alice') G47.b = state.v
    else                      G47.a = state.v
    _g47Resolve()
  })
}

// ── A round ─────────────────────────────────────────────
function _g47StartRound() {
  if (G47.round >= G47_ROUNDS) return _g47Finish()
  G47.round++
  G47.a = null; G47.b = null
  const r = (G47.mode === 'online') ? G47.rng : Math.random
  G47.x = r() < 0.5 ? 0 : 1
  G47.y = r() < 0.5 ? 0 : 1
  G47.turn = 'alice'
  G47.phase = 'ask'
  _g47Render()
}

// Whose answer we are collecting right now
function _g47Asking() {
  return (G47.mode === 'online') ? G47.role : G47.turn
}

function _g47Render() {
  const isAlice = _g47Asking() === 'alice'
  _g47set('g47-roundline', 'Round ' + G47.round + ' of ' + G47_ROUNDS)
  _g47set('g47-whose', G47.mode === 'online'
    ? (isAlice ? 'YOU ARE ALICE' : 'YOU ARE BOB')
    : (isAlice ? 'PLAYER 1 — ALICE' : 'PLAYER 2 — BOB'))
  _g47set('g47-tally', G47.wins + ' / ' + (G47.round - 1) + ' won')

  const bit = _g47q('g47-bit')
  if (G47.phase === 'ask') {
    if (bit) bit.innerHTML = 'Your bit is <b>' + (isAlice ? G47.x : G47.y) + '</b>'
    _g47set('g47-reveal', '')
    _g47Buttons(true)
  } else if (G47.phase === 'wait') {
    if (bit) bit.innerHTML = ''
    _g47set('g47-reveal', 'Waiting for your partner…')
    const rev = _g47q('g47-reveal')
    if (rev) rev.style.color = 'var(--muted)'
    _g47Buttons(false)
  }
  const hand = _g47q('g47-handoff'), main = _g47q('g47-main')
  if (hand) hand.style.display = (G47.phase === 'handoff') ? '' : 'none'
  if (main) main.style.display = (G47.phase === 'handoff') ? 'none' : ''
}

function _g47Buttons(on) {
  for (const v of [0, 1]) {
    const b = _g47q('g47-btn-' + v)
    if (b) b.disabled = !on
  }
}

window.g47Answer = function(v) {
  if (G47.phase !== 'ask') return
  if (typeof SFX !== 'undefined') SFX.tap()
  if (_g47Asking() === 'alice') G47.a = v; else G47.b = v

  if (G47.mode === 'online') {
    mpGetSocket().emit('state-sync',
      { code: G47.code, state: { t: 'ans', round: G47.round, v } })
    G47.phase = 'wait'
    _g47Render()
    _g47Resolve()          // partner may already have answered
    return
  }
  if (G47.turn === 'alice') {
    G47.turn = 'bob'
    G47.phase = 'handoff'
    _g47Render()
  } else {
    _g47Resolve()
  }
}

// The hand-over is load-bearing, not politeness: if Bob sees x he can
// just answer x AND y and the pair wins every round.
window.g47Handoff = function() {
  if (G47.phase !== 'handoff') return
  G47.phase = 'ask'
  _g47Render()
}

function _g47Resolve() {
  if (G47.a === null || G47.b === null) return
  if (G47.phase === 'reveal') return
  const won = ((G47.a ^ G47.b) === (G47.x & G47.y))
  if (won) G47.wins++
  G47.phase = 'reveal'
  _g47Buttons(false)
  _g47set('g47-whose',
    `ALICE got ${G47.x}, said ${G47.a}   ·   BOB got ${G47.y}, said ${G47.b}`)
  _g47set('g47-bit', '')
  _g47set('g47-reveal',
    (won ? '✓ WON' : '✗ LOST') + ` — x AND y = ${G47.x & G47.y}, a XOR b = ${G47.a ^ G47.b}`)
  const rev = _g47q('g47-reveal')
  if (rev) rev.style.color = won ? '#4ade80' : '#f87171'
  _g47set('g47-tally', G47.wins + ' / ' + G47.round + ' won')
  if (typeof SFX !== 'undefined') (won ? SFX.click() : SFX.bounce())
  G47.timer = setTimeout(_g47StartRound, 1500)
}

function _g47Finish() {
  G47.phase = 'done'
  const pct = G47.wins / G47_ROUNDS * 100
  _g47set('g47-final-score', G47.wins + ' / ' + G47_ROUNDS)
  _g47set('g47-over-head', 'Together you won ' + G47.wins)
  const note = _g47q('g47-over-note')
  if (note) {
    // Honest either way. A lucky run above 75% is still luck: the
    // average no pair can beat is 75%, whatever one game of 20 shows.
    note.textContent = pct > 75
      ? `${pct.toFixed(0)}% — above 75%, but over ${G47_ROUNDS} rounds that is luck. `
        + 'No plan you agree can average more than 75%: every strategy loses at least one '
        + 'of the four question pairs. Entangled particles reach 85.4% — that is what a real '
        + 'Bell test measures.'
      : `${pct.toFixed(0)}%. The ceiling is 75%, and it is a theorem rather than a difficulty `
        + 'setting — every strategy you could agree loses at least one of the four question '
        + 'pairs. Entangled particles reach 85.4%, which is why Bell tests matter.'
  }
  const over = _g47q('g47-over')
  if (over) over.classList.add('show')
  if (typeof SFX !== 'undefined') SFX.win()
}
