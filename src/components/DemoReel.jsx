import React, { useState, useEffect, useRef, useCallback } from 'react';
import { play } from '../sounds.js';

// ─────────────────────────────────────────────────────────────────────────────
// DEMO REEL — a scripted, renderer-only "highlight reel" of the AI working the
// Conversations tab: inbox filling up + getting sorted on the left, the live
// conversation + sandbox-style under-the-hood decisions on the right.
//
// 100% theater: ZERO window.api calls, no DB, no Twilio. Escalates from
// rapid-fire cold sorting → objection/gate handling → timed follow-ups →
// a full 10-message chase that ends HOT and auto-submitted. ~70 seconds.
// ─────────────────────────────────────────────────────────────────────────────

const CAT = {
  new:  { label: 'New',  icon: '🔵', color: '#000080' },
  hot:  { label: 'Hot',  icon: '🔥', color: '#cc0000' },
  warm: { label: 'Warm', icon: '🌤️', color: '#996600' },
  cold: { label: 'Cold', icon: '🧊', color: '#555555' },
};
const GROUP_ORDER = ['new', 'hot', 'warm', 'cold'];

// Sandbox-style decision chips rendered inside the chat as system lines.
const SYS_CHIP = {
  cold: { label: 'COLD',      bg: '#333333', border: '#555555' },
  warm: { label: 'WARM',      bg: '#664400', border: '#996600' },
  hot:  { label: 'HOT LEAD',  bg: '#660000', border: '#990000' },
  fu:   { label: 'FOLLOW-UP', bg: '#333355', border: '#555588' },
};

// Script: flat list of steps. conv = conversation id.
// types: arrive (row appears + first inbound + becomes active), agent (inbound),
// ai (typing → outbound), sys (under-the-hood decision line, optional cat move),
// pause.
const CONVS = {
  derek:  { name: 'Derek Price',    brokerage: 'Realty ONE Group',   location: 'Largo, FL' },
  linda:  { name: 'Linda Sosa',     brokerage: 'EXIT Elite Realty',  location: 'Ruskin, FL' },
  tom:    { name: 'Tom Barrett',    brokerage: 'Charles Rutenberg',  location: 'Palm Harbor, FL' },
  gary:   { name: 'Gary Mills',     brokerage: 'Future Home Realty', location: 'Seminole, FL' },
  alicia: { name: 'Alicia Reyes',   brokerage: 'Compass',            location: 'Tampa, FL' },
  james:  { name: 'James Kohl',     brokerage: 'Smith & Associates', location: 'St. Petersburg, FL' },
  nadia:  { name: 'Nadia Farouk',   brokerage: 'Keller Williams',    location: 'Wesley Chapel, FL' },
  bill:   { name: 'Bill Hartman',   brokerage: 'RE/MAX Action First', location: 'Dunedin, FL' },
  marcus: { name: 'Marcus Delgado', brokerage: 'Century 21 Coastal', location: 'St. Petersburg, FL' },
};

