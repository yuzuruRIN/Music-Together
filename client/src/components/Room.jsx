import React, { useCallback, useEffect, useRef, useState } from 'react';
import Avatar from './Avatar.jsx';
import Player from './Player.jsx';
import AddSong from './AddSong.jsx';
import Queue from './Queue.jsx';
import Chat from './Chat.jsx';
import VoteBanner from './VoteBanner.jsx';
import { call, socket } from '../lib/socket.js';
import { copyText } from '../lib/format.js';
import { useSyncedAudio } from '../lib/useSyncedAudio.js';
import { enableNotifications, notifyPermission, showNotification } from '../lib/notify.js';

const MAX_CHAT = 200;
const isNarrow = () => window.matchMedia('(max-width: 859px)').matches;

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
            {m.id === state.hostId && <span title="หัวหน้าปาร์ตี้">👑</span>}
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
  const isHost = state.hostId === me;
  const [tab, setTab] = useState('queue');
  const [messages, setMessages] = useState([]);
  const [unread, setUnread] = useState(0);
  const [perm, setPerm] = useState(notifyPermission);
  const { needsTap, resume } = useSyncedAudio(state);

  const tabRef = useRef(tab);
  tabRef.current = tab;

  const inviteUrl = `${location.origin}/join/${state.code}`;

  /* ---------- แชท (เก็บแค่ในหน้านี้ ไม่มีประวัติ) ---------- */
  useEffect(() => {
    const onChat = (msg) => {
      setMessages((list) => [...list.slice(-(MAX_CHAT - 1)), msg]);
      if (msg.memberId !== me && isNarrow() && tabRef.current !== 'chat') setUnread((n) => n + 1);
    };
    socket.on('chat', onChat);
    return () => socket.off('chat', onChat);
  }, [me]);

  const sendChat = async (text) => {
    const res = await call('chat:send', { text });
    if (res.error) toast(res.error);
  };

  const openTab = (t) => {
    setTab(t);
    if (t === 'chat') setUnread(0);
  };

  /* ---------- แจ้งเตือนเมื่อมีคนขอโหวต (เผื่อปิดจอ/อยู่เบื้องหลัง) ---------- */
  const seenProposal = useRef(null);
  const proposal = state.proposal;
  useEffect(() => {
    if (!proposal || proposal.id === seenProposal.current) return;
    seenProposal.current = proposal.id;
    if (proposal.byId === me || document.visibilityState === 'visible') return;
    const what = proposal.type === 'skip' ? 'ข้ามเพลง' : 'ลบเพลงออกจากคิว';
    showNotification(`${proposal.byName} ขอ${what}`, {
      body: `“${proposal.title}” — แตะ “เห็นด้วย” เพื่อโหวต`,
      tag: `vote-${proposal.id}`,
      data: { proposalId: proposal.id },
      actions: [{ action: 'agree', title: 'เห็นด้วย' }],
    });
    navigator.vibrate?.([200, 100, 200]);
  }, [proposal, me]);

  // กด "เห็นด้วย" จากตัวแจ้งเตือน → service worker ส่งต่อมาให้หน้านี้โหวต
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (e) => {
      if (e.data?.type === 'vote' && e.data.proposalId) call('vote:cast', { proposalId: e.data.proposalId });
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);

  const onBell = async () => {
    if (perm === 'unsupported') return toast('เบราว์เซอร์นี้ยังไม่รองรับแจ้งเตือน (iPhone ต้องเพิ่มเว็บลงหน้าจอโฮมก่อน)', 6000);
    if (perm === 'denied') return toast('แจ้งเตือนถูกบล็อกไว้ — เปิดได้ที่การตั้งค่าไซต์ในเบราว์เซอร์', 6000);
    if (perm === 'granted') return toast('เปิดแจ้งเตือนอยู่แล้ว 🔔 จะเตือนเมื่อมีคนขอโหวตตอนปิดจอ');
    const result = await enableNotifications();
    setPerm(result);
    toast(result === 'granted' ? 'เปิดแจ้งเตือนแล้ว 🔔' : 'ยังไม่ได้เปิดแจ้งเตือน');
  };

  /* ---------- คิว ---------- */
  const add = useCallback(
    async (items) => {
      const res = await call('queue:add', { items });
      if (res.error) {
        toast(res.error);
        return false;
      }
      // อยู่หน้า "เพิ่มเพลง" ต่อ จะได้เพิ่มรัวๆ — ไม่สลับแท็บเอง
      toast(items.length > 1 ? `เพิ่ม ${res.added} เพลงเข้าคิวแล้ว` : `เพิ่ม “${items[0].title}” แล้ว`);
      return true;
    },
    [toast]
  );

  /* ---------- ชวนเพื่อน / ออก / ยุบ ---------- */
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

  const disband = async () => {
    if (!window.confirm('ยุบปาร์ตี้นี้? ทุกคนจะถูกพากลับหน้าแรก และคิวเพลงจะหายทั้งหมด')) return;
    const res = await call('room:disband');
    if (res.error) toast(res.error);
  };

  const people = state.members.filter((m) => m.online).length;

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
          <button className="ghost small hide-sm" onClick={() => copy(inviteUrl, 'ลิงก์เชิญ')}>
            คัดลอกลิงก์
          </button>
          <button
            className={`ghost small bell${perm === 'granted' ? ' on' : ''}`}
            onClick={onBell}
            title="แจ้งเตือนเมื่อมีคนขอโหวตข้าม/ลบเพลง"
            aria-label="แจ้งเตือนโหวต"
          >
            {perm === 'granted' ? '🔔' : '🔕'}
          </button>
          {isHost && (
            <button className="ghost small danger-text" onClick={disband} title="ปิดปาร์ตี้นี้ทิ้ง (เฉพาะหัวหน้า)">
              ยุบปาร์ตี้
            </button>
          )}
          <button className="ghost small" onClick={onLeave}>
            ออก
          </button>
        </div>
      </header>

      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'queue'} className={tab === 'queue' ? 'on' : ''} onClick={() => openTab('queue')}>
          คิว{state.queue.length ? ` (${state.queue.length})` : ''}
        </button>
        <button role="tab" aria-selected={tab === 'add'} className={tab === 'add' ? 'on' : ''} onClick={() => openTab('add')}>
          เพิ่มเพลง
        </button>
        <button role="tab" aria-selected={tab === 'chat'} className={tab === 'chat' ? 'on' : ''} onClick={() => openTab('chat')}>
          แชท{unread > 0 && <span className="badge">{unread > 9 ? '9+' : unread}</span>}
        </button>
        <button role="tab" aria-selected={tab === 'people'} className={tab === 'people' ? 'on' : ''} onClick={() => openTab('people')}>
          เพื่อน ({people})
        </button>
      </div>

      <main className="room-grid">
        <section className="col-left">
          <Player state={state} needsTap={needsTap} onResume={resume} />
          <div className={`panel panel-people ${tab === 'people' ? 'active' : ''}`}>
            <Members state={state} me={me} onEditProfile={onEditProfile} />
          </div>
          <div className={`panel panel-chat ${tab === 'chat' ? 'active' : ''}`}>
            <Chat messages={messages} me={me} onSend={sendChat} active={tab === 'chat'} />
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
