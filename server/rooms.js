// สถานะของปาร์ตี้ทั้งหมด (เก็บในหน่วยความจำ — ปาร์ตี้เป็นข้อมูลชั่วคราว)
import { ensureAudio, thumbUrl, cleanupCache } from './youtube.js';
import { VIDEO_ID_RE, clean, randomCode, uid } from './util.js';

const MEMBER_GRACE_MS = 25_000; // หลุดออนไลน์เกินนี้ถือว่าออกจากห้อง
// ทุกคนกดออกเอง → ลบห้องทันที / ทุกคนแค่หลุดออนไลน์ (ปิดแท็บ ฯลฯ) → ลบหลังจากนี้
const EMPTY_ROOM_MS = 60_000;
const PROPOSAL_MS = 45_000;
const MAX_QUEUE = 200;
const END_GRACE_S = 3; // รอ client รายงานจบเพลงก่อน server ตัดเองเมื่อเกินเวลานี้

const rooms = new Map();
let emit = () => {}; // ถูก set จาก index.js: (code, event, payload) => void
export const bindEmitter = (fn) => (emit = fn);

const now = () => Date.now();

/* ---------------- ห้อง / สมาชิก ---------------- */

export function createRoom(profile) {
  let code;
  do code = randomCode(5);
  while (rooms.has(code));
  const room = {
    code,
    hostId: profile.id,
    closed: false,
    members: new Map(),
    queue: [],
    current: null,
    loading: false,
    playback: { playing: false, position: 0, updatedAt: now() },
    proposal: null,
    endTimer: null,
    emptyTimer: null,
  };
  rooms.set(code, room);
  return room;
}

export const getRoom = (code) => rooms.get(code);

export function joinRoom(room, profile, socketId) {
  clearTimeout(room.emptyTimer);
  let m = room.members.get(profile.id);
  if (!m) {
    m = { id: profile.id, sockets: new Set(), leaveTimer: null };
    room.members.set(profile.id, m);
  }
  clearTimeout(m.leaveTimer);
  m.name = profile.name;
  m.avatar = profile.avatar;
  m.sockets.add(socketId);
  broadcast(room);
  return m;
}

export function updateProfile(room, memberId, profile) {
  const m = room.members.get(memberId);
  if (!m) return;
  m.name = profile.name;
  m.avatar = profile.avatar;
  broadcast(room);
}

/** socket หลุด — รอสักครู่เผื่อรีเฟรช/สัญญาณมือถือสะดุด แล้วค่อยเอาออกจากห้อง */
export function disconnectSocket(room, memberId, socketId) {
  const m = room.members.get(memberId);
  if (!m) return;
  m.sockets.delete(socketId);
  if (m.sockets.size) return;
  broadcast(room);
  m.leaveTimer = setTimeout(() => removeMember(room, memberId), MEMBER_GRACE_MS);
}

export function leaveRoom(room, memberId) {
  removeMember(room, memberId, true);
}

function removeMember(room, memberId, explicit = false) {
  if (room.closed) return;
  const m = room.members.get(memberId);
  if (!m || m.sockets.size) return;
  clearTimeout(m.leaveTimer);
  room.members.delete(memberId);
  if (room.hostId === memberId) room.hostId = room.members.keys().next().value ?? null;
  if (room.proposal) room.proposal.votes.delete(memberId);
  checkProposal(room);
  if (!room.members.size) {
    clearTimeout(room.emptyTimer);
    if (explicit) return teardown(room); // ทุกคนกดออกแล้ว → เคลียร์ห้องทิ้งทันที
    room.emptyTimer = setTimeout(() => destroyRoom(room), EMPTY_ROOM_MS);
  }
  broadcast(room);
}

function destroyRoom(room) {
  if (room.members.size) return;
  teardown(room);
}

/** ปิดห้อง: หยุด timer ทั้งหมดแล้วลบออกจากหน่วยความจำ */
function teardown(room) {
  room.closed = true;
  clearTimeout(room.endTimer);
  clearTimeout(room.emptyTimer);
  clearTimeout(room.proposal?.timer);
  for (const m of room.members.values()) clearTimeout(m.leaveTimer);
  if (rooms.get(room.code) === room) rooms.delete(room.code);
}

/** หัวหน้ายุบปาร์ตี้ — ทุกคนถูกพากลับหน้าแรก */
export function disbandRoom(room, memberId) {
  if (room.hostId !== memberId) return { error: 'เฉพาะหัวหน้าปาร์ตี้เท่านั้นที่ยุบได้' };
  emit(room.code, 'room:closed', { text: 'หัวหน้ายุบปาร์ตี้แล้ว' });
  teardown(room);
  return { ok: true };
}

