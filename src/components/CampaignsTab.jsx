import React, { useState, useEffect, useCallback, useRef } from 'react';
import ConfirmModal from './ConfirmModal.jsx';
import ResizableSplit from './ResizableSplit.jsx';
import SegmentCounter from './SegmentCounter.jsx';
import { analyzeMessage, sanitizeForGSM7 } from '../utils/segments.js';

function pct(num, denom) {
  if (!denom) return null;
  return Math.round((num / denom) * 100);
}

function StatPill({ label, value, color, suffix = '%' }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minWidth: 80, padding: '6px 10px',
      border: '2px solid', borderTopColor: 'var(--border-sh)', borderLeftColor: 'var(--border-sh)',
      borderRightColor: 'var(--border-hi)', borderBottomColor: 'var(--border-hi)',
      background: 'var(--win-white)',
    }}>
      <div style={{ fontSize: 18, fontWeight: 'bold', color: color || 'var(--win-black)', fontFamily: 'var(--font-ui)' }}>
        {value === null ? '—' : `${value}${suffix}`}
      </div>
      <div style={{ fontSize: 9, color: 'var(--win-dark)', fontFamily: 'var(--font-ui)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

function BigStat({ label, value, color, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '10px 6px', cursor: onClick ? 'pointer' : 'default',
        border: '2px solid', borderTopColor: 'var(--border-sh)', borderLeftColor: 'var(--border-sh)',
        borderRightColor: 'var(--border-hi)', borderBottomColor: 'var(--border-hi)',
        background: 'var(--win-white)',
      }}
    >
      <div style={{ fontSize: 26, fontWeight: 'bold', color: color || 'var(--win-black)', fontFamily: 'var(--font-ui)', lineHeight: 1 }}>
        {(value || 0).toLocaleString()}
      </div>
      <div style={{ fontSize: 9, color: 'var(--win-dark)', fontFamily: 'var(--font-ui)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 }}>
        {label}
      </div>
    </div>
  );
}

function GridStat({ icon, label, value, color, onClick }) {
  return (
    <div onClick={onClick} style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '8px 4px', cursor: onClick ? 'pointer' : 'default',
      border: '2px solid', borderTopColor: 'var(--border-sh)', borderLeftColor: 'var(--border-sh)',
      borderRightColor: 'var(--border-hi)', borderBottomColor: 'var(--border-hi)',
      background: 'var(--win-white)',
    }}>
      {icon && <div style={{ fontSize: 16, lineHeight: 1, marginBottom: 2 }}>{icon}</div>}
      <div style={{ fontSize: 20, fontWeight: 'bold', color: color || 'var(--win-black)', fontFamily: 'var(--font-ui)', lineHeight: 1 }}>
        {typeof value === 'number' ? value.toLocaleString() : (value ?? '—')}
      </div>
      <div style={{ fontSize: 9, color: 'var(--win-dark)', fontFamily: 'var(--font-ui)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 3 }}>
        {label}
      </div>
    </div>
  );
}

function SectionHeader({ label }) {
  return (
    <div style={{ fontSize: 10, fontFamily: 'var(--font-ui)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, color: 'var(--win-dark)', margin: '10px 0 5px', borderTop: '2px solid var(--border-sh)', paddingTop: 8 }}>
      {label}
    </div>
  );
}

function NewRepliesBar({ count, onClick }) {
  const hot = count > 0;
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '7px 12px', marginBottom: 4, cursor: 'pointer',
      background: hot ? '#fffde0' : 'var(--win-white)',
      border: '2px solid',
      borderTopColor: hot ? '#cc8800' : 'var(--border-sh)', borderLeftColor: hot ? '#cc8800' : 'var(--border-sh)',
      borderRightColor: hot ? '#884400' : 'var(--border-hi)', borderBottomColor: hot ? '#884400' : 'var(--border-hi)',
    }}>
      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 'bold', color: hot ? '#884400' : 'var(--win-dark)' }}>
        🔵 New Replies — Needs Action
      </span>
      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 20, fontWeight: 'bold', color: hot ? '#884400' : 'var(--win-dark)' }}>{count}</span>
    </div>
  );
}

