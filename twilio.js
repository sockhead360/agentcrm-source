const axios = require('axios');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFile } = require('child_process');

function normalizePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`;
  if (String(raw).startsWith('+')) return String(raw).replace(/[^+\d]/g, '');
  if (digits.length > 0) return `+${digits}`;
  return null;
}

// Translate low-level DNS/connectivity failures into a plain-English message.
// These mean the request never reached Twilio — it's a local internet problem,
// not a bad credential or a Twilio outage. Returns null if it's not a network error.
function friendlyNetworkError(e) {
  const code = e && e.code;
  const NET_CODES = ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENETUNREACH', 'ENETDOWN', 'EHOSTUNREACH'];
  // axios may nest the code, or only set ECONNABORTED on a timeout
  const isTimeout = code === 'ECONNABORTED' || /timeout/i.test(e?.message || '');
  if (NET_CODES.includes(code) || isTimeout) {
    return new Error("No internet connection — couldn't reach Twilio. Check your Wi-Fi/network and try again.");
  }
  return null;
}

function makeClient(accountSid, authToken) {
  return axios.create({
    baseURL: `https://api.twilio.com/2010-04-01/Accounts/${accountSid}`,
    auth: { username: accountSid, password: authToken },
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
}

async function sendSMS(accountSid, authToken, fromNumber, toNumber, body, messagingServiceSid, mediaUrls = []) {
  const client = makeClient(accountSid, authToken);
  const params = new URLSearchParams({ To: toNumber, Body: body });
  // Always pin to the specific From number so multiple numbers on the same
  // Messaging Service don't load-balance. Include MessagingServiceSid when set
  // for A2P 10DLC compliance — Twilio honors both together.
  params.append('From', fromNumber);
  if (messagingServiceSid) {
    params.append('MessagingServiceSid', messagingServiceSid);
  }
  // Attach MMS media (Twilio supports up to 10 MediaUrl params per message)
  for (const url of (mediaUrls || []).slice(0, 10)) {
    params.append('MediaUrl', url);
  }
  try {
    const response = await client.post('/Messages.json', params.toString());
    return response.data;
  } catch (e) {
    const netErr = friendlyNetworkError(e);
    if (netErr) throw netErr;
    // Surface Twilio's own error message when it actually responded
    const twilioMsg = e.response?.data?.message;
    if (twilioMsg) throw new Error(`Twilio rejected the message: ${twilioMsg}`);
    throw e;
  }
}

// Upload a local image and return a public URL for Twilio MMS.
// Uses macOS curl (always available) with two fallback services for reliability.
async function uploadPhotoForMMS(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);

  const tryUpload = (args) => new Promise((resolve, reject) => {
    execFile('curl', args, { timeout: 25000 }, (err, stdout) => {
      if (err) return reject(new Error(err.message));
      const url = stdout.trim();
      if (url.startsWith('http')) resolve(url);
      else reject(new Error('bad response: ' + url.slice(0, 120)));
    });
  });

  // catbox.moe — permanent hosting, no account needed
  try {
    return await tryUpload(['-s', '--max-time', '20',
      '-F', 'reqtype=fileupload',
      '-F', `fileToUpload=@${filePath}`,
      'https://catbox.moe/user/api.php',
    ]);
  } catch (_) {}

  // 0x0.st — fallback, also permanent
  try {
    return await tryUpload(['-s', '--max-time', '20',
      '-F', `file=@${filePath}`,
      'https://0x0.st',
    ]);
  } catch (_) {}

  // transfer.sh — second fallback, 14-day retention (enough for MMS delivery)
  return tryUpload(['-s', '--max-time', '20',
    '--upload-file', filePath,
    `https://transfer.sh/${encodeURIComponent(path.basename(filePath))}`,
  ]);
}

