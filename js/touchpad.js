// ═══════════════════════════════════════════════════════
//  TOUCH PAD — on-screen controls for keyboard-only games
//
//  Most games already take taps. The few that only listen for keys
//  get a pad on touch screens: each button sends a real keydown on
//  press and keyup on release, with both `key` and `code` set, so the
//  game's own key handler runs unchanged and no game file needs to
//  know the pad exists.
//
//  Shown only on touch-first devices (no hover, coarse pointer), and
//  only while one of the games below is the active screen.
//
//  To give a game a pad: add an entry to TP_GAMES.
//    clusters: groups laid out left → right along the bottom
//      { dpad: 'arrows' | 'wasd' }                 four-way pad
//      { keys: [[label, code], ...] }              a row of buttons
//        col: true   stack them instead
//        extra: [...] a second, smaller row
//    type: true    a "tap to type" button that opens the phone keyboard
//                  and turns each typed character into a keydown
// ═══════════════════════════════════════════════════════

(function () {
  if (typeof window === 'undefined' || typeof matchMedia !== 'function') return
  const touchFirst = matchMedia('(hover: none) and (pointer: coarse)')

  const TP_GAMES = {
    10: { clusters: [{ dpad: 'arrows' }, { keys: [['☰ Shop', 'Escape']] }] },
    13: { clusters: [{ keys: [['◀', 'ArrowLeft'], ['▶', 'ArrowRight']] },
                     { keys: [['⏸', 'Escape'], ['FIRE', 'Space']] }] },
    14: { clusters: [{ dpad: 'arrows' },
                     { keys: [['X', 'KeyX'], ['H', 'KeyH'], ['M', 'KeyM'], ['↶', 'KeyZ']],
                       extra: [['⏱', 'KeyT'], ['💡', 'KeyI'], ['👁', 'KeyP'], ['⏸', 'Escape']] }] },
    // Entanglement: arrows steer the blue particle on the left, WASD the
    // pink twin on the right, so the pads sit on the same sides
    15: { clusters: [{ dpad: 'arrows' }, { keys: [['BREAK', 'Space'], ['⏸', 'Escape']], col: true }, { dpad: 'wasd' }] },
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

  let pad = null, typeBox = null, current = null

  function btn(label, code, cls) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'tp-btn' + (cls ? ' ' + cls : '')
    b.textContent = label
    let down = false
    const press = e => {
      e.preventDefault()
      if (down) return
      down = true
      b.classList.add('on')
      try { b.setPointerCapture(e.pointerId) } catch {}
      if (navigator.vibrate) try { navigator.vibrate(8) } catch {}
      send('keydown', code)
    }
    const release = e => {
      if (!down) return
      down = false
      b.classList.remove('on')
      send('keyup', code)
    }
    b.addEventListener('pointerdown', press)
    b.addEventListener('pointerup', release)
    b.addEventListener('pointercancel', release)
    b.addEventListener('lostpointercapture', release)
    b.addEventListener('contextmenu', e => e.preventDefault())
    return b
  }

  function dpad(kind) {
    const k = kind === 'wasd'
      ? { up: 'KeyW', left: 'KeyA', down: 'KeyS', right: 'KeyD' }
      : { up: 'ArrowUp', left: 'ArrowLeft', down: 'ArrowDown', right: 'ArrowRight' }
    const g = document.createElement('div')
    g.className = 'tp-dpad' + (kind === 'wasd' ? ' tp-wasd' : '')
    g.append(btn('▲', k.up, 'tp-up'), btn('◀', k.left, 'tp-left'),
             btn('▶', k.right, 'tp-right'), btn('▼', k.down, 'tp-down'))
    return g
  }

  // Phone keyboards do not send usable keydowns to the page unless a text
  // field has focus, and even then Android often reports "Unidentified".
  // So a real input takes the typing, and each character that lands in it
  // is replayed as a keydown and cleared out again.
  function typeButton() {
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
    typeBox = inp
    return wrap
  }

  function build(n) {
    const cfg = TP_GAMES[n]
    const el = document.createElement('div')
    el.id = 'tp-pad'
    if (cfg.type) el.appendChild(typeButton())
    for (const c of cfg.clusters || []) {
      if (c.dpad) { el.appendChild(dpad(c.dpad)); continue }
      const g = document.createElement('div')
      g.className = 'tp-keys'
      const row = document.createElement('div'); row.className = 'tp-row' + (c.col ? ' tp-col' : '')
      for (const [label, code] of c.keys) row.appendChild(btn(label, code, label.length > 2 ? 'tp-wide' : ''))
      g.appendChild(row)
      if (c.extra) {
        const r2 = document.createElement('div'); r2.className = 'tp-row tp-small'
        for (const [label, code] of c.extra) r2.appendChild(btn(label, code))
        g.appendChild(r2)
      }
      el.appendChild(g)
    }
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
    if (pad) { pad.remove(); pad = null; typeBox = null }
    current = want
    document.body.classList.toggle('has-tp', !!want)
    if (!want) return
    pad = build(want)
    document.body.appendChild(pad)
  }

  // The room for the pad has to exist before a game sizes its canvas, or
  // the arena shrinks afterwards and the picture is squashed. So the
  // screens that get a pad are marked up front, and the CSS reserves the
  // space on any touch device the moment one of them becomes active.
  function mark() {
    document.body.classList.toggle('tp-touch', touchFirst.matches)
    for (const n of Object.keys(TP_GAMES)) {
      const s = document.getElementById('game' + n)
      if (s) s.dataset.tp = TP_GAMES[n].type ? 'type' : 'pad'
    }
  }

  function start() {
    mark()
    // Screens switch by toggling .active, so watching that is enough —
    // no hook into showGame/goHome needed
    const mo = new MutationObserver(sync)
    document.querySelectorAll('.screen').forEach(s => mo.observe(s, { attributes: true, attributeFilter: ['class'] }))
    if (touchFirst.addEventListener) touchFirst.addEventListener('change', () => { mark(); sync() })
    sync()
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start)
  else start()
})()
