import React, { useState, useEffect, useCallback } from 'react';
import ImportModal from './ImportModal.jsx';
import ConfirmModal from './ConfirmModal.jsx';
import ResizableSplit from './ResizableSplit.jsx';

const STATUS_BADGE = {
  new:       { cls: 'badge-new',       label: 'NEW'       },
  blasted:   { cls: 'badge-blasted',   label: 'BLASTED'   },
  responded: { cls: 'badge-responded', label: 'RESPONDED' },
  excluded:  { cls: 'badge-excluded',  label: 'EXCLUDED'  },
};

export default function LeadsTab() {
  const [lists, setLists] = useState([]);
  const [selectedList, setSelectedList] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [search, setSearch] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmReset, setConfirmReset] = useState(null);

  const loadLists = useCallback(async () => {
    try {
      const data = await window.api.getLeadLists();
      setLists(data);
      if (data.length > 0 && !selectedList) setSelectedList(data[0]);
    } catch (e) { console.error(e); }
  }, [selectedList]);

  const loadContacts = useCallback(async (listId) => {
    setLoading(true);
    try {
      const data = await window.api.getContacts(listId);
      setContacts(data);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadLists(); }, []);

  useEffect(() => {
    if (selectedList) loadContacts(selectedList.id);
    else setContacts([]);
  }, [selectedList]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      const tag = document.activeElement?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return;
      if (confirmDelete || confirmReset) return;
      e.preventDefault();
      if (!lists.length) return;
      const idx = lists.findIndex(l => l.id === selectedList?.id);
      const next = e.key === 'ArrowDown'
        ? lists[idx < lists.length - 1 ? idx + 1 : 0]
        : lists[idx > 0 ? idx - 1 : lists.length - 1];
      setSelectedList(next);
      requestAnimationFrame(() => document.querySelector('.list-item.active')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedList, lists, confirmDelete, confirmReset]);

  const handleDeleteList = async () => {
    const list = confirmDelete;
    setConfirmDelete(null);
    await window.api.deleteLeadList(list.id);
    if (selectedList?.id === list.id) setSelectedList(null);
    loadLists();
  };

  const handleResetList = async () => {
    const list = confirmReset;
    setConfirmReset(null);
    await window.api.resetLeadList(list.id);
    loadContacts(list.id);
  };

  const handleImportDone = async (listId) => {
    setShowImport(false);
    await loadLists();
    const updated = await window.api.getLeadLists();
    const newList = updated.find(l => l.id === listId);
    if (newList) setSelectedList(newList);
  };

  const filtered = contacts.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (c.name || '').toLowerCase().includes(q) ||
      (c.brokerage || '').toLowerCase().includes(q) ||
      (c.city || '').toLowerCase().includes(q) ||
      (c.phone || '').includes(q)
    );
  });

  return (
    <>
      <div className="tab-header">
        <div className="tab-title">LEAD LISTS</div>
        <div className="tab-toolbar">
          <button className="btn btn-primary" onClick={() => setShowImport(true)}>
            + Import CSV
          </button>
          {selectedList && (
            <>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setConfirmReset(selectedList)}
                style={{ marginLeft: 'auto', color: '#884400' }}
                title="Reset all blasted contacts in this list back to New so they can be blasted again"
              >
                ↺ Reset List
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setConfirmDelete(selectedList)}
                style={{ color: '#880000' }}
              >
                🗑 Delete List
              </button>
            </>
          )}
        </div>
      </div>

      <ResizableSplit
        defaultLeftWidth={200}
        minLeft={130}
        minRight={220}
        storageKey="leads"
        left={
          <div className="lists-sidebar">
            <div className="lists-sidebar-header">
              <span className="lists-sidebar-title">LISTS ({lists.length})</span>
            </div>
            <div className="lists-list">
              {lists.length === 0 ? (
                <div style={{ padding: '20px 14px', color: 'var(--text2)', fontSize: 11, fontFamily: 'var(--font-mono)', textAlign: 'center' }}>
                  No lists yet.<br />Import a CSV to start.
                </div>
              ) : lists.map(list => (
                <div
                  key={list.id}
                  className={`list-item${selectedList?.id === list.id ? ' active' : ''}`}
                  onClick={() => setSelectedList(list)}
                >
                  <div className="list-item-name">{list.name}</div>
                  <div className="list-item-meta">
                    {list.contact_count} agents · {new Date(list.created_at).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        }
        right={
          <div className="contacts-panel">
            {selectedList ? (
              <>
                <div className="contacts-toolbar">
                  <input
                    className="search-input"
                    placeholder="Search by name, brokerage, city..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                  <span className="contacts-count">
                    {filtered.length}/{contacts.length} contacts
                  </span>
                </div>
                <div className="data-table-wrapper">
                  {loading ? (
                    <div className="empty-state">
                      <div className="empty-label">Loading...</div>
                    </div>
                  ) : filtered.length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-label">No contacts found</div>
                    </div>
                  ) : (
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Brokerage</th>
                          <th>Location</th>
                          <th>Phone</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map(c => {
                          const badge = STATUS_BADGE[c.status] || STATUS_BADGE.new;
                          return (
                            <tr key={c.id}>
                              <td style={{ fontWeight: 600 }}>{c.name || '—'}</td>
                              <td className="muted">{c.brokerage || '—'}</td>
                              <td className="muted">{[c.city, c.state].filter(Boolean).join(', ') || '—'}</td>
                              <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{c.phone || '—'}</td>
                              <td>
                                <span className={`badge ${badge.cls}`}>{badge.label}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            ) : (
              <div className="empty-state" style={{ flex: 1 }}>
                <div className="empty-icon">📋</div>
                <div className="empty-label">Select a Lead List</div>
                <div className="empty-sub">Import a CSV file to create your first list of agents</div>
                <button className="btn btn-primary mt-16" onClick={() => setShowImport(true)}>
                  + Import CSV
                </button>
              </div>
            )}
          </div>
        }
      />

      {showImport && (
        <ImportModal onClose={() => setShowImport(false)} onDone={handleImportDone} />
      )}

      {confirmReset && (
        <ConfirmModal
          title="Reset Lead List"
          icon="↺"
          message={<>Reset all blasted contacts in <strong>"{confirmReset.name}"</strong> back to New?</>}
          detail="This lets you blast this list again. Opted-out numbers are never included. Use this if a previous campaign failed and delivered nothing."
          confirmLabel="Reset List"
          onConfirm={handleResetList}
          onCancel={() => setConfirmReset(null)}
        />
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete Lead List"
          icon="🗑️"
          message={<>Are you sure you want to delete <strong>"{confirmDelete.name}"</strong>?</>}
          detail={`This will permanently remove all ${confirmDelete.contact_count} contacts in this list. This cannot be undone.`}
          confirmLabel="Delete"
          dangerous
          onConfirm={handleDeleteList}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </>
  );
}
