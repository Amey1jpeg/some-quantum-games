// ═══════════════════════════════════════════════════════
//  MULTIPLAYER — shared queue + ping utilities
// ═══════════════════════════════════════════════════════
// Self-hosted on a Raspberry Pi 5, reached over a Tailscale Funnel. The
// funnel terminates TLS, which the page needs: it is served over HTTPS, so
// a plain ws:// to the Pi would be blocked as mixed content.
//
// Must stay https:// and not wss:// — the Socket.IO client takes an HTTP
// origin and upgrades the transport itself.
//
// One constant for every site, so main, /beta and /stall all follow it.
// (/stall never opens a socket at all; mpFindMatch refuses there.)
const MP_SERVER = 'https://arham-pi.taila1cfdc.ts.net'
let _mpSocket = null

function mpGetSocket() {
  if (_mpSocket && _mpSocket.connected) return _mpSocket
  _mpSocket = io(MP_SERVER)
  return _mpSocket
}

// Joins queue for a game. Calls onMatched({ code, sideBySide }) when matched.
window.mpFindMatch = function(game, { onQueued, onMatched, onLeft, statusEl, btnEl }) {
  // The stall build has no online play at all. Refuse here as well as
  // removing the buttons, so any handler left wired up is still a dead end
  // and the stand never opens a socket to the match server.
  if (window.QG_STALL) {
    if (statusEl) statusEl.textContent = 'Online play is off on this machine.'
    return
  }
  const sock = mpGetSocket()
  const setStatus = (html, color = 'var(--muted)') => {
    if (statusEl) { statusEl.style.color = color; statusEl.innerHTML = html }
  }
  if (btnEl) { btnEl.textContent = '⏳ Searching…'; btnEl.disabled = true }
  setStatus('Connecting to server…')

  let _queuePosition = 1
  const doJoin = () => {
    sock.emit('join-queue', { game })
    if (onQueued) onQueued()
  }
  sock.once('connect', doJoin)
  if (sock.connected) doJoin()

  sock.off('queue-joined'); sock.off('matched'); sock.off('opponent-left')

  sock.on('queue-joined', ({ position }) => {
    _queuePosition = position
    setStatus(position === 1 ? '🔍 Waiting for opponent…' : '⚡ Match found!')
  })

  sock.on('matched', async ({ code }) => {
    setStatus('⚡ Opponent found! Measuring connection…')
    // Measure ping (3 samples)
    const pings = []
    for (let i = 0; i < 3; i++) {
      const t = await new Promise(res => {
        const start = Date.now()
        sock.emit('ping-check', start)
        sock.once('pong-check', () => res(Date.now() - start))
        setTimeout(() => res(999), 2000)
      })
      pings.push(t)
    }
    const avgPing = Math.round(pings.reduce((a, b) => a + b) / pings.length)
    const sideBySide = avgPing < 1000
    setStatus(sideBySide
      ? `✅ ${avgPing}ms ping — side-by-side mode!`
      : `📡 ${avgPing}ms ping — standard mode`)
    if (btnEl) { btnEl.textContent = '⚔️ Find Match'; btnEl.disabled = false }
    setTimeout(() => onMatched({ code, sideBySide, ping: avgPing, isHost: _queuePosition === 1 }), 600)
  })

  sock.on('opponent-left', () => {
    setStatus('Opponent disconnected.', 'var(--danger)')
    if (btnEl) { btnEl.textContent = '⚔️ Find Match'; btnEl.disabled = false }
    if (onLeft) onLeft()
  })

  // Cancel button behaviour
  if (btnEl) {
    btnEl.onclick = () => {
      if (btnEl.disabled) {
        sock.emit('leave-queue')
        btnEl.textContent = '⚔️ Find Match'; btnEl.disabled = false
        setStatus('')
      } else {
        window['mp_findMatch_' + game]?.()
      }
    }
  }
}

// ═══════════════════════════════════════════════════════
//  QUANTUM ENTROPY — measured on real hardware
//
//  data/quantum.bin is 10 qubits x 204,683 measurements taken on a
//  quantum computer, then whitened. Every qubit came out biased toward
//  |0> (49.12% ones overall, z = -25 against a fair coin) because T1
//  relaxation decays |1> during readout — a real property of the chip,
//  not noise. A von Neumann extractor fixed that exactly: read bits in
//  pairs, 01 -> 0, 10 -> 1, discard 00 and 11. Costs 75% of the bits and
//  leaves 511,736 provably unbiased ones.
//
//  Bits are consumed a few at a time with rejection sampling, so
//  qRandInt is uniform for any max — the usual `raw % max` skews results
//  whenever max isn't a power of two, which would have quietly undone
//  the whitening.
// ═══════════════════════════════════════════════════════

let qBits      = null   // Uint8Array of packed quantum bits
let qBitPos    = 0      // read cursor, in bits
let qWraps     = 0      // times the pool has been reused
let qInitPromise = null

// Where index.html lives, worked out once at load. SPA routing pushes
// paths like /some-quantum-games/equation-builder, so a relative fetch
// from there asks for .../equation-builder/data/quantum.bin — a 404 that
// silently dropped the games back to Math.random.
//
// Deliberately not getBasePath(): that only strips the last segment when
// it recognises the slug, so any game missing from GAME_SLUGS would break
// this again. Taking the directory part of the path works either way.
// ═══════════════════════════════════════════════════════
//  BETA SITE
//  Same app, reached at /beta. Games listed here are hidden
//  from the main site entirely — no card, no leaderboard tab,
//  and showGame refuses them — so the only way in is knowing
//  the URL. Nothing links to it.
// ═══════════════════════════════════════════════════════

const BETA_GAMES = new Set([
  37,  // Rhythm
  38,  // Crossy
  45,  // Quantum Freighter
  46,  // Trap Race
])

// Beta sticks for the tab once entered, so navigating into a game (which
// rewrites the URL to its slug) doesn't silently drop you back to main.
let QG_BETA = false
try {
  const p = (typeof location !== 'undefined' && location.pathname) || ''
  const q = (typeof location !== 'undefined' && location.search) || ''
  const fromUrl = /(^|\/)beta\/?$/.test(p) || /[?&]game=beta(&|$)/.test(q)
  QG_BETA = fromUrl || sessionStorage.getItem('qg_beta') === '1'
  if (fromUrl) sessionStorage.setItem('qg_beta', '1')
} catch { QG_BETA = false }
window.QG_BETA = QG_BETA

window.qgLeaveBeta = function() {
  try { sessionStorage.removeItem('qg_beta') } catch {}
  location.href = QG_ROOT
}

const QG_ROOT = (() => {
  const p = (typeof location !== 'undefined' && location.pathname) || '/'
  return p.endsWith('/') ? p : p.slice(0, p.lastIndexOf('/') + 1)
})()

function _quantumSrc() { return QG_ROOT + 'data/quantum.bin' }

// ═══════════════════════════════════════════════════════
//  STALL MODE
//  Same app, reached at /stall — a cut-down build for running
//  the games on a stand. Unlike BETA_GAMES (a blocklist), this
//  is an ALLOWLIST: only the games named here exist at all.
//  Server multiplayer is off entirely, so nothing on the stand
//  depends on the match server being up or on a second machine.
//  Same-device 2P (Wave Gauntlet's 👥 button) still works.
//
//  To add a game: put its number in STALL_GAMES.
// ═══════════════════════════════════════════════════════

const STALL_GAMES = new Set([
  15,  // Entanglement
  40,  // UFO
  43,  // Wave Gauntlet
  44,  // Spider
])

