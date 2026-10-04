// ═══════════════════════════════════════════════════════
//  ENTANGLED ASCENT — level format, generator and built-in levels
//  Shared by index.html (the game) and editor.html (the editor).
//
//  Levels live in a fixed 600-unit-tall world and are scaled to the
//  screen, so a level plays the same on any display.
//
//  Level:  { name, speed, length, objects: [...] }
//    speed   base forward speed, units/s
//    length  x of the finish line
//  Objects (x is forward distance; y is 0 at the top, 600 at the bottom):
//    { t:'col',    x, top:[a,b], bot:[a,b], w? }  spike column; top/bot are the
//                                                  gaps in your half / the twin's
//    { t:'block',  x, y, slide? }                  spiked block, slide = units/s
//    { t:'portal', x, y, kind:'slow'|'normal'|'fast' }
//    { t:'orb',    x, y, kind:'gold'|'green' }
//    { t:'saw',    x, y, r? }                      spinning saw blade
//    { t:'strip',  x, len, edge }                  spike strip; edge 'top' | 'midtop' |
//                                                  'midbot' | 'bottom' (mid = along the mirror line)
//    { t:'trigger', x, mode:'desync'|'sync'|'finish' }
//                                                  desync starts a section where the link is
//                                                  forced broken (W/S you, ↑/↓ twin); sync ends it;
//                                                  finish ends the level at that x, at every height
//  A half wall is just a column whose other gap is the whole half.
// ═══════════════════════════════════════════════════════

const AL_H        = 600
const AL_HALF     = 300
const AL_PAD      = 6
const AL_R        = 11      // dot radius
const AL_SPD_Y    = 230     // vertical steering speed
const AL_COL_W    = 18
const AL_BLOCK    = 26
const AL_PORTAL_W = 26
const AL_PORTAL_H = 96
const AL_MULT     = { slow: 0.65, normal: 1, fast: 1.45 }
const AL_SAW_R     = 22
const AL_STRIP_H   = 18
const AL_PORTAL_COL = { slow: '#22d3ee', normal: '#a78bfa', fast: '#f97316' }

// A column is desync when no mirrored pair of positions (you at y, twin at
// 600 - y) fits through both gaps — the pair has to be re-aligned.
function alIsDesync(o) {
  const lo = Math.max(o.top[0] + AL_R, AL_H - o.bot[1] + AL_R)
  const hi = Math.min(o.top[1] - AL_R, AL_H - o.bot[0] - AL_R)
  return hi < lo
}

// Where the level actually ends: the first finish trigger, else `length`
function alEndX(lv) {
  const f = lv.objects.filter(o => o.t === 'trigger' && o.mode === 'finish').map(o => o.x)
  return f.length ? Math.min(lv.length, ...f) : lv.length
}

function alStripRect(o) {
  const y = o.edge === 'top' ? 0 : o.edge === 'bottom' ? AL_H - AL_STRIP_H
          : o.edge === 'midtop' ? AL_HALF - AL_STRIP_H : AL_HALF
  return [o.x, y, o.len, AL_STRIP_H]
}

// Forward distance covered while steering `travel` units vertically
function alReach(travel, fwd) { return (travel / AL_SPD_Y) * fwd * 1.3 + 50 }

