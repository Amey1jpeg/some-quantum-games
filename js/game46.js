// ═══════════════════════════════════════════════════════
//  GAME 46 — TRAP RACE (Ultimate Chicken Horse style)
//  Each round both players drop one trap into the course,
//  then both race it. You only score big if you finish AND
//  the other player doesn't — so the level has to stay just
//  barely possible. Sabotage is the whole game.
//
//  Online is host-authoritative, same as Freighter: the host
//  runs the physics, the joiner sends its trap and its jumps.
// ═══════════════════════════════════════════════════════

const G46_W        = 2600     // course length in world px
const G46_R        = 11       // runner radius
const G46_GRAV     = 2100
const G46_JUMP     = 660
const G46_RUN      = 250
const G46_WIN      = 10       // points to win the match
const G46_STUCK    = 2.5      // seconds blocked before you're out

// Trap palette. `w`/`h` are world px; `kind` drives collision.
const G46_TRAPS = [
  { id:'spike', name:'Spikes',   w:34, h:20, kind:'kill',  col:'#f87171' },
  { id:'block', name:'Block',    w:44, h:44, kind:'solid', col:'#94a3b8' },
  { id:'saw',   name:'Saw',      w:30, h:30, kind:'kill',  col:'#fb923c', moves:true },
  { id:'pit',   name:'Pit',      w:70, h:26, kind:'pit',   col:'#1e1b4b' },
]

const G46 = {
  active:false,
  phase:'idle',        // build | countdown | race | result | matchover
  round:1,
  traps:[],
  scores:[0,0],
  runners:[],
  cam:0, t:0, countT:0, resultT:0,
  sel:0,               // selected trap index
  buildTurn:0,         // whose turn to place (local)
  placed:[false,false],
  ghost:null,          // {x,y} preview
  msg:'',
  mode:'local', me:0,  // me = which runner this client drives
  shake:0,
  raf:null, lastTime:0, netT:0,
}
window._g46Score = 0

let G46_room = null, G46_isHost = false
let _g46Cvs = null
function _g46C() {
  if (!_g46Cvs) _g46Cvs = document.getElementById('g46-canvas')
  return _g46Cvs
}
function _g46Auth() { return !G46_room || G46_isHost }

async function initGame46() {
  stopGame46(); _g46Cvs = null
  document.getElementById('g46-overlay').style.display = 'flex'
  document.getElementById('g46-over').style.display    = 'none'
  await initCurby()
}
window.initGame46 = initGame46

window.stopGame46 = function() {
  G46.active = false
  if (G46.raf) { cancelAnimationFrame(G46.raf); G46.raf = null }
  const c = _g46C()
  if (c) {
    c.removeEventListener('mousemove', _g46Move)
    c.removeEventListener('mousedown', _g46Click)
  }
  window.removeEventListener('keydown', _g46KeyDn)
  if (G46_room) {
    const s = mpGetSocket()
    s.off('opponent-state'); s.off('force-end')
    G46_room = null; G46_isHost = false
  }
}

// ── Start ─────────────────────────────────────────────

function _g46Start(mode, me) {
  SFX.resume(); SFX.click()
  const c = _g46C()
  c.width  = c.parentElement.clientWidth
  c.height = c.parentElement.clientHeight
  document.getElementById('g46-overlay').style.display = 'none'
  document.getElementById('g46-over').style.display    = 'none'

  Object.assign(G46, {
    active:true, phase:'build', round:1,
    traps:[], scores:[0,0], runners:[],
    cam:0, t:0, countT:0, resultT:0,
    sel:0, buildTurn:0, placed:[false,false], ghost:null,
    mode, me, shake:0, netT:0,
    msg:'',
  })
  _g46Hud()

  window.addEventListener('keydown', _g46KeyDn)
  c.addEventListener('mousemove', _g46Move)
  c.addEventListener('mousedown', _g46Click)

  G46.lastTime = performance.now()
  G46.raf = requestAnimationFrame(_g46Loop)
}

window.startTrapRaceLocal = function() { G46_room = null; _g46Start('local', 0) }

