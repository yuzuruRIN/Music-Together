// <audio> ตัวเดียวที่ใช้ทั้งแอป — ปลดล็อกครั้งแรกด้วยการแตะของผู้ใช้ แล้วเปลี่ยนเพลงได้เรื่อยๆ
// (เล่นผ่าน <audio> ไม่ใช่ iframe เพื่อให้เสียงเล่นต่อได้ตอนปิดจอ/พับแอปบนมือถือ)
export const audio = new Audio();
audio.preload = 'auto';
audio.setAttribute('playsinline', '');
window.__mtAudio = audio; // ไว้ดีบัก/ทดสอบ

const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
let unlocked = false;

/** ต้องเรียกจาก event handler ที่เกิดจากการแตะ/คลิกของผู้ใช้ (iOS/Chrome บังคับ) */
export function unlockAudio() {
  if (unlocked) return;
  unlocked = true;
  if (audio.src) return; // มีเพลงจริงตั้งไว้แล้ว ไม่ต้องแตะ
  audio.src = SILENT;
  audio
    .play()
    .then(() => {
      if (audio.src === SILENT) audio.pause();
    })
    .catch(() => {
      unlocked = false;
    });
}

export function stopAudio() {
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
}
