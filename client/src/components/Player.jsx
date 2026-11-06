import React, { useEffect, useRef, useState } from 'react';
import { audio } from '../lib/audio.js';
import { call } from '../lib/socket.js';
import { targetPosition } from '../lib/useSyncedAudio.js';
import { fmtTime } from '../lib/format.js';
import { loadVolume, saveVolume } from '../lib/storage.js';

/** แผ่นเสียง: ใช้ thumbnail เป็นหน้าแผ่น หมุนตอนเล่น หยุดหมุนตอนพัก */
export function Disc({ thumb, spinning, loading }) {
  return (
    <div className={`disc-wrap${loading ? ' is-loading' : ''}`}>
      <div className={`disc${spinning ? ' spin' : ''}`} style={thumb ? { '--thumb': `url("${thumb}")` } : undefined}>
        {!thumb && <span className="disc-empty">🎵</span>}
        <span className="disc-hole" />
      </div>
      {loading && <div className="disc-spinner" aria-label="กำลังโหลดเพลง" />}
    </div>
  );
}

function usePosition(state) {
  const [pos, setPos] = useState(0);
  useEffect(() => {
    const tick = () => setPos(state?.current ? Math.max(0, targetPosition(state)) : 0);
    tick();
    const id = setInterval(tick, 250);
    // กลับมาที่แท็บ/เปิดจอ → อัปเดตทันทีโดยไม่ต้องรอรอบถัดไป
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
    };
  }, [state]);
  return pos;
}

export default function Player({ state, needsTap, onResume }) {
  const cur = state.current;
  const playing = !!cur && !state.loading && state.playback.playing;
  const pos = usePosition(state);
  const [dragging, setDragging] = useState(null); // ตำแหน่งที่กำลังลากแถบ
  const [volume, setVolume] = useState(loadVolume);

  // ลากแถบเวลา: ส่ง seek เมื่อปล่อย — บนมือถือเหตุการณ์ปล่อยนิ้วบางทีไม่มา (pointercancel) จึงมี timer สำรอง
  // ไม่งั้น dragging ค้าง แล้วตัวเลขเวลาจะหยุดนิ่งอยู่กับที่
  const dragRef = useRef(null);
  const dragTimer = useRef(null);
  const commitSeek = () => {
    clearTimeout(dragTimer.current);
    if (dragRef.current != null) call('player:seek', { position: dragRef.current });
    dragRef.current = null;
    setDragging(null);
  };
  const onSeekChange = (e) => {
    const v = Number(e.target.value);
    dragRef.current = v;
    setDragging(v);
    clearTimeout(dragTimer.current);
    dragTimer.current = setTimeout(commitSeek, 700);
  };
  useEffect(() => () => clearTimeout(dragTimer.current), []);

  useEffect(() => {
    audio.volume = volume;
    saveVolume(volume);
  }, [volume]);

  const shown = dragging ?? pos;

  return (
    <div className="card player">
      <Disc thumb={cur?.thumb} spinning={playing} loading={!!cur && state.loading} />

      <div className="now">
        {cur ? (
          <>
            <h2 className="title" title={cur.title}>{cur.title}</h2>
            <p className="muted sub">
              {cur.channel && <span>{cur.channel} · </span>}เพิ่มโดย {cur.addedByName}
            </p>
            {state.loading && <p className="loading-line">⏳ กำลังเตรียมเพลง… รอสักครู่นะ</p>}
          </>
        ) : (
          <>
            <h2 className="title">ยังไม่มีเพลง</h2>
            <p className="muted sub">ค้นหาหรือวางลิงก์ YouTube เพื่อเริ่มเพลงแรก 🎶</p>
          </>
        )}
      </div>

      <div className="seek">
        <span className="time">{fmtTime(shown)}</span>
        <input
          type="range"
          min="0"
          max={cur?.duration || 1}
          step="1"
          value={Math.min(shown, cur?.duration || 1)}
          disabled={!cur || state.loading}
          onChange={onSeekChange}
          onPointerUp={commitSeek}
          onPointerCancel={commitSeek}
          onTouchEnd={commitSeek}
          onMouseUp={commitSeek}
          onKeyUp={commitSeek}
          onBlur={commitSeek}
          style={{ '--pct': `${cur ? (Math.min(shown, cur.duration) / cur.duration) * 100 : 0}%` }}
          aria-label="ตำแหน่งเพลง"
        />
        <span className="time">{fmtTime(cur?.duration ?? 0)}</span>
      </div>

      <div className="controls">
        <button
          className="round main"
          disabled={!cur || state.loading}
          onClick={() => call(playing ? 'player:pause' : 'player:play')}
          aria-label={playing ? 'หยุดชั่วคราว' : 'เล่น'}
        >
          {playing ? '⏸' : '▶'}
        </button>
        <button className="round" disabled={!cur} onClick={() => call('player:skip')} aria-label="ข้ามเพลง (ต้องโหวต)" title="ข้ามเพลง (ต้องโหวต)">
          ⏭
        </button>
        <label className="volume" title="ระดับเสียงเฉพาะเครื่องนี้">
          🔈
          <input type="range" min="0" max="1" step="0.05" value={volume} onChange={(e) => setVolume(Number(e.target.value))} aria-label="ระดับเสียง" />
        </label>
      </div>

      {needsTap && (
        <button className="tap-overlay" onClick={onResume}>
          🔊 แตะเพื่อเริ่มฟังเสียง
        </button>
      )}
    </div>
  );
}
