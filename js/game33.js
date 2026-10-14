// ═══════════════════════════════════════════════════════
//  GAME 33 — MEMORY SEQUENCE
//  Watch the quantum-chosen sequence of colours light up.
//  Repeat it back. Each round adds one step. How far?
// ═══════════════════════════════════════════════════════
const G33_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308']
const G33_DIM    = ['#450a0a', '#0c1a3a', '#052e16', '#422006']
// Unlit pads need to stay quiet against the page, so light mode uses pale tints
const G33_DIM_LT = ['#fecaca', '#bfdbfe', '#bbf7d0', '#fef08a']

const G33 = {
  active: false,
  sequence: [],
  input: [],
  showing: false,
  round: 0,
}
window._g33Score = 0

function stopGame33() {
  G33.active = false
  G33.showing = false
}
window.stopGame33 = stopGame33

function initGame33() {
  stopGame33()
  G33.sequence = []; G33.input = []; G33.round = 0
  document.getElementById('g33-over').classList.remove('show')
  document.getElementById('g33-overlay').style.display = 'flex'
  document.getElementById('g33-round-info').textContent = ''
  document.getElementById('g33-msg').textContent = ''
  g33DimAll()
}

function g33DimAll() {
  for (let i = 0; i < 4; i++) {
    const b = document.getElementById(`g33-btn-${i}`)
    const lt = typeof qgLight === 'function' && qgLight()
    if (b) b.style.background = (lt ? G33_DIM_LT : G33_DIM)[i]
  }
}

function g33Light(i) {
  const b = document.getElementById(`g33-btn-${i}`)
  if (b) b.style.background = G33_COLORS[i]
}

function g33Wait(ms) { return new Promise(r => setTimeout(r, ms)) }

window.startMemSeq = function() {
  SFX.resume(); SFX.click()
  document.getElementById('g33-overlay').style.display = 'none'
  G33.active = true
  G33.sequence = []; G33.input = []; G33.round = 0
  g33DimAll()
  g33NextRound()
}

async function g33NextRound() {
  if (!G33.active) return
  G33.round++
  G33.input = []
  G33.sequence.push(qRandInt(4))
  G33.showing = true
  g33SetDisabled(true)
  document.getElementById('g33-round-info').textContent = `Round ${G33.round} — ${G33.sequence.length} step${G33.sequence.length > 1 ? 's' : ''}`
  document.getElementById('g33-msg').textContent = 'Watch carefully…'
  g33DimAll()

  await g33Wait(700)
  const showTime = Math.max(200, 550 - G33.round * 12)
  for (let i = 0; i < G33.sequence.length; i++) {
    if (!G33.active) return
    g33Light(G33.sequence[i])
    SFX.tick()
    await g33Wait(showTime)
    g33DimAll()
    await g33Wait(160)
  }

  if (!G33.active) return
  G33.showing = false
  g33SetDisabled(false)
  document.getElementById('g33-msg').textContent = 'Your turn!'
}

function g33SetDisabled(v) {
  for (let i = 0; i < 4; i++) {
    const b = document.getElementById(`g33-btn-${i}`)
    if (b) b.disabled = v
  }
}

window.g33Press = function(i) {
  if (!G33.active || G33.showing) return
  SFX.tick()
  g33Light(i)
  setTimeout(() => { if (G33.active) g33DimAll() }, 180)

  G33.input.push(i)
  const pos = G33.input.length - 1

  if (G33.input[pos] !== G33.sequence[pos]) {
    SFX.error()
    document.getElementById('g33-msg').textContent = '✗ Wrong!'
    g33SetDisabled(true)
    setTimeout(() => { if (G33.active) endGame33() }, 700)
    return
  }

  if (G33.input.length === G33.sequence.length) {
    SFX.coin()
    document.getElementById('g33-msg').textContent = '✓ Perfect!'
    g33SetDisabled(true)
    setTimeout(() => { if (G33.active) g33NextRound() }, 700)
  }
}

function endGame33() {
  SFX.win()
  stopGame33()
  const score = G33.round - 1
  window._g33Score = score
  document.getElementById('g33-final-score').textContent = `${score} round${score !== 1 ? 's' : ''}`
  document.getElementById('g33-final-seq').textContent = `Reached sequence length ${G33.sequence.length}`
  renderMedalDisplay('g33-medal-display', 'memseq', score)
  document.getElementById('g33-over').classList.add('show')
}