/** แชทแบบไม่เก็บประวัติ: server แค่กระจายข้อความต่อ ไม่บันทึกอะไรไว้ */
export function sendChat(room, member, rawText) {
  const text = clean(rawText, 300);
  if (!text) return { error: 'ข้อความว่างเปล่า' };
  const t = now();
  member.chatTimes = (member.chatTimes ?? []).filter((x) => t - x < 5000);
  if (member.chatTimes.length >= 6) return { error: 'พิมพ์เร็วไปหน่อย รอสักครู่นะ' };
  member.chatTimes.push(t);
  emit(room.code, 'chat', { id: uid(), memberId: member.id, name: member.name, avatar: member.avatar, text, at: t });
  return { ok: true };
}

const onlineIds = (room) => [...room.members.values()].filter((m) => m.sockets.size).map((m) => m.id);

/* ---------------- การเล่น ---------------- */

export function positionOf(room) {
  const p = room.playback;
  if (!p.playing) return p.position;
  const max = room.current?.duration ?? Infinity;
  return Math.min(p.position + (now() - p.updatedAt) / 1000, max);
}

function setPlayback(room, playing, position) {
  room.playback = { playing, position, updatedAt: now() };
  scheduleEnd(room);
}

/** ตั้งเวลาสำรองให้ server ข้ามเพลงเองถ้าไม่มี client รายงานว่าจบ (เช่นทุกคนปิดจอ) */
function scheduleEnd(room) {
  clearTimeout(room.endTimer);
  room.endTimer = null;
  const cur = room.current;
  if (!cur || room.loading || !room.playback.playing) return;
  const ms = Math.max(0, cur.duration - positionOf(room) + END_GRACE_S) * 1000;
  room.endTimer = setTimeout(() => advance(room, cur.id), ms);
}

function advance(room, itemId) {
  if (room.current?.id !== itemId) return;
  startNext(room);
}

function startNext(room) {
  clearTimeout(room.endTimer);
  room.current = room.queue.shift() ?? null;
  dropStaleProposal(room);
  if (!room.current) {
    room.loading = false;
    room.playback = { playing: false, position: 0, updatedAt: now() };
  } else {
    beginCurrent(room);
  }
  broadcast(room);
}

function beginCurrent(room) {
  const item = room.current;
  room.loading = true;
  room.playback = { playing: false, position: 0, updatedAt: now() };
  ensureAudio(item.videoId)
    .then(() => {
      if (room.current?.id !== item.id) return;
      room.loading = false;
      setPlayback(room, true, 0);
      broadcast(room);
      prefetch(room);
    })
    .catch((err) => {
      if (room.current?.id !== item.id) return;
      notice(room, `เล่น "${item.title}" ไม่ได้ (${err.message}) — ข้ามไปเพลงถัดไป`);
      startNext(room);
    });
}

function prefetch(room) {
  for (const it of room.queue.slice(0, 2)) ensureAudio(it.videoId).catch(() => {});
}

export function setPlaying(room, playing) {
  if (!room.current || room.loading) return;
  setPlayback(room, playing, positionOf(room));
  broadcast(room);
}

export function seek(room, position) {
  if (!room.current || room.loading) return;
  const pos = Math.max(0, Math.min(Number(position) || 0, room.current.duration - 1));
  setPlayback(room, room.playback.playing, pos);
  broadcast(room);
}

/** client รายงานว่าเล่นจบ — รับเฉพาะรายงานแรกของเพลงนั้น และเมื่อใกล้จบจริงๆ */
export function reportEnded(room, itemId) {
  const cur = room.current;
  if (!cur || cur.id !== itemId || room.loading) return;
  if (positionOf(room) < cur.duration - 6) return;
  advance(room, itemId);
}

/* ---------------- คิว ---------------- */

export function addItems(room, member, rawItems) {
  const items = (Array.isArray(rawItems) ? rawItems : []).slice(0, 100);
  let added = 0;
  for (const raw of items) {
    if (room.queue.length >= MAX_QUEUE) break;
    const duration = Math.round(Number(raw?.duration));
    if (!VIDEO_ID_RE.test(raw?.videoId ?? '') || !(duration > 0 && duration < 6 * 3600)) continue;
    room.queue.push({
      id: uid(),
      videoId: raw.videoId,
      title: clean(raw.title, 200) || 'ไม่มีชื่อ',
      channel: clean(raw.channel, 100),
      duration,
      thumb: thumbUrl(raw.videoId),
      addedById: member.id,
      addedByName: member.name,
    });
    added++;
  }
  if (!added) return { error: 'ไม่มีเพลงที่เพิ่มได้' };
  if (!room.current) startNext(room);
  else {
    prefetch(room);
    broadcast(room);
  }
  return { ok: true, added };
}