window.g46FindMatch = function() {
  const statusEl = document.getElementById('g46-match-status')
  const btnEl    = document.getElementById('g46-match-btn')
  window['mp_findMatch_traprace'] = window.g46FindMatch
  mpFindMatch('traprace', {
    onMatched: ({ code, isHost }) => {
      G46_room = code; G46_isHost = isHost
      _g46Net()
      _g46Start('online', isHost ? 0 : 1)
    },
    onLeft: () => {
      G46_room = null; G46_isHost = false
      if (!G46.active) document.getElementById('g46-overlay').style.display = 'flex'
    },
    statusEl, btnEl,
  })
}

function _g46Net() {
  const sock = mpGetSocket()
  sock.off('opponent-state'); sock.off('force-end')
  sock.on('opponent-state', (s) => {
    if (s.trap) {                       // a placement from the other player
      G46.traps.push(s.trap)
      G46.placed[s.by] = true
      _g46MaybeRace()
    }
    if (typeof s.jump === 'number' && _g46Auth()) _g46Jump(s.jump)
    if (s.world && !_g46Auth()) _g46Apply(s.world)
  })
  sock.on('force-end', () => { G46.active = false })
}

function _g46Send(payload) {
  if (G46_room) mpGetSocket().emit('state-sync', { code:G46_room, state:payload })
}

// ── Course helpers ────────────────────────────────────

function _g46FloorY(h) { return h - 46 }

// Is there a pit trap swallowing this world x?
function _g46InPit(x) {
  for (const t of G46.traps) {
    if (t.kind === 'pit' && x > t.x && x < t.x + t.w) return true
  }
  return false
}

function _g46NewRunners(h) {
  const fy = _g46FloorY(h)
  return [0,1].map(i => ({
    x:40, y:fy - G46_R, vy:0, onGround:true,
    alive:true, done:false, time:0, stuck:0, i,
  }))
}

// ── Build phase ───────────────────────────────────────

function _g46CanPlace() {
  if (G46.phase !== 'build') return false
  if (G46.mode === 'local') return true
  return !G46.placed[G46.me]
}

function _g46Move(e) {
  if (!_g46CanPlace()) { G46.ghost = null; return }
  const c = _g46C(), r = c.getBoundingClientRect()
  const mx = (e.clientX - r.left) * (c.width / r.width)
  const my = (e.clientY - r.top)  * (c.height / r.height)
  G46.ghost = { x: mx + G46.cam, y: my }
}

function _g46Click(e) {
  if (!_g46CanPlace() || !G46.ghost) return
  e.preventDefault()
  const spec = G46_TRAPS[G46.sel]
  const h = _g46C().height
  const fy = _g46FloorY(h)
  // Spikes/pits snap to the floor; blocks and saws sit where you drop them
  let y = G46.ghost.y
  if (spec.kind === 'kill' && spec.id === 'spike') y = fy - spec.h
  if (spec.kind === 'pit') y = fy
  y = Math.max(40, Math.min(fy - spec.h, y))
  const x = Math.max(220, Math.min(G46_W - 260, G46.ghost.x - spec.w/2))

  const trap = { id:spec.id, kind:spec.kind, x, y, w:spec.w, h:spec.h,
                 col:spec.col, moves:!!spec.moves, ph:Math.random()*6.28,
                 by: G46.mode === 'local' ? G46.buildTurn : G46.me }
  G46.traps.push(trap)
  SFX.click()

  if (G46.mode === 'local') {
    G46.placed[G46.buildTurn] = true
    G46.buildTurn = 1 - G46.buildTurn
    _g46MaybeRace()
  } else {
    G46.placed[G46.me] = true
    _g46Send({ trap, by:G46.me })
    _g46MaybeRace()
  }
  G46.ghost = null
}

function _g46MaybeRace() {
  if (G46.placed[0] && G46.placed[1]) {
    G46.phase = 'countdown'; G46.countT = 0
    G46.runners = _g46NewRunners(_g46C().height)
    G46.cam = 0
  }
}

window.g46PickTrap = function(i) { G46.sel = i; SFX.click() }

// ── Race ──────────────────────────────────────────────

