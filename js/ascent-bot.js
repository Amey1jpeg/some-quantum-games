// ═══════════════════════════════════════════════════════
//  ENTANGLED ASCENT — practice bots
//
//  abPlan(level, W) works out, for every stretch of the level, which ship
//  states (height + vertical speed) can still reach the finish. The bot then
//  flies closed-loop: every DECIDE frames it looks at where each ship really
//  is and picks a thrust that lands in a state known to be survivable.
//
//    Bot      keeps its current input whenever that is still safe, so it
//             clears the level with as few inputs as it can.
//    Evilbot  changes input whenever a different one is still safe, so it
//             clears the level making as many inputs as it can.
//
//  The two ships are planned separately, each in "blue" coordinates where
//  gravity pulls toward y = 0 (pink is the same problem mirrored). That is
//  sound because the four keys can thrust the ships independently in every
//  mode. During a bot run the game turns speed portals and swapping off, so
//  the level's timing is fixed and the plan stays valid.
// ═══════════════════════════════════════════════════════

const AB_DECIDE = 6                 // frames between decisions (0.1 s — about human)
const AB_DT     = 1 / 60
// Clearance kept beyond the game's real hit sizes. The planner asks for the
// most it can get: a roomier plan forgives uneven frame times better.
const AB_PADS   = [5, 3, 1.5]
const AB_Y0     = AL_R
const AB_Y1     = AL_HALF - AL_R - 2
const AB_NY     = AB_Y1 - AB_Y0 + 1
const AB_VSTEP  = 10
const AB_NV     = 2 * AL_VMAX / AB_VSTEP + 1

function _abMirror(o) {
  const m = Object.assign({}, o)
  if (o.t === 'col') { m.top = [AL_H - o.bot[1], AL_H - o.bot[0]]; m.bot = [AL_H - o.top[1], AL_H - o.top[0]] }
  else if (o.t === 'strip') m.edge = { top: 'bottom', bottom: 'top', midtop: 'midbot', midbot: 'midtop' }[o.edge]
  else if (o.y !== undefined) m.y = AL_H - o.y
  m.flip = true
  return m
}

// For each frame, which ship-centre heights are deadly (top-half coordinates)
function _abMasks(objs, frames, dx, W, pad) {
  const rr = AL_R - 2 + pad
  const out = new Array(frames)
  const blocks = objs.filter(o => o.t === 'block').map(o => {
    const gy = o.flip ? AL_H - o.y : o.y, inTop = gy < AL_HALF      // the game's own y, so sliders move as they do in play
    return { o, y: gy, dir: 1, live: false,
      lo: (inTop ? 0 : AL_HALF) + AL_BLOCK / 2 + 4, hi: (inTop ? AL_HALF : AL_H) - AL_BLOCK / 2 - 4 }
  })
  const near = objs.filter(o => o.t !== 'block' && o.t !== 'orb' && o.t !== 'portal' && o.t !== 'trigger')
  for (let f = 0; f < frames; f++) {
    const x = (f + 1) * dx, m = new Uint8Array(AB_NY)
    const ban = (lo, hi) => { for (let i = Math.max(0, Math.ceil(lo - AB_Y0)); i <= Math.min(AB_NY - 1, Math.floor(hi - AB_Y0)); i++) m[i] = 1 }
    for (const b of blocks) {
      if (!b.live && b.o.x - 120 < x + W * 0.72 + 200) b.live = true            // when the game feeds it in
      if (b.live && b.o.slide) {
        b.y += b.o.slide * b.dir * AB_DT
        if (b.y < b.lo) { b.y = b.lo; b.dir = 1 }
        if (b.y > b.hi) { b.y = b.hi; b.dir = -1 }
      }
      if (Math.abs(x - b.o.x) < AL_BLOCK / 2 + rr) { const y = b.o.flip ? AL_H - b.y : b.y; ban(y - AL_BLOCK / 2 - rr, y + AL_BLOCK / 2 + rr) }
    }
    for (const o of near) {
      if (o.t === 'col') {
        if (Math.abs(x - o.x) < (o.w || AL_COL_W) / 2 + rr) { ban(-99, o.top[0] + rr); ban(o.top[1] - rr, 999) }
      } else if (o.t === 'strip') {
        if (x > o.x - rr && x < o.x + o.len + rr) {
          if (o.edge === 'top') ban(-99, AL_STRIP_H + rr)
          if (o.edge === 'midtop') ban(AL_HALF - AL_STRIP_H - rr, 999)
        }
      } else if (o.t === 'saw') {
        const rad = (o.r || AL_SAW_R) + AL_R - 3 + pad, d = Math.abs(x - o.x)
        if (d < rad) { const h = Math.sqrt(rad * rad - d * d); ban(o.y - h, o.y + h) }
      }
    }
    out[f] = m
  }
  return out
}

// One decision's worth of flight from (y, v). Leaves the landing state in
// AB_AT and returns true, or returns false if the ship dies on the way.
const AB_AT = [0, 0]
function _abFly(mk, f0, y, v, a) {
  for (let s = 0; s < AB_DECIDE; s++) {
    const m = mk[f0 + s]; if (!m) break
    v += (a * AL_THRUST - AL_GRAV) * AB_DT
    if (v > AL_VMAX) v = AL_VMAX; else if (v < -AL_VMAX) v = -AL_VMAX
    y += v * AB_DT
    if (y < AB_Y0) { y = AB_Y0; if (v < 0) v = 0 } else if (y > AB_Y1) { y = AB_Y1; if (v > 0) v = 0 }
    if (m[Math.round(y) - AB_Y0]) return false
  }
  AB_AT[0] = y; AB_AT[1] = v
  return true
}

