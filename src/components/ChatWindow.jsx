import React, { useState, useEffect, useRef, useCallback } from 'react';
import { play } from '../sounds.js';
import callManager from '../callManager.js';

const CATEGORY_OPTIONS = [
  { value: 'new',            label: '🔵 New'        },
  { value: 'caliente',       label: '🌶️ Red Hot'    },
  { value: 'hot_lead',       label: '🔥 Hot'        },
  { value: 'warm',           label: '🌤️ Warm'       },
  // One Cold option only. There used to be two entries here with the identical "🧊 Cold"
  // label, one writing 'follow_up' and one writing 'not_interested'. They were impossible
  // to tell apart in the dropdown, so manually closing a dead or on-market lead usually
  // wrote 'follow_up' — which reads as cold in the inbox but is a different state to the
  // engine, and did not cancel pending chases.
  { value: 'not_interested', label: '🧊 Cold'        },
];

function formatTime(dateStr) {
  if (!dateStr) return '';
  const iso = dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T') + 'Z';
  const d = new Date(iso);
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' });

  const nowET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const msgET = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const todayStart = new Date(nowET.getFullYear(), nowET.getMonth(), nowET.getDate());
  const msgStart  = new Date(msgET.getFullYear(), msgET.getMonth(), msgET.getDate());
  const daysDiff  = Math.round((todayStart - msgStart) / 86400000);

  if (daysDiff === 0) return time;

  const mm = String(msgET.getMonth() + 1).padStart(2, '0');
  const dd = String(msgET.getDate()).padStart(2, '0');
  const dateLabel = `${mm}/${dd}`;
  const relLabel  = daysDiff === 1 ? 'Yesterday' : `${daysDiff} Days Ago`;

  return `${dateLabel} · ${relLabel} · ${time}`;
}

// Classic AIM warning meter (green bars)
function WarningMeter() {
  return (
    <div className="warning-meter" title="Signal strength">
      <div style={{ fontSize: 9, color: '#808080', fontFamily: 'var(--font-ui)', marginBottom: 1 }}>
        ||||||||||||
      </div>
      <div className="warning-bar">
        {[1,2,3,4,5,6,7,8,9,10].map(i => (
          <div key={i} className="warning-segment" style={{ height: 4 + i }} />
        ))}
      </div>
    </div>
  );
}

