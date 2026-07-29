// End-to-end drip simulation. Runs the REAL sendDueWarmDrips loop extracted verbatim from
// main.js, against a REAL SQLite database, with the clock advanced hour by hour. Twilio is
// stubbed so nothing leaves the machine; everything else is production code.
import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';

const SRC = fs.readFileSync('/Users/seymorecash/agent-crm/main.js', 'utf8');
const grabConst = (n) => {
  const i = SRC.indexOf('const ' + n);
  const arrEnd = SRC.indexOf('\n];', i);
  const objEnd = SRC.indexOf('\n};', i);
  const end = (objEnd !== -1 && (arrEnd === -1 || objEnd < arrEnd)) ? objEnd : arrEnd;
  return SRC.slice(i, end + 3);
};
const grabLine  = (n) => SRC.split('\n').find(l => l.trim().startsWith('const ' + n));
const grabFn = (n) => {
  const i = SRC.indexOf('function ' + n); let d = 0, started = false;
  for (let k = i; k < SRC.length; k++) {
    if (SRC[k] === '{') { d++; started = true; }
    if (SRC[k] === '}') { d--; if (started && d === 0) return SRC.slice(i, k + 1); }
  }
};
const grabAsyncFn = (n) => {
  const i = SRC.indexOf('async function ' + n); let d = 0, started = false;
  for (let k = i; k < SRC.length; k++) {
    if (SRC[k] === '{') { d++; started = true; }
    if (SRC[k] === '}') { d--; if (started && d === 0) return SRC.slice(i, k + 1); }
  }
};

// ── mock clock ────────────────────────────────────────────────────────────────
let NOW = new Date('2026-08-03T09:00:00-04:00').getTime(); // a Monday
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...a) { return a.length ? new RealDate(...a) : new RealDate(NOW); }
  static now() { return NOW; }
};

// ── real schema + real DB functions (SQL copied verbatim from database.js) ────
const sql = new DatabaseSync(':memory:');
sql.exec(`
  CREATE TABLE conversations (id INTEGER PRIMARY KEY, contact_id INTEGER, category TEXT,
    archived INTEGER DEFAULT 0, human_replied INTEGER DEFAULT 0, unread_count INTEGER DEFAULT 0);
  CREATE TABLE contacts (id INTEGER PRIMARY KEY, phone TEXT, name TEXT);
  CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id INTEGER,
    body TEXT, direction TEXT, created_at TEXT);
  CREATE TABLE warm_drip (id INTEGER PRIMARY KEY AUTOINCREMENT, conv_id INTEGER, contact_id INTEGER,
    step INTEGER DEFAULT 1, missing TEXT DEFAULT 'both', send_at INTEGER, sent_at INTEGER,
    status TEXT DEFAULT 'pending', created_at INTEGER, cycle INTEGER DEFAULT 1, variant INTEGER);
  CREATE TABLE audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT, details TEXT, created_at TEXT);
`);
const iso = () => new RealDate(NOW).toISOString().replace('T', ' ').slice(0, 19);
const SENT = [];
const db = {
  getConversationById: (id) => sql.prepare('SELECT * FROM conversations WHERE id=?').get(id),
  getContactById: (id) => sql.prepare('SELECT * FROM contacts WHERE id=?').get(id),
  getDueWarmDrips: () => sql.prepare(`SELECT * FROM warm_drip WHERE status='pending' AND send_at <= ? ORDER BY send_at ASC`).all(Math.floor(NOW / 1000)),
  markWarmDripSent: (id, variant = null) => sql.prepare(`UPDATE warm_drip SET status='sent', sent_at=?, variant=COALESCE(?,variant) WHERE id=?`).run(Math.floor(NOW / 1000), variant, id),
  cancelWarmDrips: (c) => sql.prepare(`UPDATE warm_drip SET status='cancelled' WHERE conv_id=? AND status='pending'`).run(c),
  createWarmDrip: (c, ct, step, missing, sendAt, cycle = 1, variant = null) =>
    sql.prepare(`INSERT INTO warm_drip (conv_id,contact_id,step,missing,send_at,cycle,variant,created_at) VALUES (?,?,?,?,?,?,?,?)`).run(c, ct, step, missing, sendAt, cycle, variant, Math.floor(NOW / 1000)),
  getUsedDripVariants: (c) => sql.prepare(`SELECT variant, MAX(COALESCE(sent_at,0)) AS last_used FROM warm_drip WHERE conv_id=? AND status IN ('sent','archived') AND variant IS NOT NULL GROUP BY variant ORDER BY last_used ASC`).all(c).map(r => r.variant),
  countSentDrips: (c) => sql.prepare(`SELECT COUNT(*) c FROM warm_drip WHERE conv_id=? AND status='sent'`).get(c).c,
  getDripCycle: (c) => sql.prepare(`SELECT MAX(cycle) c FROM warm_drip WHERE conv_id=? AND status!='archived'`).get(c).c || 0,
  getChaseStartedAt: (c) => sql.prepare(`SELECT MIN(created_at) t FROM warm_drip WHERE conv_id=? AND status!='archived'`).get(c).t || null,
  archiveWarmDrips: (c) => sql.prepare(`UPDATE warm_drip SET status='archived' WHERE conv_id=? AND status IN ('sent','pending','cancelled')`).run(c),
  hasRecentOutboundMessage: (c, body, hours = 72) => {
    const since = new RealDate(NOW - hours * 3600000).toISOString().replace('T', ' ').slice(0, 19);
    return !!sql.prepare(`SELECT 1 FROM messages WHERE conversation_id=? AND direction='outbound' AND body=? AND created_at > ? LIMIT 1`).get(c, body, since);
  },
  addMessage: (c, body, dir) => { sql.prepare(`INSERT INTO messages (conversation_id,body,direction,created_at) VALUES (?,?,?,?)`).run(c, body, dir, iso()); if (dir === 'outbound') SENT.push({ t: NOW, conv: c, body }); },
  getRecentMessages: (c, n) => sql.prepare(`SELECT * FROM messages WHERE conversation_id=? ORDER BY id DESC LIMIT ?`).all(c, n).reverse(),
  updateConversationCategory: (c, cat) => sql.prepare('UPDATE conversations SET category=? WHERE id=?').run(cat, c),
  logAudit: (a, d) => sql.prepare('INSERT INTO audit_log (action,details,created_at) VALUES (?,?,?)').run(a, JSON.stringify(d), iso()),
  incrementDailyCount: () => {}, isPhoneStopped: () => false, isPhoneWhitelisted: () => false,
};

