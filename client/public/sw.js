// Service worker เล็กๆ — ใช้แสดงแจ้งเตือน (โหวตข้าม/ลบเพลง) ตอนหน้าเว็บอยู่เบื้องหลังหรือปิดจอ
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const win = wins[0];
      if (event.action === 'agree' && data.proposalId) {
        // กด "เห็นด้วย" จากแจ้งเตือน: ส่งต่อให้หน้าเว็บโหวต โดยไม่ต้องดึงแอปขึ้นมาหน้าจอ
        if (win) return win.postMessage({ type: 'vote', proposalId: data.proposalId });
      }
      if (win) return win.focus();
      return self.clients.openWindow('/');
    })()
  );
});