function _g46KeyDn(e) {
  if (G46.phase === 'build') {
    const n = parseInt(e.key, 10)
    if (n >= 1 && n <= G46_TRAPS.length) { G46.sel = n-1; SFX.click() }
    return
  }
  if (G46.phase !== 'race') return
  const k = e.key.toLowerCase()
  if (G46.mode === 'local') {
    if (k === 'w' || k === ' ')  { e.preventDefault(); _g46Jump(0) }
    if (k === 'arrowup')         { e.preventDefault(); _g46Jump(1) }
  } else {
    if (k === 'w' || k === ' ' || k === 'arrowup') {
      e.preventDefault()
      if (_g46Auth()) _g46Jump(G46.me)
      else _g46Send({ jump: G46.me })
    }
  }
}

function _g46Jump(i) {
  const r = G46.runners[i]
  if (!r || !r.alive || r.done || !r.onGround) return
  r.vy = -G46_JUMP; r.onGround = false
  SFX.jump()
}

function _g46Sim(dt, h) {
  const fy = _g46FloorY(h)

  for (const r of G46.runners) {
    if (!r.alive || r.done) continue
    r.time += dt

    // Horizontal, blocked by solid traps
    const nx = r.x + G46_RUN * dt
    let blocked = false
    for (const t of G46.traps) {
      if (t.kind !== 'solid') continue
      if (nx + G46_R > t.x && r.x - G46_R < t.x + t.w &&
          r.y + G46_R > t.y + 2 && r.y - G46_R < t.y + t.h) { blocked = true; break }
    }
    if (blocked) {
      r.stuck += dt
      if (r.stuck > G46_STUCK) { r.alive = false; SFX.die() }   // walled in
    } else { r.x = nx; r.stuck = 0 }

    // Vertical
    r.vy += G46_GRAV * dt
    r.y  += r.vy * dt
    r.onGround = false

    // Land on solid traps
    for (const t of G46.traps) {
      if (t.kind !== 'solid') continue
      const overX = r.x + G46_R > t.x && r.x - G46_R < t.x + t.w
      if (overX && r.vy >= 0 && r.y + G46_R > t.y && r.y + G46_R < t.y + t.h) {
        r.y = t.y - G46_R; r.vy = 0; r.onGround = true
      }
    }

    // Floor, unless a pit has eaten it
    if (!_g46InPit(r.x)) {
      if (r.y + G46_R >= fy) { r.y = fy - G46_R; r.vy = 0; r.onGround = true }
    } else if (r.y - G46_R > h) {
      r.alive = false; SFX.die()
    }

    // Lethal traps
    for (const t of G46.traps) {
      if (t.kind !== 'kill') continue
      const tx = t.moves ? t.x + Math.sin(G46.t*2 + t.ph) * 46 : t.x
      if (r.x + G46_R > tx && r.x - G46_R < tx + t.w &&
          r.y + G46_R > t.y && r.y - G46_R < t.y + t.h) {
        r.alive = false; G46.shake = 0.8; SFX.die()
      }
    }

    if (r.x >= G46_W - 60) { r.done = true; SFX.win() }
  }

  const live = G46.runners.filter(r => r.alive && !r.done)
  if (live.length === 0) _g46EndRound()
}

// Ultimate Chicken Horse scoring: finishing is worth little if
// everyone finishes. The points are in being the only one who did.
function _g46EndRound() {
  G46.phase = 'result'; G46.resultT = 0
  const [a, b] = G46.runners
  const aDone = a.done, bDone = b.done

  if (aDone && !bDone)      { G46.scores[0] += 3; G46.msg = 'P1 made it — P2 didn\'t!  +3' }
  else if (bDone && !aDone) { G46.scores[1] += 3; G46.msg = 'P2 made it — P1 didn\'t!  +3' }
  else if (aDone && bDone)  {
    // both finished — only the faster one gets a point
    if (a.time < b.time) { G46.scores[0]++; G46.msg = 'Both finished — P1 was faster.  +1' }
    else                 { G46.scores[1]++; G46.msg = 'Both finished — P2 was faster.  +1' }
  } else                    { G46.msg = 'Nobody made it. Maybe ease up.  +0' }

  window._g46Score = Math.max(G46.scores[0], G46.scores[1])
  _g46Hud()
  if (G46.scores[0] >= G46_WIN || G46.scores[1] >= G46_WIN) G46.phase = 'matchover'
}

