// ═══════════════════════════════════════════════════════
//  DECO — decorative, non-lethal level scenery
//  Shared by Wave Gauntlet (43) and Spider (44), and by the
//  local level editor. Drawn behind the corridor/obstacles so
//  it can never be mistaken for something that kills you.
//
//  One deco item:
//    { t, col, cf, w, hf, c, a, tx, rot }
//      t    shape: rect diamond circle bar tri line text
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
const DECO_TYPES = ['rect', 'diamond', 'circle', 'bar', 'tri', 'line', 'text']

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
  return d
}

if (typeof window !== 'undefined') {
  window.DECO_COLS = DECO_COLS
  window.DECO_TYPES = DECO_TYPES
  window.drawDeco = drawDeco
  window.makeDeco = makeDeco
  window.decoMotion = decoMotion
  window.DECO_MOTIONS = DECO_MOTIONS
}
