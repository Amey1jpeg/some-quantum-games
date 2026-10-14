// ═══════════════════════════════════════════════════════
//  GAME 23 — CHARGE RUSH
//  A pulse races along the circuit toward you.
//  Click nodes to conduct them BEFORE the charge arrives!
//  Wrong node or too slow = zap!
// ═══════════════════════════════════════════════════════

let G23 = {}
let g23Canvas, g23Ctx, g23Raf

window.initGame23 = function() {
  g23Canvas = document.getElementById('g23-canvas')
  g23Ctx    = g23Canvas.getContext('2d')

  g23Canvas.onclick = e => {
    const r = g23Canvas.getBoundingClientRect()
    g23Click(
      (e.clientX-r.left)*(g23Canvas.width/r.width),
      (e.clientY-r.top)*(g23Canvas.height/r.height)
    )
  }
  g23Canvas.ontouchstart = e => {
    e.preventDefault()
    const r=g23Canvas.getBoundingClientRect()
    g23Click((e.touches[0].clientX-r.left)*(g23Canvas.width/r.width),(e.touches[0].clientY-r.top)*(g23Canvas.height/r.height))
  }

  g23Reset()
}

function g23Reset() {
  if (g23Raf) { cancelAnimationFrame(g23Raf); g23Raf = null }

  G23 = {
    active: true, score: 0, frameCount: 0,
    lives: 3, wave: 1,
    nodes: [], edges: [],
    pulsePos: 0,     // 0–1 along path
    pulseSpeed: 0.004,
    path: [],        // ordered list of node indices for current sequence
    pathIdx: 0,      // how far player has progressed
    particles: [], msgs: [], zapFlash: 0,
    screenShake: 0,
    sequenceDone: false,
    buildTimer: 0,   // countdown before next sequence
  }

  g23BuildCircuit()
  document.getElementById('g23-over').classList.remove('show')
  g23Loop()
}

// ─── circuit generation ────────────────────────────────
function g23BuildCircuit() {
  const W = g23Canvas.width  || 600
  const H = g23Canvas.height || 400

  G23.nodes = []; G23.edges = []; G23.path = []

  const nNodes = 6 + G23.wave * 2
  const placed  = []

  // place nodes in a grid-ish pattern
  for (let i=0; i<nNodes; i++) {
    for (let t=0;t<60;t++) {
      const x = 80 + Math.random()*(W-160)
      const y = 60 + Math.random()*(H-120)
      let ok=true
      for(const p of placed){if(Math.hypot(x-p.x,y-p.y)<75){ok=false;break}}
      if(ok){placed.push({x,y,r:18,state:'idle',hue:200+Math.floor(Math.random()*60)});break}
    }
  }
  G23.nodes = placed

  // connect nearest neighbours (spanning tree + extra edges)
  const connected = [0]
  const unconnected = placed.map((_,i)=>i).slice(1)
  while(unconnected.length>0){
    let bestI=-1,bestJ=-1,bestD=Infinity
    for(const i of connected){
      for(const j of unconnected){
        const d=Math.hypot(placed[i].x-placed[j].x,placed[i].y-placed[j].y)
        if(d<bestD){bestD=d;bestI=i;bestJ=j}
      }
    }
    if(bestI>=0){G23.edges.push({a:bestI,b:bestJ});connected.push(bestJ);unconnected.splice(unconnected.indexOf(bestJ),1)}
  }
  // add a few extra edges
  for(let k=0;k<Math.min(3,Math.floor(nNodes/3));k++){
    const a=Math.floor(Math.random()*nNodes)
    const b=Math.floor(Math.random()*nNodes)
    if(a!==b&&!G23.edges.find(e=>(e.a===a&&e.b===b)||(e.a===b&&e.b===a)))
      G23.edges.push({a,b})
  }

  // build random Hamiltonian-ish path through a subset of nodes
  g23BuildPath()
}

function g23BuildPath() {
  const nNodes = G23.nodes.length
  const pathLen = Math.min(4 + G23.wave, nNodes)

  // random walk through connected nodes
  const used = new Set()
  const path = [Math.floor(Math.random()*nNodes)]
  used.add(path[0])

  while(path.length < pathLen) {
    const cur = path[path.length-1]
    // find neighbours
    const nbrs = G23.edges
      .filter(e=>e.a===cur||e.b===cur)
      .map(e=>e.a===cur?e.b:e.a)
      .filter(n=>!used.has(n))
    if(nbrs.length===0) break
    const next = nbrs[Math.floor(Math.random()*nbrs.length)]
    path.push(next); used.add(next)
  }

  G23.path     = path
  G23.pathIdx  = 0
  G23.pulsePos = 0
  G23.pulseSpeed = 0.0018 + G23.wave * 0.0006
  G23.sequenceDone = false
  G23.buildTimer   = 0

  // reset node states
  for(const n of G23.nodes) n.state='idle'
  // mark path nodes
  for(const idx of path) G23.nodes[idx].state='path'
  G23.nodes[path[0]].state='source'
}

