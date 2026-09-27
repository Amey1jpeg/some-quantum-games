// ═══════════════════════════════════════════════════════
//  LEVEL CHECKER
//  Answers the questions you actually want answered about a
//  submitted level: can it be cleared at all, how much room
//  for error is there, and is anything about it unfair
//  (frame-rate dependent, unreachable, sub-frame detail).
//
//  The clearability answer is exhaustive, not a heuristic:
//  it tracks every wave position reachable by any sequence
//  of hold/release choices, frame by frame. If the set ever
//  empties, no human input could have survived either.
// ═══════════════════════════════════════════════════════

const LC_WAVE  = 255     // wave climb/fall speed, px/sec
const LC_R     = 7       // wave radius
const LC_FPS   = 60
const LC_DT    = 1 / LC_FPS
const LC_FRAME = LC_WAVE * LC_DT      // px of travel in one frame
const LC_QUANT = 8                    // positions per px when searching
// Wave Gauntlet runs its simulation on this fixed step (G43_SIM_DT), so the
// solver models the same clock the game actually uses. Before the game was
// fixed-stepped, this had to guess at 60Hz and the verdict on a fast level
// turned on the guess: ULTRASONIC came out unclearable at 59, 60 and 61Hz —
// each dying at a different column — yet clear at 75Hz and above.
const LC_SIM_DT = 1 / 240

const LC_HEIGHTS = [360, 400, 460, 520, 600, 700, 800]

// ── Corridor sampling ─────────────────────────────────

function lcWallAt(kfs, col, h) {
  if (!kfs.length) return { cy: h/2, gapH: h*0.6 }
  const k = kfs.map(f => ({ at:f.at, cy:(f.cf ?? 0.5)*h, gapH:(f.gapHf ?? 0.4)*h }))
  if (col <= k[0].at) return k[0]
  const last = k[k.length-1]
  if (col >= last.at) return last
  for (let i = 1; i < k.length; i++) {
    if (col > k[i].at) continue
    const span = k[i].at - k[i-1].at
    const t = span > 0 ? (col - k[i-1].at) / span : 1
    return {
      cy:   k[i-1].cy   + (k[i].cy   - k[i-1].cy)   * t,
      gapH: k[i-1].gapH + (k[i].gapH - k[i-1].gapH) * t,
    }
  }
  return last
}

// Every position reachable by any hold/release sequence, frame by frame.
// Returns the narrowest surviving band — the real margin for error.
// Portals collapse every reachable position to one: whatever you were doing,
// crossing the column puts you at the same height. The solvers have to know,
// or a level with a portal reads as impossible and the bot flies a line that
// was never going to happen.
// Which portal does moving from `a` to `b` cross, if any?
function _lcPortalCross(lv, a, b) {
  const ps = lv.portals
  if (!ps || !ps.length) return null
  for (const p of ps) if (p.at > a && p.at <= b) return p
  return null
}

// Crossing the portal's column takes you through it — there is no mouth to
// aim for, so every position at that column goes. Only forward jumps are
// followed: a portal that sends you backwards makes a cycle the search
// cannot reason about, so it is skipped and the report warns instead.
function _lcPortalsCrossing(lv, i, step) {
  const ps = lv.portals
  if (!ps || !ps.length) return null
  const from = i * step, to = from + step
  const out = []
  for (const p of ps) if (p.at > from && p.at <= to) out.push(p)
  return out.length ? out : null
}

// Is this position inside a mouth, and where does it come out? A mouth of 1
// spans the screen and cannot be dodged; anything smaller can be flown past.
// Backward jumps are skipped: they make a cycle the search cannot follow.
function _lcThroughMouth(ports, ny, h, step, i, R) {
  if (!ports) return null
  for (const p of ports) {
    const half = Math.min(1, p.mouth ?? 0.24) * h / 2
    if (Math.abs(ny - (p.cf ?? 0.5) * h) > half) continue
    const j = Math.round((p.toAt ?? p.at) / step)
    if (j < i) continue
    return { step: Math.max(j, i + 1),
             y: Math.max(R + 2, Math.min(h - R - 2, (p.toCf ?? 0.5) * h)) }
  }
  return null
}

