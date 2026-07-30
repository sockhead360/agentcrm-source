import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';

const CAT_COLOR = {
  hot_lead:     { bg: '#660000', border: '#990000', label: 'HOT LEAD' },
  warm:         { bg: '#664400', border: '#996600', label: 'WARM' },
  follow_up:    { bg: '#333333', border: '#555555', label: 'COLD' },
  not_interested: { bg: '#333333', border: '#555555', label: 'COLD' },
  error:        { bg: '#550055', border: '#880088', label: 'ERROR' },
};

const CAT_COLORS = {
  hot_lead: '#cc0000', warm: '#996600',
  follow_up: '#555555', not_interested: '#555555',
};

const LEVELS = [
  {
    num: 1,
    label: 'Cold Sorting',
    desc: 'AI reads every reply and silently routes "no" signals to Cold. No messages sent. Makes it easy to skip the garbage and focus on the warm ones.',
    color: '#226600',
    border: '#44aa00',
  },
  {
    num: 2,
    label: 'Buy Box Reply',
    desc: 'Everything in Level 1, plus one buy-box reply sent when an agent asks what you\'re looking for. Property signals are parked warm for you to handle manually. No drips, no follow-ups.',
    color: '#226600',
    border: '#44aa00',
  },
  {
    num: 3,
    label: 'Advanced',
    desc: 'Full pipeline — warm drips, follow-up sequences, hot lead routing, address/price watchdog. Everything. Password required.',
    color: '#226600',
    border: '#44aa00',
    locked: true,
  },
];

function PasswordSaveRow({ value, onChange }) {
  const [saved, setSaved] = useState(false);
  const handleSave = async () => {
    await window.api.saveSettings({ aiLevelPassword: value });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input
        type="password"
        className="form-input"
        value={value}
        onChange={e => { onChange(e.target.value); setSaved(false); }}
        placeholder="Set admin password..."
        style={{ flex: 1 }}
      />
      <button className="btn btn-primary" onClick={handleSave}>Save</button>
      {saved && <span style={{ fontSize: 11, color: '#006600', fontFamily: 'var(--font-ui)', fontWeight: 'bold' }}>✓ Saved</span>}
    </div>
  );
}