function _g46NextRound() {
  G46.round++
  G46.phase = 'build'
  G46.placed = [false, false]
  G46.buildTurn = 0
  G46.ghost = null
  G46.cam = 0
}

function _g46Hud() {
  const a = document.getElementById('g46-s1'), b = document.getElementById('g46-s2')
  if (a) a.textContent = G46.scores[0]
  if (b) b.textContent = G46.scores[1]
  const r = document.getElementById('g46-round')
  if (r) r.textContent = G46.round
}

// ── Net state ─────────────────────────────────────────

function _g46World() {
  return {
    ph:G46.phase, rd:G46.round, sc:G46.scores, msg:G46.msg, t:G46.t,
    r:G46.runners.map(r => [ +r.x.toFixed(1), +r.y.toFixed(1), r.alive?1:0, r.done?1:0 ]),
  }
}
function _g46Apply(s) {
  if (s.ph)  G46.phase  = s.ph
  if (s.rd)  G46.round  = s.rd
  if (s.sc)  G46.scores = s.sc
  if (typeof s.msg === 'string') G46.msg = s.msg
  if (typeof s.t === 'number')   G46.t = s.t
  if (Array.isArray(s.r)) {
    G46.runners = s.r.map(([x,y,al,dn], i) => ({ x, y, alive:!!al, done:!!dn, i, vy:0, onGround:true, time:0, stuck:0 }))
  }
  _g46Hud()
}

// ── Loop ──────────────────────────────────────────────

function _g46Loop(ts) {
  if (!G46.active) return
  const dt = Math.min((ts - G46.lastTime)/1000, 0.05)
  G46.lastTime = ts
  const c = _g46C(), w = c.width, h = c.height
  G46.t += dt
  if (G46.shake > 0) G46.shake = Math.max(0, G46.shake - dt*3)

  if (G46.phase === 'countdown') {
    G46.countT += dt
    if (G46.countT >= 2.2) { G46.phase = 'race'; G46.runners = _g46NewRunners(h) }
  } else if (G46.phase === 'race') {
    if (_g46Auth()) _g46Sim(dt, h)
    // camera follows whoever is furthest along
    const lead = Math.max(...G46.runners.map(r => r.x), 0)
    const want = Math.max(0, Math.min(G46_W - w, lead - w*0.35))
    G46.cam += (want - G46.cam) * Math.min(1, dt*6)
  } else if (G46.phase === 'result') {
    G46.resultT += dt
    if (G46.resultT >= 2.4 && _g46Auth()) _g46NextRound()
  }

  if (G46_room && _g46Auth() && (G46.phase === 'race' || G46.phase === 'result')) {
    G46.netT += dt
    if (G46.netT >= 0.05) { G46.netT = 0; _g46Send({ world:_g46World() }) }
  }

  _g46Draw(c.getContext('2d'), w, h)
  G46.raf = requestAnimationFrame(_g46Loop)
}

// ── Draw ──────────────────────────────────────────────