// ── stubs for everything outside the drip machinery ──────────────────────────
const twilio = { sendSMS: async () => ({ sid: 'SM' + Math.random().toString(16).slice(2) }), normalizePhone: (p) => p };
const log = () => {};
const aiMarkRead = () => {};
const assertCanSend = () => {};
const sanitizeForGSM7 = (s) => s;
const easternHourNow = () => new RealDate(NOW).getHours();
const withinSendingHours = () => true; // the window is exercised separately by dripSendAt tests
const containsStreetAddress = (b) => /\b\d{2,5}\s+[A-Za-z]+\s+(st|ave|rd|dr|ln|blvd|way|ct)\b/i.test(b || '');
const containsPrice = (b) => /\$\s?\d|(\b\d{2,3}k\b)/i.test(b || '');

// ── REAL code, extracted verbatim ────────────────────────────────────────────
const REAL = [
  grabLine('DRIP_TOTAL_STEPS'), grabLine('DRIP_MAX_CYCLES'), grabLine('DRIP_MAX_TOUCHES'),
  grabLine('DRIP_LONG_HORIZON_H'), grabLine('DRIP_MAX_CHASE_DAYS'),
  grabLine('DRIP_STEP_H'), grabLine('DRIP_BLOCKED_STEP_H'), grabLine('dripStepHours'),
  grabConst('DRIP_MISSING_LABEL'), grabConst('DRIP_MESSAGES'), grabConst('DRIP_PENDING_MESSAGES'), grabConst('DRIP_STATUS_MESSAGES'),
  SRC.split('\n').find(l => l.startsWith('const P2_CHASE_BLOCKED_RE')),
  SRC.split('\n').find(l => l.startsWith('const P2_NOT_BLOCKED_RE')),
  SRC.split('\n').find(l => l.startsWith('const P2_SELLER_MIA_RE')),
  SRC.split('\n').find(l => l.startsWith('const P2_BLOCK_CLEARED_RE')),
  grabFn('chaseAgeDays'), grabFn('chaseIsBlocked'), grabFn('detectChaseBlocked'),
  grabFn('dripVariantOrder'), grabFn('renderDripMessage'), grabFn('dripBodyFor'),
  grabFn('detectMissingHeld'), grabFn('dripSendAt'),
  grabAsyncFn('sendDueWarmDrips'),
].join('\n\n');
const sendDueWarmDrips = new Function('db', 'twilio', 'log', 'aiMarkRead', 'assertCanSend', 'sanitizeForGSM7',
  'easternHourNow', 'withinSendingHours', 'containsStreetAddress', 'containsPrice', 'Date',
  REAL + '\nreturn sendDueWarmDrips;')(db, twilio, log, aiMarkRead, assertCanSend, sanitizeForGSM7,
  easternHourNow, withinSendingHours, containsStreetAddress, containsPrice, globalThis.Date);

