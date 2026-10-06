// ═══════════════════════════════════════════════════════
//  LEVEL EDITOR — Entangled Ascent (game 48 in index.html)
//  Its own tab and panel in editor.html, separate from the
//  Wave Gauntlet / Spider / UFO editor in editor.js.
//
//  Drafts save to localStorage (AL_DRAFTS_KEY) and also appear in the
//  game's "Your levels" list. To ship a level, press "Copy as JS" and
//  add it to the Built-in list and press "Save built-in file" — that writes
//  a complete js/ascent-builtin.js to replace the one in the repo.
//
//  Canvas: click with a tool to place; with Select, drag things around —
//  a column's gap edges resize it, inside a gap moves the gap, the spikes
//  move the column. Right-click deletes. Scroll/shift-scroll pans.
// ═══════════════════════════════════════════════════════

const AE = {
  open: false,
  drafts: [], sel: -1,
  tool: 'select',
  pick: -1,               // selected object index, or 'finish'
  drag: null,
  scrollX: -150,
  undo: [], redo: [],
  issues: [],             // x positions of columns ✓ Check flagged
  builtin: [],            // working copy of the built-in list (see _aeLoadBuiltin)
  armDelete: -1,          // draft armed by a first Delete click
}

const AE_TOOLS = [
  ['Edit',     [['select', '🖱 Select']]],
  ['Spikes',   [['col', '▮ Column'], ['dcol', '▮▮ Thick column'], ['half', '▯ Half wall'],
                ['block', '◆ Spike block'], ['saw', '✺ Saw'], ['strip', '▲▲ Spike strip']]],
  ['Speed portals', [['portal:fast', '»» Fast'], ['portal:slow', '«« Slow'], ['portal:normal', '== Normal']]],
  ['Triggers', [['trigger:desync', '⚡ Desync start'], ['trigger:sync', '🔗 Desync end'], ['trigger:finish', '🏁 Finish']]],
  ['Orbs',     [['orb:gold', '★ Gold'], ['orb:green', '⚡ Green']]],
]

function _aeEsc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])) }
function _aeCur() { return AE.drafts[AE.sel] || null }
function _aeSave() { alSaveDrafts(AE.drafts) }
function _aeMsg(m) { const el = document.getElementById('ae-msg'); if (el) { el.textContent = m; clearTimeout(_aeMsg.t); _aeMsg.t = setTimeout(() => { el.textContent = '' }, 3500) } }

function _aeNewLevel() {
  return { name: 'New level ' + (AE.drafts.length + 1), diff: 'easy', speed: 170, length: 3000, objects: [] }
}

// ── Undo ─────────────────────────────────────────────────
function _aePush() {
  const lv = _aeCur(); if (!lv) return
  AE.undo.push(JSON.stringify(lv)); if (AE.undo.length > 80) AE.undo.shift()
  AE.redo = []
}
window.aeUndo = function() {
  const lv = _aeCur(); if (!lv || !AE.undo.length) return
  AE.redo.push(JSON.stringify(lv))
  AE.drafts[AE.sel] = JSON.parse(AE.undo.pop()); AE.pick = -1
  _aeSave(); aeRender()
}
window.aeRedo = function() {
  const lv = _aeCur(); if (!lv || !AE.redo.length) return
  AE.undo.push(JSON.stringify(lv))
  AE.drafts[AE.sel] = JSON.parse(AE.redo.pop()); AE.pick = -1
  _aeSave(); aeRender()
}

// ── Open / close the panel ──────────────────────────────
window.aeOpen = function() {
  AE.open = true
  document.querySelector('.ed-layout:not(#ae-panel)').style.display = 'none'
  document.getElementById('ae-panel').style.display = 'flex'
  document.querySelectorAll('.ed-gametab').forEach(b => b.classList.toggle('active', b.dataset.game === 'ascent'))
  AE.drafts = alLoadDrafts()
  _aeLoadBuiltin()
  let s = -1
  try { s = +sessionStorage.getItem('ae_sel') } catch {}
  AE.sel = AE.drafts[s] ? s : (AE.drafts.length ? 0 : -1)
  _aeBind()
  aeRender()
}
function aeClose() {
  if (!AE.open) return
  AE.open = false
  document.querySelector('.ed-layout:not(#ae-panel)').style.display = ''
  document.getElementById('ae-panel').style.display = 'none'
}
const _aeOrigSetGame = window.edSetGame
window.edSetGame = function(g) { aeClose(); _aeOrigSetGame(g) }

