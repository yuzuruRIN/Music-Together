import { useCallback, useEffect, useRef, useState } from 'react';
import { audio, unlockAudio } from './audio.js';
import { call, serverNow } from './socket.js';

/** ตำแหน่งเพลง (วินาที) ที่ "ควร" เป็น ณ ตอนนี้ ตามนาฬิกา server */
export function targetPosition(s) {
  const p = s.playback;
  if (!p.playing) return p.position;
  return Math.min(p.position + (serverNow() - p.updatedAt) / 1000, s.current?.duration ?? Infinity);
}

const abs = (url) => new URL(url, location.href).href;

/**
 * ทำให้ <audio> ในเครื่องนี้ตรงกับสถานะกลางของห้อง (server เป็นผู้ตัดสิน)
 * - เล่น/หยุด/ข้ามเวลาตาม server และแก้ drift เมื่อเพี้ยนเกิน ~0.8 วินาที
 * - เมื่อเพลงจบ เริ่มเพลงถัดไปทันทีในเครื่อง (ไม่รอ server) เพื่อให้ต่อเนื่องแม้ปิดจอ
 * - ใช้ Media Session ให้ควบคุมจาก lock screen / หูฟังได้
 */
export function useSyncedAudio(state) {
  const [needsTap, setNeedsTap] = useState(false);
  const r = useRef({ state: null, srcItem: null, endedItem: null, noPlayUntil: 0 });
  r.current.state = state;

  const sync = useCallback(() => {
    const x = r.current;
    const s = x.state;
    if (!s) return;
    const cur = s.current;
    if (x.endedItem && cur?.id !== x.endedItem) x.endedItem = null;

    if (!cur) {
      if (!audio.paused) audio.pause();
      x.srcItem = null;
      return;
    }
    if (x.endedItem === cur.id) return; // เล่นเพลงถัดไปล่วงหน้าแล้ว รอ server ตามทัน
    if (s.loading) {
      if (!audio.paused) audio.pause();
      return;
    }
    if (x.srcItem !== cur.id) {
      x.srcItem = cur.id;
      audio.src = `/audio/${cur.videoId}`;
    }

    const want = targetPosition(s);
    const tolerance = s.playback.playing ? 0.8 : 0.3;
    if (Math.abs(audio.currentTime - want) > tolerance) {
      try {
        audio.currentTime = want;
      } catch {
        /* ยังไม่พร้อม — loadedmetadata จะเรียก sync อีกรอบ */
      }
    }

    if (s.playback.playing) {
      if (audio.paused && Date.now() > x.noPlayUntil) {
        audio
          .play()
          .then(() => setNeedsTap(false))
          .catch((e) => e?.name === 'NotAllowedError' && setNeedsTap(true));
      }
    } else if (!audio.paused) {
      audio.pause();
    }

    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = s.playback.playing ? 'playing' : 'paused';
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        try {
          navigator.mediaSession.setPositionState({
            duration: audio.duration,
            position: Math.min(audio.currentTime, audio.duration),
            playbackRate: 1,
          });
        } catch {
          /* บางเบราว์เซอร์ไม่รองรับ */
        }
      }
    }
  }, []);

  // sync เมื่อสถานะเปลี่ยน + ทุก 1 วินาที + ตอนกลับมาที่แท็บ/ปลดล็อกจอ
  useEffect(() => {
    sync();
  }, [state, sync]);

  useEffect(() => {
    const id = setInterval(sync, 1000);
    const onVisible = () => document.visibilityState === 'visible' && sync();
    document.addEventListener('visibilitychange', onVisible);
    audio.addEventListener('loadedmetadata', sync);
    audio.addEventListener('canplay', sync);

    const onEnded = () => {
      const x = r.current;
      const s = x.state;
      const cur = s?.current;
      if (!cur || x.srcItem !== cur.id || x.endedItem === cur.id) return;
      x.endedItem = cur.id;
      call('player:ended', { itemId: cur.id });
      const next = s.queue[0];
      if (next) {
        x.srcItem = next.id;
        audio.src = `/audio/${next.videoId}`;
        audio.play().catch(() => {});
      }
    };
    audio.addEventListener('ended', onEnded);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      audio.removeEventListener('loadedmetadata', sync);
      audio.removeEventListener('canplay', sync);
      audio.removeEventListener('ended', onEnded);
    };
  }, [sync]);

  // Media Session: ข้อมูลเพลงบน lock screen
  const curId = state?.current?.id;
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const cur = r.current.state?.current;
    if (!cur) {
      navigator.mediaSession.metadata = null;
      return;
    }
    navigator.mediaSession.metadata = new MediaMetadata({
      title: cur.title,
      artist: cur.channel || 'Music Together',
      album: `ปาร์ตี้ ${r.current.state.code}`,
      artwork: [{ src: abs(cur.thumb), sizes: '480x360' }],
    });
  }, [curId]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const set = (name, fn) => {
      try {
        navigator.mediaSession.setActionHandler(name, fn);
      } catch {
        /* ไม่รองรับ action นี้ */
      }
    };
    set('play', () => call('player:play'));
    set('pause', () => {
      r.current.noPlayUntil = Date.now() + 2500; // กันไม่ให้ sync สั่งเล่นสวนระหว่างรอ server
      audio.pause();
      call('player:pause');
    });
    set('nexttrack', () => call('player:skip'));
    set('seekto', (d) => d.seekTime != null && call('player:seek', { position: d.seekTime }));
    set('previoustrack', () => call('player:seek', { position: 0 }));
    return () => ['play', 'pause', 'nexttrack', 'seekto', 'previoustrack'].forEach((n) => set(n, null));
  }, []);

  const resume = useCallback(() => {
    unlockAudio();
    r.current.noPlayUntil = 0;
    sync();
  }, [sync]);

  return { needsTap, resume };
}