function lcSolveWave(lv, h, dt) {
  const DT = dt || LC_DT
  const kfs = lv.keyframes || []
  const speed = lv.speed || 200
  const clear = lv.clearAt || 800
  // Quantise onto a grid that divides the wave's step exactly. With the old
  // fixed 1/8px grid a step was 8.5 units, and Math.round sends .5 toward
  // +infinity — which is downward — so every up/down pair sank 0.125px and a
  // spamming line drifted to the floor. On this grid a move is exactly ±4
  // units and there is no rounding to accumulate.
  const GQ = (LC_WAVE * DT) / 4
  const step = speed * DT
  const nSteps = Math.ceil(clear / step)
  // A paired portal moves you to another column, so the search can no longer
  // be one state set marching forward — a state can land many steps ahead.
  // Keep a set per step and fill them in order; a forward jump just drops the
  // state into a later step's set, which is still reached in order.
  const at = new Array(nSteps + 2)
  at[0] = new Set([Math.round(h/2 / GQ)])
  let worst = Infinity, worstCol = 0, lastLive = 0

  for (let i = 0; i <= nSteps; i++) {
    const states = at[i]
    at[i] = null                      // let each step go once it is consumed
    if (!states || !states.size) continue
    lastLive = i
    const scroll = i * step
    const { cy, gapH } = lcWallAt(kfs, scroll, h)
    // Match the game: the wave is clamped to the screen and tested against
    // the real corridor, not a corridor clipped to the screen.
    const top = cy - gapH/2, bot = cy + gapH/2
    // Portals are avoidable, so this branches: a position inside the mouth
    // goes through, one outside carries on past it.
    const ports = _lcPortalsCrossing(lv, i, step)
    const next = at[i + 1] || (at[i + 1] = new Set())
    for (const q of states) {
      const y = q * GQ
      for (const up of [true, false]) {
        let ny = y + (up ? -LC_WAVE : LC_WAVE) * DT
        ny = Math.max(LC_R + 2, Math.min(h - LC_R - 2, ny))
        if (ny - LC_R < top || ny + LC_R > bot) continue
        const j = _lcThroughMouth(ports, ny, h, step, i, LC_R)
        if (j) (at[j.step] || (at[j.step] = new Set())).add(Math.round(j.y / GQ))
        else   next.add(Math.round(ny / GQ))
      }
    }
    // Ignore the opening, where the set is still fanning out from a single
    // point and its width says nothing about the level. This was a count of
    // 8 frames, which was a third of a second at 60Hz but is a thirtieth at
    // the 240Hz clock the game now runs — so the band stayed pinned to that
    // opening fan and every level reported the same meaningless number.
    if (i * DT > 0.4 && next.size) {
      const ys = [...next].map(q => q * GQ)
      const span = Math.max(...ys) - Math.min(...ys)
      if (span < worst) { worst = span; worstCol = Math.round(scroll) }
    }
  }
  // Anything alive at or past the final step cleared it
  for (let i = nSteps; i < at.length; i++) if (at[i] && at[i].size) {
    return { ok:true, band:worst === Infinity ? 0 : worst, atCol:worstCol, frames:nSteps }
  }
  return { ok:false, diedAt: Math.round(lastLive * step), frame: lastLive }
}