// ── Draft list actions ──────────────────────────────────
window.aeSelect = function(i) { AE.sel = i; AE.pick = -1; AE.undo = []; AE.redo = []; AE.scrollX = -150; AE.issues = []; try { sessionStorage.setItem('ae_sel', i) } catch {}; aeRender() }
window.aeNew = function() { AE.drafts.push(_aeNewLevel()); _aeSave(); aeSelect(AE.drafts.length - 1) }
window.aeDuplicate = function() {
  const lv = _aeCur(); if (!lv) return
  const c = JSON.parse(JSON.stringify(lv)); c.name += ' copy'
  AE.drafts.push(c); _aeSave(); aeSelect(AE.drafts.length - 1)
}
window.aeDelete = function() {
  const lv = _aeCur(); if (!lv) return
  // Native confirm() is suppressed in some embedded browsers (it returns
  // false instantly), so confirmation is a second click instead.
  const btn = document.getElementById('ae-del-btn')
  if (AE.armDelete !== AE.sel) {
    AE.armDelete = AE.sel
    if (btn) btn.textContent = 'Click again to delete'
    clearTimeout(aeDelete.t)
    aeDelete.t = setTimeout(() => { AE.armDelete = -1; if (btn) btn.textContent = 'Delete' }, 3000)
    return
  }
  clearTimeout(aeDelete.t); AE.armDelete = -1
  if (btn) btn.textContent = 'Delete'
  _aeMsg(`Deleted “${lv.name}”`)
  AE.drafts.splice(AE.sel, 1); _aeSave()
  aeSelect(Math.min(AE.sel, AE.drafts.length - 1))
}
// ── Built-in list ────────────────────────────────────────
// A page can't write to the repo, so the editor keeps a working copy of the
// built-in list in this browser and exports the whole of js/ascent-builtin.js
// for you to drop in and commit.
const AE_BUILTIN_KEY = 'qg_ascent_builtin_work_v1'
function _aeShipped() { return alSortByDiff(AL_LEVELS.map(alCleanLevel).filter(Boolean)) }
function _aeLoadBuiltin() {
  let w = null
  try { w = JSON.parse(localStorage.getItem(AE_BUILTIN_KEY) || 'null') } catch {}
  AE.builtin = alSortByDiff((Array.isArray(w) ? w : AL_LEVELS).map(alCleanLevel).filter(Boolean))
}
function _aeSaveBuiltin() {
  AE.builtin = alSortByDiff(AE.builtin)
  try { localStorage.setItem(AE_BUILTIN_KEY, JSON.stringify(AE.builtin)) } catch {}
  _aeRenderList()
}
function _aeBuiltinDirty() { return JSON.stringify(AE.builtin) !== JSON.stringify(_aeShipped()) }

function _aeAddBuiltin(levels) {
  let n = 0
  for (const raw of levels) {
    const lv = alCleanLevel(raw); if (!lv) continue
    const at = AE.builtin.findIndex(b => b.name === lv.name)
    if (at >= 0) AE.builtin[at] = lv; else AE.builtin.push(lv)      // same name = update it
    n++
  }
  _aeSaveBuiltin()
  return n
}

