import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import * as yt from './youtube.js';
import * as mock from './mock.js';
import * as R from './rooms.js';
import { ROOM_CODE_RE, VIDEO_ID_RE, clean } from './util.js';

const PORT = Number(process.env.PORT) || 3001;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 10_000, pingTimeout: 20_000 });
R.bindEmitter((code, event, payload) => io.to(code).emit(event, payload));

/* ---------------- HTTP ---------------- */

// ค้นหา / วางลิงก์วิดีโอ / วางลิงก์เพลย์ลิสต์
app.get('/api/resolve', async (req, res) => {
  const q = clean(req.query.q, 500);
  if (!q) return res.json({ kind: 'search', items: [] });
  try {
    res.json(await yt.resolve(q));
  } catch (err) {
    console.error('[resolve]', err.message);
    res.status(502).json({ error: err.message || 'ค้นหาไม่สำเร็จ' });
  }
});

// ไฟล์เสียง — รอให้โหลดเสร็จก่อนค่อยส่ง (sendFile รองรับ Range สำหรับ seek)
app.get('/audio/:id', async (req, res) => {
  if (!VIDEO_ID_RE.test(req.params.id)) return res.sendStatus(404);
  try {
    const file = await yt.ensureAudio(req.params.id);
    res.set('Cache-Control', 'private, max-age=3600');
    res.sendFile(file);
  } catch (err) {
    console.error('[audio]', req.params.id, err.message);
    res.sendStatus(502);
  }
});

if (yt.MOCK) {
  app.get('/mock-thumb/:id.svg', (req, res) => {
    res.type('image/svg+xml').send(mock.thumbSvg(req.params.id));
  });
}

if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get('*', (_req, res) => res.sendFile(path.join(DIST, 'index.html')));
}

/* ---------------- Socket ---------------- */

function cleanProfile(p) {
  const id = clean(p?.id, 64);
  const name = clean(p?.name, 24);
  const avatar = { emoji: clean(p?.avatar?.emoji, 8) || '🐱', hue: Math.max(0, Math.min(360, Number(p?.avatar?.hue) || 340)) };
  if (!id || !name) return null;
  return { id, name, avatar };
}

io.on('connection', (socket) => {
  let room = null;
  let memberId = null;
  const member = () => room?.members.get(memberId);

  // wrapper: ต้องอยู่ในห้องก่อนถึงใช้คำสั่งได้
  const inRoom = (fn) => (payload, cb = () => {}) => {
    const m = member();
    if (!room || !m) return cb({ error: 'ยังไม่ได้เข้าห้อง' });
    try {
      cb(fn(m, payload) ?? { ok: true });
    } catch (err) {
      console.error('[socket]', err);
      cb({ error: 'เกิดข้อผิดพลาด' });
    }
  };

  const enter = (r, profile) => {
    if (room && room !== r) detach();
    room = r;
    memberId = profile.id;
    socket.join(r.code);
    R.joinRoom(r, profile, socket.id);
  };

  const detach = () => {
    if (!room) return;
    socket.leave(room.code);
    R.disconnectSocket(room, memberId, socket.id);
    room = null;
    memberId = null;
  };

  // วัดความต่างของนาฬิกา client/server
  socket.on('clock', (cb) => typeof cb === 'function' && cb(Date.now()));

  socket.on('room:create', (payload, cb = () => {}) => {
    const profile = cleanProfile(payload);
    if (!profile) return cb({ error: 'ข้อมูลไม่ครบ' });
    const r = R.createRoom(profile);
    enter(r, profile);
    cb({ ok: true, code: r.code, state: R.snapshot(r) });
  });

  socket.on('room:join', (payload, cb = () => {}) => {
    const profile = cleanProfile(payload);
    const code = clean(payload?.code, 8).toUpperCase();
    if (!profile) return cb({ error: 'ข้อมูลไม่ครบ' });
    const r = ROOM_CODE_RE.test(code) && R.getRoom(code);
    if (!r) return cb({ error: 'ไม่พบปาร์ตี้นี้ ลองเช็กโค้ดอีกครั้งนะ' });
    enter(r, profile);
    cb({ ok: true, code: r.code, state: R.snapshot(r) });
  });

  socket.on('room:leave', (_p, cb = () => {}) => {
    if (room) {
      const r = room;
      const id = memberId;
      detach();
      R.leaveRoom(r, id);
    }
    cb({ ok: true });
  });

  socket.on('profile:update', inRoom((m, p) => {
    const profile = cleanProfile({ ...p, id: m.id });
    if (profile) R.updateProfile(room, m.id, profile);
  }));

  socket.on('queue:add', inRoom((m, p) => R.addItems(room, m, p?.items)));
  socket.on('queue:move', inRoom((_m, p) => R.moveItem(room, p?.itemId, p?.toIndex)));
  socket.on('queue:remove', inRoom((m, p) => R.requestRemove(room, m, p?.itemId)));

  socket.on('player:play', inRoom(() => R.setPlaying(room, true)));
  socket.on('player:pause', inRoom(() => R.setPlaying(room, false)));
  socket.on('player:seek', inRoom((_m, p) => R.seek(room, p?.position)));
  socket.on('player:skip', inRoom((m) => R.requestSkip(room, m)));
  socket.on('player:ended', inRoom((_m, p) => R.reportEnded(room, p?.itemId)));

  socket.on('vote:cast', inRoom((m, p) => R.castVote(room, m, p?.proposalId)));
  socket.on('vote:cancel', inRoom((m) => R.cancelProposal(room, m)));

  socket.on('disconnect', detach);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🎧 Music Together รันที่ http://localhost:${PORT}${yt.MOCK ? '  (โหมดจำลอง MOCK_YT=1)' : ''}`);
});