// ── How to play ─────────────────────────────────────────
// A stand gets walk-up players who have never seen the game and
// will not read a paragraph. Each entry is the control first, then
// the goal, then the one thing people get wrong — short enough to
// take in while standing up. Shown on the stall cards only; the
// main site has the card description and the start screen instead.
const STALL_HOWTO = {
  15: { keys: 'Arrow keys \u00B7 SPACE',
        steps: ['Arrows move you; your twin mirrors you on the other side',
                'Grab the BLUE orbs, your twin grabs the PINK ones',
                'The glowing link between you cuts attackers \u2014 sweep it through them'] },
  40: { keys: 'Tap / click / SPACE',
        steps: ['Each tap fires the thruster and lifts you',
                'Let go and you fall \u2014 nothing holds you up',
                'Fly through the gaps; green pillars are safe to land on'] },
  43: { keys: 'Hold / release',
        steps: ['Hold to climb, let go to dive',
                'You are always moving diagonally, never flat',
                'Stay inside the corridor \u2014 touching a wall ends the run'] },
  44: { keys: 'Tap / click / SPACE',
        steps: ['Each tap snaps you between floor and ceiling',
                'There is no in-between \u2014 you are on one or the other',
                'Time the snap so the blocks pass on the empty side'] },
}

let QG_STALL = false
try {
  const sp = (typeof location !== 'undefined' && location.pathname) || ''
  const sq = (typeof location !== 'undefined' && location.search) || ''
  const stallUrl = /(^|\/)stall\/?$/.test(sp) || /[?&]game=stall(&|$)/.test(sq)
  QG_STALL = stallUrl || sessionStorage.getItem('qg_stall') === '1'
  if (stallUrl) sessionStorage.setItem('qg_stall', '1')
} catch { QG_STALL = false }
window.QG_STALL = QG_STALL

window.qgLeaveStall = function() {
  try { sessionStorage.removeItem('qg_stall') } catch {}
  location.href = QG_ROOT
}

// Tidy the address bar the same way beta does
if (QG_STALL && typeof history !== 'undefined' && /[?&]game=stall(&|$)/.test(location.search)) {
  try { history.replaceState({}, '', QG_ROOT + 'stall') } catch {}
}

// Remove every game that is not on the stall list, and every route to the
// match server. The buttons go rather than just being disabled, so there is
// nothing on the stand to press that could sit there saying "searching…".
function qgApplyStall() {
  if (!QG_STALL) return

  // Carnival dressing. The stylesheet is injected rather than linked from
  // index.html so the main site never downloads or applies it.
  document.body.classList.add('stall-mode')
  if (!document.getElementById('stall-css')) {
    const link = document.createElement('link')
    link.id = 'stall-css'
    link.rel = 'stylesheet'
    link.href = QG_ROOT + 'css/stall.css?v=7'
    document.head.appendChild(link)
  }
  const deco = (cls, n) => {
    if (document.querySelector('.' + cls)) return null
    const el = document.createElement('div')
    el.className = cls
    el.setAttribute('aria-hidden', 'true')   // pure decoration
    for (let i = 0; i < n; i++) el.appendChild(document.createElement('i'))
    return el
  }
  const canopy = deco('stall-canopy', 0)
  if (canopy) document.body.insertBefore(canopy, document.body.firstChild)
  const lights = deco('stall-lights', 26)
  if (lights) document.body.insertBefore(lights, document.body.firstChild)
  const header = document.querySelector('.home-header')
  if (header && !document.querySelector('.stall-kicker')) {
    const kicker = document.createElement('span')
    kicker.className = 'stall-kicker'
    kicker.textContent = 'Step right up'
    header.insertBefore(kicker, header.firstChild)
    const bunting = deco('stall-bunting', 15)
    if (bunting) header.parentNode.insertBefore(bunting, header.nextSibling)
  }

  // Make the decorations interactive: bulbs pop and recolour, bunting can be
  // dragged and swings back. Loaded last so every element it binds to exists,
  // and only here so nowhere else pays for it.
  if (!document.getElementById('stall-js')) {
    const s = document.createElement('script')
    s.id = 'stall-js'
    s.src = QG_ROOT + 'js/stall.js?v=3'
    document.body.appendChild(s)
  }

  document.querySelectorAll('.game-card').forEach(card => {
    const m = (card.getAttribute('onclick') || '').match(/showGame\((\d+)\)/)
    if (!m || !STALL_GAMES.has(+m[1])) { card.remove(); return }
    // Instructions go on the card, where someone deciding whether to
    // play can read them without committing to opening the game.
    const how = STALL_HOWTO[+m[1]]
    if (!how || card.querySelector('.stall-how')) return
    const box = document.createElement('div')
    box.className = 'stall-how'
    const head = document.createElement('b')
    head.textContent = 'How to play \u00B7 ' + how.keys
    box.appendChild(head)
    const ul = document.createElement('ul')
    for (const step of how.steps) {
      const li = document.createElement('li')
      li.textContent = step          // textContent, so copy is never markup
      ul.appendChild(li)
    }
    box.appendChild(ul)
    const tag = card.querySelector('.card-tag')
    card.insertBefore(box, tag || null)
  })

  // Leaderboard tabs for games that are not on the stall, and the MP-wins
  // tab, would otherwise sit there listing games nobody can reach from here.
  document.querySelectorAll('[id^="lb-tab-"]').forEach(tab => {
    const m = tab.id.match(/^lb-tab-(\d+)$/)
    if (!m || !STALL_GAMES.has(+m[1])) tab.remove()
  })
  // Building a level is not a stand activity
  document.querySelectorAll('a[href^="editor.html"]').forEach(a => {
    const line = a.closest('p') || a
    line.remove()
  })
  // Online-match controls: every game's queue/match button and its status line
  document.querySelectorAll('[id$="-match-btn"], [id$="-queue-btn"], [id$="-match-status"], [id$="-queue-status"]')
    .forEach(el => el.remove())
  const banner = document.getElementById('beta-banner')
  if (banner) banner.style.display = 'none'
}

// Strip the ?game=beta the 404 shim leaves behind, so the address bar
// reads /beta rather than /?game=beta
if (QG_BETA && typeof history !== 'undefined' && /[?&]game=beta(&|$)/.test(location.search)) {
  try { history.replaceState({}, '', QG_ROOT + 'beta') } catch {}
}

// ═══════════════════════════════════════════════════════
//  LIGHT / DARK THEME — /beta and /stall
//  The main site stays dark, so neither the stylesheet nor the
//  toggle is loaded there. The choice is per-browser and sticks.
// ═══════════════════════════════════════════════════════

function qgSetTheme(mode) {
  const light = mode === 'light'
  document.documentElement.setAttribute('data-theme', light ? 'light' : 'dark')
  try { localStorage.setItem('qg_theme', light ? 'light' : 'dark') } catch {}
  const b = document.getElementById('qg-theme-btn')
  if (b) {
    b.textContent = light ? '\u{1F319}' : '\u2600\uFE0F'
    b.title = light ? 'Switch to dark' : 'Switch to light'
    b.setAttribute('aria-label', b.title)
  }
}
// Games draw to canvas, where no CSS variable reaches, so their draw code
// asks this directly. Safe to call from pages that never load a theme.
function qgLight() {
  return typeof document !== 'undefined' &&
         document.documentElement.getAttribute('data-theme') === 'light'
}
window.qgLight = qgLight

function qgToggleTheme() {
  const now = document.documentElement.getAttribute('data-theme')
  qgSetTheme(now === 'light' ? 'dark' : 'light')
}
window.qgToggleTheme = qgToggleTheme