// Accepts level JSON, an array of levels, or the "Copy as JS" snippet
function _aeParseLevels(text) {
  const tries = [text, text.trim().replace(/,\s*$/, '')]
  tries.push(tries[1].replace(/([{,\[]\s*)([A-Za-z_]\w*)\s*:/g, '$1"$2":').replace(/'([^'"]*)'/g, '"$1"'))
  for (const t of tries) for (const wrap of [t, '[' + t + ']']) {
    try {
      const v = JSON.parse(wrap)
      const list = Array.isArray(v) ? v : (v && Array.isArray(v.levels)) ? v.levels : [v]
      if (list.some(l => l && Array.isArray(l.objects))) return list
    } catch {}
  }
  return null
}

window.aeBuiltinAddDraft = function() {
  const lv = _aeCur(); if (!lv) { _aeMsg('Select a draft first'); return }
  _aeAddBuiltin([lv]); _aeMsg(`“${lv.name}” added to Built-in — Save built-in file to ship it`)
}
window.aeBuiltinPaste = function() {
  _aeIoShow('', text => {
    const list = _aeParseLevels(text)
    if (!list) { _aeMsg('That isn\u2019t a level'); return }
    const n = _aeAddBuiltin(list); aeIoClose()
    _aeMsg(`${n} level${n === 1 ? '' : 's'} added to Built-in — Save built-in file to ship`)
  }, 'Paste one or more levels (Copy JSON or Copy as JS output), then press Add', 'Add to Built-in')
}
window.aeBuiltinRemove = function(i, ev) {
  if (ev) ev.stopPropagation()
  AE.builtin.splice(i, 1); _aeSaveBuiltin()
}
window.aeBuiltinReset = function() { try { localStorage.removeItem(AE_BUILTIN_KEY) } catch {}; _aeLoadBuiltin(); _aeRenderList() }

function _aeBuiltinFile() {
  const fmt = lv => {
    const objs = lv.objects.map(o => '    ' + JSON.stringify(o).replace(/"(\w+)":/g, '$1:')).join(',\n')
    return `  { name: ${JSON.stringify(lv.name)}, diff: '${lv.diff}', speed: ${lv.speed}, length: ${Math.round(lv.length)}, objects: [\n${objs}\n  ] },`
  }
  return `// ═══════════════════════════════════════════════════════
//  ENTANGLED ASCENT — built-in levels
//  This whole file is written by the level editor: editor.html →
//  🔗 Entangled Ascent → Built-in → "⬇ Save built-in file". Replace this
//  file with the one it gives you and commit it — that is what players get.
//  The game sorts levels from Easy to Frame Perfect; each unlocks the next.
// ═══════════════════════════════════════════════════════
const AL_LEVELS = [
${alSortByDiff(AE.builtin).map(fmt).join('\n')}
]
`
}
window.aeBuiltinExport = function() {
  const text = _aeBuiltinFile()
  try {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }))
    a.download = 'ascent-builtin.js'
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  } catch {}
  // Also shown in the box, in case this browser blocks downloads
  _aeIoShow(text, null, 'Saved as ascent-builtin.js — replace js/ascent-builtin.js in the repo with it and commit. (Full text below if the download was blocked.)')
}

window.aeLoadBuiltin = function(i) {
  const src = AE.builtin[i]; if (!src) return
  const c = JSON.parse(JSON.stringify(src))
  AE.drafts.push(c); _aeSave(); aeSelect(AE.drafts.length - 1)
  _aeMsg('Editing a copy — “+ Add current draft” puts it back, replacing the one with the same name')
}
window.aeSetTool = function(t) { AE.tool = t; aeRender() }

// ── Import / export / test ──────────────────────────────
function _aeClean() { return alCleanLevel(_aeCur()) }
function _aeCopy(text, what) {
  const done = () => _aeMsg(what + ' copied to the clipboard')
  const manual = () => _aeIoShow(text, null, what + ' — copy it from the box')
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, manual)
  else manual()
}
window.aeExportJSON = function() { const lv = _aeClean(); if (lv) _aeCopy(JSON.stringify(lv), 'Level JSON') }
window.aeExportJS = function() {
  const lv = _aeClean(); if (!lv) return
  const objs = lv.objects.map(o => '    ' + JSON.stringify(o).replace(/"(\w+)":/g, '$1:')).join(',\n')
  const js = `  { name: ${JSON.stringify(lv.name)}, diff: '${lv.diff}', speed: ${lv.speed}, length: ${Math.round(lv.length)}, objects: [\n${objs}\n  ] },`
  _aeCopy(js, 'Level code')
}
window.aeImport = function() {
  _aeIoShow('', aeImportText, 'Paste level JSON, then press Import')
}
window.aeImportText = function(text) {
  if (!text.trim()) return
  let lv = null
  try { lv = alCleanLevel(JSON.parse(text)) } catch {}
  if (!lv) { _aeMsg('That isn’t a valid level'); return }
  aeIoClose()
  AE.drafts.push(lv); _aeSave(); aeSelect(AE.drafts.length - 1)
}

// Inline text box for import and for copying when the clipboard is blocked
function _aeIoShow(text, onOk, label, okLabel) {
  const box = document.getElementById('ae-io')
  document.getElementById('ae-io-label').textContent = label
  const ta = document.getElementById('ae-io-text')
  ta.value = text
  const ok = document.getElementById('ae-io-ok')
  ok.style.display = onOk ? '' : 'none'
  ok.textContent = okLabel || 'Import'
  ok.onclick = onOk ? () => onOk(ta.value) : null
  box.style.display = 'flex'
  ta.focus(); if (text) ta.select()
}
window.aeIoClose = function() { document.getElementById('ae-io').style.display = 'none' }

window.aeTestPlay = function() {
  const lv = _aeClean(); if (!lv) return
  try { localStorage.setItem(AL_TEST_KEY, JSON.stringify(lv)); sessionStorage.setItem('ae_sel', AE.sel) } catch {}
  // The game is a section in index.html now, so route by slug
  location.href = 'index.html?game=ascent&test=1'
}

// ✓ Check: can the dots get from each column's gaps to the next one's in
// time? Uses the fastest the run could be going (a fast portal anywhere
// before means it might have been taken). Spike blocks are not checked.
window.aeCheck = function() {
  const lv = _aeClean(); if (!lv) return
  const cols = lv.objects.filter(o => o.t === 'col')
  const issues = [], notes = []
  let fast = false
  const range = g => [g[0] + AL_R, g[1] - AL_R]
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i]
    for (const g of [c.top, c.bot]) if (g[1] - g[0] < AL_R * 2 + 4) { issues.push(c.x); notes.push(`Column at x=${Math.round(c.x)}: a gap is too small for a dot`) }
    if (lv.objects.some(o => o.t === 'portal' && o.kind === 'fast' && o.x < c.x)) fast = true
    if (!i) continue
    const p = cols[i - 1]
    const v = lv.speed * (fast ? AL_MULT.fast : 1)
    const time = (c.x - c.w / 2 - (p.x + p.w / 2)) / v
    const dist = (a, b) => Math.max(0, a[0] - b[1], b[0] - a[1])
    const need = Math.max(dist(range(p.top), range(c.top)), dist(range(p.bot), range(c.bot))) / (AL_SPD_Y - AL_GRAV)   // worst case: steering against gravity
    if (need > time) { issues.push(c.x); notes.push(`Column at x=${Math.round(c.x)}: needs ${need.toFixed(2)}s of steering but only ${Math.max(0, time).toFixed(2)}s to get there${fast ? ' (at fast-portal speed)' : ''}`) }
  }
  AE.issues = issues
  aeRender()
  const out = document.getElementById('ae-issues')
  out.innerHTML = notes.length
    ? notes.map(n => `<div>⚠ ${_aeEsc(n)}</div>`).join('')
    : `<div style="color:var(--success)">✓ Every column is reachable in time (${cols.length} columns)</div>`
}