async function verifyCredentials(accountSid, authToken, fromNumber, messagingServiceSid) {
  // Format checks before hitting the API
  const formatErrors = [];
  if (!accountSid || !accountSid.startsWith('AC') || accountSid.length !== 34)
    formatErrors.push('Account SID must start with "AC" and be 34 characters (e.g. ACxxxxxxxx...).');
  if (!authToken || authToken.length < 10)
    formatErrors.push('Auth Token is missing or too short.');
  const normalizedPhone = fromNumber ? normalizePhone(fromNumber) : null;
  if (fromNumber && (!normalizedPhone || !/^\+\d{10,15}$/.test(normalizedPhone)))
    formatErrors.push(`Phone number "${fromNumber}" is not valid E.164 format — use +1XXXXXXXXXX.`);
  if (messagingServiceSid && !messagingServiceSid.startsWith('MG'))
    formatErrors.push(`Messaging Service SID "${messagingServiceSid}" must start with "MG".`);
  if (formatErrors.length > 0) throw new Error(formatErrors.join(' '));

  // Verify credentials against the API
  const client = makeClient(accountSid, authToken);
  try {
    await client.get('');
  } catch (e) {
    if (e.response?.status === 401) throw new Error('Account SID or Auth Token is incorrect — Twilio rejected the credentials.');
    throw new Error('Could not reach Twilio API: ' + (e.message || 'network error'));
  }

  // Verify the phone number is owned by this account
  if (normalizedPhone) {
    const res = await client.get(`/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(normalizedPhone)}`);
    if (!res.data.incoming_phone_numbers?.length)
      throw new Error(`Phone number ${normalizedPhone} was not found in this Twilio account. Check the number or account.`);
  }

  // Verify the Messaging Service SID exists
  if (messagingServiceSid) {
    try {
      await axios.get(`https://messaging.twilio.com/v1/Services/${messagingServiceSid}`, {
        auth: { username: accountSid, password: authToken },
      });
    } catch (e) {
      if (e.response?.status === 404)
        throw new Error(`Messaging Service SID "${messagingServiceSid}" was not found in your Twilio account.`);
      throw new Error('Could not verify Messaging Service SID: ' + (e.message || 'network error'));
    }
  }

  return true;
}

async function fetchInboundMessages(accountSid, authToken, toNumber, afterDatetime) {
  const client = makeClient(accountSid, authToken);
  const params = new URLSearchParams({ To: toNumber, PageSize: '100' });
  if (afterDatetime) {
    // Twilio uses DateSent>= for filtering
    const d = new Date(afterDatetime);
    params.append('DateSent>=', d.toISOString().split('T')[0]);
  }
  const response = await client.get(`/Messages.json?${params}`);
  const messages = response.data.messages || [];
  return messages.filter(m => m.direction === 'inbound');
}

function buildBlastMessage(template, firstName) {
  return template.replace(/\{firstName\}/gi, firstName || 'there');
}

// GSM-7 charset — anything outside this triggers UCS-2 (70-char segments)
const GSM7 = new Set('@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà');

function countSegments(text) {
  const isGsm = [...text].every(c => GSM7.has(c));
  const charLimit = isGsm ? 160 : 70;
  const multiLimit = isGsm ? 153 : 67;
  if (text.length <= charLimit) return 1;
  return Math.ceil(text.length / multiLimit);
}

async function fetchMessageStatus(accountSid, authToken, messageSid) {
  const client = makeClient(accountSid, authToken);
  const response = await client.get(`/Messages/${messageSid}.json`);
  return response.data.status; // queued | sending | sent | delivered | undelivered | failed
}

async function fetchMessageStatuses(accountSid, authToken, sids) {
  const CONCURRENCY = 10;
  const results = {};
  for (let i = 0; i < sids.length; i += CONCURRENCY) {
    const batch = sids.slice(i, i + CONCURRENCY);
    const statuses = await Promise.all(
      batch.map(sid =>
        fetchMessageStatus(accountSid, authToken, sid)
          .then(status => ({ sid, status }))
          .catch(() => ({ sid, status: null }))
      )
    );
    statuses.forEach(({ sid, status }) => { if (status) results[sid] = status; });
  }
  return results;
}

