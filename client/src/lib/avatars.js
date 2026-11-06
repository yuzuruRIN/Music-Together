// ไอคอนโปรไฟล์: อีโมจิสัตว์น่ารัก + สีพื้นพาสเทล (เลือกได้/สุ่มได้ ไม่มีอัปโหลด)
export const EMOJIS = [
  '🐱', '🐶', '🐰', '🐻', '🐼', '🦊', '🐨', '🐯', '🐮', '🐷', '🐸', '🐵',
  '🐔', '🐧', '🐤', '🦄', '🐙', '🦋', '🐢', '🐳', '🦉', '🐹', '🦦', '🐝',
];
export const HUES = [340, 10, 35, 150, 190, 260, 300];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const randomAvatar = () => ({ emoji: pick(EMOJIS), hue: pick(HUES) });
