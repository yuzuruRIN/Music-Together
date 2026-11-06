import React, { useState } from 'react';
import Avatar from './Avatar.jsx';
import { ProfileForm } from './Profile.jsx';

export function Welcome({ profile, invite, onSubmit, error }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="screen center">
      <div className="card hero">
        <div className="logo">🎧</div>
        <h1>Music Together</h1>
        <p className="muted">ฟังเพลงพร้อมกันกับเพื่อน ไม่ต้องสมัครสมาชิก</p>
        {invite && <div className="invite-note">คุณได้รับคำเชิญเข้าปาร์ตี้ <b>{invite}</b></div>}
        <ProfileForm
          initial={profile}
          busy={busy}
          error={error}
          submitLabel={invite ? `เข้าร่วมปาร์ตี้ ${invite}` : 'ไปต่อ'}
          onSubmit={async (p) => {
            setBusy(true);
            await onSubmit(p);
            setBusy(false);
          }}
        />
      </div>
    </div>
  );
}

export function Lobby({ profile, onCreate, onJoin, onEditProfile, error }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const wrap = (fn) => async () => {
    setBusy(true);
    await fn();
    setBusy(false);
  };

  return (
    <div className="screen center">
      <div className="card hero">
        <button className="me-chip" onClick={onEditProfile} title="แก้ไขโปรไฟล์">
          <Avatar avatar={profile.avatar} size={32} />
          <span>{profile.name}</span>
          <span className="muted small">แก้ไข</span>
        </button>
        <h1>เริ่มฟังด้วยกัน</h1>

        <button className="primary big" disabled={busy} onClick={wrap(onCreate)}>
          ✨ สร้างปาร์ตี้ใหม่
        </button>

        <div className="divider">หรือ</div>

        <form
          className="join-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) wrap(() => onJoin(code.trim().toUpperCase()))();
          }}
        >
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            maxLength={8}
            placeholder="ใส่โค้ดปาร์ตี้"
            aria-label="โค้ดปาร์ตี้"
            className="code-input"
            autoCapitalize="characters"
            autoComplete="off"
          />
          <button className="secondary" disabled={busy || code.length < 4}>
            เข้าร่วม
          </button>
        </form>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