function qgApplyTheme() {
  if (!QG_BETA && !QG_STALL) return
  if (!document.getElementById('qg-theme-css')) {
    const link = document.createElement('link')
    link.id = 'qg-theme-css'
    link.rel = 'stylesheet'
    link.href = QG_ROOT + 'css/theme.css?v=2'
    document.head.appendChild(link)
  }
  if (!document.getElementById('qg-theme-btn')) {
    const b = document.createElement('button')
    b.id = 'qg-theme-btn'
    b.type = 'button'
    b.addEventListener('click', () => qgToggleTheme())
    document.body.appendChild(b)
  }
  // Saved choice wins; otherwise follow the device, defaulting to dark
  let saved = null
  try { saved = localStorage.getItem('qg_theme') } catch {}
  if (saved !== 'light' && saved !== 'dark') {
    const prefersLight = typeof matchMedia === 'function' &&
                         matchMedia('(prefers-color-scheme: light)').matches
    saved = prefersLight ? 'light' : 'dark'
  }
  qgSetTheme(saved)
}

// Strip beta games out of the main site, and label them on the beta one.
function qgApplyBeta() {
  document.querySelectorAll('.game-card').forEach(card => {
    const m = (card.getAttribute('onclick') || '').match(/showGame\((\d+)\)/)
    if (!m) return
    if (!BETA_GAMES.has(+m[1])) return
    if (!QG_BETA) { card.remove(); return }
    if (!card.querySelector('.beta-flag')) {
      const f = document.createElement('span')
      f.className = 'beta-flag'
      f.textContent = 'BETA'
      card.appendChild(f)
    }
  })
  // Leaderboard tabs for beta games
  for (const id of BETA_GAMES) {
    const tab = document.getElementById('lb-tab-' + id)
    if (tab && !QG_BETA) tab.remove()
  }
  const banner = document.getElementById('beta-banner')
  if (banner) banner.style.display = QG_BETA ? 'flex' : 'none'
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', qgApplyBeta)
  document.addEventListener('DOMContentLoaded', qgApplyStall)
  document.addEventListener('DOMContentLoaded', qgApplyTheme)
}

async function initCurby() {
  if (qInitPromise) return qInitPromise
  qInitPromise = (async () => {
    try {
      const res = await fetch(_quantumSrc(), { cache: 'force-cache' })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      qBits = new Uint8Array(await res.arrayBuffer())
      if (!qBits.length) throw new Error('empty')
      qBitPos = 0
      setEntropyLive(true)
      return true
    } catch (e) {
      console.warn('Quantum data unavailable, using fallback PRNG:', e)
      qBits = null
      setEntropyLive(false)
      return false
    }
  })()
  return qInitPromise
}
window.initCurby = initCurby

// One bit off the pool. Wraps when exhausted — 511k bits is a lot for a
// browser game, but a long session will loop, which is fine here.
function qBit() {
  const byte = qBits[(qBitPos >> 3) % qBits.length]
  const bit  = (byte >> (7 - (qBitPos & 7))) & 1
  qBitPos++
  if (qBitPos >= qBits.length * 8) { qBitPos = 0; qWraps++ }
  return bit
}

function setEntropyLive(live) {
  document.querySelectorAll('.entropy-dot').forEach(el => {
    el.className = 'entropy-dot' + (live ? ' live' : '')
  })
  const label = live ? 'quantum bits' : 'local fallback'
  document.querySelectorAll('.entropy-indicator span').forEach(el => {
    el.textContent = label
  })
}

// How much of the pool is left — for the badge / a debug readout
window.qEntropyStatus = function() {
  if (!qBits) return { live:false }
  const total = qBits.length * 8
  return {
    live: true, totalBits: total, used: qBitPos, wraps: qWraps,
    remaining: total - qBitPos,
    percent: +(100 * (1 - qBitPos / total)).toFixed(1),
  }
}

function qRandInt(max) {
  max = Math.floor(max)
  if (max <= 1) return 0
  if (!qBits) return Math.floor(Math.random() * max)

  // Rejection sampling: draw the fewest whole bits that can hold max-1,
  // discard anything out of range. Unbiased for every max, unlike `% max`.
  const width = 32 - Math.clz32(max - 1)
  for (let tries = 0; tries < 64; tries++) {
    let v = 0
    for (let i = 0; i < width; i++) v = (v << 1) | qBit()
    if (v < max) return v
  }
  return Math.floor(Math.random() * max)   // pathological only
}