// ── Properties ───────────────────────────────────────────
window.aeSetLevelProp = function(k, v) {
  const lv = _aeCur(); if (!lv) return
  _aePush()
  if (k === 'name') lv.name = String(v).slice(0, 40)
  else if (k === 'diff') lv.diff = alDiff(v).id
  else { const n = +v; if (isFinite(n)) lv[k] = k === 'speed' ? Math.max(60, Math.min(400, n)) : Math.max(400, n) }
  _aeSave(); _aeRenderList(); _aeRenderProps(); _aeRenderDiffBar(); _aeDraw()
}
window.aeSetObjProp = function(k, v) {
  const lv = _aeCur(); const o = lv && lv.objects[AE.pick]; if (!o) return
  _aePush()
  if (k === 'kind' || k === 'edge' || k === 'mode') o[k] = v
  else if (k.includes('.')) {
    const [g, i] = k.split('.'); const n = +v; if (!isFinite(n)) return
    o[g][+i] = n; o[g].sort((a, b) => a - b)
    _aeClampCol(o)
  } else { const n = +v; if (isFinite(n)) o[k] = n }
  _aeSave(); aeRender()
}
window.aeDeletePick = function() {
  const lv = _aeCur(); if (!lv || typeof AE.pick !== 'number' || AE.pick < 0) return
  _aePush(); lv.objects.splice(AE.pick, 1); AE.pick = -1; _aeSave(); aeRender()
}

function _aeClampCol(o) {
  const cl = (g, lo, hi) => {
    g[0] = Math.max(lo, Math.min(hi - 2 * AL_R, g[0]))
    g[1] = Math.max(g[0] + 2 * AL_R, Math.min(hi, g[1]))
  }
  cl(o.top, 0, AL_HALF); cl(o.bot, AL_HALF, AL_H)
}

function _aeRenderProps() {
  const el = document.getElementById('ae-props')
  const lv = _aeCur()
  if (!lv) { el.innerHTML = '<div class="ed-empty">Make a new level to start.</div>'; return }
  const inp = (label, val, on, extra = '') =>
    `<label class="ae-field"><span>${label}</span><input ${extra} value="${_aeEsc(val)}" onchange="${on}(this.value)"></label>`
  let h = inp('Name', lv.name, "aeSetLevelProp.bind(null,'name')")
       + `<label class="ae-field"><span>Difficulty</span><select onchange="aeSetLevelProp('diff',this.value)">${
           AL_DIFFS.map(d => `<option value="${d.id}" ${d.id === alDiff(lv.diff).id ? 'selected' : ''}>${d.label}</option>`).join('')}</select></label>`
       + inp('Speed', lv.speed, "aeSetLevelProp.bind(null,'speed')", 'type="number" min="60" max="400" step="5"')
       + inp('Finish x', Math.round(lv.length), "aeSetLevelProp.bind(null,'length')", 'type="number" step="50"')
  const o = typeof AE.pick === 'number' ? lv.objects[AE.pick] : null
  if (o) {
    const num = (label, k, val) => inp(label, Math.round(val), `aeSetObjProp.bind(null,'${k}')`, 'type="number"')
    const sel = (opts, cur, k = 'kind') => `<label class="ae-field"><span>${k[0].toUpperCase() + k.slice(1)}</span><select onchange="aeSetObjProp('${k}',this.value)">${
      opts.map(k => `<option ${k === cur ? 'selected' : ''}>${k}</option>`).join('')}</select></label>`
    h += `<div class="ae-objhead">${o.t === 'col' ? (alIsDesync(o) ? 'Column · <b style="color:#f87171">DESYNC</b>' : 'Column · synced') : o.t}</div>`
    h += num('x', 'x', o.x)
    if (o.t === 'col') h += num('Your gap ↑', 'top.0', o.top[0]) + num('Your gap ↓', 'top.1', o.top[1])
                          + num('Twin gap ↑', 'bot.0', o.bot[0]) + num('Twin gap ↓', 'bot.1', o.bot[1])
                          + num('Thickness', 'w', o.w || AL_COL_W)
    if (o.t === 'block') h += num('y', 'y', o.y) + num('Slide speed', 'slide', o.slide || 0)
    if (o.t === 'portal') h += num('y', 'y', o.y) + sel(['fast', 'slow', 'normal'], o.kind)
    if (o.t === 'orb') h += num('y', 'y', o.y) + sel(['gold', 'green'], o.kind)
    if (o.t === 'saw') h += num('y', 'y', o.y) + num('Radius', 'r', o.r || AL_SAW_R)
    if (o.t === 'strip') h += num('Length', 'len', o.len) + sel(['top', 'midtop', 'midbot', 'bottom'], o.edge, 'edge')
    if (o.t === 'trigger') h += sel(['desync', 'sync', 'finish'], o.mode, 'mode')
    h += `<button class="ed-mini danger" onclick="aeDeletePick()">Delete object</button>`
  } else h += '<div class="ed-empty">Select an object to edit it.</div>'
  el.innerHTML = h
}

