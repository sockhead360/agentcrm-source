import React, { useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'agentcrm_emoji_history';
const MAX_RECENT = 16;

const EMOJI_SECTIONS = [
  {
    label: '⭐ Favorites',
    emojis: ['⭐','🌟','💎','🏆','🎯','🔥','💰','💵','🏠','🏡','🔑','✅','❌','📋','📞','🤝'],
  },
  {
    label: '😊 Faces',
    emojis: ['😊','😀','😁','😂','😍','🥰','😎','🤩','😏','🤔','😐','😬','😅','😰','😱','😡','🤬','😤','😢','😔','🥹','😴','🤯','🥳','🤗','🤭','😇','🙃','🫡','😈','🤑','🙄'],
  },
  {
    label: '👍 Hands',
    emojis: ['👍','👎','👋','👀','🤝','🙌','👏','🫶','✌️','🤞','🫰','☝️','👆','👇','💪','🫵'],
  },
  {
    label: '🏠 Real Estate',
    emojis: ['🏠','🏡','🏚️','🏗️','🔑','🪟','🚪','🛠️','🔨','🪚','🏘️','🏢','🏦','📍','🗺️','📐'],
  },
  {
    label: '💰 Money',
    emojis: ['💰','💵','💸','🤑','💲','💳','🏧','📈','📉','📊','🪙','💹','🎰','💡','⚡','🔋'],
  },
  {
    label: '📅 Time',
    emojis: ['⏰','📅','🗓️','⏳','⌛','🕐','🕑','🕒','🕓','🕔','🕕','🕙','📆','🔄','⬆️','⬇️'],
  },
  {
    label: '⚠️ Status',
    emojis: ['✅','❌','⚠️','🛑','❓','❗','💬','📱','📝','📋','🔍','🔎','📌','📎','🗒️','📣'],
  },
  {
    label: '1️⃣ Numbers',
    emojis: ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟','🅰️','🅱️','🆗','🆕','🆙','🆓'],
  },
  {
    label: '🔵 Colors',
    emojis: ['🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤','🔶','🔷','🔸','🔹','🟥','🟩','🟦'],
  },
];

function getRecent() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}

function pushRecent(emoji) {
  const prev = getRecent().filter(e => e !== emoji);
  const next = [emoji, ...prev].slice(0, MAX_RECENT);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export default function EmojiPicker({ x, y, onSelect, onClose }) {
  const ref = useRef(null);
  const [recent, setRecent] = useState(getRecent);
  const [activeSection, setActiveSection] = useState(recent.length > 0 ? -1 : 0);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Clamp position so panel stays on screen
  const panelW = 260;
  const panelH = 320;
  const left = Math.min(x, window.innerWidth - panelW - 8);
  const top  = Math.min(y, window.innerHeight - panelH - 8);

  const handleSelect = (emoji) => {
    pushRecent(emoji);
    setRecent(getRecent());
    onSelect(emoji);
  };

  const sections = recent.length > 0
    ? [{ label: '🕐 Recent', emojis: recent }, ...EMOJI_SECTIONS]
    : EMOJI_SECTIONS;

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left,
        top,
        width: panelW,
        height: panelH,
        zIndex: 9999,
        background: 'var(--win-gray)',
        border: '2px solid',
        borderTopColor: 'var(--border-hi)',
        borderLeftColor: 'var(--border-hi)',
        borderRightColor: 'var(--border-sh)',
        borderBottomColor: 'var(--border-sh)',
        boxShadow: '2px 2px 6px rgba(0,0,0,0.4)',
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
      }}
    >
      {/* Title bar */}
      <div style={{
        background: 'var(--title-b)',
        color: '#fff',
        padding: '3px 8px',
        fontFamily: 'var(--font-ui)',
        fontSize: 11,
        fontWeight: 'bold',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexShrink: 0,
      }}>
        <span>Tag Conversation</span>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 2px' }}
        >×</button>
      </div>

      {/* Section tabs */}
      <div style={{
        display: 'flex',
        overflowX: 'auto',
        borderBottom: '1px solid var(--border-sh)',
        flexShrink: 0,
        background: 'var(--win-white)',
        scrollbarWidth: 'none',
      }}>
        {sections.map((s, i) => (
          <button
            key={i}
            onClick={() => setActiveSection(i)}
            title={s.label}
            style={{
              background: activeSection === i ? 'var(--win-gray)' : 'transparent',
              border: 'none',
              borderBottom: activeSection === i ? '2px solid var(--title-b)' : '2px solid transparent',
              cursor: 'pointer',
              fontSize: 14,
              padding: '4px 7px',
              flexShrink: 0,
            }}
          >
            {s.emojis[0]}
          </button>
        ))}
      </div>

      {/* Section label */}
      <div style={{
        padding: '3px 8px',
        fontSize: 9,
        fontFamily: 'var(--font-ui)',
        color: 'var(--win-dark)',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        flexShrink: 0,
        background: 'var(--win-gray)',
      }}>
        {sections[activeSection]?.label}
      </div>

      {/* Emoji grid */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '4px',
        display: 'flex',
        flexWrap: 'wrap',
        alignContent: 'flex-start',
        gap: 1,
        background: 'var(--win-white)',
      }}>
        {sections[activeSection]?.emojis.map((emoji, i) => (
          <button
            key={i}
            onClick={() => handleSelect(emoji)}
            title={emoji}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 20,
              width: 34,
              height: 34,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 3,
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--win-gray)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Clear tag button */}
      <div style={{ padding: '4px 6px', borderTop: '1px solid var(--border-sh)', flexShrink: 0 }}>
        <button
          onClick={() => onSelect(null)}
          style={{
            width: '100%',
            background: 'var(--win-gray)',
            border: '1px solid var(--border-sh)',
            fontFamily: 'var(--font-ui)',
            fontSize: 10,
            cursor: 'pointer',
            padding: '3px 0',
            color: 'var(--win-dark)',
          }}
        >
          ✕ Clear Tag
        </button>
      </div>
    </div>
  );
}
