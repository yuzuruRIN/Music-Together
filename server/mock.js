// โหมดจำลอง (MOCK_YT=1) — ไว้ทดสอบระบบโดยไม่ต้องต่อ YouTube จริง
// สร้างเสียงโน้ตสั้นๆ แทนเพลง เพื่อทดสอบการซิงก์ คิว และการโหวต
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const sha = (s) => crypto.createHash('sha1').update(s).digest('hex');

export const mockId = (seed) => 'mk' + sha(seed).slice(0, 9);
export const isMockId = (id) => /^mk[0-9a-f]{9}$/.test(id);
export const mockDuration = (id) => 15 + (parseInt(id.slice(2, 4), 16) % 15); // 15–29 วินาที

const item = (id, title) => ({
  videoId: id,
  title,
  channel: 'Mock Channel',
  duration: mockDuration(id),
});

export function search(q) {
  return Array.from({ length: 8 }, (_, i) => item(mockId(`${q}#${i}`), `${q} — เพลงทดลอง ${i + 1}`));
}

export function video(id) {
  return item(id, `เพลงทดลอง ${id.slice(2, 6)}`);
}

export function playlist(list) {
  return {
    title: `เพลย์ลิสต์ทดลอง ${list}`,
    items: Array.from({ length: 6 }, (_, i) => item(mockId(`${list}#${i}`), `${list} — แทร็ก ${i + 1}`)),
  };
}

export function thumbSvg(id) {
  const h = parseInt(id.slice(2, 5), 16) % 360;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 360">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="hsl(${h},85%,82%)"/><stop offset="1" stop-color="hsl(${(h + 60) % 360},80%,70%)"/></linearGradient></defs>
<rect width="480" height="360" fill="#111"/>
<rect y="45" width="480" height="270" fill="url(#g)"/>
<text x="240" y="205" font-size="110" text-anchor="middle">🎵</text></svg>`;
}

/** สร้างไฟล์ WAV เสียงไซน์ (โน้ตไล่ระดับ) ตามความยาวของเพลง */
export async function makeAudio(id, dir) {
  await new Promise((r) => setTimeout(r, 600)); // จำลองเวลาดาวน์โหลด
  const rate = 8000;
  const seconds = mockDuration(id);
  const base = 220 + (parseInt(id.slice(2, 4), 16) % 12) * 30;
  const samples = rate * seconds;
  const buf = Buffer.alloc(44 + samples * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    const t = i / rate;
    const note = base * [1, 1.25, 1.5, 1.25][Math.floor(t) % 4];
    const env = 0.5 * (1 - (t % 1) * 0.6);
    buf.writeInt16LE(Math.round(Math.sin(2 * Math.PI * note * t) * env * 12000), 44 + i * 2);
  }
  const final = path.join(dir, `${id}.wav`);
  const tmp = `${final}.tmp`;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, final);
  return final;
}