const SETTINGS = { aiEnabled: 'true', claudeApiKey: 'x', aiLevel: '3', quietStartHour: '8', quietEndHour: '21' };

// ── scenario driver ──────────────────────────────────────────────────────────
let nextConv = 1;
function seed({ inbound = [], missing = 'both', cycle = 1 }) {
  const id = nextConv++;
  sql.prepare('INSERT INTO contacts (id,phone,name) VALUES (?,?,?)').run(id, '+1555000' + String(id).padStart(4, '0'), 'Kelly Froehlich');
  sql.prepare('INSERT INTO conversations (id,contact_id,category) VALUES (?,?,?)').run(id, id, 'warm');
  for (const b of inbound) db.addMessage(id, b, 'inbound');
  db.createWarmDrip(id, id, 1, missing, Math.floor(NOW / 1000), cycle);
  return id;
}
function _clock(){ return NOW; }
async function advance(hours, opts = {}) {
  for (let h = 0; h < hours; h++) {
    NOW += 3600000;
    if (opts.onHour) await opts.onHour(h);
    await sendDueWarmDrips(SETTINGS);
  }
}
const sentFor = (id) => SENT.filter(s => s.conv === id);
const cat = (id) => db.getConversationById(id).category;
const dayOf = (t) => ((t - START) / 86400000);
const START = NOW;

const results = [];
function report(name, id, expect) {
  const msgs = sentFor(id);
  const uniq = new Set(msgs.map(m => m.body)).size;
  const gaps = msgs.slice(1).map((m, i) => (m.t - msgs[i].t) / 3600000);
  const medGap = gaps.length ? gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)] : 0;
  const span = msgs.length ? +((msgs[msgs.length-1].t - msgs[0].t)/86400000).toFixed(1) : 0;
  const r = { name, sent: msgs.length, unique: uniq, medGap, category: cat(id), span, msgs };
  r.pass = expect(r);
  results.push(r);
  return r;
}


// ═══ SCENARIOS ═══════════════════════════════════════════════════════════════
console.log('Simulating the real sender loop, hour by hour, against a real database.\n');

// 1. Standard detail chase, agent silent throughout
const c1 = seed({ inbound: ['I have a fixer upper in Tampa'] });
await advance(24 * 14);
report('Detail chase, agent silent', c1, (r) => r.sent === 10 && r.unique === 10 && r.category === 'not_interested');

// 2. Blocked chase (under contract) - slower cadence, status copy
const c2 = seed({ inbound: ['I have one on Oak St but it is under contract right now'] });
await advance(24 * 40);
report('Blocked chase (under contract)', c2, (r) => r.sent === 10 && r.unique === 10 && r.medGap >= 60 && r.medGap <= 84 && r.category === 'not_interested');

// 3. Partial info: address arrives on day 3, chase must narrow
const c3 = seed({ inbound: ['I have one in Clearwater'] });
await advance(24 * 14, { onHour: (h) => { if (h === 24 * 3) db.addMessage(c3, '4410 Bayshore Blvd', 'inbound'); } });
report('Narrows after address arrives', c3, (r) => r.sent === 10 &&
  r.msgs.slice(4).every(m => /asking price/.test(m.body) && !/address and asking/.test(m.body)));

// 4. Blocker clears mid-run: status poll must switch back to detail chase
const c4 = seed({ inbound: ['I have one but the seller has gone dark on me'] });
await advance(24 * 40, { onHour: (h) => { if (h === 24 * 9) db.addMessage(c4, 'Good news, he is back and responsive now', 'inbound'); } });
{
  const statusCopy = c4msgs => c4msgs.filter(m => !/address|asking price/i.test(m.body)).length;
  const detailCopy = c4msgs => c4msgs.filter(m => /address|asking price/i.test(m.body)).length;
  report('Blocker clears mid-run', c4, (r) => r.sent === 10 && statusCopy(r.msgs) > 0 && detailCopy(r.msgs) > 0);
}

