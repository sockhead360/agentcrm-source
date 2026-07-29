import React, { useState, useEffect, useCallback, useRef } from 'react';
import ResizableSplit from './ResizableSplit.jsx';

const fmt = (ts) => {
  if (!ts) return null;
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
};

const EMPTY_FORM = {
  address: '', askingPrice: '', isOffMarket: false,
  beds: '', baths: '', sqft: '', description: '', photoPaths: [],
  extra1: '', extra2: '', extra3: '',
  contactId: null, outcome: null,
};

const DB_MAP = {
  address: 'address', askingPrice: 'asking_price',
  isOffMarket: 'is_off_market', beds: 'beds', baths: 'baths',
  sqft: 'sqft', description: 'description', photoPaths: 'photo_paths',
  extra1: 'extra1', extra2: 'extra2', extra3: 'extra3',
  contactId: 'contact_id', outcome: 'outcome',
};

const OUTCOMES = [
  { value: null,       label: '📬 Submitted',   color: '#004488', bg: '#e0eeff' },
  { value: 'no_go',   label: '❌ No-Go',        color: '#880000', bg: '#ffe8e8' },
  { value: 'contract',label: '📝 Contract',     color: '#445500', bg: '#eeffcc' },
  { value: 'closed',  label: '🏆 Closed Deal',  color: '#005500', bg: '#d0ffd0' },
];

function outcomeIcon(s) {
  if (!s) return '📬';
  if (s === 'no_go') return '❌';
  if (s === 'contract') return '📝';
  if (s === 'closed') return '🏆';
  return '📬';
}

// Completion items — first two are the hard gate, rest are incentive
const COMPLETION_ITEMS = [
  { key: 'address',     label: 'Address',      check: f => !!f.address.trim(),                    required: true  },
  { key: 'asking',      label: 'Asking Price',  check: f => !!f.askingPrice.trim(),                required: true  },
  { key: 'offmarket',   label: 'Off-Market',    check: f => f.isOffMarket,                         required: true  },
  { key: 'bedsbaths',   label: 'Beds/Baths',    check: f => !!(f.beds || f.baths),                 required: false },
  { key: 'sqft',        label: 'Sq Ft',         check: f => !!f.sqft.trim(),                       required: false },
  { key: 'condition',   label: 'Condition',     check: f => !!(f.description.trim() || f.extra3.trim()), required: false },
  { key: 'photos',      label: 'Photos',        check: f => f.photoPaths.length > 0,              required: false },
];

