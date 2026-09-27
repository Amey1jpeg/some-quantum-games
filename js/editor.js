// ═══════════════════════════════════════════════════════
//  LEVEL EDITOR — Wave Gauntlet (43) + Spider (44)
//  Local dev tool (editor.html), never deployed. Drafts live in
//  localStorage; finished levels leave via "Copy as JS".
//  Undo/redo, a restorable trash, and revert-to-original are in
//  the "Restore" section.
//
//  Level data format (shared, resolution-independent):
//    wavegauntlet: { keyframes:[{at, cf, gapHf}], clearAt }
//    spider:       { obstacles:[{col, floor}],    clearAt }
//  cf and gapHf are fractions of canvas height, so a level
//  authored on one screen plays the same on another.
// ═══════════════════════════════════════════════════════

// The editor is public, but it has no auth and makes no network calls —
// everything lives in your own browser's localStorage. Nothing here can
// reach the server, so there is nothing to lock down.
//
// A level only goes live when Arham pastes it into the pools in
// js/game43.js / js/game44.js. Anyone can build and submit one; the
// commit is the gate.
const ED_LS_KEY  = 'qg_editor_drafts_v1'
const ED_SUB_KEY = 'qg_editor_inbox_v1'

// Public anon key, same one index.html already ships. Row-level security
// is what actually protects the table — this key only allows inserting a
// pending submission, never reading the queue.
const ED_SB_URL = 'https://kuvpxhuvednptyfqccea.supabase.co'
const ED_SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1dnB4aHV2ZWRucHR5ZnFjY2VhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4NjY4MTcsImV4cCI6MjA5MDQ0MjgxN30.tYb15AI3DfwSjYrYrLVUPhOJjh8tfAvglPGXmunEA4k'

const ED_DIFFS = {
  wavegauntlet: ['easy','medium','hard','extreme','fp','dc'],
  spider:       ['easy','medium','hard','extreme'],
  ufo:          ['easy','medium','hard','extreme'],
}
const ED_DIFF_COL = {
  easy:'#4ade80', medium:'#fbbf24', hard:'#f87171',
  extreme:'#fb923c', fp:'#c084fc', dc:'#ef4444', boss:'#ef4444',
}

// The built-in pools live in game43.js / game44.js as top-level consts
function _edBuiltins() {
  if (ED.game === 'wavegauntlet') return (typeof G43_POOL !== 'undefined') ? G43_POOL : {}
  if (ED.game === 'ufo')          return (typeof G40_POOL !== 'undefined') ? G40_POOL : {}
  return (typeof SPD_POOL !== 'undefined') ? SPD_POOL : {}
}

// Height to bake gen() against. Built-in gens mix fractions with pixel
// clamps, so using the real canvas height reproduces what actually plays.
function _edRefHeight() {
  const id = ED.game === 'wavegauntlet' ? 'g43-canvas'
           : ED.game === 'ufo'          ? 'g40-canvas' : 'spd-canvas'
  const c  = document.getElementById(id)
  return (c && c.height > 50) ? c.height
       : (c && c.parentElement && c.parentElement.clientHeight > 50) ? c.parentElement.clientHeight
       : 400
}

const ED = {
  game:'wavegauntlet',
  levels:[],            // drafts, from localStorage
  sel:-1,               // index into ED.levels
  drag:null,            // {type, i}
  evilBot:false,        // bot runs take the most presses instead of the fewest
  portalPend:null,      // first half of a portal, waiting for its exit
  portalSel:0,          // which portal the properties panel is editing
  scroll:0,             // horizontal scroll in columns
  zoom:1,               // px per column
  msg:'',
  undo:[], redo:[],     // full-state snapshots
  trash:[],             // deleted drafts, restorable
  inbox:[],             // pasted submissions awaiting review
  mode:'level',         // 'level' | 'deco' | 'stamp'
  stamp:null,           // id of the armed stamp preset
  decoSel:-1,           // index into lv.deco
  animate:false,        // preview deco motion in the editor
  testNoclip:true,      // Test Play with walls off by default
  decoType:'rect',      // shape placed on next click
  decoCol:1,            // colour index for new deco
}

// ── Undo / redo ───────────────────────────────────────
// Snapshots the whole draft list, so it covers edits, creates,
// deletes and imports uniformly. Call BEFORE mutating.

const ED_UNDO_MAX  = 60
const ED_TRASH_KEY = 'qg_editor_trash_v1'
const ED_TRASH_MAX = 30

function _edClone(x) { return JSON.parse(JSON.stringify(x)) }

function _edPush() {
  const snap = { levels:_edClone(ED.levels), sel:ED.sel }
  const prev = ED.undo[ED.undo.length - 1]
  // Skip if nothing actually changed since the last snapshot
  if (prev && JSON.stringify(prev.levels) === JSON.stringify(snap.levels)) return
  ED.undo.push(snap)
  if (ED.undo.length > ED_UNDO_MAX) ED.undo.shift()
  ED.redo.length = 0
  _edRenderRestore()
}

function _edApply(snap) {
  ED.levels = _edClone(snap.levels)
  ED.sel    = Math.min(snap.sel, ED.levels.length - 1)
  _edSaveDrafts(); _edRender()
}

window.edUndo = function() {
  if (!ED.undo.length) { _edSetMsg('Nothing to undo.'); return }
  ED.redo.push({ levels:_edClone(ED.levels), sel:ED.sel })
  _edApply(ED.undo.pop())
  _edSetMsg('↩ Undone.')
}

window.edRedo = function() {
  if (!ED.redo.length) { _edSetMsg('Nothing to redo.'); return }
  ED.undo.push({ levels:_edClone(ED.levels), sel:ED.sel })
  _edApply(ED.redo.pop())
  _edSetMsg('↪ Redone.')
}

// ── Trash (deleted drafts) ────────────────────────────

function _edLoadTrash() {
  try {
    const raw = localStorage.getItem(ED_TRASH_KEY)
    ED.trash = raw ? JSON.parse(raw) : []
  } catch { ED.trash = [] }
  if (!Array.isArray(ED.trash)) ED.trash = []
}

function _edSaveTrash() {
  try { localStorage.setItem(ED_TRASH_KEY, JSON.stringify(ED.trash)) } catch {}
}

window.edRestoreTrash = function(i) {
  const item = ED.trash[i]; if (!item) return
  _edPush()
  ED.levels.push(item.lv)
  ED.sel = ED.levels.length - 1
  ED.game = item.lv.game || ED.game
  ED.trash.splice(i, 1)
  _edSaveTrash(); _edTouch()
  document.querySelectorAll('.ed-gametab').forEach(b =>
    b.classList.toggle('active', b.dataset.game === ED.game))
  _edRender()
  _edSetMsg(`Restored "${item.lv.name}".`)
}

window.edEmptyTrash = function() {
  if (!ED.trash.length) return
  if (!confirm(`Permanently delete ${ED.trash.length} item(s) from the trash?`)) return
  ED.trash = []; _edSaveTrash(); _edRenderRestore()
  _edSetMsg('Trash emptied.')
}

// ── Revert an edited built-in to its original ─────────

window.edRevert = function() {
  const lv = _edCur(); if (!lv) return
  if (!lv.overrides) { _edSetMsg('⚠ This is not a copy of a built-in — nothing to revert to.'); return }
  const pools = _edBuiltins()
  let found = null, foundKey = null
  for (const key of ED_DIFFS[ED.game]) {
    const i = (pools[key] || []).findIndex(t => t.name === lv.overrides)
    if (i >= 0) { found = pools[key][i]; foundKey = key; break }
  }
  if (!found) { _edSetMsg(`⚠ Built-in "${lv.overrides}" no longer exists.`); return }
  // Restores shape, speed and length from the built-in but keeps your
  // name and tuning, since those are usually deliberate.
  if (!confirm(`Reload the shape, speed and length of "${lv.overrides}" from the built-in?\n\nYour name and tuning are kept. Ctrl+Z undoes this.`)) return

  _edPush()
  const H = _edRefHeight()
  const d = found.gen ? found.gen(H) : found
  lv.diff    = found.diff || foundKey
  lv.speed   = found.speed
  lv.clearAt = Math.round(d.clearAt)
  if (ED.game === 'wavegauntlet') {
    lv.keyframes = (d.keyframes || []).map(k => ({
      at: Math.round(k.at), cf: +k.cf.toFixed(4), gapHf: +(k.gapH / H).toFixed(4),
    }))
  } else if (ED.game === 'ufo') {
    lv.gapf = d.gapf ?? 0.3
    lv.pipes = (d.pipes || []).map(p => {
      const q = { at: Math.round(p.at), cyf: +(+p.cyf).toFixed(4) }
      if (p.gapf) q.gapf = +(+p.gapf).toFixed(4)
      if (p.safe) q.safe = p.safe
      return q
    })
  } else {
    lv.obstacles = (d.obstacles || []).map(o => ({ col: Math.round(o.col), floor: !!o.floor }))
  }
  _edTouch(); _edRender()
  _edSetMsg(`↺ Reverted to the original "${lv.overrides}".`)
}

function _edRenderRestore() {
  const u = document.getElementById('ed-undo-count')
  if (u) u.textContent = ED.undo.length ? `(${ED.undo.length})` : ''
  const el = document.getElementById('ed-trash')
  if (!el) return
  if (!ED.trash.length) { el.innerHTML = '<div class="ed-empty">Trash is empty.</div>'; return }
  el.innerHTML = ED.trash.map((t, i) => {
    const col = ED_DIFF_COL[t.lv.diff] || '#888'
    const when = new Date(t.at).toLocaleString()
    return `<div class="ed-item" title="Deleted ${_edEsc(when)}">
      <span class="ed-item-diff" style="background:${col}"></span>
      <span class="ed-item-name">${_edEsc(t.lv.name)}</span>
      <button class="ed-mini" onclick="edRestoreTrash(${i})">Restore</button>
    </div>`
  }).join('')
}

// ── Persistence ───────────────────────────────────────

function _edLoadDrafts() {
  try {
    const raw = localStorage.getItem(ED_LS_KEY)
    ED.levels = raw ? JSON.parse(raw) : []
  } catch { ED.levels = [] }
  if (!Array.isArray(ED.levels)) ED.levels = []
}

function _edSaveDrafts() {
  try { localStorage.setItem(ED_LS_KEY, JSON.stringify(ED.levels)) }
  catch (e) { _edSetMsg('⚠ Could not save drafts: ' + e.message) }
}

// ── Level creation ────────────────────────────────────

// Tuning defaults shared by both games:
//   rank     0–100 difficulty label (cosmetic + sorts the list)
//   minScore level only starts appearing at this score
//   maxScore level stops appearing after this score (0 = never stops)
//   weight   relative chance vs other eligible levels (1 = normal)
const ED_TUNING = { rank:20, minScore:0, maxScore:0, weight:1 }