export function moveItem(room, itemId, toIndex) {
  const from = room.queue.findIndex((i) => i.id === itemId);
  if (from < 0) return;
  const to = Math.max(0, Math.min(Number(toIndex) | 0, room.queue.length - 1));
  const [it] = room.queue.splice(from, 1);
  room.queue.splice(to, 0, it);
  prefetch(room);
  broadcast(room);
}

/* ---------------- โหวต (ลบเพลง / ข้ามเพลง) ---------------- */

const needed = (room) => Math.floor(onlineIds(room).length / 2) + 1;
const findItem = (room, id) => (room.current?.id === id ? room.current : room.queue.find((i) => i.id === id));

export function requestSkip(room, member) {
  if (!room.current) return { error: 'ยังไม่มีเพลงที่กำลังเล่น' };
  return startProposal(room, member, 'skip', room.current.id);
}

export function requestRemove(room, member, itemId) {
  if (!findItem(room, itemId)) return { error: 'ไม่พบเพลงนี้แล้ว' };
  return startProposal(room, member, room.current?.id === itemId ? 'skip' : 'remove', itemId);
}

function startProposal(room, member, type, itemId) {
  if (room.proposal) return { error: 'มีการโหวตค้างอยู่ รอให้เสร็จก่อนนะ' };
  const p = {
    id: uid(),
    type,
    itemId,
    byId: member.id,
    byName: member.name,
    votes: new Set([member.id]),
    expiresAt: now() + PROPOSAL_MS,
    timer: null,
  };
  p.timer = setTimeout(() => {
    if (room.proposal !== p) return;
    room.proposal = null;
    notice(room, 'โหวตหมดเวลา เพลงยังอยู่เหมือนเดิม');
    broadcast(room);
  }, PROPOSAL_MS);
  room.proposal = p;
  checkProposal(room);
  broadcast(room);
  return { ok: true };
}

export function castVote(room, member, proposalId) {
  const p = room.proposal;
  if (!p || p.id !== proposalId) return;
  p.votes.add(member.id);
  checkProposal(room);
  broadcast(room);
}

export function cancelProposal(room, member) {
  const p = room.proposal;
  if (!p || p.byId !== member.id) return;
  clearTimeout(p.timer);
  room.proposal = null;
  broadcast(room);
}

function checkProposal(room) {
  const p = room.proposal;
  if (!p) return;
  const online = new Set(onlineIds(room));
  const yes = [...p.votes].filter((id) => online.has(id)).length;
  if (yes < needed(room)) return;
  clearTimeout(p.timer);
  room.proposal = null;
  const item = findItem(room, p.itemId);
  if (!item) return;
  if (p.type === 'skip') {
    notice(room, `ข้าม "${item.title}" แล้ว`);
    startNext(room);
  } else {
    notice(room, `ลบ "${item.title}" ออกจากคิวแล้ว`);
    room.queue = room.queue.filter((i) => i.id !== item.id);
  }
}

function dropStaleProposal(room) {
  const p = room.proposal;
  if (p && !findItem(room, p.itemId)) {
    clearTimeout(p.timer);
    room.proposal = null;
  }
}

/* ---------------- ส่งสถานะให้ทุกคน ---------------- */

function notice(room, text) {
  emit(room.code, 'notice', { text });
}

export function snapshot(room) {
  const online = new Set(onlineIds(room));
  const p = room.proposal;
  const target = p && findItem(room, p.itemId);
  return {
    code: room.code,
    hostId: room.hostId,
    serverNow: now(),
    members: [...room.members.values()].map((m) => ({ id: m.id, name: m.name, avatar: m.avatar, online: online.has(m.id) })),
    current: room.current,
    loading: room.loading,
    queue: room.queue,
    playback: room.playback,
    proposal: p && target
      ? {
          id: p.id,
          type: p.type,
          itemId: p.itemId,
          title: target.title,
          byId: p.byId,
          byName: p.byName,
          votes: [...p.votes].filter((id) => online.has(id)),
          needed: needed(room),
          expiresAt: p.expiresAt,
        }
      : null,
  };
}

export function broadcast(room) {
  emit(room.code, 'state', snapshot(room));
}

/* ---------------- เก็บกวาดแคชเสียง ---------------- */

setInterval(() => {
  const inUse = new Set();
  for (const r of rooms.values()) {
    if (r.current) inUse.add(r.current.videoId);
    for (const i of r.queue) inUse.add(i.videoId);
  }
  try {
    cleanupCache(inUse);
  } catch {
    /* ไม่เป็นไร */
  }
}, 30 * 60_000).unref();