function qPickUnique(n, max) {
  if (n > max) n = max
  const arr = Array.from({ length: max }, (_, i) => i)
  // Fisher-Yates driven by qRandInt, so the shuffle is quantum too
  for (let i = arr.length - 1; i > 0; i--) {
    const j = qRandInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr.slice(0, n)
}

// ═══════════════════════════════════════════════════════
//  BACKGROUND PARTICLE CANVAS
// ═══════════════════════════════════════════════════════
const canvas = document.getElementById('bg-canvas')
const ctx = canvas.getContext('2d')
let particles = []

function initCanvas() {
  canvas.width = window.innerWidth
  canvas.height = window.innerHeight
  particles = Array.from({ length: 80 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    r: Math.random() * 1.5 + .3,
    vx: (Math.random() - .5) * .3,
    vy: (Math.random() - .5) * .3,
    alpha: Math.random() * .6 + .2,
  }))
}
function animCanvas() {
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  for (const p of particles) {
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(124,58,237,${p.alpha})`
    ctx.fill()
    p.x += p.vx; p.y += p.vy
    if (p.x < 0) p.x = canvas.width
    if (p.x > canvas.width) p.x = 0
    if (p.y < 0) p.y = canvas.height
    if (p.y > canvas.height) p.y = 0
  }
  requestAnimationFrame(animCanvas)
}
window.addEventListener('resize', initCanvas)
initCanvas(); animCanvas()

// ═══════════════════════════════════════════════════════
//  NAVIGATION
// ═══════════════════════════════════════════════════════
// ── URL routing ─────────────────────────────────────────
const GAME_SLUGS = {
  'gravity-wells':    10,
  'quantum-type':     11,
  'equation-builder': 1,
  'quantum-clicker':   16,
  'particle-collider': 13,
  'wave-collapse':    14,
  'entanglement':     15,
  'quantum-snake':    17,
  'aim-trainer':      2,
  'reaction-test':    3,
  'dodge':            4,
  'flash-number':     5,
  'delta-e':          6,
  'quantum-whip':     18,
  'gravity-sling':    22,
  'charge-rush':      23,
  'pulse':            24,
  'orbit':            26,
  'parkour':          28,
  'qblaster':         29,
  'micro-rts':        30,
  'runaway-snake':    31,
  'gravity-flipper':  32,
  'memory-seq':       33,
  'manual-sort':      34,
  'wave-dash':        35,
  'cps':              36,
  'spider':           44,
  'freighter':        45,
  'trap-race':        46,
  'chsh':             47,
}
const SLUG_BY_ID = Object.fromEntries(Object.entries(GAME_SLUGS).map(([k,v]) => [v, k]))

function getBasePath() {
  // Works on both Netlify (/) and GitHub Pages (/some-quantum-games/)
  const segs = window.location.pathname.split('/').filter(Boolean)
  const knownSlugs = new Set(Object.keys(GAME_SLUGS))
  if (segs.length && knownSlugs.has(segs[segs.length - 1])) {
    return '/' + segs.slice(0, -1).join('/')
  }
  return window.location.pathname.replace(/\/$/, '')
}

function pushGameUrl(n) {
  const slug = SLUG_BY_ID[n]
  if (!slug) return
  const base = getBasePath()
  history.pushState({ game: n }, '', base + '/' + slug)
}

function pushHomeUrl() {
  const base = getBasePath()
  const url = base === '/' ? '/' : base + '/'
  history.pushState({ home: true }, '', url)
}

window.showGame = function(n) {
  // Beta games simply do not exist on the main site
  if (BETA_GAMES.has(n) && !QG_BETA) { if (typeof goHome === 'function') goHome(); return }
  // On the stall, only the listed games exist — a stale link or a typed
  // ?game= slug for anything else lands back on the home screen
  if (QG_STALL && !STALL_GAMES.has(n)) { if (typeof goHome === 'function') goHome(); return }
  document.getElementById('home').classList.remove('active')
  document.getElementById(`game${n}`).classList.add('active')
  pushGameUrl(n)
  if (n === 1)  initGame1()
  if (n === 2)  initGame2()
  if (n === 3)  initGame3()
  if (n === 4)  initGame4()
  if (n === 5)  initGame5()
  if (n === 6)  initGame6()
  if (n === 10) initGame10()
  if (n === 11) initGame11()
  if (n === 13) initGame13()
  if (n === 14) initGame14()
  if (n === 15) initGame15()
  if (n === 16) initGame16()
  if (n === 17) initGame17()
  if (n === 18) initGame18()
  if (n === 22) initGame22()
  if (n === 23) initGame23()
  if (n === 24) initGame24()
  if (n === 26) initGame26()
  if (n === 28) initGame28()
  if (n === 29) initGame29()
  if (n === 30) initGame30()
  if (n === 31) initGame31()
  if (n === 32) initGame32()
  if (n === 33) initGame33()
  if (n === 34) initGame34()
  if (n === 35) initGame35()
  if (n === 36) initGame36()
  if (n === 39) initLimboGame()
  if (n === 40) initGame40()
  if (n === 41) initGame41()
  if (n === 42) initGame42()
  if (n === 43) initGame43()
  if (n === 44) initSpider()
  if (n === 45) initGame45()
  if (n === 46) initGame46()
  if (n === 47) initGame47()
}

window.goHome = function() {
  stopG1Timer(); stopSpawn(); stopReact(); stopDodge(); stopFlash(); stopDeltaE()
  stopGame10(); stopGame11()
  if (typeof G13 !== 'undefined') G13.active = false
  if (typeof G14 !== 'undefined') { G14.active = false; clearInterval(g14Interval) }
  if (typeof G15 !== 'undefined') G15.active = false
  if (typeof G17 !== 'undefined') G17.active = false
  if (typeof G18 !== 'undefined') G18.active = false
  if (typeof G22 !== 'undefined') G22.active = false
  if (typeof G23 !== 'undefined') G23.active = false
  if (typeof G24 !== 'undefined') G24.active = false
  if (typeof G26 !== 'undefined') G26.active = false
  if (typeof G28 !== 'undefined') G28.active = false
  if (typeof G29 !== 'undefined') stopGame29()
  if (typeof G30 !== 'undefined') stopGame30()
  if (typeof G31 !== 'undefined') stopGame31()
  if (typeof G32 !== 'undefined') stopGame32()
  if (typeof G33 !== 'undefined') stopGame33()
  if (typeof G34 !== 'undefined') stopGame34()
  if (typeof stopGame35 === 'function') stopGame35()
  if (typeof stopGame36 === 'function') stopGame36()
  if (typeof stopLimboGame === 'function') stopLimboGame()
  if (typeof stopGame40    === 'function') stopGame40()
  if (typeof stopGame41    === 'function') stopGame41()
  if (typeof stopGame42    === 'function') stopGame42()
  if (typeof stopGame43    === 'function') stopGame43()
  if (typeof stopGame47    === 'function') stopGame47()
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'))
  document.getElementById('home').classList.add('active')
  pushHomeUrl()
}

// Handle browser back/forward
window.addEventListener('popstate', e => {
  if (e.state && e.state.game) showGame(e.state.game)
  else if (e.state && e.state.login) AUTH.openPage()
  else goHome()
})

// On page load: check if URL is a direct game or login link
;(function() {
  const segs = window.location.pathname.split('/').filter(Boolean)
  const slug = segs[segs.length - 1]
  const routedGame = new URLSearchParams(window.location.search).get('game')
  const gameId = GAME_SLUGS[slug] || GAME_SLUGS[routedGame]
  if (gameId) {
    window.addEventListener('load', () => showGame(gameId))
  } else if (slug === 'login') {
    window.addEventListener('load', () => {
      // If there's an OAuth token in the hash, let auth.js handle it — don't show login screen
      if (!window.location.hash.includes('access_token') && typeof AUTH !== 'undefined') AUTH.openPage()
    })
  }
})()

window.restartGame = function(n) {
  document.getElementById(`g${n}-over`).classList.remove('show')
  if (n === 1) initGame1()
  if (n === 2) initGame2()
  if (n === 3) initGame3()
  if (n === 4) initGame4()
  if (n === 5) initGame5()
  if (n === 6) initGame6()
  if (n === 10) initGame10()
  if (n === 11) initGame11()
  if (n === 13) initGame13()
  if (n === 14) initGame14()
  if (n === 15) initGame15()
  if (n === 16) initGame16()
  if (n === 17) initGame17()
  if (n === 18) initGame18()
  if (n === 22) initGame22()
  if (n === 23) initGame23()
  if (n === 24) initGame24()
  if (n === 26) initGame26()
  if (n === 28) initGame28()
  if (n === 29) initGame29()
  if (n === 30) initGame30()
  if (n === 31) initGame31()
  if (n === 32) initGame32()
  if (n === 33) initGame33()
  if (n === 34) initGame34()
  if (n === 35) initGame35()
  if (n === 36) initGame36()
}

// ═══════════════════════════════════════════════════════
//  TRACKMANIA-STYLE MEDALS
// ═══════════════════════════════════════════════════════
const MEDALS = {
  equation: { bronze: 50,   silver: 150, gold: 300  },
  aim:      { bronze: 100,  silver: 300, gold: 600  },
  qwhip:       { bronze: 1200, silver: 3500,  gold: 8000  },
  gravitysling:{ bronze: 350,  silver: 900,   gold: 2000  },
  chargerush:  { bronze: 300,  silver: 1000,  gold: 3000  },
  pulse:       { bronze: 500,  silver: 2000,  gold: 5000  },
  orbit:       { bronze: 300,  silver: 800,   gold: 2000  },
  parkour:     { bronze: 400,  silver: 1200,  gold: 3000  },
  reaction: { bronze: 300,  silver: 230, gold: 180  },
  dodge:    { bronze: 100,  silver: 250, gold: 450  },
  flash:    { bronze: 4,    silver: 6,   gold: 8    },
  deltae:   { bronze: 1200, silver: 2400, gold: 3400 },
  gravity:  { bronze: 100,  silver: 300, gold: 500  },
  typing:   { bronze: 40,   silver: 70,  gold: 100  },
  mrts:     { bronze: 100,  silver: 350, gold: 800  },
  runsnake: { bronze: 10,   silver: 25,  gold: 50   },
  gravflip: { bronze: 10,   silver: 25,  gold: 50   },
  memseq:   { bronze: 5,    silver: 10,  gold: 16   },
  manualsort: { bronze: 1, silver: 700, gold: 850, author: 930 },
  wavedash:   { bronze: 30, silver: 100, gold: 250 },
  cps:        { bronze: 5,  silver: 8,   gold: 11  },
  // Starting guesses — tune once there are real scores to look at
  rhythm:       { bronze: 5,  silver: 12, gold: 21 },
  ufo:          { bronze: 10, silver: 25, gold: 45 },
  wavegauntlet: { bronze: 5,  silver: 12, gold: 20 },
  spider:       { bronze: 4,  silver: 10, gold: 18 },
  freighter:    { bronze: 15, silver: 40, gold: 80 },
  traprace:     { bronze: 3,  silver: 7,  gold: 10 },
}

let authorScores   = { equation: null, aim: null, reaction: null, dodge: null, flash: null, deltae: null, gravity: null, typing: null, mrts: null, runsnake: null, gravflip: null, memseq: null, manualsort: null, wavedash: null, cps: null }
let coauthorScores = { equation: null, aim: null, reaction: null, dodge: null, flash: null, deltae: null, gravity: null, typing: null, mrts: null, runsnake: null, gravflip: null, memseq: null, manualsort: null, wavedash: null, cps: null }

// Co-authors and the leaderboard names they play under. Beating any of
// them earns the co-author medal; add a name here and everything else —
// the medal, the badge, the "you beat X" line — follows automatically.
const COAUTHORS = {
  ARAV: ['arav', 'aravthegoat', 'arav:)'],
  AMEY: ['amey'],
}
const COAUTHOR_NAMES = Object.values(COAUTHORS).flat()

// Which co-author currently holds the bar in each game, so the medal can
// name them instead of guessing.
let coauthorHolder = {}

function _coauthorFor(name) {
  const n = String(name || '').trim().toLowerCase()
  for (const [who, names] of Object.entries(COAUTHORS)) {
    if (names.includes(n)) return who
  }
  return null
}

async function fetchAuthorScores() {
  for (const game of ['equation','aim','reaction','dodge','flash','deltae','gravity','typing','mrts','runsnake','gravflip','memseq','manualsort','wavedash','cps']) {
    try {
      const rows = await sbFetch(`/rest/v1/leaderboard?game=eq.${game}&name=eq.ARHAM&order=score.desc&limit=1`)
      if (rows && rows.length > 0 && rows[0].score > 0) authorScores[game] = rows[0].score
    } catch {}
    // Best co-author score across every co-author and every name variant
    try {
      let best = null, holder = null
      for (const name of COAUTHOR_NAMES) {
        const rows = await sbFetch(`/rest/v1/leaderboard?game=eq.${game}&name=eq.${encodeURIComponent(name)}&order=score.desc&limit=1`)
        if (rows && rows.length > 0) {
          const s = rows[0].score
          if (s > 0 && (best === null || (LOWER_IS_BETTER.has(game) ? s < best : s > best))) {
            best = s; holder = _coauthorFor(name)
          }
        }
      }
      if (best !== null) { coauthorScores[game] = best; coauthorHolder[game] = holder }
    } catch {}
  }
}

const LOWER_IS_BETTER = new Set(['reaction'])

// Returns array of all medals earned (e.g. ['gold','author','coauthor'])
function getMedals(game, score) {
  const t = MEDALS[game]
  if (!t) return []
  const medals = []
  const author   = authorScores[game]
  const coauthor = coauthorScores[game]
  const lower = LOWER_IS_BETTER.has(game)
  if (author   !== null && (lower ? score < author   : score > author))   medals.push('author')
  if (coauthor !== null && (lower ? score < coauthor : score > coauthor)) medals.push('coauthor')
  if (lower) {
    if (score <= t.gold)   medals.push('gold')
    else if (score <= t.silver) medals.push('silver')
    else if (score <= t.bronze) medals.push('bronze')
  } else {
    if (score >= t.gold)   medals.push('gold')
    else if (score >= t.silver) medals.push('silver')
    else if (score >= t.bronze) medals.push('bronze')
  }
  return medals
}

// Backwards-compat shim for code that only wants one medal
function getMedal(game, score) { return getMedals(game, score)[0] || null }

const MEDAL_META = {
  bronze:   { icon: '🥉', label: 'Bronze Medal',    cls: 'medal-bronze',   bg: 'rgba(180,100,40,.12)'  },
  silver:   { icon: '🥈', label: 'Silver Medal',    cls: 'medal-silver',   bg: 'rgba(148,163,184,.12)' },
  gold:     { icon: '🥇', label: 'Gold Medal',      cls: 'medal-gold',     bg: 'rgba(245,158,11,.12)'  },
  author:   { icon: '👾', label: 'Author Medal',    cls: 'medal-author',   bg: 'rgba(124,58,237,.15)'  },
  coauthor: { icon: '🌟', label: 'Co-Author Medal', cls: 'medal-coauthor', bg: 'rgba(251,191,36,.12)'  },
}

function renderMedalDisplay(elId, game, score) {
  const el = document.getElementById(elId)
  if (!el) return
  const medals = getMedals(game, score)
  if (!medals.length) { el.innerHTML = ''; return }
  el.innerHTML = `<div style="display:flex;gap:.5rem;flex-wrap:wrap;justify-content:center;">` +
    medals.map(medal => {
      const m = MEDAL_META[medal]
      const sub = medal === 'author' ? ' — You beat ARHAM!'
                : medal === 'coauthor' ? ` — You beat ${coauthorHolder[game] || 'a co-author'}!` : ''
      return `<div class="medal-earned" style="background:${m.bg};">
        <div class="medal-icon">${m.icon}</div>
        <div class="medal-label ${m.cls}">${m.label}${sub}</div>
      </div>`
    }).join('') + `</div>`
}

function medalBadgeHtml(game, score) {
  return getMedals(game, score).map(medal => {
    const m = MEDAL_META[medal]
    return ` <span class="medal ${m.cls}">${m.icon} ${medal}</span>`
  }).join('')
}

// ═══════════════════════════════════════════════════════
//  COOKIES / LOCAL STORAGE
// ═══════════════════════════════════════════════════════
function cookieSet(key, val, days = 365) {
  const d = new Date(); d.setTime(d.getTime() + days * 864e5)
  document.cookie = `${key}=${encodeURIComponent(val)};expires=${d.toUTCString()};path=/;SameSite=Lax`
}
function cookieGet(key) {
  const m = document.cookie.match(new RegExp('(?:^|; )' + key + '=([^;]*)'))
  return m ? decodeURIComponent(m[1]) : null
}

function getPB(game) {
  const v = localStorage.getItem('pb_' + game)
  if (v === null) return LOWER_IS_BETTER.has(game) ? 99999 : 0
  return parseFloat(v)
}
function setPB(game, score) {
  const better = LOWER_IS_BETTER.has(game) ? score < getPB(game) : score > getPB(game)
  if (better) { localStorage.setItem('pb_' + game, score); return true }
  return false
}

// ═══════════════════════════════════════════════════════
//  ADMIN AUTH
// ═══════════════════════════════════════════════════════
const ADMIN_NAME = 'ARHAM'
const ADMIN_HASH = 'd4c39c00879d9caf8fdee691d3cfe371b48767334f2c8c49313b439f31f46455'

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}


// ═══════════════════════════════════════════════════════
//  SUPABASE LEADERBOARD
// ═══════════════════════════════════════════════════════
const SB_URL = 'https://kuvpxhuvednptyfqccea.supabase.co'
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1dnB4aHV2ZWRucHR5ZnFjY2VhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4NjY4MTcsImV4cCI6MjA5MDQ0MjgxN30.tYb15AI3DfwSjYrYrLVUPhOJjh8tfAvglPGXmunEA4k'

async function sbFetch(path, options = {}) {
  const res = await fetch(SB_URL + path, {
    ...options,
    headers: {
      'apikey': SB_KEY,
      'Authorization': 'Bearer ' + SB_KEY,
      'Content-Type': 'application/json',
      'Prefer': options.prefer || '',
      ...(options.headers || {}),
    },
  })
  if (!res.ok) throw new Error(await res.text())
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

function escHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
}

function scoreToDisplay(game, score) {
  if (game === 'reaction') return score + ' ms'
  if (game === 'dodge') return (score / 10).toFixed(1) + 's'
  if (game === 'gravity') return score + ' pts'
  if (game === 'flash') return score + '/10'
  if (game === 'deltae') return score + ' pts'
  if (game === 'typing') return score + ' WPM'
  return score.toLocaleString()
}

let lbCurrentGame = 'parkour'

const LB_TABS = [
  { id: 'lb-tab-1',  game: 'equation', label: 'Equation', color: null,        cls: '' },
  { id: 'lb-tab-2',  game: 'aim',      label: 'Aim',      color: null,        cls: 'cyan' },
  { id: 'lb-tab-3',  game: 'reaction', label: 'Reaction', color: 'var(--success)' },
  { id: 'lb-tab-4',  game: 'dodge',    label: 'Dodge',    color: 'var(--danger)'  },
  { id: 'lb-tab-5',  game: 'flash',    label: 'Flash',    color: '#f59e0b'         },
  { id: 'lb-tab-6',  game: 'deltae',   label: 'Delta E',  color: '#ec4899'         },
  { id: 'lb-tab-10', game: 'gravity',      label: 'Gravity',  color: 'var(--accent)'   },
  { id: 'lb-tab-11', game: 'typing',       label: 'Typing',   color: '#34d399'          },
  { id: 'lb-tab-16', game: 'qclicker',    label: 'Clicker',  color: '#fbbf24'          },
  { id: 'lb-tab-13', game: 'collider',     label: 'Collider',     color: '#22d3ee'  },
  { id: 'lb-tab-14', game: 'wavecollapse', label: 'Wave',         color: '#c084fc'  },
  { id: 'lb-tab-15', game: 'entanglement', label: 'Entanglement', color: '#a78bfa'  },
  { id: 'lb-tab-17', game: 'qsnake',       label: 'Snake',        color: '#4ade80'  },
  { id: 'lb-tab-18', game: 'qwhip',        label: 'Whip',         color: '#a78bfa'  },
  { id: 'lb-tab-22', game: 'gravitysling', label: 'Sling',        color: '#fca5a5'  },
  { id: 'lb-tab-23', game: 'chargerush',   label: 'Charge',       color: '#818cf8'  },
  { id: 'lb-tab-24', game: 'pulse',        label: 'Pulse',        color: '#fbbf24'  },
  { id: 'lb-tab-26', game: 'orbit',        label: 'Orbit',        color: '#34d399'  },
  { id: 'lb-tab-28', game: 'parkour',      label: 'Parkour',      color: '#fb923c'  },
  { id: 'lb-tab-29', game: 'qblaster',    label: 'Blaster',      color: '#e879f9'  },
  { id: 'lb-tab-30', game: 'mrts',        label: 'Micro RTS',    color: '#60a5fa'  },
  { id: 'lb-tab-31', game: 'runsnake',    label: 'Run Snake',    color: '#4ade80'  },
  { id: 'lb-tab-32', game: 'gravflip',    label: 'Grav Flip',    color: '#f472b6'  },
  { id: 'lb-tab-33', game: 'memseq',      label: 'Memory',       color: '#a78bfa'  },
  { id: 'lb-tab-34', game: 'manualsort',  label: 'Manual Sort',  color: '#4a7c59'  },
  { id: 'lb-tab-35', game: 'wavedash',    label: 'Wave Dash',    color: '#06b6d4'  },
  { id: 'lb-tab-36', game: 'cps',         label: 'CPS',          color: '#6366f1'  },
  { id: 'lb-tab-37', game: 'rhythm',     label: 'Rhythm',     color: '#f472b6' },
  { id: 'lb-tab-42', game: 'typerracer', label: 'Typer',      color: '#06b6d4' },
  { id: 'lb-tab-40', game: 'ufo',        label: 'UFO Flap', color: '#a855f7' },
  { id: 'lb-tab-43', game: 'wavegauntlet', label: 'Wave Gauntlet', color: '#22c55e' },
  { id: 'lb-tab-44', game: 'spider',       label: 'Spider',        color: '#a855f7' },
  { id: 'lb-tab-45', game: 'freighter',    label: 'Freighter',     color: '#22d3ee' },
  { id: 'lb-tab-46', game: 'traprace',     label: 'Trap Race',     color: '#fb923c' },
]

window.switchLbTab = function(game) {
  lbCurrentGame = game
  // MP wins tab is special
  const mpBtn = document.getElementById('lb-tab-mp')
  if (mpBtn) mpBtn.style.cssText = game === 'mp'
    ? 'background:#a78bfa;border-color:#a78bfa;color:#fff;'
    : 'border-color:#a78bfa;color:#a78bfa;'
  if (game === 'mp') { loadMpLeaderboard(); return }
  for (const tab of LB_TABS) {
    const el = document.getElementById(tab.id)
    if (!el) continue
    const active = tab.game === game
    if (tab.color) {
      el.style.cssText = active
        ? `background:${tab.color};border-color:${tab.color};color:#fff;`
        : `border-color:${tab.color};color:${tab.color};`
      el.className = 'lb-tab'
    } else if (tab.cls === 'cyan') {
      el.className = 'lb-tab cyan' + (active ? ' active' : '')
      el.style.cssText = ''
    } else {
      el.className = 'lb-tab' + (active ? ' active' : '')
      el.style.cssText = ''
    }
  }
  loadLeaderboard(game)
}