// ── Stamp palette ─────────────────────────────────────
// Reusable shape presets. Each returns keyframes relative to col 0,
// which get offset to wherever you stamp. Wave Gauntlet only —
// Spider stamps are block runs instead.

const ED_STAMPS = {
  wavegauntlet: [
    { id:'slam', name:'Slam', desc:'Corridor snaps shut, holds, reopens', span:210,
      make: (cf, gap) => [
        { at:0,   cf, gapHf:gap },
        { at:40,  cf, gapHf:0.055 },
        { at:170, cf, gapHf:0.055 },
        { at:210, cf, gapHf:gap },
      ] },
    { id:'sawtooth', name:'Sawtooth ×4', desc:'Four tight zigzag swings', span:400,
      make: (cf, gap) => {
        const out = [], lo = Math.max(0.12, cf - 0.055), hi = Math.min(0.88, cf + 0.055)
        for (let i = 0; i <= 4; i++) out.push({ at:i*100, cf: i%2 ? hi : lo, gapHf: Math.min(gap, 0.09) })
        return out
      } },
    { id:'needle', name:'Needle', desc:'Long straight squeeze', span:300,
      make: (cf, gap) => [
        { at:0,   cf, gapHf:gap },
        { at:50,  cf, gapHf:0.14 },
        { at:250, cf, gapHf:0.14 },
        { at:300, cf, gapHf:gap },
      ] },
    { id:'ramp', name:'Ramp', desc:'Gentle climb to a new height', span:200,
      make: (cf, gap) => [
        { at:0,   cf, gapHf:gap },
        { at:200, cf: cf > 0.5 ? cf - 0.18 : cf + 0.18, gapHf:gap },
      ] },
    { id:'pinch', name:'Pinch', desc:'Brief narrow throat', span:120,
      make: (cf, gap) => [
        { at:0,   cf, gapHf:gap },
        { at:45,  cf, gapHf:0.075 },
        { at:75,  cf, gapHf:0.075 },
        { at:120, cf, gapHf:gap },
      ] },
  ],
  spider: [
    { id:'run4', name:'Run ×4', desc:'Four alternating blocks', span:400,
      make: (startFloor, spacing) => {
        const out = []
        for (let i = 0; i < 4; i++) out.push({ col:i*spacing, floor: i%2 ? !startFloor : startFloor })
        return out
      } },
    { id:'run8', name:'Run ×8', desc:'Eight alternating blocks', span:800,
      make: (startFloor, spacing) => {
        const out = []
        for (let i = 0; i < 8; i++) out.push({ col:i*spacing, floor: i%2 ? !startFloor : startFloor })
        return out
      } },
    { id:'burst', name:'Burst', desc:'Four tight, then a gap', span:420,
      make: (startFloor) => {
        const out = []
        for (let i = 0; i < 4; i++) out.push({ col:i*85, floor: i%2 ? !startFloor : startFloor })
        return out
      } },
    { id:'double', name:'Double tap', desc:'Two quick same-side flips', span:200,
      make: (startFloor) => ([
        { col:0,   floor:startFloor },
        { col:95,  floor:!startFloor },
        { col:190, floor:startFloor },
      ]) },
  ],
}

function _edNewLevel(game) {
  if (game === 'wavegauntlet') {
    return {
      game, name:'NEW LEVEL', diff:'easy', speed:160, clearAt:800, ...ED_TUNING, deco:[],
      keyframes:[
        { at:0,   cf:0.50, gapHf:0.50 },
        { at:200, cf:0.50, gapHf:0.50 },
        { at:500, cf:0.35, gapHf:0.45 },
        { at:800, cf:0.50, gapHf:0.50 },
      ],
    }
  }
  if (game === 'ufo') {
    return {
      game, name:'NEW LEVEL', diff:'easy', speed:160, clearAt:3000, gapf:0.32,
      ...ED_TUNING, deco:[],
      pipes:[
        { at:520,  cyf:0.50 },
        { at:900,  cyf:0.42 },
        { at:1280, cyf:0.58 },
        { at:1660, cyf:0.46 },
      ],
    }
  }
  return {
    game, name:'NEW LEVEL', diff:'easy', speed:170, clearAt:900, ...ED_TUNING, deco:[],
    obstacles:[
      { col:240, floor:false },
      { col:440, floor:true  },
      { col:640, floor:false },
    ],
  }
}

// Rough 0–100 rank for a built-in, from its tier and speed
function _edGuessRank(diff, speed) {
  const base = { easy:10, medium:30, hard:55, extreme:75, fp:90, dc:95, boss:95 }[diff] ?? 30
  return Math.max(0, Math.min(100, Math.round(base + (speed - 250) / 20)))
}

// ── Loading a built-in level for editing ──────────────
// Built-ins are gen(h) functions, some with randomness. We run one
// at the real canvas height to bake out a concrete, editable copy.

window.edLoadBuiltin = function(diffKey, idx) {
  const tmpl = (_edBuiltins()[diffKey] || [])[idx]
  if (!tmpl) return
  const H = _edRefHeight()
  let d
  try { d = tmpl.gen ? tmpl.gen(H) : tmpl }
  catch (e) { _edSetMsg('⚠ Could not read that level: ' + e.message); return }

  const diff = tmpl.diff || diffKey
  _edPush()
  const lv = {
    game:    ED.game,
    name:    tmpl.name,
    diff,
    speed:   tmpl.speed,
    clearAt: Math.round(d.clearAt),
    ...ED_TUNING,
    rank:      _edGuessRank(diff, tmpl.speed),
    overrides: tmpl.name,      // publishing this replaces the built-in
  }
  if (tmpl.miniWave) lv.miniWave = true

  if (ED.game === 'wavegauntlet') {
    lv.keyframes = (d.keyframes || []).map(k => ({
      at: Math.round(k.at), cf: +k.cf.toFixed(4), gapHf: +(k.gapH / H).toFixed(4),
    }))
  } else if (ED.game === 'ufo') {
    lv.gapf = d.gapf ?? 0.3
    lv.pipes = (d.pipes || []).map(p => {
      const q = { at: Math.round(p.at), cyf: +(+p.cyf).toFixed(4) }
      if (p.gapf) q.gapf = +(+p.gapf).toFixed(4)
      if (p.safe) q.safe = p.safe
      return q
    })
  } else {
    lv.obstacles = (d.obstacles || []).map(o => ({ col: Math.round(o.col), floor: !!o.floor }))
  }

  ED.levels.push(lv)
  ED.sel = ED.levels.length - 1
  _edTouch(); _edRender()
  _edSetMsg(`Loaded "${tmpl.name}" — publishing replaces the original for everyone.`)
}

function _edRenderBuiltins() {
  const el = document.getElementById('ed-builtin')
  if (!el) return
  const pools = _edBuiltins()
  const overridden = new Set(
    ((window.QG_CUSTOM_LEVELS && window.QG_CUSTOM_LEVELS[ED.game]) || [])
      .map(l => l.overrides).filter(Boolean))

  const rows = []
  for (const key of ED_DIFFS[ED.game]) {
    for (let i = 0; i < (pools[key] || []).length; i++) {
      const t = pools[key][i]
      const col = ED_DIFF_COL[t.diff || key] || '#888'
      const tag = overridden.has(t.name)
        ? '<span class="ed-ovr" title="Replaced by a published edit">edited</span>' : ''
      rows.push(`<div class="ed-item" onclick="edLoadBuiltin('${key}',${i})">
        <span class="ed-item-diff" style="background:${col}"></span>
        <span class="ed-item-name">${_edEsc(t.name)}</span>${tag}
      </div>`)
    }
  }
  el.innerHTML = rows.length ? rows.join('') : '<div class="ed-empty">No built-ins found.</div>'
}

// ── Page lifecycle ────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  _edLoadDrafts()
  _edLoadTrash()
  _edLoadInbox()
  if (ED.sel < 0) ED.sel = ED.levels.findIndex(l => l.game === ED.game)
  _edRender()
  _edBindCanvas()
})

// ── UI rendering ──────────────────────────────────────

function _edSetMsg(m) {
  ED.msg = m
  const el = document.getElementById('ed-msg')
  if (el) el.textContent = m
  if (m) setTimeout(() => { if (ED.msg === m) { ED.msg = ''; if (el) el.textContent = '' } }, 4000)
}

function _edCur() { return ED.levels[ED.sel] || null }

function _edRender() {
  _edRenderRestore()
  _edRenderInbox()
  _edRenderModes()
  _edRenderPalette()
  _edRenderList()
  _edRenderBuiltins()
  _edRenderProps()
  _edDraw()
}

function _edRenderList() {
  const el = document.getElementById('ed-list')
  if (!el) return
  const mine = ED.levels.filter(l => l.game === ED.game)
  if (!mine.length) {
    el.innerHTML = '<div class="ed-empty">No drafts yet — hit <b>+ New</b>.</div>'
    return
  }
  el.innerHTML = ED.levels.map((l, i) => {
    if (l.game !== ED.game) return ''
    const col = ED_DIFF_COL[l.diff] || '#888'
    const ovr = l.overrides ? '<span class="ed-ovr" title="Replaces built-in">edit</span>' : ''
    return `<div class="ed-item ${i === ED.sel ? 'active' : ''}" onclick="edSelect(${i})">
      <span class="ed-item-diff" style="background:${col}"></span>
      <span class="ed-item-name">${_edEsc(l.name)}</span>
      <span class="ed-rank" style="color:${_edRankCol(l.rank ?? 20)}">${l.rank ?? 20}</span>${ovr}
    </div>`
  }).join('')
}

