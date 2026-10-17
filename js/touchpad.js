// ═══════════════════════════════════════════════════════
//  TOUCH CONTROLS — phones and tablets
//
//  Most games already take taps. The few that only listened for keys
//  are played here by touching the game itself, the way a phone app
//  works — no on-screen keyboard or d-pad:
//
//    Gravity Wells       hold to steer the ship toward your finger,
//                        quick tap to shoot where you tapped
//    Particle Collider   touch to aim at your finger, lift to fire
//    Wave Collapse       tap a cell to select it, then tap a gate
//    Entanglement        drag on the left half to steer blue, on the
//                        right half to steer pink (two fingers works),
//                        double-tap to break the entanglement
//
//  Only games where typing IS the game keep a keyboard: Type Racer gets
//  a tap-to-type field that opens the phone keyboard (Quantum Type
//  already has its own field).
//
//  Every action still goes through the game's own key handler: a touch
//  is turned into a real keydown/keyup with `key` and `code` set, so no
//  game file needed to change. Steering holds the arrow keys that point
//  from the piece toward your finger, re-checked every frame as it moves.
//
//  Everything here is touch-first devices only (no hover, coarse
//  pointer); with a mouse and keyboard nothing changes.
// ═══════════════════════════════════════════════════════

(function () {
  if (typeof window === 'undefined' || typeof matchMedia !== 'function') return
  const touchFirst = matchMedia('(hover: none) and (pointer: coarse)')

  // What appears in the slim bar under each game. `hint` says how to play;
  // `keys` are game actions as labelled buttons (never a keyboard).
  const TP_GAMES = {
    10: { hint: 'Hold to steer · tap to shoot', keys: [['☰ Shop', 'Escape']] },
    13: { hint: 'Touch to aim · lift to fire',  keys: [['⏸', 'Escape']] },
    14: { hint: 'Tap a cell, then a gate',
          keys: [['X', 'KeyX'], ['H', 'KeyH'], ['M', 'KeyM'], ['↶', 'KeyZ']],
          extra: [['⏱', 'KeyT'], ['💡', 'KeyI'], ['👁', 'KeyP'], ['⏸', 'Escape']] },
    15: { hint: 'Left half steers blue · right half pink · double-tap to break',
          keys: [['⏸', 'Escape']] },
    42: { type: true },
  }

  const CODE_KEY = {
    ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight',
    Space: ' ', Escape: 'Escape', Enter: 'Enter',
  }
  const keyFor = code => CODE_KEY[code] || (code.startsWith('Key') ? code.slice(3).toLowerCase() : code)

  // Sent to the document so listeners on document and on window both hear it
  function send(type, code, key) {
    document.dispatchEvent(new KeyboardEvent(type, {
      key: key ?? keyFor(code), code, bubbles: true, cancelable: true,
    }))
  }
  const tap = code => { send('keydown', code); send('keyup', code) }

  // ── Held keys for steering ─────────────────────────
  // Which keys are down, per steering group, so only changes are sent
  const held = {}
  function hold(group, codes) {
    const was = held[group] || new Set()
    for (const c of was)   if (!codes.has(c)) send('keyup', c)
    for (const c of codes) if (!was.has(c))   send('keydown', c)
    held[group] = codes
  }
  const ARROWS = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }
  const WASD   = { up: 'KeyW',    down: 'KeyS',      left: 'KeyA',      right: 'KeyD' }
  // The keys that push a piece at (fx, fy) toward (tx, ty). A dead zone
  // stops it jittering once it is under your finger.
  function toward(fx, fy, tx, ty, k, dead = 14) {
    const s = new Set(), dx = tx - fx, dy = ty - fy
    if (dx < -dead) s.add(k.left);  else if (dx > dead) s.add(k.right)
    if (dy < -dead) s.add(k.up);    else if (dy > dead) s.add(k.down)
    return s
  }

  // Touch position in the canvas's own pixels
  function local(t, canvas) {
    const r = canvas.getBoundingClientRect()
    return {
      x: (t.clientX - r.left) * (canvas.width  / (r.width  || 1)),
      y: (t.clientY - r.top)  * (canvas.height / (r.height || 1)),
    }
  }

  // Runs `step` every frame while any finger is down on a game
  let raf = null
  function loop(step) {
    if (raf) cancelAnimationFrame(raf)
    const go = () => { if (step() !== false) raf = requestAnimationFrame(go); else raf = null }
    raf = requestAnimationFrame(go)
  }
  function stopLoop() { if (raf) cancelAnimationFrame(raf); raf = null }

  // ── Per-game gestures ──────────────────────────────
  const GESTURES = {
    // Gravity Wells: steer toward the finger while it is down; a short tap
    // shoots at the spot tapped
    10() {
      const arena = document.getElementById('g10-arena')
      if (!arena) return
      let finger = null, start = 0, sx = 0, sy = 0
      const live = () => typeof G10 !== 'undefined' && G10.active && !G10.paused
      arena.addEventListener('touchstart', e => {
        if (!live() || e.target.closest('button')) return
        e.preventDefault()
        const t = e.changedTouches[0], p = local(t, G10.canvas)
        finger = { id: t.identifier, ...p }; start = performance.now(); sx = p.x; sy = p.y
        G10.mouseX = p.x; G10.mouseY = p.y          // aim follows the finger too
        loop(() => {
          if (!finger || !live()) { hold('g10', new Set()); return false }
          hold('g10', toward(G10.playerX, G10.playerY, finger.x, finger.y, ARROWS, 18))
        })
      }, { passive: false })
      arena.addEventListener('touchmove', e => {
        if (!finger) return
        e.preventDefault()
        for (const t of e.changedTouches) if (t.identifier === finger.id) {
          const p = local(t, G10.canvas)
          finger.x = p.x; finger.y = p.y; G10.mouseX = p.x; G10.mouseY = p.y
        }
      }, { passive: false })
      const end = e => {
        if (!finger) return
        for (const t of e.changedTouches) if (t.identifier === finger.id) {
          const quick = performance.now() - start < 250 && Math.hypot(finger.x - sx, finger.y - sy) < 20
          const at = Math.atan2(finger.y - G10.playerY, finger.x - G10.playerX)
          finger = null
          hold('g10', new Set()); stopLoop()
          // Passing the angle makes the shot go where you tapped, whatever
          // aim mode is picked in the shop's settings
          if (quick && live() && typeof g10Shoot === 'function') g10Shoot(at)
        }
      }
      arena.addEventListener('touchend', end)
      arena.addEventListener('touchcancel', end)
    },

    // Particle Collider: the aim line follows your finger round the ring;
    // lifting it fires
    13() {
      const arena = document.getElementById('g13-arena')
      if (!arena) return
      const live = () => typeof G13 !== 'undefined' && G13.active && !G13.paused
      let down = false
      const aim = t => {
        const c = document.getElementById('g13-canvas')
        const p = local(t, c)
        G13.angle = Math.atan2(p.y - c.height / 2, p.x - c.width / 2)
      }
      arena.addEventListener('touchstart', e => {
        if (!live() || e.target.closest('button')) return
        e.preventDefault(); down = true; aim(e.changedTouches[0])
      }, { passive: false })
      arena.addEventListener('touchmove', e => {
        if (!down) return
        e.preventDefault(); aim(e.changedTouches[0])
      }, { passive: false })
      const end = () => {
        if (!down) return
        down = false
        if (live()) tap('Space')
      }
      arena.addEventListener('touchend', end)
      arena.addEventListener('touchcancel', () => { down = false })
    },

    // Wave Collapse: tap a cell to move the cursor there. The grid is
    // rebuilt on every render, so the listener sits on its container.
    14() {
      const grid = document.getElementById('g14-grid')
      if (!grid) return
      grid.addEventListener('click', e => {
        const cell = e.target.closest('.g14-cell')
        if (!cell || typeof G14 === 'undefined' || G14.paused) return
        const i = [...grid.children].indexOf(cell)
        if (i < 0) return
        G14.cx = i % G14_COLS
        G14.cy = Math.floor(i / G14_COLS)
        if (typeof g14Render === 'function') g14Render()
      })
    },

    // Entanglement: each half of the arena belongs to one particle. A
    // finger on the left steers blue (the arrow keys), on the right pink
    // (WASD), so two thumbs can fly both at once. Double-tap breaks.
    15() {
      const arena = document.getElementById('g15-arena')
      if (!arena) return
      const live = () => typeof G15 !== 'undefined' && G15.active && !G15.paused
      const fingers = new Map()          // id -> { x, y, side, t0, x0, y0 }
      let lastTap = 0
      const canvas = () => document.getElementById('g15-canvas')
      const step = () => {
        if (!fingers.size || !live()) { hold('g15b', new Set()); hold('g15p', new Set()); return false }
        let blue = null, pink = null
        for (const f of fingers.values()) { if (f.side === 'b') blue = f; else pink = f }
        hold('g15b', blue ? toward(G15.px, G15.py, blue.x, blue.y, ARROWS) : new Set())
        hold('g15p', pink ? toward(G15.tx, G15.ty, pink.x, pink.y, WASD)   : new Set())
      }
      arena.addEventListener('touchstart', e => {
        if (!live() || e.target.closest('button')) return
        e.preventDefault()
        const c = canvas()
        for (const t of e.changedTouches) {
          const p = local(t, c)
          fingers.set(t.identifier, { ...p, side: p.x < c.width / 2 ? 'b' : 'p',
                                      t0: performance.now(), x0: p.x, y0: p.y })
        }
        loop(step)
      }, { passive: false })
      arena.addEventListener('touchmove', e => {
        if (!fingers.size) return
        e.preventDefault()
        const c = canvas()
        for (const t of e.changedTouches) {
          const f = fingers.get(t.identifier)
          if (f) Object.assign(f, local(t, c))
        }
      }, { passive: false })
      const end = e => {
        for (const t of e.changedTouches) {
          const f = fingers.get(t.identifier)
          if (!f) continue
          fingers.delete(t.identifier)
          const quick = performance.now() - f.t0 < 220 && Math.hypot(f.x - f.x0, f.y - f.y0) < 20
          if (quick && e.type === 'touchend') {
            const now = performance.now()
            if (now - lastTap < 320) { lastTap = 0; if (live()) tap('Space') }
            else lastTap = now
          }
        }
        if (!fingers.size) { hold('g15b', new Set()); hold('g15p', new Set()); stopLoop() }
      }
      arena.addEventListener('touchend', end)
      arena.addEventListener('touchcancel', end)
    },
  }

  // ── The slim bar under a game ──────────────────────
  let bar = null, current = null

  function btn(label, code, cls) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'tp-btn' + (cls ? ' ' + cls : '')
    b.textContent = label
    b.addEventListener('pointerdown', e => {
      e.preventDefault()
      b.classList.add('on')
      if (navigator.vibrate) try { navigator.vibrate(8) } catch {}
      tap(code)
    })
    const off = () => b.classList.remove('on')
    b.addEventListener('pointerup', off)
    b.addEventListener('pointercancel', off)
    b.addEventListener('pointerleave', off)
    b.addEventListener('contextmenu', e => e.preventDefault())
    return b
  }

  // Phone keyboards do not send usable keydowns to the page unless a text
  // field has focus, and even then Android often reports "Unidentified".
  // So a real input takes the typing, and each character that lands in it
  // is replayed as a keydown and cleared out again.
  function typeField() {
    const wrap = document.createElement('div')
    wrap.className = 'tp-type'
    const inp = document.createElement('input')
    inp.className = 'tp-type-input'
    inp.setAttribute('autocapitalize', 'off')
    inp.setAttribute('autocomplete', 'off')
    inp.setAttribute('autocorrect', 'off')
    inp.setAttribute('spellcheck', 'false')
    inp.setAttribute('aria-label', 'Type here')
    inp.placeholder = '⌨ Tap here to type'
    // iOS does send real keydowns from a focused field. Stop them here, or
    // every letter would reach the game twice: once from the key, once
    // from the replay below (which goes to the document, not this input).
    inp.addEventListener('keydown', e => e.stopPropagation())
    inp.addEventListener('input', () => {
      const v = inp.value
      inp.value = ''
      for (const ch of v) send('keydown', ch === ' ' ? 'Space' : 'Key' + ch.toUpperCase(), ch)
    })
    wrap.appendChild(inp)
    return wrap
  }

  function build(n) {
    const cfg = TP_GAMES[n]
    const el = document.createElement('div')
    el.id = 'tp-pad'
    if (cfg.type) { el.appendChild(typeField()); return el }
    if (cfg.hint) {
      const h = document.createElement('span')
      h.className = 'tp-hint'
      h.textContent = cfg.hint
      el.appendChild(h)
    }
    const g = document.createElement('div')
    g.className = 'tp-keys'
    const row = document.createElement('div'); row.className = 'tp-row'
    for (const [label, code] of cfg.keys || []) row.appendChild(btn(label, code, label.length > 2 ? 'tp-wide' : ''))
    g.appendChild(row)
    if (cfg.extra) {
      const r2 = document.createElement('div'); r2.className = 'tp-row tp-small'
      for (const [label, code] of cfg.extra) r2.appendChild(btn(label, code))
      g.appendChild(r2)
    }
    el.appendChild(g)
    return el
  }

  function activeGame() {
    const s = document.querySelector('.screen.game-screen.active, .screen.active[id^="game"]')
    const m = s && s.id.match(/^game(\d+)$/)
    return m ? +m[1] : null
  }

  function sync() {
    const n = touchFirst.matches ? activeGame() : null
    const want = n && TP_GAMES[n] ? n : null
    if (want === current) return
    if (bar) { bar.remove(); bar = null }
    // Leaving a game mid-steer must not leave a key stuck down
    for (const g of Object.keys(held)) hold(g, new Set())
    stopLoop()
    current = want
    document.body.classList.toggle('has-tp', !!want)
    if (!want) return
    bar = build(want)
    document.body.appendChild(bar)
  }

  // The room for the bar has to exist before a game sizes its canvas, or
  // the arena shrinks afterwards and the picture is squashed. So the
  // screens that get one are marked up front, and the CSS reserves the
  // space on any touch device the moment one of them becomes active.
  function mark() {
    document.body.classList.toggle('tp-touch', touchFirst.matches)
    for (const n of Object.keys(TP_GAMES)) {
      const s = document.getElementById('game' + n)
      if (s) s.dataset.tp = TP_GAMES[n].type ? 'type' : 'bar'
    }
  }

  let wired = false
  function wire() {
    if (wired || !touchFirst.matches) return
    wired = true
    for (const f of Object.values(GESTURES)) f()
  }

  function start() {
    mark()
    wire()
    // Screens switch by toggling .active, so watching that is enough —
    // no hook into showGame/goHome needed
    const mo = new MutationObserver(sync)
    document.querySelectorAll('.screen').forEach(s => mo.observe(s, { attributes: true, attributeFilter: ['class'] }))
    if (touchFirst.addEventListener) touchFirst.addEventListener('change', () => { mark(); wire(); sync() })
    sync()
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
  else start()
})()
