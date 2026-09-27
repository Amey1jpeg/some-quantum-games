// ═══════════════════════════════════════════════════════
//  GAME 43 — WAVE GAUNTLET
//  Continuous corridor (ceiling + floor always present).
//  Walls are angular slopes (GD geometry style).
//  FP: wall SLAMS to a 24px gap for ~30 columns —
//      one timed hold/release to be at the right height.
//  DC: mini-wave through 5–6 slam sections at max speed.
// ═══════════════════════════════════════════════════════

const G43_WAVE_SPD    = 255
const G43_WAVE_R_NRM  = 7
const G43_WAVE_R_MINI = 4
const G43_DRAW_STEP   = 2
const G43_RETRY_WAIT  = 0.45   // seconds you see the death before it resets

// The simulation runs on a fixed timestep, decoupled from the display.
// Stepping with the monitor's own frame time made the level depend on the
// monitor: collision is only tested at the column the wave lands on, so a
// 144Hz screen tested more than twice as many columns as a 60Hz one, and
// frame-time jitter randomised which ones. Same level, different game.
// 240Hz is fine enough to feel smooth and to sample input closely, while
// still coarse enough that a fast level plays as it always has.
const G43_SIM_DT      = 1 / 240
const G43_MAX_STEPS   = 16     // catch-up cap; a stall slows time rather than teleporting

// Corridor is defined by keyframes: {at, cf (cy as 0–1 fraction of h), gapH (px)}
// Linear interpolation between keyframes → angular slope walls.
// SHORT transition = steep slope (GD tile feel)
// LONG transition  = gentle ramp

