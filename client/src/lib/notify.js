// แจ้งเตือนของเบราว์เซอร์ (Web Notifications ผ่าน service worker)
// ต้องเป็น HTTPS (หรือ localhost) และผู้ใช้ต้องกดอนุญาตเอง — iPhone ใช้ได้เมื่อเพิ่มเว็บลงหน้าจอโฮมเท่านั้น

export const notifySupported = () => typeof Notification !== 'undefined' && 'serviceWorker' in navigator;

export const notifyPermission = () => (notifySupported() ? Notification.permission : 'unsupported');

async function getRegistration() {
  try {
    return (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'));
  } catch {
    return null;
  }
}

/** ต้องเรียกจากการกดของผู้ใช้ */
export async function enableNotifications() {
  if (!notifySupported()) return 'unsupported';
  let permission = Notification.permission;
  if (permission === 'default') permission = await Notification.requestPermission();
  if (permission === 'granted') await getRegistration();
  return permission;
}

export async function showNotification(title, options = {}) {
  if (notifyPermission() !== 'granted') return false;
  try {
    const reg = await getRegistration();
    if (!reg) return false;
    await reg.showNotification(title, { icon: '/icon.svg', badge: '/icon.svg', renotify: true, vibrate: [200, 100, 200], ...options });
    return true;
  } catch {
    return false;
  }
}