function g23Click(mx, my) {
  SFX.resume()
  if(!G23.active||G23.sequenceDone||G23.buildTimer>0) return

  // find closest node
  let best=-1,bestD=Infinity
  for(let i=0;i<G23.nodes.length;i++){
    const n=G23.nodes[i]
    const d=Math.hypot(mx-n.x,my-n.y)
    if(d<n.r+8&&d<bestD){bestD=d;best=i}
  }
  if(best<0) return

  // must click the next node in sequence
  const expectedNode=G23.path[G23.pathIdx]
  if(best===expectedNode){
    SFX.zap()
    G23.nodes[best].state='conducted'
    G23.pathIdx++
    G23.score+=50+(G23.wave*10)
    G23.msgs.push({text:'+' + (50+G23.wave*10), color:'#4ade80', frames:40})

    if(G23.pathIdx>=G23.path.length){
      // sequence complete
      SFX.hit()
      G23.sequenceDone=true
      const bonus=300+G23.wave*50
      G23.score+=bonus
      G23.screenShake=12
      G23.msgs.push({text:`⚡ CIRCUIT COMPLETE! +${bonus}`, color:'#fbbf24', frames:100, big:true})
      G23.wave++
      G23.buildTimer=120
    }
  } else if(G23.path.includes(best)){
    // wrong path node
    g23Zap()
  }
  // clicking non-path nodes does nothing
}

function g23Zap() {
  SFX.error()
  G23.lives--
  G23.zapFlash=20
  G23.screenShake=18
  G23.msgs.push({text:G23.lives>0?`⚡ ZAP! Lives: ${G23.lives}`:'💀 DEAD!', color:'#f87171', frames:90, big:true})
  // reset current sequence
  G23.pulsePos=0; G23.pathIdx=0
  for(const n of G23.nodes) if(n.state==='conducted') n.state='path'
  if(G23.lives<=0){setTimeout(g23Over,600);G23.active=false}
}

// ─── update ────────────────────────────────────────────
function g23Update() {
  G23.frameCount++
  if(G23.screenShake>0)G23.screenShake--
  if(G23.zapFlash>0)G23.zapFlash--

  if(G23.buildTimer>0){
    G23.buildTimer--
    if(G23.buildTimer===0)g23BuildPath()
    G23.particles=G23.particles.filter(p=>{p.x+=p.vx;p.y+=p.vy;p.vx*=0.88;p.vy*=0.88;p.life--;return p.life>0})
    G23.msgs=G23.msgs.filter(m=>{m.frames--;return m.frames>0})
    return
  }
  if(G23.sequenceDone)return

  // advance pulse along path
  G23.pulsePos+=G23.pulseSpeed
  if(G23.pulsePos>=1){
    G23.pulsePos=0
    // pulse reached end of segment — if not yet conducted → zap
    const segIdx=Math.floor(G23.pulsePos*G23.path.length)
    // actually handled below per-segment
  }

  // check: pulse is at unconducted node
  const totalSegs=G23.path.length-1
  if(totalSegs>0){
    const rawSeg=G23.pulsePos*(totalSegs)
    const seg=Math.floor(rawSeg)
    if(seg>=G23.pathIdx&&seg<G23.path.length-1){
      const nextNode=G23.path[seg+1]
      if(G23.nodes[nextNode].state==='path'&&G23.pulsePos*(totalSegs)>seg+0.95){
        // pulse arrived at unconducted node
        g23Zap()
      }
    }
  }

  G23.particles=G23.particles.filter(p=>{p.x+=p.vx;p.y+=p.vy;p.vx*=0.88;p.vy*=0.88;p.life--;return p.life>0})
  G23.msgs=G23.msgs.filter(m=>{m.frames--;return m.frames>0})
}