function _edRenderProps() {
  const el = document.getElementById('ed-props')
  if (!el) return
  const lv = _edCur()
  if (!lv || lv.game !== ED.game) { el.innerHTML = '<div class="ed-empty">Select a level.</div>'; return }
  if (ED.mode === 'deco') { _edRenderDecoProps(el, lv); return }
  if (ED.mode === 'portal') { _edRenderPortalProps(el, lv); return }
  const diffs = ED_DIFFS[ED.game].map(d =>
    `<option value="${d}" ${d === lv.diff ? 'selected' : ''}>${d.toUpperCase()}</option>`).join('')
  const rank = lv.rank ?? 20
  el.innerHTML = `
    <label>Name<input id="ed-f-name" value="${_edEsc(lv.name)}" maxlength="20"></label>
    <label>Tier <span class="ed-hint">colour + practice group</span><select id="ed-f-diff">${diffs}</select></label>
    <label>Speed <span class="ed-hint">px/sec</span><input id="ed-f-speed" type="number" min="40" max="600" value="${lv.speed}"></label>
    <label>Length <span class="ed-hint">columns</span><input id="ed-f-clear" type="number" min="200" max="4000" step="10" value="${lv.clearAt}"></label>

    <div class="ed-sep">Appearance</div>

    <label>Difficulty <b id="ed-rank-out" style="color:${_edRankCol(rank)}">${rank}</b><span class="ed-hint">/ 100</span>
      <input id="ed-f-rank" type="range" min="0" max="100" value="${rank}"></label>
    <label>Starts at score<input id="ed-f-min" type="number" min="0" max="999" value="${lv.minScore ?? 0}"></label>
    <label>Stops after score <span class="ed-hint">0 = never</span><input id="ed-f-max" type="number" min="0" max="999" value="${lv.maxScore ?? 0}"></label>
    <label>Chance weight <span class="ed-hint">1 = normal, 3 = 3× as likely</span>
      <input id="ed-f-weight" type="number" min="0.1" max="20" step="0.1" value="${lv.weight ?? 1}"></label>
    <div class="ed-hint" id="ed-window-note">${_edWindowNote(lv)}</div>
  `
  const q = s => el.querySelector(s)
  q('#ed-f-name').oninput   = e => { lv.name = e.target.value; _edTouch(); _edRenderList() }
  q('#ed-f-diff').onchange  = e => { lv.diff = e.target.value; _edTouch(); _edRenderList(); _edDraw() }
  q('#ed-f-speed').oninput  = e => { lv.speed = +e.target.value || 150; _edTouch(); _edDraw() }
  q('#ed-f-clear').oninput  = e => { lv.clearAt = +e.target.value || 800; _edTouch(); _edDraw() }
  q('#ed-f-rank').oninput   = e => {
    lv.rank = +e.target.value
    const out = q('#ed-rank-out')
    out.textContent = lv.rank; out.style.color = _edRankCol(lv.rank)
    _edTouch()
  }
  q('#ed-f-min').oninput    = e => { lv.minScore = Math.max(0, +e.target.value || 0); _edTouch(); q('#ed-window-note').textContent = _edWindowNote(lv) }
  q('#ed-f-max').oninput    = e => { lv.maxScore = Math.max(0, +e.target.value || 0); _edTouch(); q('#ed-window-note').textContent = _edWindowNote(lv) }
  q('#ed-f-weight').oninput = e => { lv.weight = Math.max(0.1, +e.target.value || 1); _edTouch() }

  // One undo entry per field-editing session, taken before the first keystroke
  el.querySelectorAll('input, select').forEach(i => i.addEventListener('focus', _edPush))
}

// Portal properties. The opening is the thing worth tuning: a wide mouth is
// hard to miss, a narrow one has to be aimed for, and a full-height one
// cannot be dodged at all.
function _edRenderPortalProps(el, lv) {
  const ps = lv.portals || []
  if (!ps.length) {
    el.innerHTML = `<div class="ed-empty">Click the canvas to place a portal:
      first click is where you go <b>in</b>, second is where you come <b>out</b>.</div>`
    return
  }
  const i = Math.min(ED.portalSel ?? ps.length - 1, ps.length - 1)
  ED.portalSel = i
  const p = ps[i]
  const mouth = p.mouth ?? 0.24
  const pct = Math.round(mouth * 100)
  const opts = ps.map((q, k) =>
    `<option value="${k}" ${k === i ? 'selected' : ''}>#${k + 1} — col ${q.at} → ${q.toAt ?? q.at}</option>`).join('')
  el.innerHTML = `
    <label>Portal<select id="ed-p-sel">${opts}</select></label>
    <label>Opening <b id="ed-p-out">${pct === 100 ? 'full height' : pct + '%'}</b>
      <span class="ed-hint">of the screen — 100% cannot be dodged</span>
      <input id="ed-p-mouth" type="range" min="4" max="100" value="${pct}"></label>
    <label>Goes in at column<input id="ed-p-at" type="number" min="0" step="5" value="${p.at}"></label>
    <label>Comes out at column<input id="ed-p-toat" type="number" min="0" step="5" value="${p.toAt ?? p.at}"></label>
    <button class="ed-mini danger" id="ed-p-del">Delete this portal</button>
    <div class="ed-hint">Drag either end on the canvas to move it.</div>
  `
  const q = s => el.querySelector(s)
  q('#ed-p-sel').onchange = e => { ED.portalSel = +e.target.value; _edRenderProps(); _edDraw() }
  q('#ed-p-mouth').oninput = e => {
    p.mouth = Math.max(0.04, Math.min(1, +e.target.value / 100))
    const v = Math.round(p.mouth * 100)
    q('#ed-p-out').textContent = v === 100 ? 'full height' : v + '%'
    _edTouch(); _edDraw()
  }
  q('#ed-p-at').oninput   = e => { p.at = Math.max(0, +e.target.value || 0); _edTouch(); _edDraw() }
  q('#ed-p-toat').oninput = e => { p.toAt = Math.max(0, +e.target.value || 0); _edTouch(); _edDraw() }
  q('#ed-p-del').onclick  = () => {
    _edPush(); ps.splice(i, 1); ED.portalSel = Math.max(0, i - 1)
    _edTouch(); _edRenderProps(); _edDraw()
  }
  el.querySelectorAll('input, select').forEach(x => x.addEventListener('focus', _edPush))
}

function _edRenderDecoProps(el, lv) {
  const d = (lv.deco || [])[ED.decoSel]
  if (!d) {
    el.innerHTML = `<div class="ed-empty">Click the canvas to place a
      <b>${_edEsc(ED.decoType)}</b>, or click an existing one to edit it.</div>`
    return
  }
  el.innerHTML = `
    <label>Shape<input value="${_edEsc(d.t)}" disabled></label>
    <label>Width <span class="ed-hint">columns</span><input id="ed-d-w" type="number" min="4" max="2000" value="${Math.round(d.w ?? 60)}"></label>
    <label>Height <span class="ed-hint">% of screen</span><input id="ed-d-h" type="number" min="1" max="100" value="${Math.round((d.hf ?? 0.12)*100)}"></label>
    <label>Opacity <b id="ed-d-aout">${Math.round((d.a ?? 0.22)*100)}</b>%
      <input id="ed-d-a" type="range" min="2" max="100" value="${Math.round((d.a ?? 0.22)*100)}"></label>
    <label>Rotation <b id="ed-d-rout">${Math.round(d.rot ?? 0)}</b>&deg;
      <input id="ed-d-r" type="range" min="-180" max="180" value="${Math.round(d.rot ?? 0)}"></label>
    ${d.t === 'text' ? `<label>Text<input id="ed-d-tx" maxlength="24" value="${_edEsc(d.tx || '')}"></label>` : ''}

    <div class="ed-sep">Movement</div>
    <label>Motion<select id="ed-d-mv">${
      Object.keys(window.DECO_MOTIONS || { none:null }).map(k =>
        `<option value="${k}" ${_edMotionName(d) === k ? 'selected' : ''}>${_edMotionLabel(k)}</option>`).join('')
    }</select></label>
    ${d.mk ? `
    <label>Speed <b id="ed-d-spout">${(d.mkSpeed ?? 1).toFixed(1)}</b>&times;
      <input id="ed-d-sp" type="range" min="2" max="40" value="${Math.round((d.mkSpeed ?? 1)*10)}"></label>
    <div class="ed-hint">${d.mk.length} motion keyframes over ${(_edMotionSpan(d)).toFixed(1)}s</div>` : ''}
    <label class="ed-check"><input type="checkbox" id="ed-d-anim" ${ED.animate ? 'checked' : ''}> Preview movement</label>

    <button class="ed-mini danger" onclick="edDeleteDeco()">Delete this deco</button>
  `
  const q = x => el.querySelector(x)
  q('#ed-d-w').oninput = e => { d.w = Math.max(4, +e.target.value || 60); _edTouch(); _edDraw() }
  q('#ed-d-h').oninput = e => { d.hf = Math.max(0.01, (+e.target.value || 12) / 100); _edTouch(); _edDraw() }
  q('#ed-d-a').oninput = e => { d.a = (+e.target.value || 22) / 100; q('#ed-d-aout').textContent = Math.round(d.a*100); _edTouch(); _edDraw() }
  q('#ed-d-r').oninput = e => { d.rot = +e.target.value || 0; q('#ed-d-rout').textContent = Math.round(d.rot); _edTouch(); _edDraw() }
  if (d.t === 'text') q('#ed-d-tx').oninput = e => { d.tx = e.target.value; _edTouch(); _edDraw() }

  q('#ed-d-mv').onchange = e => {
    _edPush()
    const preset = (window.DECO_MOTIONS || {})[e.target.value]
    if (!preset) { delete d.mk; delete d.mkSpeed }
    else { d.mk = JSON.parse(JSON.stringify(preset)); d.mkSpeed = d.mkSpeed ?? 1 }
    _edTouch(); _edRenderProps(); _edDraw()
  }
  const sp = q('#ed-d-sp')
  if (sp) sp.oninput = e => {
    d.mkSpeed = Math.max(0.2, (+e.target.value || 10) / 10)
    q('#ed-d-spout').textContent = d.mkSpeed.toFixed(1)
    _edTouch()
  }
  q('#ed-d-anim').onchange = e => { ED.animate = e.target.checked; _edAnimate() }

  el.querySelectorAll('input, select').forEach(i => i.addEventListener('focus', _edPush))
}

// Which preset a deco's track matches, for the dropdown
function _edMotionName(d) {
  if (!d.mk) return 'none'
  const M = window.DECO_MOTIONS || {}
  for (const k of Object.keys(M)) {
    if (M[k] && JSON.stringify(M[k]) === JSON.stringify(d.mk)) return k
  }
  return 'custom'
}
function _edMotionLabel(k) {
  return ({ none:'None', bobV:'Bob up/down', slideH:'Slide left/right',
            spin:'Spin', pulse:'Pulse fade', drift:'Drift diagonal',
            custom:'Custom' })[k] || k
}
function _edMotionSpan(d) {
  const t = d.mk && d.mk.length ? d.mk[d.mk.length-1].t : 0
  return t / (d.mkSpeed ?? 1)
}

// Redraw on a timer while previewing, so motion is visible in the editor
const _edT0 = (typeof performance !== 'undefined') ? performance.now() : 0
let _edAnimRaf = null
function _edAnimate() {
  if (_edAnimRaf) { cancelAnimationFrame(_edAnimRaf); _edAnimRaf = null }
  if (!ED.animate) { _edDraw(); return }
  const tick = () => {
    if (!ED.animate) { _edAnimRaf = null; return }
    _edDraw()
    _edAnimRaf = requestAnimationFrame(tick)
  }
  _edAnimRaf = requestAnimationFrame(tick)
}

window.edDeleteDeco = function() {
  const lv = _edCur(); if (!lv || ED.decoSel < 0) return
  _edPush(); lv.deco.splice(ED.decoSel, 1); ED.decoSel = -1
  _edTouch(); _edRenderProps(); _edDraw()
}

function _edRankCol(r) {
  if (r < 25) return '#4ade80'
  if (r < 50) return '#fbbf24'
  if (r < 70) return '#f87171'
  if (r < 88) return '#fb923c'
  return '#c084fc'
}