// Fetch all-in per-message rates from Twilio Usage Records (includes carrier surcharges).
// Uses the most recent non-zero period (this month if it has data, otherwise last month).
async function fetchUsageSummary(accountSid, authToken) {
  const fetchPeriod = async (period) => {
    const client = makeClient(accountSid, authToken);
    const res = await client.get(`/Usage/Records/${period}.json?PageSize=100`);
    const records = res.data.usage_records || [];
    const out = records.find(r => r.category === 'sms-outbound-longcode');
    const inc = records.find(r => r.category === 'sms-inbound-longcode');
    return {
      outboundCount: parseInt(out?.count || '0'),
      outboundPrice: Math.abs(parseFloat(out?.price || '0')),
      inboundCount:  parseInt(inc?.count || '0'),
      inboundPrice:  Math.abs(parseFloat(inc?.price || '0')),
    };
  };

  // Try this month first; fall back to last month for a larger sample
  const [thisMonth, lastMonth] = await Promise.all([
    fetchPeriod('ThisMonth'),
    fetchPeriod('LastMonth'),
  ]);

  // Pick the period with more outbound data
  const best = thisMonth.outboundCount >= 50 ? thisMonth : lastMonth;
  const allInOutboundPerMsg = best.outboundCount > 0 ? best.outboundPrice / best.outboundCount : null;
  const allInInboundPerMsg  = best.inboundCount  > 0 ? best.inboundPrice  / best.inboundCount  : null;

  return {
    allInOutboundPerMsg,  // null if no data
    allInInboundPerMsg,   // null if no data
    outboundCount: best.outboundCount,
    inboundCount:  best.inboundCount,
    period: thisMonth.outboundCount >= 50 ? 'this_month' : 'last_month',
  };
}

async function fetchAccountBalance(accountSid, authToken) {
  const client = makeClient(accountSid, authToken);
  const res = await client.get('.json');
  return { balance: parseFloat(res.data.balance), currency: res.data.currency || 'USD' };
}

async function fetchSmsPricing(accountSid, authToken) {
  const res = await axios.get('https://pricing.twilio.com/v1/Messaging/Countries/US', {
    auth: { username: accountSid, password: authToken },
    timeout: 8000,
  });
  const outboundPrices = (res.data.outbound_sms_prices || [])
    .map(c => c.prices?.find(p => p.number_type === 'local'))
    .filter(Boolean)
    .map(p => parseFloat(p.current_price))
    .filter(n => !isNaN(n));
  const outboundPricePerSegment = outboundPrices.length > 0
    ? outboundPrices.reduce((a, b) => a + b, 0) / outboundPrices.length
    : 0.0079;
  const inboundRow = (res.data.inbound_sms_prices || []).find(p => p.number_type === 'local');
  const inboundPricePerMessage = inboundRow ? parseFloat(inboundRow.current_price) : 0.0075;
  return {
    outboundPricePerSegment,
    inboundPricePerMessage,
    currency: res.data.price_unit || 'USD',
    carrierCount: outboundPrices.length,
  };
}

async function fetchMedia(accountSid, authToken, messageSid) {
  const client = makeClient(accountSid, authToken);
  const res = await client.get(`/Messages/${messageSid}/Media.json`);
  const items = res.data.media_list || [];
  return Promise.all(items.map(async (item) => {
    const mediaPath = item.uri.replace('.json', '');
    const imgRes = await axios.get(`https://api.twilio.com${mediaPath}`, {
      auth: { username: accountSid, password: authToken },
      responseType: 'arraybuffer',
    });
    return {
      sid: item.sid,
      contentType: item.content_type || 'image/jpeg',
      data: Buffer.from(imgRes.data),
    };
  }));
}

module.exports = { normalizePhone, sendSMS, uploadPhotoForMMS, verifyCredentials, fetchInboundMessages, fetchMedia, buildBlastMessage, fetchMessageStatuses, countSegments, fetchAccountBalance, fetchSmsPricing, fetchUsageSummary };