async function loadLeaderboard(game) {
  const list = document.getElementById('lb-list')
  list.innerHTML = '<div class="lb-loading"><div class="spinner"></div> Loading…</div>'
  try {
    console.log('Loading leaderboard for game:', game)
    const order = LOWER_IS_BETTER.has(game) ? 'score.asc' : 'score.desc'
    const url = `/rest/v1/leaderboard?game=eq.${game}&order=${order}&limit=100`
    console.log('Fetching URL:', url)
    const rawRows = await sbFetch(url)
    console.log('Raw response:', rawRows)
    if (!rawRows || rawRows.length === 0) {
      list.innerHTML = '<div class="lb-empty">No scores yet — be the first!</div>'
      return
    }
    const seen = new Map()
    for (const r of rawRows) {
      const key = r.name.toLowerCase()
      if (!seen.has(key)) {
        seen.set(key, r)
      } else {
        const existing = seen.get(key)
        const isBetter = LOWER_IS_BETTER.has(game) ? r.score < existing.score : r.score > existing.score
        if (isBetter) seen.set(key, r)
      }
    }
    const rows = Array.from(seen.values())
      .sort((a, b) => LOWER_IS_BETTER.has(game) ? a.score - b.score : b.score - a.score)
      .slice(0, 10)

    const rankLabels = ['🥇', '🥈', '🥉']
    const myName = cookieGet('player_name') || ''
    const pb = getPB(game)
    list.innerHTML = rows.map((r, i) => {
      const isAdmin = r.name.toUpperCase() === ADMIN_NAME
      const isMe = myName && r.name === myName
      const isArav = _coauthorFor(r.name) !== null
      const aravBadge = isArav
        ? ' <span class="medal medal-coauthor">🌟 co-author</span>' : ''
      const authorBadge = isAdmin
        ? ' <span class="medal medal-author-badge">AUTHOR</span>' : ''
      const youBadge = isMe
        ? ' <span style="font-size:.7rem;background:rgba(124,58,237,.25);color:var(--accent);padding:.1rem .4rem;border-radius:4px;vertical-align:middle">you</span>' : ''
      const medalBadge = isAdmin
        ? ' <span class="medal medal-earned medal-author"><span class="medal-icon">👾</span><span class="medal-label">Author</span></span>'
        : isArav
        ? ' <span class="medal medal-earned medal-coauthor"><span class="medal-icon">🌟</span><span class="medal-label">Co-Author</span></span>'
        : medalBadgeHtml(game, r.score)
      const scoreDisplay = scoreToDisplay(game, r.score)
      const scoreStyle = game === 'aim' ? 'class="lb-score cyan"'
        : game === 'reaction' ? 'class="lb-score" style="color:var(--success)"'
        : game === 'dodge' ? 'class="lb-score" style="color:var(--danger)"'
        : game === 'gravity' ? 'class="lb-score" style="color:var(--accent)"'
        : game === 'typing' ? 'class="lb-score" style="color:#34d399"'
        : 'class="lb-score"'
      return `
        <div class="lb-row" style="${isMe ? 'background:rgba(124,58,237,.1);border:1px solid rgba(124,58,237,.3);' : ''}">
          <span class="lb-rank ${i===0?'gold':i===1?'silver':i===2?'bronze':''}">${rankLabels[i] || i+1}</span>
          <span class="lb-name">${escHtml(r.name)}${authorBadge}${aravBadge}${youBadge}${medalBadge}</span>
          <span ${scoreStyle}>${scoreDisplay}</span>
        </div>`
    }).join('')

    const pbValid = LOWER_IS_BETTER.has(game) ? pb < 99999 : pb > 0
    if (pbValid && myName && !rows.find(r => r.name === myName)) {
      const pbDisplay = scoreToDisplay(game, pb)
      list.innerHTML += `
        <div style="margin-top:.5rem;padding-top:.5rem;border-top:1px solid var(--border);">
          <div class="lb-row" style="background:rgba(124,58,237,.08);border:1px solid rgba(124,58,237,.2);">
            <span class="lb-rank">—</span>
            <span class="lb-name">${escHtml(myName)} <span style="font-size:.7rem;background:rgba(124,58,237,.25);color:var(--accent);padding:.1rem .4rem;border-radius:4px;">you</span>${medalBadgeHtml(game, pb)}</span>
            <span class="lb-score ${game==='aim'?'cyan':''}">PB: ${pbDisplay}</span>
          </div>
        </div>`
    }
  } catch (e) {
    list.innerHTML = '<div class="lb-empty">Could not load scores: ' + (e.message || 'Unknown error') + '</div>'
    console.warn('Leaderboard load failed:', e)
  }
}