export default function SubmitLeadTab() {
  const [submissions, setSubmissions] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [sending, setSending] = useState(false);
  const [errors, setErrors] = useState({});
  const [dirtyAfterSend, setDirtyAfterSend] = useState(false);
  const [convMedia, setConvMedia] = useState([]);
  const [showMediaPicker, setShowMediaPicker] = useState(false);
  const [pickerConvId, setPickerConvId] = useState(null);
  const [pickerSelected, setPickerSelected] = useState([]);
  const [showAgentPicker, setShowAgentPicker] = useState(false);
  const [agentQuery, setAgentQuery] = useState('');
  const [agentResults, setAgentResults] = useState([]);
  const saveTimer = useRef(null);

  const active = submissions.find(s => s.id === activeId) || null;
  const firstSentAt = active?.tier1_sent_at;
  const lastSentAt  = active?.final_sent_at;

  const load = useCallback(async () => {
    const data = await window.api.getLeadSubmissions();
    setSubmissions(data);
    return data;
  }, []);

  useEffect(() => {
    load().then(data => {
      const incomplete = data.find(s => !s.final_sent_at) || data[0];
      if (incomplete) activateSubmission(incomplete);
    });
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      const tag = document.activeElement?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return;
      e.preventDefault();
      if (!submissions.length) return;
      const idx = submissions.findIndex(s => s.id === activeId);
      const next = e.key === 'ArrowDown'
        ? submissions[idx < submissions.length - 1 ? idx + 1 : 0]
        : submissions[idx > 0 ? idx - 1 : submissions.length - 1];
      activateSubmission(next);
      requestAnimationFrame(() => document.querySelector('.campaign-item.active')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeId, submissions]);

  const activateSubmission = (sub) => {
    setActiveId(sub.id);
    setErrors({});
    setDirtyAfterSend(false);
    setForm({
      address:     sub.address      || '',
      askingPrice: sub.asking_price || '',
      isOffMarket: Boolean(sub.is_off_market),
      beds:        sub.beds         || '',
      baths:       sub.baths        || '',
      sqft:        sub.sqft         || '',
      description: sub.description  || '',
      photoPaths:  JSON.parse(sub.photo_paths || '[]'),
      extra1:      sub.extra1       || '',
      extra2:      sub.extra2       || '',
      extra3:      sub.extra3       || '',
      contactId:   sub.contact_id   || null,
      outcome:     sub.outcome      || null,
    });
  };

  const handleNew = async () => {
    const sub = await window.api.createLeadSubmission();
    const data = await load();
    activateSubmission(data.find(s => s.id === sub.id) || sub);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this lead submission?')) return;
    await window.api.deleteLeadSubmission(id);
    const data = await load();
    if (activeId === id) {
      const next = data[0];
      if (next) activateSubmission(next);
      else { setActiveId(null); setForm(EMPTY_FORM); }
    }
  };

  const saveFields = useCallback((id, dbFields) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await window.api.updateLeadSubmission({ id, fields: dbFields });
      const data = await window.api.getLeadSubmissions();
      setSubmissions(data);
    }, 400);
  }, []);

  const handleChange = (field, value) => {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      const dbKey = DB_MAP[field];
      if (dbKey && activeId) {
        let dbVal;
        if (field === 'isOffMarket') dbVal = value ? 1 : 0;
        else if (field === 'photoPaths') dbVal = JSON.stringify(value);
        else dbVal = value;
        saveFields(activeId, { [dbKey]: dbVal });
      }
      if (activeId && firstSentAt) setDirtyAfterSend(true);
      return next;
    });
  };

  const flushForm = async (f) => {
    clearTimeout(saveTimer.current);
    await window.api.updateLeadSubmission({
      id: activeId,
      fields: {
        address: f.address, asking_price: f.askingPrice,
        is_off_market: f.isOffMarket ? 1 : 0,
        beds: f.beds, baths: f.baths, sqft: f.sqft,
        description: f.description, photo_paths: JSON.stringify(f.photoPaths),
        extra1: f.extra1, extra2: f.extra2, extra3: f.extra3,
        contact_id: f.contactId, outcome: f.outcome,
      },
    });
  };

  const handleSetOutcome = async (outcome) => {
    if (!activeId) return;
    await window.api.setLeadOutcome({ id: activeId, outcome });
    setForm(prev => ({ ...prev, outcome }));
    const data = await window.api.getLeadSubmissions();
    setSubmissions(data);
  };

  const handleSetAgent = async (contactId, agentName) => {
    if (!activeId) return;
    await window.api.setLeadContact({ id: activeId, contactId });
    setForm(prev => ({ ...prev, contactId }));
    setShowAgentPicker(false);
    const data = await window.api.getLeadSubmissions();
    setSubmissions(data);
  };

  const openAgentPicker = async () => {
    setAgentQuery('');
    const results = await window.api.searchAllContacts('');
    setAgentResults(results);
    setShowAgentPicker(true);
  };

  const handleAgentSearch = async (q) => {
    setAgentQuery(q);
    const results = await window.api.searchAllContacts(q);
    setAgentResults(results);
  };

  const canSend = form.address.trim() && form.askingPrice.trim() && form.isOffMarket;

  const handleSend = async () => {
    if (!canSend || !activeId) return;
    setErrors({});
    setSending(true);
    try {
      await flushForm(form);
      await window.api.sendLead({ id: activeId });
      await load();
      setDirtyAfterSend(false);
    } catch (e) {
      alert('Send failed: ' + e.message);
    } finally {
      setSending(false);
    }
  };

  const handlePickFile = async () => {
    const paths = await window.api.pickLeadPhoto();
    if (paths.length) handleChange('photoPaths', [...new Set([...form.photoPaths, ...paths])]);
  };

  const openMediaPicker = async () => {
    const media = await window.api.getConvMedia();
    setConvMedia(media);
    setPickerConvId(media[0]?.convId || null);
    setPickerSelected([]);
    setShowMediaPicker(true);
  };

  const confirmMediaPick = () => {
    handleChange('photoPaths', [...new Set([...form.photoPaths, ...pickerSelected])]);
    setShowMediaPicker(false);
    setPickerSelected([]);
  };

  const removePhoto = (path) => handleChange('photoPaths', form.photoPaths.filter(p => p !== path));

  const pickerConv = convMedia.find(c => c.convId === pickerConvId);

  const completedCount = COMPLETION_ITEMS.filter(i => i.check(form)).length;
  const isComplete = completedCount === COMPLETION_ITEMS.length;
  const pct = Math.round((completedCount / COMPLETION_ITEMS.length) * 100);

  const sendBtnLabel = () => {
    if (sending) return '⏳ Sending...';
    if (firstSentAt && dirtyAfterSend) return '🔄 Send Update →';
    if (firstSentAt && !dirtyAfterSend) return '↩ Re-Send';
    return '📤 Send Lead →';
  };

  return (
    <>
      <div className="tab-header">
        <div className="tab-title">SUBMIT A LEAD</div>
        <div className="tab-toolbar">
          <button className="btn btn-primary" onClick={handleNew}>+ New Lead</button>
        </div>
      </div>

      <ResizableSplit
        defaultLeftWidth={220}
        minLeft={140}
        minRight={300}
        storageKey="submit-lead"
        left={
          <div className="campaigns-list-panel">
            <div className="lists-sidebar-header">Submissions ({submissions.length})</div>
            <div className="campaigns-list">
              {submissions.length === 0 && (
                <div style={{ padding: '14px 8px', color: 'var(--win-dark)', fontSize: 11, textAlign: 'center' }}>
                  No leads yet.<br />Click + New Lead.
                </div>
              )}
              {submissions.map(s => {
                const sent = Boolean(s.tier1_sent_at);
                return (
                  <div
                    key={s.id}
                    className={`campaign-item${activeId === s.id ? ' active' : ''}`}
                    onClick={() => activateSubmission(s)}
                    style={{ position: 'relative' }}
                  >
                    <div className="campaign-item-name" style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 14 }}>
                      {sent ? outcomeIcon(s.outcome) : '🟡'}{' '}{s.address ? s.address.split(',')[0].trim() : '(no address)'}
                    </div>
                    <div className="campaign-item-meta">
                      {sent ? `Sent ${fmt(s.tier1_sent_at)?.split(' ').slice(0, 2).join(' ')}` : 'Draft'} · {fmt(s.updated_at)?.split(' ')[1]}
                    </div>
                    <span
                      onClick={e => { e.stopPropagation(); handleDelete(s.id); }}
                      style={{ position: 'absolute', right: 4, top: 6, fontSize: 11, cursor: 'pointer', color: '#cc0000', fontWeight: 'bold', lineHeight: 1 }}
                      title="Delete lead"
                    >✕</span>
                  </div>
                );
              })}
            </div>
          </div>
        }
        right={
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {!activeId && (
            <div className="empty-state">
              <div className="empty-icon">📬</div>
              <div className="empty-label">No Lead Selected</div>
              <div className="empty-sub">Click + New Lead to start submitting a property</div>
              <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={handleNew}>+ New Lead</button>
            </div>
          )}

          {activeId && (<>

            {/* ── Completion bar ── */}
            <CompletionBar items={COMPLETION_ITEMS} form={form} pct={pct} isComplete={isComplete} />

            {/* ── TIER 1: Essentials (always required) ── */}
            <TierBox num={1} label="Essentials" accent="required">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <div className="form-group" style={{ flex: 2, minWidth: 200 }}>
                  <label className="form-label">
                    Property Address <span style={{ color: '#cc0000' }}>*</span>
                  </label>
                  <input
                    className="form-input"
                    value={form.address}
                    onChange={e => handleChange('address', e.target.value)}
                    placeholder="123 Main St, Tampa, FL 33601"
                    style={{ borderColor: errors.address ? '#cc0000' : undefined }}
                  />
                  {errors.address && <div style={{ color: '#cc0000', fontSize: 10, marginTop: 2 }}>{errors.address}</div>}
                </div>
                <div className="form-group" style={{ flex: 1, minWidth: 130 }}>
                  <label className="form-label">
                    Asking Price <span style={{ color: '#cc0000' }}>*</span>
                  </label>
                  <input
                    className="form-input"
                    value={form.askingPrice}
                    onChange={e => handleChange('askingPrice', e.target.value)}
                    placeholder="$250,000"
                  />
                </div>
              </div>
              <div className="form-group" style={{ marginTop: 2 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
                  <input
                    type="checkbox"
                    checked={form.isOffMarket}
                    onChange={e => handleChange('isOffMarket', e.target.checked)}
                    style={{ width: 14, height: 14 }}
                  />
                  <span className="form-label" style={{ margin: 0 }}>Confirm this property is off-market</span>
                </label>
              </div>
              {/* Source agent link */}
              <div className="form-group" style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="form-label" style={{ margin: 0, flexShrink: 0 }}>Source Agent:</span>
                {form.contactId ? (
                  <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', flex: 1 }}>
                    {submissions.find(s => s.id === activeId)?.agent_name || '(linked)'}
                    {' '}
                    <span
                      onClick={() => handleSetAgent(null)}
                      style={{ fontSize: 10, color: '#880000', cursor: 'pointer', textDecoration: 'underline' }}
                    >unlink</span>
                  </span>
                ) : (
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 10 }} onClick={openAgentPicker}>
                    + Link Agent
                  </button>
                )}
              </div>

              <MoreDetails
                value={form.extra1}
                onChange={v => handleChange('extra1', v)}
                placeholder="e.g. Roof is 2 years old, cash buyers only, seller motivated..."
              />
            </TierBox>

            {/* ── TIER 2: Property Details ── */}
            <TierBox num={2} label="Property Details" accent="optional">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <div className="form-group" style={{ flex: 1, minWidth: 80 }}>
                  <label className="form-label">Beds</label>
                  <input className="form-input" value={form.beds} onChange={e => handleChange('beds', e.target.value)} placeholder="0" />
                </div>
                <div className="form-group" style={{ flex: 1, minWidth: 80 }}>
                  <label className="form-label">Baths</label>
                  <input className="form-input" value={form.baths} onChange={e => handleChange('baths', e.target.value)} placeholder="0" />
                </div>
                <div className="form-group" style={{ flex: 1, minWidth: 110 }}>
                  <label className="form-label">Sq. Footage</label>
                  <input className="form-input" value={form.sqft} onChange={e => handleChange('sqft', e.target.value)} placeholder="0" />
                </div>
              </div>
              <MoreDetails
                value={form.extra2}
                onChange={v => handleChange('extra2', v)}
                placeholder="e.g. AC needs replacing, new water heater, detached garage..."
                defaultOpen
              />
            </TierBox>

            {/* ── TIER 3: Condition + Photos ── */}
            <TierBox num={3} label="Condition + Photos" accent="optional">
              <div className="form-group">
                <label className="form-label">Condition / Description</label>
                <textarea
                  className="form-textarea"
                  value={form.description}
                  onChange={e => handleChange('description', e.target.value)}
                  rows={3}
                  placeholder="Describe property condition, repairs needed, unique features..."
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Photos ({form.photoPaths.length})</label>
                {form.photoPaths.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    {form.photoPaths.map((p, i) => (
                      <div key={i} style={{ position: 'relative', display: 'inline-block' }}>
                        <img
                          src={`file://${p}`}
                          alt=""
                          style={{ width: 72, height: 72, objectFit: 'cover', border: '2px solid var(--border-sh)', cursor: 'pointer', display: 'block' }}
                          onClick={() => window.api.shellOpenExternal(`file://${p}`)}
                          title="Click to open"
                        />
                        <span
                          onClick={() => removePhoto(p)}
                          style={{
                            position: 'absolute', top: 1, right: 1,
                            background: 'rgba(0,0,0,0.75)', color: '#fff',
                            fontSize: 9, width: 13, height: 13,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer',
                          }}
                          title="Remove"
                        >✕</span>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-ghost btn-sm" onClick={handlePickFile}>📎 Attach Photo</button>
                  <button className="btn btn-ghost btn-sm" onClick={openMediaPicker}>💬 From Thread</button>
                </div>
              </div>

              <MoreDetails
                value={form.extra3}
                onChange={v => handleChange('extra3', v)}
                placeholder="e.g. Tenant occupied, foundation issue, seller open to owner finance..."
              />
            </TierBox>

            {/* ── Send Panel ── */}
            <SendPanel
              canSend={canSend}
              sending={sending}
              firstSentAt={firstSentAt}
              lastSentAt={lastSentAt}
              dirtyAfterSend={dirtyAfterSend}
              label={sendBtnLabel()}
              onSend={handleSend}
              form={form}
            />

            {/* ── Deal Outcome (only after lead is sent) ── */}
            {firstSentAt && (
              <div style={{
                border: '2px solid', borderTopColor: 'var(--border-hi)', borderLeftColor: 'var(--border-hi)',
                borderRightColor: 'var(--border-sh)', borderBottomColor: 'var(--border-sh)',
                background: 'var(--win-gray)', padding: '8px 12px', boxShadow: '2px 2px 0 #000',
              }}>
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, color: 'var(--win-dark)', marginBottom: 6 }}>
                  Deal Outcome
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {OUTCOMES.map(o => {
                    const active = form.outcome === o.value;
                    return (
                      <button
                        key={String(o.value)}
                        onClick={() => handleSetOutcome(o.value)}
                        style={{
                          fontFamily: 'var(--font-ui)', fontSize: 11, padding: '4px 12px',
                          border: '2px solid',
                          borderTopColor: active ? o.color : 'var(--border-hi)',
                          borderLeftColor: active ? o.color : 'var(--border-hi)',
                          borderRightColor: active ? o.color : 'var(--border-sh)',
                          borderBottomColor: active ? o.color : 'var(--border-sh)',
                          background: active ? o.bg : 'var(--win-white)',
                          color: active ? o.color : 'var(--win-dark)',
                          fontWeight: active ? 'bold' : 'normal',
                          cursor: 'pointer',
                        }}
                      >
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

          </>)}
        </div>
        }
      />

      {/* ── Agent Picker Modal ── */}
      {showAgentPicker && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}
          onClick={() => setShowAgentPicker(false)}
        >
          <div
            style={{
              background: 'var(--win-gray)', border: '2px solid',
              borderTopColor: 'var(--border-hi)', borderLeftColor: 'var(--border-hi)',
              borderRightColor: 'var(--border-sh)', borderBottomColor: 'var(--border-sh)',
              width: 460, maxHeight: '72vh', display: 'flex', flexDirection: 'column', boxShadow: '4px 4px 0 #000',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{
              background: 'linear-gradient(180deg, var(--title-b), var(--title-a))',
              color: '#fff', padding: '4px 10px', fontFamily: 'var(--font-ui)',
              fontWeight: 'bold', fontSize: 12, display: 'flex', justifyContent: 'space-between',
            }}>
              <span>📱 Select Source Agent</span>
              <span style={{ cursor: 'pointer' }} onClick={() => setShowAgentPicker(false)}>✕</span>
            </div>
            <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-sh)' }}>
              <input
                className="form-input"
                autoFocus
                placeholder="Search by name..."
                value={agentQuery}
                onChange={e => handleAgentSearch(e.target.value)}
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {agentResults.length === 0 ? (
                <div style={{ padding: 20, textAlign: 'center', color: 'var(--win-dark)', fontSize: 12 }}>
                  {agentQuery ? 'No matches found.' : 'No contacts in lead lists yet.'}
                </div>
              ) : agentResults.map((c, i) => (
                <div
                  key={c.id}
                  onClick={() => handleSetAgent(c.id, c.name)}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '7px 10px', cursor: 'pointer', borderBottom: '1px solid var(--border-sh)',
                    background: i % 2 === 0 ? 'var(--win-white)' : 'var(--win-gray)',
                  }}
                >
                  <div>
                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 'bold' }}>{c.name || '(no name)'}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--win-dark)' }}>
                      {c.brokerage ? `${c.brokerage} · ` : ''}{c.phone || '—'}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 9, fontFamily: 'var(--font-ui)', padding: '2px 6px',
                    border: '1px solid var(--border-sh)', background: 'var(--win-gray)',
                    color: 'var(--win-dark)', whiteSpace: 'nowrap',
                  }}>{c.list_name}</span>
                </div>
              ))}
            </div>
            <div style={{ padding: '6px 10px', borderTop: '1px solid var(--border-sh)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: 'var(--win-dark)', fontFamily: 'var(--font-ui)' }}>
                {agentResults.length} result{agentResults.length !== 1 ? 's' : ''}
              </span>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAgentPicker(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Media Picker Modal ── */}
      {showMediaPicker && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}
          onClick={() => setShowMediaPicker(false)}
        >
          <div
            style={{
              background: 'var(--win-gray)', border: '2px solid',
              borderTopColor: 'var(--border-hi)', borderLeftColor: 'var(--border-hi)',
              borderRightColor: 'var(--border-sh)', borderBottomColor: 'var(--border-sh)',
              width: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '4px 4px 0 #000',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{
              background: 'linear-gradient(180deg, var(--title-b), var(--title-a))',
              color: '#fff', padding: '4px 10px', fontFamily: 'var(--font-ui)',
              fontWeight: 'bold', fontSize: 12, display: 'flex', justifyContent: 'space-between',
            }}>
              <span>💬 Pick Photos from Conversation Thread</span>
              <span style={{ cursor: 'pointer' }} onClick={() => setShowMediaPicker(false)}>✕</span>
            </div>

            {convMedia.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--win-dark)', fontFamily: 'var(--font-ui)', fontSize: 12 }}>
                No photos found in conversation threads yet.<br />
                Photos from agents' MMS messages will appear here.
              </div>
            ) : (<>
              <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-sh)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {convMedia.map(c => (
                  <button
                    key={c.convId}
                    className={`btn btn-sm ${pickerConvId === c.convId ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => { setPickerConvId(c.convId); setPickerSelected([]); }}
                  >
                    {c.contactName} ({c.photos.length})
                  </button>
                ))}
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 10 }}>
                {pickerConv ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {pickerConv.photos.map((p, i) => {
                      const sel = pickerSelected.includes(p);
                      return (
                        <div
                          key={i}
                          onClick={() => setPickerSelected(prev => sel ? prev.filter(x => x !== p) : [...prev, p])}
                          style={{ position: 'relative', cursor: 'pointer', border: sel ? '3px solid #0066ff' : '2px solid var(--border-sh)', boxSizing: 'border-box' }}
                        >
                          <img src={`file://${p}`} alt="" style={{ width: 90, height: 90, objectFit: 'cover', display: 'block' }} />
                          {sel && (
                            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,80,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span style={{ fontSize: 22, color: '#fff', textShadow: '0 0 4px #000' }}>✓</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ color: 'var(--win-dark)', fontSize: 11, textAlign: 'center', padding: 16 }}>Select a contact above</div>
                )}
              </div>
              <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border-sh)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <span style={{ flex: 1, fontSize: 11, color: 'var(--win-dark)', fontFamily: 'var(--font-mono)', alignSelf: 'center' }}>{pickerSelected.length} selected</span>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowMediaPicker(false)}>Cancel</button>
                <button className="btn btn-primary btn-sm" disabled={pickerSelected.length === 0} onClick={confirmMediaPick}>
                  Attach {pickerSelected.length > 0 ? `(${pickerSelected.length})` : ''}
                </button>
              </div>
            </>)}
          </div>
        </div>
      )}
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CompletionBar({ items, form, pct, isComplete }) {
  return (
    <div style={{
      border: '2px solid',
      borderTopColor: 'var(--border-sh)', borderLeftColor: 'var(--border-sh)',
      borderRightColor: 'var(--border-hi)', borderBottomColor: 'var(--border-hi)',
      background: 'var(--win-white)', padding: '8px 12px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 'bold', fontSize: 11 }}>
          Lead Completeness
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: isComplete ? '#005500' : 'var(--win-dark)' }}>
          {pct}% — {isComplete ? '🏆 Full lead! Ready to send everything.' : 'More info = better chance of closing'}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 8, background: 'var(--win-gray)', border: '1px inset var(--border-sh)', marginBottom: 8 }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: pct === 100 ? '#006600' : pct >= 60 ? '#cc7700' : '#000099',
          transition: 'width 0.3s ease',
        }} />
      </div>

      {/* Checklist chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {items.map(item => {
          const done = item.check(form);
          return (
            <span key={item.key} style={{
              fontSize: 10, fontFamily: 'var(--font-ui)',
              padding: '1px 7px',
              border: '1px solid',
              borderTopColor: done ? '#006600' : (item.required ? '#990000' : 'var(--border-sh)'),
              borderLeftColor: done ? '#006600' : (item.required ? '#990000' : 'var(--border-sh)'),
              borderRightColor: done ? '#003300' : (item.required ? '#660000' : 'var(--border-dsh)'),
              borderBottomColor: done ? '#003300' : (item.required ? '#660000' : 'var(--border-dsh)'),
              background: done ? '#e0ffe0' : (item.required ? '#ffe8e8' : 'var(--win-gray)'),
              color: done ? '#003300' : (item.required ? '#880000' : 'var(--win-dark)'),
            }}>
              {done ? '✓' : (item.required ? '!' : '○')} {item.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function TierBox({ num, label, accent, children }) {
  const BARS = {
    1: 'linear-gradient(180deg, #1a5fb4, #0d3d8a)',
    2: 'linear-gradient(180deg, #7a4f00, #4a3000)',
    3: 'linear-gradient(180deg, #5a0070, #380045)',
  };
  return (
    <div style={{
      border: '2px solid',
      borderTopColor: 'var(--border-hi)', borderLeftColor: 'var(--border-hi)',
      borderRightColor: 'var(--border-sh)', borderBottomColor: 'var(--border-sh)',
      background: 'var(--win-gray)', boxShadow: '2px 2px 0 #000',
    }}>
      <div style={{
        background: BARS[num], color: '#fff', padding: '3px 8px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontFamily: 'var(--font-ui)', fontWeight: 'bold', fontSize: 11,
      }}>
        <span>T{num} — {label}</span>
        {accent === 'required' && (
          <span style={{ fontSize: 9, fontWeight: 'normal', color: '#ffaaaa' }}>Required to send</span>
        )}
        {accent === 'optional' && (
          <span style={{ fontSize: 9, fontWeight: 'normal', opacity: 0.7 }}>Optional — include what you have</span>
        )}
      </div>
      <div style={{ padding: '10px 12px' }}>{children}</div>
    </div>
  );
}

function MoreDetails({ value, onChange, placeholder, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => { if (value) setOpen(true); }, []);

  return (
    <div style={{ marginTop: 6 }}>
      {!open && !value ? (
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)} style={{ fontSize: 10, opacity: 0.7 }}>
          + More details
        </button>
      ) : (
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" style={{ fontSize: 10 }}>More Details</label>
          <textarea
            className="form-textarea"
            value={value}
            onChange={e => onChange(e.target.value)}
            rows={2}
            placeholder={placeholder}
            style={{ width: '100%', resize: 'vertical', fontSize: 11 }}
          />
        </div>
      )}
    </div>
  );
}

function SendPanel({ canSend, sending, firstSentAt, lastSentAt, dirtyAfterSend, label, onSend, form }) {
  const isUpdate = Boolean(firstSentAt) && dirtyAfterSend;
  const alreadySent = Boolean(firstSentAt) && !dirtyAfterSend;

  // Build preview of what will be included
  const included = [];
  if (form.address || form.askingPrice) included.push('Address + Price');
  if (form.isOffMarket) included.push('Off-Market ✓');
  if (form.beds || form.baths) included.push(`${form.beds || '?'}bd/${form.baths || '?'}ba`);
  if (form.sqft) included.push(`${form.sqft} sqft`);
  if (form.description || form.extra3) included.push('Condition notes');
  if (form.photoPaths.length > 0) included.push(`${form.photoPaths.length} photo(s)`);
  if (form.extra1 || form.extra2 || form.extra3) {
    // Already covered above
  }

  const borderColor = canSend
    ? (isUpdate ? '#cc7700' : '#000099')
    : '#808080';

  return (
    <div style={{
      border: '2px solid',
      borderTopColor: canSend ? (isUpdate ? '#cc7700' : 'var(--title-b)') : 'var(--border-sh)',
      borderLeftColor: canSend ? (isUpdate ? '#cc7700' : 'var(--title-b)') : 'var(--border-sh)',
      borderRightColor: canSend ? (isUpdate ? '#884400' : 'var(--title-a)') : 'var(--border-dsh)',
      borderBottomColor: canSend ? (isUpdate ? '#884400' : 'var(--title-a)') : 'var(--border-dsh)',
      background: alreadySent && !dirtyAfterSend ? '#e8ffe8' : 'var(--win-gray)',
      padding: '10px 14px',
      boxShadow: '2px 2px 0 #000',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>

        {/* Left: status + preview */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!canSend && (
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: '#880000', fontWeight: 'bold', marginBottom: 2 }}>
              🔒 {!form.address.trim() || !form.askingPrice.trim() ? 'Add address + asking price' : 'Confirm off-market'} to unlock
            </div>
          )}
          {canSend && !firstSentAt && (
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 'bold', marginBottom: 2 }}>
              📤 Ready to send to 727-412-0832
            </div>
          )}
          {canSend && firstSentAt && !dirtyAfterSend && (
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: '#005500', fontWeight: 'bold', marginBottom: 2 }}>
              ✅ Sent {fmt(firstSentAt)}{lastSentAt !== firstSentAt ? ` · Updated ${fmt(lastSentAt)}` : ''}
            </div>
          )}
          {canSend && firstSentAt && dirtyAfterSend && (
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: '#884400', fontWeight: 'bold', marginBottom: 2 }}>
              🔄 New info added — send update to 727-412-0832
            </div>
          )}
          {canSend && included.length > 0 && (
            <div style={{ fontSize: 10, color: 'var(--win-dark)', fontFamily: 'var(--font-mono)' }}>
              Will include: {included.join(' · ')}
            </div>
          )}
        </div>

        {/* Right: button */}
        <button
          className="btn btn-primary"
          disabled={!canSend || sending}
          onClick={onSend}
          style={{
            minWidth: 150, flexShrink: 0,
            background: !canSend ? undefined
              : isUpdate ? 'linear-gradient(180deg, #cc7700, #884400)'
              : alreadySent ? 'linear-gradient(180deg, #006600, #004400)'
              : undefined,
            borderTopColor: !canSend ? undefined
              : isUpdate ? '#ffaa00'
              : alreadySent ? '#009900'
              : undefined,
            borderLeftColor: !canSend ? undefined
              : isUpdate ? '#ffaa00'
              : alreadySent ? '#009900'
              : undefined,
          }}
        >
          {label}
        </button>
      </div>
    </div>
  );
}