// 5. Human takes over - chase must stop dead
const c5 = seed({ inbound: ['I have a property in Brandon'] });
await advance(24 * 3);
sql.prepare('UPDATE conversations SET human_replied=1 WHERE id=?').run(c5);
await advance(24 * 12);
report('Human takes over', c5, (r) => r.sent >= 2 && r.sent <= 4);

// 6. Full lifetime: three cycles back to back, nothing silently skipped
const c6 = seed({ inbound: ['I have one coming'] });
for (let cyc = 1; cyc <= 3; cyc++) {
  await advance(24 * 12);
  if (cyc < 3) { // agent replies with a new date, re-anchoring a fresh cycle
    db.addMessage(c6, 'Sorry, next week for sure', 'inbound');
    sql.prepare('UPDATE conversations SET category=? WHERE id=?').run('warm', c6);
    db.cancelWarmDrips(c6);
    db.createWarmDrip(c6, c6, 1, 'both', Math.floor(NOW / 1000) + 3600, cyc + 1);
  }
}
report('Three full cycles (30 touches)', c6, (r) => r.sent === 30);

// 7. Calendar ceiling: a chase whose generation began 121 days ago must close on the next
// due touch, regardless of remaining cycle or touch budget. Backdated directly so the test
// asserts the ceiling itself rather than a 120-day simulated loop.
const c7 = seed({ inbound: ['I have one, waiting on probate'], missing: 'status' });
sql.prepare('UPDATE warm_drip SET created_at = ? WHERE conv_id = ?')
   .run(Math.floor((_clock() - 121 * 86400000) / 1000), c7);
sql.prepare('UPDATE warm_drip SET send_at = ? WHERE conv_id = ?').run(Math.floor(_clock() / 1000), c7);
await advance(3);
const agedOut = sql.prepare("SELECT COUNT(*) c FROM audit_log WHERE action='warm_drip_aged_out'").get().c;
report('Calendar ceiling at 120 days', c7, (r) => r.sent === 0 && r.category === 'not_interested' && agedOut === 1);

// 8. Control: the SAME setup at 119 days must still send.
const c8 = seed({ inbound: ['I have one, waiting on probate'], missing: 'status' });
sql.prepare('UPDATE warm_drip SET created_at = ? WHERE conv_id = ?')
   .run(Math.floor((_clock() - 119 * 86400000) / 1000), c8);
sql.prepare('UPDATE warm_drip SET send_at = ? WHERE conv_id = ?').run(Math.floor(_clock() / 1000), c8);
await advance(3);
report('Control: 119 days still chases', c8, (r) => r.sent === 1 && r.category === 'warm');

// ── output ───────────────────────────────────────────────────────────────────
console.log('  ' + 'scenario'.padEnd(34) + 'sent  uniq  gap   span    final          verdict');
console.log('  ' + '-'.repeat(88));
for (const r of results) {
  console.log('  ' + r.name.padEnd(34) + String(r.sent).padStart(3) + '  ' + String(r.unique).padStart(4) + '  ' +
    (r.medGap + 'h').padStart(4) + '  ' + (r.span + 'd').padStart(6) + '  ' + r.category.padEnd(15) + (r.pass ? 'PASS' : 'FAIL'));
}
const failed = results.filter(r => !r.pass);
console.log('\n  ' + results.filter(r => r.pass).length + '/' + results.length + ' passed');
if (failed.length) for (const f of failed) console.log('   FAILED: ' + f.name + ' -> ' + JSON.stringify({ sent: f.sent, unique: f.unique, medGap: f.medGap, cat: f.category, span: f.span }));

console.log('\n── every message actually delivered, scenario 1 (detail chase) ──');
sentFor(1).forEach((m, i) => console.log('  day ' + String(dayOf(m.t).toFixed(1)).padStart(4) + '  ' + m.body));
console.log('\n── every message actually delivered, scenario 2 (blocked) ──');
sentFor(2).forEach((m, i) => console.log('  day ' + String(dayOf(m.t).toFixed(1)).padStart(4) + '  ' + m.body));
