import React, { useState, useEffect, useRef } from 'react';
import ResizableSplit from './ResizableSplit.jsx';

export default function NotesTab() {
  const [notes, setNotes] = useState([]);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [copied, setCopied] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [sortMode, setSortMode] = useState('copies'); // 'manual' | 'copies'
  const [dragOverId, setDragOverId] = useState(null);
  const bodyRef = useRef(null);
  const dragNoteId = useRef(null);

  const load = async () => {
    const data = await window.api.getNotes();
    setNotes(data);
    if (data.length > 0 && !selected) setSelected(data[0]);
  };

  useEffect(() => { load(); }, []);

  const displayNotes = sortMode === 'copies'
    ? [...notes].sort((a, b) => (b.copy_count || 0) - (a.copy_count || 0))
    : notes;

  const handleSelect = (note) => {
    if (editing) return;
    setSelected(note);
    setCopied(false);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      const tag = document.activeElement?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return;
      if (editing || showNew) return;
      e.preventDefault();
      if (!displayNotes.length) return;
      const idx = displayNotes.findIndex(n => n.id === selected?.id);
      const next = e.key === 'ArrowDown'
        ? displayNotes[idx < displayNotes.length - 1 ? idx + 1 : 0]
        : displayNotes[idx > 0 ? idx - 1 : displayNotes.length - 1];
      handleSelect(next);
      requestAnimationFrame(() => document.querySelector('.campaign-item.active')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, displayNotes, editing, showNew]);

  const handleCopy = async () => {
    if (!selected) return;
    navigator.clipboard.writeText(selected.body).then(async () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      const newCount = await window.api.incrementNoteCopy(selected.id);
      setNotes(prev => prev.map(n => n.id === selected.id ? { ...n, copy_count: newCount } : n));
      setSelected(prev => ({ ...prev, copy_count: newCount }));
    });
  };

  // ── Drag to reorder (manual mode only) ──────────────────────────────────────

  const onDragStart = (e, id) => {
    dragNoteId.current = id;
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (e, id) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverId(id);
  };

  const onDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setDragOverId(null);
  };

  const onDrop = async (e, targetId) => {
    e.preventDefault();
    setDragOverId(null);
    const fromId = dragNoteId.current;
    if (!fromId || fromId === targetId) return;
    const reordered = [...notes];
    const fromIdx = reordered.findIndex(n => n.id === fromId);
    const toIdx   = reordered.findIndex(n => n.id === targetId);
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    setNotes(reordered);
    dragNoteId.current = null;
    await window.api.reorderNotes(reordered.map(n => n.id));
  };

  const onDragEnd = () => { dragNoteId.current = null; setDragOverId(null); };

  // ── CRUD ─────────────────────────────────────────────────────────────────────

  const startEdit = () => {
    setEditTitle(selected.title);
    setEditBody(selected.body);
    setEditing(true);
    setTimeout(() => bodyRef.current?.focus(), 50);
  };

  const startNew = () => {
    setShowNew(true);
    setEditTitle('');
    setEditBody('');
    setEditing(false);
    setTimeout(() => bodyRef.current?.focus(), 50);
  };

  const handleSaveNew = async () => {
    if (!editTitle.trim() && !editBody.trim()) { setShowNew(false); return; }
    const title = editTitle.trim() || 'Untitled';
    const note = await window.api.createNote({ title, body: editBody });
    setShowNew(false);
    const updated = await window.api.getNotes();
    setNotes(updated);
    setSelected(note);
  };

  const handleSaveEdit = async () => {
    if (!editTitle.trim() && !editBody.trim()) return;
    const title = editTitle.trim() || 'Untitled';
    const note = await window.api.updateNote({ id: selected.id, title, body: editBody });
    setEditing(false);
    const updated = await window.api.getNotes();
    setNotes(updated);
    setSelected(note);
  };

  const handleDelete = async () => {
    if (!selected) return;
    if (!confirm(`Delete "${selected.title}"?`)) return;
    await window.api.deleteNote(selected.id);
    const updated = await window.api.getNotes();
    setNotes(updated);
    setSelected(updated[0] || null);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { setEditing(false); setShowNew(false); }
  };

  return (
    <>
      <div className="tab-header">
        <div className="tab-title">NOTES</div>
        <div className="tab-toolbar">
          <button className="btn btn-primary" onClick={startNew}>+ New Note</button>
          {selected && !editing && !showNew && (
            <>
              <button className="btn btn-ghost" onClick={startEdit}>✏ Edit</button>
              <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto', color: '#880000' }} onClick={handleDelete}>🗑 Delete</button>
            </>
          )}
        </div>
      </div>

      <ResizableSplit
        defaultLeftWidth={220}
        minLeft={140}
        minRight={220}
        storageKey="notes"
        left={<div className="campaigns-list-panel">
          <div className="lists-sidebar-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
            <span>Saved Notes ({notes.length})</span>
            <div style={{ display: 'flex', gap: 2 }}>
              <button
                onClick={() => setSortMode('copies')}
                title="Sort by most copied"
                style={{
                  fontSize: 9, padding: '1px 5px', cursor: 'pointer', border: '1px solid',
                  fontFamily: 'var(--font-ui)',
                  background: sortMode === 'copies' ? 'var(--title-b)' : 'var(--win-gray)',
                  color:      sortMode === 'copies' ? '#fff'           : 'var(--win-dark)',
                  borderTopColor:    sortMode === 'copies' ? 'var(--border-hi)' : 'var(--border-hi)',
                  borderLeftColor:   sortMode === 'copies' ? 'var(--border-hi)' : 'var(--border-hi)',
                  borderRightColor:  sortMode === 'copies' ? 'var(--border-sh)' : 'var(--border-sh)',
                  borderBottomColor: sortMode === 'copies' ? 'var(--border-sh)' : 'var(--border-sh)',
                }}
              >Most Used</button>
              <button
                onClick={() => setSortMode('manual')}
                title="Drag to reorder manually"
                style={{
                  fontSize: 9, padding: '1px 5px', cursor: 'pointer', border: '1px solid',
                  fontFamily: 'var(--font-ui)',
                  background: sortMode === 'manual' ? 'var(--title-b)' : 'var(--win-gray)',
                  color:      sortMode === 'manual' ? '#fff'          : 'var(--win-dark)',
                  borderTopColor:    sortMode === 'manual' ? 'var(--border-hi)' : 'var(--border-hi)',
                  borderLeftColor:   sortMode === 'manual' ? 'var(--border-hi)' : 'var(--border-hi)',
                  borderRightColor:  sortMode === 'manual' ? 'var(--border-sh)' : 'var(--border-sh)',
                  borderBottomColor: sortMode === 'manual' ? 'var(--border-sh)' : 'var(--border-sh)',
                }}
              >Manual</button>
            </div>
          </div>
          <div className="campaigns-list">
            {notes.length === 0 ? (
              <div style={{ padding: '16px 8px', color: 'var(--win-dark)', fontSize: 11, textAlign: 'center' }}>
                No notes yet.<br />Click + New Note to start.
              </div>
            ) : displayNotes.map(n => (
              <div
                key={n.id}
                className={`campaign-item${selected?.id === n.id ? ' active' : ''}`}
                onClick={() => handleSelect(n)}
                draggable={sortMode === 'manual'}
                onDragStart={sortMode === 'manual' ? (e) => onDragStart(e, n.id) : undefined}
                onDragOver={sortMode === 'manual' ? (e) => onDragOver(e, n.id) : undefined}
                onDragLeave={sortMode === 'manual' ? onDragLeave : undefined}
                onDrop={sortMode === 'manual' ? (e) => onDrop(e, n.id) : undefined}
                onDragEnd={sortMode === 'manual' ? onDragEnd : undefined}
                style={{
                  cursor: sortMode === 'manual' ? 'grab' : 'pointer',
                  outline: dragOverId === n.id ? '2px dashed #0066cc' : undefined,
                  background: dragOverId === n.id ? 'rgba(0,80,180,0.07)' : undefined,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                  <div className="campaign-item-name" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {sortMode === 'manual' && <span style={{ opacity: 0.35, marginRight: 4, fontSize: 9 }}>⠿</span>}
                    {n.title}
                  </div>
                  {n.copy_count > 0 && (
                    <span style={{ fontSize: 9, color: 'var(--win-dark)', fontFamily: 'var(--font-mono)', flexShrink: 0, opacity: 0.7 }}>
                      📋{n.copy_count}
                    </span>
                  )}
                </div>
                <div className="campaign-item-meta" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {n.body.slice(0, 60)}{n.body.length > 60 ? '…' : ''}
                </div>
              </div>
            ))}
          </div>
        </div>}
        right={<div className="campaign-detail" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

          {/* New note form */}
          {showNew && (
            <>
              <div className="form-group">
                <label className="form-label">Title</label>
                <input
                  className="form-input"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g. Price Rebuttal"
                  style={{ maxWidth: 320 }}
                  autoFocus
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Body</label>
                <textarea
                  ref={bodyRef}
                  className="form-textarea"
                  value={editBody}
                  onChange={e => setEditBody(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={12}
                  placeholder="Type your rebuttal or script here..."
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-primary" onClick={handleSaveNew}>✓ Save Note</button>
                <button className="btn btn-ghost" onClick={() => setShowNew(false)}>Cancel</button>
              </div>
            </>
          )}

          {/* Edit form */}
          {editing && selected && (
            <>
              <div className="form-group">
                <label className="form-label">Title</label>
                <input
                  className="form-input"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  onKeyDown={handleKeyDown}
                  style={{ maxWidth: 320 }}
                  autoFocus
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Body</label>
                <textarea
                  ref={bodyRef}
                  className="form-textarea"
                  value={editBody}
                  onChange={e => setEditBody(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={12}
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-primary" onClick={handleSaveEdit}>✓ Save Changes</button>
                <button className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
              </div>
            </>
          )}

          {/* Read view */}
          {!editing && !showNew && selected && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontWeight: 'bold', fontSize: 13 }}>
                  {selected.title}
                  {selected.copy_count > 0 && (
                    <span style={{ fontWeight: 'normal', fontSize: 10, color: 'var(--win-dark)', marginLeft: 8, fontFamily: 'var(--font-mono)' }}>
                      copied {selected.copy_count}×
                    </span>
                  )}
                </div>
                <button
                  className="btn btn-primary"
                  onClick={handleCopy}
                  style={{ minWidth: 110, background: copied ? '#006600' : undefined, borderTopColor: copied ? '#009900' : undefined, borderLeftColor: copied ? '#009900' : undefined }}
                >
                  {copied ? '✓ Copied!' : '📋 Copy to Clipboard'}
                </button>
              </div>

              <div style={{
                flex: 1,
                border: '2px solid',
                borderTopColor: 'var(--border-sh)',
                borderLeftColor: 'var(--border-sh)',
                borderRightColor: 'var(--border-hi)',
                borderBottomColor: 'var(--border-hi)',
                background: 'var(--win-white)',
                padding: '12px 14px',
                fontFamily: 'var(--font-chat)',
                fontSize: 14,
                lineHeight: 1.7,
                whiteSpace: 'pre-wrap',
                overflowY: 'auto',
                minHeight: 200,
                userSelect: 'text',
              }}>
                {selected.body || <span style={{ color: 'var(--win-dark)', fontStyle: 'italic' }}>Empty note</span>}
              </div>

              <div style={{ fontSize: 10, color: 'var(--win-dark)', fontFamily: 'var(--font-mono)' }}>
                Click <strong>📋 Copy to Clipboard</strong> then paste directly into any chat.
              </div>
            </>
          )}

          {/* Empty state */}
          {!editing && !showNew && !selected && (
            <div className="empty-state">
              <div className="empty-icon">📝</div>
              <div className="empty-label">No Notes Yet</div>
              <div className="empty-sub">Save rebuttals, scripts, and talking points here for quick copy-paste into chats</div>
              <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={startNew}>+ New Note</button>
            </div>
          )}
        </div>}
      />
    </>
  );
}
