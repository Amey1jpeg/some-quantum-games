// ═══════════════════════════════════════════════════════
//  STALL DECORATIONS — the fun bits
//  Injected by qgApplyStall(), so it only ever runs on /stall.
//
//  Bulbs pop and change colour when clicked. Bunting flags can be
//  dragged and swing back on a damped spring, and their neighbours
//  catch a little of the motion so a tug ripples along the string.
//
//  These are decoration, not controls: they stay aria-hidden and out
//  of the tab order, and nothing here changes any game state.
// ═══════════════════════════════════════════════════════

(function () {
  const reduced = typeof matchMedia === 'function' &&
                  matchMedia('(prefers-reduced-motion: reduce)').matches

  // ── LEDs (still called bulbs from the carnival days) ───────────────────────────────────────────
  const BULBS = [
    ['#22d3ee', 'rgba(34,211,238,.8)'],
    ['#ec4899', 'rgba(236,72,153,.8)'],
    ['#3b82f6', 'rgba(59,130,246,.8)'],
    ['#a78bfa', 'rgba(167,139,250,.8)'],
    ['#4ade80', 'rgba(74,222,128,.8)'],
  ]
  document.querySelectorAll('.stall-lights i').forEach((b, i) => {
    b._c = i % BULBS.length
    b.addEventListener('pointerdown', e => {
      e.preventDefault()
      b._c = (b._c + 1) % BULBS.length
      const [col, glow] = BULBS[b._c]
      b.style.background = col
      b.style.boxShadow  = `0 0 10px 2px ${glow}`
      if (reduced) return
      // Pop overrides the twinkle for a moment, then hands it back
      b.style.animation = 'stall-pop .38s ease'
      const done = () => {
        b.style.animation = ''
        b.removeEventListener('animationend', done)
      }
      b.addEventListener('animationend', done)
    })
  })

  // ── Bunting ─────────────────────────────────────────
  const flags = [...document.querySelectorAll('.stall-bunting i')]
  if (!flags.length) return

  // Everything below is in degrees and degrees/second. Mixing degrees with
  // radians here made one frame's step ~160deg, so every flag slammed into
  // the clamp and the ripple came out backwards — the far flags swinging
  // harder than the near ones.
  const MAX   = 62                // degrees a flag will swing to
  const K     = 30                // spring constant: period ~1.15s
  const D     = 2.2               // damping, so it settles instead of ringing
  const VMAX  = 620               // deg/s cap on how hard a flag can be thrown
  const st  = flags.map(() => ({ a: 0, v: 0, held: false }))
  let running = false, last = 0

  function frame(ts) {
    const dt = Math.min((ts - last) / 1000, 0.05)
    last = ts
    let alive = false
    for (let i = 0; i < flags.length; i++) {
      const s = st[i]
      if (s.held) { alive = true; continue }
      // 0.3deg is already invisible; stopping there saves the loop idling
      if (Math.abs(s.a) < 0.3 && Math.abs(s.v) < 0.5) {
        if (s.a !== 0) { s.a = 0; s.v = 0; flags[i].style.transform = ''
                         flags[i].classList.remove('swinging') }
        continue
      }
      // damped spring back to hanging straight down
      s.v += (-K * s.a - D * s.v) * dt
      s.a += s.v * dt
      if (s.a >  MAX) { s.a =  MAX; s.v = -s.v * 0.3 }
      if (s.a < -MAX) { s.a = -MAX; s.v = -s.v * 0.3 }
      flags[i].classList.add('swinging')
      flags[i].style.transform = `rotate(${s.a.toFixed(2)}deg)`
      alive = true
    }
    if (alive) requestAnimationFrame(frame)
    else running = false
  }
  function kick() {
    if (running) return
    running = true; last = performance.now()
    requestAnimationFrame(frame)
  }
  // A tug on one flag travels a little way along the string
  function nudge(i, amount) {
    for (let d = 1; d <= 3; d++) {
      const f = amount * (0.34 / d)
      if (st[i - d]) st[i - d].v += f
      if (st[i + d]) st[i + d].v += f
    }
  }

  // The drag is tracked on the window, not on the flag. A flag's hit area is
  // only about 30px wide, so listening on the element meant the drag died the
  // moment the pointer left the triangle — and setPointerCapture fails
  // silently on some inputs, so it could not be relied on to hold the stream.
  let heldIdx = -1

  // The flag points at your cursor, so whatever part of it you grabbed stays
  // under your finger. Mapping drag distance to an angle instead was both
  // less natural and backwards: a positive CSS rotation swings a hanging
  // element's tip to the LEFT, so dragging right moved the flag left.
  function angleTo(s, px, py) {
    const dx = px - s.pivotX, dy = Math.max(1, py - s.pivotY)
    return Math.atan2(-dx, dy) * 180 / Math.PI
  }
  function onMove(e) {
    if (heldIdx < 0) return
    const s = st[heldIdx], f = flags[heldIdx]
    const prev = s.a, now = performance.now()
    const gap = Math.max(8, now - (s.t || now))   // ms since the last move
    s.a = Math.max(-MAX, Math.min(MAX, angleTo(s, e.clientX, e.clientY)))
    s.moved = true
    // real angular speed, so a flick throws harder than a slow drag
    s.v = Math.max(-VMAX, Math.min(VMAX, (s.a - prev) / (gap / 1000)))
    s.t = now
    f.style.transform = `rotate(${s.a.toFixed(2)}deg)`
  }
  function onUp() {
    if (heldIdx < 0) return
    const i = heldIdx, s = st[i]
    heldIdx = -1
    s.held = false
    flags[i].classList.remove('grabbed')
    // A tap with no drag still gets a flick, and it knows where you tapped:
    // further down the flag is more leverage, and which side you hit sets
    // which way it swings.
    if (!s.moved) {
      // Which side you hit sets the direction, how far down sets the leverage.
      // Kept deliberately gentle: a tap should nudge, not slam into the clamp.
      const lean = s.grabAng || 0
      const pull = Math.min(1.5, 0.5 + s.grabDist / 34)
      s.v = (Math.abs(lean) < 2 ? (lean >= 0 ? 1 : -1) * 55 : lean * 3.2) * pull
      s.v = Math.max(-170, Math.min(170, s.v))
    }
    nudge(i, s.v)
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
    kick()
  }

  // ── Passing-cursor wake ─────────────────────────────
  // Moving the pointer near the bunting stirs it slightly, without clicking.
  // Pivots are cached because measuring 15 elements on every mousemove would
  // force a layout each time; scrolling or resizing invalidates the cache.
  let pivots = null
  function measure() {
    pivots = flags.map(f => {
      const keep = f.style.transform
      f.style.transform = 'none'
      const r = f.getBoundingClientRect()
      f.style.transform = keep
      return { x: r.left + r.width / 2, y: r.top, live: r.width > 0 }
    })
  }
  const drop = () => { pivots = null }
  window.addEventListener('resize', drop)
  window.addEventListener('scroll', drop, { passive: true })

  let lastX = null
  window.addEventListener('pointermove', e => {
    if (heldIdx >= 0) { lastX = e.clientX; return }        // dragging wins
    if (reduced) return
    const vx = lastX === null ? 0 : e.clientX - lastX
    lastX = e.clientX
    if (!vx) return
    if (!pivots) measure()
    const R = 120
    let any = false
    for (let i = 0; i < flags.length; i++) {
      const p = pivots[i]
      if (!p.live) continue
      const d = Math.hypot(e.clientX - p.x, e.clientY - (p.y + 13))
      if (d > R) continue
      // Swing with the direction of travel, strongest right under the cursor.
      // The step is capped so one big jump of the pointer cannot shove a flag,
      // and the result is capped so hovering can only ever stir it gently —
      // without damping a genuine throw that is already in flight.
      const push = Math.max(-22, Math.min(22, vx))
      const before = st[i].v
      const after  = before - push * (1 - d / R) * 0.7
      st[i].v = (Math.abs(after) > 60 && Math.abs(after) > Math.abs(before))
        ? before : after
      any = true
    }
    if (any) kick()
  }, { passive: true })
  window.addEventListener('pointerleave', () => { lastX = null })

  flags.forEach((f, i) => {
    f.addEventListener('pointerdown', e => {
      e.preventDefault()
      onUp()                       // drop any flag still held
      const s = st[i]
      heldIdx = i
      s.held  = true
      s.moved = false
      // Pivot in page coords, read with the rotation removed so it is the
      // real hinge and not the rotated bounding box
      const keep = f.style.transform
      f.style.transform = 'none'
      const r = f.getBoundingClientRect()
      f.style.transform = keep
      s.pivotX = r.left + r.width / 2
      s.pivotY = r.top
      s.grabDist = Math.hypot(e.clientX - s.pivotX, e.clientY - s.pivotY)
      s.grabAng  = angleTo(s, e.clientX, e.clientY)
      s.base  = s.a
      s.t     = performance.now()
      f.classList.add('grabbed', 'swinging')
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
      kick()
    })
  })
})()