// Is the exact state (y, v) known to be able to finish? The grid only knows
// about cell centres, and rounding to the nearest one can make a hopeless
// state look fine — so a state counts only if all four cells around it do.
// That errs on the side of "no", which is the side a bot can live with.
function _abAlive(A, y, v) {
  const fy = y - AB_Y0, fv = (v + AL_VMAX) / AB_VSTEP
  const y0 = Math.max(0, Math.floor(fy)), y1 = Math.min(AB_NY - 1, Math.ceil(fy))
  const v0 = Math.max(0, Math.floor(fv)), v1 = Math.min(AB_NV - 1, Math.ceil(fv))
  return A[y0 * AB_NV + v0] && A[y0 * AB_NV + v1] && A[y1 * AB_NV + v0] && A[y1 * AB_NV + v1] ? 1 : 0
}

// Backward pass: alive[k] marks the states at decision k that can still finish
function _abSolve(objs, steps, dx, W, pad) {
  const mk = _abMasks(objs, steps * AB_DECIDE, dx, W, pad)
  const N = AB_NY * AB_NV
  const alive = new Array(steps + 1)
  alive[steps] = new Uint8Array(N).fill(1)
  for (let k = steps - 1; k >= 0; k--) {
    const cur = new Uint8Array(N), nxt = alive[k + 1]; let any = false
    for (let i = 0; i < N; i++) {
      const y = AB_Y0 + ((i / AB_NV) | 0), v = (i % AB_NV) * AB_VSTEP - AL_VMAX
      for (let a = -1; a <= 1; a++) {
        if (_abFly(mk, k * AB_DECIDE, y, v, a) && _abAlive(nxt, AB_AT[0], AB_AT[1])) { cur[i] = 1; any = true; break }
      }
    }
    if (!any) return null
    alive[k] = cur
  }
  return { mk, alive }
}

// Plan a level. `fwd` is the forward speed in units/s the run will hold.
function abPlan(level, W, fwd) {
  const dx = fwd * AB_DT
  const steps = Math.ceil(alEndX(level) / (dx * AB_DECIDE)) + 2
  const start = (150 - AB_Y0) * AB_NV + AL_VMAX / AB_VSTEP
  const mirrored = level.objects.map(_abMirror)
  // Each ship gets the roomiest plan that exists for it
  const side = objs => {
    for (const pad of AB_PADS) { const r = _abSolve(objs, steps, dx, W, pad); if (r && r.alive[0][start]) return r }
    return null
  }
  const blue = side(level.objects), pink = blue && side(mirrored)
  if (!blue || !pink) return null
  return { dx, steps, blue, pink, k: -1, a: [0, 0], inputs: 0 }
}

// Called every frame of a bot run. Returns [blueThrust, pinkThrust], each -1/0/1
// in screen terms (positive = down the screen), and counts input changes.
function abControl(plan, evil, x, py, pv, ty, tv) {
  // The frame being flown right now, in the planner's numbering (the game
  // moves x forward before it flies the ships), and the decision it falls in
  const fNow = Math.max(0, Math.round(x / plan.dx) - 1)
  const k = Math.min(plan.steps - 1, Math.floor(fNow / AB_DECIDE))
  if (k === plan.k) return [plan.a[0], -plan.a[1]]
  plan.k = k
  // Look ahead from the frame the ship is actually on, not the nominal start
  // of the step — real frames don't land exactly on it
  const f0 = fNow
  const pick = (side, y, v, cur) => {
    // Bot: stay put first. Evilbot: anything but the current input first.
    const order = evil
      ? [-1, 0, 1].filter(a => a !== cur).sort((p, q) => Math.abs(q - cur) - Math.abs(p - cur)).concat([cur])
      : [cur].concat([-1, 0, 1].filter(a => a !== cur).sort((p, q) => Math.abs(p - cur) - Math.abs(q - cur)))
    // Real frames aren't the planner's tidy 1/60 s, so "survivable on paper"
    // is not enough to bet on. Each option is scored by its slack: how many
    // of the three inputs on the FOLLOWING step would still leave a way to
    // finish (0-3). The bot takes the option with the most slack and only
    // uses its own preference — same input for Bot, a different one for
    // Evilbot — to choose between options that are equally safe. An option
    // that merely lives through this step is the last resort.
    const A = side.alive[k + 1], A2 = side.alive[k + 2]
    const slack = (yj, vj) => {
      if (!A2) return 3
      let n = 0
      for (let a2 = -1; a2 <= 1; a2++) if (_abFly(side.mk, (k + 1) * AB_DECIDE, yj, vj, a2) && _abAlive(A2, AB_AT[0], AB_AT[1])) n++
      return n
    }
    let best = null, bestSlack = -1, fallback = null
    for (const a of order) {                       // in preference order, so ties go to the preferred one
      if (!_abFly(side.mk, f0, y, v, a)) continue
      const yj = AB_AT[0], vj = AB_AT[1]
      if (_abAlive(A, yj, vj)) { const sl = slack(yj, vj); if (sl > bestSlack) { bestSlack = sl; best = a } }
      else if (fallback === null) fallback = a
    }
    if (best !== null) return best
    return fallback === null ? cur : fallback
  }
  const yb = Math.max(AB_Y0, Math.min(AB_Y1, py)), yp = Math.max(AB_Y0, Math.min(AB_Y1, AL_H - ty))
  const a0 = pick(plan.blue, yb, pv, plan.a[0])
  const a1 = pick(plan.pink, yp, -tv, plan.a[1])        // pink is planned mirrored
  if (a0 !== plan.a[0]) plan.inputs++
  if (a1 !== plan.a[1]) plan.inputs++
  plan.a = [a0, a1]
  return [a0, -a1]
}