const SCRIPT = [
  // ── PHASE A: the sort — quick nos flying in and getting filed ──
  { wait: 400,  type: 'arrive', conv: 'derek', text: 'No' },
  { wait: 900,  type: 'sys',    conv: 'derek', chip: 'cold', text: 'refusal → marked COLD · no reply sent', cat: 'cold' },
  { wait: 1300, type: 'arrive', conv: 'linda', text: 'Not at this time, sorry' },
  { wait: 900,  type: 'sys',    conv: 'linda', chip: 'cold', text: 'soft no → marked COLD · no reply sent', cat: 'cold' },
  { wait: 1300, type: 'arrive', conv: 'tom',  text: 'STOP' },
  { wait: 900,  type: 'sys',    conv: 'tom',  chip: 'cold', text: 'opt-out → number blacklisted, will never be texted again', cat: 'cold' },
  { wait: 1300, type: 'arrive', conv: 'gary', text: 'I think you got the wrong number man' },
  { wait: 900,  type: 'sys',    conv: 'gary', chip: 'cold', text: 'wrong number → marked COLD · no reply sent', cat: 'cold' },

  // ── PHASE B: engagement — questions answered, time-wasters filtered ──
  { wait: 1400, type: 'arrive', conv: 'alicia', text: 'What exactly are you looking for?' },
  { wait: 600,  type: 'ai',     conv: 'alicia', text: "I'm looking for an off-market flip to buy with cash, up to $2M. Outdated, original condition, or needs work preferred. Any level of rehab, anywhere in the state, though I generally avoid rural areas." },
  { wait: 500,  type: 'sys',    conv: 'alicia', chip: 'fu', text: 'criteria question → buy box sent · engaged, no property yet — nothing scheduled', cat: 'cold' },

  { wait: 1400, type: 'arrive', conv: 'james', text: "Happy to help! Let's set up a coffee meeting at my office this week to strategize your search" },
  { wait: 900,  type: 'sys',    conv: 'james', chip: 'cold', text: "consultation pitch, no property → marked COLD · we don't do meetings, no reply", cat: 'cold' },

  { wait: 1400, type: 'arrive', conv: 'nadia', text: 'Are you even legit? I need proof of funds before I send anything' },
  { wait: 600,  type: 'ai',     conv: 'nadia', text: 'We attach our POF to our offer. Do you have something I can look at right now?' },
  { wait: 500,  type: 'sys',    conv: 'nadia', chip: 'fu', text: 'POF gate deflected → pivoted straight back to the property', cat: 'cold' },

  // ── PHASE C: timing intelligence ──
  { wait: 1400, type: 'arrive', conv: 'bill', text: "Nothing right now, but I've got a listing coming in February" },
  { wait: 600,  type: 'ai',     conv: 'bill', text: 'Sounds good, keep me posted! Any idea on the timing?' },
  { wait: 1200, type: 'agent',  conv: 'bill', text: 'Probably Feb 17th when the paperwork is signed' },
  { wait: 800,  type: 'sys',    conv: 'bill', chip: 'warm', text: '⏰ they said Feb 17 → follow-up auto-scheduled for Feb 17, 9:00 AM — 7 months out, never forgotten', cat: 'warm' },

  // ── PHASE D: the chase — full conversation, cold open to HOT ──
  { wait: 1500, type: 'arrive', conv: 'marcus', text: "Who is this? How'd you get my number" },
  { wait: 550,  type: 'ai',     conv: 'marcus', text: 'I found your info googling agents in the area. Do you have anything off-market I can take a look at?' },
  { wait: 1100, type: 'agent',  conv: 'marcus', text: 'Depends. Are you an actual buyer or one of those wholesalers blasting every agent in the county' },
  { wait: 550,  type: 'ai',     conv: 'marcus', text: 'We fix and flip and wholesale. Cash, quick close.' },
  { wait: 1100, type: 'agent',  conv: 'marcus', text: "Ok. What's your buy box" },
  { wait: 550,  type: 'ai',     conv: 'marcus', text: 'Off-market flips, cash, up to $2M. Outdated or needs work preferred, any level of rehab.' },
  { wait: 1300, type: 'agent',  conv: 'marcus', text: "Actually... I might have something. Tired landlord, 3/1 block home, tenants just left. He hasn't listed it" },
  { wait: 550,  type: 'ai',     conv: 'marcus', text: "Awesome, can you send the address and asking price? I'll take a look right away." },
  { wait: 400,  type: 'sys',    conv: 'marcus', chip: 'warm', text: 'property signal detected → marked WARM · chasing address + price', cat: 'warm' },
  { wait: 1300, type: 'agent',  conv: 'marcus', text: '4520 Baywood Dr. He owes 180 on it and wants 15k to walk away' },
  { wait: 550,  type: 'ai',     conv: 'marcus', text: 'So around $195k all-in to get it done? Just confirming the math.' },
  { wait: 1200, type: 'agent',  conv: 'marcus', text: 'Yeah that would do it' },
  { wait: 700,  type: 'sys',    conv: 'marcus', chip: 'hot', text: '🔥 no asking price was ever stated — AI derived $195k from payoff + walkaway → HOT · lead auto-submitted to your phone', cat: 'hot', sound: 'filedone' },
  { wait: 1400, type: 'agent',  conv: 'marcus', text: 'Want pics? I can swing by tomorrow' },
  { wait: 550,  type: 'ai',     conv: 'marcus', text: 'Yes please, send them over!' },
  { wait: 500,  type: 'sys',    conv: 'marcus', chip: 'hot', text: 'photos incoming → will attach to the submitted lead automatically' },
  { wait: 2200 },
];

const nowTime = () =>
  new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