export default function AiTab({ sandboxHistory, setSandboxHistory, sandboxInput, setSandboxInput }) {
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiLevel, setAiLevel] = useState(2);
  const [aiLevelPassword, setAiLevelPassword] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [lockStatus, setLockStatus] = useState({ configured: true, unlocked: false });
  const [passwordError, setPasswordError] = useState('');
  const [aiAutoSubmit, setAiAutoSubmit] = useState(false);
  const [showAutoSubmitPasswordPrompt, setShowAutoSubmitPasswordPrompt] = useState(false);
  const [autoSubmitPasswordInput, setAutoSubmitPasswordInput] = useState('');
  const [autoSubmitPasswordError, setAutoSubmitPasswordError] = useState('');
  const [sandboxLoading, setSandboxLoading] = useState(false);
  const [sandboxLevel, setSandboxLevel] = useState('all');
  const [pendingFollowUps, setPendingFollowUps] = useState([]);
  const [exampleStats, setExampleStats] = useState([]);
  const [importStatus, setImportStatus] = useState(null);
  const chatEndRef = useRef(null);

  const totalExamples = useMemo(() => exampleStats.reduce((s, r) => s + r.count, 0), [exampleStats]);

  const loadExampleStats = useCallback(async () => {
    try { setExampleStats(await window.api.getAiExampleStats() || []); } catch (_) {}
  }, []);

  const load = useCallback(async () => {
    const s = await window.api.getSettings();
    setAiEnabled(s.aiEnabled === 'true');
    setAiLevel(parseInt(s.aiLevel || '2', 10));
    setAiLevelPassword(s.aiLevelPassword || '');
    setAiAutoSubmit(s.aiAutoSubmit === 'true');
  }, []);

  useEffect(() => { load(); loadExampleStats(); }, [load, loadExampleStats]);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try { const st = await window.api.aiLockStatus(); if (alive) setLockStatus(st); } catch (_) {}
    };
    poll();
    // The unlock expires in the main process; re-checking keeps the UI honest about it.
    const t = setInterval(poll, 20000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sandboxHistory, sandboxLoading]);

  // Every AI control is behind the admin password, not just Level 3. On a shared install
  // the operator should not be able to switch the AI on, or move between levels, without it.
  // With no password set nothing is gated, so the password must be set on any machine that
  // is handed to someone else.
  // The renderer never holds or compares the password. It asks the main process to unlock,
  // and the main process is what actually permits the settings write. Nothing here can be
  // bypassed from devtools, because bypassing the prompt still hits a locked IPC handler.
  const requestGated = (action) => {
    if (lockStatus.unlocked) { action(); return; }
    setPendingAction(() => action);
    setShowPasswordPrompt(true);
    setPasswordInput('');
    setPasswordError('');
  };

  const handleToggleAi = () => {
    const next = !aiEnabled;
    requestGated(async () => {
      setAiEnabled(next);
      await window.api.saveSettings({ aiEnabled: next ? 'true' : 'false' });
    });
  };

  const handleSelectLevel = (num) => {
    if (num === aiLevel) return; // no-op reselect needs no password
    requestGated(() => applyLevel(num));
  };

  const applyLevel = async (num) => {
    setAiLevel(num);
    setShowPasswordPrompt(false);
    setPasswordInput('');
    await window.api.saveSettings({ aiLevel: String(num) });
  };

  const handlePasswordSubmit = async () => {
    const res = await window.api.aiUnlock(passwordInput);
    if (!res || !res.ok) {
      setPasswordError(res && res.reason === 'not_configured'
        ? 'This build has no unlock password set.'
        : 'Incorrect password.');
      return;
    }
    setLockStatus({ configured: true, unlocked: true });
    const action = pendingAction;
    setPendingAction(null);
    setShowPasswordPrompt(false);
    setPasswordInput('');
    setPasswordError('');
    if (action) action();
  };

  const handleImport = async () => {
    setImportStatus('importing');
    try {
      const result = await window.api.importAiExamples();
      if (!result) { setImportStatus(null); return; }
      if (result.success) {
        setExampleStats(result.counts || []);
        setImportStatus({ type: 'done', total: result.total, files: result.files || 1 });
        setTimeout(() => setImportStatus(null), 4000);
      } else {
        setImportStatus('error');
        setTimeout(() => setImportStatus(null), 4000);
      }
    } catch {
      setImportStatus('error');
      setTimeout(() => setImportStatus(null), 4000);
    }
  };

  const handleClearExamples = async () => {
    setExampleStats(await window.api.clearAiExamples() || []);
  };

  const handleSandboxSend = async () => {
    const msg = sandboxInput.trim();
    if (!msg || sandboxLoading) return;
    setSandboxInput('');
    setSandboxLoading(true);
    const hadPendingFollowUp = pendingFollowUps.length > 0;
    const agentMsg = { role: 'agent', body: msg };
    // Agent turns, AI replies, AND any fast-forwarded follow-ups all count as conversation
    // history (the follow-ups are treated as sent outbound messages the agent is replying to).
    // `outcome` entries are notes about what the system DID (went cold), not messages that
    // were ever texted, so they must stay out of the history the classifier sees.
    const convTurns = sandboxHistory.filter(m =>
      !m.outcome && (m.role === 'agent' || m.role === 'crm' || m.role === 'followup'));
    setSandboxHistory(h => [...h, agentMsg]);
    try {
      const allHistory = [...convTurns, agentMsg];
      const result = await window.api.aiSimulate({
        message: msg,
        level: sandboxLevel === 'all' ? 'all' : parseInt(sandboxLevel, 10),
        hasPendingFollowUp: hadPendingFollowUp,
        history: allHistory.map(m => ({
          body: m.role === 'crm' ? (m.replies && m.replies[0]) : m.body,
          direction: m.role === 'agent' ? 'inbound' : 'outbound',
        })),
      });
      if (result.error) {
        setSandboxHistory(h => [...h, { role: 'crm', replies: [result.error], bucket: 'error', category: 'error' }]);
      } else if (result.multi) {
        setSandboxHistory(h => [...h, { role: 'crm', multi: true, results: result.results }]);
      } else {
        setSandboxHistory(h => [...h, {
          role: 'crm',
          replies: result.replies || ['[No reply]'],
          bucket: result.bucket,
          replyKey: result.replyKey,
          category: result.category,
          scheduleHours: result.scheduleHours || null,
        }]);
      }
      // A genuinely new schedule replaces the old one. A side question answered while a
      // precisely-timed follow-up is still pending (preserveFollowUps) leaves it untouched —
      // it must NOT be cleared just because the agent sent another message. Anything else
      // (cold-close, hot lead, etc.) means the deal concluded — nothing left to schedule.
      if (result.followUps && result.followUps.length) setPendingFollowUps(result.followUps);
      else if (!result.preserveFollowUps) setPendingFollowUps([]);
    } catch (e) {
      setSandboxHistory(h => [...h, { role: 'crm', replies: ['Error: ' + e.message], bucket: 'error', category: 'error' }]);
    }
    setSandboxLoading(false);
  };

  // Reveal the next scheduled follow-up as if time had advanced to it.
  const handleFastForward = () => {
    if (!pendingFollowUps.length) return;
    const [next, ...rest] = pendingFollowUps;
    setSandboxHistory(h => [...h, { role: 'followup', body: next.body, hours: next.hours, kind: next.kind, outcome: next.outcome }]);
    setPendingFollowUps(rest);
  };

  const fmtHoursLater = (h) => {
    if (h < 24) return `${h}h later`;
    const d = h / 24;
    return Number.isInteger(d) ? `${d} day${d > 1 ? 's' : ''} later` : `~${d.toFixed(1)} days later`;
  };

  const handleSandboxKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSandboxSend(); }
  };

  return (
    <>
      <div className="tab-header">
        <div className="tab-title">🤖 AI</div>
      </div>

      <div style={{ padding: '12px 16px', overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>

        {/* Master switch */}
        <div className="settings-section">
          <div className="settings-section-title">AUTO-PILOT</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              onClick={handleToggleAi}
              style={{
                width: 64, height: 30, cursor: 'pointer', userSelect: 'none',
                background: aiEnabled ? '#006600' : '#880000',
                border: '2px solid',
                borderTopColor: aiEnabled ? '#009900' : '#cc0000',
                borderLeftColor: aiEnabled ? '#009900' : '#cc0000',
                borderRightColor: aiEnabled ? '#004400' : '#550000',
                borderBottomColor: aiEnabled ? '#004400' : '#550000',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 'bold', flexShrink: 0,
              }}
            >
              {aiEnabled ? 'ON' : 'OFF'}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text2)', lineHeight: 1.7 }}>
              {aiEnabled
                ? `AI is active — running Level ${aiLevel} on every incoming reply.`
                : 'AI is off — nothing is sorted and no auto-replies are sent.'}
            </div>
          </div>
        </div>

        {/* Level selector */}
        <div className="settings-section">
          <div className="settings-section-title">AI LEVEL</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {LEVELS.map(lvl => {
              const active = lvl.num <= aiLevel;
              return (
                <div
                  key={lvl.num}
                  onClick={() => handleSelectLevel(lvl.num)}
                  style={{
                    border: `2px solid ${active ? lvl.border : 'var(--border-sh)'}`,
                    background: active ? lvl.color + '22' : 'var(--bg2)',
                    padding: '10px 12px',
                    cursor: 'pointer',
                    userSelect: 'none',
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    opacity: !aiEnabled && !active ? 0.5 : 1,
                  }}
                >
                  <div style={{
                    width: 22, height: 22, flexShrink: 0, marginTop: 1,
                    background: active ? lvl.border : 'var(--bg3)',
                    border: `2px solid ${active ? lvl.border : 'var(--border-sh)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 'bold',
                    color: active ? '#fff' : 'var(--text2)',
                  }}>
                    {lvl.num}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 'bold',
                      color: active ? lvl.border : 'var(--text1)',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      {lvl.label}
                      {lvl.locked && <span style={{ fontSize: 10, color: '#888' }}>🔒</span>}
                      {aiLevel === lvl.num && <span style={{ fontSize: 9, color: lvl.border, fontWeight: 'bold', marginLeft: 4 }}>● ACTIVE</span>}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text2)', marginTop: 3, lineHeight: 1.6 }}>
                      {lvl.desc}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Password prompt — gates every AI control, not only Level 3 */}
          {showPasswordPrompt && (
            <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--bg2)', border: '1px solid #990000' }}>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, marginBottom: 6, color: 'var(--text1)' }}>
                Enter admin password to change AI settings:
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="password"
                  className="form-input"
                  value={passwordInput}
                  onChange={e => { setPasswordInput(e.target.value); setPasswordError(''); }}
                  onKeyDown={e => e.key === 'Enter' && handlePasswordSubmit()}
                  placeholder="Password"
                  autoFocus
                  style={{ flex: 1 }}
                />
                <button className="btn btn-primary" onClick={handlePasswordSubmit}>Unlock</button>
                <button className="btn" onClick={() => { setShowPasswordPrompt(false); setPendingAction(null); setPasswordInput(''); setPasswordError(''); }}>Cancel</button>
              </div>
              {passwordError && (
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: '#cc0000', marginTop: 4 }}>
                  {passwordError}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Auto Lead Submit toggle */}
        <div className="settings-section">
          <div className="settings-section-title">AUTO LEAD SUBMIT 🔒</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text2)', marginBottom: 8, lineHeight: 1.6 }}>
            When a hot lead is confirmed (address + price), automatically create and submit the lead. Level 3 + password required.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              onClick={() => {
                if (aiAutoSubmit) {
                  setAiAutoSubmit(false);
                  window.api.saveSettings({ aiAutoSubmit: 'false' });
                } else if (!aiLevelPassword || aiLevel >= 3) {
                  // No password set or already unlocked at L3 — allow freely
                  setAiAutoSubmit(true);
                  window.api.saveSettings({ aiAutoSubmit: 'true' });
                } else {
                  setShowAutoSubmitPasswordPrompt(true);
                  setAutoSubmitPasswordInput('');
                  setAutoSubmitPasswordError('');
                }
              }}
              style={{
                width: 64, height: 30, cursor: 'pointer', userSelect: 'none', flexShrink: 0,
                background: aiAutoSubmit ? '#006600' : '#880000',
                border: '2px solid',
                borderTopColor: aiAutoSubmit ? '#009900' : '#cc0000',
                borderLeftColor: aiAutoSubmit ? '#009900' : '#cc0000',
                borderRightColor: aiAutoSubmit ? '#004400' : '#550000',
                borderBottomColor: aiAutoSubmit ? '#004400' : '#550000',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 'bold',
              }}
            >
              {aiAutoSubmit ? 'ON' : 'OFF'}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text2)', lineHeight: 1.7 }}>
              {aiAutoSubmit ? 'Hot leads will be auto-submitted when address + price are confirmed.' : 'Off — hot leads are flagged but not submitted automatically.'}
            </div>
          </div>
          {showAutoSubmitPasswordPrompt && (
            <div style={{ marginTop: 10, padding: '10px 12px', background: 'var(--bg2)', border: '1px solid #990000' }}>
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, marginBottom: 6, color: 'var(--text1)' }}>
                Enter Level 3 password to enable Auto Lead Submit:
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="password"
                  className="form-input"
                  value={autoSubmitPasswordInput}
                  onChange={e => { setAutoSubmitPasswordInput(e.target.value); setAutoSubmitPasswordError(''); }}
                  onKeyDown={async e => {
                    if (e.key === 'Enter') {
                      if ((await window.api.aiUnlock(autoSubmitPasswordInput))?.ok) {
                        setAiAutoSubmit(true);
                        window.api.saveSettings({ aiAutoSubmit: 'true' });
                        setShowAutoSubmitPasswordPrompt(false);
                      } else {
                        setAutoSubmitPasswordError('Incorrect password.');
                      }
                    }
                  }}
                  placeholder="Password"
                  autoFocus
                  style={{ flex: 1 }}
                />
                <button className="btn btn-primary" onClick={async () => {
                  if ((await window.api.aiUnlock(autoSubmitPasswordInput))?.ok) {
                    setAiAutoSubmit(true);
                    window.api.saveSettings({ aiAutoSubmit: 'true' });
                    setShowAutoSubmitPasswordPrompt(false);
                  } else {
                    setAutoSubmitPasswordError('Incorrect password.');
                  }
                }}>Unlock</button>
                <button className="btn" onClick={() => setShowAutoSubmitPasswordPrompt(false)}>Cancel</button>
              </div>
              {autoSubmitPasswordError && (
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: '#cc0000', marginTop: 4 }}>
                  {autoSubmitPasswordError}
                </div>
              )}
            </div>
          )}
        </div>

        {/* AI Sandbox — Level 3 only */}
        {aiLevel < 3 ? null : <>
        <div className="settings-section" style={{ paddingBottom: 0 }}>
          <div className="settings-section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>AI SANDBOX — TEST WITHOUT SENDING</span>
            {sandboxHistory.length > 0 && (
              <button onClick={() => setSandboxHistory([])} className="btn">Reset</button>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 10, color: 'var(--text2)', marginRight: 2 }}>Test at:</span>
            {[['all', 'ALL'], ['1', 'L1'], ['2', 'L2'], ['3', 'L3']].map(([val, label]) => (
              <div
                key={val}
                onClick={() => { setSandboxLevel(val); setSandboxHistory([]); }}
                style={{
                  padding: '2px 8px', cursor: 'pointer', userSelect: 'none',
                  fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 'bold',
                  background: sandboxLevel === val ? '#44aa00' : 'var(--bg3)',
                  color: sandboxLevel === val ? '#fff' : 'var(--text2)',
                  border: `1px solid ${sandboxLevel === val ? '#44aa00' : 'var(--border-sh)'}`,
                }}
              >
                {label}
              </div>
            ))}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text2)', marginLeft: 4 }}>
              {sandboxLevel === 'all' ? '— compare all three levels at once' : `— simulate Level ${sandboxLevel} only`}
            </span>
          </div>
        </div>

        <div className="chat-window" style={{ height: 420, flexShrink: 0, marginBottom: 16 }}>
          <div className="chat-header">
            <span className="chat-header-icon">🤖</span>
            <span className="chat-header-title">AI Sandbox — Instant Message</span>
          </div>
          <div className="chat-sub-header">
            <span>Simulated Agent · No messages sent</span>
            <span style={{ color: '#808080' }}>Testing: {sandboxLevel === 'all' ? 'L1 / L2 / L3' : `Level ${sandboxLevel}`}</span>
          </div>
          <div className="messages-list" style={{ flex: 1 }}>
            {sandboxHistory.length === 0 && !sandboxLoading && (
              <div style={{ color: '#808080', fontSize: 11, fontFamily: 'var(--font-ui)' }}>
                Type an agent reply below and press Enter.
              </div>
            )}
            {sandboxHistory.map((msg, i) => {
              if (msg.role === 'agent') {
                return (
                  <div key={i} className="chat-msg">
                    <span className="chat-msg-sender them">Agent:</span>{' '}
                    <span className="chat-msg-body">{msg.body}</span>
                  </div>
                );
              }
              if (msg.role === 'followup') {
                // Terminal outcome of the run, not another text. Rendered as a note so the
                // sandbox actually shows the ending instead of silently running out.
                if (msg.outcome || msg.kind === 'cold') {
                  return (
                    <div key={i} style={{ marginBottom: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '4px 0' }}>
                        <div style={{ flex: 1, height: 1, background: 'var(--border-sh)' }} />
                        <span style={{ fontSize: 9, fontFamily: 'var(--font-ui)', fontWeight: 'bold', color: '#6a6a8a', background: 'var(--bg3)', padding: '1px 6px', border: '1px solid #44446a', whiteSpace: 'nowrap' }}>
                          🧊 CONVERSATION CLOSED
                        </span>
                        <div style={{ flex: 1, height: 1, background: 'var(--border-sh)' }} />
                      </div>
                      <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: '#8a8aa0', padding: '3px 6px', border: '1px solid var(--border-sh)', background: 'var(--bg3)' }}>
                        {msg.body}
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={i} style={{ marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '4px 0' }}>
                      <div style={{ flex: 1, height: 1, background: 'var(--border-sh)' }} />
                      <span style={{ fontSize: 9, fontFamily: 'var(--font-ui)', fontWeight: 'bold', color: '#996600', background: 'var(--bg3)', padding: '1px 6px', border: '1px solid #664400', whiteSpace: 'nowrap' }}>
                        ⏱ {fmtHoursLater(msg.hours)}
                      </span>
                      <div style={{ flex: 1, height: 1, background: 'var(--border-sh)' }} />
                    </div>
                    <div className="chat-msg">
                      <span className="chat-msg-sender me">You:</span>{' '}
                      <span className="chat-msg-body">{msg.body}</span>
                    </div>
                    <div style={{ marginLeft: 2 }}>
                      <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: '#808080', background: 'var(--bg3)', padding: '1px 5px', border: '1px solid var(--border-sh)' }}>
                        auto {msg.kind === 'state-poll' ? 'state-poll' : msg.kind === 'follow-up' ? 'scheduled follow-up' : 'drip'}
                      </span>
                    </div>
                  </div>
                );
              }
              if (msg.multi) {
                return (
                  <div key={i} style={{ marginBottom: 8 }}>
                    {[1, 2, 3].map(lvl => {
                      const r = msg.results[lvl];
                      const cat = CAT_COLOR[r.category] || CAT_COLOR.follow_up;
                      const reply = r.replies?.[0] || '[No reply]';
                      const isNoop = reply.startsWith('[');
                      return (
                        <div key={lvl} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', marginBottom: 4 }}>
                          <span style={{
                            fontFamily: 'var(--font-ui)', fontSize: 9, fontWeight: 'bold',
                            background: '#226600', color: '#fff', padding: '1px 5px',
                            border: '1px solid #44aa00', flexShrink: 0, marginTop: 2,
                          }}>L{lvl}</span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: isNoop ? '#808080' : 'var(--text1)', fontStyle: isNoop ? 'italic' : 'normal', flex: 1 }}>
                            {reply}
                          </span>
                          <span style={{ fontSize: 9, fontFamily: 'var(--font-ui)', fontWeight: 'bold', background: cat.bg, color: '#fff', padding: '1px 5px', border: `1px solid ${cat.border}`, flexShrink: 0, marginTop: 2 }}>
                            {cat.label}
                          </span>
                        </div>
                      );
                    })}
                    <div style={{ marginTop: 2, marginLeft: 2 }}>
                      <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: '#808080', background: 'var(--bg3)', padding: '1px 5px', border: '1px solid var(--border-sh)' }}>
                        {msg.results[3].bucket}
                      </span>
                    </div>
                  </div>
                );
              }
              const cat = CAT_COLOR[msg.category] || CAT_COLOR.follow_up;
              const isNoop = msg.replies?.length === 1 && msg.replies[0].startsWith('[');
              return (
                <div key={i}>
                  {msg.replies?.map((reply, ri) => (
                    <div key={ri} className="chat-msg">
                      <span className="chat-msg-sender me">You:</span>{' '}
                      <span className="chat-msg-body" style={{ color: isNoop ? '#808080' : undefined, fontStyle: isNoop ? 'italic' : 'normal' }}>
                        {reply}
                      </span>
                    </div>
                  ))}
                  <div style={{ marginBottom: 6, marginLeft: 2, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: '#808080', background: 'var(--bg3)', padding: '1px 5px', border: '1px solid var(--border-sh)' }}>
                      {msg.bucket}{msg.replyKey ? ` → ${msg.replyKey}` : ''}
                    </span>
                    <span style={{ fontSize: 9, fontFamily: 'var(--font-ui)', fontWeight: 'bold', background: cat.bg, color: '#fff', padding: '1px 5px', border: `1px solid ${cat.border}` }}>
                      {cat.label}
                    </span>
                    {msg.scheduleHours && (
                      <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: '#996600', background: 'var(--bg3)', padding: '1px 5px', border: '1px solid #664400' }}>
                        ⏰ follow-up in {msg.scheduleHours}h
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            {sandboxLoading && (
              <div className="chat-msg">
                <span className="chat-msg-sender me">You:</span>{' '}
                <span className="chat-msg-body" style={{ color: '#808080' }}>classifying...</span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          {pendingFollowUps.length > 0 && (
            <div style={{ padding: '6px 8px', borderTop: '1px solid var(--border-sh)', background: 'var(--bg2)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="aim-btn" onClick={handleFastForward} disabled={sandboxLoading} style={{ flexShrink: 0 }}>
                <span className="aim-btn-label">
                  {pendingFollowUps[0].outcome ? '⏩ See how it ends' : '⏩ Fast-forward to next follow-up'}
                </span>
              </button>
              <span style={{ fontSize: 10, color: '#996600', fontFamily: 'var(--font-ui)' }}>
                {pendingFollowUps[0].outcome
                  ? 'last step: what happens if they never reply'
                  : `next lands ${fmtHoursLater(pendingFollowUps[0].hours)} · ${pendingFollowUps.filter(f => !f.outcome).length} message${pendingFollowUps.filter(f => !f.outcome).length === 1 ? '' : 's'} left if they stay silent`}
              </span>
            </div>
          )}
          <div className="chat-toolbar">
            <span style={{ fontSize: 10, color: '#808080', fontFamily: 'var(--font-ui)' }}>Sandbox mode — no real SMS will be sent</span>
          </div>
          <div className="chat-input-area">
            <textarea
              className="message-input"
              placeholder="Type as the agent..."
              value={sandboxInput}
              onChange={e => setSandboxInput(e.target.value)}
              onKeyDown={handleSandboxKey}
              disabled={sandboxLoading}
            />
          </div>
          <div className="chat-actions">
            <button className="aim-btn" style={{ flex: 1 }} onClick={handleSandboxSend} disabled={sandboxLoading || !sandboxInput.trim()}>
              <span className="aim-btn-label">Send</span>
            </button>
            <button className="aim-btn" style={{ flex: 1 }} onClick={() => { setSandboxHistory([]); setPendingFollowUps([]); }}>
              <span className="aim-btn-label">Reset</span>
            </button>
          </div>
        </div>
        </>}

        {/* Training Data — bottom */}
        <div className="settings-section">
          <div className="settings-section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>TRAINING DATA</span>
            {totalExamples > 0 && <button className="btn" onClick={handleClearExamples} style={{ fontSize: 10 }}>Clear</button>}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text2)', lineHeight: 1.7, marginBottom: 8 }}>
            Import transcript exports to give the classifier real labeled examples from past conversations.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <button className="btn btn-primary" onClick={handleImport} disabled={importStatus === 'importing'}>
              {importStatus === 'importing' ? 'Importing...' : 'Import Transcripts'}
            </button>
            {importStatus?.type === 'done' && (
              <span style={{ fontSize: 11, color: '#006600', fontFamily: 'var(--font-ui)', fontWeight: 'bold' }}>
                ✓ {importStatus.total} examples from {importStatus.files} file{importStatus.files !== 1 ? 's' : ''}
              </span>
            )}
            {importStatus === 'error' && (
              <span style={{ fontSize: 11, color: '#880000', fontFamily: 'var(--font-ui)' }}>Import failed</span>
            )}
          </div>
          {exampleStats.length > 0 ? (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {['not_interested','follow_up','warm','hot_lead'].map(cat => {
                const row = exampleStats.find(r => r.category === cat);
                if (!row) return null;
                const labels = { hot_lead: 'HOT', warm: 'WARM', follow_up: 'COLD', not_interested: 'COLD' };
                return (
                  <div key={cat} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, background: 'var(--bg3)', border: '1px solid var(--border-sh)', padding: '3px 7px', display: 'flex', gap: 5, alignItems: 'center' }}>
                    <span style={{ color: CAT_COLORS[cat] || '#888', fontWeight: 'bold' }}>{labels[cat]}</span>
                    <span style={{ color: 'var(--text2)' }}>{row.count}</span>
                  </div>
                );
              })}
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text2)', padding: '3px 7px', border: '1px solid transparent' }}>
                {totalExamples} total
              </div>
            </div>
          ) : (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text2)' }}>
              No training data loaded — AI relies on rules only.
            </div>
          )}
        </div>

        {/* AI lock status. Read-only ON PURPOSE. There used to be a password field here,
            which meant whoever held the app could set their own password and unlock the AI
            with it. The password now lives in the build (see scripts/set-ai-lock.js) and is
            controlled by whoever ships it. */}
        <div className="settings-section">
          <div className="settings-section-title">AI LOCK</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text2)', lineHeight: 1.6 }}>
            {!lockStatus.configured ? (
              <span style={{ color: '#996600' }}>
                No password is set in this build. AI settings cannot be changed.
              </span>
            ) : lockStatus.unlocked ? (
              <span style={{ color: '#006600' }}>
                Unlocked for this session. Re-locks automatically after 30 minutes or on quit.
              </span>
            ) : (
              <span>
                Locked. The admin password is required to enable the AI or change its level.
                It is set by whoever builds the app and is not stored on this machine.
              </span>
            )}
          </div>
          {lockStatus.unlocked && (
            <button className="btn" style={{ marginTop: 8 }}
              onClick={async () => { await window.api.aiLock(); setLockStatus({ configured: true, unlocked: false }); }}>
              Lock now
            </button>
          )}
        </div>

      </div>
    </>
  );
}