function _edWindowNote(lv) {
  const lo = lv.minScore ?? 0, hi = lv.maxScore ?? 0
  if (!lo && !hi) return 'Appears at any score.'
  if (lo && !hi)  return `Appears once the player has cleared ${lo}+.`
  if (!lo && hi)  return `Only appears up to score ${hi}.`
  if (lo > hi)    return `⚠ Starts at ${lo} but stops after ${hi} — this level will never appear.`
  return `Appears between score ${lo} and ${hi}.`
}

function _edEsc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]))
}

function _edTouch() { _edSaveDrafts() }

// ── Toolbar actions ───────────────────────────────────

window.edSetGame = function(g) {
  ED.game = g
  ED.sel  = ED.levels.findIndex(l => l.game === g)
  ED.scroll = 0
  document.querySelectorAll('.ed-gametab').forEach(b =>
    b.classList.toggle('active', b.dataset.game === g))
  _edRender()
}

window.edSelect = function(i) { ED.sel = i; ED.scroll = 0; _edRender() }

window.edNew = function() {
  _edPush()
  ED.levels.push(_edNewLevel(ED.game))
  ED.sel = ED.levels.length - 1
  _edTouch(); _edRender()
}

window.edDuplicate = function() {
  const lv = _edCur(); if (!lv) return
  _edPush()
  const copy = JSON.parse(JSON.stringify(lv))
  copy.name = (copy.name + ' COPY').slice(0, 20)
  ED.levels.push(copy)
  ED.sel = ED.levels.length - 1
  _edTouch(); _edRender()
}

window.edDelete = function() {
  const lv = _edCur(); if (!lv) return
  if (!confirm(`Delete draft "${lv.name}"?\n\nIt goes to the trash and can be restored. Any published copy stays live.`)) return
  _edPush()
  ED.trash.unshift({ lv:_edClone(lv), at:Date.now() })
  if (ED.trash.length > ED_TRASH_MAX) ED.trash.length = ED_TRASH_MAX
  _edSaveTrash()
  ED.levels.splice(ED.sel, 1)
  ED.sel = ED.levels.findIndex(l => l.game === ED.game)
  _edTouch(); _edRender()
  _edSetMsg(`Moved "${lv.name}" to the trash.`)
}

// Test Play runs the REAL game against a hidden host that carries the
// canvas ids game43/game44 expect. Same physics as the live site.
function _edSyncNoclipBtn() {
  const b = document.getElementById('ed-noclip-btn')
  if (b) b.textContent = (ED.testNoclip !== false) ? '🛡 noclip' : '💀 walls kill'
}
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', _edSyncNoclipBtn)

window.edToggleTestNoclip = function() {
  ED.testNoclip = ED.testNoclip === false
  _edSetMsg(ED.testNoclip ? 'Test Play: noclip on.' : 'Test Play: walls kill.')
  _edSyncNoclipBtn()
}

// Watch the solver's ideal line instead of playing it yourself
window.edBotPlay = function() {
  const lv = _edCur(); if (!lv) return
  // All three games have a solver now, so the bot is no longer wave-only
  if (lv.game === 'wavegauntlet' && typeof lcReport === 'function') {
    const r = lcReport(lv)
    if (!r.clearable) { _edSetMsg("\u26a0 Nothing to show \u2014 this level can't be cleared."); return }
  }
  // The ideal line shouldn't need noclip, but this must not change the
  // setting your own Test Play uses. It used to assign ED.testNoclip = false
  // and leave it there, so after one Bot run every manual run had walls
  // killing while the button still read "noclip" — flying high then looked
  // like a crash. Pass it for this run only instead.
  edTestPlay(true, false)
}

// evilbot is a hidden code in the games, but in here it is a plain option:
// you are tuning a level and want to see the sloppiest clear it allows.
function _edRestoreEvil() {
  try { ED.evilBot = localStorage.getItem('qg_ed_evil') === '1' } catch {}
  const b = document.getElementById('ed-evil-btn')
  if (b) {
    b.textContent = ED.evilBot ? '\ud83d\ude08 Evilbot ON' : '\ud83d\ude08 Evilbot OFF'
    b.classList.toggle('on', !!ED.evilBot)
  }
}
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', _edRestoreEvil)

window.edToggleEvil = function() {
  ED.evilBot = !ED.evilBot
  try { localStorage.setItem('qg_ed_evil', ED.evilBot ? '1' : '0') } catch {}
  const b = document.getElementById('ed-evil-btn')
  if (b) {
    b.textContent = ED.evilBot ? '\ud83d\ude08 Evilbot ON' : '\ud83d\ude08 Evilbot OFF'
    b.classList.toggle('on', !!ED.evilBot)
  }
  _edSetMsg(ED.evilBot
    ? 'Bot run will take the most presses that still clear.'
    : 'Bot run will take the fewest presses.')
}

window.edTestPlay = async function(bot, noclipOverride) {
  const lv = _edCur(); if (!lv) return
  const built = _edBuildRuntime(lv)
  const wave  = ED.game === 'wavegauntlet'
  const ufo   = ED.game === 'ufo'

  _edUnbindCanvas()
  // Drop focus from whichever button launched this. It stays in the DOM
  // behind the test host, and Chrome activates a focused button on the
  // KEYUP of Space — so holding space flew the wave and releasing it
  // re-clicked Test Play, restarting the level. Safari does not do this,
  // which is why the bug looked browser-specific. Space's keydown handler
  // cannot be relied on to suppress it either: it returns early on
  // auto-repeat, before it ever calls preventDefault.
  try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur() } catch {}
  const host = document.getElementById('ed-testhost')
  host.classList.add('on')
  // Give the host focus so keys land somewhere harmless
  try { host.setAttribute('tabindex', '-1'); host.focus({ preventScroll: true }) } catch {}
  document.getElementById('ed-test-title').textContent = `${lv.name} — ${lv.diff.toUpperCase()}`
  const show = (id, on) => { const el = document.getElementById(id); if (el) el.style.display = on ? 'block' : 'none' }
  show('g43-canvas', wave); show('spd-canvas', !wave && !ufo); show('g40-canvas', ufo)
  document.getElementById('g43-score-hud').style.display = wave ? '' : 'none'
  document.getElementById('spd-score-hud').style.display = (!wave && !ufo) ? '' : 'none'
  const uh = document.getElementById('g40-score-hud'); if (uh) uh.style.display = ufo ? '' : 'none'

  // Bot flavour: normal picks the fewest presses, evilbot the most
  const evil = !!ED.evilBot
  try { if (typeof G43 !== 'undefined') G43.evil = evil } catch {}
  try { if (typeof G40 !== 'undefined') G40.evil = evil } catch {}
  try { if (typeof _SPD !== 'undefined') _SPD.evil = evil } catch {}

  try {
    const clip = noclipOverride === undefined ? ED.testNoclip !== false : !!noclipOverride
    if (wave)      { await initGame43(); window.g43TestLevel(built, clip, !!bot) }
    else if (ufo)  { await initGame40(); window.g40TestLevel(built, clip, !!bot) }
    else           { await initSpider(); window.spdTestLevel(built, clip, !!bot) }
  } catch (e) {
    console.error('[editor] test play failed', e)
    _edSetMsg('⚠ Test play failed: ' + e.message)
    edStopTest()
  }
}

window.edStopTest = function() {
  try { if (typeof stopGame43 === 'function') stopGame43() } catch {}
  try { if (typeof stopSpider === 'function') stopSpider() } catch {}
  try { if (typeof stopGame40 === 'function') stopGame40() } catch {}
  document.getElementById('ed-testhost').classList.remove('on')
  _edBindCanvas()
  _edDraw()
}

// Runtime level: same shape the game pools use
function _edBuildRuntime(lv) {
  const base = { name: lv.name, diff: lv.diff, speed: lv.speed, custom: true }
  if (lv.game === 'wavegauntlet') {
    return { ...base, gen(h) {
      return {
        clearAt: lv.clearAt,
        keyframes: lv.keyframes.map(k => ({ at:k.at, cf:k.cf, gapH:k.gapHf * h })),
        portals: (lv.portals || []).map(p => ({ ...p })),
        deco: (lv.deco || []).map(d => ({ ...d })),
      }
    }}
  }
  if (lv.game === 'ufo') {
    // UFO templates are plain data — the game reads pipes/gapf straight off
    return { ...base, gapf: lv.gapf ?? 0.3, clearAt: lv.clearAt,
             pipes: (lv.pipes || []).map(p => ({ ...p })),
             portals: (lv.portals || []).map(p => ({ ...p })) }
  }
  return { ...base, gen() {
    return {
      clearAt: lv.clearAt,
      obstacles: lv.obstacles.map(o => ({ ...o })),
      deco: (lv.deco || []).map(d => ({ ...d })),
    }
  }}
}

window.edExport = function() {
  const lv = _edCur(); if (!lv) return
  const json = JSON.stringify(lv, null, 2)
  navigator.clipboard?.writeText(json)
  _edSetMsg('📋 Level JSON copied to clipboard.')
  console.log(json)
}

// Emit a pool entry you can paste straight into game43.js / game44.js
window.edExportCode = function() {
  const lv = _edCur(); if (!lv) return
  const p = n => Number(n.toFixed(4))

  // Deco is plain data — emit it as a literal array alongside the shape
  const decoSrc = (lv.deco && lv.deco.length)
    ? ',\n          deco:[\n' + lv.deco.map(d => {
        const bits = [`t:'${d.t}'`, `col:${Math.round(d.col)}`, `cf:${p(d.cf ?? 0.5)}`,
                      `w:${Math.round(d.w ?? 60)}`, `hf:${p(d.hf ?? 0.12)}`,
                      `c:${d.c ?? 0}`, `a:${p(d.a ?? 0.22)}`]
        if (d.rot) bits.push(`rot:${Math.round(d.rot)}`)
        if (d.tx)  bits.push(`tx:'${String(d.tx).replace(/'/g, "\\'")}'`)
        if (d.mk && d.mk.length) {
          bits.push('mk:[' + d.mk.map(k => {
            const kb = [`t:${p(k.t)}`]
            if (k.dx)  kb.push(`dx:${p(k.dx)}`)
            if (k.dy)  kb.push(`dy:${p(k.dy)}`)
            if (k.rot) kb.push(`rot:${p(k.rot)}`)
            if (k.a != null) kb.push(`a:${p(k.a)}`)
            return '{' + kb.join(',') + '}'
          }).join(',') + ']')
          if ((d.mkSpeed ?? 1) !== 1) bits.push(`mkSpeed:${p(d.mkSpeed)}`)
        }
        return '            {' + bits.join(', ') + '},'
      }).join('\n') + '\n          ]'
    : ''

  let body
  if (lv.game === 'wavegauntlet') {
    const kf = lv.keyframes.map(k =>
      `          {at:${k.at}, cf:${p(k.cf)}, gapH:h*${p(k.gapHf)}},`).join('\n')
    body =
`    {
      name:'${lv.name}', diff:'${lv.diff}', speed:${Math.round(lv.speed)},
      gen(h) {
        return { clearAt:${Math.round(lv.clearAt)}, keyframes:[
${kf}
        ]${decoSrc}}
      }
    },`
  } else {
    const obs = lv.obstacles.map(o =>
      `          {col:${o.col}, floor:${!!o.floor}},`).join('\n')
    body =
`    {
      name:'${lv.name}', diff:'${lv.diff}', speed:${Math.round(lv.speed)},
      gen(h) {
        return { clearAt:${Math.round(lv.clearAt)}, obstacles:[
${obs}
        ]${decoSrc}}
      }
    },`
  }
  const target = lv.game === 'wavegauntlet' ? 'G43_POOL' : 'SPD_POOL'
  navigator.clipboard?.writeText(body)
  _edSetMsg(`📋 JS copied — paste into ${target}.${lv.diff} in js/${lv.game === 'wavegauntlet' ? 'game43' : 'game44'}.js`)
  console.log(body)
}

