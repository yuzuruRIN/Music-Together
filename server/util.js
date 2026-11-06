import crypto from 'node:crypto';

// ตัดตัวอักษรที่อ่านสับสน (0/O, 1/I/L) ออก
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function randomCode(len = 5) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export const uid = () => crypto.randomBytes(6).toString('hex');

/** ล้าง control character และจำกัดความยาวของข้อความจาก client */
export function clean(value, max) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max);
}

export const VIDEO_ID_RE = /^[\w-]{11}$/;
export const ROOM_CODE_RE = /^[A-Z0-9]{4,8}$/;
