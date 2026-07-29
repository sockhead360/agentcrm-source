import React, { useState, useEffect } from 'react';
import SegmentCounter from './SegmentCounter.jsx';
import { sanitizeForGSM7, analyzeMessage } from '../utils/segments.js';

const DEFAULT_MESSAGE = "Hey {firstName}! I'm {myName}, a local investor looking for fix and flip type properties that need a value add. Do you have anything for me to look at?";

export default function SettingsTab({ onSave }) {
  const [form, setForm] = useState({
    accountSid: '',
    authToken: '',
    phoneNumber: '',
    messagingServiceSid: '',
    myName: 'Chris',
    myLastName: '',
    email: '',
    notifyPhone: '',
    blastMessage: DEFAULT_MESSAGE,
    liveSmsEnabled: 'false',
    a2pApproved: 'false',
    killSwitch: 'false',
    dailyCap: '10000',
    firstBatchCap: '50',
    claudeApiKey: '',
    voiceApiKeySid: '',
    voiceApiKeySecret: '',
    voiceTwimlAppSid: '',
    voicePhoneNumber: '',
  });
  const [authTokenSet, setAuthTokenSet] = useState(false);
  const [claudeKeySet, setClaudeKeySet] = useState(false);
  const [claudeStatus, setClaudeStatus] = useState(null);
  const [claudeStatusMsg, setClaudeStatusMsg] = useState('');
  const [status, setStatus] = useState(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [currentVersion, setCurrentVersion] = useState('');
  const [updateState, setUpdateState] = useState('idle'); // idle | checking | upToDate | available | downloading | installing
  const [updateInfo, setUpdateInfo] = useState(null);
  const [downloadPct, setDownloadPct] = useState(0);
  const [exportState, setExportState] = useState('idle'); // idle | exporting | done | error
  const [exportMsg, setExportMsg] = useState('');

  useEffect(() => {
    window.api.getSettings().then(s => {
      if (s.authToken && s.authToken.startsWith('••')) {
        setAuthTokenSet(true);
        s.authToken = '';
      }
      if (s.claudeApiKey && s.claudeApiKey.startsWith('••')) {
        setClaudeKeySet(true);
        s.claudeApiKey = '';
      }
      setForm(prev => ({ ...prev, ...s }));
    });
    window.api.getVersion().then(v => setCurrentVersion(v));
    const unsub = window.api.onUpdateProgress(pct => {
      setDownloadPct(pct);
    });
    return unsub;
  }, []);

  const update = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  const handleCheckUpdate = async () => {
    setUpdateState('checking');
    setUpdateInfo(null);
    try {
      const info = await window.api.checkUpdate();
      setUpdateInfo(info);
      setUpdateState(info.hasUpdate ? 'available' : 'upToDate');
    } catch (e) {
      const msg = (e.message || 'Could not reach update server.').replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '');
      setUpdateInfo({ error: msg });
      setUpdateState('idle');
    }
  };

  const handleInstallUpdate = async () => {
    if (!updateInfo?.downloadUrl) return;
    setUpdateState('downloading');
    setDownloadPct(0);
    try {
      await window.api.installUpdate({ downloadUrl: updateInfo.downloadUrl });
      setUpdateState('installing');
    } catch (e) {
      const msg = (e.message || 'Update failed.').replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '');
      setUpdateInfo({ ...updateInfo, error: msg });
      setUpdateState('available');
    }
  };

  const handleSave = async () => {
    setStatus('saving');
    const cleanForm = { ...form, blastMessage: sanitizeForGSM7(form.blastMessage || DEFAULT_MESSAGE) };
    if (cleanForm.blastMessage !== form.blastMessage) update('blastMessage', cleanForm.blastMessage);
    try {
      await window.api.saveSettings(cleanForm);
      setStatus('saved');
      setStatusMsg('Settings saved.');
      onSave?.();
      setTimeout(() => setStatus(null), 3000);
    } catch (e) {
      setStatus('error');
      setStatusMsg(e.message || 'Failed to save.');
    }
  };

  const handleVerify = async () => {
    if (!form.accountSid) {
      setStatus('error');
      setStatusMsg('Enter your Account SID first.');
      return;
    }
    if (!form.authToken && !authTokenSet) {
      setStatus('error');
      setStatusMsg('Auth Token has not been saved yet — paste it in and save first.');
      return;
    }
    setStatus('verifying');
    setStatusMsg('Checking credentials, phone number, and messaging service...');
    try {
      await window.api.verifyTwilio({
        accountSid: form.accountSid,
        authToken: form.authToken,
        phoneNumber: form.phoneNumber,
        messagingServiceSid: form.messagingServiceSid,
      });
      setStatus('verified');
      setStatusMsg('✓ All checks passed — credentials, phone number, and messaging service are valid.');
      setTimeout(() => setStatus(null), 5000);
    } catch (e) {
      setStatus('error');
      setStatusMsg(e.message || 'Verification failed');
    }
  };

  const handleVerifyClaude = async () => {
    if (!form.claudeApiKey && !claudeKeySet) {
      setClaudeStatus('error');
      setClaudeStatusMsg('Enter your API key first.');
      return;
    }
    setClaudeStatus('verifying');
    setClaudeStatusMsg('Testing connection...');
    try {
      await window.api.verifyClaudeKey(form.claudeApiKey);
      setClaudeStatus('ok');
      setClaudeStatusMsg('✓ Connected — API key is valid.');
      setTimeout(() => setClaudeStatus(null), 4000);
    } catch (e) {
      setClaudeStatus('error');
      setClaudeStatusMsg(e.message || 'Connection failed.');
    }
  };

  const handleExportDb = async () => {
    setExportState('exporting');
    setExportMsg('Building transcript...');
    try {
      const res = await window.api.exportTranscripts();
      if (res?.canceled) {
        setExportState('idle');
        setExportMsg('');
        return;
      }
      setExportState('done');
      setExportMsg(`✓ Exported ${res.conversations} conversations · ${res.messages} messages`);
      setTimeout(() => { setExportState('idle'); setExportMsg(''); }, 6000);
    } catch (e) {
      setExportState('error');
      setExportMsg(e.message || 'Export failed.');
    }
  };

  const Toggle = ({ value, onLabel, offLabel, onColor = '#006600', offColor = '#880000', onChange }) => (
    <div
      onClick={onChange}
      style={{
        width: 88, height: 28, cursor: 'pointer', userSelect: 'none',
        background: value ? onColor : offColor,
        border: '2px solid',
        borderTopColor: value ? '#009900' : '#cc0000',
        borderLeftColor: value ? '#009900' : '#cc0000',
        borderRightColor: value ? '#004400' : '#550000',
        borderBottomColor: value ? '#004400' : '#550000',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 'bold',
        flexShrink: 0,
      }}
    >
      {value ? onLabel : offLabel}
    </div>
  );

  return (
    <>
      <div className="tab-header">
        <div className="tab-title">SETTINGS</div>
        <div className="tab-toolbar">
          {status === 'saved' && <span style={{ fontSize: 11, color: '#006600', fontWeight: 'bold' }}>✓ {statusMsg}</span>}
          {status === 'verified' && <span style={{ fontSize: 11, color: '#006600', fontWeight: 'bold' }}>✓ {statusMsg}</span>}
          {status === 'error' && <span style={{ fontSize: 11, color: '#880000', fontWeight: 'bold' }}>{statusMsg}</span>}
          {status === 'verifying' && <span style={{ fontSize: 11, color: 'var(--win-dark)' }}>Verifying...</span>}
          <button className="btn btn-primary" onClick={handleSave} disabled={status === 'saving'} style={{ marginLeft: 'auto' }}>
            {status === 'saving' ? 'Saving...' : '✓ Save Settings'}
          </button>
        </div>
      </div>

      <div className="settings-body">
        <div className="settings-grid">

          {/* ── LEFT COLUMN ── */}
          <div>

            {/* Twilio */}
            <div className="settings-section">
              <div className="settings-section-title">TWILIO CONFIGURATION</div>
              <div style={{ marginBottom: 10, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text2)', lineHeight: 1.7 }}>
                Get your credentials at{' '}
                <span
                  style={{ color: 'var(--title-b)', cursor: 'pointer', textDecoration: 'underline' }}
                  onClick={() => window.api.shellOpenExternal('https://console.twilio.com')}
                >
                  console.twilio.com
                </span>
              </div>
              <div className="form-group">
                <label className="form-label">Account SID</label>
                <input className="form-input" value={form.accountSid || ''} onChange={e => update('accountSid', e.target.value)}
                  placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" style={{ fontFamily: 'var(--font-mono)' }} />
              </div>
              <div className="form-group">
                <label className="form-label">Auth Token</label>
                <input className="form-input" type="password" value={form.authToken || ''}
                  onChange={e => { update('authToken', e.target.value); setAuthTokenSet(false); }}
                  placeholder={authTokenSet ? '(saved — enter new value to change)' : '(not saved — paste your auth token here)'}
                  style={{ fontFamily: 'var(--font-mono)', borderColor: !authTokenSet && !form.authToken ? '#880000' : undefined }}
                />
                {authTokenSet && !form.authToken && (
                  <div className="form-hint" style={{ color: '#006600' }}>✓ Auth token is saved. Leave blank to keep current.</div>
                )}
                {!authTokenSet && !form.authToken && (
                  <div className="form-hint" style={{ color: '#880000', fontWeight: 'bold' }}>⚠ Auth token is not saved — SMS will not work until you enter it.</div>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Your Twilio Phone Number</label>
                <input className="form-input" value={form.phoneNumber || ''} onChange={e => update('phoneNumber', e.target.value)}
                  placeholder="+15551234567" style={{ fontFamily: 'var(--font-mono)' }} />
                <div className="form-hint">Must be in E.164 format: +1XXXXXXXXXX — used for inbound polling</div>
              </div>
              <div className="form-group">
                <label className="form-label">Messaging Service SID <span style={{ color: '#006600', fontWeight: 'bold' }}>(A2P 10DLC)</span></label>
                <input className="form-input" value={form.messagingServiceSid || ''} onChange={e => update('messagingServiceSid', e.target.value)}
                  placeholder="MGxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" style={{ fontFamily: 'var(--font-mono)' }} />
                <div className="form-hint">
                  {form.messagingServiceSid && form.messagingServiceSid.startsWith('MG')
                    ? <span style={{ color: '#006600' }}>✓ Active — all outbound SMS will route through your registered 10DLC campaign</span>
                    : 'Enter your MG... SID from Twilio Console → Messaging → Services to enable A2P routing'}
                </div>
              </div>
              <button className="btn btn-ghost" onClick={handleVerify} disabled={status === 'verifying'}>
                ⚡ Test Connection
              </button>
            </div>

            <div className="settings-section">
              <div className="settings-section-title">VOICE CALLING</div>
              <div className="form-group">
                <label className="form-label">API Key SID <span style={{ color: '#888', fontWeight: 400 }}>(starts with SK)</span></label>
                <input className="form-input" value={form.voiceApiKeySid || ''} onChange={e => update('voiceApiKeySid', e.target.value)} placeholder="SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" style={{ fontFamily: 'var(--font-mono)' }} />
              </div>
              <div className="form-group">
                <label className="form-label">API Key Secret</label>
                <input className="form-input" type="password" value={form.voiceApiKeySecret || ''} onChange={e => update('voiceApiKeySecret', e.target.value)} placeholder="••••••••••••••••••••••••••••••••" style={{ fontFamily: 'var(--font-mono)' }} />
              </div>
              <div className="form-group">
                <label className="form-label">TwiML App SID <span style={{ color: '#888', fontWeight: 400 }}>(starts with AP)</span></label>
                <input className="form-input" value={form.voiceTwimlAppSid || ''} onChange={e => update('voiceTwimlAppSid', e.target.value)} placeholder="APxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" style={{ fontFamily: 'var(--font-mono)' }} />
              </div>
              <div className="form-group">
                <label className="form-label">Caller ID <span style={{ color: '#888', fontWeight: 400 }}>(your Twilio number)</span></label>
                <input className="form-input" value={form.voicePhoneNumber || ''} onChange={e => update('voicePhoneNumber', e.target.value)} placeholder="+18509403301" style={{ fontFamily: 'var(--font-mono)' }} />
              </div>
            </div>

            <div className="settings-section">
              <div className="settings-section-title">OUTREACH PROFILE</div>
              <div className="form-group">
                <label className="form-label">Your First Name</label>
                <input className="form-input" value={form.myName || ''} onChange={e => update('myName', e.target.value)}
                  placeholder="Chris" style={{ maxWidth: 200 }} />
              </div>
              <div className="form-group">
                <label className="form-label">Your Last Name</label>
                <input className="form-input" value={form.myLastName || ''} onChange={e => update('myLastName', e.target.value)}
                  placeholder="Last name" style={{ maxWidth: 200 }} />
                <div className="form-hint">Used when agents ask for your last name or full name.</div>
              </div>
              <div className="form-group">
                <label className="form-label">📧 Your Email</label>
                <input className="form-input" value={form.email || ''} onChange={e => update('email', e.target.value)}
                  placeholder="you@example.com" style={{ maxWidth: 300 }} />
                <div className="form-hint">Used in the AI contact-request reply when an agent asks for your email.</div>
              </div>
              <div className="form-group">
                <label className="form-label">📲 Lead Notification Number</label>
                <input className="form-input" value={form.notifyPhone || ''} onChange={e => update('notifyPhone', e.target.value)}
                  placeholder="7274120832  or  +17274120832" style={{ maxWidth: 260, fontFamily: 'var(--font-mono)' }} />
                <div className="form-hint">Your personal cell — hot leads get texted here automatically.</div>
              </div>
              <div className="form-group">
                <label className="form-label">🔔 Forward-to Cell Number</label>
                <input className="form-input" value={form.forwardPhone || ''} onChange={e => update('forwardPhone', e.target.value)}
                  placeholder="4102609157  or  +14102609157" style={{ maxWidth: 260, fontFamily: 'var(--font-mono)' }} />
                <div className="form-hint">Any format works — dashes, spaces, or plain digits. Saved and used as E.164 automatically.</div>
                {form.forwardPhone && (() => {
                  const digits = form.forwardPhone.replace(/\D/g, '');
                  const normalized = digits.length === 10 ? `+1${digits}` : digits.length === 11 && digits[0] === '1' ? `+${digits}` : null;
                  return normalized
                    ? <div className="form-hint" style={{ color: '#006600' }}>✓ Bell will forward to {normalized}</div>
                    : <div className="form-hint" style={{ color: '#880000' }}>✗ Couldn't parse number — enter 10 digits like 4102609157</div>;
                })()}
                {!form.forwardPhone && (
                  <div className="form-hint" style={{ color: '#886600' }}>⚠ Enter your cell number to use the bell feature.</div>
                )}
              </div>
            </div>

            {/* Claude AI */}
            <div className="settings-section">
              <div className="settings-section-title">AI / CLAUDE CONFIGURATION</div>
              <div style={{ marginBottom: 10, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text2)', lineHeight: 1.7 }}>
                Powers the auto-router: every first reply is sorted into Hot / Warm / Cold and gets the matching templated reply. Edit the replies and flip the AI on/off in the 🤖 AI tab. Off means nothing runs.
              </div>
              <div className="form-group">
                <label className="form-label">Claude API Key</label>
                <input
                  className="form-input"
                  type="password"
                  value={form.claudeApiKey || ''}
                  onChange={e => { update('claudeApiKey', e.target.value); setClaudeKeySet(false); }}
                  placeholder={claudeKeySet ? '(saved — enter new value to change)' : 'sk-ant-...'}
                  style={{ fontFamily: 'var(--font-mono)', borderColor: !claudeKeySet && !form.claudeApiKey ? '#555' : undefined }}
                />
                {claudeKeySet && !form.claudeApiKey && (
                  <div className="form-hint" style={{ color: '#006600' }}>✓ API key is saved. Leave blank to keep current.</div>
                )}
              </div>
              {claudeStatus === 'ok' && <div style={{ fontSize: 11, color: '#006600', fontWeight: 'bold', marginBottom: 8 }}>{claudeStatusMsg}</div>}
              {claudeStatus === 'error' && <div style={{ fontSize: 11, color: '#880000', fontWeight: 'bold', marginBottom: 8 }}>{claudeStatusMsg}</div>}
              {claudeStatus === 'verifying' && <div style={{ fontSize: 11, color: 'var(--win-dark)', marginBottom: 8 }}>{claudeStatusMsg}</div>}
              <button className="btn btn-ghost" onClick={handleVerifyClaude} disabled={claudeStatus === 'verifying'}>
                ⚡ Test Connection
              </button>
            </div>

            {/* App Update */}
            <div className="settings-section">
              <div className="settings-section-title">APP UPDATE</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text2)', lineHeight: 2, marginBottom: 8 }}>
                <div>AgentCRM <span style={{ color: 'var(--text1)', fontWeight: 'bold' }}>v{currentVersion ? currentVersion.replace(/\.0$/, '') : '—'}</span></div>
              </div>

              {updateState === 'idle' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button className="btn btn-ghost" onClick={handleCheckUpdate} style={{ alignSelf: 'flex-start' }}>
                    Check for Updates
                  </button>
                  {updateInfo?.error && (
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#880000' }}>
                      ✗ {updateInfo.error}
                    </div>
                  )}
                </div>
              )}

              {updateState === 'checking' && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text2)' }}>
                  Checking for updates...
                </div>
              )}

              {updateState === 'upToDate' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#006600' }}>
                    ✓ You're on the latest version
                  </div>
                  <button className="btn btn-ghost" onClick={handleCheckUpdate} style={{ alignSelf: 'flex-start' }}>
                    Check Again
                  </button>
                </div>
              )}

              {updateState === 'available' && updateInfo && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#006600', fontWeight: 'bold' }}>
                    v{updateInfo.latestVersion.replace(/\.0$/, '')} is available
                  </div>
                  <button className="btn btn-primary" onClick={handleInstallUpdate} style={{ alignSelf: 'flex-start' }}>
                    Update Now
                  </button>
                  {updateInfo?.error && (
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#880000' }}>
                      ✗ {updateInfo.error}
                    </div>
                  )}
                </div>
              )}

              {updateState === 'downloading' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text2)' }}>
                    Downloading update... {downloadPct}%
                  </div>
                  <div style={{ height: 6, background: 'var(--bg3)', borderRadius: 3, overflow: 'hidden', width: 180 }}>
                    <div style={{ height: '100%', width: `${downloadPct}%`, background: '#00d4ff', transition: 'width 0.2s' }} />
                  </div>
                </div>
              )}

              {updateState === 'installing' && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: '#00d4ff', fontWeight: 'bold' }}>
                  Installing... app will restart automatically
                </div>
              )}
            </div>

            {/* Data Export */}
            <div className="settings-section">
              <div className="settings-section-title">DATA / EXPORT</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 8 }}>
                Export every conversation to a readable transcript (.txt), grouped by category — for analysis or training.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button className="btn btn-primary" onClick={handleExportDb}
                  disabled={exportState === 'exporting'} style={{ alignSelf: 'flex-start' }}>
                  {exportState === 'exporting' ? 'Exporting…' : '⬇ Export DB'}
                </button>
                {exportMsg && (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: exportState === 'error' ? '#880000' : '#006600' }}>
                    {exportMsg}
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* ── RIGHT COLUMN ── */}
          <div>

            {/* Blast Message */}
            <div className="settings-section">
              <div className="settings-section-title">DEFAULT BLAST MESSAGE</div>
              <div className="form-group">
                <textarea className="form-textarea" value={form.blastMessage}
                  onChange={e => update('blastMessage', e.target.value)} rows={6} />
                <SegmentCounter text={form.blastMessage.replace(/\{firstName\}/gi, 'Sarah')} />
                {form.blastMessage && !analyzeMessage(form.blastMessage.replace(/\{firstName\}/gi, 'Sarah')).isGsm && (
                  <button type="button" className="btn btn-ghost" style={{ marginTop: 6, fontSize: 11 }}
                    onClick={() => update('blastMessage', sanitizeForGSM7(form.blastMessage))}>
                    ⚡ Fix GSM-7 (remove smart quotes / unicode)
                  </button>
                )}
                <div className="form-hint" style={{ marginTop: 4 }}>
                  <span className="highlight">{'{firstName}'}</span> is automatically replaced with each agent's first name on send. Counter previews with "Sarah" substituted.
                </div>
              </div>
              <div style={{
                background: 'var(--bg3)', border: '1px solid var(--border)',
                borderRadius: 4, padding: '10px 12px',
                fontFamily: 'var(--font-mono)', fontSize: 11,
                color: 'var(--text1)', lineHeight: 1.6,
              }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text2)', marginBottom: 4 }}>Preview</div>
                {(form.blastMessage || DEFAULT_MESSAGE).replace(/\{firstName\}/gi, 'Sarah')}
              </div>
            </div>

            {/* Send Safety */}
            <div className="settings-section" style={{ borderTop: '3px solid #880000', marginTop: 28 }}>
              <div className="settings-section-title" style={{ color: '#880000' }}>⚠ SEND SAFETY</div>

              <div className="form-group">
                <label className="form-label">A2P/10DLC Registration Approved</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Toggle
                    value={form.a2pApproved === 'true'}
                    onLabel="APPROVED" offLabel="PENDING"
                    onChange={() => update('a2pApproved', form.a2pApproved === 'true' ? 'false' : 'true')}
                  />
                  <span style={{ fontSize: 10, color: 'var(--win-dark)', fontFamily: 'var(--font-ui)' }}>
                    {form.a2pApproved === 'true' ? 'A2P/10DLC approved. Campaigns can launch.' : 'Waiting for Twilio A2P/10DLC approval. All blasts blocked.'}
                  </span>
                </div>
                <div className="form-hint" style={{ color: '#880000' }}>Only enable after Twilio confirms your 10DLC brand and campaign registration is approved.</div>
              </div>

              <div className="form-group">
                <label className="form-label">Live SMS Sending</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Toggle
                    value={form.liveSmsEnabled === 'true'}
                    onLabel="ENABLED" offLabel="LOCKED"
                    onChange={() => update('liveSmsEnabled', form.liveSmsEnabled === 'true' ? 'false' : 'true')}
                  />
                  <span style={{ fontSize: 10, color: 'var(--win-dark)', fontFamily: 'var(--font-ui)' }}>
                    {form.liveSmsEnabled === 'true' ? 'Live sends are ON. Real SMS will be delivered.' : 'All campaign blasts are blocked. Safe to test.'}
                  </span>
                </div>
                <div className="form-hint" style={{ color: '#880000' }}>Keep LOCKED until A2P/10DLC registration is approved.</div>
              </div>

              <div className="form-group">
                <label className="form-label">Emergency Kill Switch</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    onClick={() => update('killSwitch', form.killSwitch === 'true' ? 'false' : 'true')}
                    style={{
                      width: 88, height: 28, cursor: 'pointer', userSelect: 'none',
                      background: form.killSwitch === 'true' ? '#880000' : '#555',
                      border: '2px solid',
                      borderTopColor: form.killSwitch === 'true' ? '#cc0000' : '#888',
                      borderLeftColor: form.killSwitch === 'true' ? '#cc0000' : '#888',
                      borderRightColor: form.killSwitch === 'true' ? '#550000' : '#333',
                      borderBottomColor: form.killSwitch === 'true' ? '#550000' : '#333',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      color: '#fff', fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 'bold',
                    }}
                  >
                    {form.killSwitch === 'true' ? '■ ACTIVE' : 'OFF'}
                  </div>
                  <span style={{ fontSize: 10, color: form.killSwitch === 'true' ? '#880000' : 'var(--win-dark)', fontFamily: 'var(--font-ui)', fontWeight: form.killSwitch === 'true' ? 'bold' : 'normal' }}>
                    {form.killSwitch === 'true' ? 'ALL SENDING BLOCKED — campaign blasts and manual sends are stopped.' : 'Activate to immediately stop all outbound SMS.'}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                <div className="form-group">
                  <label className="form-label">Hard Daily Send Cap</label>
                  <input className="form-input" type="number" min="1" max="10000"
                    value={form.dailyCap || '10000'} onChange={e => update('dailyCap', e.target.value)}
                    style={{ maxWidth: 120 }} />
                  <div className="form-hint">Max SMS per calendar day across all campaigns. (10,000 max)</div>
                </div>
                <div className="form-group">
                  <label className="form-label">First Batch Cap</label>
                  <input className="form-input" type="number" min="1" max="10000"
                    value={form.firstBatchCap || '50'} onChange={e => update('firstBatchCap', e.target.value)}
                    style={{ maxWidth: 120 }} />
                  <div className="form-hint">Campaign auto-pauses after this many sends for review.</div>
                </div>
              </div>

            </div>

          </div>
        </div>
      </div>
    </>
  );
}
