import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Welcome, Lobby } from './components/Welcome.jsx';
import Room from './components/Room.jsx';
import { ProfileModal } from './components/Profile.jsx';
import { Toasts, useToasts } from './components/Toasts.jsx';
import { call, socket } from './lib/socket.js';
import { stopAudio, unlockAudio } from './lib/audio.js';
import { getClientId, loadProfile, loadRoom, saveProfile, saveRoom } from './lib/storage.js';

function readInvite() {
  const m = location.pathname.match(/^\/join\/([A-Za-z0-9]{4,8})/);
  return m ? m[1].toUpperCase() : null;
}

export default function App() {
  const invite = useMemo(readInvite, []);
  const [profile, setProfile] = useState(loadProfile);
  const [stage, setStage] = useState(() => {
    if (!loadProfile() || invite) return 'welcome';
    return loadRoom() ? 'joining' : 'lobby';
  });
  const [state, setState] = useState(null);
  const [connected, setConnected] = useState(socket.connected);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const { toasts, push } = useToasts();

  const codeRef = useRef(null); // ห้องที่อยู่ตอนนี้ (ไว้เข้าห้องใหม่อัตโนมัติเมื่อเน็ตหลุด)
  const profileRef = useRef(profile);
  profileRef.current = profile;

  const enterRoom = useCallback((code, initialState) => {
    codeRef.current = code;
    saveRoom(code);
    if (initialState) setState(initialState);
    setStage('room');
    setError('');
    if (location.pathname !== '/') history.replaceState(null, '', '/');
  }, []);

  const join = useCallback(
    async (code, prof = profileRef.current) => {
      const res = await call('room:join', { ...prof, code });
      if (res.error) return res;
      enterRoom(res.code, res.state);
      return res;
    },
    [enterRoom]
  );

  const leaveToLobby = useCallback((message) => {
    codeRef.current = null;
    saveRoom(null);
    setState(null);
    stopAudio();
    setStage('lobby');
    if (message) setError(message);
  }, []);

  /* ---------- socket events ---------- */
  useEffect(() => {
    const onState = (s) => s.code === codeRef.current && setState(s);
    const onNotice = (n) => push(n.text);
    const onConnect = async () => {
      setConnected(true);
      if (codeRef.current) {
        const res = await call('room:join', { ...profileRef.current, code: codeRef.current });
        if (res.error) leaveToLobby(res.error);
        else if (res.state) setState(res.state);
      }
    };
    const onDisconnect = () => setConnected(false);
    const onClosed = (n) => {
      leaveToLobby();
      push(n?.text || 'ปาร์ตี้ถูกยุบแล้ว', 5000);
    };
    socket.on('room:closed', onClosed);
    socket.on('state', onState);
    socket.on('notice', onNotice);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    return () => {
      socket.off('room:closed', onClosed);
      socket.off('state', onState);
      socket.off('notice', onNotice);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [push, leaveToLobby]);

  // เปิดเว็บใหม่ขณะยังมีห้องค้างอยู่ → กลับเข้าห้องเดิม
  useEffect(() => {
    if (stage !== 'joining') return;
    const go = async () => {
      const res = await join(loadRoom());
      if (res.error) {
        saveRoom(null);
        setStage('lobby');
      }
    };
    if (socket.connected) go();
    else socket.once('connect', go);
    return () => socket.off('connect', go);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- actions ---------- */
  const onWelcome = async ({ name, avatar }) => {
    const prof = { id: getClientId(), name, avatar };
    saveProfile(prof);
    setProfile(prof);
    unlockAudio();
    if (invite) {
      const res = await join(invite, prof);
      if (res.error) setError(res.error);
    } else {
      setError('');
      setStage('lobby');
    }
  };

  const onCreate = async () => {
    unlockAudio();
    const res = await call('room:create', profile);
    if (res.error) return setError(res.error);
    enterRoom(res.code, res.state);
  };

  const onJoin = async (code) => {
    unlockAudio();
    const res = await join(code);
    if (res.error) setError(res.error);
  };

  const onLeave = async () => {
    await call('room:leave');
    leaveToLobby();
  };

  const onSaveProfile = ({ name, avatar }) => {
    const prof = { id: profile.id, name, avatar };
    saveProfile(prof);
    setProfile(prof);
    setEditing(false);
    if (codeRef.current) call('profile:update', prof);
  };

  /* ---------- render ---------- */
  let view;
  if (stage === 'room' && state) {
    view = <Room state={state} profile={profile} connected={connected} onLeave={onLeave} onEditProfile={() => setEditing(true)} toast={push} />;
  } else if (stage === 'lobby' && profile) {
    view = <Lobby profile={profile} onCreate={onCreate} onJoin={onJoin} onEditProfile={() => setEditing(true)} error={error} />;
  } else if (stage === 'welcome') {
    view = <Welcome profile={profile} invite={invite} onSubmit={onWelcome} error={error} />;
  } else {
    view = (
      <div className="screen center">
        <div className="loading-note">กำลังเข้าห้อง…</div>
      </div>
    );
  }

  return (
    <>
      {view}
      {editing && profile && <ProfileModal profile={profile} onSave={onSaveProfile} onClose={() => setEditing(false)} />}
      <Toasts toasts={toasts} />
    </>
  );
}
