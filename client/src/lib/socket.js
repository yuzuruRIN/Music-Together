import { io } from 'socket.io-client';

export const socket = io({ autoConnect: true, transports: ['websocket', 'polling'] });

/** emit แบบรอผลลัพธ์ (ack) */
export function call(event, payload, timeout = 8000) {
  return new Promise((resolve) => {
    if (!socket.connected) return resolve({ error: 'ยังเชื่อมต่อเซิร์ฟเวอร์ไม่ได้' });
    socket.timeout(timeout).emit(event, payload, (err, res) => resolve(err ? { error: 'เซิร์ฟเวอร์ไม่ตอบสนอง' } : res ?? {}));
  });
}

/* ---------- นาฬิกา: ความต่างระหว่างเวลา server กับเครื่องเรา ---------- */
let offset = 0; // serverTime ≈ Date.now() + offset
export const serverNow = () => Date.now() + offset;

export async function syncClock(samples = 5) {
  let best = null;
  for (let i = 0; i < samples; i++) {
    const t0 = Date.now();
    const server = await new Promise((resolve) => {
      if (!socket.connected) return resolve(null);
      socket.timeout(3000).emit('clock', (err, t) => resolve(err ? null : t));
    });
    const t1 = Date.now();
    if (server == null) continue;
    const rtt = t1 - t0;
    if (!best || rtt < best.rtt) best = { rtt, offset: server + rtt / 2 - t1 };
  }
  if (best) offset = best.offset;
}

socket.on('connect', () => {
  syncClock();
});
setInterval(() => socket.connected && syncClock(3), 30_000);