export default function DemoReel({ onClose }) {
  // rows: { id, cat, preview, unread }  msgs: { [id]: [{kind:'in'|'out'|'sys',...}] }
  const [rows, setRows] = useState([]);
  const [msgs, setMsgs] = useState({});
  const [activeId, setActiveId] = useState(null);
  const [typing, setTyping] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [phase, setPhase] = useState('idle'); // idle | countdown | playing | done
  const runIdRef = useRef(0);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [msgs, typing, activeId]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => () => { runIdRef.current++; }, []);

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const pushMsg = (conv, m) =>
    setMsgs(prev => ({ ...prev, [conv]: [...(prev[conv] || []), { ...m, time: nowTime() }] }));

  const run = useCallback(async () => {
    const myRun = ++runIdRef.current;
    const alive = () => runIdRef.current === myRun;

    setRows([]); setMsgs({}); setActiveId(null); setTyping(false);
    setPhase('countdown');
    for (const n of [3, 2, 1]) {
      if (!alive()) return;
      setCountdown(n);
      await sleep(850);
    }
    setCountdown(null);
    if (!alive()) return;
    setPhase('playing');

    for (const step of SCRIPT) {
      await sleep(step.wait);
      if (!alive()) return;
      if (!step.type) continue;

      if (step.type === 'arrive') {
        play('buddyin');
        setRows(r => [...r, { id: step.conv, cat: 'new', preview: step.text, unread: 1 }]);
        pushMsg(step.conv, { kind: 'in', text: step.text });
        setActiveId(step.conv);
        // opening clears unread a beat later
        setTimeout(() => alive() && setRows(r => r.map(x => x.id === step.conv ? { ...x, unread: 0 } : x)), 450);
      } else if (step.type === 'agent') {
        play('imrcv');
        pushMsg(step.conv, { kind: 'in', text: step.text });
        setRows(r => r.map(x => x.id === step.conv ? { ...x, preview: step.text } : x));
      } else if (step.type === 'ai') {
        setTyping(true);
        await sleep(400);
        if (!alive()) return;
        setTyping(false);
        play('imsend');
        pushMsg(step.conv, { kind: 'out', text: step.text });
        setRows(r => r.map(x => x.id === step.conv ? { ...x, preview: step.text } : x));
      } else if (step.type === 'sys') {
        if (step.sound) play(step.sound);
        pushMsg(step.conv, { kind: 'sys', chip: step.chip, text: step.text });
        if (step.cat) setRows(r => r.map(x => x.id === step.conv ? { ...x, cat: step.cat } : x));
      }
    }
    if (!alive()) return;
    setPhase('done');
  }, []);

  const activeConv = activeId ? CONVS[activeId] : null;
  const activeRow = rows.find(r => r.id === activeId);
  const activeMsgs = (activeId && msgs[activeId]) || [];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 5000,
      background: '#3a6ea5',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <button
        onClick={onClose}
        title="Close (Esc)"
        style={{
          position: 'absolute', top: 8, right: 10, zIndex: 5002,
          background: 'rgba(0,0,0,0.25)', color: '#fff', border: 'none',
          fontSize: 12, cursor: 'pointer', padding: '2px 8px',
          fontFamily: '"Tahoma","Arial",sans-serif',
        }}
      >✕ close</button>

      {/* App-window frame at real proportions */}
      <div style={{
        width: 1040, height: '82%', maxHeight: 660, position: 'relative',
        display: 'flex', flexDirection: 'column',
        background: 'var(--win-gray, #c0c0c0)',
        border: '2px solid', borderColor: '#ffffff #808080 #808080 #ffffff',
        boxShadow: '6px 6px 0 rgba(0,0,0,0.4)',
      }}>
        {/* Slim AIM title bar */}
        <div className="title-bar" style={{ flexShrink: 0 }}>
          <span className="title-bar-icon">🏃</span>
          <span className="title-bar-logo">AgentCRM</span>
          <span className="title-bar-tagline">— Conversations</span>
        </div>

        <div className="conversations-layout" style={{ flex: 1, minHeight: 0 }}>
          {/* Buddy list — fills and sorts itself as the AI works. The real app sizes
              this via ResizableSplit; here a fixed 260px wrapper stands in for it
              (the raw .buddy-list class is width:100% and would swallow the frame). */}
          <div style={{ width: 260, flexShrink: 0, height: '100%' }}>
          <div className="buddy-list">
            <div className="buddy-list-header" style={{ padding: '4px 6px', fontSize: 11, fontWeight: 'bold' }}>
              💬 Inbox
            </div>
            {GROUP_ORDER.map(g => {
              const convs = rows.filter(r => r.cat === g);
              if (!convs.length) return null;
              return (
                <div key={g}>
                  <div className="buddy-group-header">
                    <span style={{ fontSize: 9, color: CAT[g].color }}>▼</span>
                    <span style={{ color: CAT[g].color }}>{CAT[g].icon} {CAT[g].label}</span>
                    <span className="buddy-group-count">({convs.length})</span>
                  </div>
                  {convs.map(r => (
                    <div key={r.id} className={`buddy-item${r.id === activeId ? ' active' : ''}`}>
                      <span className="buddy-icon">🏃</span>
                      <div className="buddy-info">
                        <div className="buddy-name">{CONVS[r.id].name}</div>
                        <div className="buddy-preview">{r.preview}</div>
                      </div>
                      <div className="buddy-meta">
                        <span className="buddy-time">now</span>
                        {r.unread > 0 && <span className="buddy-unread">{r.unread}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          </div>

          {/* Chat window — real component classes, real proportions */}
          <div className="chat-window" style={{ position: 'relative' }}>
            <div className="chat-header">
              <span className="chat-header-icon">💬</span>
              <span className="chat-header-title">
                {activeConv ? `${activeConv.name} – Instant Message` : 'AgentCRM'}
              </span>
              <div className="chat-header-controls">
                {activeRow && (
                  <select className="category-select" value={activeRow.cat} readOnly disabled style={{ opacity: 1 }}>
                    <option value={activeRow.cat}>{CAT[activeRow.cat].icon} {CAT[activeRow.cat].label}</option>
                  </select>
                )}
              </div>
            </div>
            <div className="chat-sub-header">
              <span>{activeConv ? `${activeConv.brokerage} · ${activeConv.location}` : ''}</span>
              <span style={{ color: '#808080' }}>Agent's Warning Level: 0%</span>
            </div>

            <div className="messages-list">
              {activeMsgs.map((m, i) => m.kind === 'sys' ? (
                <div key={i} style={{ margin: '5px 0 6px', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                  {m.chip && (
                    <span style={{
                      flexShrink: 0, marginTop: 1,
                      background: SYS_CHIP[m.chip].bg, border: `1px solid ${SYS_CHIP[m.chip].border}`,
                      color: '#fff', fontFamily: 'var(--font-mono, monospace)', fontSize: 9,
                      fontWeight: 'bold', padding: '1px 5px', letterSpacing: '0.05em',
                    }}>{SYS_CHIP[m.chip].label}</span>
                  )}
                  <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, color: '#444', lineHeight: 1.5 }}>
                    🤖 {m.text}
                  </span>
                </div>
              ) : (
                <div key={i} className="chat-msg">
                  <span className={`chat-msg-sender ${m.kind === 'out' ? 'me' : 'them'}`}>
                    {m.kind === 'out' ? 'You' : (activeConv ? activeConv.name.split(' ')[0] : 'Agent')}:
                  </span>{' '}
                  <span className="chat-msg-body">{m.text}</span>
                  <span className="chat-msg-time">({m.time})</span>
                </div>
              ))}
              {typing && (
                <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: '#808080', fontStyle: 'italic', marginTop: 2 }}>
                  ⚡ AgentCRM AI is replying…
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <div className="chat-input-area" style={{ flexShrink: 0 }}>
              <textarea className="message-input" placeholder="AgentCRM AI is working this inbox…" value="" readOnly style={{ height: 34 }} />
            </div>

            {/* Idle / countdown / end overlays */}
            {phase !== 'playing' && (
              <div style={{
                position: 'absolute', inset: 0, zIndex: 20,
                background: 'rgba(0,0,32,0.72)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12,
              }}>
                {phase === 'countdown' ? (
                  <div style={{ fontSize: 84, fontWeight: 'bold', color: '#fff', fontFamily: '"Tahoma","Arial",sans-serif', textShadow: '4px 4px 0 #000' }}>
                    {countdown}
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 36 }}>🏃</div>
                    <div style={{ color: '#fff', fontFamily: '"Tahoma","Arial",sans-serif', fontSize: 19, fontWeight: 'bold', textShadow: '2px 2px 0 #000' }}>
                      {phase === 'done' ? 'AgentCRM AI' : 'AI Demo Reel'}
                    </div>
                    <div style={{ color: '#aaccff', fontFamily: '"Tahoma","Arial",sans-serif', fontSize: 12, textAlign: 'center', lineHeight: 1.7, maxWidth: 380 }}>
                      {phase === 'done'
                        ? 'Sorts every reply · answers in seconds · schedules months out · never drops a lead'
                        : 'Real agent replies, the whole inbox handled live.\nStart your screen recording, then press Play — 3-2-1 countdown included.'}
                    </div>
                    <button
                      onClick={run}
                      style={{
                        marginTop: 6, padding: '10px 34px', cursor: 'pointer',
                        background: '#c0c0c0', border: '2px solid',
                        borderColor: '#ffffff #808080 #808080 #ffffff',
                        fontFamily: '"Tahoma","Arial",sans-serif', fontSize: 14, fontWeight: 'bold',
                      }}
                    >
                      {phase === 'done' ? '↻ Replay' : '▶ Play'}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