function _aeRenderList() {
  const list = document.getElementById('ae-list')
  list.innerHTML = AE.drafts.length ? AE.drafts.map((d, i) =>
    `<div class="ed-item${i === AE.sel ? ' active' : ''}" onclick="aeSelect(${i})">
       <span class="ed-item-diff" style="background:${alDiff(d.diff).col}" title="${alDiff(d.diff).label}"></span>
       <span class="ed-item-name">${_aeEsc(d.name || 'Untitled')}</span></div>`).join('')
    : '<div class="ed-empty">No drafts yet.</div>'
  const bi = document.getElementById('ae-builtin')
  bi.innerHTML = (AE.builtin.length ? AE.builtin.map((d, i) =>
    `<div class="ed-item" onclick="aeLoadBuiltin(${i})" title="Click to edit a copy">
       <span class="ed-item-diff" style="background:${alDiff(d.diff).col}" title="${alDiff(d.diff).label}"></span>
       <span class="ed-item-name">${i + 1}. ${_aeEsc(d.name || 'Untitled')}</span>
       <button class="ed-mini danger" onclick="aeBuiltinRemove(${i}, event)" title="Remove from Built-in">✕</button></div>`).join('')
    : '<div class="ed-empty">None yet — add a draft or paste levels.</div>')
    + (_aeBuiltinDirty()
        ? '<div class="ae-dirty">Not shipped yet — <b>Save built-in file</b>, replace js/ascent-builtin.js, commit. <a href="#" onclick="aeBuiltinReset();return false">discard</a></div>'
        : '')
}

function _aeRenderTools() {
  document.getElementById('ae-tools').innerHTML = AE_TOOLS.map(([group, tools]) =>
    `<div class="ae-group">${group}</div><div class="ed-chips">` + tools.map(([id, label]) =>
      `<button class="ed-chip${AE.tool === id ? ' active' : ''}" onclick="aeSetTool('${id}')">${label}</button>`).join('') + '</div>').join('')
}

