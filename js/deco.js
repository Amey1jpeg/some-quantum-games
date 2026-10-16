// ═══════════════════════════════════════════════════════
//  DECO — decorative, non-lethal level scenery
//  Shared by Wave Gauntlet (43) and Spider (44), and by the
//  local level editor. Also home to the concept backdrops
//  (drawDecoTheme) for Spin Flip and Entangled Gauntlet. Drawn behind the corridor/obstacles so
//  it can never be mistaken for something that kills you.
//
//  One deco item:
//    { t, col, cf, w, hf, c, a, tx, rot }
//      t    shape: rect diamond circle bar tri line text laser
//      col  world column (same axis as keyframes / obstacles)
//      cf   vertical centre, fraction of canvas height
//      w    width in columns
//      hf   height as a fraction of canvas height
//      c    index into DECO_COLS
//      a    alpha 0–1 (defaults low so it stays background)
//      tx   text content, `text` type only
//      rot  rotation in degrees
//      mk   motion keyframes — optional, makes the item move:
//             [{ t, dx, dy, rot, a }, ...]
//           t is seconds, dx columns, dy fraction of canvas height,
//           rot degrees, a an alpha multiplier. Values are offsets from
//           the item's base position and loop at the last keyframe.
//      mkSpeed  playback rate for mk, 1 = as authored
// ═══════════════════════════════════════════════════════

const DECO_COLS = [
  '#22c55e', // green
  '#06b6d4', // cyan
  '#a855f7', // purple
  '#f59e0b', // amber
  '#ef4444', // red
  '#e2e8f0', // white
]
// Same slots, deepened for a light page — the neon tints wash out on white,
// and "white" would vanish entirely, so it becomes slate
const DECO_COLS_LIGHT = [
  '#16a34a', // green
  '#0891b2', // cyan
  '#9333ea', // purple
  '#d97706', // amber
  '#dc2626', // red
  '#334155', // white → slate
]
const DECO_TYPES = ['rect', 'diamond', 'circle', 'bar', 'tri', 'line', 'text', 'laser']

const DECO_DEFAULT_ALPHA = 0.22

// Where a motion track sits at time `time`, looping over its span.
// Returns offsets, all zero (and alpha 1) when the item doesn't move.
function decoMotion(d, time) {
  const mk = d.mk
  time = time * (d.mkSpeed ?? 1)
  if (!mk || mk.length === 0) return { dx:0, dy:0, rot:0, a:1 }
  if (mk.length === 1) return { dx:mk[0].dx||0, dy:mk[0].dy||0, rot:mk[0].rot||0, a:mk[0].a ?? 1 }

  const span = mk[mk.length-1].t || 1
  const tt   = span > 0 ? ((time % span) + span) % span : 0
  let i = 1
  while (i < mk.length && mk[i].t < tt) i++
  const a = mk[i-1], b = mk[Math.min(i, mk.length-1)]
  const gap = (b.t - a.t) || 1
  const f = Math.max(0, Math.min(1, (tt - a.t) / gap))
  const lerp = (p, q, dflt) => {
    const av = p ?? dflt, bv = q ?? dflt
    return av + (bv - av) * f
  }
  return {
    dx:  lerp(a.dx,  b.dx,  0),
    dy:  lerp(a.dy,  b.dy,  0),
    rot: lerp(a.rot, b.rot, 0),
    a:   lerp(a.a,   b.a,   1),
  }
}