function _g46Draw(ctx, w, h) {
  const fy = _g46FloorY(h)
  ctx.save()
  if (G46.shake > 0) {
    const s = G46.shake*6
    ctx.translate((Math.random()-0.5)*s, (Math.random()-0.5)*s)
  }

  // Canvases get no CSS variables, so read the theme directly
  const _lt = typeof qgLight === 'function' && qgLight()
  ctx.fillStyle = _lt ? '#eef0fb' : '#0a0a18'; ctx.fillRect(-10,-10,w+20,h+20)

  // parallax stripes
  ctx.strokeStyle = _lt ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.03)'; ctx.lineWidth = 1
  for (let x = -(G46.cam*0.4 % 90); x < w; x += 90) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke()
  }

  const sx = x => x - G46.cam

  // floor, broken by pits
  ctx.fillStyle = _lt ? '#475569' : '#1e293b'
  let cursor = 0
  const pits = G46.traps.filter(t => t.kind === 'pit').sort((a,b) => a.x-b.x)
  for (const p of pits) {
    ctx.fillRect(sx(cursor), fy, Math.max(0, p.x-cursor), h-fy)
    cursor = p.x + p.w
  }
  ctx.fillRect(sx(cursor), fy, Math.max(0, G46_W-cursor), h-fy)
  ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2
  cursor = 0
  for (const p of pits) {
    ctx.beginPath(); ctx.moveTo(sx(cursor), fy); ctx.lineTo(sx(p.x), fy); ctx.stroke()
    cursor = p.x + p.w
  }
  ctx.beginPath(); ctx.moveTo(sx(cursor), fy); ctx.lineTo(sx(G46_W), fy); ctx.stroke()

  // finish
  const fxx = sx(G46_W - 60)
  ctx.fillStyle = '#22c55e'; ctx.globalAlpha = 0.18
  ctx.fillRect(fxx, 0, 60, h); ctx.globalAlpha = 1
  ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 2
  ctx.beginPath(); ctx.moveTo(fxx, 0); ctx.lineTo(fxx, h); ctx.stroke()

  // traps
  for (const t of G46.traps) {
    const tx = sx(t.moves ? t.x + Math.sin(G46.t*2 + t.ph)*46 : t.x)
    if (tx < -90 || tx > w+90) continue
    if (t.kind === 'pit') continue
    ctx.fillStyle = t.col + '33'
    ctx.strokeStyle = t.col; ctx.lineWidth = 2
    ctx.shadowColor = t.col; ctx.shadowBlur = 8
    if (t.id === 'spike') {
      ctx.beginPath()
      const n = Math.round(t.w/11)
      for (let i = 0; i < n; i++) {
        ctx.moveTo(tx + i*(t.w/n), t.y + t.h)
        ctx.lineTo(tx + (i+0.5)*(t.w/n), t.y)
        ctx.lineTo(tx + (i+1)*(t.w/n), t.y + t.h)
      }
      ctx.fill(); ctx.stroke()
    } else if (t.id === 'saw') {
      ctx.beginPath()
      for (let i = 0; i < 10; i++) {
        const a = i/10*Math.PI*2 + G46.t*5
        const rr = t.w/2 * (i%2 ? 0.62 : 1)
        const px = tx+t.w/2+Math.cos(a)*rr, py = t.y+t.h/2+Math.sin(a)*rr
        i ? ctx.lineTo(px,py) : ctx.moveTo(px,py)
      }
      ctx.closePath(); ctx.fill(); ctx.stroke()
    } else {
      ctx.fillRect(tx, t.y, t.w, t.h)
      ctx.strokeRect(tx, t.y, t.w, t.h)
    }
    ctx.shadowBlur = 0
  }

  // ghost preview
  if (G46.ghost && _g46CanPlace()) {
    const spec = G46_TRAPS[G46.sel]
    let gy = G46.ghost.y
    if (spec.id === 'spike') gy = fy - spec.h
    if (spec.kind === 'pit') gy = fy
    gy = Math.max(40, Math.min(fy - spec.h, gy))
    ctx.globalAlpha = 0.4
    ctx.fillStyle = spec.col
    ctx.fillRect(sx(G46.ghost.x) - spec.w/2, gy, spec.w, spec.h)
    ctx.globalAlpha = 1
    ctx.strokeStyle = spec.col; ctx.setLineDash([4,4]); ctx.lineWidth = 1.5
    ctx.strokeRect(sx(G46.ghost.x) - spec.w/2, gy, spec.w, spec.h)
    ctx.setLineDash([])
  }

  // runners
  const COL = ['#38bdf8', '#f472b6']
  for (const r of G46.runners) {
    const x = sx(r.x)
    if (!r.alive) {
      ctx.globalAlpha = 0.25
      ctx.fillStyle = COL[r.i]
      ctx.beginPath(); ctx.arc(x, r.y, G46_R, 0, Math.PI*2); ctx.fill()
      ctx.globalAlpha = 1
      ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(x-7, r.y-7); ctx.lineTo(x+7, r.y+7)
      ctx.moveTo(x+7, r.y-7); ctx.lineTo(x-7, r.y+7); ctx.stroke()
      continue
    }
    ctx.beginPath(); ctx.arc(x, r.y, G46_R, 0, Math.PI*2)
    ctx.fillStyle = COL[r.i] + '55'; ctx.fill()
    ctx.strokeStyle = COL[r.i]; ctx.lineWidth = 2.5
    ctx.shadowColor = COL[r.i]; ctx.shadowBlur = 10; ctx.stroke(); ctx.shadowBlur = 0
    if (r.done) {
      ctx.fillStyle = '#22c55e'; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'
      ctx.fillText('✓', x, r.y - 18)
    }
  }

  ctx.restore()
  _g46DrawUI(ctx, w, h)
}