// The actual inputs of an ideal run — not just whether one exists.
// Same exhaustive search as lcSolveWave, but keeping a parent pointer per
// state so the winning line can be walked back. Prefers the fewest presses,
// which is what a clean line looks like rather than a jittery one.
// `margin` shrinks the corridor while solving, so the line keeps clearance
// instead of grazing the walls. Replaying a discrete plan against
// continuous physics never lands exactly where the solver predicted —
// positions are quantised to 1/8px, and with variable frame times an
// input switch can land up to a frame late (4.25px). Without margin a
// long level accumulates that and eventually clips a wall.
function lcSolveLine(lv, h, margin, dt, worst) {
  const pad = margin || 0
  const DT = dt || LC_DT
  const kfs = lv.keyframes || []
  const speed = lv.speed || 200
  const clear = lv.clearAt || 800
  const GQ = (LC_WAVE * DT) / 4
  const step = speed * DT
  const nSteps = Math.ceil(clear / step)

  // Because a portal can be flown past, the route is a choice rather than a
  // fixed chain, so this is a search over (step, height) with a parent
  // pointer per state — not a march through consecutive layers.
  const at = new Array(nSteps + 2)
  at[0] = new Map([[Math.round(h / 2 / GQ) + ':0',
                    { prevStep: -1, prevKey: null, hold: false, taps: 0 }]])
  let lastLive = 0

  for (let i = 0; i <= nSteps; i++) {
    const cur = at[i]
    if (!cur || !cur.size) continue
    lastLive = i
    const scroll = i * step
    // The game moves the wave, advances the scroll, and only then tests the
    // wall at the new column.
    const { cy, gapH } = lcWallAt(kfs, Math.floor(scroll + step), h)
    const top = cy - gapH / 2 + pad
    const bot = cy + gapH / 2 - pad
    const ports = _lcPortalsCrossing(lv, i, step)
    for (const [key, node] of cur) {
      const [q, last] = key.split(':')
      const y = +q * GQ
      for (const hold of [true, false]) {
        let ny = y + (hold ? -LC_WAVE : LC_WAVE) * DT
        ny = Math.max(LC_R + 2, Math.min(h - LC_R - 2, ny))
        if (ny - LC_R < top || ny + LC_R > bot) continue
        const taps = node.taps + ((hold && last === '0') ? 1 : 0)
        const gone = _lcThroughMouth(ports, ny, h, step, i, LC_R)
        const tStep = gone ? gone.step : i + 1
        const tY    = gone ? gone.y : ny
        const m = at[tStep] || (at[tStep] = new Map())
        const nk = Math.round(tY / GQ) + ':' + (hold ? '1' : '0')
        const seen = m.get(nk)
        const better = !seen || (worst ? seen.taps < taps : seen.taps > taps)
        if (better) m.set(nk, { prevStep: i, prevKey: key, hold, taps })
      }
    }
  }

  // Best survivor at or past the finish
  let endStep = -1, endKey = null, endTaps = worst ? -Infinity : Infinity
  for (let i = nSteps; i < at.length; i++) {
    if (!at[i]) continue
    for (const [k, n] of at[i]) {
      if (worst ? n.taps > endTaps : n.taps < endTaps) { endTaps = n.taps; endKey = k; endStep = i }
    }
    if (endKey) break
  }
  if (!endKey) return { ok: false, diedAt: Math.round(lastLive * step), frame: lastLive }

  // Walk back, filling the plan against absolute step numbers. Steps the
  // route skipped keep their default, and playback never asks for them
  // because it indexes by scroll.
  const holds = new Array(nSteps + 2).fill(false)
  const ys    = new Array(nSteps + 2).fill(h / 2)
  // Written one step back: playback indexes by the scroll it is AT and aims
  // for where it should be after the next step, so ys[i] is the target while
  // standing at step i. Writing it at the arrival step instead leaves the
  // first entry pointing at where the wave already is, and the line drifts —
  // that alone cost THE SAW its 360px solution.
  let s = endStep, k = endKey, guard = 0
  while (s > 0 && k && guard++ < nSteps + 4) {
    const n = at[s].get(k)
    if (!n) break
    holds[s - 1] = n.hold
    ys[s - 1]    = +k.split(':')[0] * GQ
    const ps = n.prevStep, pk = n.prevKey
    s = ps; k = pk
  }
  return { ok: true, holds, ys, frames: ys.length, taps: endTaps, margin: pad, dt: DT }
}

// Prefer a line with room to spare; fall back to tighter ones, and finally
// to an exact line, so a level that only just works still gets a bot.
// `dt` should be the frame time the game is actually running at. Planning
// in 1/60s steps and replaying at 120Hz puts the plan and the game on
// different grids, which is fatal on a level with no margin to absorb it.
// Fly the plan the way the bot actually flies it and see whether it lives.
// The solver returns a path with a known clearance, but the bot does not
// follow that path exactly — it chases it with a hold/release controller,
// and the tracking error is not bounded by the clearance. On THE SAW that
// gap was fatal: a valid plan with 3px of margin died at column 189.
function _lcReplayOk(lv, h, plan) {
  const kfs   = lv.keyframes || []
  const speed = lv.speed || 200
  const clear = lv.clearAt || 800
  const DT    = plan.dt
  const step  = speed * DT
  const ys    = plan.ys
  if (!ys || !ys.length || step <= 0) return false
  let wy = h / 2, scroll = 0, guard = 0
  while (scroll < clear && guard++ < 400000) {
    const i = Math.min(ys.length - 1, Math.max(0, Math.round(scroll / step)))
    wy += (wy > ys[i] ? -LC_WAVE : LC_WAVE) * DT
    wy = Math.max(LC_R + 2, Math.min(h - LC_R - 2, wy))   // same clamp as the game
    const prevScroll = scroll
    scroll += step
    const port = _lcPortalCross(lv, prevScroll, scroll)
    // Only if the wave was actually inside the mouth — a portal you fly past
    // must be flown past here too, or the check disagrees with the game.
    if (port && (port.toAt ?? port.at) >= port.at &&
        Math.abs(wy - (port.cf ?? 0.5) * h) <= Math.min(1, port.mouth ?? 0.24) * h / 2) {
      scroll = Math.max(port.toAt ?? port.at, prevScroll + step)
      wy = Math.max(LC_R + 2, Math.min(h - LC_R - 2, (port.toCf ?? 0.5) * h))
    }
    const { cy, gapH } = lcWallAt(kfs, Math.floor(scroll), h)
    if (wy - LC_R < cy - gapH / 2 || wy + LC_R > cy + gapH / 2) return false
  }
  return true
}