export default function ChatWindow({ conversation, onCategoryChange, onMessageSent, onArchive, draft, onDraftChange }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState(draft || '');
  const [sending, setSending] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [forwardEnabled, setForwardEnabled] = useState(!!conversation.forward_enabled);
  const messagesEndRef = useRef(null);
  const messagesListRef = useRef(null);
  const shouldAutoScrollRef = useRef(true);

  // Voice call state — the call itself lives in callManager (app-global singleton) so it
  // SURVIVES switching conversations/tabs (multitask while on a call). This component only
  // holds the pre-dial confirm step and whether the overlay is shown here.
  const [confirmingCall, setConfirmingCall] = useState(false);
  const [callOverlayVisible, setCallOverlayVisible] = useState(true);
  const [callSnap, setCallSnap] = useState(callManager.getState());
  useEffect(() => callManager.subscribe(setCallSnap), []);
  // The overlay treats the live call as "ours" only when it belongs to this conversation;
  // a call for another conversation is shown by the global call bar instead.
  const callIsOurs = callSnap.status && callSnap.convId === conversation.id;
  const callState = confirmingCall ? 'confirm' : (callIsOurs ? callSnap.status : null);
  const callDuration = callSnap.duration;
  const callError = callSnap.error;
  const muted = callSnap.muted;

  const displayName = conversation.name || conversation.phone;
  const isPhoneOnly = !conversation.name || conversation.name === conversation.phone;
  const agentFirst = conversation.first_name || conversation.name?.split(' ')[0] || 'Agent';
  const location = [conversation.city, conversation.state].filter(Boolean).join(', ');

  const startRename = () => {
    setNameInput(isPhoneOnly ? '' : displayName);
    setEditingName(true);
  };

  const commitRename = async () => {
    const trimmed = nameInput.trim();
    if (trimmed) {
      await window.api.renameContact({ contactId: conversation.contact_id, name: trimmed });
      conversation.name = trimmed;
      conversation.first_name = trimmed.split(' ')[0];
      onMessageSent?.();
    }
    setEditingName(false);
  };

  const handleNameKey = (e) => {
    if (e.key === 'Enter') commitRename();
    if (e.key === 'Escape') setEditingName(false);
  };

  useEffect(() => {
    setForwardEnabled(!!conversation.forward_enabled);
  }, [conversation.id, conversation.forward_enabled]);

  const toggleForward = async () => {
    const next = !forwardEnabled;
    setForwardEnabled(next);
    await window.api.setConversationForward({ convId: conversation.id, enabled: next });
  };

  const loadMessages = useCallback(async () => {
    const data = await window.api.getMessages(conversation.id);
    setMessages(data);
  }, [conversation.id]);

  const mediaCount = messages.reduce((n, m) => {
    try { return n + (m.media_urls ? JSON.parse(m.media_urls).length : 0); } catch { return n; }
  }, 0);

  const handleDownloadAll = async () => {
    try {
      const result = await window.api.downloadAllMedia({ convId: conversation.id, contactId: conversation.contact_id });
      if (!result.count) alert('No attachments found in this conversation.');
    } catch (e) {
      alert('Download failed: ' + e.message);
    }
  };

  useEffect(() => {
    loadMessages();
    const cleanup = window.api.onNewMessages(() => loadMessages());
    const interval = setInterval(loadMessages, 30000);
    return () => { cleanup(); clearInterval(interval); };
  }, [loadMessages]);

  // Reset auto-scroll when switching conversations
  useEffect(() => { shouldAutoScrollRef.current = true; }, [conversation.id]);

  const handleMessagesScroll = () => {
    const el = messagesListRef.current;
    if (!el) return;
    shouldAutoScrollRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  useEffect(() => {
    if (shouldAutoScrollRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [messages]);

  const handleSend = async () => {
    const body = input.trim();
    if (!body || sending) return;
    setSending(true);
    setInput('');
    onDraftChange?.('');
    try {
      await window.api.sendMessage({ convId: conversation.id, body });
      play('imsend');
      shouldAutoScrollRef.current = true;
      await loadMessages();
      onMessageSent?.();
    } catch (e) {
      // Electron's IPC wraps thrown errors as
      // "Error invoking remote method '...': Error: <real message>" — strip that
      // wrapper so the user sees the plain message we actually threw.
      const msg = String(e.message || e).replace(/^Error invoking remote method '[^']*':\s*(?:Error:\s*)?/, '');
      alert('Send failed: ' + msg);
      setInput(body);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const startCall = () => {
    if (callIsOurs) { setCallOverlayVisible(true); return; } // return to this conversation's live call
    if (callSnap.status) {
      alert(`Already on a call with ${callSnap.name || callSnap.phone}. End that call first.`);
      return;
    }
    setConfirmingCall(true);
    setCallOverlayVisible(true);
  };

  const confirmAndDial = () => {
    setConfirmingCall(false);
    setCallOverlayVisible(true);
    // Fire-and-forget: the manager drives connecting/active/error state globally, so the
    // call keeps going even if this window unmounts (switch conversation, change tab).
    callManager.dial({
      convId: conversation.id,
      phone: conversation.phone,
      name: conversation.name || conversation.phone,
    });
  };

  const closeCallPopup = () => {
    if (callState === 'confirm') setConfirmingCall(false);
    else if (callState === 'error') callManager.dismissError();
  };

  const endCall = () => callManager.hangup();
  const toggleMute = () => callManager.toggleMute();

  // NOTE: deliberately NO unmount cleanup for the call — the old cleanup here was what
  // hung up the call whenever the conversation switched. The call now outlives this window.

  const fmtDuration = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const w98btn = {
    background: '#c0c0c0',
    border: '2px solid',
    borderColor: '#ffffff #808080 #808080 #ffffff',
    cursor: 'pointer',
    padding: '3px 8px',
    fontFamily: '"Tahoma","Arial",sans-serif',
    fontSize: 11,
    color: '#000',
    lineHeight: 1.2,
  };

  return (
    <div className="chat-window">
      {/* AIM "Instant Message" title bar */}
      <div className="chat-header">
        <span className="chat-header-icon">💬</span>
        {editingName ? (
          <input
            autoFocus
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            onBlur={commitRename}
            onKeyDown={handleNameKey}
            placeholder="Enter name..."
            style={{
              fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 'bold',
              background: 'transparent', border: 'none', borderBottom: '1px solid #fff',
              color: '#fff', outline: 'none', width: 180,
            }}
          />
        ) : (
          <span
            className="chat-header-title"
            onClick={startRename}
            title={isPhoneOnly ? 'Click to add name' : 'Click to rename'}
            style={{ cursor: 'pointer', borderBottom: isPhoneOnly ? '1px dashed rgba(255,255,255,0.5)' : 'none' }}
          >
            {displayName} – Instant Message
            {isPhoneOnly && <span style={{ fontSize: 10, marginLeft: 6, opacity: 0.7 }}>✎ add name</span>}
          </span>
        )}
        <div className="chat-header-controls">
          {onArchive && (
            <button
              onClick={() => onArchive(conversation.id)}
              title="Archive this conversation"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: 10,
                fontFamily: 'var(--font-ui)',
                color: 'rgba(255,255,255,0.6)',
                padding: '0 4px',
                letterSpacing: '0.02em',
              }}
            >
              delete
            </button>
          )}
          <button
            onClick={toggleForward}
            title={forwardEnabled ? 'Forwarding to your cell — click to disable' : 'Forward messages to your cell when away (set Forward-to number in Settings first)'}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 13,
              lineHeight: 1,
              padding: '0 4px',
              opacity: forwardEnabled ? 1 : 0.55,
              filter: forwardEnabled ? 'none' : 'grayscale(1)',
              transition: 'opacity 0.15s, filter 0.15s',
            }}
          >
            🔔
          </button>
          <select
            className="category-select"
            value={conversation.category || 'new'}
            onChange={e => onCategoryChange(conversation.id, e.target.value)}
          >
            {CATEGORY_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Sub-header: brokerage / location — like AIM's "warning level" bar */}
      <div className="chat-sub-header">
        <span>
          {[conversation.brokerage, location].filter(Boolean).join(' · ') || conversation.phone}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {mediaCount > 0 && (
            <button
              onClick={handleDownloadAll}
              title={`Download all ${mediaCount} attachment(s) to Desktop`}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: 'var(--font-ui)', fontSize: 10,
                color: 'var(--title-b)', textDecoration: 'underline', padding: 0,
              }}
            >
              📥 download all ({mediaCount})
            </button>
          )}
          <span style={{ color: '#808080' }}>Agent's Warning Level: 0%</span>
        </span>
      </div>

      {/* Chat area — white, Times New Roman, "Name: message" format */}
      <div className="messages-list" ref={messagesListRef} onScroll={handleMessagesScroll}>
        {messages.length === 0 ? (
          <div style={{ color: '#808080', fontSize: 11, fontFamily: 'var(--font-ui)' }}>
            No messages yet.
          </div>
        ) : (
          messages.map(msg => {
            const isOutbound = msg.direction === 'outbound';
            const senderLabel = isOutbound ? 'You' : agentFirst;
            const mediaUrls = msg.media_urls ? JSON.parse(msg.media_urls) : [];
            return (
              <div key={msg.id} className="chat-msg">
                <span className={`chat-msg-sender ${isOutbound ? 'me' : 'them'}`}>
                  {senderLabel}:
                </span>{' '}
                {msg.body && <span className="chat-msg-body">{msg.body}</span>}
                {mediaUrls.map((filePath, i) => {
                  const isVideo = /\.(3gp|3g2|mp4|mov|avi|mkv)$/i.test(filePath);
                  return (
                    <div key={i} style={{ marginTop: 4 }}>
                      {isVideo ? (
                        <div
                          onClick={() => window.api.shellOpenExternal(`file://${filePath}`)}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 6,
                            padding: '5px 10px', cursor: 'pointer',
                            border: '1px solid var(--border-sh)',
                            background: 'var(--win-gray)',
                            fontFamily: 'var(--font-ui)', fontSize: 11,
                          }}
                        >
                          <span style={{ fontSize: 16 }}>▶</span>
                          <span>Video — click to open</span>
                        </div>
                      ) : (
                        <img
                          src={`file://${filePath}`}
                          alt="MMS"
                          style={{ maxWidth: '100%', maxHeight: 280, border: '1px solid var(--border-sh)', cursor: 'pointer', display: 'block' }}
                          onClick={() => window.api.shellOpenExternal(`file://${filePath}`)}
                        />
                      )}
                    </div>
                  );
                })}
                <span className="chat-msg-time">({formatTime(msg.created_at)})</span>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* AIM formatting toolbar */}
      <div className="chat-toolbar">
        <button className="toolbar-btn" title="Font size up" style={{ fontWeight: 'bold', fontSize: 13 }}>A</button>
        <button className="toolbar-btn" title="Font size down" style={{ fontSize: 9 }}>A</button>
        <div className="toolbar-sep" />
        <button className="toolbar-btn" style={{ fontWeight: 'bold' }}>B</button>
        <button className="toolbar-btn" style={{ fontStyle: 'italic' }}>I</button>
        <button className="toolbar-btn" style={{ textDecoration: 'underline' }}>U</button>
        <div className="toolbar-sep" />
        <button className="toolbar-btn" style={{ color: '#0000cc', textDecoration: 'underline', fontSize: 10 }}>link</button>
        <button className="toolbar-btn" title="Emoji">🙂</button>
      </div>

      {/* Input area */}
      <div className="chat-input-area">
        <textarea
          className="message-input"
          placeholder={`Message ${agentFirst}...`}
          value={input}
          onChange={e => { setInput(e.target.value); onDraftChange?.(e.target.value); }}
          onKeyDown={handleKeyDown}
          disabled={sending}
        />
      </div>

      {/* AIM-style action button row */}
      <div className="chat-actions">
        <button className="aim-btn" style={{ flex: 1 }} title="Some variation of no"
          onClick={() => onCategoryChange(conversation.id, 'not_interested')}>
          <span className="aim-btn-icon">🧊</span>
          <span className="aim-btn-label">Cold</span>
        </button>
        <button className="aim-btn" style={{ flex: 1 }} title="Has something — not yet an address + ask"
          onClick={() => onCategoryChange(conversation.id, 'warm')}>
          <span className="aim-btn-icon">🌤️</span>
          <span className="aim-btn-label">Warm</span>
        </button>
        <button className="aim-btn" style={{ flex: 1 }} title="Address + asking — active negotiation"
          onClick={() => onCategoryChange(conversation.id, 'hot_lead')}>
          <span className="aim-btn-icon">🔥</span>
          <span className="aim-btn-label">Hot</span>
        </button>
        <button className="aim-btn" style={{ flex: 1 }} title="Under contract — coordinating with agent"
          onClick={() => onCategoryChange(conversation.id, 'caliente')}>
          <span className="aim-btn-icon">🌶️</span>
          <span className="aim-btn-label">Red Hot</span>
        </button>
        <button className="aim-btn" style={{ flex: 1, color: callState ? '#00ff88' : 'inherit' }} title={callState === 'active' ? 'Return to call' : 'Call this agent'} onClick={startCall}>
          <span className="aim-btn-icon">📞</span>
          <span className="aim-btn-label">Call</span>
        </button>

        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
          <WarningMeter />
          <button
            className="aim-btn aim-send-btn"
            onClick={handleSend}
            disabled={!input.trim() || sending}
            style={{ flexShrink: 0 }}
          >
            <span className="aim-btn-icon">📨</span>
            <span className="aim-btn-label">{sending ? '...' : 'Send'}</span>
          </button>
        </div>
      </div>

      {/* Win98/AIM call popup */}
      {callState && callOverlayVisible && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.45)',
        }}>
          {/* Win98 window */}
          <div style={{
            background: '#c0c0c0',
            border: '2px solid', borderColor: '#ffffff #808080 #808080 #ffffff',
            boxShadow: '3px 3px 0 #000',
            width: 284,
            fontFamily: '"Tahoma","Arial",sans-serif',
            userSelect: 'none',
          }}>
            {/* Title bar */}
            <div style={{
              background: callState === 'error' ? '#800000' : '#000080',
              padding: '3px 4px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 13 }}>🏃</span>
                <span style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>
                  {callState === 'confirm' ? 'AIM Call' : callState === 'connecting' ? 'Calling...' : callState === 'error' ? 'Call Error' : 'On Call'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 2 }}>
                <button style={{ ...w98btn, width: 17, height: 15, padding: 0, fontSize: 10, display:'flex', alignItems:'center', justifyContent:'center' }}>–</button>
                <button style={{ ...w98btn, width: 17, height: 15, padding: 0, fontSize: 10, display:'flex', alignItems:'center', justifyContent:'center' }}
                  onClick={() => (callState === 'confirm' || callState === 'error') ? closeCallPopup() : endCall()}>✕</button>
              </div>
            </div>

            {/* Blue display panel */}
            <div style={{
              background: '#000080', margin: 8, padding: '18px 12px 14px',
              border: '2px solid', borderColor: '#808080 #ffffff #ffffff #808080',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
            }}>
              {/* Avatar */}
              <div style={{
                width: 64, height: 64, borderRadius: '50%',
                background: 'radial-gradient(circle at 35% 35%, #c8c8c8, #888)',
                border: '2px solid #ffffff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 32, marginBottom: 11,
              }}>🏃</div>

              {/* Name */}
              <div style={{ color: '#fff', fontSize: 15, fontWeight: 'bold', marginBottom: 3 }}>
                {conversation.name || conversation.phone}
              </div>

              {/* State-specific content */}
              {callState === 'error' ? (
                <div style={{ color: '#ff8888', fontSize: 10, textAlign: 'center', maxWidth: 220, wordBreak: 'break-word', lineHeight: 1.5 }}>
                  {callError || 'Unknown error'}
                </div>
              ) : callState === 'confirm' ? (
                <div style={{ color: '#aaaaff', fontSize: 11 }}>Start a voice call?</div>
              ) : callState === 'connecting' ? (
                <>
                  <div style={{ color: '#aaaaff', fontSize: 12 }}>Calling...</div>
                  <div style={{ display: 'flex', gap: 7, marginTop: 9 }}>
                    {[0,1,2].map(i => (
                      <div key={i} className="aim-dot" style={{ animationDelay: `${i * 0.4}s` }} />
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div style={{ color: '#aaaaff', fontSize: 11 }}>Connected</div>
                  <div style={{
                    marginTop: 8,
                    background: '#00001a',
                    border: '2px solid', borderColor: '#404060 #8080c0 #8080c0 #404060',
                    padding: '4px 14px',
                    fontFamily: '"Courier New", Courier, monospace',
                    fontSize: 20, color: '#ffffff', letterSpacing: '0.12em',
                  }}>
                    {fmtDuration(callDuration)}
                  </div>
                </>
              )}
            </div>

            {/* Confirm buttons */}
            {callState === 'confirm' && (
              <div style={{ padding: '0 8px 8px', display: 'flex', gap: 6 }}>
                <button onClick={closeCallPopup} style={{ ...w98btn, flex: 1, padding: '5px 0' }}>Cancel</button>
                <button onClick={confirmAndDial} style={{ ...w98btn, flex: 2, padding: '5px 0', fontWeight: 'bold' }}>📞 Call</button>
              </div>
            )}

            {/* Error close */}
            {callState === 'error' && (
              <div style={{ padding: '0 8px 8px' }}>
                <button onClick={closeCallPopup} style={{ ...w98btn, width: '100%', padding: '5px 0' }}>Close</button>
              </div>
            )}

            {/* Active / connecting buttons */}
            {(callState === 'active' || callState === 'connecting') && (
              <>
                <div style={{ padding: '0 8px 4px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  <button onClick={toggleMute} style={{
                    ...w98btn,
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    gap: 3, padding: '7px 4px',
                    background: muted ? '#b0b0d0' : '#c0c0c0',
                  }}>
                    <span style={{ fontSize: 18, lineHeight: 1 }}>{muted ? '🔇' : '🎙️'}</span>
                    <span style={{ fontSize: 9 }}>{muted ? 'Unmute' : 'Mute'}</span>
                  </button>
                  <button onClick={() => setCallOverlayVisible(false)} style={{
                    ...w98btn,
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    gap: 3, padding: '7px 4px',
                  }}>
                    <span style={{ fontSize: 18, lineHeight: 1 }}>🏃</span>
                    <span style={{ fontSize: 9 }}>IM</span>
                  </button>
                </div>

                {/* End Call */}
                <div style={{ padding: '2px 8px 0' }}>
                  <button onClick={endCall} style={{
                    width: '100%', padding: '9px 0',
                    background: '#cc2222',
                    border: '2px solid', borderColor: '#ff6666 #880000 #880000 #ff6666',
                    color: '#fff', cursor: 'pointer',
                    fontFamily: '"Tahoma","Arial",sans-serif',
                    fontSize: 13, fontWeight: 'bold',
                  }}>
                    End Call
                  </button>
                </div>

                {/* Status bar */}
                <div style={{
                  borderTop: '1px solid #808080', marginTop: 6,
                  padding: '3px 8px', fontSize: 10, color: '#000',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}>
                  <span>📶</span>
                  <span>{callState === 'connecting' ? 'Connecting...' : 'Connected'}</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