const G43_POOL = {
  easy: [
    {
      name:'DRIFT', diff:'easy', speed:148,
      gen(h) {
        const cy = 0.30 + qRandInt(40)/100
        return { clearAt:820, keyframes:[
          {at:0,   cf:0.50, gapH:h*.52},
          {at:80,  cf:0.50, gapH:h*.52},
          {at:220, cf:cy,   gapH:h*.52},  // slope 140 col — gentle
          {at:600, cf:cy,   gapH:h*.52},  // flat
          {at:740, cf:0.50, gapH:h*.52},  // slope back
          {at:820, cf:0.50, gapH:h*.52},
        ]}
      }
    },
    {
      name:'WAVE ROLL', diff:'easy', speed:150,
      gen(h) {
        return { clearAt:880, keyframes:[
          {at:0,   cf:0.50, gapH:h*.54},
          {at:100, cf:0.50, gapH:h*.54},
          {at:220, cf:0.30, gapH:h*.54},  // slope up 120 col
          {at:340, cf:0.30, gapH:h*.54},
          {at:480, cf:0.68, gapH:h*.54},  // slope down 140 col
          {at:600, cf:0.68, gapH:h*.54},
          {at:740, cf:0.30, gapH:h*.54},  // slope up
          {at:880, cf:0.50, gapH:h*.54},
        ]}
      }
    },
    {
      name:'WIDE CORRIDOR', diff:'easy', speed:145,
      gen(h) {
        return { clearAt:780, keyframes:[
          {at:0,   cf:0.50, gapH:h*.56},
          {at:130, cf:0.35, gapH:h*.54},  // slope 130 col
          {at:400, cf:0.35, gapH:h*.54},
          {at:550, cf:0.65, gapH:h*.54},  // slope 150 col
          {at:680, cf:0.65, gapH:h*.54},
          {at:780, cf:0.50, gapH:h*.54},
        ]}
      }
    },
  ],

  medium: [
    {
      name:'TIGHT ROLL', diff:'medium', speed:238,
      gen(h) {
        // max safe over 120-col hi→lo = 255/238*120*0.85 = 109px → swing = 54px each way
        const sw = Math.min(54, Math.floor(h * 0.13))
        const hi = 0.50 - sw/h, lo = 0.50 + sw/h
        return { clearAt:920, keyframes:[
          {at:0,   cf:0.50, gapH:h*.28},
          {at:90,  cf:hi,   gapH:h*.27},  // 90-col slope (54px, 0.60px/col ✓)
          {at:270, cf:hi,   gapH:h*.27},
          {at:390, cf:lo,   gapH:h*.26},  // 120-col shift (108px, 0.90px/col ✓)
          {at:570, cf:lo,   gapH:h*.26},
          {at:690, cf:hi,   gapH:h*.27},  // 120-col shift back
          {at:820, cf:hi,   gapH:h*.27},
          {at:920, cf:0.50, gapH:h*.28},  // 100-col return
        ]}
      }
    },
    {
      name:'SUDDEN SHIFT', diff:'medium', speed:248,
      gen(h) {
        // 120-col shifts → max safe = 255/248*120*0.85 = 105px total → swing = 52px
        const sw = Math.min(52, Math.floor(h * 0.14))
        const a = 0.50 - sw/h, b = 0.50 + sw/h
        return { clearAt:870, keyframes:[
          {at:0,   cf:0.50, gapH:h*.30},
          {at:100, cf:a,    gapH:h*.30},  // 100-col slope to a
          {at:230, cf:a,    gapH:h*.30},
          {at:350, cf:b,    gapH:h*.28},  // 120-col shift a→b (104px, 0.87px/col ✓)
          {at:530, cf:b,    gapH:h*.28},
          {at:650, cf:a,    gapH:h*.28},  // 120-col shift back
          {at:760, cf:a,    gapH:h*.28},
          {at:870, cf:0.50, gapH:h*.30},
        ]}
      }
    },
    {
      name:'SQUEEZE', diff:'medium', speed:232,
      gen(h) {
        return { clearAt:920, keyframes:[
          {at:0,   cf:0.50, gapH:h*.44},
          {at:140, cf:0.50, gapH:h*.44},
          {at:200, cf:0.50, gapH:h*.23},  // squeeze 60 col
          {at:530, cf:0.50, gapH:h*.23},
          {at:590, cf:0.50, gapH:h*.44},
          {at:920, cf:0.50, gapH:h*.44},
        ]}
      }
    },
    {
      name:'FAST SHIFT', diff:'medium', speed:348,
      gen(h) {
        // 110-col slopes → max safe = 255/348*110*0.85 = 68px (one direction)
        // never shift directly hi→lo; go via center instead
        const sw = Math.min(68, Math.floor(h * 0.16))
        const hi = 0.50 - sw/h, lo = 0.50 + sw/h
        return { clearAt:1040, keyframes:[
          {at:0,    cf:0.50, gapH:h*.32},
          {at:110,  cf:hi,   gapH:h*.30},  // 110-col up (68px, 0.62px/col ✓)
          {at:290,  cf:hi,   gapH:h*.30},
          {at:400,  cf:0.50, gapH:h*.30},  // 110-col back center
          {at:430,  cf:0.50, gapH:h*.30},
          {at:540,  cf:lo,   gapH:h*.30},  // 110-col down
          {at:720,  cf:lo,   gapH:h*.30},
          {at:830,  cf:0.50, gapH:h*.32},  // 110-col return
          {at:1040, cf:0.50, gapH:h*.32},
        ]}
      }
    },
  ],

  hard: [
    {
      name:'NEEDLE', diff:'hard', speed:302,
      gen(h) {
        // slope is during WIDE section so wave navigates freely — just cap cy
        // so player has enough time (130 col) to reach the narrow gap center
        const maxReach = Math.floor(255/302 * 130 * 0.90)  // ~99px in 130 col
        const sign = qRandInt(2) === 0 ? 1 : -1
        const deltaPx = 20 + qRandInt(Math.max(1, Math.min(maxReach - 30, 70)))
        const cy = Math.max(0.15, Math.min(0.85, 0.50 + sign * deltaPx / h))
        return { clearAt:960, keyframes:[
          {at:0,   cf:0.50, gapH:h*.30},
          {at:75,  cf:cy,   gapH:h*.30},  // slope during wide (no constraint)
          {at:130, cf:cy,   gapH:h*.14},  // close 55 col
          {at:510, cf:cy,   gapH:h*.14},
          {at:565, cf:cy,   gapH:h*.30},
          {at:960, cf:0.50, gapH:h*.30},
        ]}
      }
    },
    {
      name:'RAPID SHIFT', diff:'hard', speed:315,
      gen(h) {
        // 90-col slopes → max safe = 255/315*90*0.85 = 62px per move
        // route hi→lo via center (never direct) — corridor stays narrow
        const sw = Math.min(62, Math.floor(h * 0.16))
        const hi = 0.50 - sw/h, lo = 0.50 + sw/h
        return { clearAt:1010, keyframes:[
          {at:0,   cf:0.50, gapH:h*.16},
          {at:90,  cf:hi,   gapH:h*.15},  // 90-col up (62px, 0.69px/col ✓)
          {at:240, cf:hi,   gapH:h*.15},
          {at:330, cf:0.50, gapH:h*.14},  // 90-col back center
          {at:370, cf:0.50, gapH:h*.14},
          {at:460, cf:lo,   gapH:h*.14},  // 90-col down
          {at:610, cf:lo,   gapH:h*.14},
          {at:700, cf:0.50, gapH:h*.16},  // 90-col return
          {at:1010,cf:0.50, gapH:h*.16},
        ]}
      }
    },
    {
      name:'MARATHON', diff:'hard', speed:308,
      gen(h) {
        // each 75-col slope: max safe = 255/308*75*0.85 = 53px
        // generate cys as bounded cumulative steps so no consecutive pair exceeds 53px
        const step = Math.floor(255/308 * 75 * 0.85)  // 53px
        const dirs = [-1, 1, -1, 1]
        let cy = 0.50
        const cys = []
        for (const d of dirs) {
          const delta = (12 + qRandInt(Math.max(1, step - 12))) / h
          cy = Math.max(0.13, Math.min(0.87, cy + d * delta))
          cys.push(cy)
        }
        return { clearAt:1120, keyframes:[
          {at:0,    cf:0.50,    gapH:h*.16},
          {at:75,   cf:cys[0],  gapH:h*.145},  // 75-col (≤53px, ≤0.71px/col ✓)
          {at:260,  cf:cys[0],  gapH:h*.14},
          {at:335,  cf:cys[1],  gapH:h*.145},  // 75-col (≤53px ✓)
          {at:520,  cf:cys[1],  gapH:h*.14},
          {at:595,  cf:cys[2],  gapH:h*.14},   // 75-col ✓
          {at:780,  cf:cys[2],  gapH:h*.14},
          {at:855,  cf:cys[3],  gapH:h*.145},  // 75-col ✓
          {at:1000, cf:cys[3],  gapH:h*.145},
          {at:1120, cf:0.50,    gapH:h*.16},
        ]}
      }
    },
    {
      name:'SPEED NEEDLE', diff:'hard', speed:408,
      gen(h) {
        const cy=0.27+qRandInt(46)/100
        // The opening slope used to be 70 columns. At 408px/s that is 0.172s,
        // in which the wave can cover 43.8px — but cy ranges over 0.27..0.72,
        // so an extreme roll asked for far more than that and the level was
        // simply impossible. It cleared at only 2 window heights of 8, and
        // only then because a short screen makes the same fraction fewer
        // pixels. 150 columns gives every roll room at every height.
        return { clearAt:1200, keyframes:[
          {at:0,    cf:0.50, gapH:h*.28},
          {at:150,  cf:cy,   gapH:h*.28},  // slope 150 col
          {at:210,  cf:cy,   gapH:h*.15},  // close 60 col
          {at:640,  cf:cy,   gapH:h*.15},
          {at:700,  cf:cy,   gapH:h*.28},  // open 60 col
          {at:1200, cf:0.50, gapH:h*.28},
        ]}
      }
    },
  ],

  fp: [
    // speed=255 = wave vertical speed → diagonal angle = exactly 45°.
    // Wall snaps tight (gapH=22) while simultaneously sloping at 1px/column.
    // Wave R=7 (diam=14), clearance=4px/side ≈ 1-frame timing window.
    // Player must hold (upslope) or release (downslope) at the exact frame.
    {
      name:'FRAME PERFECT', diff:'fp', speed:255, isFP:true,
      gen(h) {
        const startCf = 0.60 + qRandInt(15)/100   // 60-75%: below center
        const endCf   = startCf - 80/h             // 80px rise = 45° upslope
        return { clearAt:720, keyframes:[
          { at:0,   cf:0.50,    gapH:h*.42 },
          { at:160, cf:0.50,    gapH:h*.42 },
          { at:198, cf:startCf, gapH:h*.42 },       // drift to slope position
          { at:200, cf:startCf, gapH:22    },        // SNAP + slope begins
          { at:280, cf:endCf,   gapH:22    },        // 45° upslope (80 col)
          { at:320, cf:endCf,   gapH:h*.42 },
          { at:720, cf:0.50,    gapH:h*.42 },
        ]}
      }
    },
    {
      name:'DOWN FP', diff:'fp', speed:255, isFP:true,
      gen(h) {
        const startCf = 0.28 + qRandInt(12)/100   // 28-40%: above center
        const endCf   = startCf + 80/h             // 80px drop = 45° downslope
        return { clearAt:720, keyframes:[
          { at:0,   cf:0.50,    gapH:h*.42 },
          { at:160, cf:0.50,    gapH:h*.42 },
          { at:198, cf:startCf, gapH:h*.42 },
          { at:200, cf:startCf, gapH:22    },        // SNAP + slope begins
          { at:280, cf:endCf,   gapH:22    },        // 45° downslope (80 col)
          { at:320, cf:endCf,   gapH:h*.42 },
          { at:720, cf:0.50,    gapH:h*.42 },
        ]}
      }
    },
    {
      name:'MID FP', diff:'fp', speed:255, isFP:true,
      gen(h) {
        const up      = qRandInt(2) === 0
        const startCf = up ? 0.55 + qRandInt(15)/100 : 0.28 + qRandInt(12)/100
        const endCf   = up ? startCf - 80/h : startCf + 80/h
        return { clearAt:720, keyframes:[
          { at:0,   cf:0.50,    gapH:h*.42 },
          { at:160, cf:0.50,    gapH:h*.42 },
          { at:198, cf:startCf, gapH:h*.42 },
          { at:200, cf:startCf, gapH:22    },
          { at:280, cf:endCf,   gapH:22    },
          { at:320, cf:endCf,   gapH:h*.42 },
          { at:720, cf:0.50,    gapH:h*.42 },
        ]}
      }
    },
    {
      name:'SUPERSONIC', diff:'fp', speed:3000,
      gen(h) {
        // Hand-built in the editor. At 3000px/s the level lasts under two
        // seconds and scrolls ~50 columns per frame at 60Hz, so the fine
        // detail here reads as a blur rather than as gaps to thread.
        // Geometrically it is the most forgiving level in the game — the
        // tightest gap is h*0.0852, ~43px at a 500px canvas.
        return { clearAt:5800, keyframes:[
          {at:0, cf:0.5, gapH:h*0.5},
          {at:200, cf:0.5, gapH:h*0.2236},
          {at:215, cf:0.5943, gapH:h*0.5},
          {at:500, cf:0.35, gapH:h*0.3902},
          {at:800, cf:0.5, gapH:h*0.5},
          {at:1071, cf:0.4658, gapH:h*0.4},
          {at:1111, cf:0.4658, gapH:h*0.2739},
          {at:1241, cf:0.4658, gapH:h*0.1174},
          {at:1281, cf:0.4658, gapH:h*0.4},
          {at:1305, cf:0.4389, gapH:h*0.1867},
          {at:1381, cf:0.4481, gapH:h*0.0852},
          {at:1481, cf:0.5581, gapH:h*0.37},
          {at:1581, cf:0.4481, gapH:h*0.09},
          {at:1686, cf:0.465, gapH:h*0.2387},
          {at:1717, cf:0.3651, gapH:h*0.4094},
          {at:1781, cf:0.4481, gapH:h*0.09},
          {at:1905, cf:0.4389, gapH:h*0.2331},
          {at:2008, cf:0.4527, gapH:h*0.2532},
          {at:2105, cf:0.4389, gapH:h*0.2104},
          {at:2584, cf:0.4648, gapH:h*0.4},
          {at:2624, cf:0.4648, gapH:h*0.1267},
          {at:2754, cf:0.4648, gapH:h*0.1308},
          {at:2794, cf:0.4648, gapH:h*0.4},
          {at:3369, cf:0.4185, gapH:h*0.1795},
          {at:3469, cf:0.5285, gapH:h*0.265},
          {at:3569, cf:0.4185, gapH:h*0.1739},
          {at:3669, cf:0.5285, gapH:h*0.212},
          {at:3769, cf:0.4185, gapH:h*0.1842},
          {at:4033, cf:0.419, gapH:h*0.5},
          {at:4231, cf:0.4648, gapH:h*0.5},
          {at:4241, cf:0.5199, gapH:h*0.5},
          {at:4241, cf:0.5292, gapH:h*0.5},
          {at:4251, cf:0.4962, gapH:h*0.5},
          {at:4312, cf:0.5554, gapH:h*0.5},
          {at:4328, cf:0.3747, gapH:h*0.3723},
          {at:4382, cf:0.4156, gapH:h*0.2307},
          {at:4552, cf:0.5503, gapH:h*0.415},
          {at:4574, cf:0.3397, gapH:h*0.3079},
          {at:4683, cf:0.4864, gapH:h*0.3079},
          {at:4693, cf:0.5755, gapH:h*0.3718},
          {at:4706, cf:0.419, gapH:h*0.5},
          {at:4962, cf:0.688, gapH:h*0.5},
          {at:5237, cf:0.6471, gapH:h*0.5},
          {at:5393, cf:0.6239, gapH:h*0.3296},
          {at:5423, cf:0.6048, gapH:h*0.5},
          {at:5431, cf:0.7094, gapH:h*0.5},
          {at:5499, cf:0.5791, gapH:h*0.1164},
          {at:5712, cf:0.6275, gapH:h*0.3584},
          {at:5743, cf:0.5255, gapH:h*0.1586},
          {at:5762, cf:0.456, gapH:h*0.2915},
          {at:5791, cf:0.5394, gapH:h*0.2915},
          {at:5954, cf:0.6437, gapH:h*0.5},
        ]}
      }
    },
  ],

  extreme: [
    {
      name:'TWIN SLAM', diff:'extreme', speed:278,
      gen(h) {
        // Hand-tuned in the editor — fixed shape, no randomness.
        // The 330→430 drift moves the centre 90px over 100 cols, more than
        // the wave's 78px reach, but the corridor is h*.36 wide there so
        // there is ~130px of slack to absorb it. Playable.
        return { clearAt:960, keyframes:[
          {at:0,   cf:0.5,    gapH:h*0.36},
          {at:120, cf:0.3267, gapH:h*0.36},
          {at:180, cf:0.3267, gapH:h*0.1343},  // SLAM 1
          {at:270, cf:0.3267, gapH:h*0.1343},
          {at:330, cf:0.3267, gapH:h*0.36},
          {at:430, cf:0.5533, gapH:h*0.36},
          {at:490, cf:0.5533, gapH:h*0.1118},  // SLAM 2 — tighter
          {at:580, cf:0.5533, gapH:h*0.1104},
          {at:640, cf:0.5533, gapH:h*0.36},
          {at:960, cf:0.5,    gapH:h*0.36},
        ]}
      }
    },
    {
      name:'SQUEEZE SHIFT', diff:'extreme', speed:318,
      gen(h) {
        // 28px gap that slowly drifts while closed.
        // Clearance = 7px/side — must tap-control to stay centered while tracking drift.
        const maxPos = Math.floor(255/318 * 100 * 0.85)
        const cy1px  = 10 + qRandInt(Math.min(maxPos - 15, 50))
        const sign   = qRandInt(2) === 0 ? 1 : -1
        const cy1    = Math.max(0.20, Math.min(0.80, 0.50 + sign * cy1px / h))
        const drift  = (qRandInt(2) === 0 ? 1 : -1) * (6 + qRandInt(8))  // 6-13px
        const cy2    = Math.max(0.18, Math.min(0.82, cy1 + drift / h))
        return { clearAt:920, keyframes:[
          {at:0,   cf:0.50, gapH:h*.36},
          {at:100, cf:cy1,  gapH:h*.36},  // position
          {at:160, cf:cy1,  gapH:52},     // SLAM — 52px tight gap
          {at:260, cf:cy2,  gapH:52},     // slow drift 100 col (6-13px) while slammed
          {at:330, cf:cy2,  gapH:h*.36},
          {at:920, cf:0.50, gapH:h*.36},
        ]}
      }
    },
    {
      name:'SPECIAL HOLD', diff:'extreme', speed:1000,
      gen(h) {
        // Hand-built in the editor. Sits alongside SQUEEZE SHIFT.
        // The pinch is the h*0.0603 gap around col 260 — one held line
        // through it, which is where the name comes from. The three
        // keyframes at 533/543/547 are 10 and 4 columns apart, under one
        // frame at this speed, so that drop reads as an instant snap.
        return { clearAt:920, keyframes:[
          {at:0, cf:0.5, gapH:h*0.36},
          {at:100, cf:0.5348, gapH:h*0.36},
          {at:160, cf:0.5348, gapH:h*0.2554},
          {at:260, cf:0.5452, gapH:h*0.0603},   // the hold
          {at:330, cf:0.5452, gapH:h*0.2},
          {at:387, cf:0.5557, gapH:h*0.1226},
          {at:439, cf:0.5845, gapH:h*0.36},
          {at:485, cf:0.5933, gapH:h*0.2642},
          {at:533, cf:0.4751, gapH:h*0.36},
          {at:543, cf:0.4112, gapH:h*0.36},
          {at:547, cf:0.3412, gapH:h*0.36},
          {at:920, cf:0.5, gapH:h*0.36},
        ]}
      }
    },
    {
      name:'BLITZ', diff:'extreme', speed:395,
      gen(h) {
        // High speed, h*.10 gap, quick shifts while tight.
        // sw = safe shift in 80 col = min(255/395*80*0.85, h*.10)
        const gW = h * 0.13
        const sw = Math.min(Math.floor(255/395 * 80 * 0.85), Math.floor(h * 0.13))
        const hi = 0.50 - sw/h, lo = 0.50 + sw/h
        return { clearAt:1100, keyframes:[
          {at:0,    cf:0.50, gapH:h*.28},
          {at:80,   cf:hi,   gapH:h*.26},   // 80-col shift up (≤sw px ✓)
          {at:200,  cf:hi,   gapH:gW},      // tighten
          {at:280,  cf:0.50, gapH:gW},      // 80-col return center while tight
          {at:300,  cf:0.50, gapH:gW},
          {at:380,  cf:lo,   gapH:gW},      // 80-col shift down while tight
          {at:500,  cf:lo,   gapH:gW},
          {at:580,  cf:lo,   gapH:h*.28},
          {at:1100, cf:0.50, gapH:h*.28},
        ]}
      }
    },
  ],

  dc: [
    {
      name:'PURGATORY', diff:'boss', speed:40,
      gen(h) {
        // NEEDLE gap (h*0.14) at ultra-slow speed — wave oscillates ~6px/col,
        // player must spam hold/release every ~3 cols to survive.
        const sign   = qRandInt(2) === 0 ? 1 : -1
        const deltaPx = 15 + qRandInt(40)
        const cy      = Math.max(0.15, Math.min(0.85, 0.50 + sign * deltaPx / h))
        const gN      = h * 0.14
        return { clearAt:900, keyframes:[
          {at:0,   cf:0.50, gapH:h*.30},
          {at:100, cf:cy,   gapH:h*.30},  // drift to off-center position
          {at:160, cf:cy,   gapH:gN},     // CLOSE — spam begins
          {at:420, cf:cy,   gapH:gN},     // hold tight 260 cols (6.5s)
          {at:490, cf:cy,   gapH:h*.30},  // brief relief
          {at:560, cf:cy,   gapH:h*.30},
          {at:620, cf:cy,   gapH:gN},     // close again
          {at:800, cf:cy,   gapH:gN},     // hold tight 180 cols (4.5s)
          {at:860, cf:cy,   gapH:h*.30},
          {at:900, cf:0.50, gapH:h*.30},
        ]}
      }
    },
    {
      name:'THE SAW', diff:'boss', speed:160,
      gen(h) {
        // Hand-tuned in the editor — fixed shape, no randomness.
        // Eight sawtooth swings between cf .39 and .50 at a crawl. Every
        // slope sits under 51% of what the wave can cover, so the whole
        // difficulty is gap precision: 20-27px against a 14px wave.
        return { clearAt:800, keyframes:[
          {at:0,   cf:0.5,    gapH:h*0.5},
          {at:94,  cf:0.5019, gapH:h*0.5},
          {at:145, cf:0.3903, gapH:h*0.1045},  // teeth begin
          {at:200, cf:0.5075, gapH:h*0.0551},
          {at:248, cf:0.3903, gapH:h*0.0593},
          {at:302, cf:0.5033, gapH:h*0.0678},
          {at:347, cf:0.3938, gapH:h*0.0847},
          {at:400, cf:0.5011, gapH:h*0.0508},  // tightest — 20px
          {at:445, cf:0.3966, gapH:h*0.0734},
          {at:500, cf:0.4913, gapH:h*0.45},    // release
          {at:800, cf:0.5,    gapH:h*0.5},
        ]}
      }
    },
    {
      name:'UPHILL DOWNHILL', diff:'boss', speed:160,
      gen(h) {
        // Submitted level, checked in review.html — clean at every window
        // size. The gap clamps to ~h*0.092 at col 200 and stays there for
        // 550 columns while the whole corridor ramps down to cf 0.35 and
        // back up. No single hard input; just no let-up for 6 seconds.
        return { clearAt:1000, keyframes:[
          {at:0,    cf:0.5,    gapH:h*0.5},
          {at:200,  cf:0.5,    gapH:h*0.0981},   // clamp shut
          {at:500,  cf:0.35,   gapH:h*0.0925},   // downhill
          {at:750,  cf:0.5041, gapH:h*0.0925},   // uphill
          {at:1006, cf:0.4998, gapH:h*0.5},      // release
        ]}
      }
    },
  ],
}

