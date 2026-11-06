// เก็บข้อมูลในเครื่อง (localStorage) — ห่อ try/catch เผื่อโหมดส่วนตัวที่ใช้ไม่ได้
const read = (key, fallback) => {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ไม่เป็นไร */
  }
};

const newId = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`).slice(0, 36);

/** ตัวตน guest ประจำเครื่องนี้ (id คงที่ เพื่อให้รีเฟรชแล้วยังเป็นคนเดิมในห้อง) */
export function loadProfile() {
  const p = read('mt_profile', null);
  return p?.id ? p : null;
}

export function saveProfile(profile) {
  write('mt_profile', profile);
  const names = read('mt_names', []).filter((n) => n !== profile.name);
  write('mt_names', [profile.name, ...names].slice(0, 6));
}

export const loadNames = () => read('mt_names', []);
export const getClientId = () => {
  let id = read('mt_client_id', null);
  if (!id) {
    id = newId();
    write('mt_client_id', id);
  }
  return id;
};

export const loadRoom = () => read('mt_room', null);
export const saveRoom = (code) => write('mt_room', code);
export const loadVolume = () => read('mt_volume', 0.9);
export const saveVolume = (v) => write('mt_volume', v);
