import React, { useRef, useState } from 'react';
import { fmtTime } from '../lib/format.js';

export default function AddSong({ onAdd }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null); // {kind, items, title?, playlistId?}
  const seq = useRef(0);

  const resolve = async (text) => {
    const mine = ++seq.current;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/resolve?q=${encodeURIComponent(text)}`);
      const data = await res.json().catch(() => ({}));
      if (mine !== seq.current) return null; // มีการค้นใหม่แล้ว
      if (!res.ok) throw new Error(data.error || 'ค้นหาไม่สำเร็จ');
      return data;
    } catch (err) {
      if (mine === seq.current) setError(err.message || 'ค้นหาไม่สำเร็จ');
      return null;
    } finally {
      if (mine === seq.current) setBusy(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    const text = q.trim();
    if (!text) return;
    const data = await resolve(text);
    if (!data) return;
    if (data.kind === 'video') {
      // วางลิงก์วิดีโอ → เพิ่มเข้าคิวเลย
      onAdd(data.items);
      setQ('');
      setResult(data.playlistId ? { ...data, added: true } : null);
    } else {
      setResult(data);
      if (!data.items.length) setError('ไม่พบเพลงที่ตรงกัน ลองเปลี่ยนคำค้นดูนะ');
    }
  };

  const addPlaylistFromVideo = async () => {
    const data = await resolve(`https://www.youtube.com/playlist?list=${result.playlistId}`);
    if (data) {
      setResult(data);
      setQ('');
    }
  };

  return (
    <div className="card add-song">
      <form className="search" onSubmit={submit}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ค้นหาเพลง หรือวางลิงก์ YouTube / YouTube Music / เพลย์ลิสต์"
          aria-label="ค้นหาเพลงหรือวางลิงก์"
          enterKeyHint="search"
        />
        <button className="primary" disabled={busy || !q.trim()}>
          {busy ? '…' : '🔍'}
        </button>
      </form>

      {busy && (
        <p className="muted small hint">
          {/^(https?:\/\/|(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\/)/i.test(q.trim())
            ? '⏳ กำลังเตรียมเพลง… ลิงก์เพลงใหม่อาจใช้เวลาสักครู่'
            : '🔍 กำลังค้นหา…'}
        </p>
      )}
      {error && <p className="error">{error}</p>}

      {result?.kind === 'video' && result.added && (
        <div className="result-head">
          <span>เพิ่มเพลงเข้าคิวแล้ว ✓</span>
          <button className="ghost small" onClick={addPlaylistFromVideo} disabled={busy}>
            ลิงก์นี้อยู่ในเพลย์ลิสต์ — เพิ่มทั้งเพลย์ลิสต์
          </button>
        </div>
      )}

      {result && result.kind !== 'video' && result.items.length > 0 && (
        <>
          <div className="result-head">
            <span>
              {result.kind === 'playlist' ? (
                <>
                  💿 {result.title} <span className="muted">· {result.items.length} เพลง</span>
                </>
              ) : (
                'ผลการค้นหา'
              )}
            </span>
            {result.kind === 'playlist' && (
              <button
                className="primary small"
                onClick={() => {
                  onAdd(result.items);
                  setResult(null);
                }}
              >
                เพิ่มทั้งหมด
              </button>
            )}
            <button className="ghost small" onClick={() => setResult(null)} aria-label="ปิดผลการค้นหา">
              ✕
            </button>
          </div>
          <ul className="results">
            {result.items.map((it, i) => (
              <li key={`${it.videoId}-${i}`}>
                <img src={it.thumb} alt="" loading="lazy" />
                <div className="meta">
                  <div className="t" title={it.title}>{it.title}</div>
                  <div className="muted small">{it.channel}{it.channel && ' · '}{fmtTime(it.duration)}</div>
                </div>
                <button className="round small" onClick={() => onAdd([it])} aria-label={`เพิ่ม ${it.title} เข้าคิว`}>
                  ＋
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