const G43_DIFF_COL = { easy:'#4ade80', medium:'#fbbf24', hard:'#f87171', extreme:'#fb923c', fp:'#c084fc', dc:'#ef4444', boss:'#ef4444' }

const G43 = {
  active:false, phase:'idle',
  wy:0, wvy:0, holding:false,
  waveR:G43_WAVE_R_NRM,
  score:0, challenge:null,
  keyframes:[], clearAt:0, scrollX:0, deco:[],
  trail:[],
  announceT:0, clearedT:0, t:0,
  deadT:0, showOver:false, shake:0,
  // practice = this run never scores. noclip = walls don't kill.
  // They used to be one flag; separating them lets you practise a level
  // for real without it counting.
  practice:false, noclip:false,
  portals:[], portalFlash:0, portalCool:0, laps:0,
  practiceDiff:null, practiceLevel:null, hitFlash:0, attempts:0,
  fullTrail:[],         // whole run, for the clear-card picture
  paused:false,         // frozen while the clear card is up
  botMode:false, bot:null, botPending:false, simAcc:0, evil:false,  // autopilot playing the solved ideal line
  retrying:false, retryT:0,  // brief hold on the death before restarting
  taps:0,  // input count, measured as rising edges
  testLevel:null,
  raf:null, lastTime:0,
  multi:false,
  p2wy:0, p2wvy:0, p2holding:false, p2trail:[],
}
window._g43Score = 0

// Falls back to a no-op if cheats.js is missing or loads late, so a
// failed optional script can never take the whole game down with it.
const _NO_CHEAT = { on:false, mul:1, feed:() => false, reset() {}, label:() => '' }
const G43_cheat = (typeof makeCheat === 'function')
  ? makeCheat('speedhack', () => cheatScreenActive('game43'))
  : _NO_CHEAT

let G43_roomCode           = null
let G43_isHost             = false
let G43_lastNetSync        = 0
let G43_pendingSyncChallenge = null  // host: challenge to include in next state-sync
let G43_pendingNetChallenge  = null  // joiner: buffered challenge from host

let _g43Canvas = null
function _g43C() {
  if (!_g43Canvas) _g43Canvas = document.getElementById('g43-canvas')
  return _g43Canvas
}

// Practice picker is generated from G43_POOL, so a level added to the
// pool can never be missing (or hiding behind a stale label) here.
function _g43BuildPracticeUI() {
  const el = document.getElementById('g43-practice')
  if (!el) return
  const label = { easy:'Easy', medium:'Medium', hard:'Hard', extreme:'Extreme', fp:'Frame P.', dc:'Boss' }
  el.innerHTML = ''

  try {
    const saved = localStorage.getItem('qg_practice_noclip')
    if (saved !== null) window.g43UseNoclip = saved === '1'
  } catch {}

  const bot = document.createElement('button')
  bot.className = 'pp-toggle' + (G43.botMode ? ' bot' : '')
  bot.textContent = G43.botMode ? '\ud83e\udd16 Bot ON — watch the ideal line' : '\ud83e\udd16 Bot OFF — you play'
  bot.title = 'Plays the fewest-input line the solver can find'
  bot.addEventListener('click', () => g43ToggleBot())
  el.appendChild(bot)

  const on = window.g43UseNoclip
  const tog = document.createElement('button')
  tog.className = 'pp-toggle' + (on ? ' on' : '')
  tog.textContent = on ? '🛡 Noclip ON — walls won\'t kill' : '💀 Noclip OFF — walls kill'
  tog.title = 'Either way, practice never counts towards the leaderboard'
  tog.addEventListener('click', () => g43ToggleNoclip())
  el.appendChild(tog)

  for (const key of ['easy','medium','hard','extreme','fp','dc']) {
    const arr = G43_POOL[key] || []
    if (!arr.length) continue
    const c = G43_DIFF_COL[key] || '#888'

    // Built with real listeners, not inline onclick — level names go
    // straight to the handler instead of through HTML attribute quoting.
    const mk = (text, name, any) => {
      const b = document.createElement('button')
      b.className = 'pp-btn' + (any ? ' pp-any' : '')
      b.style.color       = c
      b.style.borderColor = any ? c : c + '55'
      b.style.background  = c + (any ? '28' : '18')
      b.textContent = text
      b.addEventListener('click', () => startWaveGauntletPractice(key, name))
      return b
    }

    const tier = document.createElement('span')
    tier.className = 'pp-tier'; tier.style.color = c
    tier.textContent = label[key] || key

    const levels = document.createElement('span')
    levels.className = 'pp-levels'
    levels.appendChild(mk('Any', null, true))
    for (const t of arr) levels.appendChild(mk(t.name, t.name, false))

    const row = document.createElement('div')
    row.className = 'pp-row'
    row.appendChild(tier); row.appendChild(levels)
    el.appendChild(row)
  }
}