// scroll  = current world scroll in columns
// originX = canvas x that world column `scroll` maps to
// opts.time = seconds elapsed, drives any motion tracks
function drawDeco(ctx, deco, w, h, scroll, originX, opts) {
  if (!deco || !deco.length) return
  const glow = !opts || opts.glow !== false
  const time = (opts && opts.time) || 0
  const pal  = (typeof qgLight === 'function' && qgLight()) ? DECO_COLS_LIGHT : DECO_COLS
  ctx.save()
  for (const d of deco) {
    const m  = decoMotion(d, time)
    const dw = (d.w ?? 40)
    const x  = (d.col ?? 0) + m.dx - scroll + originX
    if (x + dw < -40 || x - dw > w + 40) continue      // offscreen

    const y   = ((d.cf ?? 0.5) + m.dy) * h
    const dh  = (d.hf ?? 0.1) * h
    const col = pal[d.c ?? 0] || pal[0]

    ctx.globalAlpha = (d.a ?? DECO_DEFAULT_ALPHA) * m.a
    ctx.fillStyle   = col
    ctx.strokeStyle = col
    ctx.lineWidth   = 2
    if (glow) { ctx.shadowColor = col; ctx.shadowBlur = 10 }

    ctx.save()
    ctx.translate(x, y)
    const rot = (d.rot || 0) + m.rot
    if (rot) ctx.rotate(rot * Math.PI / 180)

    switch (d.t) {
      case 'diamond':
        ctx.beginPath()
        ctx.moveTo(0, -dh/2); ctx.lineTo(dw/2, 0)
        ctx.lineTo(0,  dh/2); ctx.lineTo(-dw/2, 0)
        ctx.closePath(); ctx.stroke()
        break
      case 'circle':
        ctx.beginPath(); ctx.arc(0, 0, Math.min(dw, dh) / 2, 0, Math.PI*2); ctx.stroke()
        break
      case 'bar':
        ctx.fillRect(-dw/2, -dh/2, dw, dh)
        break
      case 'tri':
        ctx.beginPath()
        ctx.moveTo(0, -dh/2); ctx.lineTo(dw/2, dh/2); ctx.lineTo(-dw/2, dh/2)
        ctx.closePath(); ctx.stroke()
        break
      case 'line':
        ctx.beginPath(); ctx.moveTo(-dw/2, 0); ctx.lineTo(dw/2, 0); ctx.stroke()
        break
      case 'laser':
        _decoLaser(ctx, -dw/2, 0, dw/2, 0, col, 0.5 + 0.5 * Math.sin(time * 9 + (d.col || 0)))
        break
      case 'text':
        ctx.font = `bold ${Math.max(8, Math.round(dh))}px monospace`
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(d.tx || '', 0, 0)
        break
      default: // rect
        ctx.strokeRect(-dw/2, -dh/2, dw, dh)
    }

    ctx.restore()
  }
  ctx.restore()
}

// Ready-made motion tracks, so common movement is one click in the editor
const DECO_MOTIONS = {
  none:    null,
  bobV:    [{t:0,dy:-0.05},{t:1.4,dy:0.05},{t:2.8,dy:-0.05}],
  slideH:  [{t:0,dx:-70},{t:2,dx:70},{t:4,dx:-70}],
  spin:    [{t:0,rot:0},{t:3,rot:360}],
  pulse:   [{t:0,a:0.35},{t:0.9,a:1},{t:1.8,a:0.35}],
  drift:   [{t:0,dx:-40,dy:-0.04},{t:2.5,dx:40,dy:0.04},{t:5,dx:-40,dy:-0.04}],
}

// Editor convenience — a fresh item of the given type
function makeDeco(t, col, cf) {
  const d = { t, col: Math.round(col), cf: +cf.toFixed(4), w: 60, hf: 0.12, c: 1, a: DECO_DEFAULT_ALPHA }
  if (t === 'text') { d.tx = 'TEXT'; d.hf = 0.06; d.a = 0.5 }
  if (t === 'line') { d.hf = 0.01; d.w = 120 }
  if (t === 'bar')  { d.a = 0.14 }
  if (t === 'laser') { d.hf = 0.02; d.w = 160; d.c = 2; d.a = 0.5 }
  return d
}

