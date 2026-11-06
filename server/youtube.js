// ตัวกลางคุยกับ YouTube ผ่าน yt-dlp: ค้นหา / อ่านเพลย์ลิสต์ / ดาวน์โหลดเสียงมาเก็บไว้เล่น
// ไม่ต้องใช้ API key — แต่ต้องมี yt-dlp ติดตั้งในเครื่อง server
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VIDEO_ID_RE } from './util.js';
import * as mock from './mock.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CACHE_DIR = process.env.CACHE_DIR || path.join(ROOT, 'cache');
fs.mkdirSync(CACHE_DIR, { recursive: true });

export const MOCK = process.env.MOCK_YT === '1';
const AUDIO_EXTS = ['m4a', 'mp3', 'webm', 'opus', 'ogg', 'wav'];

function findYtDlp() {
  if (process.env.YTDLP_PATH) return process.env.YTDLP_PATH;
  const local = [
    path.join(ROOT, '.venv', 'Scripts', 'yt-dlp.exe'),
    path.join(ROOT, '.venv', 'bin', 'yt-dlp'),
  ].find((p) => fs.existsSync(p));
  return local || 'yt-dlp';
}
const YTDLP = findYtDlp();
const BASE_ARGS = ['--js-runtimes', 'node', '--no-warnings', '--no-colors', '--socket-timeout', '20'];

// YouTube มักถามให้ยืนยันว่าไม่ใช่บอท (โดยเฉพาะ IP ที่ถูกจับตา) — แนบ cookies ของเบราว์เซอร์ได้ผ่าน env:
//   YTDLP_COOKIES=/path/cookies.txt           ไฟล์ cookies รูปแบบ Netscape
//   YTDLP_COOKIES_FROM_BROWSER=firefox        ให้ yt-dlp อ่านจากเบราว์เซอร์ตรงๆ (firefox / chrome / edge ...)
//   YTDLP_EXTRA_ARGS="--extractor-args youtube:player_client=tv"   อาร์กิวเมนต์เพิ่มเติมอื่นๆ
if (process.env.YTDLP_COOKIES) {
  // yt-dlp เขียนทับไฟล์ cookies ตอนจบงาน แต่ Secret Files ของ Render เป็น read-only → คัดลอกไปที่เขียนได้ก่อน
  let cookiesFile = process.env.YTDLP_COOKIES;
  try {
    const copy = path.join(os.tmpdir(), 'music-together-cookies.txt');
    fs.copyFileSync(cookiesFile, copy);
    cookiesFile = copy;
  } catch (e) {
    console.error('[cookies] คัดลอกไฟล์ cookies ไม่ได้ ใช้ไฟล์เดิมแทน:', e.message);
  }
  BASE_ARGS.push('--cookies', cookiesFile);
} else if (process.env.YTDLP_COOKIES_FROM_BROWSER) BASE_ARGS.push('--cookies-from-browser', process.env.YTDLP_COOKIES_FROM_BROWSER);
if (process.env.YTDLP_EXTRA_ARGS) BASE_ARGS.push(...process.env.YTDLP_EXTRA_ARGS.split(/\s+/).filter(Boolean));

/** แปลงข้อความ error ของ yt-dlp ที่พบบ่อยให้อ่านรู้เรื่อง (ข้อความเดิมยังถูก log ฝั่ง server) */
export function friendlyError(message) {
  const m = String(message || '');
  if (/confirm you.?re not a bot|--cookies/i.test(m)) {
    return 'YouTube ขอให้ยืนยันว่าไม่ใช่บอท — ต้องตั้งค่า cookies ให้ yt-dlp (ดูหัวข้อ "YouTube ขอยืนยันตัวตน" ใน README)';
  }
  if (/Video unavailable|Private video|This video is not available/i.test(m)) return 'วิดีโอนี้เปิดไม่ได้ (ถูกลบ เป็นส่วนตัว หรือจำกัดพื้นที่)';
  if (/Sign in to confirm your age|age-restricted/i.test(m)) return 'วิดีโอนี้จำกัดอายุ ต้องใช้ cookies ที่ล็อกอินไว้';
  return m;
}

/* ---------- จำกัดจำนวน process yt-dlp ที่รันพร้อมกัน ---------- */
function makeLimiter(max) {
  let active = 0;
  const waiting = [];
  const next = () => {
    active--;
    waiting.shift()?.();
  };
  return (fn) =>
    new Promise((resolve, reject) => {
      const go = () => {
        active++;
        fn().then(resolve, reject).finally(next);
      };
      if (active < max) go();
      else waiting.push(go);
    });
}
const infoLimit = makeLimiter(4);
const downloadLimit = makeLimiter(2);