// Also build on load: the picker is static content, so it should not
// depend on initGame43 running (or on it not throwing).
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    try { _g43BuildPracticeUI() } catch (e) { console.error('practice picker:', e) }
  })
}

async function initGame43() {
  try { _g43BuildPracticeUI() } catch (e) { console.error('practice picker:', e) }
  const _c = document.getElementById('g43-card')
  if (_c) _c.style.display = 'none'
  stopGame43(); _g43Canvas = null
  document.getElementById('g43-overlay').style.display = 'flex'
  document.getElementById('g43-over').style.display    = 'none'
  await initCurby()
}
window.initGame43 = initGame43

function _g43Start(practice, practiceDiff, multi, noclip) {
  SFX.resume(); SFX.click()
  const c = _g43C()
  c.width  = c.parentElement.clientWidth
  c.height = c.parentElement.clientHeight
  document.getElementById('g43-overlay').style.display = 'none'
  document.getElementById('g43-over').style.display    = 'none'
  const _card = document.getElementById('g43-card')
  if (_card) _card.style.display = 'none'

  Object.assign(G43, {
    active:true, phase:'announce',
    wy:c.height/2, wvy:G43_WAVE_SPD, holding:false,
    waveR:G43_WAVE_R_NRM,
    score:0, challenge:null, keyframes:[], clearAt:0, scrollX:0,
    trail:[],
    announceT:0, clearedT:0, t:0,
    deadT:0, showOver:false, shake:0,
    practice:!!practice, noclip:practice ? (noclip !== false) : false,
    practiceDiff:practiceDiff||null, practiceLevel:G43.practiceLevel || null, hitFlash:0,
    attempts:0, fullTrail:[], taps:0, paused:false,
    botMode:G43.botMode || false, bot:null, simAcc:0,
    retrying:false, retryT:0,
    testLevel:G43.testLevel || null,
    multi:!!multi,
    p2wy:c.height/2, p2wvy:G43_WAVE_SPD, p2holding:false, p2trail:[],
  })
  window._g43Score = 0
  document.getElementById('g43-score-hud').textContent = practice ? '—' : '0'

  if (!practice) G43_cheat.reset()

  if (G43_roomCode && !G43_isHost) {
    // Joiner: wait for host to send first challenge via state-sync
    G43.challenge = null
    G43.keyframes = []
    G43.clearAt   = 999999
    G43.scrollX   = 0
    G43.trail     = []
    G43.phase     = 'waiting'
  } else {
    _g43LoadChallenge(c.width, c.height)
  }

  c.addEventListener('mousedown',  _g43On,  {passive:false})
  c.addEventListener('mouseup',    _g43Off)
  c.addEventListener('touchstart', _g43On,  {passive:false})
  c.addEventListener('touchend',   _g43Off, {passive:false})
  window.addEventListener('keydown', _g43KeyDn)
  window.addEventListener('keyup',   _g43KeyUp)

  G43.lastTime = performance.now()
  G43.raf = requestAnimationFrame(_g43Loop)
}

window.startWaveGauntlet   = function() { G43.botMode = false; G43.testLevel = null; G43.practiceLevel = null; _g43Start(false, null, false) }
window.startWaveGauntlet2P = function() { G43.botMode = false; G43.testLevel = null; G43.practiceLevel = null; _g43Start(false, null, true)  }

// Autopilot. Practice rules (never scores), walls on so a mistake would
// show, and the solved line drives the wave.
window.g43ToggleBot = function() {
  G43.botMode = !G43.botMode
  try { localStorage.setItem('qg_bot', G43.botMode ? '1' : '0') } catch {}
  _g43BuildPracticeUI()
}

window.g43BotPlay = function(tmpl, noclip) {
  G43.botMode = true
  G43.testLevel = tmpl || null
  G43.practiceLevel = null
  _g43Start(true, null, false, noclip === undefined ? false : noclip)
}

// Practice never scores. Noclip is a separate choice on top of that.
window.g43UseNoclip = true
window.g43ToggleNoclip = function() {
  window.g43UseNoclip = !window.g43UseNoclip
  // Save BEFORE rebuilding: the builder re-reads this key, so rebuilding
  // first would immediately overwrite the flip with the old value.
  try { localStorage.setItem('qg_practice_noclip', window.g43UseNoclip ? '1' : '0') } catch {}
  _g43BuildPracticeUI()
}

// name omitted -> random within the tier; name given -> that level on repeat
window.startWaveGauntletPractice = function(d, name, noclip) {
  G43.testLevel     = null
  G43.practiceLevel = name || null
  try { G43.botMode = localStorage.getItem('qg_bot') === '1' } catch {}
  _g43Start(true, d, false, noclip === undefined ? window.g43UseNoclip : noclip)
}

// Editor / review test play. Practice rules, noclip optional.
window.g43TestLevel = function(tmpl, noclip, bot) {
  G43.botMode = !!bot
  G43.testLevel = tmpl
  _g43Start(true, null, false, noclip === undefined ? true : noclip)
}

window.stopGame43 = function() {
  G43.active = false
  G43.paused = false
  G43.retrying = false
  if (G43.raf) { cancelAnimationFrame(G43.raf); G43.raf = null }
  const c = _g43C()
  if (c) {
    c.removeEventListener('mousedown',  _g43On)
    c.removeEventListener('mouseup',    _g43Off)
    c.removeEventListener('touchstart', _g43On)
    c.removeEventListener('touchend',   _g43Off)
  }
  window.removeEventListener('keydown', _g43KeyDn)
  window.removeEventListener('keyup',   _g43KeyUp)
  if (typeof mpGetSocket !== 'undefined' && G43_roomCode) {
    const s = mpGetSocket()
    s.off('opponent-state'); s.off('force-end')
  }
  G43_roomCode             = null
  G43_isHost               = false
  G43_pendingSyncChallenge = null
  G43_pendingNetChallenge  = null
}

window.g43FindMatch = function() {
  const statusEl = document.getElementById('g43-match-status')
  const btnEl    = document.getElementById('g43-match-btn')
  mpFindMatch('wavegauntlet', {
    onMatched: ({ code, isHost }) => {
      G43_roomCode = code
      G43_isHost   = isHost
      _g43Start(false, null, true)
      _g43SetupNetEvents()
    },
    onLeft: () => {
      G43_roomCode = null; G43_isHost = false
      G43_pendingNetChallenge = null
      if (!G43.active) document.getElementById('g43-overlay').style.display = 'flex'
    },
    statusEl, btnEl,
  })
}

function _g43SetupNetEvents() {
  const sock = mpGetSocket()
  sock.off('opponent-state'); sock.off('force-end')
  sock.on('opponent-state', (state) => {
    G43.p2wy  = state.wy
    G43.p2wvy = state.wvy
    if (!G43_isHost && state.challenge) G43_pendingNetChallenge = state.challenge
  })
  sock.on('force-end', () => { _g43Die() })
}

function _g43SerializeChallenge(h) {
  const ch = G43.challenge
  return {
    name: ch.name, diff: ch.diff, speed: ch.speed,
    clearAt: G43.clearAt,
    isFP: !!ch.isFP, isDC: !!ch.isDC, miniWave: !!ch.miniWave,
    keyframes: G43.keyframes.map(kf => ({ at: kf.at, cf: kf.cf, gapHf: kf.gapH / h })),
    // the roll travels with the challenge, so both players get the same one
    portals: (G43.portals || []).map(p => ({ ...p })),
    hasPortal: !!(G43.challenge && G43.challenge.hasPortal),
  }
}

function _g43ApplyNetChallenge(data, h) {
  G43.challenge = { name: data.name, diff: data.diff, speed: data.speed,
    clearAt: data.clearAt, isFP: data.isFP, isDC: data.isDC, miniWave: data.miniWave,
    hasPortal: !!data.hasPortal }
  G43.portals  = (data.portals || []).map(p => ({ ...p }))
  G43.portalCool = 0
  G43.waveR    = data.miniWave ? G43_WAVE_R_MINI : G43_WAVE_R_NRM
  G43.keyframes = data.keyframes.map(kf => ({ at: kf.at, cf: kf.cf, gapH: kf.gapHf * h }))
  G43.clearAt  = data.clearAt
  G43.scrollX  = 0
  G43.trail    = []; G43.p2trail = []
  G43.phase    = 'announce'
  G43.announceT = 0
  G43.wy       = h / 2; G43.wvy = G43_WAVE_SPD; G43.hitFlash = 0
}

// Counted on the event, not sampled per frame. A tap that goes down and
// back up inside one frame is invisible to frame sampling, which capped
// the count at the refresh rate — 30/s on a 60Hz screen — and made the
// same mashing score differently on different monitors.
function _g43Hold() {
  if (!G43.holding) { if (G43.practice) G43.taps++; SFX.tap() }
  G43.holding = true
}

function _g43On(e)    { e.preventDefault(); _g43Hold() }
function _g43Off(e)   { if (e.cancelable) e.preventDefault(); G43.holding = false }
function _g43KeyDn(e) {
  // The cheat code is handled by the always-on listener in cheats.js,
  // so it works on the start overlay too, not only mid-run.
  // Suppress the browser default first, and only then ignore auto-repeat.
  // The other order meant a held key never called preventDefault, so a
  // focused button stayed armed and Chrome clicked it on the keyup.
  const ours = e.code === 'Space' || e.key === 'ArrowUp'
  if (ours) e.preventDefault()
  if (e.repeat) return          // key auto-repeat is not a new press
  if (e.code === 'Space') _g43Hold()
  else if (e.key === 'ArrowUp') { G43.multi ? (G43.p2holding = true) : _g43Hold() }
}
function _g43KeyUp(e) {
  if (e.code === 'Space' || e.key === 'ArrowUp') e.preventDefault()
  if (e.code === 'Space') G43.holding = false
  else if (e.key === 'ArrowUp') { G43.multi ? (G43.p2holding = false) : (G43.holding = false) }
}

// ── Editor-published levels ───────────────────────────

function _g43CustomAll() {
  return (window.QG_CUSTOM_LEVELS && window.QG_CUSTOM_LEVELS.wavegauntlet) || []
}

