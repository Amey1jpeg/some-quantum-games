// ═══════════════════════════════════════════════════════
//  GAME 24 — PULSE
//  Rings expand from the centre. Click/tap exactly when
//  the ring overlaps the target circle. BPM increases over time.
// ═══════════════════════════════════════════════════════

const G24_TARGET_R  = 130
const G24_TOLERANCE = 22

let G24 = {}
let g24Canvas, g24Ctx, g24Raf

// ─── audio ──────────────────────────────────────────────
let g24Ac = null          // AudioContext
let g24AudioNext = 0      // next scheduled beat time (ac.currentTime)
let g24BeatNum   = 0      // beat counter (used for pattern)
let g24AudioTick = null   // setInterval handle
let g24MasterGain = null

function g24AudioInit() {
  if (g24Ac) return
  g24Ac = new (window.AudioContext || window.webkitAudioContext)()
  g24MasterGain = g24Ac.createGain()
  g24MasterGain.gain.value = 0.7
  g24MasterGain.connect(g24Ac.destination)
}

function g24AudioStart() {
  g24AudioInit()
  if (g24Ac.state === 'suspended') g24Ac.resume()
  g24AudioNext = g24Ac.currentTime + 0.08
  g24BeatNum = 0
  if (g24AudioTick) clearInterval(g24AudioTick)
  g24AudioTick = setInterval(g24AudioSchedule, 25)
}

function g24AudioStop() {
  if (g24AudioTick) { clearInterval(g24AudioTick); g24AudioTick = null }
}

// synthesized drums & bass
function g24Kick(when, vol=0.9) {
  const osc = g24Ac.createOscillator(), env = g24Ac.createGain()
  osc.connect(env); env.connect(g24MasterGain)
  osc.frequency.setValueAtTime(160, when)
  osc.frequency.exponentialRampToValueAtTime(38, when + 0.18)
  env.gain.setValueAtTime(vol, when)
  env.gain.exponentialRampToValueAtTime(0.001, when + 0.28)
  osc.start(when); osc.stop(when + 0.32)
}

function g24Snare(when) {
  // short noise burst
  const frames = Math.ceil(g24Ac.sampleRate * 0.12)
  const buf = g24Ac.createBuffer(1, frames, g24Ac.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < frames; i++) d[i] = Math.random() * 2 - 1
  const src = g24Ac.createBufferSource()
  src.buffer = buf
  const hp = g24Ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800
  const env = g24Ac.createGain()
  src.connect(hp); hp.connect(env); env.connect(g24MasterGain)
  env.gain.setValueAtTime(0.45, when)
  env.gain.exponentialRampToValueAtTime(0.001, when + 0.12)
  src.start(when); src.stop(when + 0.15)
}

function g24Hihat(when, vol=0.22) {
  const frames = Math.ceil(g24Ac.sampleRate * 0.04)
  const buf = g24Ac.createBuffer(1, frames, g24Ac.sampleRate)
  const d = buf.getChannelData(0)
  for (let i = 0; i < frames; i++) d[i] = Math.random() * 2 - 1
  const src = g24Ac.createBufferSource()
  src.buffer = buf
  const hp = g24Ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 9000
  const env = g24Ac.createGain()
  src.connect(hp); hp.connect(env); env.connect(g24MasterGain)
  env.gain.setValueAtTime(vol, when)
  env.gain.exponentialRampToValueAtTime(0.001, when + 0.04)
  src.start(when); src.stop(when + 0.06)
}

function g24Bass(when, freq) {
  const osc = g24Ac.createOscillator(), env = g24Ac.createGain()
  const lp = g24Ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400
  osc.type = 'sawtooth'
  osc.frequency.value = freq
  osc.connect(lp); lp.connect(env); env.connect(g24MasterGain)
  env.gain.setValueAtTime(0.35, when)
  env.gain.exponentialRampToValueAtTime(0.001, when + 0.18)
  osc.start(when); osc.stop(when + 0.22)
}

