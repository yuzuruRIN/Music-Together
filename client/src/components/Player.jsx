import React, { useEffect, useState } from 'react';
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
    const tick = () => setPos(state?.current ? targetPosition(state) : 0);
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [state]);
  return pos;
}

export default function Player({ state, needsTap, onResume }) {
  const cur = state.current;
  const playing = !!cur && !state.loading && state.playback.playing;
  const pos = usePosition(state);
  const [dragging, setDragging] = useState(null); // ตำแหน่งที่กำลังลากแถบ
  const [volume, setVolume] = useState(loadVolume);

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
          onChange={(e) => setDragging(Number(e.target.value))}
          onPointerUp={() => {
            if (dragging != null) call('player:seek', { position: dragging });
            setDragging(null);
          }}
          onKeyUp={() => {
            if (dragging != null) call('player:seek', { position: dragging });
            setDragging(null);
          }}
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