// Names of built-ins that a published edit replaces
function _g43Overridden() {
  return new Set(_g43CustomAll().map(l => l.overrides).filter(Boolean))
}

// Strip built-ins that have been overridden by an edited version
function _g43B(arr) {
  const ov = _g43Overridden()
  return ov.size ? arr.filter(t => !ov.has(t.name)) : arr
}

// Published levels → pool templates (data becomes a gen() fn)
function _g43Custom(diff, score) {
  return _g43CustomAll().filter(l => {
    if (l.diff !== diff || !Array.isArray(l.keyframes)) return false
    if (score == null) return true
    if ((l.minScore ?? 0) > score) return false
    if ((l.maxScore ?? 0) > 0 && score > l.maxScore) return false
    return true
  }).map(l => ({
    name:l.name, diff:l.diff, speed:l.speed, custom:true,
    weight: l.weight ?? 1, miniWave: !!l.miniWave,
    gen(h) {
      return {
        clearAt: l.clearAt,
        keyframes: l.keyframes.map(k => ({ at:k.at, cf:k.cf, gapH:k.gapHf * h })),
        deco: l.deco || [],
      }
    },
  }))
}

// All custom levels eligible at this score, any tier
function _g43CustomEligible(score) {
  const out = []
  for (const d of ['easy','medium','hard','extreme','fp','dc','boss']) {
    out.push(..._g43Custom(d, score))
  }
  return out
}

// Weighted random pick — weight 1 is normal, 3 is 3× as likely
function _g43Pick(pool) {
  if (!pool.length) return null
  const total = pool.reduce((s, t) => s + (t.weight ?? 1), 0)
  if (total <= 0) return pool[qRandInt(pool.length)]
  let r = (qRandInt(10000) / 10000) * total
  for (const t of pool) {
    r -= (t.weight ?? 1)
    if (r <= 0) return t
  }
  return pool[pool.length - 1]
}

function _g43GetPool(score) {
  const {easy,medium,hard,extreme,fp,dc} = G43_POOL
  const B = _g43B
  let builtins
  if      (score < 3)  builtins = [...B(easy)]
  else if (score < 5)  builtins = [...B(easy), ...B(medium)]
  else if (score < 9)  builtins = [...B(medium), ...B(hard), ...B([extreme[0]])]
  else if (score < 13) builtins = [...B(hard), ...B(extreme)]
  // Spread the whole dc tier, not dc[0] — a hardcoded index meant any
  // boss level added after PURGATORY could never be picked.
  else if (score < 17) builtins = [...B(extreme), ...B(dc)]
  else                 builtins = [...B(dc), ...B(fp)]
  return [...builtins, ..._g43CustomEligible(score)]
}

function _g43LoadChallenge(w, h) {
  let pool
  if (G43.testLevel) {
    pool = [G43.testLevel]
  } else if (G43.practice && G43.practiceDiff) {
    // Practice ignores score gates so every level in the tier is reachable
    pool = [..._g43B(G43_POOL[G43.practiceDiff] || G43_POOL.easy), ..._g43Custom(G43.practiceDiff, null)]
    if (G43.practiceLevel) {
      const one = pool.filter(t => t.name === G43.practiceLevel)
      if (one.length) pool = one
    }
  } else {
    pool = _g43GetPool(G43.score)
  }
  if (!pool.length) pool = [...G43_POOL.easy]
  const tmpl        = _g43Pick(pool)
  G43.challenge     = { ...tmpl }
  G43.waveR         = tmpl.miniWave ? G43_WAVE_R_MINI : G43_WAVE_R_NRM
  const kfData      = tmpl.gen(h)
  G43.keyframes     = kfData.keyframes
  G43.clearAt       = kfData.clearAt
  G43.deco          = kfData.deco || []
  // Portals: { at, cf, toAt, toCf, mouth }. You have to fly through the
  // mouth — an opening of `mouth` of the height, centred on cf — and you
  // come out at the other end, which can be anywhere: a different column,
  // a different height, or both. Same column means a pure vertical hop.
  // A level with portals is a variant, not the everyday version: the roll
  // happens here, once, so the corridor and the bot plan agree about which
  // one is being played. Test play always gets them, or you could never see
  // the thing you just authored.
  const wantPortals = kfData.portals && kfData.portals.length &&
    (G43.testLevel ? true : qRandInt(100) < Math.round((kfData.portalChance ?? 0.35) * 100))
  G43.portals       = wantPortals ? kfData.portals.map(p => ({
    at: p.at, cf: p.cf ?? 0.5,
    toAt: p.toAt ?? p.at, toCf: p.toCf ?? 0.5,
    mouth: p.mouth ?? 0.24,
  })) : []
  // So the announce screen can say which version turned up
  if (G43.challenge) G43.challenge.hasPortal = !!wantPortals
  G43.portalCool    = 0
  G43.laps          = 0
  G43.scrollX       = 0
  G43.trail         = []
  G43.phase         = 'announce'
  G43.announceT     = 0
  G43.wy            = h / 2
  G43.wvy           = G43_WAVE_SPD
  G43.hitFlash      = 0
  G43.attempts      = 0
  G43.fullTrail     = []
  G43.bot           = null
  G43.botPending    = G43.botMode
  G43.taps          = 0
  G43.retrying      = false
  G43.retryT        = 0
  if (G43.multi) {
    G43.p2wy = h / 2; G43.p2wvy = G43_WAVE_SPD; G43.p2holding = false; G43.p2trail = []
  }
  if (G43_roomCode && G43_isHost) G43_pendingSyncChallenge = _g43SerializeChallenge(h)
}

// Linearly interpolated corridor shape at a given column offset
function _g43WallAt(col, h) {
  const kfs = G43.keyframes
  if (!kfs || kfs.length === 0) return { cy:h/2, gapH:h*0.6 }
  if (col <= kfs[0].at)         return { cy:kfs[0].cf*h, gapH:kfs[0].gapH }
  const last = kfs[kfs.length-1]
  if (col >= last.at)           return { cy:last.cf*h, gapH:last.gapH }
  for (let i = 1; i < kfs.length; i++) {
    if (col <= kfs[i].at) {
      const span = kfs[i].at - kfs[i-1].at
      const t    = span > 0 ? (col - kfs[i-1].at) / span : 1
      return {
        cy:   (kfs[i-1].cf   + (kfs[i].cf   - kfs[i-1].cf)   * t) * h,
        gapH:  kfs[i-1].gapH + (kfs[i].gapH - kfs[i-1].gapH) * t,
      }
    }
  }
  return { cy:last.cf*h, gapH:last.gapH }
}

