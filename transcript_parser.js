'use strict';
const fs = require('fs');

// Map transcript section labels to AI category keys
const CATEGORY_MAP = {
  'RED HOT':    'hot_lead',
  'HOT':        'warm',
  'WARM':       'warm',
  'FOLLOW-UP':  'follow_up',
  'COLD':       'not_interested',
};

// Personal / test phones — skip entirely
const SKIP_PHONES = new Set([
  '+17274120832',  // Chris personal
  '+17276874159',  // Dad
  '+17274054428',  // Test
]);

function shouldSkipName(name) {
  return /^(christian nold|dad|test|glenda|cathy nold|mom|john$)/i.test(name.trim());
}

// ---------------------------------------------------------------------------
// Keyword extraction for relevance scoring at inference time
// ---------------------------------------------------------------------------
const STOP_WORDS = new Set([
  'i','a','an','the','is','are','was','were','be','been','being',
  'have','has','had','do','does','did','will','would','could','should',
  'may','might','to','of','in','for','on','with','at','by','from',
  'as','and','or','but','if','not','no','so','up','it','its','this',
  'that','they','them','their','my','me','you','your','we','us','our',
  'he','she','his','her','what','which','who','how','when','where','why',
  'can','just','get','let','know','like','one','also','any','im','ok',
  'hey','hi','yes','yeah','yep','thanks','thank','right','now','out','back',
  'go','come','see','send','call','text','please','sure','good','great',
  'well','still','there','here','some','more','about','into','over','then',
  'than','too','very','much','make','take','use','while','got','lot','bit',
  'way','try','new','old','next','last','first','few','all','own','put',
  'said','need','want','able','done','ever','even','each','both','here',
  'just','once','only','same','such','time','upon','used','were','when',
]);

function extractKeywords(text) {
  const words = text.toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
  return [...new Set(words)].slice(0, 40).join(' ');
}

// ---------------------------------------------------------------------------
// Core parser — reads the exported transcript file line-by-line
// ---------------------------------------------------------------------------
function parseTranscriptFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  let currentCategory = null;
  const conversations = [];
  let currentConv = null;
  let currentMsg = null;   // { role: 'agent'|'you', body: string }

  function flushMsg() {
    if (!currentMsg) return;
    if (currentConv && !currentConv.skip) {
      const body = currentMsg.body.replace(/\n{3,}/g, '\n\n').trim();
      if (body.length >= 3 && !/^\[\d+ media\]$/.test(body)) {
        currentConv.messages.push({ role: currentMsg.role, body });
      }
    }
    currentMsg = null;
  }

  function flushConv() {
    flushMsg();
    if (currentConv && !currentConv.skip && currentConv.messages.length > 0) {
      if (currentConv.messages.some(m => m.role === 'agent')) {
        conversations.push(currentConv);
      }
    }
    currentConv = null;
  }

  for (const line of lines) {
    // Section category header: ### CATEGORY: RED HOT
    const catMatch = line.match(/^### CATEGORY:\s*(.+)$/);
    if (catMatch) {
      flushConv();
      currentCategory = catMatch[1].trim();
      continue;
    }

    // Hash / dash dividers — end active message
    if (/^[#\-=]{20,}/.test(line)) {
      flushMsg();
      continue;
    }

    // Conversation header: [RED HOT] Name  (Company)
    if (/^\[/.test(line)) {
      const m = line.match(/^\[([A-Z\s\-]+)\]\s+(.+?)(?:\s+\((.+?)\))?$/);
      if (m) {
        flushConv();
        const name = m[2].trim();
        currentConv = {
          category: CATEGORY_MAP[currentCategory] || 'follow_up',
          sourceCategory: currentCategory || '',
          name,
          company: m[3] || '',
          phone: '',
          messages: [],
          skip: shouldSkipName(name),
        };
        continue;
      }
    }

    // Phone line
    if (currentConv && /^Phone:/.test(line)) {
      const m = line.match(/Phone:\s+(\+\d+)/);
      if (m) {
        currentConv.phone = m[1];
        if (SKIP_PHONES.has(m[1])) currentConv.skip = true;
      }
      continue;
    }

    if (!currentConv || currentConv.skip) continue;

    // Message line: "  AGENT/YOU  yyyy-mm-dd hh:mm  body"
    const msgMatch = line.match(/^ {2}(AGENT|YOU)\s+\d{4}-\d{2}-\d{2} \d{2}:\d{2}\s+(.*)/);
    if (msgMatch) {
      flushMsg();
      currentMsg = {
        role: msgMatch[1] === 'AGENT' ? 'agent' : 'you',
        body: msgMatch[2],
      };
      continue;
    }

    // Continuation line — 8+ spaces of indentation
    if (currentMsg && /^ {8}/.test(line)) {
      currentMsg.body += '\n' + line.trimStart();
      continue;
    }

    // Blank line inside an active message (paragraph break)
    if (currentMsg && line.trim() === '') {
      if (currentMsg.body.trim().length > 0) {
        currentMsg.body += '\n';
      }
      continue;
    }

    // Anything else with content ends the current message context
    if (currentMsg && line.trim()) {
      flushMsg();
    }
  }

  flushConv();
  return conversations;
}

// ---------------------------------------------------------------------------
// Build the flat example records from parsed conversations
// ---------------------------------------------------------------------------
function buildExamples(conversations) {
  const examples = [];

  for (const conv of conversations) {
    if (conv.skip) continue;

    const firstAgentIdx = conv.messages.findIndex(m => m.role === 'agent');
    if (firstAgentIdx === -1) continue;

    const agentMessage = conv.messages[firstAgentIdx].body
      .replace(/\n+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    if (agentMessage.length < 5 || /^\[\d+ media\]$/.test(agentMessage)) continue;

    // First 4 turns starting at the first agent message (skip pure media)
    const exchange = conv.messages
      .slice(firstAgentIdx, firstAgentIdx + 4)
      .filter(m => !/^\[\d+ media\]$/.test(m.body.trim()))
      .map(m => ({
        role: m.role,
        body: m.body.replace(/\n+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, 300),
      }));

    examples.push({
      category:      conv.category,
      agent_message: agentMessage.slice(0, 500),
      exchange,
      keywords:      extractKeywords(agentMessage),
      source:        'transcript',
    });
  }

  return examples;
}

module.exports = { parseTranscriptFile, buildExamples, extractKeywords };