function _lcSegments(lv, h, step) {
  const clear = lv.clearAt || 800
  const ps = (lv.portals || []).slice().sort((a, b) => a.at - b.at)
  const segs = []
  let at = 0, y = h / 2, guard = 0
  while (at < clear && guard++ < 64) {
    const nxt = ps.find(p => p.at > at && (p.toAt ?? p.at) > p.at - 1e-9 &&
                             Math.round((p.toAt ?? p.at) / step) >= Math.round(p.at / step))
    if (!nxt || nxt.at >= clear) { segs.push({ from: at, to: clear, startY: y }); break }
    segs.push({ from: at, to: nxt.at, startY: y })
    at = Math.max((nxt.toAt ?? nxt.at), nxt.at + step)
    y  = Math.max(LC_R + 2, Math.min(h - LC_R - 2, (nxt.toCf ?? 0.5) * h))
  }
  return segs
}

function lcSolveLineSafe(lv, h, dt, worst) {
  // A finer ladder than before, because the first plan that solves is not
  // necessarily one the controller can hold — more rungs means more chances
  // to find one that both solves and survives.
  for (const pad of [10, 8, 6, 4.5, 3, 2, 1.5, 1, 0.5, 0]) {
    const r = lcSolveLine(lv, h, pad, dt, worst)
    if (r.ok && _lcReplayOk(lv, h, r)) return r
  }
  // Better no bot than a bot that flies into a wall
  return { ok: false }
}

// Spider: alternating blocks, so each surface switch needs flip time
function lcCheckSpider(lv) {
  const obs = [...(lv.obstacles || [])].sort((a,b) => a.col - b.col)
  const speed = lv.speed || 200
  const problems = [], warnings = []
  let tightest = Infinity

  for (let i = 1; i < obs.length; i++) {
    const cols = obs[i].col - obs[i-1].col
    const secs = cols / speed
    if (cols === 0) problems.push(`Two blocks stacked at column ${obs[i].col}.`)
    if (obs[i].floor !== obs[i-1].floor) {
      tightest = Math.min(tightest, secs)
      if (secs < 0.10) problems.push(`Blocks at ${obs[i-1].col}→${obs[i].col}: only ${(secs*1000).toFixed(0)}ms to flip. Not humanly possible.`)
      else if (secs < 0.16) warnings.push(`Blocks at ${obs[i-1].col}→${obs[i].col}: ${(secs*1000).toFixed(0)}ms to flip — near the limit.`)
    }
  }
  if (obs.length && obs[0].floor) {
    const secs = obs[0].col / speed
    if (secs < 0.5) problems.push(`First block is on the FLOOR where the spider spawns and arrives in ${secs.toFixed(2)}s.`)
  }
  return {
    ok: problems.length === 0, problems, warnings,
    tightestFlipMs: tightest === Infinity ? null : Math.round(tightest * 1000),
    blocks: obs.length,
  }
}

// ── Full report ───────────────────────────────────────

function lcLabel(frames) {
  if (frames < 1)   return { text:'frame-perfect', cls:'bad'  }
  if (frames < 2.5) return { text:'very tight',    cls:'warn' }
  if (frames < 5)   return { text:'tight',         cls:'ok'   }
  return { text:'comfortable', cls:'good' }
}