function _g43Loop(ts) {
  if (!G43.active) return
  let dt = Math.min((ts - G43.lastTime) / 1000, 0.05)
  G43.lastTime = ts
  // Speedhack dilates time, so the corridor and the wave scale together
  // and the level's geometry — and its difficulty — are unchanged.
  if (G43.practice && G43_cheat.on) dt *= G43_cheat.mul
  const c = _g43C(), w = c.width, h = c.height
  const WR = G43.waveR

  // The clear card freezes the run. Without this the next challenge
  // loaded and started playing behind the picture, so dismissing it
  // dropped you into a level already in progress.
  if (G43.paused) {
    _g43Draw(c.getContext('2d'), w, h)
    G43.raf = requestAnimationFrame(_g43Loop)
    return
  }

  if (G43.retrying) {
    G43.retryT += dt
    if (G43.shake    > 0) G43.shake    = Math.max(0, G43.shake    - dt * 4)
    if (G43.hitFlash > 0) G43.hitFlash = Math.max(0, G43.hitFlash - dt)
  if (G43.portalFlash > 0) G43.portalFlash = Math.max(0, G43.portalFlash - dt)
    if (G43.retryT >= G43_RETRY_WAIT) _g43RetryNow()
    _g43Draw(c.getContext('2d'), w, h)
    G43.raf = requestAnimationFrame(_g43Loop)
    return
  }

  G43.t += dt                       // drives deco motion tracks
  if (G43.shake    > 0) G43.shake    = Math.max(0, G43.shake    - dt * 4)
  if (G43.hitFlash > 0) G43.hitFlash = Math.max(0, G43.hitFlash - dt)

  // Autopilot. Rather than replaying the solved inputs blindly, it steers
  // towards the height the ideal line sits at and corrects every frame.
  //
  // Blind replay only works if the game's timing matches the solver's
  // exactly. It doesn't: positions are quantised, frame times vary, and a
  // 120Hz screen takes two frames per solved step. Any of that puts the
  // wave somewhere the rest of the plan doesn't expect, and the error
  // compounds. Tracking the path instead means drift is corrected on the
  // next frame instead of accumulating.
  // Plan on the first playing frame, once the real frame time is known
  if (G43.botPending && G43.phase === 'playing' && typeof lcSolveLineSafe === 'function') {
    G43.botPending = false
    // Plan on the simulation clock — the same one playback runs on
    const solved = lcSolveLineSafe({
      speed: G43.challenge.speed, clearAt: G43.clearAt,
      keyframes: G43.keyframes.map(k => ({ at:k.at, cf:k.cf, gapHf:k.gapH / h })),
    }, h, G43_SIM_DT, !!G43.evil)
    if (solved.ok) {
      G43.bot = { ys: solved.ys, idx: 0, taps: solved.taps, margin: solved.margin, dt: solved.dt }
    }
  }

  // Index by scroll, not elapsed time. The solver pairs each target
  // height with the column it applies to, and the game tests collision
  // at its own scroll position — at 120Hz those drift half a step apart
  // and the wave aims for the corridor as it was 25 columns ago.
  const _botAim = () => {
    if (!G43.bot || G43.phase !== 'playing') return
    const step = (G43.challenge.speed || 200) * G43.bot.dt
    const i = Math.min(G43.bot.ys.length - 1,
                       Math.max(0, Math.round(G43.scrollX / step)))
    G43.bot.idx = i
    // hold sends the wave up, release sends it down
    const want = G43.wy > G43.bot.ys[i]
    if (want && !G43.holding) SFX.tap()   // the bot's presses are audible too
    G43.holding = want
  }

  const waveStep = (doClamp, sdt = dt) => {
    G43.wvy = G43.holding ? -G43_WAVE_SPD : G43_WAVE_SPD
    G43.wy += G43.wvy * sdt
    if (doClamp) G43.wy = Math.max(WR + 2, Math.min(h - WR - 2, G43.wy))
    if (G43.multi) {
      G43.p2wvy = G43.p2holding ? -G43_WAVE_SPD : G43_WAVE_SPD
      G43.p2wy += G43.p2wvy * sdt
      if (doClamp) G43.p2wy = Math.max(WR + 2, Math.min(h - WR - 2, G43.p2wy))
    }
  }

  // One simulation step. Split out so bot mode can run it on a fixed
  // timestep instead of the display's variable frame time.
  const _g43PlayStep = (sdt) => {
    _botAim()
    waveStep(true, sdt)
    G43.scrollX += G43.challenge.speed * sdt

    // Store the world column, not the canvas x — every point used to share
    // the wave's fixed x, so the "trail" was a vertical smear rather than a
    // streak running back behind it.
    G43.trail.push({ sx: G43.scrollX, y: G43.wy })
    if (G43.trail.length > 140) G43.trail.shift()
    // Practice keeps the entire path so a clear can be drawn as one picture
    if (G43.practice) {
      const ft = G43.fullTrail
      if (!ft.length || G43.scrollX - ft[ft.length-1].sx >= 2) ft.push({ sx:G43.scrollX, y:G43.wy })
    }
    if (G43.multi) {
      G43.p2trail.push({ sx: G43.scrollX, y: G43.p2wy })
      if (G43.p2trail.length > 140) G43.p2trail.shift()
    }

    // Portals. You only go through if you actually hit the mouth, so a
    // portal is something to aim for rather than something that happens to
    // you. Checked after the scroll advances and before collision, so the
    // wall tested is the one where you came out.
    if (G43.portalCool > 0) G43.portalCool -= G43.challenge.speed * sdt
    if (G43.portals && G43.portals.length && G43.portalCool <= 0) {
      for (const p of G43.portals) {
        if (Math.abs(G43.scrollX - p.at) > G43.challenge.speed * sdt) continue
        // You have to be inside the mouth. A portal with mouth >= 1 spans the
        // whole screen and so cannot be dodged; anything less can be flown past.
        const half = Math.min(1, p.mouth) * h / 2
        if (Math.abs(G43.wy - p.cf * h) > half) continue
        // A portal that sends you back up the level is a lap, not a skip —
        // practice never scores, so without counting these a loop level had
        // nothing at all to show for going round again.
        if (p.toAt < p.at) {
          G43.laps = (G43.laps || 0) + 1
          // Practice leaves the badge as a dash because it never scores, so a
          // lap level had no visible tally anywhere. Show the laps there.
          const hud = document.getElementById('g43-score-hud')
          if (hud && G43.practice) hud.textContent = '\u21ba ' + G43.laps
        }
        G43.scrollX = p.toAt
        G43.wy = Math.max(WR + 2, Math.min(h - WR - 2, p.toCf * h))
        G43.portalFlash = 0.3
        G43.portalCool = 40      // columns of grace, so the far end can't re-fire
        if (G43.multi) G43.p2wy = G43.wy
        SFX.powerup()
        break
      }
    }

    const wall    = _g43WallAt(Math.floor(G43.scrollX), h)
    // A level can be authored with corridor outside the canvas. Clamping the
    // *walls* to the screen (what this used to do) made the screen edge
    // itself lethal: fly above y=0 where the corridor is wide open and you
    // died on nothing. Clamp the *wave* instead — it simply cannot leave the
    // view — and test it against the real corridor. Now going too high or
    // too low pins you at the edge, and you only ever die on a wall you can
    // actually see.
    const topWall = wall.cy - wall.gapH / 2
    const botWall = wall.cy + wall.gapH / 2
    const hit     = G43.wy - WR < topWall || G43.wy + WR > botWall
    // In online mode, P2 collision is checked on their own device
    const hit2    = G43.multi && !G43_roomCode && (G43.p2wy - WR < topWall || G43.p2wy + WR > botWall)

    if (hit || hit2) {
      if (G43.noclip) {
        if (G43.hitFlash <= 0) {
          G43.hitFlash = 0.22
          // A bump, not a death. This used to play the death sound and
          // flash red, which is indistinguishable from actually dying —
          // so noclip looked broken even though it was working.
          SFX.bounce()
        }
        G43.wy = Math.max(WR + 2, Math.min(h - WR - 2, G43.wy))
        if (G43.multi && !G43_roomCode) G43.p2wy = Math.max(WR + 2, Math.min(h - WR - 2, G43.p2wy))
      } else {
        _g43Die()
      }
    }

    if (G43.scrollX >= G43.clearAt) {
      G43.phase    = 'cleared'
      G43.clearedT = 0
      if (G43.practice) _g43TrailCard()
      if (!G43.practice) {
        G43.score++
        window._g43Score = G43.score
        document.getElementById('g43-score-hud').textContent = G43.score
      }
      SFX.win()
    }
  }

  if (G43.phase === 'waiting') {
    // Online joiner: waiting for host to send first challenge
    waveStep(true)
    if (G43_pendingNetChallenge) {
      _g43ApplyNetChallenge(G43_pendingNetChallenge, h)
      G43_pendingNetChallenge = null
    }

  } else if (G43.phase === 'announce') {
    G43.announceT += dt
    if (G43.announceT >= 0.9) G43.phase = 'playing'

  } else if (G43.phase === 'playing') {
    // Fixed timestep: the display's frame time never reaches the physics, so
    // the level plays identically at 60, 144 or 240Hz and a stutter can't
    // shift which columns get tested.
    //
    // Still beta-only for normal play — it changes the feel of every
    // single-player run, so main keeps the display-driven step until this
    // has been played in properly. The bot always uses the fixed clock
    // regardless: its plan is solved on that clock, and replaying it against
    // a variable frame time is exactly what made it fly into walls.
    if (G43.bot || window.QG_BETA) {
      G43.simAcc = (G43.simAcc || 0) + dt
      let steps = 0
      while (G43.simAcc >= G43_SIM_DT && steps < G43_MAX_STEPS && G43.phase === 'playing') {
        G43.simAcc -= G43_SIM_DT
        steps++
        _g43PlayStep(G43_SIM_DT)
      }
      // After a stall, drop the backlog rather than fast-forwarding into a wall
      if (steps >= G43_MAX_STEPS) G43.simAcc = 0
    } else {
      _g43PlayStep(dt)
    }

  } else if (G43.phase === 'cleared') {
    G43.clearedT += dt
    waveStep(true)
    if (G43.clearedT >= 0.75) {
      if (!G43_roomCode || G43_isHost) {
        _g43LoadChallenge(w, h)
      } else if (G43_pendingNetChallenge) {
        _g43ApplyNetChallenge(G43_pendingNetChallenge, h)
        G43_pendingNetChallenge = null
      }
    }

  } else if (G43.phase === 'dead') {
    G43.deadT += dt
    G43.wvy = G43_WAVE_SPD; G43.wy += G43.wvy * dt
    if (G43.multi) { G43.p2wvy = G43_WAVE_SPD; G43.p2wy += G43.p2wvy * dt }
    if (G43.deadT >= 1.8 && !G43.showOver) {
      G43.showOver     = true
      window._g43Score = G43.score
      document.getElementById('g43-final-score').textContent =
        `${G43.score} clear${G43.score !== 1 ? 's' : ''}`
      document.getElementById('g43-over').style.display = 'flex'
    }
  }

  // Network state sync (both host and joiner emit their wave position ~20/s)
  if (G43_roomCode && G43.phase !== 'dead') {
    if (ts - G43_lastNetSync >= 50) {
      G43_lastNetSync = ts
      const state = { wy: G43.wy, wvy: G43.wvy }
      if (G43_pendingSyncChallenge) {
        state.challenge = G43_pendingSyncChallenge
        G43_pendingSyncChallenge = null
      }
      mpGetSocket().emit('state-sync', { code: G43_roomCode, state })
    }
  }

  _g43Draw(c.getContext('2d'), w, h)
  if (G43.showOver) { G43.active = false; return }
  G43.raf = requestAnimationFrame(_g43Loop)
}

function _g43Die() {
  if (G43.phase === 'dead') return
  if (G43.retrying) return   // already mid-retry; don't double-count

  // Practice restarts the same attempt straight away — no game-over card
  // to click through when you're drilling one section.
  if (G43.practice) {
    // Hold on the death for a beat so you can see where it went wrong.
    // _g43RetryNow does the actual reset once the timer runs out.
    G43.attempts = (G43.attempts || 0) + 1
    G43.retrying = true
    G43.retryT   = 0
    G43.holding  = false
    G43.shake    = 0.9
    G43.hitFlash = 0.55
    SFX.die()
    return
  }

  G43.phase = 'dead'; G43.deadT = 0; G43.shake = 1
  SFX.die()
  window.removeEventListener('keydown', _g43KeyDn)
  window.removeEventListener('keyup',   _g43KeyUp)
  if (G43_roomCode) {
    mpGetSocket().emit('player-died', { code: G43_roomCode, score: G43.score })
    const s = mpGetSocket(); s.off('opponent-state'); s.off('force-end')
    G43_roomCode = null
  }
}

function _g43RetryNow() {
  const c = _g43C()
  // Re-plan on a retry: the frame rate may have changed, and a fresh plan
  // costs nothing next to the 0.45s death hold
  if (G43.botMode) { G43.bot = null; G43.botPending = true }
  G43.retrying  = false
  G43.retryT    = 0
  G43.laps      = 0
  G43.scrollX   = 0
  G43.wy        = c.height / 2
  G43.wvy       = G43_WAVE_SPD
  G43.holding   = false
  G43.trail     = []
  G43.fullTrail = []
  G43.taps      = 0
}

// ── Clear card ───────────────────────────────────────
// The whole level drawn end to end with the line you actually took
// through it. Practice only — it needs the full path.