// Difficulty picker above the canvas, so it's in view while building
function _aeRenderDiffBar() {
  const el = document.getElementById('ae-diffbar'), lv = _aeCur()
  if (!lv) { el.innerHTML = ''; return }
  const cur = alDiff(lv.diff).id
  el.innerHTML = `<span>Difficulty of “${_aeEsc(lv.name)}”:</span>` + AL_DIFFS.map(d =>
    `<button class="ae-diffbtn" onclick="aeSetLevelProp('diff','${d.id}')" style="${d.id === cur
      ? `background:${d.col};border-color:${d.col};color:#0a0a14;font-weight:700` : `border-color:${d.col}66;color:${d.col}`}">${d.label}</button>`).join('')
}

window.aeRender = function() {
  if (!AE.open) return
  _aeRenderList(); _aeRenderTools(); _aeRenderProps(); _aeRenderDiffBar()
  document.getElementById('ae-undo-count').textContent = AE.undo.length ? `${AE.undo.length} step${AE.undo.length > 1 ? 's' : ''}` : ''
  _aeDraw()
}

// ── Canvas ───────────────────────────────────────────────
function _aeCvs() { return document.getElementById('ae-canvas') }
function _aeScale() { return _aeCvs().height / AL_H }
function _aeWorld(e) {
  const c = _aeCvs(), r = c.getBoundingClientRect(), s = _aeScale()
  return { x: AE.scrollX + (e.clientX - r.left) * (c.width / r.width) / s, y: (e.clientY - r.top) * (c.height / r.height) / s }
}

function _aeHit(lv, p) {
  if (Math.abs(p.x - lv.length) < 16) return { i: 'finish' }
  for (let i = lv.objects.length - 1; i >= 0; i--) {
    const o = lv.objects[i]
    if (o.t === 'col') {
      const w = (o.w || AL_COL_W) / 2 + 8
      if (Math.abs(p.x - o.x) > w) continue
      for (const g of ['top', 'bot']) for (const e of [0, 1])
        if (Math.abs(p.y - o[g][e]) < 9) return { i, part: g + '.' + e }
      for (const g of ['top', 'bot']) if (p.y > o[g][0] && p.y < o[g][1]) return { i, part: g }
      return { i, part: 'x' }
    }
    if (o.t === 'trigger') { if (Math.abs(p.x - o.x) < 8) return { i, part: 'x' }; continue }
    if (o.t === 'strip') {
      const [rx, ry, rw, rh] = alStripRect(o)
      if (p.x > rx && p.x < rx + rw && p.y > ry - 4 && p.y < ry + rh + 4) return { i, part: 'x' }
      continue
    }
    if (o.t === 'saw') { if (Math.hypot(p.x - o.x, p.y - o.y) < o.r + 4) return { i, part: 'xy' }; continue }
    const rx = o.t === 'portal' ? AL_PORTAL_W / 2 + 4 : o.t === 'block' ? AL_BLOCK / 2 + 4 : 13
    const ry = o.t === 'portal' ? AL_PORTAL_H / 2 + 4 : rx
    if (Math.abs(p.x - o.x) < rx && Math.abs(p.y - o.y) < ry) return { i, part: 'xy' }
  }
  return null
}

function _aeDown(e) {
  const lv = _aeCur(); if (!lv) return
  if (e.button === 2) return
  const p = _aeWorld(e)
  const snap = v => Math.round(v / 5) * 5
  if (AE.tool !== 'select') {
    _aePush()
    const x = snap(p.x), y = snap(p.y)
    let o
    if (AE.tool === 'col' || AE.tool === 'dcol') {
      const mine = y < AL_HALF ? y : AL_H - y
      const top = [Math.max(AL_PAD, mine - 80), Math.min(AL_HALF - AL_PAD, mine + 80)]
      o = { t: 'col', x, top, bot: [AL_H - top[1], AL_H - top[0]], w: AE.tool === 'dcol' ? AL_COL_W * 2 : AL_COL_W }
    } else if (AE.tool === 'half') {
      // Wall across the clicked half only, with one gap; the other half is open
      const a = Math.max(y < AL_HALF ? AL_PAD : AL_HALF + AL_PAD, y - 70)
      const g = [a, Math.min(y < AL_HALF ? AL_HALF - AL_PAD : AL_H - AL_PAD, a + 140)]
      o = y < AL_HALF ? { t: 'col', x, top: g, bot: [AL_HALF, AL_H], w: AL_COL_W }
                      : { t: 'col', x, top: [0, AL_HALF], bot: g, w: AL_COL_W }
    } else if (AE.tool === 'block') o = { t: 'block', x, y, slide: 0 }
    else if (AE.tool === 'saw') o = { t: 'saw', x, y, r: AL_SAW_R }
    else if (AE.tool === 'strip') {
      const edge = y < AL_HALF / 2 ? 'top' : y < AL_HALF ? 'midtop' : y < AL_HALF * 1.5 ? 'midbot' : 'bottom'
      o = { t: 'strip', x, len: 200, edge }
    } else if (AE.tool.startsWith('trigger:')) o = { t: 'trigger', x, mode: AE.tool.split(':')[1] }
    else {
      const [t, kind] = AE.tool.split(':')
      o = { t, x, y, kind }
    }
    lv.objects.push(o)
    AE.pick = lv.objects.length - 1
    _aeSave(); aeRender()
    return
  }
  const hit = _aeHit(lv, p)
  if (!hit) { AE.pick = -1; AE.drag = { pan: true, sx: e.clientX, scroll: AE.scrollX }; aeRender(); return }
  _aePush()
  AE.pick = hit.i === 'finish' ? 'finish' : hit.i
  const o = hit.i === 'finish' ? null : lv.objects[hit.i]
  AE.drag = { hit, start: p, orig: o ? JSON.parse(JSON.stringify(o)) : lv.length }
  aeRender()
}

function _aeMove(e) {
  const lv = _aeCur(); if (!lv || !AE.drag) return
  if (AE.drag.pan) {
    const c = _aeCvs()
    AE.scrollX = AE.drag.scroll - (e.clientX - AE.drag.sx) * (c.width / c.getBoundingClientRect().width) / _aeScale()
    _aeDraw(); return
  }
  const p = _aeWorld(e), d = AE.drag
  const dx = Math.round((p.x - d.start.x) / 5) * 5, dy = Math.round(p.y - d.start.y)
  if (d.hit.i === 'finish') { lv.length = Math.max(400, d.orig + dx); _aeDraw(); return }
  const o = lv.objects[d.hit.i], g0 = d.orig
  if (d.hit.part === 'x') o.x = g0.x + dx
  else if (d.hit.part === 'xy') { o.x = g0.x + dx; o.y = Math.max(0, Math.min(AL_H, g0.y + dy)) }
  else if (d.hit.part === 'top' || d.hit.part === 'bot') {
    const g = d.hit.part, lo = g === 'top' ? 0 : AL_HALF, hi = g === 'top' ? AL_HALF : AL_H
    const size = g0[g][1] - g0[g][0]
    const a = Math.max(lo, Math.min(hi - size, g0[g][0] + dy))
    o[g] = [a, a + size]
  } else {
    const [g, i] = d.hit.part.split('.')
    o[g][+i] = g0[g][+i] + dy
    o[g].sort((a, b) => a - b)
    _aeClampCol(o)
  }
  _aeDraw()
}

function _aeUp() {
  if (!AE.drag) return
  const was = AE.drag; AE.drag = null
  if (!was.pan) {
    const lv = _aeCur()
    const obj = typeof AE.pick === 'number' ? lv.objects[AE.pick] : null
    lv.objects.sort((a, b) => a.x - b.x)
    if (obj) AE.pick = lv.objects.indexOf(obj)
    _aeSave()
  }
  aeRender()
}

function _aeContext(e) {
  e.preventDefault()
  const lv = _aeCur(); if (!lv) return
  const hit = _aeHit(lv, _aeWorld(e))
  if (!hit || hit.i === 'finish') return
  _aePush(); lv.objects.splice(hit.i, 1); AE.pick = -1; _aeSave(); aeRender()
}

function _aeWheel(e) {
  e.preventDefault()
  AE.scrollX += (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) / _aeScale()
  _aeDraw()
}

function _aeKeys(e) {
  if (!AE.open) return
  const tag = (e.target && e.target.tagName) || ''
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
  const k = e.key.toLowerCase()
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.stopPropagation(); e.shiftKey ? aeRedo() : aeUndo(); return }
  if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); e.stopPropagation(); aeRedo(); return }
  if (k === 'delete' || k === 'backspace') { e.preventDefault(); aeDeletePick() }
}