// ── Multiplayer win tracking ──────────────────────────
window.recordMpResult = async function(game, won) {
  if (!_sb || !AUTH.user || !AUTH.profile) return
  try {
    const uid  = AUTH.user.id
    const name = AUTH.profile.display_name
    const { data } = await _sb.from('mp_wins')
      .select('wins,losses').eq('user_id', uid).eq('game', game).maybeSingle()
    if (data) {
      await _sb.from('mp_wins')
        .update(won ? { wins: data.wins + 1 } : { losses: data.losses + 1 })
        .eq('user_id', uid).eq('game', game)
    } else {
      await _sb.from('mp_wins')
        .insert({ user_id: uid, display_name: name, game, wins: won ? 1 : 0, losses: won ? 0 : 1 })
    }
  } catch(e) { console.warn('recordMpResult failed:', e) }
}

async function loadMpLeaderboard() {
  const list = document.getElementById('lb-list')
  list.innerHTML = '<div class="lb-loading"><div class="spinner"></div> Loading…</div>'
  try {
    const rows = await sbFetch('/rest/v1/mp_wins?select=display_name,game,wins,losses&order=wins.desc')
    if (!rows || rows.length === 0) {
      list.innerHTML = '<div class="lb-empty">No multiplayer matches yet — go play!</div>'
      return
    }
    // Aggregate per player
    const players = {}
    for (const r of rows) {
      if (!players[r.display_name]) players[r.display_name] = { wins: 0, losses: 0, games: {} }
      players[r.display_name].wins   += r.wins
      players[r.display_name].losses += r.losses
      players[r.display_name].games[r.game] = { wins: r.wins, losses: r.losses }
    }
    const sorted = Object.entries(players)
      .sort((a, b) => b[1].wins - a[1].wins)
      .slice(0, 10)
    const rankLabels = ['🥇', '🥈', '🥉']
    const gameLabels = { cps: '🖱️CPS', typing: '⌨️Type', wavedash: '〰️Wave', parkour: '🏃Park' }
    list.innerHTML = sorted.map(([name, p], i) => {
      const total  = p.wins + p.losses
      const rate   = total > 0 ? Math.round(p.wins / total * 100) : 0
      const detail = Object.entries(p.games)
        .map(([g, s]) => `${gameLabels[g] || g} ${s.wins}W/${s.losses}L`)
        .join(' · ')
      return `
        <div class="lb-row">
          <span class="lb-rank ${i===0?'gold':i===1?'silver':i===2?'bronze':''}">${rankLabels[i] || i+1}</span>
          <span class="lb-name" style="flex-direction:column;align-items:flex-start;gap:.1rem;">
            ${escHtml(name)}
            <span style="font-size:.72rem;color:var(--muted);font-weight:400;">${detail}</span>
          </span>
          <span class="lb-score" style="color:#a78bfa;flex-direction:column;align-items:flex-end;gap:.1rem;">
            <span>${p.wins}W / ${p.losses}L</span>
            <span style="font-size:.75rem;color:var(--muted);">${rate}% win rate</span>
          </span>
        </div>`
    }).join('')
  } catch(e) {
    list.innerHTML = '<div class="lb-empty">Could not load MP stats.</div>'
    console.warn('loadMpLeaderboard failed:', e)
  }
}