function _g43TrailCard() {
  const src = _g43C()
  if (!src || G43.fullTrail.length < 2) return
  const H = src.height
  const cols = Math.max(1, G43.clearAt)
  const W = Math.round(Math.min(2400, Math.max(900, cols)))
  const sx = W / cols

  const cv = document.createElement('canvas')
  cv.width = W; cv.height = H + 46
  const g = cv.getContext('2d')
  const col = G43_DIFF_COL[G43.challenge.diff] || '#22c55e'
  const top = 46

  g.fillStyle = '#05010a'; g.fillRect(0, 0, W, H + top)

  // Corridor across the whole level
  const step = Math.max(1, Math.round(cols / W))
  const wallPath = (which) => {
    g.beginPath()
    for (let c = 0, i = 0; c <= cols; c += step, i++) {
      const wl = _g43WallAt(c, H)
      const y = top + (which === 'top' ? wl.cy - wl.gapH/2 : wl.cy + wl.gapH/2)
      i === 0 ? g.moveTo(c*sx, y) : g.lineTo(c*sx, y)
    }
  }
  g.beginPath()
  for (let c = 0, i = 0; c <= cols; c += step, i++) {
    const wl = _g43WallAt(c, H)
    const y = top + wl.cy - wl.gapH/2
    i === 0 ? g.moveTo(c*sx, y) : g.lineTo(c*sx, y)
  }
  for (let c = cols; c >= 0; c -= step) {
    const wl = _g43WallAt(c, H)
    g.lineTo(c*sx, top + wl.cy + wl.gapH/2)
  }
  g.closePath()
  g.fillStyle = col + '14'; g.fill()

  g.strokeStyle = col; g.lineWidth = 1.6
  g.shadowColor = col; g.shadowBlur = 6
  wallPath('top'); g.stroke()
  wallPath('bot'); g.stroke()
  g.shadowBlur = 0

  // The line you took
  const pts = G43.fullTrail.map(p => ({ x: p.sx * sx, y: top + p.y }))
  const stroke = () => {
    g.beginPath(); g.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y)
    g.stroke()
  }
  g.lineJoin = 'round'; g.lineCap = 'round'
  g.shadowColor = '#4ade80'; g.shadowBlur = 12
  g.strokeStyle = 'rgba(74,222,128,0.30)'; g.lineWidth = 6; stroke()
  g.shadowBlur = 7
  g.strokeStyle = '#4ade80'; g.lineWidth = 2; stroke()
  g.shadowBlur = 0

  // Caption
  g.textAlign = 'left'
  g.font = 'bold 20px monospace'; g.fillStyle = '#fff'
  g.fillText(G43.challenge.name, 16, 30)
  g.font = '12px monospace'; g.fillStyle = col
  g.fillText(G43.challenge.diff.toUpperCase(), 18 + g.measureText(G43.challenge.name).width + 90, 30)
  g.textAlign = 'right'
  g.fillStyle = 'rgba(255,255,255,0.45)'; g.font = '12px monospace'
  const att = G43.attempts ? `${G43.attempts + 1} attempts` : 'first try'
  const laps = G43.laps ? `${G43.laps + 1} laps  ·  ` : ''
  const secs = G43.clearAt / G43.challenge.speed
  const rate = secs > 0 ? (G43.taps / secs).toFixed(1) : '0'
  g.fillText(`${laps}${G43.taps} taps (${rate}/s)  ·  ${att}  ·  ${secs.toFixed(1)}s  ·  Wave Gauntlet`,
             W - 16, 30)

  _g43ShowCard(cv)
}

function _g43ShowCard(cv) {
  const wrap = document.getElementById('g43-card')
  const img  = document.getElementById('g43-card-img')
  if (!wrap || !img) return
  try { img.src = cv.toDataURL('image/png') } catch { return }
  wrap.dataset.name = (G43.challenge.name || 'run').toLowerCase().replace(/[^a-z0-9]+/g, '-')
  wrap.style.display = 'flex'
  G43.paused = true
}

// Dismissing the card starts the next attempt from a standing start,
// rather than resuming a run that carried on without you.
window.g43CloseCard = function() {
  const wrap = document.getElementById('g43-card')
  if (wrap) wrap.style.display = 'none'
  if (!G43.active || !G43.paused) return
  G43.paused   = false
  G43.holding  = false
  G43.lastTime = performance.now()
  const c = _g43C()
  _g43LoadChallenge(c.width, c.height)
}

window.g43SaveCard = function() {
  const img  = document.getElementById('g43-card-img')
  const wrap = document.getElementById('g43-card')
  if (!img || !img.src) return
  const a = document.createElement('a')
  a.href = img.src
  a.download = (wrap.dataset.name || 'run') + '-clear.png'
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
}

// ── draw ─────────────────────────────────────────────────