function lcReport(lv) {
  const game = lv.game || (lv.keyframes ? 'wavegauntlet' : 'spider')
  const speed = lv.speed || 200
  const r = {
    game, name: lv.name || '(unnamed)', diff: lv.diff || '?', speed,
    clearAt: lv.clearAt || 0,
    problems: [], warnings: [], heights: [],
  }

  // Structural checks both games share
  if (!lv.name) r.warnings.push('No name — it will show as blank on the announce screen.')
  if (speed <= 0) r.problems.push('Speed must be above zero.')

  if (game === 'spider') {
    const s = lcCheckSpider(lv)
    r.problems.push(...s.problems)
    r.warnings.push(...s.warnings)
    r.blocks = s.blocks
    r.tightestFlipMs = s.tightestFlipMs
    r.clearable = s.ok
    return r
  }

  const kfs = lv.keyframes || []
  if (kfs.length < 2) r.problems.push('Needs at least two keyframes.')
  for (let i = 1; i < kfs.length; i++) {
    if (kfs[i].at < kfs[i-1].at) r.problems.push(`Keyframe ${i+1} sits before the previous one.`)
    if (kfs[i].at === kfs[i-1].at) r.warnings.push(`Two keyframes share column ${kfs[i].at} — the first is ignored.`)
  }
  const past = kfs.filter(k => k.at > r.clearAt).length
  if (past) r.warnings.push(`${past} keyframe(s) sit past the finish at ${r.clearAt} and never render.`)
  if (kfs.length && kfs[kfs.length-1].at < r.clearAt) {
    r.warnings.push(`Last keyframe is at ${kfs[kfs.length-1].at} but the level runs to ${r.clearAt} — the corridor holds its final shape for the rest.`)
  }

  // Corridor outside the canvas is invisible, and the wave can reach it
  let offscreen = 0
  for (let c = 0; c <= r.clearAt; c += 5) {
    const wl = lcWallAt(kfs, c, 500)
    if (wl.cy - wl.gapH / 2 < 0 || wl.cy + wl.gapH / 2 > 500) offscreen += 5
  }
  if (offscreen) {
    r.warnings.push(`Corridor sits outside the visible screen for ${offscreen} of ${r.clearAt} columns — those walls can't be seen, though the game now bounds the corridor to the screen.`)
  }

  // Portals. None of this forbids anything — a portal that loops you back is
  // a perfectly good trap to build on purpose. The report just has to say so,
  // because the solvers deliberately skip backward portals and would
  // otherwise call a level clearable without mentioning the cage in it.
  const ports = lv.portals || []
  if (ports.length) {
    const back = ports.filter(p => (p.toAt ?? p.at) < p.at)
    if (back.length) {
      r.warnings.push(
        `${back.length} portal(s) send you back up the level` +
        (back.length > 1 ? '' : ` (column ${back[0].at} to ${back[0].toAt})`) +
        ' — a loop. The check and the bot follow the route that dodges it, so' +
        ' "clearable" here means clearable if you stay out; anyone who goes' +
        ' through keeps going round.')
    }
    // How much room there is to dodge each mouth, which is the whole
    // difficulty of a trap and worth knowing exactly.
    const H = 500
    for (const p of ports) {
      const mouth = Math.min(1, p.mouth ?? 0.24)
      if (mouth >= 1) {
        r.warnings.push(`Portal at column ${p.at} spans the full height — it cannot be dodged.`)
        continue
      }
      const wl = lcWallAt(kfs, p.at, H)
      const cTop = wl.cy - wl.gapH / 2, cBot = wl.cy + wl.gapH / 2
      const mTop = (p.cf ?? 0.5) * H - mouth * H / 2
      const mBot = (p.cf ?? 0.5) * H + mouth * H / 2
      const above = mTop - cTop - 2 * LC_R
      const below = cBot - mBot - 2 * LC_R
      const room = Math.max(above, below)
      if (room < 0) {
        r.warnings.push(`Portal at column ${p.at} fills the corridor there — no way past it.`)
      } else if (room < 16) {
        r.warnings.push(`Portal at column ${p.at} leaves ${Math.round(room)}px to squeeze past on a 500px screen` +
                        ` (${Math.round(above)}px above, ${Math.round(below)}px below the mouth).`)
      }
    }
  }

  // Speed feel: how much of the level a player can actually see and react to
  r.colsPerFrame = speed * LC_DT
  r.lookahead    = 900 / speed          // seconds of level visible on a 900px arena
  if (r.colsPerFrame > 10) {
    r.warnings.push(`Scrolls ${(speed * LC_SIM_DT).toFixed(0)} columns per simulation step — detail finer than that is skipped entirely, so very narrow features here are decoration rather than obstacles.`)
  }
  if (r.lookahead < 0.35) {
    r.warnings.push(`Only ${r.lookahead.toFixed(2)}s of warning, below human reaction time — this has to be memorised rather than read.`)
  }

  // Exhaustive clearability across a range of window sizes.
  // The solver walks the level one 60Hz frame at a time, so it only tests
  // the columns that stepping happens to land on. That is fine at normal
  // speeds, but a level scrolling 167 columns a frame is sampled less than
  // 1 column in 100, and the verdict then turns on the sampling phase
  // rather than the level: ULTRASONIC came out unclearable at 59, 60 and
  // 61Hz — each dying at a different column — yet clear at 75Hz and above.
  // So on fast levels, re-test at several refresh rates and only call it
  // unclearable when no rate survives.
  let anyFail = false
  for (const h of LC_HEIGHTS) {
    const s = lcSolveWave(lv, h, LC_SIM_DT)
    if (!s.ok) { anyFail = true; r.heights.push({ h, ok:false, diedAt:s.diedAt }) }
    else {
      const frames = s.band / LC_FRAME
      r.heights.push({ h, ok:true, band:s.band, frames, atCol:s.atCol, label:lcLabel(frames) })
    }
  }
  const good = r.heights.filter(x => x.ok)
  r.clearable = good.length > 0
  if (!good.length) r.problems.push('Impossible at every window size tested — no sequence of inputs survives.')
  else if (anyFail) {
    const bad = r.heights.filter(x => !x.ok).map(x => x.h + 'px')
    r.problems.push(`Unclearable on a ${bad.join(', ')} tall window, so it is unplayable for some people.`)
  }
  if (good.length) {
    const tight = good.reduce((m, x) => x.frames < m.frames ? x : m, good[0])
    r.tightest = tight
    if (tight.frames < 1) r.warnings.push(`Frame-perfect at ${tight.h}px — exactly one viable line.`)
  }

  // Tightest gap in absolute terms, at a typical window
  const H = 500
  let minGap = Infinity, minCol = 0
  for (let c = 0; c <= r.clearAt; c += 2) {
    const g = lcWallAt(kfs, c, H).gapH
    if (g < minGap) { minGap = g; minCol = c }
  }
  r.tightestGap = { px: minGap, col: minCol, clearance: minGap - 2*LC_R }
  if (r.tightestGap.clearance < 4) {
    r.problems.push(`Tightest gap is ${minGap.toFixed(0)}px at column ${minCol} — the wave is ${2*LC_R}px tall, leaving ${r.tightestGap.clearance.toFixed(0)}px.`)
  }
  return r
}