// A minor pentatonic bass line (cycles every 8 beats)
const G24_BASS = [55, 65.4, 82.4, 73.4, 55, 55, 65.4, 82.4]

function g24AudioSchedule() {
  if (!g24Ac || !G24.active) return
  const spb = 60 / G24.bpm   // seconds per beat
  const ahead = 0.12

  while (g24AudioNext < g24Ac.currentTime + ahead) {
    const t  = g24AudioNext
    const bn = g24BeatNum % 4

    if (bn === 0) { g24Kick(t, 0.9);  g24Bass(t, G24_BASS[g24BeatNum % 8]) }
    if (bn === 2) { g24Kick(t, 0.65); g24Bass(t, G24_BASS[g24BeatNum % 8]) }
    if (bn === 1 || bn === 3) g24Snare(t)
    g24Hihat(t)
    // 8th-note hi-hat between beats
    g24Hihat(t + spb * 0.5, 0.12)

    g24AudioNext += spb
    g24BeatNum++
  }
}

window.initGame24 = function() {
  g24Canvas = document.getElementById('g24-canvas')
  g24Ctx    = g24Canvas.getContext('2d')
  const hit = e => { e.preventDefault(); g24Hit() }
  g24Canvas.onmousedown  = hit
  g24Canvas.ontouchstart = hit
  g24Reset()
}

function g24Reset() {
  if (g24Raf) { cancelAnimationFrame(g24Raf); g24Raf = null }
  g24AudioStop()
  G24 = {
    active:true, score:0, frameCount:0,
    combo:0, lives:5, bpm:58,
    rings:[], nextBeat:70,
    msgs:[], particles:[],
    screenShake:0, beatFlash:0,
  }
  document.getElementById('g24-over').classList.remove('show')
  g24AudioStart()
  g24Loop()
}

const g24BeatFrames = () => Math.floor(3600 / G24.bpm)

function g24Hit() {
  if (!G24.active) return
  if (g24Ac && g24Ac.state === 'suspended') g24Ac.resume()
  SFX.resume()
  const W=g24Canvas.width||500, H=g24Canvas.height||500
  const cx=W/2, cy=H/2

  let best=null, bestD=Infinity
  for (const r of G24.rings) {
    const d=Math.abs(r.r - G24_TARGET_R)
    if (d<bestD) { bestD=d; best=r }
  }
  if (!best || bestD > G24_TOLERANCE * 2.2) { g24Miss(); return }

  best.hit = true
  G24.combo++
  const mult = Math.min(G24.combo, 6)

  if (bestD < G24_TOLERANCE * 0.38) {
    const pts = 100 * mult
    G24.score += pts
    G24.screenShake = 9; G24.beatFlash = 10
    G24.msgs.push({ text:`✨ PERFECT! +${pts}`, color:'#fbbf24', frames:55, big:true })
    g24Sparks(cx, cy, '#fbbf24', 20)
    SFX.perfect()
  } else {
    const pts = 50 * mult
    G24.score += pts
    G24.msgs.push({ text:`GOOD +${pts}`, color:'#4ade80', frames:45 })
    g24Sparks(cx, cy, '#4ade80', 10)
    SFX.hit()
  }
}

function g24Miss() {
  G24.combo = 0; G24.lives--
  G24.screenShake = 14
  G24.msgs.push({ text: G24.lives>0?'MISS ✕':'OUT!', color:'#ef4444', frames:55, big:true })
  SFX.miss()
  if (G24.lives <= 0) { G24.active=false; setTimeout(g24Over, 500) }
}

function g24Sparks(x,y,color,n=12){for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,s=2+Math.random()*5;G24.particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,color,life:28+Math.floor(Math.random()*18),r:2+Math.random()*2.5})}}