function _g46DrawUI(ctx, w, h) {
  ctx.textAlign = 'center'
  // Scrims and text flip with the theme so a light page doesn't get black panels
  const lt   = typeof qgLight === 'function' && qgLight()
  const ink  = lt ? '#111' : '#fff'
  const inkA = a => lt ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`
  const dim  = a => lt ? `rgba(255,255,255,${a + 0.1})` : `rgba(0,0,0,${a})`

  if (G46.phase === 'build') {
    ctx.fillStyle = dim(0.55); ctx.fillRect(0, 0, w, 74)
    const who = G46.mode === 'local'
      ? (G46.buildTurn === 0 ? 'P1' : 'P2')
      : (G46.placed[G46.me] ? null : 'YOU')
    ctx.font = 'bold 15px monospace'; ctx.fillStyle = ink
    ctx.fillText(who ? `${who}: place a trap  —  click the course` : 'Waiting for the other player…', w/2, 24)

    // palette
    const bw = 96, total = G46_TRAPS.length*bw, x0 = w/2 - total/2
    G46_TRAPS.forEach((t, i) => {
      const x = x0 + i*bw
      const on = i === G46.sel
      ctx.fillStyle = on ? t.col + '33' : inkA(0.05)
      ctx.fillRect(x+4, 36, bw-8, 28)
      ctx.strokeStyle = on ? t.col : inkA(0.15)
      ctx.lineWidth = on ? 2 : 1
      ctx.strokeRect(x+4, 36, bw-8, 28)
      ctx.fillStyle = on ? t.col : inkA(0.55)
      ctx.font = 'bold 11px monospace'
      ctx.fillText(`${i+1} ${t.name}`, x + bw/2, 54)
    })
  }

  if (G46.phase === 'countdown') {
    const n = Math.max(1, 3 - Math.floor(G46.countT/0.7))
    ctx.fillStyle = dim(0.5); ctx.fillRect(0,0,w,h)
    ctx.font = 'bold 62px monospace'; ctx.fillStyle = ink
    ctx.shadowColor = '#38bdf8'; ctx.shadowBlur = 26
    ctx.fillText(n, w/2, h/2 + 20); ctx.shadowBlur = 0
    ctx.font = '13px monospace'; ctx.fillStyle = inkA(0.5)
    ctx.fillText(G46.mode === 'local' ? 'P1 = W   ·   P2 = ↑' : 'SPACE to jump', w/2, h/2 + 58)
  }

  if (G46.phase === 'result' || G46.phase === 'matchover') {
    ctx.fillStyle = dim(0.62); ctx.fillRect(0,0,w,h)
    ctx.font = 'bold 20px monospace'; ctx.fillStyle = ink
    ctx.fillText(G46.msg, w/2, h/2 - 6)
    ctx.font = 'bold 15px monospace'
    ctx.fillStyle = '#38bdf8'; ctx.fillText(`P1  ${G46.scores[0]}`, w/2 - 60, h/2 + 28)
    ctx.fillStyle = '#f472b6'; ctx.fillText(`P2  ${G46.scores[1]}`, w/2 + 60, h/2 + 28)
    if (G46.phase === 'matchover') {
      ctx.font = 'bold 26px monospace'; ctx.fillStyle = '#22c55e'
      ctx.fillText((G46.scores[0] > G46.scores[1] ? 'P1' : 'P2') + ' WINS THE MATCH', w/2, h/2 + 74)
    }
  }
}
