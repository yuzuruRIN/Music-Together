import React, { useEffect, useRef, useState } from 'react';
import Avatar from './Avatar.jsx';

/** แชทปาร์ตี้ — ไม่เก็บประวัติ: ข้อความอยู่แค่ในหน้านี้ ปิดหรือรีเฟรชแล้วหาย คนที่เข้าทีหลังไม่เห็นของเก่า */
export default function Chat({ messages, me, onSend, active }) {
  const [text, setText] = useState('');
  const listRef = useRef(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, active]);

  const submit = (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText('');
  };

  return (
    <div className="card chat">
      <div className="chat-head">
        <h3>แชทปาร์ตี้</h3>
        <span className="muted small">ไม่เก็บประวัติ</span>
      </div>

      <ul className="chat-list" ref={listRef} aria-live="polite">
        {messages.length === 0 && <li className="chat-empty muted small">ยังไม่มีข้อความ ทักทายเพื่อนๆ ได้เลย 👋</li>}
        {messages.map((m) => (
          <li key={m.id} className={m.memberId === me ? 'mine' : ''}>
            {m.memberId !== me && <Avatar avatar={m.avatar} size={28} />}
            <div className="bubble-wrap">
              {m.memberId !== me && <span className="chat-name muted small">{m.name}</span>}
              <span className="bubble">{m.text}</span>
            </div>
          </li>
        ))}
      </ul>

      <form className="chat-form" onSubmit={submit}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="พิมพ์ข้อความ…" maxLength={300} aria-label="พิมพ์ข้อความแชท" autoComplete="off" />
        <button className="primary" disabled={!text.trim()} aria-label="ส่ง">
          ส่ง
        </button>
      </form>
    </div>
  );
}
