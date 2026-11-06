import React, { useState } from 'react';
import Avatar from './Avatar.jsx';
import { EMOJIS, HUES, randomAvatar } from '../lib/avatars.js';
import { loadNames } from '../lib/storage.js';

/** ฟอร์มกรอกชื่อ + เลือกไอคอน (ใช้ทั้งหน้าแรกและตอนแก้โปรไฟล์) */
export function ProfileForm({ initial, submitLabel, onSubmit, busy, error, children }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [avatar, setAvatar] = useState(initial?.avatar ?? randomAvatar());
  const [picking, setPicking] = useState(false);
  const names = loadNames().filter((n) => n !== name);

  const submit = (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed) onSubmit({ name: trimmed.slice(0, 24), avatar });
  };

  return (
    <form className="profile-form" onSubmit={submit}>
      <div className="avatar-pick">
        <button type="button" className="avatar-big" onClick={() => setPicking((v) => !v)} aria-label="เลือกไอคอน">
          <Avatar avatar={avatar} size={88} />
          <span className="avatar-edit">✎</span>
        </button>
        <button type="button" className="ghost small" onClick={() => setAvatar(randomAvatar())}>
          🎲 สุ่มใหม่
        </button>
      </div>

      {picking && (
        <div className="picker" role="group" aria-label="เลือกไอคอน">
          <div className="emoji-grid">
            {EMOJIS.map((e) => (
              <button type="button" key={e} className={e === avatar.emoji ? 'on' : ''} onClick={() => setAvatar({ ...avatar, emoji: e })}>
                {e}
              </button>
            ))}
          </div>
          <div className="hue-row">
            {HUES.map((h) => (
              <button
                type="button"
                key={h}
                className={h === avatar.hue ? 'on' : ''}
                style={{ background: `hsl(${h} 90% 85%)` }}
                onClick={() => setAvatar({ ...avatar, hue: h })}
                aria-label={`สี ${h}`}
              />
            ))}
          </div>
        </div>
      )}

      <label className="field">
        <span>ชื่อของคุณ</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="เช่น มะนาว" autoFocus autoComplete="nickname" />
      </label>

      {names.length > 0 && (
        <div className="chips" aria-label="ชื่อที่เคยใช้ในเครื่องนี้">
          <span className="muted small">เคยใช้:</span>
          {names.map((n) => (
            <button type="button" key={n} className="chip" onClick={() => setName(n)}>
              {n}
            </button>
          ))}
        </div>
      )}

      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={!name.trim() || busy}>
        {busy ? 'รอสักครู่…' : submitLabel}
      </button>
      {children}
    </form>
  );
}

export function ProfileModal({ profile, onSave, onClose }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal card" role="dialog" aria-modal="true" aria-label="แก้ไขโปรไฟล์">
        <h2>แก้ไขโปรไฟล์</h2>
        <ProfileForm initial={profile} submitLabel="บันทึก" onSubmit={onSave}>
          <button type="button" className="ghost" onClick={onClose}>
            ยกเลิก
          </button>
        </ProfileForm>
      </div>
    </div>
  );
}
