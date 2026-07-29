import React from 'react';

const NAV_ITEMS = [
  { id: 'leads',         icon: '📋', label: 'Lead Lists'    },
  { id: 'campaigns',     icon: '📡', label: 'Campaigns'     },
  { id: 'conversations', icon: '💬', label: 'Conversations' },
  { id: 'submit-lead',   icon: '📬', label: 'Submit a Lead' },
  { id: 'notes',         icon: '📝', label: 'Notes'         },
  { id: 'ai',            icon: '🤖', label: 'AI'            },
  { id: 'settings',      icon: '⚙️', label: 'Settings'      },
];

export default function Sidebar({ activeTab, onTabChange, unreadCount, twilioStatus }) {
  return (
    <div className="sidebar">
      {/* AIM-style blue banner */}
      <div className="sidebar-banner">
        <div className="sidebar-banner-icon">🏃</div>
        <div className="sidebar-banner-text">
          <div className="sidebar-banner-title">AgentCRM</div>
          <div className="sidebar-banner-sub">Real Estate Outreach</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section-header">▼ Navigation</div>
        {NAV_ITEMS.map(item => (
          <div
            key={item.id}
            className={`nav-item${activeTab === item.id ? ' active' : ''}`}
            onClick={() => onTabChange(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            <span>{item.label}</span>
            {item.id === 'conversations' && unreadCount > 0 && (
              <span className="nav-badge">{unreadCount}</span>
            )}
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <span className={`status-dot ${twilioStatus === 'online' ? 'online' : 'offline'}`} />
        <span>{twilioStatus === 'online' ? 'Twilio: Online' : 'Twilio: Offline'}</span>
      </div>
    </div>
  );
}
