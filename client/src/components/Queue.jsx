import React from 'react';
import { call } from '../lib/socket.js';
import { fmtTime } from '../lib/format.js';

export default function Queue({ state, onError }) {
  const { queue } = state;
  const total = queue.reduce((s, i) => s + i.duration, 0);

  const move = (id, to) => call('queue:move', { itemId: id, toIndex: to });
  const remove = async (id) => {
    const res = await call('queue:remove', { itemId: id });
    if (res.error) onError(res.error);
  };

  return (
    <div className="card queue">
      <div className="queue-head">
        <h3>คิวเพลง</h3>
        <span className="muted small">
          {queue.length ? `${queue.length} เพลง · ${fmtTime(total)}` : ''}
        </span>
      </div>

      {queue.length === 0 ? (
        <div className="empty">
          <div className="empty-emoji">🎶</div>
          <p>คิวว่างอยู่ ใส่ลิงก์หรือค้นหาเพลงได้เลย</p>
        </div>
      ) : (
        <ol className="queue-list">
          {queue.map((it, i) => (
            <li key={it.id}>
              <span className="idx">{i + 1}</span>
              <img src={it.thumb} alt="" loading="lazy" />
              <div className="meta">
                <div className="t" title={it.title}>{it.title}</div>
                <div className="muted small">{fmtTime(it.duration)} · โดย {it.addedByName}</div>
              </div>
              <div className="actions">
                <button className="icon-btn" disabled={i === 0} onClick={() => move(it.id, 0)} title="เล่นเป็นเพลงถัดไป" aria-label="เล่นเป็นเพลงถัดไป">
                  ⤒
                </button>
                <button className="icon-btn" disabled={i === 0} onClick={() => move(it.id, i - 1)} title="เลื่อนขึ้น" aria-label="เลื่อนขึ้น">
                  ▲
                </button>
                <button className="icon-btn" disabled={i === queue.length - 1} onClick={() => move(it.id, i + 1)} title="เลื่อนลง" aria-label="เลื่อนลง">
                  ▼
                </button>
                <button className="icon-btn danger" onClick={() => remove(it.id)} title="ลบออกจากคิว (ต้องโหวต)" aria-label="ลบออกจากคิว (ต้องโหวต)">
                  🗑
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
