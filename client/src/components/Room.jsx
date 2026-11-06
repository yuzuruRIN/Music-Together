import React, { useState } from 'react';
import Avatar from './Avatar.jsx';
import Player from './Player.jsx';
import AddSong from './AddSong.jsx';
import Queue from './Queue.jsx';
import VoteBanner from './VoteBanner.jsx';
import { call } from '../lib/socket.js';
import { copyText } from '../lib/format.js';
import { useSyncedAudio } from '../lib/useSyncedAudio.js';

function Members({ state, me, onEditProfile }) {
  return (
    <div className="card members">
      <h3>
        ในปาร์ตี้ <span className="muted small">{state.members.filter((m) => m.online).length} คน</span>
      </h3>
      <ul>
        {state.members.map((m) => (
          <li key={m.id} className={m.online ? '' : 'offline'}>
            <Avatar avatar={m.avatar} size={36} dim={!m.online} />
            <span className="name">
              {m.name}
              {m.id === me && <span className="muted small"> (คุณ)</span>}
            </span>
            {m.id === state.hostId && <span title="คนสร้างปาร์ตี้">👑</span>}
            {!m.online && <span className="muted small">หลุดชั่วคราว</span>}
            {m.id === me && (
              <button className="ghost small" onClick={onEditProfile}>
                แก้ไข
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Room({ state, profile, connected, onLeave, onEditProfile, toast }) {
  const me = profile.id;
  const [tab, setTab] = useState('queue');
  const { needsTap, resume } = useSyncedAudio(state);

  const inviteUrl = `${location.origin}/join/${state.code}`;

  const add = async (items) => {
    const res = await call('queue:add', { items });
    if (res.error) return toast(res.error);
    toast(items.length > 1 ? `เพิ่ม ${res.added} เพลงเข้าคิวแล้ว` : `เพิ่ม “${items[0].title}” แล้ว`);
    setTab('queue');
  };

  const copy = async (text, label) => toast((await copyText(text)) ? `คัดลอก${label}แล้ว` : `คัดลอกไม่ได้ — ${text}`);

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'มาฟังเพลงด้วยกัน 🎧', text: `เข้าปาร์ตี้ ${state.code}`, url: inviteUrl });
        return;
      } catch (e) {
        if (e?.name === 'AbortError') return;
      }
    }
    copy(inviteUrl, 'ลิงก์เชิญ');
  };

  return (
    <div className="room">
      {!connected && <div className="offline-bar">กำลังเชื่อมต่อใหม่…</div>}

      <header className="room-head">
        <div className="brand">
          <span className="logo-sm">🎧</span>
          <button className="code-chip" onClick={() => copy(state.code, 'โค้ด')} title="คัดลอกโค้ดปาร์ตี้">
            <span className="muted small">โค้ด</span>
            <b>{state.code}</b>
          </button>
        </div>
        <div className="head-actions">
          <button className="secondary small" onClick={share}>
            🔗 ชวนเพื่อน
          </button>
          <button className="ghost small" onClick={() => copy(inviteUrl, 'ลิงก์เชิญ')}>
            คัดลอกลิงก์
          </button>
          <button className="ghost small" onClick={onLeave}>
            ออก
          </button>
        </div>
      </header>

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'queue'} className={tab === 'queue' ? 'on' : ''} onClick={() => setTab('queue')}>
          คิวเพลง{state.queue.length ? ` (${state.queue.length})` : ''}
        </button>
        <button role="tab" aria-selected={tab === 'add'} className={tab === 'add' ? 'on' : ''} onClick={() => setTab('add')}>
          เพิ่มเพลง
        </button>
        <button role="tab" aria-selected={tab === 'people'} className={tab === 'people' ? 'on' : ''} onClick={() => setTab('people')}>
          เพื่อนๆ ({state.members.filter((m) => m.online).length})
        </button>
      </div>

      <main className="room-grid">
        <section className="col-left">
          <Player state={state} needsTap={needsTap} onResume={resume} />
          <div className={`panel panel-people ${tab === 'people' ? 'active' : ''}`}>
            <Members state={state} me={me} onEditProfile={onEditProfile} />
          </div>
        </section>
        <section className="col-right">
          <div className={`panel panel-add ${tab === 'add' ? 'active' : ''}`}>
            <AddSong onAdd={add} />
          </div>
          <div className={`panel panel-queue ${tab === 'queue' ? 'active' : ''}`}>
            <Queue state={state} onError={toast} />
          </div>
        </section>
      </main>

      <VoteBanner proposal={state.proposal} me={me} />
    </div>
  );
}
