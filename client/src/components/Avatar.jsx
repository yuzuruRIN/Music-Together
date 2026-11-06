import React from 'react';

export default function Avatar({ avatar, size = 40, dim = false, ring = false }) {
  const hue = avatar?.hue ?? 340;
  return (
    <span
      className={`avatar${dim ? ' dim' : ''}${ring ? ' ring' : ''}`}
      style={{ width: size, height: size, fontSize: size * 0.58, background: `hsl(${hue} 90% 90%)`, borderColor: `hsl(${hue} 80% 80%)` }}
      aria-hidden="true"
    >
      {avatar?.emoji ?? '🐱'}
    </span>
  );
}