function g24Update() {
  G24.frameCount++
  if (G24.screenShake>0) G24.screenShake--
  if (G24.beatFlash>0)   G24.beatFlash--

  // ramp BPM every 10s
  G24.bpm = Math.min(170, 58 + Math.floor(G24.frameCount / 600) * 6)

  // spawn ring on beat
  if (G24.frameCount >= G24.nextBeat) {
    const bf = g24BeatFrames()
    // ring must reach G24_TARGET_R exactly at beat time
    const travelFrames = bf * 0.82
    G24.rings.push({ r:0, speed: G24_TARGET_R / travelFrames, hit:false, missed:false })
    G24.nextBeat = G24.frameCount + bf
    // at high BPM spawn a second ring slightly offset
    if (G24.bpm >= 110) {
      G24.rings.push({ r:0, speed:(G24_TARGET_R*1.55)/travelFrames, hit:false, missed:false })
    }
  }

  const W=g24Canvas.width||500
  G24.rings = G24.rings.filter(ring => {
    ring.r += ring.speed
    if (!ring.hit && !ring.missed && ring.r > G24_TARGET_R + G24_TOLERANCE + 14) {
      ring.missed = true; g24Miss()
    }
    return !ring.hit && ring.r < W * 0.75
  })

  G24.particles = G24.particles.filter(p=>{p.x+=p.vx;p.y+=p.vy;p.vx*=0.88;p.vy*=0.88;p.life--;return p.life>0})
  G24.msgs      = G24.msgs.filter(m=>{m.frames--;return m.frames>0})
}