function run(args, { timeout = 60_000, limit = infoLimit } = {}) {
  const queuedAt = Date.now();
  const label = String(args.find((a) => /^(ytsearch|https?:)/.test(a)) ?? args[0]).slice(0, 70);
  return limit(
    () =>
      new Promise((resolve, reject) => {
        const t0 = Date.now();
        const secs = (ms) => (ms / 1000).toFixed(1) + 's';
        const child = spawn(YTDLP, [...BASE_ARGS, ...args], {
          windowsHide: true,
          env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
        });
        let out = '';
        let err = '';
        const timer = setTimeout(() => {
          child.kill();
          reject(new Error('yt-dlp หมดเวลา'));
        }, timeout);
        child.stdout.on('data', (d) => (out += d));
        child.stderr.on('data', (d) => (err += d));
        child.on('error', (e) => {
          clearTimeout(timer);
          reject(e.code === 'ENOENT' ? new Error('ไม่พบ yt-dlp บนเครื่อง server') : e);
        });
        child.on('close', (code) => {
          clearTimeout(timer);
          // log เวลา: รอคิว + รันจริง — ไว้ดูว่าช้าเพราะอะไร
          console.log(`[yt-dlp] ${code === 0 ? 'ok' : 'FAIL'} run ${secs(Date.now() - t0)} (รอคิว ${secs(t0 - queuedAt)}) ${label}`);
          if (code === 0) resolve(out);
          else {
            const raw = err.trim().split('\n').pop() || `yt-dlp ออกด้วยรหัส ${code}`;
            console.error('[yt-dlp]', raw);
            reject(new Error(friendlyError(raw)));
          }
        });
      })
  );
}

