import React, { useState, useEffect, useCallback, useRef } from 'react';
import ChatWindow from './ChatWindow.jsx';
import ResizableSplit from './ResizableSplit.jsx';
import EmojiPicker from './EmojiPicker.jsx';
import { play, isMuted, setMuted } from '../sounds.js';

// Mirrors twilio.normalizePhone for client-side preview (no IPC needed)
function normalizePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`;
  if (String(raw).startsWith('+')) return String(raw).replace(/[^+\d]/g, '');
  if (digits.length > 0) return `+${digits}`;
  return null;
}

function NewConversationModal({ onClose, onCreated }) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const preview = normalizePhone(phone);
  const digits = phone.replace(/\D/g, '');
  const phoneValid = digits.length >= 10;

  const handleSubmit = async () => {
    if (!phone.trim()) { setError('Enter a phone number.'); return; }
    if (!phoneValid) { setError('Need at least 10 digits.'); return; }
    setSubmitting(true);
    setError('');
    try {
      const conv = await window.api.startManualConversation({ phone: phone.trim(), name: name.trim() || null });
      play('buddyin');
      onCreated(conv);
    } catch (e) {
      setError(e.message || 'Failed to start conversation.');
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSubmit();
    if (e.key === 'Escape') onClose();
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 360 }}>
        <div className="modal-header">
          <span className="modal-title">💬 New Conversation</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {error && <div className="alert alert-error" style={{ marginBottom: 10 }}>{error}</div>}

          <div className="form-group">
            <label className="form-label">Phone Number</label>
            <input
              className="form-input"
              value={phone}
              onChange={e => { setPhone(e.target.value); setError(''); }}
              onKeyDown={handleKeyDown}
              placeholder="(727) 412-0832 or 7274120832"
              autoFocus
              style={{ fontFamily: 'var(--font-mono)' }}
            />
            {phone && (
              <div className="form-hint" style={{ color: phoneValid ? '#006600' : '#886600', fontFamily: 'var(--font-mono)' }}>
                {phoneValid ? `→ ${preview}` : `${digits.length}/10 digits`}
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Name <span style={{ color: 'var(--win-dark)', fontWeight: 'normal' }}>(optional)</span></label>
            <input
              className="form-input"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="John Smith"
            />
            <div className="form-hint">Can be added or edited later. Defaults to the phone number.</div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={submitting || !phoneValid}
          >
            {submitting ? 'Starting...' : '💬 Start Conversation'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Ctrl+click (or right-click) a thread to type the address in by hand. The AI can only
// pull an address out of what the agent TEXTS — when they give it over the phone there's
// nothing in the thread to extract, so this is the manual path onto the hot-lead row.
function AddressModal({ conv, onClose, onSave }) {
  const [address, setAddress] = useState(conv.address || '');
  const [saving, setSaving] = useState(false);
  const existing = (conv.address || '').trim();

  const commit = async (value) => {
    setSaving(true);
    try { await onSave(value); }
    catch (e) { setSaving(false); return; }
    onClose();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit(address.trim()); }
    if (e.key === 'Escape') onClose();
  };

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 400 }}>
        <div className="modal-header">
          <span className="modal-title">🏠 Property Address</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">{conv.name || conv.phone}</label>
            <input
              className="form-input"
              value={address}
              onChange={e => setAddress(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="154 Cedar Cove Dr, Tampa FL"
              autoFocus
              onFocus={e => e.target.select()}
            />
            <div className="form-hint">
              Shows on the row in the HOT / RED HOT groups so you can scan it without opening
              the thread. Doesn't text anyone or submit a lead.
            </div>
          </div>
        </div>
        <div className="modal-footer">
          {existing && (
            <button
              className="btn btn-ghost"
              style={{ marginRight: 'auto', color: '#aa1111' }}
              onClick={() => commit('')}
              disabled={saving}
            >
              Clear
            </button>
          )}
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary"
            onClick={() => commit(address.trim())}
            disabled={saving || !address.trim()}
          >
            {saving ? 'Saving...' : 'Save Address'}
          </button>
        </div>
      </div>
    </div>
  );
}

const CATEGORIES = {
  new:            { label: 'NEW',          color: 'var(--title-b)' },
  caliente:       { label: 'RED HOT 🌶️',   color: '#aa1111'        },
  hot_lead:       { label: 'HOT 🔥',        color: '#cc4400'        },
  warm:           { label: 'WARM 🌤️',       color: '#bb8800'        },
  not_interested: { label: 'COLD 🧊',       color: 'var(--win-dark)'},
};

const CAT_ORDER = ['new', 'caliente', 'hot_lead', 'warm', 'not_interested'];

// Hot leads carry the extracted address once the AI graduates + auto-submits them
// (set in autoSubmitLead, main.js). Splitting it into the preview line means Chris can
// scan the address without opening the thread — the whole point being to cut the
// back-and-forth against the underwriting Discord channel.
function ConvPreview({ conv, fallback }) {
  if (conv.address && (conv.category === 'hot_lead' || conv.category === 'caliente')) {
    return (
      <div className="buddy-preview-split">
        <span className="buddy-preview-msg">{conv.last_message || fallback}</span>
        <span className="buddy-preview-sep">/</span>
        <span className="buddy-preview-addr">{conv.address}</span>
      </div>
    );
  }
  return <div className="buddy-preview">{conv.last_message || fallback}</div>;
}

const HOT_COLOR_EMOJIS = new Set(['🔴', '🟡', '🟢']);
const HOT_EMOJI_PRIORITY = { '🟢': 0, '🟡': 1, '🔴': 2 };
const hotEmojiRank = (conv) => HOT_EMOJI_PRIORITY[conv.emoji] ?? 3;

const KEY_TO_EMOJI = { r: '🔴', y: '🟡', g: '🟢' };

// Purely visual declutter (Chris, 2026-08-02): hide a whole category out of the list —
// no header, no rows — separate from "collapse" which still shows the header + count.
// Doesn't touch categorization, the AI, or any DB state; only which categories are drawn.
// New is hideable too but starts visible (not hidden by default) — the plan if the AI
// is ever off is to hit N and check it by eye rather than rely on a ping.
const HIDE_KEY_TO_CAT = { n: 'new', w: 'warm', c: 'not_interested' };

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const iso = dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T') + 'Z';
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export default function ConversationsTab({ onReadUpdate }) {
  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [collapsed, setCollapsed] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('agentcrm_collapsed_cats') || '[]')); }
    catch { return new Set(); }
  });
  const [hiddenCats, setHiddenCats] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('agentcrm_hidden_cats') || '[]')); }
    catch { return new Set(); }
  });
  const [dragOverGroup, setDragOverGroup] = useState(null);
  const [showNewConv, setShowNewConv] = useState(false);
  const [soundsMuted, setSoundsMuted] = useState(isMuted());
  const [emojiPicker, setEmojiPicker] = useState(null); // { convId, x, y }
  const [addressEdit, setAddressEdit] = useState(null); // conversation being address-tagged
  const [searchQuery, setSearchQuery] = useState('');
  // Backend full-text search across message bodies (so an address sent mid-thread is
  // findable, not just the last message). ids = matching conv ids, snippets = the
  // matching message body per conv (to show why it matched).
  const [msgMatchIds, setMsgMatchIds] = useState(null);   // null = no backend results yet
  const [msgMatchSnippets, setMsgMatchSnippets] = useState({});
  const [aiEnabled, setAiEnabled] = useState(false);
  const draftsRef = useRef((() => {
    try { return JSON.parse(localStorage.getItem('agentcrm_drafts') || '{}'); }
    catch { return {}; }
  })());
  const dragConvId = useRef(null);
  const selectedRef = useRef(null);
  const archivedIds = useRef(new Set());

  useEffect(() => { selectedRef.current = selected; }, [selected]);

  const loadConversations = useCallback(async () => {
    const data = await window.api.getConversations();
    setConversations(data.filter(c => !archivedIds.current.has(c.id)));
  }, []);

  // Refresh conversation data WITHOUT reordering the list. Used after the user
  // sends a reply: a normal reload sorts by last_message_at DESC, which would
  // bump the just-replied conversation to the top of its group and jump the
  // buddy list out from under the user. Here we keep the existing display order
  // and only update each conversation's fields in place (preview text, etc.).
  // Brand-new conversations (e.g. a fresh inbound) are surfaced at the top.
  const refreshPreservingOrder = useCallback(async () => {
    const data = await window.api.getConversations();
    const fresh = data.filter(c => !archivedIds.current.has(c.id));
    const byId = new Map(fresh.map(c => [c.id, c]));
    setConversations(prev => {
      const kept = prev.filter(c => byId.has(c.id)).map(c => byId.get(c.id));
      const keptIds = new Set(kept.map(c => c.id));
      const added = fresh.filter(c => !keptIds.has(c.id));
      return [...added, ...kept];
    });
  }, []);

  useEffect(() => {
    window.api.getSettings().then(s => setAiEnabled(s.aiEnabled === 'true'));
  }, []);

  useEffect(() => {
    loadConversations();
    const cleanup = window.api.onNewMessages(async () => {
      play('imrcv');
      await loadConversations();
      if (selectedRef.current) {
        await window.api.markRead(selectedRef.current.id);
        loadConversations();
        onReadUpdate?.();
      }
    });
    const interval = setInterval(loadConversations, 30000);
    return () => { cleanup(); clearInterval(interval); };
  }, []);

  const handleSelect = async (conv) => {
    setSelected(conv);
    if (conv.unread_count > 0) {
      await window.api.markRead(conv.id);
      loadConversations();
      onReadUpdate?.();
    }
  };

  const handleArchive = async (convId) => {
    setConversations(prev => prev.filter(c => c.id !== convId));
    if (selected?.id === convId) setSelected(null);
    await window.api.deleteConversation(convId);
  };

  const handleCategoryChange = async (convId, category) => {
    // Moving a color-tagged (red/yellow/green underwriter) lead to cold clears the tag
    // automatically — it no longer means anything once the lead is dead.
    // ORDER MATTERS: the clear must happen AFTER updateCategory, because that handler
    // writes the hot-lead outcome ledger and freezes color_at_end from the live row.
    // Clearing first would hand the ledger a null and destroy the deal-quality history
    // the ledger exists to keep.
    const conv = conversations.find(c => c.id === convId) || (selected?.id === convId ? selected : null);
    const clearDotAfter = category === 'not_interested' && conv && HOT_COLOR_EMOJIS.has(conv.emoji);
    // Auto-advance to next conversation when categorizing the selected one
    if (selected?.id === convId) {
      const allFlat = CAT_ORDER.flatMap(cat => {
        if (cat === 'not_interested') return conversations.filter(c => c.category === 'not_interested' || c.category === 'follow_up');
        return conversations.filter(c => (c.category || 'new') === cat);
      });
      const idx = allFlat.findIndex(c => c.id === convId);
      const next = allFlat[idx + 1] || allFlat[idx - 1] || null;
      await window.api.updateCategory({ convId, category });
      setConversations(prev => prev.map(c => c.id === convId ? { ...c, category } : c));
      if (next) handleSelect(next);
      else setSelected(prev => ({ ...prev, category }));
    } else {
      await window.api.updateCategory({ convId, category });
      setConversations(prev => prev.map(c => c.id === convId ? { ...c, category } : c));
    }
    if (clearDotAfter) await applyEmoji(convId, null);
    if (category === 'not_interested' || category === 'follow_up') play('buddyout');
    else if (category === 'hot_lead' || category === 'caliente') play('buddyin');
  };

  const toggleCollapse = (catKey) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(catKey) ? next.delete(catKey) : next.add(catKey);
      localStorage.setItem('agentcrm_collapsed_cats', JSON.stringify([...next]));
      return next;
    });
  };

  const toggleHidden = useCallback((catKey) => {
    setHiddenCats(prev => {
      const next = new Set(prev);
      next.has(catKey) ? next.delete(catKey) : next.add(catKey);
      localStorage.setItem('agentcrm_hidden_cats', JSON.stringify([...next]));
      return next;
    });
  }, []);

  // Ctrl+click on macOS fires `contextmenu` (and, depending on the surface, a click with
  // ctrlKey set) — handle both so the address editor opens either way, and swallow the
  // event so the row doesn't also get selected / the emoji picker doesn't also open.
  const isAddressChord = (e) => e.ctrlKey || e.metaKey;

  const openAddressEditor = (e, conv) => {
    e.preventDefault();
    e.stopPropagation();
    setEmojiPicker(null);
    setAddressEdit(conv);
  };

  const saveAddress = async (convId, address) => {
    await window.api.setConversationAddress({ convId, address });
    const next = address || null;
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, address: next } : c));
    setSelected(prev => prev?.id === convId ? { ...prev, address: next } : prev);
  };

  const handleEmojiIconClick = (e, convId) => {
    if (isAddressChord(e)) return; // let the row's ctrl+click handler take it
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setEmojiPicker({ convId, x: rect.right + 4, y: rect.top });
  };

  const applyEmoji = useCallback(async (convId, emoji) => {
    await window.api.setConversationEmoji({ convId, emoji });
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, emoji } : c));
    setSelected(prev => prev?.id === convId ? { ...prev, emoji } : prev);
  }, []);

  const handleEmojiSelect = async (emoji) => {
    if (!emojiPicker) return;
    const { convId } = emojiPicker;
    setEmojiPicker(null);
    await applyEmoji(convId, emoji);
  };

  // Drag handlers
  const onDragStart = (e, convId) => {
    dragConvId.current = convId;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(convId));
  };

  const onDragOver = (e, catKey) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverGroup(catKey);
  };

  const onDragLeave = (e) => {
    // Only clear if leaving the group header entirely
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOverGroup(null);
    }
  };

  const onDrop = async (e, catKey) => {
    e.preventDefault();
    setDragOverGroup(null);
    const convId = dragConvId.current;
    if (convId) await handleCategoryChange(convId, catKey);
    dragConvId.current = null;
  };

  const handleToggleAi = async () => {
    const next = !aiEnabled;
    setAiEnabled(next);
    await window.api.saveSettings({ aiEnabled: next ? 'true' : 'false' });
  };

  // Debounced backend search over message bodies. Runs alongside the instant
  // client-side field filter below — this augments it with mid-thread matches.
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) { setMsgMatchIds(null); setMsgMatchSnippets({}); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const rows = await window.api.searchConversations(q);
        if (cancelled) return;
        const ids = new Set(rows.map(r => r.id));
        const snips = {};
        for (const r of rows) if (r.match_body) snips[r.id] = r.match_body;
        setMsgMatchIds(ids);
        setMsgMatchSnippets(snips);
      } catch (_) { if (!cancelled) { setMsgMatchIds(new Set()); setMsgMatchSnippets({}); } }
    }, 180);
    return () => { cancelled = true; clearTimeout(t); };
  }, [searchQuery]);

  // A conversation matches the search if a contact field / last message matches
  // (instant, client-side) OR the backend found a hit in an earlier message.
  const matchesSearch = useCallback((c, qLower) => {
    if ((c.name || '').toLowerCase().includes(qLower)) return true;
    if ((c.phone || '').toLowerCase().includes(qLower)) return true;
    if ((c.brokerage || '').toLowerCase().includes(qLower)) return true;
    if ((c.last_message || '').toLowerCase().includes(qLower)) return true;
    return msgMatchIds ? msgMatchIds.has(c.id) : false;
  }, [msgMatchIds]);

  // Flat ordered list of currently visible conversations (respects search + collapsed groups)
  const getVisibleConvs = useCallback(() => {
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      return conversations.filter(c => matchesSearch(c, q));
    }
    return CAT_ORDER.flatMap(cat => {
      if (hiddenCats.has(cat) || collapsed.has(cat)) return [];
      let convs;
      if (cat === 'not_interested') {
        convs = conversations.filter(c => c.category === 'not_interested' || c.category === 'follow_up');
      } else {
        convs = conversations.filter(c => (c.category || 'new') === cat);
      }
      if (cat === 'hot_lead') {
        convs = [...convs].sort((a, b) => {
          const pd = hotEmojiRank(a) - hotEmojiRank(b);
          if (pd !== 0) return pd;
          return new Date(b.last_message_at) - new Date(a.last_message_at);
        });
      }
      return convs;
    });
  }, [conversations, searchQuery, collapsed, hiddenCats, matchesSearch]);

  // Arrow key navigation through the conversation list, plus R/Y/G to stamp the
  // selected conversation with a red/yellow/green dot without opening the picker.
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      const tag = el?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT' || el?.isContentEditable) return;

      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const visible = getVisibleConvs();
        if (!visible.length) return;
        const idx = selected ? visible.findIndex(c => c.id === selected.id) : -1;
        const next = e.key === 'ArrowDown'
          ? visible[idx < visible.length - 1 ? idx + 1 : 0]
          : visible[idx > 0 ? idx - 1 : visible.length - 1];
        handleSelect(next);
        return;
      }

      // W / C toggle Warm / Cold visibility — works anywhere in the list, no selection
      // needed, since it's a display filter, not an action on a specific conversation.
      const hideCat = HIDE_KEY_TO_CAT[e.key.toLowerCase()];
      if (hideCat && !emojiPicker) {
        e.preventDefault();
        toggleHidden(hideCat);
        return;
      }

      const dot = KEY_TO_EMOJI[e.key.toLowerCase()];
      if (!dot || !selected || emojiPicker) return;
      e.preventDefault();
      applyEmoji(selected.id, dot);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, emojiPicker, getVisibleConvs, handleSelect, applyEmoji, toggleHidden]);

  // Scroll the active buddy-item into view whenever selection changes
  useEffect(() => {
    if (!selected) return;
    requestAnimationFrame(() => {
      document.querySelector('.buddy-item.active')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }, [selected?.id]);

  // Group conversations by category — follow_up merges into not_interested display group
  const groups = {};
  conversations.forEach(conv => {
    const cat = conv.category || 'new';
    const displayCat = cat === 'follow_up' ? 'not_interested' : cat;
    if (!groups[displayCat]) groups[displayCat] = [];
    groups[displayCat].push(conv);
  });

  return (
    <>
      <div className="tab-header">
        <div className="tab-title">Conversations</div>
        <div className="tab-toolbar">
          <span style={{ fontSize: 10, color: 'var(--win-dark)' }}>
            {conversations.length} active · auto-refreshes every 30s
          </span>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => { const next = !soundsMuted; setMuted(next); setSoundsMuted(next); }}
            title={soundsMuted ? 'Notification sounds are muted — click to unmute' : 'Mute notification sounds (for when you\'re on the phone)'}
            style={{ opacity: soundsMuted ? 1 : 0.75 }}
          >
            {soundsMuted ? '🔇 Muted' : '🔊 Sounds'}
          </button>
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: 4 }} onClick={() => setShowNewConv(true)} title="Start a new conversation with any number">
            + New
          </button>
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: 4 }}
            onClick={() => window.api.pollNow().then(loadConversations)}>
            ↻ Refresh
          </button>
          <button
            className="btn btn-ghost btn-sm"
            style={{ marginLeft: 4 }}
            onClick={handleToggleAi}
            title="Auto-sort incoming 'no' replies to Cold when enabled"
          >
            AI: {aiEnabled ? 'ON' : 'OFF'}
          </button>
          <button
            className="btn btn-ghost btn-sm"
            style={{ marginLeft: 4, opacity: hiddenCats.has('new') ? 1 : 0.75 }}
            onClick={() => toggleHidden('new')}
            title={`${hiddenCats.has('new') ? 'Show' : 'Hide'} New — visual only, nothing stops running (press N)`}
          >
            {hiddenCats.has('new') ? `🆕 New hidden (${groups.new?.length || 0})` : '🆕 Hide New'}
          </button>
          <button
            className="btn btn-ghost btn-sm"
            style={{ marginLeft: 4, opacity: hiddenCats.has('warm') ? 1 : 0.75 }}
            onClick={() => toggleHidden('warm')}
            title={`${hiddenCats.has('warm') ? 'Show' : 'Hide'} Warm — visual only, nothing stops running (press W)`}
          >
            {hiddenCats.has('warm') ? `🌤️ Warm hidden (${groups.warm?.length || 0})` : '🌤️ Hide Warm'}
          </button>
          <button
            className="btn btn-ghost btn-sm"
            style={{ marginLeft: 4, opacity: hiddenCats.has('not_interested') ? 1 : 0.75 }}
            onClick={() => toggleHidden('not_interested')}
            title={`${hiddenCats.has('not_interested') ? 'Show' : 'Hide'} Cold — visual only, nothing stops running (press C)`}
          >
            {hiddenCats.has('not_interested') ? `🧊 Cold hidden (${groups.not_interested?.length || 0})` : '🧊 Hide Cold'}
          </button>
        </div>
      </div>

      <ResizableSplit
        defaultLeftWidth={210}
        minLeft={140}
        minRight={300}
        storageKey="conversations"
        left={
          <div className="buddy-list">
            <div className="buddy-list-header">
              <span>🏃</span>
              <span>Agent List ({conversations.length})</span>
            </div>

            <div style={{ padding: '3px 4px', borderBottom: '1px solid var(--border-sh)', background: 'var(--win-gray)' }}>
              <input
                className="search-input"
                style={{ width: '100%', fontSize: 11 }}
                placeholder="🔍 Search agents & messages..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
            {conversations.length === 0 ? (
              <div style={{ padding: '16px 8px', textAlign: 'center', color: 'var(--win-dark)', fontSize: 11 }}>
                No responses yet.<br />Replies from your campaigns will appear here.
              </div>
            ) : searchQuery.trim() ? (() => {
              const q = searchQuery.trim().toLowerCase();
              const filtered = conversations.filter(c => matchesSearch(c, q));
              if (filtered.length === 0) return (
                <div style={{ padding: '16px 8px', textAlign: 'center', color: 'var(--win-dark)', fontSize: 11 }}>
                  No results for "{searchQuery}"
                </div>
              );
              return filtered.map(conv => (
                <div
                  key={conv.id}
                  className={`buddy-item${selected?.id === conv.id ? ' active' : ''}`}
                  onClick={e => isAddressChord(e) ? openAddressEditor(e, conv) : handleSelect(conv)}
                  onContextMenu={e => openAddressEditor(e, conv)}
                  title="Ctrl+click to set the property address"
                  style={{ cursor: 'pointer' }}
                >
                  <span
                    className="buddy-icon"
                    title="Tag this conversation"
                    onClick={e => handleEmojiIconClick(e, conv.id)}
                    style={{ cursor: 'pointer' }}
                  >{conv.emoji || '🏃'}</span>
                  <div className="buddy-info">
                    <div className="buddy-name">{conv.name || conv.phone}</div>
                    {(() => {
                      // When the hit was inside an earlier message (not the last one),
                      // preview that message so you can see the address/text you searched.
                      const lc = q;
                      const lastHas = (conv.last_message || '').toLowerCase().includes(lc);
                      const snip = msgMatchSnippets[conv.id];
                      const showSnip = !lastHas && snip;
                      if (showSnip) {
                        return (
                          <div className="buddy-preview" style={{ fontStyle: 'italic', color: 'var(--win-dark)' }}>
                            {`“…${snip}”`}
                          </div>
                        );
                      }
                      return <ConvPreview conv={conv} fallback={conv.brokerage || '...'} />;
                    })()}
                  </div>
                  <div className="buddy-meta">
                    <span className="buddy-time">{timeAgo(conv.last_message_at)}</span>
                    {conv.unread_count > 0 && <span className="buddy-unread">{conv.unread_count}</span>}
                  </div>
                </div>
              ));
            })() : CAT_ORDER.map(catKey => {
              if (hiddenCats.has(catKey)) return null;
              let convs = groups[catKey];
              if (!convs || convs.length === 0) return null;
              if (catKey === 'hot_lead') {
                convs = [...convs].sort((a, b) => {
                  const pd = hotEmojiRank(a) - hotEmojiRank(b);
                  if (pd !== 0) return pd;
                  return new Date(b.last_message_at) - new Date(a.last_message_at);
                });
              }
              const catInfo = CATEGORIES[catKey];
              const isCollapsed = collapsed.has(catKey);
              const isDropTarget = dragOverGroup === catKey;

              return (
                <div
                  key={catKey}
                  onDragOver={e => onDragOver(e, catKey)}
                  onDragLeave={onDragLeave}
                  onDrop={e => onDrop(e, catKey)}
                  style={{
                    outline: isDropTarget ? '2px dashed #0066cc' : undefined,
                    background: isDropTarget ? 'rgba(0,80,180,0.07)' : undefined,
                  }}
                >
                  <div
                    className="buddy-group-header"
                    style={{ cursor: 'pointer' }}
                    onClick={() => toggleCollapse(catKey)}
                  >
                    <span style={{ fontSize: 9, color: catInfo.color, transition: 'transform 0.15s', display: 'inline-block', transform: isCollapsed ? 'rotate(-90deg)' : 'none' }}>▼</span>
                    <span style={{ color: catInfo.color }}>{catInfo.label}</span>
                    <span className="buddy-group-count">({convs.length})</span>
                    {isDropTarget && (
                      <span style={{ marginLeft: 4, fontSize: 10, color: '#0066cc', fontWeight: 'normal' }}>drop here</span>
                    )}
                  </div>

                  {!isCollapsed && convs.map(conv => (
                    <div
                      key={conv.id}
                      className={`buddy-item${selected?.id === conv.id ? ' active' : ''}`}
                      draggable
                      onDragStart={e => onDragStart(e, conv.id)}
                      onClick={e => isAddressChord(e) ? openAddressEditor(e, conv) : handleSelect(conv)}
                      onContextMenu={e => openAddressEditor(e, conv)}
                      title="Drag to move to a different category · Ctrl+click to set the property address"
                      style={{ cursor: 'grab' }}
                    >
                      <span
                        className="buddy-icon"
                        title="Tag this conversation"
                        onClick={e => handleEmojiIconClick(e, conv.id)}
                        style={{ cursor: 'pointer' }}
                      >{conv.emoji || '🏃'}</span>
                      <div className="buddy-info">
                        <div className="buddy-name">{conv.name || conv.phone}</div>
                        <ConvPreview conv={conv} fallback={conv.brokerage || '...'} />
                      </div>
                      <div className="buddy-meta">
                        <span className="buddy-time">{timeAgo(conv.last_message_at)}</span>
                        {conv.unread_count > 0 && (
                          <span className="buddy-unread">{conv.unread_count}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
            </div>
          </div>
        }
        right={
          selected ? (
            <ChatWindow
              key={selected.id}
              conversation={selected}
              onCategoryChange={handleCategoryChange}
              onMessageSent={refreshPreservingOrder}
              onArchive={handleArchive}
              draft={draftsRef.current[selected.id] || ''}
              onDraftChange={(text) => {
                if (text) draftsRef.current[selected.id] = text;
                else delete draftsRef.current[selected.id];
                try { localStorage.setItem('agentcrm_drafts', JSON.stringify(draftsRef.current)); } catch {}
              }}
            />
          ) : (
            <div className="chat-empty" style={{ flex: 1 }}>
              <div className="chat-empty-icon">💬</div>
              <div className="chat-empty-text">Select a conversation</div>
              <div style={{ fontSize: 11, color: 'var(--win-dark)', marginTop: 4, fontFamily: 'var(--font-ui)' }}>
                Drag contacts between groups · Click ▼ to collapse · N/W/C to hide New/Warm/Cold<br />
                Ctrl+click a thread to type in a property address
              </div>
              <button
                className="btn btn-primary"
                style={{ marginTop: 16 }}
                onClick={() => setShowNewConv(true)}
              >
                + New Conversation
              </button>
            </div>
          )
        }
      />

      {showNewConv && (
        <NewConversationModal
          onClose={() => setShowNewConv(false)}
          onCreated={async (conv) => {
            setShowNewConv(false);
            await loadConversations();
            setSelected(conv);
          }}
        />
      )}

      {addressEdit && (
        <AddressModal
          conv={conversations.find(c => c.id === addressEdit.id) || addressEdit}
          onClose={() => setAddressEdit(null)}
          onSave={(address) => saveAddress(addressEdit.id, address)}
        />
      )}

      {emojiPicker && (
        <EmojiPicker
          x={emojiPicker.x}
          y={emojiPicker.y}
          onSelect={handleEmojiSelect}
          onClose={() => setEmojiPicker(null)}
        />
      )}
    </>
  );
}