// ── Submitting ────────────────────────────────────────

window.edSubmit = function() {
  const lv = _edCur(); if (!lv) { _edSetMsg('Nothing selected to submit.'); return }

  // Check it first — a level that can't be cleared shouldn't be sent at all
  let verdict = { text:'', cls:'ok', lines:[] }
  if (typeof lcReport === 'function') {
    const r = lcReport(lv)
    if (!r.clearable) {
      verdict = { text:"This level can't be cleared", cls:'bad', lines:r.problems }
      _edSubmitPanel(null, verdict); return
    }
    verdict = r.problems.length
      ? { text:'Playable, but the checker flagged things', cls:'warn', lines:r.problems.concat(r.warnings) }
      : { text:'Checks out', cls:'good', lines:r.warnings }
  }
  const payload = JSON.stringify({ ...lv, submitted:new Date().toISOString() }, null, 2)
  _edSubmitPanel(payload, verdict, lv)
  _edUpload(lv)
}

// Send it to the queue. The file download stays either way, so a failed
// upload never leaves someone with nothing to send.
async function _edUpload(lv) {
  const st = document.getElementById('ed-upload-status')
  const set = (html, col) => { if (st) { st.innerHTML = html; st.style.color = col || 'var(--muted)' } }
  set('Sending to Arham…')
  const row = {
    game: lv.game || 'wavegauntlet',
    name: String(lv.name || 'unnamed').slice(0, 40),
    diff: String(lv.diff || 'easy').slice(0, 12),
    speed: Math.round(lv.speed || 200),
    clear_at: Math.round(lv.clearAt || 800),
    data: {
      keyframes: lv.keyframes, obstacles: lv.obstacles, deco: lv.deco || [],
      rank: lv.rank, minScore: lv.minScore, maxScore: lv.maxScore, weight: lv.weight,
    },
    author: (document.getElementById('ed-sub-author') || {}).value?.slice(0, 40) || null,
    note:   (document.getElementById('ed-sub-note')   || {}).value?.slice(0, 300) || null,
  }
  try {
    const res = await fetch(ED_SB_URL + '/rest/v1/level_submissions', {
      method: 'POST',
      headers: {
        apikey: ED_SB_KEY, Authorization: 'Bearer ' + ED_SB_KEY,
        'Content-Type': 'application/json', Prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
    })
    if (res.ok) set('✅ Sent — it\'s in Arham\'s queue.', '#4ade80')
    else {
      const t = await res.text()
      set(`⚠ Couldn't send (${res.status}). Download the file below and send it manually.`, '#fbbf24')
      console.warn('submission failed:', res.status, t)
    }
  } catch (e) {
    set('⚠ No connection. Download the file below and send it manually.', '#fbbf24')
    console.warn('submission failed:', e)
  }
}

window.edResend = function() {
  const lv = _edCur(); if (lv) _edUpload(lv)
}

// A real panel rather than an alert: the JSON is visible and selectable,
// and there's a file to actually send.
function _edSubmitPanel(payload, verdict, lv) {
  let el = document.getElementById('ed-submit-panel')
  if (!el) {
    el = document.createElement('div')
    el.id = 'ed-submit-panel'
    el.className = 'ed-modal'
    document.body.appendChild(el)
  }
  const colour = { good:'#4ade80', warn:'#fbbf24', bad:'#f87171', ok:'var(--muted)' }[verdict.cls]

  if (!payload) {
    el.innerHTML = `<div class="ed-modal-card">
      <h3 style="color:${colour}">❌ ${_edEsc(verdict.text)}</h3>
      ${verdict.lines.map(l => `<p class="ed-modal-line">• ${_edEsc(l)}</p>`).join('')}
      <p class="ed-modal-note">Fix it and try again — there's no point sending a level nobody can finish.</p>
      <div class="ed-modal-row"><button class="btn-primary" onclick="edCloseSubmit()">OK</button></div>
    </div>`
    el.style.display = 'flex'
    return
  }

  const fname = (lv.name || 'level').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.qglevel.json'
  el.innerHTML = `<div class="ed-modal-card">
    <h3 style="color:${colour}">${verdict.cls === 'good' ? '✅' : '⚠'} ${_edEsc(verdict.text)}</h3>
    ${verdict.lines.slice(0, 4).map(l => `<p class="ed-modal-line">• ${_edEsc(l)}</p>`).join('')}
    <p class="ed-modal-note">This gets sent straight to Arham's queue. Add your name if you'd like
      the credit.</p>
    <div class="ed-modal-fields">
      <input id="ed-sub-author" maxlength="40" placeholder="Your name (optional)">
      <input id="ed-sub-note" maxlength="300" placeholder="Anything you want to say about it (optional)">
    </div>
    <p id="ed-upload-status" class="ed-modal-line"></p>
    <p class="ed-modal-note" style="font-size:.78rem">If sending fails, download the file below and
      get it to him however you like — it works just the same.</p>
    <textarea class="ed-modal-json" id="ed-submit-json" readonly onclick="this.select()">${_edEsc(payload)}</textarea>
    <div class="ed-modal-row">
      <button class="btn-primary" style="background:#22c55e;border-color:#22c55e;color:#04220f;"
        onclick="edDownloadLevel()">⬇ Download ${_edEsc(fname)}</button>
      <button class="btn-primary" onclick="edCopySubmit()">📋 Copy text</button>
      <button class="btn-primary ghost" onclick="edResend()">↻ Retry send</button>
      <button class="btn-primary ghost" onclick="edCloseSubmit()">Close</button>
    </div>
  </div>`
  el.style.display = 'flex'
  el.dataset.fname = fname
}

window.edCloseSubmit = function() {
  const el = document.getElementById('ed-submit-panel')
  if (el) el.style.display = 'none'
}

window.edCopySubmit = function() {
  const t = document.getElementById('ed-submit-json')
  if (!t) return
  t.select()
  navigator.clipboard?.writeText(t.value).catch(() => {})
  try { document.execCommand('copy') } catch {}
  _edSetMsg('📋 Copied.')
}

// Saves a .json file — something concrete to send, and it works even
// where clipboard access is blocked.
window.edDownloadLevel = function() {
  const t = document.getElementById('ed-submit-json')
  const el = document.getElementById('ed-submit-panel')
  if (!t || !el) return
  const blob = new Blob([t.value], { type:'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = el.dataset.fname || 'level.qglevel.json'
  document.body.appendChild(a); a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
  _edSetMsg('⬇ Saved — send that file to Arham.')
}

// ── Submissions inbox (local review) ──────────────────
// Paste anything someone sends you; it is kept in this browser only.

function _edLoadInbox() {
  try {
    const raw = localStorage.getItem(ED_SUB_KEY)
    ED.inbox = raw ? JSON.parse(raw) : []
  } catch { ED.inbox = [] }
  if (!Array.isArray(ED.inbox)) ED.inbox = []
}
function _edSaveInbox() {
  try { localStorage.setItem(ED_SUB_KEY, JSON.stringify(ED.inbox)) } catch {}
}

window.edInboxAdd = function() {
  const raw = prompt('Paste a submitted level (JSON):')
  if (!raw) return
  let lv
  try { lv = JSON.parse(raw) } catch (e) { _edSetMsg('⚠ Bad JSON: ' + e.message); return }
  if (!lv || !lv.name || (!lv.keyframes && !lv.obstacles)) {
    _edSetMsg("⚠ That doesn't look like a level."); return
  }
  if (!lv.game) lv.game = lv.keyframes ? 'wavegauntlet' : 'spider'
  delete lv.publishedId
  ED.inbox.unshift({ lv, at: Date.now() })
  _edSaveInbox(); _edRenderInbox()
  _edSetMsg(`Added "${lv.name}" to submissions.`)
}

// Load a submission in as a draft so it can be edited and test-played
window.edInboxOpen = function(i) {
  const it = ED.inbox[i]; if (!it) return
  _edPush()
  const lv = _edClone(it.lv)
  ED.levels.push(lv)
  ED.sel  = ED.levels.length - 1
  ED.game = lv.game || ED.game
  document.querySelectorAll('.ed-gametab').forEach(b =>
    b.classList.toggle('active', b.dataset.game === ED.game))
  _edTouch(); _edRender()
  _edSetMsg(`Opened "${lv.name}" — Test Play it, then Copy as JS if it's good.`)
}

window.edInboxDrop = function(i) {
  const it = ED.inbox[i]; if (!it) return
  if (!confirm(`Remove "${it.lv.name}" from submissions?`)) return
  ED.inbox.splice(i, 1); _edSaveInbox(); _edRenderInbox()
}

function _edRenderInbox() {
  const el = document.getElementById('ed-inbox')
  if (!el) return
  if (!ED.inbox.length) {
    el.innerHTML = '<div class="ed-empty">Nothing submitted yet. Use <b>+ Paste</b> to add one.</div>'
    return
  }
  el.innerHTML = ED.inbox.map((it, i) => {
    const c = ED_DIFF_COL[it.lv.diff] || '#888'
    const when = new Date(it.at).toLocaleDateString()
    return `<div class="ed-item" title="Added ${_edEsc(when)}">
      <span class="ed-item-diff" style="background:${c}"></span>
      <span class="ed-item-name">${_edEsc(it.lv.name)}</span>
      <button class="ed-mini" onclick="edInboxOpen(${i})">Open</button>
      <button class="ed-mini danger" onclick="edInboxDrop(${i})">✕</button>
    </div>`
  }).join('')
}

window.edImport = function() {
  const raw = prompt('Paste level JSON:')
  if (!raw) return
  try {
    const lv = JSON.parse(raw)
    if (!lv.game) lv.game = ED.game
    _edPush()
    ED.levels.push(lv)
    ED.sel = ED.levels.length - 1
    _edTouch(); _edRender()
    _edSetMsg('Imported.')
  } catch (e) { _edSetMsg('⚠ Bad JSON: ' + e.message) }
}

// ── Validation (catches impossible levels) ────────────
// Wave: the wave climbs at a fixed 255px/s vertically while the
// level scrolls at `speed` px/s. Over N columns it can cover at
// most 255/speed*N px — with 15% slack for reaction time.

function _edValidate(lv) {
  const problems = []
  const warnings = []
  if (lv.game === 'wavegauntlet') {
    const kfs = lv.keyframes
    const H = 400   // reference height for px estimates
    const WAVE_H = 14   // wave is 7px radius
    for (let i = 1; i < kfs.length; i++) {
      const cols = kfs[i].at - kfs[i-1].at
      if (cols <= 0) { problems.push(`Keyframe ${i+1} is at or before the previous one.`); continue }
      const dy = Math.abs(kfs[i].cf - kfs[i-1].cf) * H
      // Absolute ceiling: the wave climbs 255px/s while the level scrolls
      // at `speed`, so over `cols` columns it can cover this much and no more.
      const physMax = 255 / lv.speed * cols
      // Comfortable ceiling, leaving ~15% for human reaction. Frame-perfect
      // levels intentionally live between the two.
      const safeMax = physMax * 0.85
      // The wave only has to track the centreline as far as the corridor is
      // too narrow to absorb the drift. A wide gap lets it enter high and
      // leave low without moving much, so subtract that slack before judging.
      const slack  = Math.max(0, Math.min(kfs[i].gapHf, kfs[i-1].gapHf) * H - WAVE_H)
      const needed = Math.max(0, dy - slack)
      if (needed > physMax) {
        problems.push(`Keyframes ${i}→${i+1}: corridor moves ${Math.round(dy)}px over ${cols} cols. Even using the ${Math.round(slack)}px of gap slack the wave must climb ${Math.round(needed)}px, but it physically cannot exceed ${Math.round(physMax)}px. Impossible — widen the span, widen the gap, or lower the speed.`)
      } else if (needed > safeMax) {
        warnings.push(`Keyframes ${i}→${i+1}: needs ${Math.round(needed)}px of the ${Math.round(physMax)}px the wave can cover — ${Math.round(needed/physMax*100)}% of its limit. Doable, but frame-perfect with no room for error.`)
      }
    }
    const minGap = Math.min(...kfs.map(k => k.gapHf * H))
    if (minGap < 20) problems.push(`Tightest gap is ~${Math.round(minGap)}px — the wave is 14px tall, so this is near-unplayable.`)
    if (kfs.length && kfs[kfs.length-1].at < lv.clearAt) {
      problems.push(`Last keyframe is at col ${kfs[kfs.length-1].at} but the level runs to ${lv.clearAt} — the corridor will hold its final shape for the remaining ${lv.clearAt - kfs[kfs.length-1].at} columns.`)
    }
  } else {
    const obs = [...lv.obstacles].sort((a,b) => a.col - b.col)
    // Blocks alternate surfaces, so every switch needs flip time.
    // At `speed` px/s, N columns = N/speed seconds of reaction.
    for (let i = 1; i < obs.length; i++) {
      const cols = obs[i].col - obs[i-1].col
      const secs = cols / lv.speed
      if (obs[i].floor !== obs[i-1].floor && secs < 0.16) {
        problems.push(`Blocks at col ${obs[i-1].col}→${obs[i].col}: only ${secs.toFixed(2)}s to flip surfaces. Under ~0.16s is inhuman — space them out or slow the level.`)
      }
      if (cols === 0) problems.push(`Two blocks sit on top of each other at col ${obs[i].col}.`)
    }
    // The spider always starts on the floor
    if (obs.length && obs[0].floor) {
      const secs = obs[0].col / lv.speed
      if (secs < 0.5) {
        problems.push(`First block is on the FLOOR where the spider spawns, and it arrives in ${secs.toFixed(2)}s. Either make it a ceiling block or move it past col ${Math.ceil(lv.speed * 0.5)}.`)
      }
    }
  }
  let out = ''
  if (problems.length) out += '⚠ Issues found:\n\n• ' + problems.join('\n• ')
  if (warnings.length) {
    if (out) out += '\n\n'
    out += '⏱ Tight but playable:\n\n• ' + warnings.join('\n• ')
  }
  return out
}

window.edValidate = function() {
  const lv = _edCur(); if (!lv) return
  const w = _edValidate(lv)
  if (!w) { alert('✅ Looks playable — no timing problems found.'); return }
  // Warning-only results are legitimate for frame-perfect levels
  alert(w.startsWith('⏱') ? w + '\n\nNothing here is impossible.' : w)
}

// ── Modes: level shape / deco / stamp ─────────────────

window.edSetMode = function(m) {
  ED.mode = m
  if (m !== 'stamp') ED.stamp = null
  if (m !== 'deco')  ED.decoSel = -1
  if (m !== 'portal') ED.portalPend = null   // a half-placed portal is dropped
  _edRenderModes(); _edRenderPalette(); _edRenderProps(); _edDraw()
}

window.edPickStamp = function(id) {
  ED.stamp = id
  ED.mode  = 'stamp'
  _edRenderModes(); _edRenderPalette()
  _edSetMsg('Click on the canvas to stamp it in.')
}

window.edPickDeco = function(t) {
  ED.decoType = t
  ED.mode = 'deco'
  _edRenderModes(); _edRenderPalette()
}

window.edPickDecoCol = function(i) {
  ED.decoCol = i
  const lv = _edCur()
  // Recolour the selected item too, so the swatch acts as an edit
  if (lv && ED.decoSel >= 0 && lv.deco[ED.decoSel]) {
    _edPush(); lv.deco[ED.decoSel].c = i; _edTouch()
  }
  _edRenderPalette(); _edDraw()
}

function _edRenderModes() {
  document.querySelectorAll('.ed-modebtn').forEach(b =>
    b.classList.toggle('active', b.dataset.mode === ED.mode))
}

function _edRenderPalette() {
  const el = document.getElementById('ed-palette')
  if (!el) return
  if (ED.mode === 'stamp') {
    const list = ED_STAMPS[ED.game] || []
    el.innerHTML = list.map(st => `
      <div class="ed-item ${ED.stamp === st.id ? 'active' : ''}" onclick="edPickStamp('${st.id}')" title="${_edEsc(st.desc)}">
        <span class="ed-item-name">${_edEsc(st.name)}</span>
        <span class="ed-hint">${st.span}c</span>
      </div>`).join('')
  } else if (ED.mode === 'deco') {
    const types = (typeof DECO_TYPES !== 'undefined') ? DECO_TYPES : []
    const cols  = (typeof DECO_COLS  !== 'undefined') ? DECO_COLS  : []
    el.innerHTML = `
      <div class="ed-chips">${types.map(t =>
        `<button class="ed-chip ${ED.decoType===t?'active':''}" onclick="edPickDeco('${t}')">${t}</button>`).join('')}</div>
      <div class="ed-swatches">${cols.map((c,i) =>
        `<button class="ed-swatch ${ED.decoCol===i?'active':''}" style="background:${c}" onclick="edPickDecoCol(${i})"></button>`).join('')}</div>
      <div class="ed-hint">Click to place · drag to move · right-click to delete</div>`
  } else {
    el.innerHTML = '<div class="ed-hint">Editing the level shape. Switch to Deco or Stamp above.</div>'
  }
}

// Insert a stamp's shape at `col`, shifting later content to make room
function _edApplyStamp(id, col, yFrac) {
  const lv = _edCur(); if (!lv) return
  const st = (ED_STAMPS[ED.game] || []).find(x => x.id === id)
  if (!st) return
  _edPush()

  if (ED.game === 'wavegauntlet') {
    const gap = 0.4
    const cf  = Math.max(0.12, Math.min(0.88, yFrac))
    const add = st.make(cf, gap).map(k => ({ ...k, at: k.at + col }))
    // Push everything at/after the stamp right by its span
    for (const k of lv.keyframes) if (k.at >= col) k.at += st.span
    lv.keyframes.push(...add)
    lv.keyframes.sort((a, b) => a.at - b.at)
    lv.clearAt += st.span
  } else {
    const startFloor = yFrac > 0.5
    const add = st.make(startFloor, 110).map(o => ({ ...o, col: o.col + col }))
    for (const o of lv.obstacles) if (o.col >= col) o.col += st.span
    lv.obstacles.push(...add)
    lv.obstacles.sort((a, b) => a.col - b.col)
    lv.clearAt += st.span
  }
  _edTouch(); _edRender()
  _edSetMsg(`Stamped ${st.name} (+${st.span} columns).`)
}

// ── Canvas editing ────────────────────────────────────

function _edCvs() { return document.getElementById('ed-canvas') }

function _edView() {
  const c = _edCvs()
  const lv = _edCur()
  const cols = lv ? lv.clearAt : 800
  return { c, w:c.width, h:c.height, cols, pxPerCol: c.width / Math.max(1, cols) }
}

function _edDraw() {
  const c = _edCvs(); if (!c) return
  c.width  = c.parentElement.clientWidth
  c.height = c.parentElement.clientHeight
  const ctx = c.getContext('2d')
  const lv  = _edCur()
  const w = c.width, h = c.height

  ctx.fillStyle = '#05010a'; ctx.fillRect(0, 0, w, h)
  if (!lv || lv.game !== ED.game) {
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.font = '14px monospace'; ctx.textAlign = 'center'
    ctx.fillText('Select or create a level', w/2, h/2)
    return
  }

  const col = ED_DIFF_COL[lv.diff] || '#888'
  const ppc = w / Math.max(1, lv.clearAt)

  // Grid every 100 columns
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1
  ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.font = '9px monospace'; ctx.textAlign = 'left'
  for (let cx = 0; cx <= lv.clearAt; cx += 100) {
    const x = cx * ppc
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke()
    ctx.fillText(cx, x + 3, 10)
  }

  // Deco first — it renders behind everything in-game too
  if (typeof drawDeco === 'function' && lv.deco && lv.deco.length) {
    const t = ED.animate ? (performance.now() - _edT0) / 1000 : 0
    drawDeco(ctx, lv.deco, w, h, 0, 0, { glow:false, time: t })
  }

  if      (lv.game === 'wavegauntlet') _edDrawWave(ctx, lv, w, h, ppc, col)
  else if (lv.game === 'ufo')         _edDrawUFO(ctx, lv, w, h, ppc, col)
  else                                _edDrawSpider(ctx, lv, w, h, ppc, col)

  // Portals — blue is where you go in, orange is where you come out
  for (const p of (lv.portals || [])) {
    const ax = p.at * ppc, ay = (p.cf ?? 0.5) * h
    const bx = (p.toAt ?? p.at) * ppc, by = (p.toCf ?? 0.5) * h
    ctx.save()
    ctx.globalAlpha = 0.4; ctx.setLineDash([4, 6])
    ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1.5
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke()
    ctx.setLineDash([]); ctx.globalAlpha = 1
    // The opening is drawn at its real size, so a wide mouth looks wide
    const half = Math.max(5, Math.min(1, p.mouth ?? 0.24) * h / 2)
    const sel = (lv.portals.indexOf(p) === ED.portalSel && ED.mode === 'portal')
    for (const [x, y, col] of [[ax, ay, '#38bdf8'], [bx, by, '#f97316']]) {
      ctx.strokeStyle = col; ctx.lineWidth = sel ? 3 : 2
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.globalAlpha = 0.2; ctx.stroke()
      ctx.globalAlpha = 1
      ctx.beginPath(); ctx.ellipse(x, y, 6, half, 0, 0, Math.PI * 2)
      ctx.fillStyle = col + '44'; ctx.fill(); ctx.stroke()
      // lips, so you can see what has to be threaded
      ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(x - 9, y - half); ctx.lineTo(x + 9, y - half); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(x - 9, y + half); ctx.lineTo(x + 9, y + half); ctx.stroke()
    }
    ctx.restore()
  }
  if (ED.mode === 'portal' && ED.portalPend) {
    const x = ED.portalPend.at * ppc, y = ED.portalPend.cf * h
    ctx.save(); ctx.strokeStyle = '#38bdf8'; ctx.setLineDash([3, 3]); ctx.lineWidth = 2
    ctx.beginPath(); ctx.ellipse(x, y, 5, 11, 0, 0, Math.PI * 2); ctx.stroke()
    ctx.setLineDash([])
    ctx.fillStyle = '#38bdf8'; ctx.font = '10px monospace'; ctx.textAlign = 'center'
    ctx.fillText('click the exit', x, y - 16)
    ctx.restore()
  }

  // Selection ring on the active deco item
  if (ED.mode === 'deco' && lv.deco) {
    lv.deco.forEach((d, i) => {
      const dx = d.col * ppc, dy = (d.cf ?? 0.5) * h
      const hw = Math.max(8, (d.w ?? 40) * ppc / 2), hh = Math.max(8, (d.hf ?? 0.1) * h / 2)
      ctx.strokeStyle = i === ED.decoSel ? '#fff' : 'rgba(255,255,255,0.25)'
      ctx.lineWidth = i === ED.decoSel ? 1.5 : 1
      ctx.setLineDash([3,3])
      ctx.strokeRect(dx - hw, dy - hh, hw*2, hh*2)
      ctx.setLineDash([])
    })
  }
}

function _edDrawWave(ctx, lv, w, h, ppc, col) {
  const kfs = lv.keyframes
  if (!kfs.length) return

  // Corridor fill
  ctx.beginPath()
  for (let i = 0; i < kfs.length; i++) {
    const x = kfs[i].at * ppc, y = (kfs[i].cf - kfs[i].gapHf/2) * h
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  }
  for (let i = kfs.length - 1; i >= 0; i--) {
    ctx.lineTo(kfs[i].at * ppc, (kfs[i].cf + kfs[i].gapHf/2) * h)
  }
  ctx.closePath()
  ctx.fillStyle = col + '18'; ctx.fill()

  // Walls
  ctx.strokeStyle = col; ctx.lineWidth = 2
  for (const sign of [-1, 1]) {
    ctx.beginPath()
    kfs.forEach((k, i) => {
      const x = k.at * ppc, y = (k.cf + sign * k.gapHf/2) * h
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
    })
    ctx.stroke()
  }

  // Center line
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.setLineDash([4,4]); ctx.lineWidth = 1
  ctx.beginPath()
  kfs.forEach((k, i) => {
    const x = k.at * ppc, y = k.cf * h
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  })
  ctx.stroke(); ctx.setLineDash([])

  // Handles: center (drag = move corridor) + gap handles (drag = resize)
  kfs.forEach((k, i) => {
    const x = k.at * ppc
    const cy = k.cf * h
    ctx.fillStyle = '#fff'
    ctx.beginPath(); ctx.arc(x, cy, 5, 0, Math.PI*2); ctx.fill()
    ctx.fillStyle = col
    for (const sign of [-1, 1]) {
      ctx.beginPath(); ctx.arc(x, (k.cf + sign*k.gapHf/2) * h, 4, 0, Math.PI*2); ctx.fill()
    }
    ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.font = '9px monospace'; ctx.textAlign = 'center'
    ctx.fillText(i + 1, x, cy - 10)
  })
}

function _edDrawSpider(ctx, lv, w, h, ppc, col) {
  const oh = h * 0.44
  ctx.fillStyle = '#150020'
  ctx.fillRect(0, 0, w, 4); ctx.fillRect(0, h-4, w, 4)
  ctx.strokeStyle = col; ctx.lineWidth = 1
  ctx.beginPath(); ctx.moveTo(0,4); ctx.lineTo(w,4); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(0,h-4); ctx.lineTo(w,h-4); ctx.stroke()

  for (const o of lv.obstacles) {
    const x = o.col * ppc
    const bw = Math.max(4, 26 * ppc)
    const y  = o.floor ? h - oh : 0
    ctx.fillStyle = '#1e0030'; ctx.fillRect(x - bw/2, y, bw, oh)
    ctx.strokeStyle = col; ctx.lineWidth = 2
    const edgeY = o.floor ? h - oh : oh
    ctx.beginPath(); ctx.moveTo(x - bw/2, edgeY); ctx.lineTo(x + bw/2, edgeY); ctx.stroke()
  }

  ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.font = '10px monospace'; ctx.textAlign = 'center'
  ctx.fillText('click empty space = add block · click a block = remove · drag = move', w/2, h/2)
}

// A pillar pair is drawn from its gap: the centre dot moves it, the two
// edge dots resize the gap, and green means you are allowed to land on it.
function _edDrawUFO(ctx, lv, w, h, ppc, col) {
  const PW = Math.max(4, 62 * ppc)
  for (let i = 0; i < lv.pipes.length; i++) {
    const p = lv.pipes[i]
    const x = p.at * ppc
    const gap = (p.gapf || lv.gapf || 0.3) * h
    const cy  = p.cyf * h
    const top = cy - gap / 2, bot = cy + gap / 2
    const safeTop = p.safe === 'top', safeBot = p.safe === 'bottom'

    ctx.fillStyle = safeTop ? 'rgba(34,197,94,0.18)' : 'rgba(168,85,247,0.14)'
    ctx.fillRect(x - PW/2, 0, PW, Math.max(0, top))
    ctx.fillStyle = safeBot ? 'rgba(34,197,94,0.18)' : 'rgba(168,85,247,0.14)'
    ctx.fillRect(x - PW/2, bot, PW, Math.max(0, h - bot))

    ctx.strokeStyle = safeTop ? '#22c55e' : col; ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(x - PW/2, top); ctx.lineTo(x + PW/2, top); ctx.stroke()
    ctx.strokeStyle = safeBot ? '#22c55e' : col
    ctx.beginPath(); ctx.moveTo(x - PW/2, bot); ctx.lineTo(x + PW/2, bot); ctx.stroke()

    // handles: centre moves the pair, edges resize the gap
    const dot = (dy, c) => { ctx.beginPath(); ctx.arc(x, dy, 4, 0, Math.PI*2)
                             ctx.fillStyle = c; ctx.fill() }
    dot(cy, '#fff')
    dot(top, safeTop ? '#22c55e' : '#c084fc')
    dot(bot, safeBot ? '#22c55e' : '#c084fc')
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = '9px monospace'; ctx.textAlign = 'center'
    ctx.fillText(String(i + 1), x, 10)
  }
  ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.font = '10px monospace'; ctx.textAlign = 'center'
  ctx.fillText('click empty space = add pillar · drag white dot = move · drag edge dot = resize gap',
               w/2, h - 18)
  ctx.fillText('shift-click a pillar = mark the side you can land on · right-click = delete', w/2, h - 6)
}

// ── Mouse interaction ─────────────────────────────────

function _edPos(e) {
  const c = _edCvs()
  const r = c.getBoundingClientRect()
  const t = e.touches ? e.touches[0] : e
  return { x: t.clientX - r.left, y: t.clientY - r.top }
}

function _edDown(e) {
  const lv = _edCur(); if (!lv) return
  e.preventDefault()

  const P   = _edPos(e)
  const c0  = _edCvs()
  const ppc0 = c0.width / Math.max(1, lv.clearAt)
  // A zero-width canvas (hidden tab, collapsed layout) would make every
  // coordinate Infinity and quietly corrupt the level data.
  if (!isFinite(ppc0) || ppc0 <= 0) { _edSetMsg('⚠ Canvas has no size yet — try again.'); return }

  // Stamp mode: one click drops a preset, then falls back to level mode
  // Portal mode: click to drop one, click an existing one to grab its target
  if (ED.mode === 'portal') {
    if (!lv.portals) lv.portals = []
    _edPush()
    const at = Math.max(0, Math.round(P.x / ppc0))
    const cf = +Math.max(0.05, Math.min(0.95, P.y / c0.height)).toFixed(4)
    // Two clicks make a portal: the first sets where you go in, the second
    // where you come out. They can be on the same column or far apart.
    if (ED.portalPend) {
      lv.portals.push({ at: ED.portalPend.at, cf: ED.portalPend.cf, toAt: at, toCf: cf })
      lv.portals.sort((a, b) => a.at - b.at)
      ED.portalSel = lv.portals.findIndex(q => q.at === ED.portalPend.at)
      ED.portalPend = null
      _edRenderProps()          // so the opening slider appears for the new one
      _edSetMsg(at < lv.portals[lv.portals.length-1].at
        ? 'Portal placed. It sends you backwards — the checker cannot follow that.'
        : 'Portal placed. Click again to start another.')
    } else {
      const near = (lv.portals || []).findIndex(p => Math.abs(p.at - at) < 14)
      if (near >= 0) {
        // clicking an existing entry selects it and grabs it to drag
        ED.portalSel = near
        ED.drag = { type:'portal', i: near }
        _edRenderProps(); _edDraw(); return
      }
      ED.portalPend = { at, cf }
      _edSetMsg('Entry set — now click where it should spit you out.')
    }
    _edTouch(); _edDraw()
    return
  }

  if (ED.mode === 'stamp' && ED.stamp) {
    _edApplyStamp(ED.stamp, Math.round(P.x / ppc0), P.y / c0.height)
    return
  }

  // Deco mode: grab an existing item, else place a new one
  if (ED.mode === 'deco') {
    if (!lv.deco) lv.deco = []
    for (let i = lv.deco.length - 1; i >= 0; i--) {
      const d = lv.deco[i]
      const dx = d.col * ppc0, dy = (d.cf ?? 0.5) * c0.height
      const hw = Math.max(8, (d.w ?? 40) * ppc0 / 2), hh = Math.max(8, (d.hf ?? 0.1) * c0.height / 2)
      if (Math.abs(P.x - dx) <= hw && Math.abs(P.y - dy) <= hh) {
        _edPush()
        ED.decoSel = i
        ED.drag = { type:'deco', i, moved:false }
        _edRenderProps(); _edDraw()
        return
      }
    }
    _edPush()
    lv.deco.push(makeDeco(ED.decoType, P.x / ppc0, P.y / c0.height))
    lv.deco[lv.deco.length - 1].c = ED.decoCol
    ED.decoSel = lv.deco.length - 1
    ED.drag = { type:'deco', i:ED.decoSel, moved:false }
    _edTouch(); _edRenderProps(); _edDraw()
    return
  }

  _edPush()
  const { x, y } = _edPos(e)
  const c = _edCvs(), w = c.width, h = c.height
  const ppc = w / Math.max(1, lv.clearAt)

  if (lv.game === 'wavegauntlet') {
    for (let i = 0; i < lv.keyframes.length; i++) {
      const k = lv.keyframes[i], kx = k.at * ppc
      if (Math.abs(x - kx) > 10) continue
      if (Math.abs(y - k.cf * h) < 10)                       { ED.drag = { type:'center', i }; return }
      if (Math.abs(y - (k.cf - k.gapHf/2) * h) < 9)          { ED.drag = { type:'top',    i }; return }
      if (Math.abs(y - (k.cf + k.gapHf/2) * h) < 9)          { ED.drag = { type:'bot',    i }; return }
    }
    // Empty space → insert a keyframe here
    const at = Math.round(x / ppc)
    const cf = Math.max(0.05, Math.min(0.95, y / h))
    const idx = lv.keyframes.findIndex(k => k.at > at)
    const near = idx > 0 ? lv.keyframes[idx-1] : lv.keyframes[0]
    const kf = { at, cf, gapHf: near ? near.gapHf : 0.45 }
    idx < 0 ? lv.keyframes.push(kf) : lv.keyframes.splice(idx, 0, kf)
    ED.drag = { type:'center', i: idx < 0 ? lv.keyframes.length-1 : idx }
    _edTouch(); _edDraw()
    return
  }

  if (lv.game === 'ufo') {
    if (!lv.pipes) lv.pipes = []
    const PW = Math.max(10, 62 * ppc)
    for (let i = 0; i < lv.pipes.length; i++) {
      const p = lv.pipes[i]
      const px = p.at * ppc
      if (Math.abs(x - px) > PW/2 + 4) continue
      const gap = (p.gapf || lv.gapf || 0.3) * h
      const cy = p.cyf * h
      // shift-click cycles which side you can land on
      if (e.shiftKey) {
        p.safe = p.safe === 'bottom' ? 'top' : p.safe === 'top' ? null : 'bottom'
        if (!p.safe) delete p.safe
        ED.drag = null
        _edTouch(); _edDraw()
        _edSetMsg(p.safe ? `Pillar ${i+1}: you can land on the ${p.safe}.`
                         : `Pillar ${i+1}: both sides kill again.`)
        return
      }
      if (Math.abs(y - (cy - gap/2)) < 9) { ED.drag = { type:'ugap', i, edge:-1 }; return }
      if (Math.abs(y - (cy + gap/2)) < 9) { ED.drag = { type:'ugap', i, edge: 1 }; return }
      ED.drag = { type:'upipe', i }
      return
    }
    // Empty space → drop a pillar pair centred where you clicked
    lv.pipes.push({ at: Math.max(0, Math.round(x / ppc)),
                    cyf: +Math.max(0.08, Math.min(0.92, y / h)).toFixed(4) })
    lv.pipes.sort((a, b) => a.at - b.at)
    ED.drag = null
    _edTouch(); _edDraw()
    return
  }

  // Spider
  const bw = Math.max(8, 26 * ppc)
  for (let i = 0; i < lv.obstacles.length; i++) {
    if (Math.abs(x - lv.obstacles[i].col * ppc) < bw/2 + 3) {
      ED.drag = { type:'block', i, moved:false }
      return
    }
  }
  lv.obstacles.push({ col: Math.round(x / ppc), floor: y > h/2 })
  lv.obstacles.sort((a,b) => a.col - b.col)
  _edTouch(); _edDraw()
}

function _edMove(e) {
  if (!ED.drag) return
  const lv = _edCur(); if (!lv) return
  e.preventDefault()
  const { x, y } = _edPos(e)
  const c = _edCvs(), w = c.width, h = c.height
  const ppc = w / Math.max(1, lv.clearAt)
  if (!isFinite(ppc) || ppc <= 0) return
  const d = ED.drag

  if (d.type === 'deco') {
    const item = (lv.deco || [])[d.i]; if (!item) return
    d.moved = true
    item.col = Math.max(0, Math.round(x / ppc))
    item.cf  = +Math.max(0.02, Math.min(0.98, y / h)).toFixed(4)
    _edTouch(); _edDraw()
    return
  }

  if (d.type === 'portal') {
    const p = (lv.portals || [])[d.i]; if (!p) return
    p.at = Math.max(0, Math.round(x / ppc))
    p.cf = +Math.max(0.05, Math.min(0.95, y / h)).toFixed(4)
    lv.portals.sort((a, b) => a.at - b.at)
    d.i = lv.portals.indexOf(p)
    _edTouch(); _edDraw()
    return
  }

  if (d.type === 'upipe' || d.type === 'ugap') {
    const p = (lv.pipes || [])[d.i]; if (!p) return
    if (d.type === 'upipe') {
      p.at  = Math.max(0, Math.round(x / ppc))
      p.cyf = +Math.max(0.08, Math.min(0.92, y / h)).toFixed(4)
      lv.pipes.sort((a, b) => a.at - b.at)
      // the array just moved under us — follow the pillar we are holding
      d.i = lv.pipes.indexOf(p)
    } else {
      const half = Math.abs(y / h - p.cyf)
      p.gapf = +Math.max(0.04, Math.min(0.9, half * 2)).toFixed(4)
    }
    _edTouch(); _edDraw()
    return
  }

  if (lv.game === 'wavegauntlet') {
    const k = lv.keyframes[d.i]; if (!k) return
    if (d.type === 'center') {
      // Keep the whole corridor on screen — walls outside the canvas are
      // invisible, and the wave dies against them without warning
      const half = (k.gapHf || 0.4) / 2
      k.cf = Math.max(half, Math.min(1 - half, y / h))
      k.at = Math.max(0, Math.round(x / ppc))
      lv.keyframes.sort((a,b) => a.at - b.at)
      ED.drag.i = lv.keyframes.indexOf(k)
    } else {
      const half = Math.abs(y / h - k.cf)
      // Widen only as far as the nearer edge allows
      const room = Math.min(k.cf, 1 - k.cf)
      k.gapHf = Math.max(0.04, Math.min(room * 2, half * 2))
    }
  } else {
    const o = lv.obstacles[d.i]; if (!o) return
    d.moved = true
    o.col   = Math.max(0, Math.round(x / ppc))
    o.floor = y > h/2
  }
  _edTouch(); _edDraw()
}

function _edUp() {
  const lv = _edCur()
  const d  = ED.drag
  // Spider: a click without movement removes the block
  if (d && d.type === 'block' && !d.moved && lv) {
    lv.obstacles.splice(d.i, 1)
    _edTouch()
  }
  if (lv && lv.game === 'spider') lv.obstacles.sort((a,b) => a.col - b.col)
  ED.drag = null
  _edDraw()
}

// Right-click a keyframe / block to delete it
function _edContext(e) {
  const lv = _edCur(); if (!lv) return
  e.preventDefault()

  if (ED.mode === 'deco' && lv.deco && lv.deco.length) {
    const P = _edPos(e), c0 = _edCvs()
    const ppc0 = c0.width / Math.max(1, lv.clearAt)
    for (let i = lv.deco.length - 1; i >= 0; i--) {
      const d = lv.deco[i]
      const dx = d.col * ppc0, dy = (d.cf ?? 0.5) * c0.height
      const hw = Math.max(8, (d.w ?? 40) * ppc0 / 2), hh = Math.max(8, (d.hf ?? 0.1) * c0.height / 2)
      if (Math.abs(P.x - dx) <= hw && Math.abs(P.y - dy) <= hh) {
        _edPush(); lv.deco.splice(i, 1); ED.decoSel = -1
        _edTouch(); _edRenderProps(); _edDraw()
        _edSetMsg('Deco removed.')
        return
      }
    }
    return
  }

  _edPush()
  const { x } = _edPos(e)
  const c = _edCvs()
  const ppc = c.width / Math.max(1, lv.clearAt)

  if (ED.mode === 'portal') {
    const i = (lv.portals || []).findIndex(p => Math.abs(p.at * ppc - x) < 14)
    if (i >= 0) { lv.portals.splice(i, 1); _edTouch(); _edDraw(); _edSetMsg('Portal removed.') }
    return
  }

  if (lv.game === 'wavegauntlet') {
    if (lv.keyframes.length <= 2) { _edSetMsg('Need at least 2 keyframes.'); return }
    let best = -1, bestD = 12
    lv.keyframes.forEach((k, i) => {
      const d = Math.abs(x - k.at * ppc)
      if (d < bestD) { bestD = d; best = i }
    })
    if (best >= 0) { lv.keyframes.splice(best, 1); _edTouch(); _edDraw() }
  } else if (lv.game === 'ufo') {
    const PW = Math.max(10, 62 * ppc)
    const i = (lv.pipes || []).findIndex(p => Math.abs(x - p.at * ppc) < PW/2 + 4)
    if (i >= 0) { lv.pipes.splice(i, 1); _edTouch(); _edDraw(); _edSetMsg('Pillar removed.') }
  } else {
    const bw = Math.max(8, 26 * ppc)
    const i = lv.obstacles.findIndex(o => Math.abs(x - o.col * ppc) < bw/2 + 3)
    if (i >= 0) { lv.obstacles.splice(i, 1); _edTouch(); _edDraw() }
  }
}

// Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z (or Ctrl+Y) redo
function _edKeys(e) {
  const k = e.key.toLowerCase()
  if (!(e.ctrlKey || e.metaKey)) return
  if (k === 'z' && !e.shiftKey) { e.preventDefault(); edUndo() }
  else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); edRedo() }
}
window.addEventListener('keydown', _edKeys)

let _edBound = false
function _edBindCanvas() {
  const c = _edCvs(); if (!c || _edBound) return
  c.addEventListener('mousedown',  _edDown)
  window.addEventListener('mousemove', _edMove)
  window.addEventListener('mouseup',   _edUp)
  c.addEventListener('touchstart', _edDown, { passive:false })
  window.addEventListener('touchmove', _edMove, { passive:false })
  window.addEventListener('touchend',  _edUp)
  c.addEventListener('contextmenu', _edContext)
  window.addEventListener('resize', _edDraw)
  _edBound = true
}
function _edUnbindCanvas() {
  const c = _edCvs(); if (!c || !_edBound) return
  c.removeEventListener('mousedown',  _edDown)
  window.removeEventListener('mousemove', _edMove)
  window.removeEventListener('mouseup',   _edUp)
  c.removeEventListener('touchstart', _edDown)
  window.removeEventListener('touchmove', _edMove)
  window.removeEventListener('touchend',  _edUp)
  c.removeEventListener('contextmenu', _edContext)
  window.removeEventListener('resize', _edDraw)
  _edBound = false
}
