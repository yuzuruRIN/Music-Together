import React, { useEffect, useState } from 'react';
import { call, serverNow } from '../lib/socket.js';

export default function VoteBanner({ proposal, me }) {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!proposal) return;
    const tick = () => setLeft(Math.max(0, proposal.expiresAt - serverNow()));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [proposal?.id]);

  if (!proposal) return null;
  const voted = proposal.votes.includes(me);
  const mine = proposal.byId === me;
  const verb = proposal.type === 'skip' ? 'ข้ามเพลง' : 'ลบเพลงออกจากคิว';

  return (
    <div className="vote-banner card" role="alert">
      <div className="vote-text">
        <b>{mine ? 'คุณ' : proposal.byName}</b> ขอ{verb} <b>“{proposal.title}”</b>
        <span className="muted"> · เห็นด้วย {proposal.votes.length}/{proposal.needed}</span>
      </div>
      <div className="vote-actions">
        {voted ? (
          <span className="muted small">โหวตแล้ว ✓</span>
        ) : (
          <button className="primary small" onClick={() => call('vote:cast', { proposalId: proposal.id })}>
            เห็นด้วย
          </button>
        )}
        {mine && (
          <button className="ghost small" onClick={() => call('vote:cancel')}>
            ยกเลิก
          </button>
        )}
      </div>
      <div className="vote-timer" style={{ width: `${(left / 45000) * 100}%` }} />
    </div>
  );
}
