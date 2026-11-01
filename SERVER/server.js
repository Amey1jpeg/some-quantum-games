const express = require('express')
const { createServer } = require('http')
const { Server } = require('socket.io')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: { origin: '*' },
  // The biggest thing that crosses this server is a Freighter world frame —
  // normalised coords at four decimals, a couple of hundred entities, a few
  // kB — or a Gauntlet challenge handed from host to joiner. The default cap
  // is a megabyte per message, which is three orders of magnitude more than
  // anything real and is simply a buffer a bad client can make the Pi hold.
  maxHttpBufferSize: 1 << 17,   // 128 kB
})

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
  'chsh',
  // Score races added 1 Nov 2026. Each name is the same key the game posts to
  // the leaderboard under, so the queue, the board and the MP wins table all
  // agree. A name missing here is not an error anywhere — the queue is simply
  // refused and the button does nothing — so it is the first thing to check
  // if a new game never finds a match.
  'gravflip', 'spider', 'dodge', 'memseq', 'aim', 'reaction',
  'ufolevels', 'ascent',
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
  // Length matters, not just readability: on a zero-byte file every index
  // below goes through `% 0`, which is NaN, qBits[NaN] is undefined, and
  // every bit then reads 0 — so every room code would come out 'AAAAAA'.
  try { const b = fs.readFileSync(p); if (b.length) { qBits = b; break } } catch {}
}
// Start somewhere random in the pool. This used to begin at 0 on every boot,
// so a restart replayed the same sequence from the top and the first match
// after one always got the same code as the first match after the last one.
if (qBits) qBitPos = crypto.randomInt(qBits.length * 8)
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
  // dequeue() is careful not to leave empty arrays behind; this is the other
  // way a queue empties, so it has to be too.
  if (!q.length) queues.delete(game)
  const code = freshCode()
  rooms.set(code, { players: [p1.id, p2.id], game, scores: {}, dead: {}, touched: Date.now() })
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

  // Marks a room as still in use, for the sweep at the bottom of the file.
  const touch = code => { const r = rooms.get(code); if (r) r.touched = Date.now() }

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
    if (!inRoom(code)) return
    touch(code)
    socket.to(code).emit('opponent-score', score)
  })
  on('state-sync', (p) => {
    const { code, state } = p || {}
    if (!inRoom(code)) return
    touch(code)
    socket.to(code).emit('opponent-state', state)
  })

  // Natural end (CPS timer, Typing rounds)
  on('game-over', (p) => {
    const { code, score } = p || {}
    if (!inRoom(code)) return
    touch(code)
    socket.to(code).emit('opponent-done', score)
  })

  // Player died mid-game
  on('player-died', (p) => {
    const { code, score } = p || {}
    if (!inRoom(code)) return
    const room = rooms.get(code)
    if (!room) return
    room.touched = Date.now()
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

// ── Housekeeping ──────────────────────────────────────
// `rooms` only ever lost an entry when a player's socket dropped. The site is
// one page, so the socket outlives the match: finish a game, go back to the
// menu, start another, and the finished room stayed in the Map for as long as
// the tab was open, with its scores and dead maps. On a box that is up for
// weeks that only goes one way. inRoom() also kept returning true for those
// codes, so a client could still relay into a match that had ended.
//
// Two conditions clear a room, and both are safe: nobody is left in it, or
// nothing has been relayed through it for an hour, which no live match does.
// Overridable so the sweep can be exercised without waiting an hour for it.
const ROOM_TTL_MS = Number(process.env.ROOM_TTL_MS) || 60 * 60 * 1000
const SWEEP_MS    = Number(process.env.SWEEP_MS)    || 5 * 60 * 1000

function sweepRooms() {
  const now = Date.now()
  for (const [code, room] of rooms) {
    const members = io.sockets.adapter.rooms.get(code)
    const empty = !members || members.size === 0
    if (!empty && now - (room.touched || 0) <= ROOM_TTL_MS) continue
    rooms.delete(code)
    // Let the sockets out as well, so socket.rooms stops growing for the
    // life of the tab and the code can be handed out again.
    if (!empty) io.in(code).socketsLeave(code)
  }
}
setInterval(sweepRooms, SWEEP_MS).unref()

// Somewhere to look without SSHing in: whether it is up, how much it is
// holding, and whether it found the quantum pool.
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    uptime: Math.round(process.uptime()),
    rooms: rooms.size,
    queued: Object.fromEntries([...queues].map(([g, l]) => [g, l.length])),
    rssMB: Math.round(process.memoryUsage().rss / 1048576),
    entropy: qBits ? 'quantum' : 'crypto',
  })
})

// Last line of defence. A match server losing one room is survivable;
// losing the process drops everyone in all seven games at once.
process.on('uncaughtException',  e => console.error('uncaughtException:', e))
process.on('unhandledRejection', e => console.error('unhandledRejection:', e))

const PORT = process.env.PORT || 3000
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`))