// ═══════════════════════════════════════════════════════
//  UFO FLAP — bot line
//  Physics is gravity plus an impulse, so the state is (y, vy) rather
//  than a single height. The plan is the flap sequence itself: with the
//  game on a fixed timestep, replaying it reproduces the solve exactly.
//  Everything scales with height, matching what the game does.
// ═══════════════════════════════════════════════════════

const LC_U_GRAV = 880, LC_U_THRUST = -400, LC_U_RY = 11, LC_U_RX = 22, LC_U_PW = 62

function _lcUfoHit(lv, h, w, y, scroll, RY, RX, pad) {
  if (y - RY <= 0 || y + RY >= h) return true
  const ufoX = w * 0.20
  for (const p of lv.pipes || []) {
    const px = p.at + ufoX - scroll
    if (px >= ufoX + RX || px + LC_U_PW <= ufoX - RX) continue
    const gap = (p.gapf || lv.gapf || 0.3) * h
    const cy  = p.cyf * h
    // A landable pillar is not a wall on the side you may rest on
    if (y + RY > cy + gap / 2 && p.safe !== 'bottom') return true
    if (y - RY < cy - gap / 2 && p.safe !== 'top')    return true
    if (pad) {
      if (y + RY > cy + gap / 2 - pad && p.safe !== 'bottom') return true
      if (y - RY < cy - gap / 2 + pad && p.safe !== 'top')    return true
    }
  }
  return false
}

// Replay a flap list against continuous physics — the solver quantises,
// the game does not, so a plan is only trusted once it has been flown.
function _lcUfoReplay(lv, h, w, flaps, dt) {
  const k = h / 560
  const GRAV = LC_U_GRAV * k, THRUST = LC_U_THRUST * k
  const RY = LC_U_RY * k, RX = LC_U_RX * k
  const spd = (lv.speed || 160) * k
  let y = h / 2, vy = 0, scroll = 0
  // Index by scroll, not by a running counter. A portal moves the scroll
  // forward, and the flap list is laid out against absolute step numbers —
  // counting sequentially put the plan and the level out of step after a jump.
  const step = spd * dt
  const clear = lv.clearAt || 3000
  for (let guard = 0; scroll < clear && guard < flaps.length * 4; guard++) {
    const i = Math.min(flaps.length - 1, Math.max(0, Math.round(scroll / step)))
    if (flaps[i]) vy = THRUST
    vy += GRAV * dt
    y  += vy * dt
    const prevScroll = scroll
    scroll += spd * dt
    const port = _lcPortalCross(lv, prevScroll, scroll)
    if (port && (port.toAt ?? port.at) >= port.at) {
      scroll = Math.max(port.toAt ?? port.at, prevScroll + spd * dt)
      y = Math.max(RY + 2, Math.min(h - RY - 2, (port.toCf ?? 0.5) * h)); vy = 0
    }
    if (_lcUfoHit(lv, h, w, y, scroll, RY, RX, 0)) {
      // landing on a green pillar is a rest, not a death
      let rested = false
      const ufoX = w * 0.20
      for (const p of lv.pipes || []) {
        const px = p.at + ufoX - scroll
        if (px >= ufoX + RX || px + LC_U_PW <= ufoX - RX) continue
        const gap = (p.gapf || lv.gapf || 0.3) * h, cy = p.cyf * h
        if (p.safe === 'bottom' && y + RY > cy + gap / 2) { y = cy + gap/2 - RY; vy = 0; rested = true }
        if (p.safe === 'top'    && y - RY < cy - gap / 2) { y = cy - gap/2 + RY; vy = 0; rested = true }
      }
      if (!rested) return { ok: false, at: Math.round(scroll) }
    }
  }
  return { ok: true }
}