// ── Generator ────────────────────────────────────────────
// Streams objects chunk by chunk. Spacing is worked out from how far the
// dots must travel and the fastest they could be going (portals are
// optional, so a fast one might have been taken), which keeps every
// layout passable.
function alGenerator(rand, opts) {
  const o = Object.assign({
    gap0: 175, gapMin: 105, gapStep: 1.8,
    sep0: 330, sepMin: 230, sepStep: 2.5,
    desync: true, firstDesync: 5, desyncChance: 40,
    doubles: true, doublesAfter: 14,
    portals: true, blocks: true, blocksAfter: 4, slide: true, slideAfter: 12,
    orbs: true,
  }, opts)
  const g = { objs: [], x: 0, cols: 0, sinceDesync: 0, opts: o }
  const worst = o.portals ? AL_MULT.fast : 1
  const gapAt = () => Math.min(Math.max(o.gapMin, o.gap0 - g.cols * o.gapStep), AL_HALF - AL_PAD * 2 - 20)
  const sepAt = () => Math.max(o.sepMin, o.sep0 - g.cols * o.sepStep)

  function portal(x, kind) {
    const half = rand(2)
    const y = half * AL_HALF + AL_PORTAL_H / 2 + 10 + rand(AL_HALF - AL_PORTAL_H - 20)
    g.objs.push({ t: 'portal', x, y, kind })
  }

  function normal(fwd) {
    const x = g.x, gap = gapAt()
    const top0 = AL_PAD + rand(AL_HALF - gap - AL_PAD * 2)
    const jitter = Math.floor(gap * 0.25)
    let bot0 = AL_H - (top0 + gap) + rand(jitter * 2 + 1) - jitter
    bot0 = Math.max(AL_HALF + AL_PAD, Math.min(AL_H - AL_PAD - gap, bot0))
    g.objs.push({ t: 'col', x, top: [top0, top0 + gap], bot: [bot0, bot0 + gap] })
    g.cols++; g.sinceDesync++
    const sep = Math.max(sepAt(), alReach(AL_HALF - gap, fwd * worst))
    if (o.blocks && g.cols > o.blocksAfter && rand(100) < 40) {
      const s = AL_BLOCK
      const by = AL_PAD + s + rand(AL_HALF - 2 * s - AL_PAD * 2)
      const slide = o.slide && g.cols > o.slideAfter && rand(2) === 0 ? 45 + rand(55) : 0
      g.objs.push({ t: 'block', x: x + sep / 2, y: by, slide })
      g.objs.push({ t: 'block', x: x + sep / 2, y: AL_H - by, slide })
    }
    if (o.orbs) {
      const r = rand(10)
      if (r < 2)      g.objs.push({ t: 'orb', x: x + 70, y: top0 + gap / 2, kind: 'gold' })
      else if (r < 3) g.objs.push({ t: 'orb', x: x + 70, y: bot0 + gap / 2, kind: 'green' })
    }
    g.x = x + sep
  }

  // Your gap hugs one edge of your half, the twin's hugs the edge that is
  // NOT the mirror. `flip` swaps which edges.
  function desyncGaps(gap, flip) {
    const slack = AL_HALF - AL_PAD * 2 - gap * 2 - 24
    const n = () => rand(Math.max(1, slack / 2))
    const t = flip ? AL_PAD + n() : AL_HALF - AL_PAD - gap - n()
    const b = flip ? AL_HALF + AL_PAD + n() : AL_H - AL_PAD - gap - n()
    return [[t, t + gap], [b, b + gap]]
  }

  function desyncZone(fwd) {
    const x = g.x
    const vz = fwd * worst
    const gap = Math.max(64, Math.min(Math.floor(gapAt() * 0.72), Math.floor((AL_HALF - AL_PAD * 2 - 24) / 2)))
    const w = AL_COL_W * 2
    const count = o.doubles && g.cols >= o.doublesAfter && rand(100) < 55 ? 2 : 1
    if (o.portals) portal(x, rand(2) ? 'fast' : 'slow')
    let cx = x + alReach(AL_HALF - gap, vz)
    let flip = rand(2) === 1, prev = null
    for (let i = 0; i < count; i++) {
      const gaps = desyncGaps(gap, flip)
      if (prev) cx += w + alReach(Math.max(Math.abs(gaps[0][0] - prev[0][0]), Math.abs(gaps[1][0] - prev[1][0])), vz)
      g.objs.push({ t: 'col', x: cx, w, top: gaps[0], bot: gaps[1] })
      g.cols++
      prev = gaps; flip = !flip
    }
    const end = cx + w / 2 + 90
    if (o.portals) portal(end, 'normal')
    g.sinceDesync = 0
    g.x = end + alReach(AL_HALF - gapAt(), vz)
  }

  g.next = function(fwd) {
    if (o.desync && g.cols >= o.firstDesync && g.sinceDesync >= 3 && rand(100) < o.desyncChance) desyncZone(fwd)
    else normal(fwd)
  }
  return g
}

// ── Built-in levels ──────────────────────────────────────
// Build levels in editor.html (🔗 Entangled Ascent tab), press "Copy as JS"
// and paste the result into this list. They show up in the game in order,
// each one unlocking the next.
const AL_LEVELS = [
]

let _alBuiltins = null
function alBuiltinLevels() {
  if (!_alBuiltins) _alBuiltins = AL_LEVELS.map(alCleanLevel).filter(Boolean)
  return _alBuiltins
}

// Drafts made in the editor, shared with the game's "Your levels" list
const AL_DRAFTS_KEY = 'qg_ascent_drafts_v1'
const AL_TEST_KEY   = 'qg_ascent_test_v1'
function alLoadDrafts() {
  try { const v = JSON.parse(localStorage.getItem(AL_DRAFTS_KEY) || '[]'); return Array.isArray(v) ? v : [] }
  catch { return [] }
}
function alSaveDrafts(list) { try { localStorage.setItem(AL_DRAFTS_KEY, JSON.stringify(list)) } catch {} }

// Basic sanity for anything loaded from storage or pasted in
function alCleanLevel(lv) {
  if (!lv || typeof lv !== 'object' || !Array.isArray(lv.objects)) return null
  const num = (v, d) => (typeof v === 'number' && isFinite(v)) ? v : d
  const pair = p => Array.isArray(p) && p.length === 2 ? [num(p[0], 0), num(p[1], 0)].sort((a, b) => a - b) : null
  const objects = []
  for (const o of lv.objects) {
    if (!o || typeof o !== 'object') continue
    const x = num(o.x, null); if (x === null) continue
    if (o.t === 'col') {
      const top = pair(o.top), bot = pair(o.bot); if (!top || !bot) continue
      objects.push({ t: 'col', x, top, bot, w: num(o.w, AL_COL_W) })
    } else if (o.t === 'block') objects.push({ t: 'block', x, y: num(o.y, 150), slide: num(o.slide, 0) })
    else if (o.t === 'portal' && AL_MULT[o.kind]) objects.push({ t: 'portal', x, y: num(o.y, 150), kind: o.kind })
    else if (o.t === 'orb' && (o.kind === 'gold' || o.kind === 'green')) objects.push({ t: 'orb', x, y: num(o.y, 150), kind: o.kind })
    else if (o.t === 'saw') objects.push({ t: 'saw', x, y: num(o.y, 150), r: Math.max(8, Math.min(80, num(o.r, AL_SAW_R))) })
    else if (o.t === 'strip' && ['top', 'midtop', 'midbot', 'bottom'].includes(o.edge))
      objects.push({ t: 'strip', x, len: Math.max(20, num(o.len, 200)), edge: o.edge })
    else if (o.t === 'trigger' && ['desync', 'sync', 'finish'].includes(o.mode)) objects.push({ t: 'trigger', x, mode: o.mode })
  }
  objects.sort((a, b) => a.x - b.x)
  return {
    name: String(lv.name || 'Untitled').slice(0, 40),
    speed: Math.max(60, Math.min(400, num(lv.speed, 170))),
    length: Math.max(400, num(lv.length, 3000)),
    objects,
  }
}