function _g43Draw(ctx, w, h) {
  ctx.save()
  if (G43.shake > 0) {
    const s = G43.shake * 7
    ctx.translate((Math.random()-.5)*s, (Math.random()-.5)*s)
  }

  const ch      = G43.challenge
  const mainCol = ch ? (G43_DIFF_COL[ch.diff] || '#22c55e') : '#22c55e'
  const waveX   = Math.round(w * 0.22)
  const scrollI = Math.floor(G43.scrollX)

  // Background. No CSS variable reaches a canvas, so the theme is read
  // directly — otherwise a light page opened into a black arena.
  const _lt = typeof qgLight === 'function' && qgLight()
  ctx.fillStyle = _lt ? (ch?.isDC ? '#fdeeee' : '#e9f3ef')
                      : (ch?.isDC ? '#0a0101' : '#01080a')
  ctx.fillRect(-12, -12, w+24, h+24)

  // Faint grid
  ctx.strokeStyle = _lt ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.018)'
  ctx.lineWidth   = 1
  for (let y = 0; y < h; y += 28) {
    ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke()
  }

  // Deco sits behind the corridor so it can never read as a wall
  if (typeof drawDeco === 'function') drawDeco(ctx, G43.deco, w, h, scrollI, waveX, { time: G43.t })

  // ── Corridor walls ───────────────────────────────────
  // Path sampled every G43_DRAW_STEP px.
  // Linear keyframe interpolation creates angular slopes automatically.
  // Near-black walls against a near-white corridor read as an inkblot, so
  // light mode uses a deep tone rather than true black — still obviously
  // solid, but it lets the glowing corridor edge stay the loudest thing.
  ctx.fillStyle = _lt ? (ch?.isDC ? '#3d1f22' : '#1b4438')
                      : (ch?.isDC ? '#0e0000' : '#001408')

  // Cache wall lookups (ci = actual count after loop)
  const wallCache = []
  for (let x = 0; x <= w + G43_DRAW_STEP; x += G43_DRAW_STEP) {
    wallCache.push(_g43WallAt(scrollI + x - waveX, h))
  }
  const wc = wallCache.length

  // Top wall
  ctx.beginPath(); ctx.moveTo(-1, -1)
  for (let i = 0; i < wc; i++) {
    ctx.lineTo(i * G43_DRAW_STEP, wallCache[i].cy - wallCache[i].gapH / 2)
  }
  ctx.lineTo(w+1, -1); ctx.closePath(); ctx.fill()

  // Bottom wall
  ctx.beginPath(); ctx.moveTo(-1, h+1)
  for (let i = 0; i < wc; i++) {
    ctx.lineTo(i * G43_DRAW_STEP, wallCache[i].cy + wallCache[i].gapH / 2)
  }
  ctx.lineTo(w+1, h+1); ctx.closePath(); ctx.fill()

  // Top inner edge (glowing line — shows the slope geometry)
  ctx.beginPath()
  for (let i = 0; i < wc; i++) {
    const x = i * G43_DRAW_STEP
    const y = wallCache[i].cy - wallCache[i].gapH / 2
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
  }
  ctx.strokeStyle = mainCol; ctx.lineWidth = 1.8
  ctx.shadowColor = mainCol; ctx.shadowBlur = 10
  ctx.stroke(); ctx.shadowBlur = 0

  // Bottom inner edge
  ctx.beginPath()
  for (let i = 0; i < wc; i++) {
    const x = i * G43_DRAW_STEP
    const y = wallCache[i].cy + wallCache[i].gapH / 2
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
  }
  ctx.strokeStyle = mainCol; ctx.lineWidth = 1.8
  ctx.shadowColor = mainCol; ctx.shadowBlur = 10
  ctx.stroke(); ctx.shadowBlur = 0

  // ── Wave trails ──────────────────────────────────────
  // Same look as Wave Dash: one wide translucent pass for the glow,
  // one thin bright pass on top, both as a single continuous stroke.
  const _drawTrail = (trail, col) => {
    if (trail.length < 2) return
    const pts = []
    for (const p of trail) {
      const x = waveX - (G43.scrollX - p.sx)
      if (x >= -6) pts.push({ x, y: p.y })
    }
    if (pts.length < 2) return
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'
    const stroke = () => {
      ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y)
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
      ctx.stroke()
    }
    ctx.shadowColor = col; ctx.shadowBlur = 10
    ctx.lineWidth = 5; ctx.globalAlpha = 0.25; ctx.strokeStyle = col
    stroke()
    ctx.shadowBlur = 6; ctx.lineWidth = 2; ctx.globalAlpha = 0.95
    stroke()
    ctx.shadowBlur = 0; ctx.globalAlpha = 1
  }
  _drawTrail(G43.trail, mainCol)
  if (G43.multi) _drawTrail(G43.p2trail, '#38bdf8')

  // ── Wave characters ──────────────────────────────────
  const wAlpha = G43.phase === 'dead' ? Math.max(0, 1 - G43.deadT * 2.2) : 1
  ctx.globalAlpha = wAlpha
  _g43DrawWave(ctx, waveX, G43.wy,   G43.waveR, mainCol,  G43.wvy)
  if (G43.multi) _g43DrawWave(ctx, waveX, G43.p2wy, G43.waveR, '#38bdf8', G43.p2wvy)
  ctx.globalAlpha = 1

  // Noclip hit flash
  if (G43.noclip && G43.hitFlash > 0) {
    ctx.fillStyle = `rgba(239,68,68,${Math.min(0.28, G43.hitFlash * 1.8)})`
    ctx.fillRect(0, 0, w, h)
  }

  // Score / mode indicator
  ctx.textAlign = 'center'
  if (G43.practice) {
    ctx.font = 'bold 11px monospace'
    ctx.fillStyle = _lt ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.4)'
    ctx.fillText((G43.noclip ? 'PRACTICE · NOCLIP' : 'PRACTICE') +
                 (G43.practiceDiff ? ' — ' + G43.practiceDiff.toUpperCase() : '') +
                 (G43.attempts ? '   att ' + G43.attempts : '') +
                 (G43.laps ? '   LAP ' + (G43.laps + 1) : '') +
                 (G43.taps ? '   taps ' + G43.taps : '') +
                 (G43.bot ? '   \ud83e\udd16 BOT ' + G43.bot.taps + ' taps'
                          : (G43.botMode ? '   \ud83e\udd16 NO BOT LINE HERE' : '')), w/2, 18)
    if (G43_cheat.on) {
      ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 11px monospace'
      ctx.fillText(G43_cheat.label(), w/2, 32)
    }
  } else {
    ctx.font = 'bold 26px monospace'
    ctx.fillStyle = _lt ? 'rgba(0,0,0,0.86)' : 'rgba(255,255,255,0.92)'
    ctx.shadowColor = mainCol; ctx.shadowBlur = 16
    ctx.fillText(G43.score, w/2, 42); ctx.shadowBlur = 0
    if (G43.multi) {
      ctx.font = 'bold 10px monospace'
      ctx.fillStyle = mainCol;   ctx.fillText('P1 ●', w/2 - 22, 58)
      ctx.fillStyle = '#38bdf8'; ctx.fillText('● P2', w/2 + 22, 58)
    }
  }

  // Portals — the mouth you fly into, and the mouth you come out of
  const _mouth = (px, cy, half, col, solid) => {
    ctx.save()
    ctx.strokeStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 12
    ctx.lineWidth = 3
    ctx.beginPath(); ctx.ellipse(px, cy, 7, half, 0, 0, Math.PI * 2); ctx.stroke()
    ctx.globalAlpha = 0.22
    ctx.fillStyle = col; ctx.fill()
    ctx.globalAlpha = 1; ctx.shadowBlur = 0
    // lips, so the opening reads as a gap you aim for
    ctx.lineWidth = 4
    ctx.beginPath(); ctx.moveTo(px - 9, cy - half); ctx.lineTo(px + 9, cy - half); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(px - 9, cy + half); ctx.lineTo(px + 9, cy + half); ctx.stroke()
    ctx.restore()
  }
  for (const p of (G43.portals || [])) {
    const half = p.mouth * h / 2
    const ax = waveX + (p.at - G43.scrollX)
    const bx = waveX + (p.toAt - G43.scrollX)
    if (ax > -30 && ax < w + 30) _mouth(ax, p.cf * h, half, '#38bdf8')
    if (bx > -30 && bx < w + 30) _mouth(bx, p.toCf * h, half, '#f97316')
    // a hint of where it goes, when both ends are on screen
    if (ax > -30 && ax < w + 30 && bx > -30 && bx < w + 30) {
      ctx.save(); ctx.globalAlpha = 0.35; ctx.setLineDash([4, 6])
      ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(ax, p.cf * h); ctx.lineTo(bx, p.toCf * h); ctx.stroke()
      ctx.setLineDash([]); ctx.restore()
    }
  }
  if (G43.portalFlash > 0) {
    ctx.fillStyle = `rgba(56,189,248,${Math.min(0.3, G43.portalFlash)})`
    ctx.fillRect(0, 0, w, h)
  }

  // Finish line
  if (G43.clearAt) _g43DrawFinish(ctx, waveX + (G43.clearAt - G43.scrollX), h)

  // Noclip bump: name it, so it cannot read as a death
  if (G43.noclip && G43.hitFlash > 0) {
    ctx.globalAlpha = Math.min(1, G43.hitFlash * 4)
    ctx.textAlign = 'center'
    ctx.font = 'bold 13px monospace'
    ctx.fillStyle = '#fbbf24'
    ctx.fillText('BLOCKED — noclip is on, you did not die', w / 2, h - 16)
    ctx.globalAlpha = 1
  }

  // ── Announce overlay ─────────────────────────────────
  if (G43.phase === 'announce' && ch) {
    const a = Math.min(1, G43.announceT * 7)
    ctx.globalAlpha = a
    ctx.fillStyle = _lt ? 'rgba(255,255,255,0.62)' : 'rgba(0,0,0,0.55)'; ctx.fillRect(0,0,w,h)
    ctx.textAlign = 'center'
    ctx.font = 'bold 12px monospace'
    ctx.fillStyle = mainCol; ctx.shadowColor = mainCol; ctx.shadowBlur = 12
    ctx.fillText(ch.diff.toUpperCase() + (ch.hasPortal ? '  \u00b7  PORTAL' : ''), w/2, h/2 - 50)
    ctx.font = `bold ${ch.isDC ? 20 : ch.isFP ? 22 : 28}px monospace`
    ctx.fillStyle = ch.isDC ? '#fca5a5' : ch.isFP ? '#e9d5ff' : '#fff'
    ctx.shadowColor = mainCol; ctx.shadowBlur = 22
    ctx.fillText(ch.name, w/2, h/2 - 12); ctx.shadowBlur = 0
    ctx.font = '12px monospace'; ctx.fillStyle = 'rgba(255,255,255,0.36)'
    if (G43.multi && G43_roomCode) {
      ctx.fillStyle = mainCol; ctx.fillText('SPACE / click to fly up', w/2, h/2 + 16)
      ctx.fillStyle = '#38bdf8'; ctx.fillText('Opponent online', w/2, h/2 + 34)
    } else if (G43.multi) {
      ctx.fillStyle = mainCol; ctx.fillText('P1: SPACE / click', w/2, h/2 + 16)
      ctx.fillStyle = '#38bdf8'; ctx.fillText('P2: ↑ arrow key',  w/2, h/2 + 34)
    } else {
      ctx.fillText('hold SPACE / click to fly up', w/2, h/2 + 18)
    }
    if (ch.isFP) {
      ctx.font = '11px monospace'
      ctx.fillStyle = 'rgba(216,180,254,0.75)'; ctx.shadowColor='#a855f7'; ctx.shadowBlur=6
      ctx.fillText('⚡ wall slams — be at the right height when it hits', w/2, h/2+38); ctx.shadowBlur=0
    } else if (ch.isDC) {
      ctx.font = '11px monospace'
      ctx.fillStyle = 'rgba(252,165,165,0.75)'; ctx.shadowColor='#ef4444'; ctx.shadowBlur=6
      ctx.fillText('⚡ mini wave · 5 slams · max speed', w/2, h/2+38); ctx.shadowBlur=0
    } else if (ch.diff === 'extreme') {
      ctx.font = '11px monospace'
      ctx.fillStyle = 'rgba(251,146,60,.75)'; ctx.shadowColor='#fb923c'; ctx.shadowBlur=6
      ctx.fillText('⚡ tight gaps — stay centered', w/2, h/2+38); ctx.shadowBlur=0
    } else if (ch.diff === 'boss') {
      ctx.font = '11px monospace'
      ctx.fillStyle = 'rgba(239,68,68,.85)'; ctx.shadowColor='#ef4444'; ctx.shadowBlur=8
      ctx.fillText('⚡ spam to survive — two rounds', w/2, h/2+38); ctx.shadowBlur=0
    }
    if (G43.practice) {
      ctx.font='11px monospace'; ctx.fillStyle='rgba(255,255,255,0.30)'
      ctx.fillText(G43.noclip ? "noclip — walls won't kill you"
                              : "practice — walls kill, but nothing is scored", w/2, h/2+58)
    }
    ctx.globalAlpha = 1
  }

  // ── Cleared overlay ──────────────────────────────────
  if (G43.phase === 'cleared') {
    const t = G43.clearedT
    const a = Math.min(1, t*8) * Math.max(0, 1 - (t - 0.25)*5.5)
    if (a > 0.01) {
      ctx.globalAlpha = a
      ctx.textAlign = 'center'; ctx.font = 'bold 36px monospace'
      ctx.fillStyle = '#4ade80'; ctx.shadowColor = '#22c55e'; ctx.shadowBlur = 30
      ctx.fillText('CLEARED!', w/2, h/2); ctx.shadowBlur = 0
      ctx.globalAlpha = 1
    }
  }

  // ── Waiting overlay (online joiner before first challenge arrives) ──
  if (G43.phase === 'waiting') {
    ctx.fillStyle = _lt ? 'rgba(255,255,255,0.62)' : 'rgba(0,0,0,0.55)'; ctx.fillRect(0,0,w,h)
    ctx.textAlign = 'center'; ctx.font = 'bold 14px monospace'
    ctx.fillStyle = 'rgba(255,255,255,0.6)'
    ctx.fillText('Waiting for host…', w/2, h/2)
  }

  ctx.restore()
}

function _g43DrawWave(ctx, x, y, R, col, wvy) {
  const tilt = (wvy ?? G43.wvy) < 0 ? -Math.PI*0.25 : Math.PI*0.25
  ctx.save()
  ctx.translate(x, y); ctx.rotate(tilt)
  ctx.beginPath(); ctx.arc(0, 0, R*2.6, 0, Math.PI*2)
  ctx.fillStyle = col+'18'; ctx.fill()
  ctx.beginPath()
  ctx.moveTo( R*1.5,  0)
  ctx.lineTo(-R*1.0, -R*0.78)
  ctx.lineTo(-R*0.35, 0)
  ctx.lineTo(-R*1.0,  R*0.78)
  ctx.closePath()
  ctx.fillStyle = '#fff'; ctx.shadowColor = col; ctx.shadowBlur = 20
  ctx.fill()
  ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.stroke()
  ctx.shadowBlur = 0
  ctx.restore()
}

// evilbot: same line, most presses instead of fewest (practice only)
const game43_evilbot = (typeof makeEvilbot === 'function')
  ? makeEvilbot(() => cheatScreenActive('game43'), (on) => {
      G43.evil = on
      try { _g43BuildPracticeUI() } catch {}
    })
  : null

// A chequered band marking the finish, drawn at the clear column. Scrolls
// with the level like everything else, so it is genuinely the end line
// rather than an overlay that appears when you get there.
function _g43DrawFinish(ctx, x, h, cell) {
  if (x < -40 || x > 100000) return
  const c = cell || 13
  const cols = 2
  ctx.save()
  for (let r = 0; r * c < h + c; r++) {
    for (let q = 0; q < cols; q++) {
      ctx.fillStyle = ((r + q) % 2 === 0) ? 'rgba(255,255,255,0.92)' : 'rgba(10,10,14,0.92)'
      ctx.fillRect(x + q * c, r * c, c, c)
    }
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'
  ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.moveTo(x - 1, 0); ctx.lineTo(x - 1, h); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(x + cols * c + 1, 0); ctx.lineTo(x + cols * c + 1, h); ctx.stroke()
  ctx.restore()
}