// ═══════════════════════════════════════════════════════
//  SUBMIT SCORE
// ═══════════════════════════════════════════════════════
let pendingSubmit = null

const SCORE_COLORS = {
  aim: 'var(--accent2)', reaction: 'var(--success)', dodge: 'var(--danger)',
  flash: '#f59e0b', deltae: '#ec4899', qwhip: '#a78bfa',
  gravitysling: '#fca5a5', chargerush: '#818cf8',
  pulse: '#fbbf24', orbit: '#34d399', parkour: '#fb923c',
  gravity: 'var(--accent)',
  typing:  '#34d399',
  mrts:     '#60a5fa',
  runsnake: '#4ade80',
  gravflip: '#f472b6',
  memseq:   '#a78bfa',
  manualsort: '#4a7c59',
  wavedash:   '#06b6d4',
  cps:        '#6366f1',
  crossy:     '#4ade80',
  ufo:        '#a855f7',
  jetrush:     '#f97316',
  typerracer:    '#06b6d4',
  rhythm:        '#f472b6',
  wavegauntlet:  '#22c55e',
  spider:        '#a855f7',
  freighter:     '#22d3ee',
  traprace:      '#fb923c',
}

window.openSubmit = function(game) {
  let score = 0
  if (game === 'equation') score = window._g1Score || 0
  else if (game === 'aim') score = window.G2 ? window.G2.score : 0
  else if (game === 'reaction') score = window._g3Score || 9999
  else if (game === 'dodge')    score = window._g4Score || 0
  else if (game === 'flash')    score = window._g5Score || 0
  else if (game === 'deltae')   score = window._g6Score || 0
  else if (game === 'cursor')   score = window._g7Score || 0
  else if (game === 'tiles')    score = window._g8Score || 0
  else if (game === 'swarm')    score = window._g9Score || 0
  else if (game === 'gravity')    score = window._g10Score  || 0
  else if (game === 'typing')     score = window._g11Score  || 0
  else if (game === 'qclicker')     score = typeof G16 !== 'undefined' ? Math.floor(G16.totalProduced || 0) : 0
  else if (game === 'collider')     score = window._g13Score  || 0
  else if (game === 'wavecollapse') score = window._g14Score  || 0
  else if (game === 'entanglement') score = window._g15Score  || 0
  else if (game === 'qsnake')       score = window._g17Score  || 0
  else if (game === 'qwhip')        score = window._g18Score  || 0
  else if (game === 'gravitysling') score = window._g22Score  || 0
  else if (game === 'chargerush')   score = window._g23Score  || 0
  else if (game === 'pulse')        score = window._g24Score  || 0
  else if (game === 'orbit')        score = window._g26Score  || 0
  else if (game === 'parkour')      score = window._g28Score  || 0
  else if (game === 'qblaster')     score = window._g29Score  || 0
  else if (game === 'mrts')         score = window._g30Score  || 0
  else if (game === 'runsnake')     score = window._g31Score  || 0
  else if (game === 'gravflip')     score = window._g32Score  || 0
  else if (game === 'memseq')       score = window._g33Score  || 0
  else if (game === 'manualsort')   score = window._g34Score  || 0
  else if (game === 'wavedash')     score = window._g35Score  || 0
  else if (game === 'cps')          score = window._g36Score  || 0
  else if (game === 'crossy')       score = window._g38Score  || 0
  else if (game === 'ufo')          score = window._g40Score  || 0
  else if (game === 'jetrush')      score = window._g41Score  || 0
  else if (game === 'typerracer')   score = window._g42Score  || 0
  else if (game === 'rhythm')       score = window._g37Score  || 0
  else if (game === 'wavegauntlet') score = window._g43Score  || 0
  else if (game === 'spider')       score = window._spdScore  || 0
  else if (game === 'freighter')    score = window._g45Score  || 0
  else if (game === 'traprace')     score = window._g46Score  || 0

  pendingSubmit = { game, score }
  document.getElementById('sub-score-display').textContent = scoreToDisplay(game, score)
  document.getElementById('sub-score-display').style.color = SCORE_COLORS[game] || 'var(--accent)'

  const pb = getPB(game)
  const pbEl = document.getElementById('sub-pb-info')
  const pbValid = LOWER_IS_BETTER.has(game) ? pb < 99999 : pb > 0
  if (pbValid) {
    const improved = LOWER_IS_BETTER.has(game) ? score < pb : score > pb
    pbEl.textContent = improved
      ? `New personal best! (was ${scoreToDisplay(game, pb)})`
      : `Your best: ${scoreToDisplay(game, pb)}`
    pbEl.style.color = improved ? 'var(--success)' : 'var(--muted)'
  } else {
    pbEl.textContent = 'First time playing!'
    pbEl.style.color = 'var(--muted)'
  }

  const authName = (typeof AUTH !== 'undefined') ? AUTH.getDisplayName() : null

  // logged-in users skip the form entirely — submit immediately
  if (authName) {
    document.getElementById('sub-name-input').value = authName
    submitScore()
    return
  }

  const nameInput = document.getElementById('sub-name-input')
  nameInput.value = cookieGet('player_name') || ''
  nameInput.readOnly = false; nameInput.style.opacity = ''; nameInput.title = ''
  document.getElementById('sub-status').textContent = ''
  document.getElementById('sub-submit-btn').disabled = false
  document.getElementById('admin-pw-row').style.display = 'none'
  document.getElementById('sub-admin-pw').value = ''
  document.getElementById('submit-overlay').classList.add('show')
  setTimeout(() => nameInput.focus(), 100)
}