/* ---------- แปลงสิ่งที่ผู้ใช้พิมพ์/วางเป็นประเภทที่ชัดเจน ---------- */
export function parseInput(raw) {
  const text = String(raw ?? '').trim();
  let url = null;
  try {
    if (/^https?:\/\//i.test(text)) url = new URL(text);
    else if (/^(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//i.test(text)) url = new URL('https://' + text);
  } catch {
    url = null;
  }
  if (url) {
    const host = url.hostname.replace(/^(www\.|m\.|music\.)/, '');
    const list = url.searchParams.get('list');
    const validList = list && /^[\w-]{10,64}$/.test(list) ? list : null;
    if (host === 'youtu.be') {
      const id = url.pathname.slice(1).split('/')[0];
      if (VIDEO_ID_RE.test(id)) return { kind: 'video', id, list: validList };
    }
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (url.pathname === '/playlist' && validList) return { kind: 'playlist', list: validList };
      const v = url.searchParams.get('v');
      if (v && VIDEO_ID_RE.test(v)) return { kind: 'video', id: v, list: validList };
      const m = url.pathname.match(/^\/(shorts|live|embed)\/([\w-]{11})/);
      if (m) return { kind: 'video', id: m[2], list: validList };
      if (validList) return { kind: 'playlist', list: validList };
    }
  }
  return { kind: 'search', q: text };
}

export const thumbUrl = (id) => (mock.isMockId(id) ? `/mock-thumb/${id}.svg` : `https://i.ytimg.com/vi/${id}/hqdefault.jpg`);

const toItem = (e) => ({
  videoId: e.id ?? e.videoId,
  title: e.title,
  channel: e.channel || e.uploader || '',
  duration: Math.round(e.duration || 0),
  thumb: thumbUrl(e.id ?? e.videoId),
});
const usable = (e) =>
  e && VIDEO_ID_RE.test(e.videoId) && e.duration > 0 && !/^\[(Private|Deleted) video\]$/i.test(e.title || '');

/* ---------- ค้นหา / อ่านลิงก์ ---------- */
export async function search(q) {
  if (MOCK) return mock.search(q).map(toItem).filter(usable);
  const out = await run(['--flat-playlist', '-J', `ytsearch10:${q}`]);
  return (JSON.parse(out).entries || []).map(toItem).filter(usable);
}

const META_FMT = '%(.{id,title,duration,channel,uploader})j';

function parseMeta(out) {
  const item = toItem(JSON.parse(out.trim().split('\n')[0]));
  if (!usable(item)) throw new Error('ไม่รองรับวิดีโอนี้ (อาจเป็นไลฟ์สด หรือเล่นไม่ได้)');
  return item;
}

// metadata ของวิดีโอที่เพิ่งโหลดเสียงมา (ได้มาพร้อมกันในรอบเดียว)
const metaCache = new Map();
const remember = (id, item) => {
  metaCache.set(id, item);
  if (metaCache.size > 300) metaCache.delete(metaCache.keys().next().value);
};

export async function getVideo(id) {
  if (MOCK) return toItem(mock.video(id));
  const hit = metaCache.get(id);
  if (hit) return hit;
  // ลิงก์ที่วางมักถูกเพิ่มเข้าคิวต่อทันที → โหลดเสียงพร้อมอ่านชื่อ/ความยาวในรอบเดียว
  // (เดิมต้องดึงข้อมูลจาก YouTube 2 รอบ: ตอนวางลิงก์ และตอนจะเล่น ซึ่งช้ามากบนเครื่องที่ CPU น้อย)
  await ensureAudio(id);
  const warmed = metaCache.get(id);
  if (warmed) return warmed;
  // มีไฟล์ในแคชอยู่แล้วแต่ไม่มี metadata (เช่น server เพิ่งรีสตาร์ท)
  const out = await run(['--skip-download', '--no-playlist', '--print', META_FMT, `https://www.youtube.com/watch?v=${id}`]);
  const item = parseMeta(out);
  remember(id, item);
  return item;
}

export async function getPlaylist(list) {
  if (MOCK) {
    const p = mock.playlist(list);
    return { title: p.title, items: p.items.map(toItem) };
  }
  const out = await run(['--flat-playlist', '-J', '--playlist-end', '100', `https://www.youtube.com/playlist?list=${list}`], { timeout: 90_000 });
  const j = JSON.parse(out);
  const items = (j.entries || []).map(toItem).filter(usable);
  if (!items.length) throw new Error('เปิดเพลย์ลิสต์ไม่ได้ (ต้องเป็นสาธารณะหรือไม่เป็นรายการส่วนตัว)');
  return { title: j.title || 'เพลย์ลิสต์', items };
}

export async function resolve(input) {
  const parsed = parseInput(input);
  if (parsed.kind === 'video') {
    return { kind: 'video', items: [await getVideo(parsed.id)], playlistId: parsed.list && !/^RD/.test(parsed.list) ? parsed.list : null };
  }
  if (parsed.kind === 'playlist') {
    const p = await getPlaylist(parsed.list);
    return { kind: 'playlist', title: p.title, items: p.items };
  }
  if (parsed.q.length < 1) return { kind: 'search', items: [] };
  return { kind: 'search', items: await search(parsed.q) };
}

/** resolve + จำผลค้นหา/เพลย์ลิสต์ไว้ 10 นาที (เพื่อนค้นคำเดียวกัน หรือค้นซ้ำ จะได้ไม่ต้องรอ YouTube อีก) */
const resolveCache = new Map();
const RESOLVE_TTL = 10 * 60_000;

export async function resolveCached(input) {
  const parsed = parseInput(input);
  if (parsed.kind === 'video') return resolve(input);
  const key = parsed.kind === 'playlist' ? `pl:${parsed.list}` : `q:${parsed.q.toLowerCase()}`;
  const hit = resolveCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = await resolve(input);
  resolveCache.set(key, { value, expires: Date.now() + RESOLVE_TTL });
  if (resolveCache.size > 100) resolveCache.delete(resolveCache.keys().next().value);
  return value;
}

/* ---------- ไฟล์เสียง ---------- */
export function findCached(id) {
  for (const ext of AUDIO_EXTS) {
    const p = path.join(CACHE_DIR, `${id}.${ext}`);
    try {
      if (fs.statSync(p).size > 0) {
        const now = new Date();
        fs.utimesSync(p, now, now); // ต่ออายุแคช
        return p;
      }
    } catch {
      /* ยังไม่มีไฟล์ */
    }
  }
  return null;
}

const inflight = new Map();

/** คืน path ไฟล์เสียงของวิดีโอ — โหลดมาเก็บก่อนถ้ายังไม่มี (เรียกซ้ำพร้อมกันจะใช้ promise เดียวกัน) */
export function ensureAudio(id) {
  if (!VIDEO_ID_RE.test(id)) return Promise.reject(new Error('video id ไม่ถูกต้อง'));
  const cached = findCached(id);
  if (cached) return Promise.resolve(cached);
  if (inflight.has(id)) return inflight.get(id);
  const job = (MOCK && mock.isMockId(id) ? mock.makeAudio(id, CACHE_DIR) : download(id)).finally(() => inflight.delete(id));
  inflight.set(id, job);
  return job;
}

async function download(id) {
  // --print + --no-simulate: โหลดไฟล์จริงและพิมพ์ metadata ออกมาด้วยในครั้งเดียว
  const out = await run(
    [
      '-f', '140/bestaudio[ext=m4a]/bestaudio',
      '--no-playlist', '--no-simulate', '--print', META_FMT,
      '-o', path.join(CACHE_DIR, `${id}.%(ext)s`),
      `https://www.youtube.com/watch?v=${id}`,
    ],
    { timeout: 240_000, limit: downloadLimit }
  );
  try {
    remember(id, parseMeta(out));
  } catch {
    /* ไม่มี metadata ก็ไม่เป็นไร ตัวไฟล์ยังใช้ได้ */
  }
  const file = findCached(id);
  if (!file) throw new Error('ดาวน์โหลดเสียงไม่สำเร็จ');
  return file;
}

/** ลบไฟล์แคชที่เก่าและไม่ได้อยู่ในคิวของห้องไหนแล้ว */
export function cleanupCache(inUseIds, maxAgeMs = 12 * 60 * 60 * 1000) {
  const cutoff = Date.now() - maxAgeMs;
  for (const name of fs.readdirSync(CACHE_DIR)) {
    const id = name.split('.')[0];
    if (inUseIds.has(id)) continue;
    const full = path.join(CACHE_DIR, name);
    try {
      if (fs.statSync(full).mtimeMs < cutoff) fs.unlinkSync(full);
    } catch {
      /* ข้าม */
    }
  }
}