// A budget, because this blocks the page while it runs. A normal level takes
// 0.5-2s; a level authored into a corner can take far longer, and there is no
// good reason to freeze the tab for it. Out of time means no bot line, which
// the HUD says out loud, rather than a hang.
const LC_UFO_BUDGET_MS = 2500

// Same idea as the wave: portals make the route deterministic, so each
// stretch between them is an ordinary solve and the flap lists stitch.
function lcSolveUFOAll(lv, h, w, dt, worst) {
  const DT = dt || 1 / 240
  const k = h / 560
  const step = (lv.speed || 160) * k * DT
  const segs = _lcSegments(lv, h, step)
  if (segs.length <= 1) return lcSolveUFO(lv, h, w, DT, worst)
  const nSteps = Math.ceil((lv.clearAt || 3000) / step) + 2
  const flaps = new Array(nSteps).fill(false)
  let taps = 0, margin = Infinity
  for (const s of segs) {
    const r = lcSolveUFO(lv, h, w, DT, worst, s)
    if (!r.ok) return { ok: false }
    taps += r.taps
    margin = Math.min(margin, r.margin)
    for (let i = 0; i < r.flaps.length; i++) {
      const idx = r.startStep + i
      if (idx < nSteps) flaps[idx] = r.flaps[i]
    }
  }
  const plan = { ok: true, flaps, taps, margin, dt: DT }
  return _lcUfoReplay(lv, h, w, flaps, DT).ok ? plan : { ok: false }
}

function lcSolveUFO(lv, h, w, dt, worst, seg) {
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now())
  const outOfTime = () =>
    ((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0) > LC_UFO_BUDGET_MS
  const DT = dt || 1 / 240
  const k = h / 560
  const GRAV = LC_U_GRAV * k, THRUST = LC_U_THRUST * k
  const RY = LC_U_RY * k, RX = LC_U_RX * k
  const spd = (lv.speed || 160) * k
  const clear = seg ? seg.to : (lv.clearAt || 3000)
  const from  = seg ? seg.from : 0
  const startY = seg ? seg.startY : h / 2
  const QY = 2.5, QV = 18
  const key = (y, v) => Math.round(y / QY) + ':' + Math.round(v / QV)

  for (const pad of [10, 6, 3, 1, 0]) {
    if (outOfTime()) break
    const layers = []
    let cur = new Map([[key(startY, 0), { y: startY, vy: 0, prev: null, flap: false, taps: 0 }]])
    let scroll = from, guard = 0, dead = false
    while (scroll < clear && guard++ < 60000) {
      const next = new Map()
      const port = _lcPortalCross(lv, scroll, scroll + spd * DT)
      const pY = port ? Math.max(RY + 2, Math.min(h - RY - 2, (port.toCf ?? 0.5) * h)) : null
      for (const [kk, st] of cur) {
        for (const flap of [true, false]) {
          let vy = flap ? THRUST : st.vy
          vy += GRAV * DT
          let y = st.y + vy * DT
          if (pY !== null) { y = pY; vy = 0 }   // portal, before the hit test
          const sc = scroll + spd * DT
          if (_lcUfoHit(lv, h, w, y, sc, RY, RX, pad)) continue
          const nk = key(y, vy)
          const taps = st.taps + (flap ? 1 : 0)
          // Always solve for the fewest taps, even for evilbot — see the
          // note on _lcUfoMoreTaps for why maximising in here goes wrong.
          const seen = next.get(nk)
          if (!seen || seen.taps > taps) next.set(nk, { y, vy, prev: kk, flap, taps })
        }
      }
      if (next.size === 0) { dead = true; break }
      layers.push(next)
      cur = next
      scroll += spd * DT
      if ((layers.length & 255) === 0 && outOfTime()) { dead = true; break }
    }
    if (dead || !layers.length) continue

    let bestKey = null, bestTaps = Infinity
    for (const [kk, n] of cur) if (n.taps < bestTaps) { bestTaps = n.taps; bestKey = kk }
    const flaps = new Array(layers.length)
    let kk = bestKey
    for (let i = layers.length - 1; i >= 0; i--) {
      const n = layers[i].get(kk)
      flaps[i] = n.flap
      kk = n.prev
    }
    if (seg) return { ok: true, flaps, taps: bestTaps, margin: pad, dt: DT,
                      startStep: Math.round(from / (spd * DT)) }
    const check = _lcUfoReplay(lv, h, w, flaps, DT)
    if (!check.ok) continue
    if (worst) {
      const padded = _lcUfoMoreTaps(lv, h, w, flaps, DT)
      return { ok: true, flaps: padded, taps: padded.filter(Boolean).length, margin: pad, dt: DT }
    }
    return { ok: true, flaps, taps: bestTaps, margin: pad, dt: DT }
  }
  return { ok: false }
}