function g24Draw() {
  const cv=g24Canvas, c=g24Ctx
  const arena=document.getElementById('g24-arena')
  if (cv.width!==arena.clientWidth||cv.height!==arena.clientHeight){cv.width=arena.clientWidth;cv.height=arena.clientHeight}
  const W=cv.width, H=cv.height, cx=W/2, cy=H/2

  c.clearRect(0,0,W,H)
  // Canvases get no CSS variables, so read the theme directly
  const _lt = typeof qgLight === 'function' && qgLight()
  c.fillStyle=_lt?'#eef1f8':'#050810'; c.fillRect(0,0,W,H)

  // beat flash
  if (G24.beatFlash>0) { c.fillStyle=`rgba(251,191,36,${G24.beatFlash/10*.12})`; c.fillRect(0,0,W,H) }

  c.save()
  if (G24.screenShake>0){const s=G24.screenShake*.5;c.translate((Math.random()-.5)*s,(Math.random()-.5)*s)}

  // tolerance zone (faint)
  c.beginPath(); c.arc(cx,cy,G24_TARGET_R-G24_TOLERANCE,0,Math.PI*2)
  c.strokeStyle=_lt?'rgba(99,102,241,.25)':'rgba(99,102,241,.12)'; c.lineWidth=1; c.stroke()
  c.beginPath(); c.arc(cx,cy,G24_TARGET_R+G24_TOLERANCE,0,Math.PI*2)
  c.strokeStyle=_lt?'rgba(99,102,241,.25)':'rgba(99,102,241,.12)'; c.lineWidth=1; c.stroke()

  // perfect zone fill (very faint)
  c.beginPath(); c.arc(cx,cy,G24_TARGET_R+G24_TOLERANCE*0.38,0,Math.PI*2)
  c.strokeStyle=_lt?'rgba(217,119,6,.3)':'rgba(251,191,36,.18)'; c.lineWidth=1; c.stroke()
  c.beginPath(); c.arc(cx,cy,G24_TARGET_R-G24_TOLERANCE*0.38,0,Math.PI*2)
  c.strokeStyle=_lt?'rgba(217,119,6,.3)':'rgba(251,191,36,.18)'; c.lineWidth=1; c.stroke()

  // target ring
  c.beginPath(); c.arc(cx,cy,G24_TARGET_R,0,Math.PI*2)
  c.strokeStyle='#6366f1'; c.lineWidth=4
  c.shadowColor='#6366f1'; c.shadowBlur=16; c.stroke(); c.shadowBlur=0

  // centre pulse
  const cp = 1+Math.sin(G24.frameCount*0.12)*0.2
  c.beginPath(); c.arc(cx,cy,9*cp,0,Math.PI*2)
  c.fillStyle='#6366f1'; c.shadowColor='#6366f1'; c.shadowBlur=24; c.fill(); c.shadowBlur=0

  // expanding rings
  for (const ring of G24.rings) {
    const dist=Math.abs(ring.r-G24_TARGET_R)
    const inZone=dist<G24_TOLERANCE
    const perfect=dist<G24_TOLERANCE*0.38
    const col=perfect?'#fbbf24':inZone?'#4ade80':'#22d3ee'
    c.beginPath(); c.arc(cx,cy,ring.r,0,Math.PI*2)
    c.strokeStyle=col; c.lineWidth=perfect?5:inZone?3.5:2.5
    c.shadowColor=col; c.shadowBlur=inZone?22:8
    c.globalAlpha=inZone?1:0.65
    c.stroke(); c.shadowBlur=0; c.globalAlpha=1
  }

  // particles
  for (const p of G24.particles){c.globalAlpha=p.life/46;c.beginPath();c.arc(p.x,p.y,p.r,0,Math.PI*2);c.fillStyle=p.color;c.fill()}
  c.globalAlpha=1
  c.restore()

  // HUD
  c.font='bold 22px monospace';c.textAlign='left';c.fillStyle=_lt?'#14152b':'#f1f5f9'
  c.shadowColor=_lt?'rgba(255,255,255,.8)':'#000';c.shadowBlur=4;c.fillText(G24.score.toLocaleString(),12,40);c.shadowBlur=0
  c.font='13px sans-serif';c.fillStyle=_lt?'#475569':'#94a3b8'
  c.fillText('❤️'.repeat(G24.lives)+'  BPM '+Math.floor(G24.bpm),12,58)

  if (G24.combo>1){
    c.font=`bold ${14+G24.combo*1.5}px sans-serif`;c.textAlign='right';c.fillStyle='#fbbf24'
    c.shadowColor='#fbbf24';c.shadowBlur=8;c.fillText('×'+G24.combo,W-12,40);c.shadowBlur=0
  }

  let my=H/2-50
  for (const m of G24.msgs){
    c.globalAlpha=Math.min(1,m.frames/20)
    c.font=`bold ${m.big?22:15}px sans-serif`;c.textAlign='center'
    c.fillStyle=m.color;c.shadowColor=m.color;c.shadowBlur=8
    c.fillText(m.text,W/2,my);c.shadowBlur=0;my+=m.big?30:22
  }
  c.globalAlpha=1

  if (G24.frameCount<200){
    c.globalAlpha=Math.min(1,(200-G24.frameCount)/60)*.7
    c.font='13px sans-serif';c.textAlign='center';c.fillStyle=_lt?'#4f46e5':'#a5b4fc'
    c.fillText('Click/tap when the ring lines up with the purple circle!',W/2,H-16)
    c.globalAlpha=1
  }
}

function g24Loop(){
  g24Raf=requestAnimationFrame(g24Loop)
  if(!G24.active||!document.getElementById('game24').classList.contains('active')){
    cancelAnimationFrame(g24Raf);g24Raf=null;g24AudioStop();return
  }
  g24Update();g24Draw()
}

function g24Over(){
  G24.active=false;g24AudioStop();window._g24Score=G24.score
  document.getElementById('g24-final-score').textContent=G24.score.toLocaleString()
  const m=G24.score>=5000?'🥇 Gold':G24.score>=2000?'🥈 Silver':G24.score>=500?'🥉 Bronze':''
  document.getElementById('g24-medal').textContent=m
  document.getElementById('g24-over').classList.add('show')
}