function PipelineRows({ convStats, onClick }) {
  const COLS = [
    { key: 'not_interested', icon: '🧊', label: 'Cold',      color: '#555555' },
    { key: 'warm',           icon: '🌤️', label: 'Warm',      color: '#bb8800' },
    { key: 'hot_lead',       icon: '🔥', label: 'Hot',       color: '#cc4400' },
    { key: 'caliente',       icon: '🌶️', label: 'Red Hot',   color: '#aa1111' },
  ];

  const hasHistory = convStats && COLS.some(c =>
    (convStats[`initial_${c.key}`] || 0) !== (convStats[c.key] || 0)
  );

  return (
    <div style={{ marginBottom: 4 }}>
      {/* Currently row */}
      {hasHistory && (
        <div style={{ fontSize: 9, fontFamily: 'var(--font-ui)', color: 'var(--win-dark)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
          Currently
        </div>
      )}
      <div style={{ display: 'flex', gap: 4, marginBottom: hasHistory ? 4 : 0 }}>
        {COLS.map(c => {
          const val = c.key === 'not_interested'
            ? (convStats?.not_interested ?? 0) + (convStats?.follow_up ?? 0)
            : (convStats?.[c.key] ?? 0);
          return <GridStat key={c.key} icon={c.icon} label={c.label} color={c.color} value={val} onClick={onClick} />;
        })}
      </div>

      {/* Initially row — only shown once any lead has been recategorized */}
      {hasHistory && (
        <>
          <div style={{ fontSize: 9, fontFamily: 'var(--font-ui)', color: 'var(--win-dark)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
            Initially
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            {COLS.map(c => {
              const initVal = convStats?.[`initial_${c.key}`] ?? 0;
              const currVal = convStats?.[c.key] ?? 0;
              const delta = currVal - initVal;
              return (
                <div key={c.key} onClick={onClick} style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  padding: '6px 4px', cursor: onClick ? 'pointer' : 'default',
                  border: '2px solid', borderTopColor: 'var(--border-sh)', borderLeftColor: 'var(--border-sh)',
                  borderRightColor: 'var(--border-hi)', borderBottomColor: 'var(--border-hi)',
                  background: 'var(--win-gray)',
                }}>
                  <div style={{ fontSize: 18, fontWeight: 'bold', color: c.color, fontFamily: 'var(--font-ui)', lineHeight: 1 }}>
                    {initVal}
                  </div>
                  {delta !== 0 && (
                    <div style={{ fontSize: 9, color: delta > 0 ? '#006600' : '#880000', fontFamily: 'var(--font-ui)', marginTop: 1 }}>
                      {delta > 0 ? `+${delta}` : delta} now
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function AllFollowUpBlastModal({ preview, onConfirm, onCancel }) {
  const [message, setMessage] = useState("Hey {firstName}, just checking back in with you. Do you have anything off-market I can look at?");
  const [listOpen, setListOpen] = useState(false);
  const willSend = Math.min(preview.followUpCount, preview.dailyRemaining);
  const blocked = !preview.liveSmsEnabled || !preview.a2pApproved || preview.killSwitch || preview.followUpCount === 0;

  const Row = ({ label, value, warn, good }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0', borderBottom: '1px dotted var(--border-sh)' }}>
      <span style={{ color: 'var(--win-dark)' }}>{label}</span>
      <span style={{ fontWeight: 'bold', color: warn ? '#880000' : good ? '#006600' : 'var(--win-black)' }}>{value}</span>
    </div>
  );

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <span className="modal-title">🧊 COLD BLAST — ALL CAMPAIGNS</span>
          <button className="modal-close" onClick={onCancel}>×</button>
        </div>
        <div className="modal-body">

          <div style={{
            background: preview.followUpCount > 0 ? '#fffde0' : '#ffe8e8',
            border: '2px solid', borderColor: preview.followUpCount > 0 ? '#cc8800' : '#cc0000',
            padding: '10px 14px', marginBottom: 10, textAlign: 'center',
          }}>
            <div style={{ fontSize: 32, fontWeight: 'bold', fontFamily: 'var(--font-ui)', color: preview.followUpCount > 0 ? '#884400' : '#880000', lineHeight: 1 }}>
              {preview.followUpCount}
            </div>
            <div style={{ fontSize: 11, fontFamily: 'var(--font-ui)', color: 'var(--win-dark)', marginTop: 4 }}>
              contact{preview.followUpCount !== 1 ? 's' : ''} marked <strong>Cold</strong> across all campaigns
            </div>
          </div>

          <div style={{ marginBottom: 10 }}>
            <Row label="From number"     value={preview.phoneNumber || '(not set)'}            warn={!preview.phoneNumber} />
            <Row label="Will send"       value={willSend}                                        good={willSend > 0} warn={willSend === 0} />
            <Row label="Daily remaining" value={preview.dailyRemaining.toLocaleString()}         warn={preview.dailyRemaining < 10} />
            <Row label="A2P/10DLC"       value={preview.a2pApproved ? 'Approved' : 'PENDING'}   warn={!preview.a2pApproved} good={preview.a2pApproved} />
            <Row label="Live SMS"        value={preview.liveSmsEnabled ? 'Enabled' : 'LOCKED'}  warn={!preview.liveSmsEnabled} good={preview.liveSmsEnabled} />
            <Row label="Kill switch"     value={preview.killSwitch ? 'ACTIVE' : 'Off'}          warn={preview.killSwitch} good={!preview.killSwitch} />
          </div>

          {preview.contacts?.length > 0 && (
            <div style={{ marginBottom: 10, border: '2px solid', borderTopColor: 'var(--border-sh)', borderLeftColor: 'var(--border-sh)', borderRightColor: 'var(--border-hi)', borderBottomColor: 'var(--border-hi)' }}>
              <div
                onClick={() => setListOpen(o => !o)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 8px', cursor: 'pointer', background: 'var(--win-gray)', userSelect: 'none' }}
              >
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 'bold' }}>
                  {listOpen ? '▼' : '▶'} All Cold Contacts ({preview.contacts.length})
                </span>
                <span style={{ fontSize: 10, color: 'var(--win-dark)', fontFamily: 'var(--font-ui)' }}>{listOpen ? 'collapse' : 'expand to review'}</span>
              </div>
              {listOpen && (
                <div style={{ maxHeight: 200, overflowY: 'auto', background: 'var(--win-white)' }}>
                  {preview.contacts.map((c, i) => (
                    <div key={c.id} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '4px 8px', borderBottom: '1px dotted var(--border-sh)',
                      background: i % 2 === 0 ? 'var(--win-white)' : 'var(--win-gray)',
                    }}>
                      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11 }}>{c.name || c.first_name || '(no name)'}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--win-dark)' }}>{c.phone || '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Cold Blast Message</label>
            <textarea
              className="form-textarea"
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={3}
              style={{ width: '100%', resize: 'vertical' }}
            />
            <SegmentCounter text={message.replace(/\{firstName\}/gi, 'Sarah')} />
            {!analyzeMessage(message.replace(/\{firstName\}/gi, 'Sarah')).isGsm && (
              <button type="button" className="btn btn-ghost" style={{ marginTop: 6, fontSize: 11 }}
                onClick={() => setMessage(sanitizeForGSM7(message))}>
                ⚡ Fix GSM-7
              </button>
            )}
            <div className="form-hint"><span className="highlight">{'{firstName}'}</span> is replaced with each contact's first name on send.</div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={() => onConfirm(message)}
            disabled={blocked}
            style={{
              background: blocked ? undefined : 'linear-gradient(180deg, #884400, #552200)',
              borderTopColor: blocked ? undefined : '#cc7700',
              borderLeftColor: blocked ? undefined : '#cc7700',
            }}
          >
            {blocked
              ? (preview.followUpCount === 0 ? '🔒 No Follow-Ups' : '🔒 Blocked')
              : `⏰ Send to ${willSend} contact${willSend !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

const PERIOD_OPTIONS = [
  { value: 'alltime',   label: 'All Time'   },
  { value: '6months',   label: '6 Months'   },
  { value: '3months',   label: '3 Months'   },
  { value: 'thismonth', label: 'This Month'  },
  { value: 'thisweek',  label: 'This Week'   },
  { value: 'today',     label: 'Today'       },
];

function OverviewPanel({ onNavigate }) {
  const [period, setPeriod] = useState('alltime');
  const [stats, setStats] = useState(null);
  const [showAllFollowUp, setShowAllFollowUp] = useState(false);
  const [allFollowUpPreview, setAllFollowUpPreview] = useState(null);
  const [allBlastState, setAllBlastState] = useState(null); // { sent, failed, total, done }

  const load = useCallback(async () => {
    try {
      const data = await window.api.getOverviewStats(period);
      setStats(data);
    } catch (_) {}
  }, [period]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    const cleanup = window.api.onBlastProgress((progress) => {
      if (allBlastState && !allBlastState.done)
        setAllBlastState(prev => prev ? { ...prev, sent: progress.sent, failed: progress.failed, total: progress.total } : null);
    });
    return cleanup;
  }, [allBlastState]);

  const handleShowAllFollowUp = async () => {
    const preview = await window.api.getAllFollowUpPreview();
    setAllFollowUpPreview(preview);
    setShowAllFollowUp(true);
  };

  const handleAllFollowUpBlast = async (message) => {
    setShowAllFollowUp(false);
    setAllFollowUpPreview(null);
    setAllBlastState({ sent: 0, failed: 0, total: 0, done: false });
    try {
      await window.api.startAllFollowUpBlast({ message });
      setAllBlastState(prev => prev ? { ...prev, done: true } : null);
      load();
    } catch (e) {
      alert('All follow-up blast error: ' + e.message);
      setAllBlastState(null);
    }
  };

  const leads = stats?.leads || {};
  const initialLeads = stats?.initialLeads || {};
  const caliente    = leads.caliente       || 0;
  const hotLeads    = leads.hot_lead       || 0;
  const warm        = leads.warm           || 0;
  const followUp    = leads.follow_up      || 0;
  const notInt      = leads.not_interested || 0;
  const newPending  = stats?.newRepliesPending || 0;
  const lp          = stats?.leadPipeline || {};

  const totalSent   = stats?.total_sent      || 0;
  const totalDeliv  = stats?.total_delivered || 0;
  const totalFailed = stats?.total_failed    || 0;
  const totalReply  = stats?.total_replies   || 0;

  const delivDenom  = totalDeliv + totalFailed;
  const delivPct    = pct(totalDeliv, delivDenom);
  const respPct     = pct(totalReply, totalSent);
  const delivColor  = delivPct === null ? '#888' : delivPct >= 90 ? '#006600' : delivPct >= 70 ? '#886600' : '#880000';

  return (
    <div style={{ padding: '10px 12px', overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>

      {/* Period filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginBottom: 10 }}>
        <span style={{ fontSize: 10, color: 'var(--win-dark)', fontFamily: 'var(--font-ui)', marginRight: 6 }}>Period:</span>
        {PERIOD_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => setPeriod(opt.value)}
            className="btn btn-sm"
            style={{
              background: period === opt.value ? 'var(--win-dark)' : 'var(--bg2)',
              color: period === opt.value ? '#fff' : 'var(--win-black)',
              borderTopColor: period === opt.value ? 'var(--border-sh)' : 'var(--border-hi)',
              borderLeftColor: period === opt.value ? 'var(--border-sh)' : 'var(--border-hi)',
              borderRightColor: period === opt.value ? 'var(--border-hi)' : 'var(--border-sh)',
              borderBottomColor: period === opt.value ? 'var(--border-hi)' : 'var(--border-sh)',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Row 1 — Send volume: 4 equal boxes */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        <BigStat label="Sent"      value={totalSent}   color="var(--win-black)" />
        <BigStat label="Delivered" value={totalDeliv}  color="#004400" />
        <BigStat label="Replied"   value={totalReply}  color="#004488" />
        <BigStat label="Failed"    value={totalFailed} color="#880000" />
      </div>

      {/* Row 2 — Rates */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        <GridStat label="Deliverability" value={delivPct !== null ? `${delivPct}%` : '—'} color={delivColor} />
        <GridStat label="Response Rate"  value={respPct  !== null ? `${respPct}%`  : '—'} color="#004488" />
        <GridStat label="Campaigns"      value={stats?.total_campaigns ?? '—'} color="var(--win-black)" />
        <GridStat label="Opt-Outs"       value={stats?.total_optouts   ?? '—'} color="#880000" />
      </div>

      {/* Section: Conversation Pipeline */}
      <SectionHeader label="Conversation Pipeline" />
      <NewRepliesBar count={newPending} onClick={() => onNavigate?.('conversations')} />
      <PipelineRows
        convStats={{
          caliente, hot_lead: hotLeads, warm, follow_up: followUp, not_interested: notInt,
          initial_caliente: initialLeads.caliente || 0,
          initial_hot_lead: initialLeads.hot_lead || 0,
          initial_warm: initialLeads.warm || 0,
          initial_follow_up: initialLeads.follow_up || 0,
          initial_not_interested: initialLeads.not_interested || 0,
        }}
        onClick={() => onNavigate?.('conversations')}
      />

      {/* All-campaigns follow-up blast */}
      {followUp > 0 && !allBlastState && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4, marginBottom: 2 }}>
          <button
            className="btn btn-sm"
            onClick={handleShowAllFollowUp}
            style={{ background: 'linear-gradient(180deg, #884400, #552200)', color: '#fff', borderTopColor: '#cc7700', borderLeftColor: '#cc7700' }}
          >
            ⏰ Blast All Follow-Ups ({followUp})
          </button>
        </div>
      )}
      {allBlastState && (
        <div style={{
          border: '2px solid', borderTopColor: 'var(--border-sh)', borderLeftColor: 'var(--border-sh)',
          borderRightColor: 'var(--border-hi)', borderBottomColor: 'var(--border-hi)',
          background: 'var(--win-white)', padding: '8px 10px', marginTop: 4, marginBottom: 4,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
            <span style={{ fontWeight: 'bold' }}>{allBlastState.done ? '✓ Cold blast sent' : `Sending cold blast...`}</span>
            <span style={{ color: 'var(--win-dark)' }}>{allBlastState.sent} sent · {allBlastState.failed} failed · {allBlastState.total} total</span>
          </div>
          <div className="progress-outer">
            <div
              className={`progress-inner${allBlastState.done ? ' progress-static' : ''}`}
              style={{ width: allBlastState.done ? '100%' : allBlastState.total > 0 ? `${Math.max(Math.round((allBlastState.sent + allBlastState.failed) / allBlastState.total * 100), 2)}%` : '2%' }}
            />
          </div>
        </div>
      )}

      {showAllFollowUp && allFollowUpPreview && (
        <AllFollowUpBlastModal
          preview={allFollowUpPreview}
          onConfirm={handleAllFollowUpBlast}
          onCancel={() => { setShowAllFollowUp(false); setAllFollowUpPreview(null); }}
        />
      )}

      {/* Section: Deal Funnel */}
      <SectionHeader label="Deal Funnel (All Time)" />
      <div style={{ display: 'flex', gap: 4 }}>
        <GridStat icon="📬" label="Submitted" value={lp.total     || 0} color="#004488" />
        <GridStat icon="❌" label="No-Go"     value={lp.no_go     || 0} color="#880000" />
        <GridStat icon="📝" label="Contract"  value={lp.contracts || 0} color="#445500" />
        <GridStat icon="🏆" label="Closed"    value={lp.closed    || 0} color="#005500" />
      </div>

    </div>
  );
}

const DEFAULT_MESSAGE = "Hi {firstName}, It's Chris. I'm looking to purchase an off-market fixer upper property in the area. Do you have anything available right now that I could take a look at?";

export default function CampaignsTab({ settings, onBlastComplete, onNavigate, reloadKey }) {
  const [campaigns, setCampaigns] = useState([]);
  const [selected, setSelected] = useState(null); // null = overview
  const [showNew, setShowNew] = useState(false);
  const [blastState, setBlastState] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const [lists, setLists] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [blastPreview, setBlastPreview] = useState(null);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [followUpPreview, setFollowUpPreview] = useState(null);
  const autoRefreshedIds = useRef(new Set());

  // Live billing tracker state
  const [twilioBalance, setTwilioBalance] = useState(null); // { current, start, currency, done }
  const balancePollRef = useRef(null);

  const loadCampaigns = useCallback(async () => {
    const data = await window.api.getCampaigns();
    setCampaigns(data);
    // Functional update reads current selected at resolution time, not closure time.
    // Prevents stale closures from snapping selection back to a previous campaign
    // when a slow auto-refresh API call completes after the user has already clicked elsewhere.
    setSelected(prev => {
      if (!prev) return prev;
      return data.find(c => c.id === prev.id) || prev;
    });
  }, []);

  const loadLists = useCallback(async () => {
    const data = await window.api.getLeadLists();
    setLists(data);
  }, []);

  useEffect(() => {
    loadCampaigns();
    loadLists();
    const cleanup = window.api.onBlastProgress((progress) => {
      setBlastState({ total: progress.total, sent: progress.sent, failed: progress.failed });
    });
    return cleanup;
  }, []);

  useEffect(() => {
    if (reloadKey > 0) loadCampaigns();
  }, [reloadKey]);

  const handleShowConfirm = async () => {
    if (!selected) return;
    const preview = await window.api.getBlastPreview(selected.id);
    setBlastPreview(preview);
    setShowConfirm(true);
  };

  const handleBlast = async () => {
    if (!selected) return;
    setShowConfirm(false);
    setBlastPreview(null);
    setBlastState({ total: 0, sent: 0, failed: 0 });

    // Capture Twilio balance before blast starts
    let startBalance = null;
    let balanceCurrency = 'USD';
    try {
      const bal = await window.api.getAccountBalance();
      startBalance = bal.balance;
      balanceCurrency = bal.currency;
      setTwilioBalance({ current: bal.balance, start: bal.balance, currency: bal.currency, done: false });
    } catch (_) {}

    // Poll balance every 15s while blast runs
    if (balancePollRef.current) clearInterval(balancePollRef.current);
    if (startBalance !== null) {
      balancePollRef.current = setInterval(async () => {
        try {
          const bal = await window.api.getAccountBalance();
          setTwilioBalance(prev => prev ? { ...prev, current: bal.balance } : null);
        } catch (_) {}
      }, 15000);
    }

    try {
      await window.api.startBlast(selected.id);
      // Final balance reading
      try {
        const finalBal = await window.api.getAccountBalance();
        setTwilioBalance(prev => prev ? { ...prev, current: finalBal.balance, done: true } : null);
      } catch (_) {}
      setBlastState(prev => ({ ...prev, done: true }));
      loadCampaigns();
      onBlastComplete?.();
    } catch (e) {
      alert('Blast error: ' + e.message);
      setBlastState(null);
    } finally {
      if (balancePollRef.current) {
        clearInterval(balancePollRef.current);
        balancePollRef.current = null;
      }
    }
  };

  const handleCancel = async () => {
    await window.api.cancelBlast();
    setBlastState(null);
    loadCampaigns();
  };

  const handleRefreshStats = async (campaignId) => {
    const id = campaignId ?? selected?.id;
    if (!id) return;
    setRefreshing(true);
    try {
      await window.api.refreshCampaignStats(id);
      await loadCampaigns();
    } catch (e) {
      if (!campaignId) alert('Stats refresh failed: ' + e.message);
    } finally {
      setRefreshing(false);
    }
  };

  // Auto-refresh once per session when a sent campaign is selected
  useEffect(() => {
    if (!selected?.id || !selected.sent_count || !settings?.accountSid) return;
    if (autoRefreshedIds.current.has(selected.id)) return;
    autoRefreshedIds.current.add(selected.id);
    handleRefreshStats(selected.id);
  }, [selected?.id]);

  // Reset balance tracker when campaign changes (don't carry over a previous blast's data)
  useEffect(() => {
    if (!blastState) setTwilioBalance(null);
  }, [selected?.id]);

  const handleShowFollowUp = async () => {
    if (!selected) return;
    const preview = await window.api.getFollowUpPreview(selected.id);
    setFollowUpPreview(preview);
    setShowFollowUp(true);
  };

  const handleFollowUpBlast = async (message) => {
    setShowFollowUp(false);
    setFollowUpPreview(null);
    setBlastState({ total: 0, sent: 0, failed: 0 });
    try {
      await window.api.startFollowUpBlast({ campaignId: selected.id, message });
      setBlastState(prev => ({ ...prev, done: true }));
      loadCampaigns();
      onBlastComplete?.();
    } catch (e) {
      alert('Follow-up blast error: ' + e.message);
      setBlastState(null);
    }
  };

  const handleDelete = async () => {
    const c = confirmDelete;
    setConfirmDelete(null);
    await window.api.deleteCampaign(c.id);
    if (selected?.id === c.id) setSelected(null);
    loadCampaigns();
  };


  const isRunning = blastState && !blastState.done;

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      const tag = document.activeElement?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return;
      if (showNew || showConfirm || showFollowUp || confirmDelete) return;
      e.preventDefault();
      // Items: Overview (null) + each campaign
      const items = [null, ...campaigns];
      const idx = items.findIndex(item => item === null ? selected === null : item?.id === selected?.id);
      const next = e.key === 'ArrowDown'
        ? items[idx < items.length - 1 ? idx + 1 : 0]
        : items[idx > 0 ? idx - 1 : items.length - 1];
      setSelected(next);
      requestAnimationFrame(() => document.querySelector('.campaign-item.active')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, campaigns, showNew, showConfirm, showFollowUp, confirmDelete]);

  return (
    <>
      <div className="tab-header">
        <div className="tab-title">Campaigns</div>
        <div className="tab-toolbar">
          <button className="btn btn-primary" onClick={() => setShowNew(true)}>
            + New Campaign
          </button>

          {selected && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setConfirmDelete(selected)}
              style={{ marginLeft: 'auto', color: '#880000' }}
            >
              🗑 Delete
            </button>
          )}
        </div>
      </div>


      <ResizableSplit
        defaultLeftWidth={260}
        minLeft={160}
        minRight={240}
        storageKey="campaigns"
        left={
          <div className="campaigns-list-panel">
            <div className="lists-sidebar-header">Campaigns ({campaigns.length})</div>
            <div className="campaigns-list">
              {/* Overview entry */}
              <div
                className={`campaign-item${selected === null ? ' active' : ''}`}
                onClick={() => setSelected(null)}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <span style={{ fontSize: 12 }}>📊</span>
                <span className="campaign-item-name">Overview</span>
              </div>

              {campaigns.length === 0 ? (
                <div style={{ padding: '16px 8px', color: 'var(--win-dark)', fontSize: 11, textAlign: 'center' }}>
                  No campaigns yet.<br />Create a new campaign to get started.
                </div>
              ) : campaigns.map(c => (
                <div
                  key={c.id}
                  className={`campaign-item${selected?.id === c.id ? ' active' : ''}`}
                  onClick={() => setSelected(c)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div className="campaign-item-name">{c.name}</div>
                    <span className={`badge badge-${c.status}`}>{c.status.toUpperCase()}</span>
                  </div>
                  <div className="campaign-item-meta">
                    {c.list_names || 'No lists'} · {new Date(c.created_at).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        }
        right={
          <div className="campaign-detail">
            {selected === null ? (
              <OverviewPanel onNavigate={onNavigate} />
            ) : (
              <CampaignDetail
                selected={selected}
                refreshing={refreshing}
                settings={settings}
                blastState={blastState}
                isRunning={isRunning}
                twilioBalance={twilioBalance}
                onRefreshStats={handleRefreshStats}
                onConfirmBlast={handleShowConfirm}
                onFollowUpBlast={handleShowFollowUp}
                onResume={async () => { await window.api.resumeCampaign(selected.id); loadCampaigns(); }}
                onReset={async () => { await window.api.resetCampaign(selected.id); loadCampaigns(); }}
                onCancelBlast={handleCancel}
              />
            )}
          </div>
        }
      />

      {showNew && (
        <NewCampaignModal
          lists={lists}
          settings={settings}
          onClose={() => setShowNew(false)}
          onCreated={async (id) => {
            setShowNew(false);
            await loadCampaigns();
            const all = await window.api.getCampaigns();
            setSelected(all.find(c => c.id === id) || all[0]);
          }}
        />
      )}

      {showConfirm && selected && blastPreview && (
        <BlastConfirmModal
          campaign={selected}
          preview={blastPreview}
          onConfirm={handleBlast}
          onCancel={() => { setShowConfirm(false); setBlastPreview(null); }}
        />
      )}

      {showFollowUp && selected && followUpPreview && (
        <FollowUpBlastModal
          campaign={selected}
          preview={followUpPreview}
          onConfirm={handleFollowUpBlast}
          onCancel={() => { setShowFollowUp(false); setFollowUpPreview(null); }}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete Campaign"
          icon="🗑️"
          message={<>Are you sure you want to delete <strong>"{confirmDelete.name}"</strong>?</>}
          detail="All blast records for this campaign will be removed. This cannot be undone."
          confirmLabel="Delete"
          dangerous
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

    </>
  );
}

function fmt$(n) {
  return '$' + (n || 0).toFixed(4);
}

function LiveBalanceBar({ twilioBalance }) {
  if (!twilioBalance) return null;
  const { current, start, currency, done } = twilioBalance;
  const spent = start !== null ? Math.max(start - current, 0) : null;

  return (
    <div style={{
      border: '2px solid',
      borderTopColor: done ? 'var(--border-sh)' : '#004488',
      borderLeftColor: done ? 'var(--border-sh)' : '#004488',
      borderRightColor: done ? 'var(--border-hi)' : '#002266',
      borderBottomColor: done ? 'var(--border-hi)' : '#002266',
      background: done ? 'var(--win-white)' : '#e8f4ff',
      padding: '8px 12px', marginBottom: 8,
    }}>
      <div style={{ fontSize: 9, fontFamily: 'var(--font-ui)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, color: done ? 'var(--win-dark)' : '#003399', marginBottom: 5 }}>
        {done ? '✓ Final Billing Summary' : '📡 Live Billing Tracker'}
        {!done && <span style={{ marginLeft: 8, color: '#004488', fontWeight: 'normal' }}>● updating every 15s</span>}
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '6px 8px', background: 'var(--win-white)',
          border: '2px solid', borderTopColor: 'var(--border-sh)', borderLeftColor: 'var(--border-sh)',
          borderRightColor: 'var(--border-hi)', borderBottomColor: 'var(--border-hi)',
        }}>
          <div style={{ fontSize: 18, fontWeight: 'bold', fontFamily: 'var(--font-ui)', color: '#004400', lineHeight: 1 }}>
            ${current.toFixed(2)}
          </div>
          <div style={{ fontSize: 9, color: 'var(--win-dark)', fontFamily: 'var(--font-ui)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>
            {currency} Balance
          </div>
        </div>
        {spent !== null && (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '6px 8px', background: 'var(--win-white)',
            border: '2px solid', borderTopColor: 'var(--border-sh)', borderLeftColor: 'var(--border-sh)',
            borderRightColor: 'var(--border-hi)', borderBottomColor: 'var(--border-hi)',
          }}>
            <div style={{ fontSize: 18, fontWeight: 'bold', fontFamily: 'var(--font-ui)', color: spent > 0 ? '#880000' : '#555', lineHeight: 1 }}>
              {spent > 0 ? `-$${spent.toFixed(4)}` : '$0.00'}
            </div>
            <div style={{ fontSize: 9, color: 'var(--win-dark)', fontFamily: 'var(--font-ui)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>
              {done ? 'Total Spent' : 'Spent So Far'}
            </div>
          </div>
        )}
        {start !== null && (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '6px 8px', background: 'var(--win-gray)',
            border: '2px solid', borderTopColor: 'var(--border-sh)', borderLeftColor: 'var(--border-sh)',
            borderRightColor: 'var(--border-hi)', borderBottomColor: 'var(--border-hi)',
          }}>
            <div style={{ fontSize: 14, fontWeight: 'bold', fontFamily: 'var(--font-ui)', color: 'var(--win-dark)', lineHeight: 1 }}>
              ${start.toFixed(2)}
            </div>
            <div style={{ fontSize: 9, color: 'var(--win-dark)', fontFamily: 'var(--font-ui)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>
              Balance at Start
            </div>
          </div>
        )}
      </div>
      <div style={{ fontSize: 9, color: 'var(--win-dark)', fontFamily: 'var(--font-ui)', marginTop: 5 }}>
        Includes all outbound blast segments + inbound replies + carrier fees · Direct from Twilio account balance
      </div>
    </div>
  );
}

function CampaignDetail({ selected, refreshing, settings, blastState, isRunning, twilioBalance, onRefreshStats, onConfirmBlast, onFollowUpBlast, onResume, onReset, onCancelBlast }) {
  const [leadKPIs, setLeadKPIs] = useState(null);
  const [convStats, setConvStats] = useState(null);

  useEffect(() => {
    window.api.getCampaignLeadKPIs(selected.id).then(setLeadKPIs).catch(() => {});
    window.api.getCampaignConvStats(selected.id).then(setConvStats).catch(() => {});
  }, [selected.id]);

  const optOutCount = selected.opt_out_count ?? null;
  const delivDenom  = (selected.delivered_count || 0) + (selected.failed_count || 0);
  const delivPct    = pct(selected.delivered_count, delivDenom);
  const delivColor  = delivPct === null ? '#888' : delivPct >= 90 ? '#006600' : delivPct >= 70 ? '#886600' : '#880000';
  const respPct     = pct(selected.response_count, selected.sent_count);
  const optPct      = optOutCount !== null ? pct(optOutCount, selected.sent_count) : null;
  const optColor    = optPct === null ? '#888' : optPct <= 2 ? '#006600' : optPct <= 5 ? '#886600' : '#880000';
  const blastPct    = blastState && blastState.total > 0
    ? Math.round((blastState.sent + blastState.failed) / blastState.total * 100) : 0;

  return (
    <div style={{ padding: '10px 12px', overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 'bold', fontSize: 14 }}>{selected.name}</div>
          <div style={{ fontSize: 10, color: 'var(--win-dark)', marginTop: 2 }}>
            Lists: {selected.list_names || 'none'} · Created {new Date(selected.created_at).toLocaleDateString()}
          </div>
        </div>
        <span className={`badge badge-${selected.status}`}>{selected.status.toUpperCase()}</span>
      </div>

      {/* Row 1 — Volume */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        <BigStat label="Sent"      value={selected.sent_count      || 0} color="var(--win-black)" />
        <BigStat label="Delivered" value={selected.delivered_count || 0} color="#004400" />
        <BigStat label="Replied"   value={selected.response_count  || 0} color="#004488" />
        <BigStat label="Failed"    value={selected.failed_count    || 0} color="#880000" />
      </div>

      {/* Row 2 — Rates */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        <GridStat label="Deliverability" value={delivPct !== null ? `${delivPct}%` : '—'} color={delivColor} />
        <GridStat label="Response Rate"  value={respPct  !== null ? `${respPct}%`  : '—'} color="#004488" />
        <GridStat label="Opt-Out Rate"   value={optPct   !== null ? `${optPct}%`   : '—'} color={optColor} />
        <GridStat label={`Stop${optOutCount !== 1 ? 's' : ''}`} value={optOutCount ?? '—'} color="#880000" />
      </div>

      {/* Section: Conversation Pipeline */}
      <SectionHeader label="Conversation Pipeline" />
      <NewRepliesBar count={convStats?.newReplies ?? 0} onClick={null} />
      <PipelineRows convStats={convStats} />

      {/* Section: Deal Funnel */}
      <SectionHeader label="Deal Funnel" />
      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        <GridStat icon="📬" label="Submitted" value={leadKPIs?.leads_submitted ?? 0} color="#004488" />
        <GridStat icon="❌" label="No-Go"     value={leadKPIs?.no_go           ?? 0} color="#880000" />
        <GridStat icon="📝" label="Contract"  value={leadKPIs?.contracts       ?? 0} color="#445500" />
        <GridStat icon="🏆" label="Closed"    value={leadKPIs?.closed          ?? 0} color="#005500" />
      </div>

      {/* Message Template */}
      <SectionHeader label="Message Template" />
      <div style={{
        border: '2px solid', borderTopColor: 'var(--border-sh)', borderLeftColor: 'var(--border-sh)',
        borderRightColor: 'var(--border-hi)', borderBottomColor: 'var(--border-hi)',
        background: 'var(--win-white)', padding: '8px 10px', marginBottom: 8,
        fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.6,
      }}>
        {selected.message}
      </div>

      {/* Live billing tracker */}
      <LiveBalanceBar twilioBalance={twilioBalance} />

      {/* Blast progress */}
      {blastState && (
        <div style={{
          border: '2px solid', borderTopColor: 'var(--border-sh)', borderLeftColor: 'var(--border-sh)',
          borderRightColor: 'var(--border-hi)', borderBottomColor: 'var(--border-hi)',
          background: 'var(--win-white)', padding: '8px 10px', marginBottom: 8,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
            <span style={{ fontWeight: 'bold' }}>{blastState.done ? '✓ Blast complete' : `Sending... ${blastPct}%`}</span>
            <span style={{ color: 'var(--win-dark)' }}>{blastState.sent} sent · {blastState.failed} failed · {blastState.total} total</span>
          </div>
          <div className="progress-outer">
            <div className={`progress-inner${blastState.done ? ' progress-static' : ''}`}
              style={{ width: `${blastState.done ? 100 : Math.max(blastPct, 2)}%` }} />
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {(selected.status === 'draft' || selected.status === 'completed') && (
          <button className="btn btn-primary" onClick={onConfirmBlast} disabled={isRunning || !settings?.accountSid}>
            ⚡ SMS Blast Start
          </button>
        )}
        {selected.sent_count > 0 && (
          <button className="btn btn-sm" onClick={onFollowUpBlast} disabled={isRunning || !settings?.accountSid}
            style={{ background: 'linear-gradient(180deg, #884400, #552200)', color: '#fff', borderTopColor: '#cc7700', borderLeftColor: '#cc7700' }}>
            🧊 Cold Blast
          </button>
        )}
        {selected.status === 'paused' && (
          <>
            <div style={{ fontSize: 10, color: '#886600', fontWeight: 'bold' }}>⏸ Paused</div>
            <button className="btn btn-sm" onClick={onResume} style={{ background: '#fffde0' }}>▶ Resume</button>
          </>
        )}
        {selected.status === 'running' && isRunning && (
          <button className="btn btn-danger" onClick={onCancelBlast}>■ Cancel Blast</button>
        )}
        <button className="btn btn-sm" onClick={onRefreshStats} disabled={refreshing || !settings?.accountSid}>
          {refreshing ? '⏳ Refreshing...' : '↻ Refresh Stats'}
        </button>
        {!isRunning && selected.sent_count > 0 && (
          <button className="btn btn-sm" onClick={onReset} style={{ color: '#884400', borderColor: '#884400' }}>
            ↺ Reset & Retry
          </button>
        )}
        {!settings?.accountSid && <span style={{ fontSize: 10, color: '#886600' }}>⚠ Configure Twilio in Settings first</span>}
        {settings?.accountSid && settings?.liveSmsEnabled !== 'true' && <span style={{ fontSize: 10, color: '#880000', fontWeight: 'bold' }}>🔒 Live SMS locked</span>}
        {settings?.killSwitch === 'true' && <span style={{ fontSize: 10, color: '#880000', fontWeight: 'bold' }}>■ Kill switch active</span>}
      </div>

    </div>
  );
}

function BlastConfirmModal({ campaign, preview, onConfirm, onCancel }) {
  const [costEstimate, setCostEstimate] = useState(null);
  const [costLoading, setCostLoading] = useState(true);
  const [costError, setCostError] = useState(null);

  useEffect(() => {
    if (!preview.willSend || !preview.segments) { setCostLoading(false); return; }
    window.api.getBlastCostEstimate({ segments: preview.segments, willSend: preview.willSend })
      .then(est => { setCostEstimate(est); setCostLoading(false); })
      .catch(e => { setCostError(e.message); setCostLoading(false); });
  }, []);

  const blocked = !preview.liveSmsEnabled || !preview.a2pApproved || preview.killSwitch || preview.willSend === 0;
  const Row = ({ label, value, warn, good }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0', borderBottom: '1px dotted var(--border-sh)' }}>
      <span style={{ color: 'var(--win-dark)' }}>{label}</span>
      <span style={{ fontWeight: 'bold', color: warn ? '#880000' : good ? '#006600' : 'var(--win-black)' }}>{value}</span>
    </div>
  );
  const CostRow = ({ label, value, sub, accent }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 11, padding: '3px 0', borderBottom: '1px dotted var(--border-sh)' }}>
      <div>
        <span style={{ color: 'var(--win-dark)' }}>{label}</span>
        {sub && <div style={{ fontSize: 9, color: 'var(--win-dark)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>{sub}</div>}
      </div>
      <span style={{ fontWeight: 'bold', color: accent || 'var(--win-black)', fontFamily: 'var(--font-mono)' }}>{value}</span>
    </div>
  );

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <span className="modal-title">⚡ LAUNCH CONFIRMATION</span>
          <button className="modal-close" onClick={onCancel}>×</button>
        </div>
        <div className="modal-body">
          {(!preview.liveSmsEnabled || !preview.a2pApproved || preview.killSwitch) && (
            <div className="alert alert-error" style={{ marginBottom: 10 }}>
              {!preview.a2pApproved && '📋 A2P/10DLC not approved — enable in Settings once Twilio confirms.\n'}
              {!preview.liveSmsEnabled && '🔒 Live SMS locked — enable in Settings → Send Safety.\n'}
              {preview.killSwitch && '■ Kill switch active — disable in Settings → Send Safety.'}
            </div>
          )}
          <div style={{ marginBottom: 8 }}>
            <Row label="Campaign" value={campaign.name} />
            <Row label="From number" value={preview.phoneNumber || '(not set)'} warn={!preview.phoneNumber} />
            <Row label="Total in lists" value={preview.totalInLists ?? '—'} />
            <Row label="Internally blocked / opted-out" value={preview.blockedCount ?? 0} warn={preview.blockedCount > 0} />
            <Row label="Duplicate phones skipped" value={preview.dedupCount ?? 0} warn={preview.dedupCount > 0} />
            <Row label="Invalid / missing numbers" value={preview.invalidCount ?? 0} warn={preview.invalidCount > 0} />
            <Row label="Eligible to receive" value={preview.eligibleCount} good={preview.eligibleCount > 0} />
            <Row label="Will send (this batch)" value={preview.willSend} good={preview.willSend > 0} warn={preview.willSend === 0} />
            <Row label="SMS segments / message" value={preview.segments} />
            <Row label="Est. total segments" value={preview.estimatedTotalSegments} />
            <Row label="Daily cap" value={`${preview.dailyUsed.toLocaleString()} used / ${preview.dailyCap.toLocaleString()} max`} />
            <Row label="Daily remaining" value={preview.dailyRemaining.toLocaleString()} warn={preview.dailyRemaining < 10} />
            <Row label="Batch cap (auto-pause after)" value={preview.firstBatchCap} />
            <Row label="A2P/10DLC approved" value={preview.a2pApproved ? 'YES' : 'NO — PENDING'} warn={!preview.a2pApproved} good={preview.a2pApproved} />
            <Row label="Live SMS enabled" value={preview.liveSmsEnabled ? 'YES' : 'NO — LOCKED'} warn={!preview.liveSmsEnabled} good={preview.liveSmsEnabled} />
            <Row label="Kill switch" value={preview.killSwitch ? 'ACTIVE — BLOCKING' : 'OFF'} warn={preview.killSwitch} good={!preview.killSwitch} />
          </div>

          {/* Cost estimate section */}
          <div style={{
            border: '2px solid',
            borderTopColor: '#004488', borderLeftColor: '#004488',
            borderRightColor: '#002266', borderBottomColor: '#002266',
            background: '#e8f4ff', padding: '8px 10px', marginBottom: 8,
          }}>
            <div style={{ fontSize: 9, fontFamily: 'var(--font-ui)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, color: '#003399', marginBottom: 5 }}>
              💰 Cost Estimate — Live from Twilio API
            </div>
            {costLoading && (
              <div style={{ fontSize: 10, color: '#004488', fontFamily: 'var(--font-ui)' }}>Fetching rates from Twilio...</div>
            )}
            {costError && (
              <div style={{ fontSize: 10, color: '#880000', fontFamily: 'var(--font-ui)' }}>Could not fetch pricing: {costError}</div>
            )}
            {costEstimate && (
              <>
                {/* Rate info */}
                <div style={{ background: 'var(--win-white)', border: '2px solid', borderTopColor: 'var(--border-sh)', borderLeftColor: 'var(--border-sh)', borderRightColor: 'var(--border-hi)', borderBottomColor: 'var(--border-hi)', padding: '6px 8px', marginBottom: 6 }}>
                  <CostRow
                    label="Twilio base rate"
                    value={`$${costEstimate.outboundPricePerSegment.toFixed(4)}/seg`}
                    sub={`avg across ${costEstimate.carrierCount} US carriers · from Twilio Pricing API`}
                  />
                  <CostRow
                    label="Carrier surcharge (A2P flat fee)"
                    value={`$${costEstimate.carrierFeePerOutboundMsg.toFixed(4)}/msg`}
                    sub={costEstimate.usageMsgCount > 0
                      ? `derived from your ${costEstimate.usageMsgCount.toLocaleString()}-msg usage history · not per-segment`
                      : 'estimated from 18k-msg log analysis'}
                  />
                  <CostRow
                    label="All-in outbound (this segment count)"
                    value={`$${costEstimate.allInOutboundPerMsg.toFixed(4)}/msg`}
                    sub={`${costEstimate.segments} seg × $${costEstimate.outboundPricePerSegment.toFixed(4)} + $${costEstimate.carrierFeePerOutboundMsg.toFixed(4)} carrier`}
                    accent="#003399"
                  />
                  <CostRow
                    label="All-in inbound"
                    value={`$${costEstimate.allInInboundPerMsg.toFixed(4)}/msg`}
                    sub="from your usage history · includes carrier fees"
                    accent="#003399"
                  />
                  {costEstimate.segments > 1 && (
                    <div style={{ marginTop: 4, padding: '3px 6px', background: '#fff3cd', border: '1px solid #cc8800', fontSize: 10, fontFamily: 'var(--font-ui)', color: '#884400' }}>
                      ⚠ Your message is {costEstimate.segments} segments — each extra segment adds ${costEstimate.outboundPricePerSegment.toFixed(4)} to the per-message cost
                    </div>
                  )}
                </div>

                {/* Cost breakdown */}
                <div style={{ background: 'var(--win-white)', border: '2px solid', borderTopColor: 'var(--border-sh)', borderLeftColor: 'var(--border-sh)', borderRightColor: 'var(--border-hi)', borderBottomColor: 'var(--border-hi)', padding: '6px 8px', marginBottom: 6 }}>
                  <CostRow
                    label="Outbound blast (Twilio)"
                    value={`$${costEstimate.outboundTwilioCost.toFixed(4)}`}
                    sub={`${costEstimate.willSend} × ${costEstimate.segments} seg × $${costEstimate.outboundPricePerSegment.toFixed(4)}`}
                    accent="#555"
                  />
                  <CostRow
                    label="Outbound blast (carrier surcharge)"
                    value={`$${costEstimate.outboundCarrierCost.toFixed(4)}`}
                    sub={`${costEstimate.willSend} × $${costEstimate.carrierFeePerOutboundMsg.toFixed(4)} flat`}
                    accent="#555"
                  />
                  <CostRow
                    label={`Est. inbound replies (${Math.round(costEstimate.responseRate * 100)}% rate)`}
                    value={`$${costEstimate.inboundReplyCost.toFixed(4)}`}
                    sub={`${costEstimate.estimatedReplies} repliers × avg ${costEstimate.avgInboundMsgs.toFixed(1)} msgs × $${costEstimate.allInInboundPerMsg.toFixed(4)}`}
                    accent="#880000"
                  />
                  <CostRow
                    label="Est. our follow-up replies (all-in)"
                    value={`$${costEstimate.outboundReplyCost.toFixed(4)}`}
                    sub={`${costEstimate.estimatedReplies} engaged × avg ${costEstimate.avgOutboundFollowups.toFixed(1)} replies × $${costEstimate.allInOutboundPerMsg.toFixed(4)}`}
                    accent="#880000"
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 'bold', fontSize: 16, fontFamily: 'var(--font-ui)', color: '#003399' }}>
                      Total Estimate: ${costEstimate.totalEstimate.toFixed(2)}
                    </div>
                    <div style={{ fontSize: 9, color: '#004488', fontFamily: 'var(--font-ui)', marginTop: 2 }}>
                      Includes Twilio base + A2P carrier surcharges + inbound + follow-ups
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--win-dark)', fontFamily: 'var(--font-ui)', marginTop: 1 }}>
                      {costEstimate.conversationSampleSize >= 5
                        ? `Depth from ${costEstimate.conversationSampleSize} conversations in DB`
                        : 'Depth from 18k-msg log analysis'} · rates from your Twilio account
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <div style={{
            background: 'var(--win-white)', border: '2px solid',
            borderTopColor: 'var(--border-sh)', borderLeftColor: 'var(--border-sh)',
            borderRightColor: 'var(--border-hi)', borderBottomColor: 'var(--border-hi)',
            padding: '6px 8px', fontFamily: 'var(--font-mono)', fontSize: 10, lineHeight: 1.5,
          }}>
            <div style={{ fontSize: 9, color: 'var(--win-dark)', marginBottom: 3, textTransform: 'uppercase' }}>Message preview (sample — "Sarah"):</div>
            {preview.messagePreview}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={onConfirm} disabled={blocked}
            style={{ background: blocked ? '#888' : undefined }}>
            {blocked ? '🔒 Blocked' : `⚡ Send to ${preview.willSend} contact${preview.willSend !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

const DEFAULT_FOLLOWUP_MSG = "Hey {firstName}, just checking back in with you. Do you have anything off-market I can look at?";

function FollowUpBlastModal({ campaign, preview, onConfirm, onCancel }) {
  const [message, setMessage] = useState(DEFAULT_FOLLOWUP_MSG);
  const [listOpen, setListOpen] = useState(false);
  const willSend = Math.min(preview.followUpCount, preview.dailyRemaining);
  const blocked = !preview.liveSmsEnabled || !preview.a2pApproved || preview.killSwitch || preview.followUpCount === 0;

  const Row = ({ label, value, warn, good }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0', borderBottom: '1px dotted var(--border-sh)' }}>
      <span style={{ color: 'var(--win-dark)' }}>{label}</span>
      <span style={{ fontWeight: 'bold', color: warn ? '#880000' : good ? '#006600' : 'var(--win-black)' }}>{value}</span>
    </div>
  );

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <span className="modal-title">🧊 COLD BLAST — {campaign.name}</span>
          <button className="modal-close" onClick={onCancel}>×</button>
        </div>
        <div className="modal-body">

          {/* Follow-up count banner */}
          <div style={{
            background: preview.followUpCount > 0 ? '#fffde0' : '#ffe8e8',
            border: '2px solid', borderColor: preview.followUpCount > 0 ? '#cc8800' : '#cc0000',
            padding: '10px 14px', marginBottom: 10, textAlign: 'center',
          }}>
            <div style={{ fontSize: 32, fontWeight: 'bold', fontFamily: 'var(--font-ui)', color: preview.followUpCount > 0 ? '#884400' : '#880000', lineHeight: 1 }}>
              {preview.followUpCount}
            </div>
            <div style={{ fontSize: 11, fontFamily: 'var(--font-ui)', color: 'var(--win-dark)', marginTop: 4 }}>
              agent{preview.followUpCount !== 1 ? 's' : ''} in <strong>{campaign.name}</strong> marked as Follow-Up
            </div>
            {preview.followUpCount === 0 && (
              <div style={{ fontSize: 10, color: '#880000', marginTop: 6 }}>
                No cold contacts yet. In the Conversations tab, set a contact's category to Cold to include them here.
              </div>
            )}
          </div>

          {/* Safety rows */}
          <div style={{ marginBottom: 10 }}>
            <Row label="From number"    value={preview.phoneNumber || '(not set)'}           warn={!preview.phoneNumber} />
            <Row label="Will send"      value={willSend}                                       good={willSend > 0} warn={willSend === 0} />
            <Row label="Daily remaining" value={preview.dailyRemaining.toLocaleString()}       warn={preview.dailyRemaining < 10} />
            <Row label="A2P/10DLC"      value={preview.a2pApproved ? 'Approved' : 'PENDING'}  warn={!preview.a2pApproved} good={preview.a2pApproved} />
            <Row label="Live SMS"       value={preview.liveSmsEnabled ? 'Enabled' : 'LOCKED'} warn={!preview.liveSmsEnabled} good={preview.liveSmsEnabled} />
            <Row label="Kill switch"    value={preview.killSwitch ? 'ACTIVE' : 'Off'}         warn={preview.killSwitch} good={!preview.killSwitch} />
          </div>

          {/* Collapsible agent list */}
          {preview.contacts?.length > 0 && (
            <div style={{ marginBottom: 10, border: '2px solid', borderTopColor: 'var(--border-sh)', borderLeftColor: 'var(--border-sh)', borderRightColor: 'var(--border-hi)', borderBottomColor: 'var(--border-hi)' }}>
              <div
                onClick={() => setListOpen(o => !o)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 8px', cursor: 'pointer', background: 'var(--win-gray)', userSelect: 'none' }}
              >
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 'bold' }}>
                  {listOpen ? '▼' : '▶'} Cold Contacts ({preview.contacts.length})
                </span>
                <span style={{ fontSize: 10, color: 'var(--win-dark)', fontFamily: 'var(--font-ui)' }}>{listOpen ? 'collapse' : 'expand to review'}</span>
              </div>
              {listOpen && (
                <div style={{ maxHeight: 200, overflowY: 'auto', background: 'var(--win-white)' }}>
                  {preview.contacts.map((c, i) => (
                    <div key={c.id} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '4px 8px', borderBottom: '1px dotted var(--border-sh)',
                      background: i % 2 === 0 ? 'var(--win-white)' : 'var(--win-gray)',
                    }}>
                      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11 }}>
                        {c.name || c.first_name || '(no name)'}
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--win-dark)' }}>
                        {c.phone || '—'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Editable message */}
          <div className="form-group">
            <label className="form-label">Cold Blast Message</label>
            <textarea
              className="form-textarea"
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={3}
              style={{ width: '100%', resize: 'vertical' }}
            />
            <SegmentCounter text={message.replace(/\{firstName\}/gi, 'Sarah')} />
            {!analyzeMessage(message.replace(/\{firstName\}/gi, 'Sarah')).isGsm && (
              <button type="button" className="btn btn-ghost" style={{ marginTop: 6, fontSize: 11 }}
                onClick={() => setMessage(sanitizeForGSM7(message))}>
                ⚡ Fix GSM-7 (remove smart quotes / unicode)
              </button>
            )}
            <div className="form-hint"><span className="highlight">{'{firstName}'}</span> is automatically replaced with each agent's first name on send.</div>
          </div>

          {/* Preview */}
          <div style={{
            background: 'var(--win-white)', border: '2px solid',
            borderTopColor: 'var(--border-sh)', borderLeftColor: 'var(--border-sh)',
            borderRightColor: 'var(--border-hi)', borderBottomColor: 'var(--border-hi)',
            padding: '6px 8px', fontFamily: 'var(--font-mono)', fontSize: 10, lineHeight: 1.5,
          }}>
            <div style={{ fontSize: 9, color: 'var(--win-dark)', marginBottom: 3, textTransform: 'uppercase' }}>Preview (sample — "Sarah"):</div>
            {message.replace(/\{firstName\}/gi, 'Sarah')}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={() => onConfirm(message)}
            disabled={blocked}
            style={{
              background: blocked ? undefined : 'linear-gradient(180deg, #884400, #552200)',
              borderTopColor: blocked ? undefined : '#cc7700',
              borderLeftColor: blocked ? undefined : '#cc7700',
            }}
          >
            {blocked
              ? (preview.followUpCount === 0 ? '🔒 No Follow-Ups' : '🔒 Blocked')
              : `⏰ Send to ${willSend} contact${willSend !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function NewCampaignModal({ lists, settings, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [message, setMessage] = useState(settings?.blastMessage || DEFAULT_MESSAGE);
  const [selectedLists, setSelectedLists] = useState([]);
  const [error, setError] = useState('');

  const toggleList = (id) => {
    setSelectedLists(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      // Auto-fill campaign name from selected list names (only while user hasn't typed a custom name)
      const autoName = lists.filter(l => next.includes(l.id)).map(l => l.name).join(' + ');
      setName(cur => {
        const prevAuto = lists.filter(l => prev.includes(l.id)).map(l => l.name).join(' + ');
        return cur === '' || cur === prevAuto ? autoName : cur;
      });
      return next;
    });
  };

  const handleCreate = async () => {
    if (!name.trim()) { setError('Enter a campaign name.'); return; }
    if (selectedLists.length === 0) { setError('Select at least one list.'); return; }
    if (!message.trim()) { setError('Enter a message template.'); return; }
    try {
      const id = await window.api.createCampaign({ name: name.trim(), message: message.trim(), listIds: selectedLists });
      onCreated(id);
    } catch (e) { setError(e.message); }
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">📡 New Campaign</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {error && <div className="alert alert-error">{error}</div>}

          <div className="form-group">
            <label className="form-label">Campaign Name</label>
            <input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Charlotte Q1 Outreach" />
          </div>

          <div className="form-group">
            <label className="form-label">Lead Lists</label>
            {lists.length === 0 ? (
              <div style={{ color: 'var(--win-dark)', fontSize: 11 }}>No lists imported yet.</div>
            ) : lists.map(l => (
              <label key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginBottom: 4 }}>
                <input type="checkbox" checked={selectedLists.includes(l.id)} onChange={() => toggleList(l.id)} />
                <span style={{ fontSize: 11 }}>{l.name}</span>
                <span style={{ fontSize: 10, color: 'var(--win-dark)' }}>({l.contact_count} agents)</span>
              </label>
            ))}
          </div>

          <div className="form-group">
            <label className="form-label">Message Template</label>
            <textarea className="form-textarea" value={message} onChange={e => setMessage(e.target.value)} rows={4} />
            <SegmentCounter text={message.replace(/\{firstName\}/gi, 'Sarah')} />
            {!analyzeMessage(message.replace(/\{firstName\}/gi, 'Sarah')).isGsm && (
              <button type="button" className="btn btn-ghost" style={{ marginTop: 6, fontSize: 11 }}
                onClick={() => setMessage(sanitizeForGSM7(message))}>
                ⚡ Fix GSM-7 (remove smart quotes / unicode)
              </button>
            )}
            <div className="form-hint" style={{ marginTop: 4 }}>
              <span className="highlight">{'{firstName}'}</span> is automatically replaced with each agent's first name on send.
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-primary" onClick={handleCreate}>Create Campaign</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
