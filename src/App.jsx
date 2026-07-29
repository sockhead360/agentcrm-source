import React, { useState, useEffect, useCallback } from 'react';
import callManager from './callManager.js';
import DemoReel from './components/DemoReel.jsx';
import Sidebar from './components/Sidebar.jsx';
import LeadsTab from './components/LeadsTab.jsx';
import CampaignsTab from './components/CampaignsTab.jsx';
import ConversationsTab from './components/ConversationsTab.jsx';
import NotesTab from './components/NotesTab.jsx';
import SubmitLeadTab from './components/SubmitLeadTab.jsx';
import AiTab from './components/AiTab.jsx';
import SettingsTab from './components/SettingsTab.jsx';

// On-call chip, docked INTO the blue title bar (next to the Twilio status) — part of the
// app chrome, so it never overlaps content on any tab. Visible everywhere while a call is
// live; the call itself lives in callManager and survives all navigation.
function GlobalCallBar() {
  const [snap, setSnap] = useState(callManager.getState());
  useEffect(() => callManager.subscribe(setSnap), []);
  if (snap.status !== 'active' && snap.status !== 'connecting') return null;
  const mm = String(Math.floor(snap.duration / 60)).padStart(2, '0');
  const ss = String(snap.duration % 60).padStart(2, '0');
  const btn = {
    background: '#c0c0c0', border: '2px solid',
    borderColor: '#ffffff #808080 #808080 #ffffff',
    cursor: 'pointer', padding: '1px 7px', height: 20,
    fontFamily: '"Tahoma","Arial",sans-serif', fontSize: 10, color: '#000',
    display: 'flex', alignItems: 'center', lineHeight: 1,
  };
  return (
    <div style={{
      WebkitAppRegion: 'no-drag',
      background: '#000080',
      border: '2px solid', borderColor: '#4040a0 #000040 #000040 #4040a0',
      padding: '2px 7px',
      display: 'flex', alignItems: 'center', gap: 7,
      fontFamily: '"Tahoma","Arial",sans-serif',
    }}>
      <span style={{ fontSize: 11 }}>📞</span>
      <span style={{ color: '#fff', fontSize: 11, fontWeight: 'bold', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {snap.name || snap.phone}
      </span>
      <span style={{
        color: '#7dff9a', fontSize: 11, fontFamily: '"Courier New",monospace',
        background: '#00001a', padding: '1px 6px',
        border: '1px solid #404060', letterSpacing: '0.1em', lineHeight: 1.3,
      }}>
        {snap.status === 'connecting' ? '· · ·' : `${mm}:${ss}`}
      </span>
      <button style={{ ...btn, background: snap.muted ? '#b0b0d0' : '#c0c0c0' }} title={snap.muted ? 'Unmute' : 'Mute'} onClick={() => callManager.toggleMute()}>
        {snap.muted ? '🔇' : '🎙️'}
      </button>
      <button
        style={{ ...btn, background: '#cc2222', color: '#fff', fontWeight: 'bold', borderColor: '#ff6666 #880000 #880000 #ff6666' }}
        onClick={() => callManager.hangup()}
      >
        End
      </button>
    </div>
  );
}

const MENU_ITEMS = [
  { id: 'leads',         label: 'Leads'         },
  { id: 'campaigns',     label: 'Campaigns'     },
  { id: 'conversations', label: 'Conversations' },
  { id: 'submit-lead',   label: 'Submit a Lead' },
  { id: 'notes',         label: 'Notes'         },
  { id: 'ai',            label: 'AI'            },
  { id: 'settings',      label: 'Settings'      },
];

export default function App() {
  const [tab, setTab] = useState('leads');
  const [unreadCount, setUnreadCount] = useState(0);
  const [twilioStatus, setTwilioStatus] = useState('unknown');
  const [settings, setSettings] = useState({});
  const [campaignsReloadKey, setCampaignsReloadKey] = useState(0);
  const [showWelcome, setShowWelcome] = useState(false);
  const [sandboxHistory, setSandboxHistory] = useState([]);
  const [sandboxInput, setSandboxInput] = useState('');
  // Hidden, not a product feature: the scripted AI demo reel (DemoReel.jsx) used to
  // screen-record sales/demo videos. No visible UI — open with Cmd+Shift+D or
  // window.__demoReel() from the console. Pure renderer theater, sends nothing.
  const [showDemoReel, setShowDemoReel] = useState(false);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key.toLowerCase() === 'd' && e.shiftKey && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setShowDemoReel(true);
      }
    };
    window.addEventListener('keydown', onKey);
    window.__demoReel = () => setShowDemoReel(true);
    return () => { window.removeEventListener('keydown', onKey); delete window.__demoReel; };
  }, []);

  const refreshUnread = useCallback(async () => {
    try {
      const count = await window.api.getTotalUnread();
      setUnreadCount(count);
    } catch (_) {}
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      const s = await window.api.getSettings();
      setSettings(s);
      setTwilioStatus(s.accountSid && s.authToken && s.phoneNumber ? 'online' : 'offline');
    } catch (_) {
      setTwilioStatus('offline');
    }
  }, []);

  useEffect(() => {
    loadSettings();
    refreshUnread();
    setShowWelcome(true);
    const hideTimer = setTimeout(() => setShowWelcome(false), 2500);
    const cleanup = window.api.onNewMessages(() => refreshUnread());
    return () => { cleanup(); clearTimeout(hideTimer); };
  }, []);

  return (
    <div className="app-shell">
      {showDemoReel && <DemoReel onClose={() => setShowDemoReel(false)} />}
      {/* AIM-style blue gradient title bar */}
      <div className="title-bar">
        <span className="title-bar-icon">🏃</span>
        <span className="title-bar-logo">AgentCRM</span>
        <span className="title-bar-tagline">— Real Estate Outreach Tool</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <GlobalCallBar />
        </div>
        <div className="title-bar-status" style={{ marginLeft: 0 }}>
          <span className={`status-dot ${twilioStatus === 'online' ? 'online' : 'offline'}`} />
          <span>Twilio: {twilioStatus === 'online' ? 'Connected' : 'Offline'}</span>
        </div>
      </div>

      {/* Windows-style menu bar */}
      <div className="menu-bar">
        {MENU_ITEMS.map(item => (
          <div
            key={item.id}
            className={`menu-item${tab === item.id ? ' active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
            {item.id === 'conversations' && unreadCount > 0 && (
              <span style={{
                marginLeft: 4,
                background: '#ff8000',
                color: 'white',
                fontSize: 9,
                fontWeight: 'bold',
                padding: '0 3px',
                borderRadius: 1,
              }}>
                {unreadCount}
              </span>
            )}
          </div>
        ))}
        <div className="menu-bar-right">
          {twilioStatus === 'online'
            ? '● Online'
            : '○ Configure Twilio in Settings'}
        </div>
      </div>

      {showWelcome && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, pointerEvents: 'none',
        }}>
          <div style={{
            background: 'var(--bg2)',
            border: '2px solid',
            borderTopColor: 'var(--border-hi)',
            borderLeftColor: 'var(--border-hi)',
            borderRightColor: 'var(--border-sh)',
            borderBottomColor: 'var(--border-sh)',
            padding: '18px 36px',
            textAlign: 'center',
            boxShadow: '4px 4px 0 #000',
          }}>
            <div style={{ fontSize: 28, marginBottom: 4 }}>🏃</div>
            <div style={{
              fontFamily: 'var(--font-ui)', fontSize: 22, fontWeight: 'bold',
              color: 'var(--title-b)', letterSpacing: 1,
            }}>
              Welcome!
            </div>
          </div>
        </div>
      )}

      <div className="main-body">
        <Sidebar
          activeTab={tab}
          onTabChange={setTab}
          unreadCount={unreadCount}
          twilioStatus={twilioStatus}
        />
        <div className="main-content">
          {tab === 'leads' && <LeadsTab />}
          {tab === 'campaigns' && (
            <CampaignsTab
              settings={settings}
              onBlastComplete={refreshUnread}
              onNavigate={setTab}
              reloadKey={campaignsReloadKey}
            />
          )}
          {tab === 'conversations' && (
            <ConversationsTab onReadUpdate={refreshUnread} />
          )}
          {tab === 'notes' && <NotesTab />}
          {tab === 'submit-lead' && <SubmitLeadTab />}
          {tab === 'ai' && (
            <AiTab
              sandboxHistory={sandboxHistory}
              setSandboxHistory={setSandboxHistory}
              sandboxInput={sandboxInput}
              setSandboxInput={setSandboxInput}
            />
          )}
          {tab === 'settings' && (
            <SettingsTab onSave={() => { loadSettings(); setCampaignsReloadKey(k => k + 1); }} />
          )}
        </div>
      </div>
    </div>
  );
}