// evilbot. Maximising taps inside the search does not work: the state key
// quantises (y, vy), and preferring the flappiest way of reaching a key
// stores the representative that sits nearest a wall, so the search runs out
// of states — on FIRST STEPS it died at column 320 every time.
// Padding a plan that already flies is both robust and obviously valid:
// try adding a flap at each step, keep it only if the line still survives.
function _lcUfoMoreTaps(lv, h, w, flaps, DT) {
  const best = flaps.slice()
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now())
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < best.length - 1; i++) {
      if (best[i]) continue
      // Stop padding rather than run long — whatever it has by now still flies
      if ((i & 63) === 0 && now() - t0 > 900) return best
      best[i] = true
      if (!_lcUfoReplay(lv, h, w, best, DT).ok) best[i] = false
    }
  }
  return best
}

// ═══════════════════════════════════════════════════════
//  SPIDER — bot line
//  The spider is on the floor or the ceiling and nothing else, and a
//  block only kills you when you are on its surface. So the required
//  surface at every block is forced, and the only question is where to
//  flip between them. No search needed — just the flip columns.
// ═══════════════════════════════════════════════════════

function lcSolveSpider(lv, worst) {
  const obs = [...(lv.obstacles || [])].sort((a, b) => a.col - b.col)
  const flips = []
  let onFloor = true                     // the spider always spawns on the floor
  let prevCol = 0
  for (const o of obs) {
    const needFloor = !o.floor           // stand on the opposite surface
    if (needFloor !== onFloor) {
      // Flip in the clear space before this block. Latest possible is the
      // edge of its hit window; evilbot dawdles, the normal bot goes early.
      const latest = o.col - 26 / 2 - 9 - 2
      const earliest = prevCol + 26 / 2 + 9 + 2
      flips.push(Math.max(0, worst ? latest : Math.max(earliest, (earliest + latest) / 2)))
      onFloor = needFloor
    }
    prevCol = o.col
  }
  // evilbot pads out the run with harmless extra flips in the gaps
  if (worst) {
    const extra = []
    for (let i = 0; i < obs.length - 1; i++) {
      const a = obs[i].col + 22, b = obs[i+1].col - 22
      if (b - a < 90) continue
      extra.push(a + (b - a) * 0.34, a + (b - a) * 0.66)   // flip and flip back
    }
    flips.push(...extra)
    flips.sort((x, y) => x - y)
  }
  return { ok: true, flips, taps: flips.length }
}

if (typeof window !== 'undefined') {
  window.lcReport = lcReport
  window.lcSolveWave = lcSolveWave
  window.lcSolveLine = lcSolveLine
  window.lcSolveUFO = lcSolveUFO
  window.lcSolveUFOAll = lcSolveUFOAll
  window.lcSolveSpider = lcSolveSpider
  window.lcSolveLineSafe = lcSolveLineSafe
  window.lcWallAt = lcWallAt
  window.lcLabel = lcLabel
  window.LC_HEIGHTS = LC_HEIGHTS
  window.LC_FRAME = LC_FRAME
  window.LC_SIM_DT = LC_SIM_DT
}
if (typeof module !== 'undefined') module.exports = { lcReport, lcSolveWave, lcSolveLine, lcSolveLineSafe, lcSolveUFO, lcSolveUFOAll, lcSolveSpider, lcWallAt, lcLabel }