document.getElementById('sub-name-input').addEventListener('input', () => {
  const val = document.getElementById('sub-name-input').value.trim().toUpperCase()
  const pwRow = document.getElementById('admin-pw-row')
  const alreadyAuthed = typeof AUTH !== 'undefined' && AUTH.user
  if (val === ADMIN_NAME && !alreadyAuthed) {
    pwRow.style.display = 'flex'
    document.getElementById('sub-admin-pw').focus()
  } else {
    pwRow.style.display = 'none'
  }
})

document.getElementById('sub-name-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') submitScore()
})
document.getElementById('sub-admin-pw').addEventListener('keydown', e => {
  if (e.key === 'Enter') submitScore()
})

window.submitScore = async function() {
  const nameRaw = document.getElementById('sub-name-input').value.trim()
  if (!nameRaw) {
    document.getElementById('sub-status').textContent = 'Please enter your name.'
    return
  }

  const isLoggedIn = typeof AUTH !== 'undefined' && AUTH.user
  if (nameRaw.toUpperCase() === ADMIN_NAME && !isLoggedIn) {
    const pw = document.getElementById('sub-admin-pw').value
    if (!pw) {
      document.getElementById('sub-status').textContent = 'Enter the admin password to use this name.'
      document.getElementById('sub-admin-pw').focus()
      return
    }
    const hashed = await sha256(pw)
    if (hashed !== ADMIN_HASH) {
      document.getElementById('sub-status').textContent = 'Wrong password.'
      document.getElementById('sub-admin-pw').value = ''
      return
    }
  }

  const name = nameRaw.toUpperCase() === ADMIN_NAME ? ADMIN_NAME : nameRaw
  const btn = document.getElementById('sub-submit-btn')
  btn.disabled = true
  document.getElementById('sub-status').textContent = 'Submitting…'

  // anonymous users: block names claimed by registered accounts
  if (!isLoggedIn && name.toUpperCase() !== ADMIN_NAME) {
    try {
      const available = await AUTH.checkNameAvailable(name)
      if (!available) {
        document.getElementById('sub-status').textContent = '⚠️ That name belongs to a registered account. Choose a different name or sign in.'
        btn.disabled = false
        return
      }
    } catch {}
  }

  try {
    await sbFetch('/rest/v1/leaderboard', {
      method: 'POST',
      body: JSON.stringify({ name, game: pendingSubmit.game, score: pendingSubmit.score }),
    })

    cookieSet('player_name', name)
    const newPB = setPB(pendingSubmit.game, pendingSubmit.score)
    document.getElementById('sub-status').textContent = newPB ? '✓ New personal best saved!' : '✓ Score submitted!'

    setTimeout(() => {
      document.getElementById('submit-overlay').classList.remove('show')
      const overMap = {
        equation:'g1-over', aim:'g2-over', reaction:'g3-over', dodge:'g4-over',
        flash:'g5-over', deltae:'g6-over', cursor:'g7-over', tiles:'g8-over',
        swarm:'g9-over', gravity:'g10-over', typing:'g11-over',
        collider:'g13-over', wavecollapse:'g14-over',
        entanglement:'g15-over', qsnake:'g17-over',
        qwhip:'g18-over', gravitysling:'g22-over', chargerush:'g23-over',
        pulse:'g24-over', orbit:'g26-over', parkour:'g28-over', qblaster:'g29-over',
        mrts:'g30-over', runsnake:'g31-over', gravflip:'g32-over', memseq:'g33-over', manualsort:'g34-over', wavedash:'g35-over', cps:'g36-over', crossy:'g38-over', ufo:'g40-over', jetrush:'g41-over', typerracer:'g42-over', rhythm:'g37-over', wavegauntlet:'g43-over', spider:'spd-over', freighter:'g45-over', traprace:'g46-over',
      }
      const overId = overMap[pendingSubmit.game]
      if (overId) document.getElementById(overId).classList.remove('show')
      goHome()
      loadLeaderboard(pendingSubmit.game)
      switchLbTab(pendingSubmit.game)
    }, 1000)
  } catch (e) {
    document.getElementById('sub-status').textContent = 'Failed to submit. Try again.'
    btn.disabled = false
    console.warn('Submit failed:', e)
  }
}

window.skipSubmit = function() {
  if (pendingSubmit) setPB(pendingSubmit.game, pendingSubmit.score)
  document.getElementById('submit-overlay').classList.remove('show')
}

// Load on page start
initCurby()
fetchAuthorScores().then(() => switchLbTab(window.QG_STALL ? 'wavegauntlet' : 'parkour'))