// ── Lasers ───────────────────────────────────────────────
// One beam between two emitters: a wide soft pass, a thin hot core, and a
// small housing at each end. `on` (0–1) fades the beam; at 0 only a dashed
// sighting line is left, so a laser that is "off" still reads as a laser.
function _decoLaser(ctx, x1, y1, x2, y2, col, on) {
  ctx.save()
  ctx.strokeStyle = col; ctx.fillStyle = col
  ctx.lineCap = 'round'
  if (on > 0.05) {
    const a = ctx.globalAlpha
    ctx.globalAlpha = a * 0.25 * on
    ctx.lineWidth = 6
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
    ctx.globalAlpha = a * on
    ctx.lineWidth = 1.4
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
    ctx.globalAlpha = a
  } else {
    ctx.setLineDash([3, 7]); ctx.lineWidth = 1
    ctx.globalAlpha *= 0.35
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
    ctx.setLineDash([]); ctx.globalAlpha /= 0.35
  }
  for (const [x, y] of [[x1, y1], [x2, y2]]) {
    ctx.fillRect(x - 4, y - 4, 8, 8)
    ctx.beginPath(); ctx.arc(x, y, 2 + 2 * on, 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()
}

// ═══════════════════════════════════════════════════════
//  CONCEPT BACKDROPS — themed scenery, no level data needed
//  Each one is a pure function of scroll and time: the world is cut into
//  slots, and every slot hashes its own index to pick what goes there. So
//  endless runs get scenery for free, and a level always looks the same.
//  Everything sits on a slower parallax layer than the play field and is
//  drawn faint, so it reads as far-off background and never as a hazard.
//
//  scroll  = world scroll (same units as the game's own)
//  originX = screen x where world `scroll` sits
//  opts.time = seconds, for motion; opts.mid = centre line (entangled)
//  A theme either has `draw` (one slot at a time) or `paint` (whole frame).
// ═══════════════════════════════════════════════════════

// Stable 0–1 noise from a slot index and a salt
function _decoHash(i, k) {
  let x = Math.imul(i | 0, 374761393) ^ Math.imul((k | 0) + 1, 668265263)
  x = Math.imul(x ^ (x >>> 13), 1274126177)
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296
}

const DECO_THEMES = {
  // Spin Flip — the spider's own nest. Threads drop from the ceiling or
  // climb from the floor with a small spider bobbing on the end, corner
  // webs fan out from both, and the odd ↑↓ marks the spin flip.
  spider: { gap: 170, par: 0.5, draw(ctx, i, x, h, t, pal) {
    const r = k => _decoHash(i, k)
    const up  = r(0) < 0.5               // anchored to the ceiling?
    const col = r(1) < 0.7 ? pal[2] : pal[5]
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1
    const kind = r(2)
    if (kind < 0.45) {
      // Dangling spider
      const len = h * (0.18 + r(3) * 0.3) + Math.sin(t * 1.3 + r(4) * 6) * h * 0.04
      const ay = up ? 0 : h, by = up ? len : h - len
      ctx.globalAlpha = 0.28
      ctx.beginPath(); ctx.moveTo(x, ay); ctx.lineTo(x, by); ctx.stroke()
      ctx.globalAlpha = 0.4
      ctx.beginPath(); ctx.arc(x, by, 4, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(x, by + (up ? 5 : -5), 2.5, 0, Math.PI * 2); ctx.fill()
      const wig = Math.sin(t * 6 + i) * 0.25
      for (const s of [-1, 1]) for (let l = 0; l < 4; l++) {
        const a = (-0.7 + l * 0.45 + wig) * (up ? 1 : -1)
        ctx.beginPath(); ctx.moveTo(x, by)
        ctx.quadraticCurveTo(x + s * 6 * Math.cos(a), by + 6 * Math.sin(a) - 3,
                             x + s * 9 * Math.cos(a), by + 9 * Math.sin(a) + 2)
        ctx.stroke()
      }
    } else if (kind < 0.8) {
      // Corner web: spokes fanning off the wall, joined by sagging rings
      const R = h * (0.12 + r(3) * 0.14), ay = up ? 0 : h, dir = up ? 1 : -1
      const spokes = 6, rings = 4
      ctx.globalAlpha = 0.18
      const pt = (s, f) => {
        const a = Math.PI * (0.08 + 0.84 * s / (spokes - 1))
        return [x - Math.cos(a) * R * f, ay + dir * Math.sin(a) * R * f]
      }
      for (let s = 0; s < spokes; s++) {
        const [px, py] = pt(s, 1)
        ctx.beginPath(); ctx.moveTo(x, ay); ctx.lineTo(px, py); ctx.stroke()
      }
      for (let g = 1; g <= rings; g++) {
        const f = g / rings
        ctx.beginPath()
        for (let s = 0; s < spokes; s++) {
          const [px, py] = pt(s, f)
          if (!s) { ctx.moveTo(px, py); continue }
          const [qx, qy] = pt(s - 0.5, f * 0.86)    // sag toward the hub
          ctx.quadraticCurveTo(qx, qy, px, py)
        }
        ctx.stroke()
      }
    } else {
      // Spin-flip marker
      ctx.globalAlpha = 0.16 + 0.08 * Math.sin(t * 2 + i)
      ctx.font = `bold ${Math.round(h * 0.09)}px monospace`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(r(3) < 0.5 ? '↑↓' : '↓↑', x, h * (0.3 + r(4) * 0.4))
    }
  }},

  // Entangled Gauntlet — mirror horizon. A synthwave grid runs away into
  // the centre line from both sides, blue ceiling above and pink floor
  // below, so the line reads as one horizon the two ships share. Rungs
  // stream toward the horizon and the rays slide with the scroll, so the
  // speed of the run is easy to feel. Whole-frame, so it uses `paint`.
  entangled: { par: 1, paint(ctx, w, h, s, t, pal, opts) {
    const mid  = opts.mid ?? h / 2
    const lt   = typeof qgLight === 'function' && qgLight()
    const blue = lt ? '#2563eb' : '#3b82f6', pink = lt ? '#db2777' : '#ec4899'
    const vx   = w / 2
    ctx.lineWidth = 1
    for (const [sign, c] of [[-1, blue], [1, pink]]) {
      const depth = sign < 0 ? mid : h - mid
      ctx.strokeStyle = c
      // Rungs, bunching toward the horizon
      for (let k = 0; k < 14; k++) {
        const f = (k + (s / 60) % 1) / 14, z = f * f
        const y = mid + sign * (8 + z * (depth - 8))
        ctx.globalAlpha = 0.08 + 0.22 * z
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
      }
      // Rays from the vanishing point
      ctx.globalAlpha = 0.15
      const n = Math.ceil(w / 240) + 2
      for (let k = -n; k <= n; k++) {
        const xb = vx + k * 120 - ((s * 0.6) % 120)
        ctx.beginPath()
        ctx.moveTo(vx + (xb - vx) * 0.04, mid + sign * 8)
        ctx.lineTo(vx + (xb - vx) * 2.2,  mid + sign * depth)
        ctx.stroke()
      }
      // Glow hugging the horizon
      const g = ctx.createLinearGradient(0, mid, 0, mid + sign * 90)
      g.addColorStop(0, c + '30'); g.addColorStop(1, c + '00')
      ctx.globalAlpha = 1; ctx.fillStyle = g
      ctx.fillRect(0, sign < 0 ? mid - 90 : mid, w, 90)
    }
  }},
}

function drawDecoTheme(ctx, theme, w, h, scroll, originX, opts) {
  const th = DECO_THEMES[theme]
  if (!th) return
  opts = opts || {}
  const time = opts.time || 0
  const pal  = (typeof qgLight === 'function' && qgLight()) ? DECO_COLS_LIGHT : DECO_COLS
  const s    = scroll * th.par, pad = 260
  if (th.paint) {                       // whole-frame themes
    ctx.save(); ctx.shadowBlur = 0
    th.paint(ctx, w, h, s, time, pal, opts)
    ctx.restore()
    return
  }
  const i0   = Math.floor((s - originX - pad) / th.gap)
  const i1   = Math.ceil((s - originX + w + pad) / th.gap)
  ctx.save()
  ctx.shadowBlur = 0
  for (let i = i0; i <= i1; i++) {
    ctx.save()
    th.draw(ctx, i, originX + i * th.gap - s, h, time, pal, opts)
    ctx.restore()
  }
  ctx.restore()
}

if (typeof window !== 'undefined') {
  window.drawDecoTheme = drawDecoTheme
  window.DECO_THEMES = DECO_THEMES
  window.DECO_COLS = DECO_COLS
  window.DECO_TYPES = DECO_TYPES
  window.drawDeco = drawDeco
  window.makeDeco = makeDeco
  window.decoMotion = decoMotion
  window.DECO_MOTIONS = DECO_MOTIONS
}