let _aeBound = false
function _aeBind() {
  if (_aeBound) return
  _aeBound = true
  const c = _aeCvs()
  c.addEventListener('mousedown', _aeDown)
  window.addEventListener('mousemove', _aeMove)
  window.addEventListener('mouseup', _aeUp)
  c.addEventListener('contextmenu', _aeContext)
  c.addEventListener('wheel', _aeWheel, { passive: false })
  window.addEventListener('keydown', _aeKeys, true)   // capture: beats editor.js's undo keys
  window.addEventListener('resize', () => { if (AE.open) _aeDraw() })
}

function _aeDraw() {
  const c = _aeCvs(); if (!c) return
  const wrap = c.parentElement
  c.width = wrap.clientWidth; c.height = wrap.clientHeight
  const ctx = c.getContext('2d'), s = _aeScale(), W = c.width / s
  ctx.setTransform(s, 0, 0, s, 0, 0)
  ctx.fillStyle = '#05050f'; ctx.fillRect(0, 0, W, AL_H)
  const lv = _aeCur()
  if (!lv) { ctx.fillStyle = '#64748b'; ctx.font = '16px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Press + New to make a level', W / 2, AL_HALF); return }
  const sx = x => x - AE.scrollX

  // Grid with x labels
  ctx.font = '10px monospace'; ctx.textAlign = 'left'
  for (let x = Math.floor(AE.scrollX / 100) * 100; x < AE.scrollX + W; x += 100) {
    ctx.strokeStyle = x % 500 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.08)'
    ctx.beginPath(); ctx.moveTo(sx(x), 0); ctx.lineTo(sx(x), AL_H); ctx.stroke()
    if (!(x % 500)) { ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillText(x, sx(x) + 3, 12) }
  }
  ctx.strokeStyle = 'rgba(139,92,246,0.45)'; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.moveTo(0, AL_HALF); ctx.lineTo(W, AL_HALF); ctx.stroke()

  // Start: where the dots begin
  ctx.fillStyle = '#3b82f6'; ctx.beginPath(); ctx.arc(sx(0), AL_HALF * 0.5, AL_R, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = '#ec4899'; ctx.beginPath(); ctx.arc(sx(0), AL_HALF * 1.5, AL_R, 0, Math.PI * 2); ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillText('START', sx(0) - 16, AL_HALF - 8)

  // Finish
  const fx = sx(lv.length)
  for (let y = 0, i = 0; y < AL_H; y += 12, i++) {
    ctx.fillStyle = i % 2 ? '#e2e8f0' : '#1e1b4b'; ctx.fillRect(fx, y, 12, 12)
    ctx.fillStyle = i % 2 ? '#1e1b4b' : '#e2e8f0'; ctx.fillRect(fx + 12, y, 12, 12)
  }
  if (AE.pick === 'finish') { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(fx - 3, 1, 30, AL_H - 2) }

  lv.objects.forEach((o, i) => {
    const picked = AE.pick === i
    if (o.t === 'col') {
      const w = o.w || AL_COL_W, x = sx(o.x) - w / 2
      const desync = alIsDesync(o)
      const col = AE.issues.includes(o.x) ? '#facc15' : desync ? '#ef4444' : '#a78bfa'
      const rects = [[0, o.top[0]], [o.top[1], AL_HALF], [AL_HALF, o.bot[0]], [o.bot[1], AL_H]]
      for (const [a, b] of rects) if (b > a) {
        ctx.fillStyle = '#0b0b1e'; ctx.fillRect(x, a, w, b - a)
        ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.strokeRect(x + 0.75, a + 0.75, w - 1.5, b - a - 1.5)
      }
      if (picked) {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(x - 4, 1, w + 8, AL_H - 2)
        ctx.fillStyle = '#fff'
        for (const g of ['top', 'bot']) for (const e of [0, 1]) ctx.fillRect(sx(o.x) - 9, o[g][e] - 2, 18, 4)
        // Where the twin would be if it mirrored a dot in your gap
        ctx.strokeStyle = 'rgba(96,165,250,0.5)'; ctx.setLineDash([3, 4])
        ctx.strokeRect(x - 2, AL_H - o.top[1], w + 4, o.top[1] - o.top[0]); ctx.setLineDash([])
      }
      if (desync) { ctx.fillStyle = '#fca5a5'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center'; ctx.fillText('DESYNC', sx(o.x), AL_HALF - 6) }
    } else if (o.t === 'block') {
      ctx.fillStyle = '#0b0b1e'; ctx.fillRect(sx(o.x) - AL_BLOCK / 2, o.y - AL_BLOCK / 2, AL_BLOCK, AL_BLOCK)
      ctx.strokeStyle = picked ? '#fff' : '#f97316'; ctx.lineWidth = 2
      ctx.strokeRect(sx(o.x) - AL_BLOCK / 2, o.y - AL_BLOCK / 2, AL_BLOCK, AL_BLOCK)
      if (o.slide) { ctx.fillStyle = '#f97316'; ctx.font = '10px monospace'; ctx.textAlign = 'center'; ctx.fillText('↕', sx(o.x), o.y - AL_BLOCK / 2 - 4) }
    } else if (o.t === 'portal') {
      const col = AL_PORTAL_COL[o.kind]
      ctx.strokeStyle = picked ? '#fff' : col; ctx.lineWidth = 3
      ctx.beginPath(); ctx.ellipse(sx(o.x), o.y, AL_PORTAL_W / 2, AL_PORTAL_H / 2, 0, 0, Math.PI * 2); ctx.stroke()
      ctx.fillStyle = col; ctx.font = 'bold 11px monospace'; ctx.textAlign = 'center'
      ctx.fillText(o.kind === 'fast' ? '»»' : o.kind === 'slow' ? '««' : '==', sx(o.x), o.y + 4)
    } else if (o.t === 'saw') {
      ctx.fillStyle = '#94a3b8'; ctx.beginPath(); ctx.arc(sx(o.x), o.y, o.r, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#1e293b'; ctx.beginPath(); ctx.arc(sx(o.x), o.y, o.r * 0.3, 0, Math.PI * 2); ctx.fill()
      if (picked) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx(o.x), o.y, o.r + 3, 0, Math.PI * 2); ctx.stroke() }
    } else if (o.t === 'strip') {
      const [rx, ry, rw, rh] = alStripRect(o)
      ctx.fillStyle = 'rgba(244,63,94,0.55)'; ctx.fillRect(sx(rx), ry, rw, rh)
      ctx.strokeStyle = picked ? '#fff' : '#f43f5e'; ctx.lineWidth = picked ? 2 : 1; ctx.strokeRect(sx(rx), ry, rw, rh)
    } else if (o.t === 'trigger' && o.mode === 'finish') {
      for (let y = 0, k = 0; y < AL_H; y += 10, k++) {
        ctx.fillStyle = k % 2 ? '#facc15' : '#1e1b4b'; ctx.fillRect(sx(o.x) - 5, y, 10, 10)
      }
      if (picked) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(sx(o.x) - 8, 1, 16, AL_H - 2) }
      ctx.fillStyle = '#facc15'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'left'
      ctx.fillText('🏁 FINISH', sx(o.x) + 8, AL_HALF + 14)
    } else if (o.t === 'trigger') {
      const col = o.mode === 'desync' ? '#f87171' : '#a78bfa'
      ctx.strokeStyle = picked ? '#fff' : col; ctx.lineWidth = 2; ctx.setLineDash([3, 5])
      ctx.beginPath(); ctx.moveTo(sx(o.x), 0); ctx.lineTo(sx(o.x), AL_H); ctx.stroke(); ctx.setLineDash([])
      ctx.fillStyle = col; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'left'
      ctx.fillText(o.mode === 'desync' ? '⚡ DESYNC ▶' : '🔗 SYNC ▶', sx(o.x) + 4, AL_HALF + 14)
    } else if (o.t === 'orb') {
      ctx.fillStyle = o.kind === 'gold' ? '#fbbf24' : '#22c55e'
      ctx.beginPath(); ctx.arc(sx(o.x), o.y, 9, 0, Math.PI * 2); ctx.fill()
      if (picked) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke() }
    }
  })
}

document.addEventListener('DOMContentLoaded', () => {
  if (new URLSearchParams(location.search).get('game') === 'ascent') aeOpen()
})
