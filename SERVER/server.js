const express = require('express')
const { createServer } = require('http')
const { Server } = require('socket.io')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, { cors: { origin: '*' } })

// Maps, not objects. A plain object inherits keys from Object.prototype, so
// a client sending game:"__proto__" hit an existing truthy key, skipped the
// array init, and then called .push on Object.prototype — an uncaught
// TypeError that took the whole process down and every match with it.
// A Map has no inherited keys, so any string is just a string.
const rooms  = new Map()  // code → { players, game, scores, dead }
const queues = new Map()  // game → [socket, ...]

// The only queues that may exist. Without this, each unknown name the
// client sent created another queue that nothing would ever drain.
const GAMES = new Set([
  'typing', 'parkour', 'cps', 'wavedash', 'wavegauntlet', 'freighter', 'traprace',
])

// ── Quantum room codes ────────────────────────────────
// Same bits the games use: 10 qubits x 204,683 measurements, von Neumann
// whitened. See data/README.md in the site repo for how it was made.
//
// The pool is finite (511,736 bits) so it wraps, which is fine for codes —
// a repeat only matters if that exact room is still open, and takenCode()
// below rejects those anyway.

const QUANTUM_PATHS = [
  path.join(__dirname, 'data', 'quantum.bin'),        // deployed alongside
  path.join(__dirname, '..', 'data', 'quantum.bin'),  // running from the repo
]

let qBits = null, qBitPos = 0
for (const p of QUANTUM_PATHS) {
  try { qBits = fs.readFileSync(p); break } catch {}
}
console.log(qBits
  ? `Quantum entropy loaded: ${(qBits.length * 8).toLocaleString()} bits`
  : 'No quantum data found — room codes will use crypto.randomBytes')

function qBit() {
  const byte = qBits[(qBitPos >> 3) % qBits.length]
  const bit = (byte >> (7 - (qBitPos & 7))) & 1
  qBitPos++
  if (qBitPos >= qBits.length * 8) qBitPos = 0
  return bit
}

// Rejection sampling, so every character is equally likely. `% 36` on
// raw bytes would favour the first 30 letters — the whole point of
// whitening the bits is lost if the mapping reintroduces bias.
const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'   // 36

function qIndex(max) {
  if (!qBits) return crypto.randomInt(max)
  const width = 32 - Math.clz32(max - 1)
  for (let tries = 0; tries < 64; tries++) {
    let v = 0
    for (let i = 0; i < width; i++) v = (v << 1) | qBit()
    if (v < max) return v
  }
  return crypto.randomInt(max)
}

function randomCode() {
  let out = ''
  for (let i = 0; i < 6; i++) out += CODE_ALPHABET[qIndex(CODE_ALPHABET.length)]
  return out
}

// Never hand out a code that's already hosting a match
function freshCode() {
  for (let i = 0; i < 100; i++) {
    const c = randomCode()
    if (!rooms.has(c)) return c
  }
  return randomCode() + qIndex(36).toString(36).toUpperCase()
}

// Drop a socket from every queue it is sitting in. Used on join, on
// explicit leave, and on disconnect.
function dequeue(socket) {
  for (const [g, list] of queues) {
    const next = list.filter(s => s.id !== socket.id)
    if (next.length) queues.set(g, next)
    else queues.delete(g)          // don't leave empty arrays lying around
  }
}

function tryMatch(game) {
  const q = queues.get(game)
  if (!q || q.length < 2) return
  const [p1, p2] = q.splice(0, 2)
  const code = freshCode()
  rooms.set(code, { players: [p1.id, p2.id], game, scores: {}, dead: {} })
  p1.join(code)
  p2.join(code)
  io.to(code).emit('matched', { code })
}

io.on('connection', socket => {

  // Everything below reads values the client chose, so each handler is
  // wrapped: a throw inside a socket handler is otherwise uncaught and
  // kills the process, which disconnects every other match too.
  const on = (event, fn) => socket.on(event, (...args) => {
    try { fn(...args) }
    catch (e) { console.warn(`[${event}] from ${socket.id}:`, e.message) }
  })

  // A relay is only allowed into a room this socket actually joined.
  // Without the check, anyone could push scores and state into someone
  // else's match by guessing its code.
  const inRoom = code => typeof code === 'string' && socket.rooms.has(code)

  // ── Queue ─────────────────────────────────────────
  on('join-queue', (p) => {
    const { game } = p || {}
    if (!GAMES.has(game)) return      // unknown game: no queue to create
    dequeue(socket)                   // only ever in one queue at a time
    const q = queues.get(game) || []
    q.push(socket)
    queues.set(game, q)
    socket.data.queueGame = game
    socket.emit('queue-joined', { position: q.length })
    tryMatch(game)
  })

  on('leave-queue', () => dequeue(socket))

  // ── Ping ──────────────────────────────────────────
  on('ping-check', ts => socket.emit('pong-check', ts))

  // ── Game events ───────────────────────────────────
  on('score-update', (p) => {
    const { code, score } = p || {}
    if (inRoom(code)) socket.to(code).emit('opponent-score', score)
  })
  on('state-sync', (p) => {
    const { code, state } = p || {}
    if (inRoom(code)) socket.to(code).emit('opponent-state', state)
  })

  // Natural end (CPS timer, Typing rounds)
  on('game-over', (p) => {
    const { code, score } = p || {}
    if (inRoom(code)) socket.to(code).emit('opponent-done', score)
  })

  // Player died mid-game
  on('player-died', (p) => {
    const { code, score } = p || {}
    if (!inRoom(code)) return
    const room = rooms.get(code)
    if (!room) return
    if (room.game === 'parkour') {
      // Parkour: opponent keeps playing — tell them you died, they keep going
      room.dead[socket.id] = score
      socket.to(code).emit('opponent-died', score)
    } else {
      // Wave Dash etc: instant force-end for both
      socket.to(code).emit('force-end', { loserScore: score })
    }
  })

  // ── Disconnect ────────────────────────────────────
  on('disconnecting', () => {
    dequeue(socket)
    socket.rooms.forEach(code => {
      if (rooms.has(code)) {
        socket.to(code).emit('opponent-left')
        rooms.delete(code)
      }
    })
  })
})

// Last line of defence. A match server losing one room is survivable;
// losing the process drops everyone in all seven games at once.
process.on('uncaughtException',  e => console.error('uncaughtException:', e))
process.on('unhandledRejection', e => console.error('unhandledRejection:', e))

const PORT = process.env.PORT || 3000
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`))