// ─── draw ──────────────────────────────────────────────
function g23Draw() {
  const cv=g23Canvas,c=g23Ctx
  const arena=document.getElementById('g23-arena')
  if(cv.width!==arena.clientWidth||cv.height!==arena.clientHeight){cv.width=arena.clientWidth;cv.height=arena.clientHeight;g23BuildCircuit()}
  const W=cv.width,H=cv.height

  c.clearRect(0,0,W,H)
  // Canvases get no CSS variables, so read the theme directly
  const _lt = typeof qgLight === 'function' && qgLight()
  c.fillStyle=G23.zapFlash>0?`rgba(239,68,68,${G23.zapFlash/20*.3})`:(_lt?'#eef1f7':'#060a12')
  c.fillRect(0,0,W,H)

  c.save()
  if(G23.screenShake>0){const s=G23.screenShake*.5;c.translate((Math.random()-.5)*s,(Math.random()-.5)*s)}

  // edges
  for(const e of G23.edges){
    const a=G23.nodes[e.a],b=G23.nodes[e.b]
    const isPath=G23.path.includes(e.a)&&G23.path.includes(e.b)
    const consecutive=G23.path.some((_,i)=>i<G23.path.length-1&&
      ((G23.path[i]===e.a&&G23.path[i+1]===e.b)||(G23.path[i]===e.b&&G23.path[i+1]===e.a)))
    c.strokeStyle=consecutive?'rgba(99,102,241,.55)':(_lt?'rgba(0,0,0,.12)':'rgba(255,255,255,.08)')
    c.lineWidth=consecutive?2.5:1
    c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke()
  }

  // pulse along path
  if(!G23.sequenceDone&&G23.buildTimer===0&&G23.path.length>1){
    const totalSegs=G23.path.length-1
    const rawSeg=G23.pulsePos*totalSegs
    const seg=Math.min(Math.floor(rawSeg),totalSegs-1)
    const frac=rawSeg-seg
    const na=G23.nodes[G23.path[seg]], nb=G23.nodes[G23.path[seg+1]]
    const px=na.x+(nb.x-na.x)*frac, py=na.y+(nb.y-na.y)*frac
    const flash=.6+Math.sin(G23.frameCount*.25)*.35
    c.beginPath();c.arc(px,py,10,0,Math.PI*2)
    c.fillStyle=`rgba(249,115,22,${flash})`
    c.shadowColor='#f97316';c.shadowBlur=24;c.fill();c.shadowBlur=0
    c.beginPath();c.arc(px,py,5,0,Math.PI*2);c.fillStyle='#fff';c.fill()
  }

  // nodes
  for(let i=0;i<G23.nodes.length;i++){
    const n=G23.nodes[i]
    let col,glow=0
    if(n.state==='source')     {col='#22c55e';glow=16}
    else if(n.state==='conducted'){col='#4ade80';glow=12}
    else if(n.state==='path')  {col='#6366f1';glow=8}
    else                       {col=_lt?'#cbd5e1':'#1e293b';glow=0}

    const isNext=G23.path[G23.pathIdx]===i&&!G23.sequenceDone
    if(isNext){
      const pulse=1+Math.sin(G23.frameCount*.15)*.15
      c.beginPath();c.arc(n.x,n.y,n.r*pulse+8,0,Math.PI*2)
      c.strokeStyle='rgba(249,115,22,.4)';c.lineWidth=2;c.stroke()
    }

    c.beginPath();c.arc(n.x,n.y,n.r,0,Math.PI*2)
    c.fillStyle=col;c.shadowColor=col;c.shadowBlur=glow;c.fill();c.shadowBlur=0
    c.strokeStyle=_lt?'rgba(0,0,0,.18)':'rgba(255,255,255,.18)';c.lineWidth=1.5;c.stroke()

    // index label
    const pathPos=G23.path.indexOf(i)
    if(pathPos>=0){
      c.font='bold 11px monospace';c.textAlign='center';c.textBaseline='middle'
      c.fillStyle=n.state==='conducted'?'#000':'#fff'
      c.fillText(pathPos+1,n.x,n.y)
      c.textBaseline='alphabetic'
    }
  }

  // particles
  c.globalAlpha=1
  for(const p of G23.particles){c.globalAlpha=p.life/46;c.beginPath();c.arc(p.x,p.y,p.r,0,Math.PI*2);c.fillStyle=p.color;c.fill()}
  c.globalAlpha=1
  c.restore()

  // HUD
  c.font='bold 20px monospace';c.textAlign='left';c.fillStyle=_lt?'#14152b':'#f1f5f9'
  c.shadowColor=_lt?'rgba(255,255,255,.8)':'#000';c.shadowBlur=4;c.fillText(G23.score.toLocaleString(),12,36);c.shadowBlur=0
  c.font='13px sans-serif';c.fillStyle=_lt?'#475569':'#94a3b8'
  c.fillText(`Wave ${G23.wave}  ❤️${G23.lives}  ${G23.pathIdx}/${G23.path.length} conducted`,12,54)

  let my=H/2-70
  for(const m of G23.msgs){
    c.globalAlpha=Math.min(1,m.frames/20)
    c.font=`bold ${m.big?21:15}px sans-serif`;c.textAlign='center'
    c.fillStyle=m.color;c.shadowColor=m.color;c.shadowBlur=8
    c.fillText(m.text,W/2,my);c.shadowBlur=0;my+=m.big?30:22
  }
  c.globalAlpha=1

  if(G23.frameCount<200){
    c.globalAlpha=Math.min(1,(200-G23.frameCount)/60)*.7
    c.font='13px sans-serif';c.textAlign='center';c.fillStyle='#6366f1'
    c.fillText('Click the NUMBERED nodes in order (1→2→3...) before the orange pulse reaches them!',W/2,H-16)
    c.globalAlpha=1
  }
}

function g23Loop(){
  g23Raf=requestAnimationFrame(g23Loop)
  if(!G23.active||!document.getElementById('game23').classList.contains('active')){cancelAnimationFrame(g23Raf);g23Raf=null;return}
  g23Update();g23Draw()
}

function g23Over(){
  G23.active=false;window._g23Score=G23.score
  document.getElementById('g23-final-score').textContent=G23.score.toLocaleString()
  const m=G23.score>=3000?'🥇 Gold':G23.score>=1000?'🥈 Silver':G23.score>=300?'🥉 Bronze':''
  document.getElementById('g23-medal').textContent=m
  document.getElementById('g23-over').classList.add('show')
}
