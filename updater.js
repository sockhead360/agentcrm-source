const https = require('https');
const originalFs = require('original-fs');
const path = require('path');
const { app, net } = require('electron');

const RELEASES_API = 'https://api.github.com/repos/sockhead360/agentcrm-releases/releases/latest';

// Translate low-level DNS/connectivity failures into a plain-English message.
// These mean we never reached the update server — it's a local internet problem.
// Returns null if it's not a network error.
function friendlyNetworkError(e) {
  const code = e && e.code;
  const NET_CODES = ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENETUNREACH', 'ENETDOWN', 'EHOSTUNREACH'];
  const isOffline = NET_CODES.includes(code)
    || /ERR_(NAME_NOT_RESOLVED|INTERNET_DISCONNECTED|CONNECTION_|NETWORK_)/i.test(e?.message || '')
    || /getaddrinfo|ENOTFOUND/i.test(e?.message || '');
  if (isOffline) {
    return new Error("No internet connection — couldn't reach the update server. Check your Wi-Fi/network and try again.");
  }
  return null;
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'AgentCRM-Updater' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        res.resume();
        return httpsGet(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', (e) => reject(friendlyNetworkError(e) || e));
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error("Couldn't reach the update server — the request timed out. Check your internet connection and try again."));
    });
  });
}

// Use Electron's net.fetch — Chromium's networking stack, handles GitHub
// redirects, SSL, and system proxy exactly like the browser does.
async function downloadFile(url, destPath, onProgress) {
  let resp;
  try {
    resp = await net.fetch(url);
  } catch (e) {
    throw friendlyNetworkError(e) || e;
  }
  if (!resp.ok) throw new Error(`Server returned HTTP ${resp.status}`);

  const total = parseInt(resp.headers.get('content-length') || '0', 10);
  const chunks = [];
  let received = 0;

  const reader = resp.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
    received += value.length;
    if (total > 0) onProgress?.(Math.round((received / total) * 95));
  }

  originalFs.writeFileSync(destPath, Buffer.concat(chunks));
  onProgress?.(100);
}

function parseVersion(v) {
  return String(v).replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
}

function isNewer(latest, current) {
  const l = parseVersion(latest);
  const c = parseVersion(current);
  for (let i = 0; i < Math.max(l.length, c.length); i++) {
    const lv = l[i] ?? 0, cv = c[i] ?? 0;
    if (lv > cv) return true;
    if (lv < cv) return false;
  }
  return false;
}

async function checkForUpdate(currentVersion) {
  const res = await httpsGet(RELEASES_API);
  if (res.status === 404) throw new Error('No releases found yet.');
  if (res.status !== 200) throw new Error(`Update server returned ${res.status}`);
  const release = JSON.parse(res.data);
  const latestVersion = release.tag_name.replace(/^v/, '');
  const asarAsset = release.assets.find(a => a.name === 'app.asar');
  if (!asarAsset) throw new Error('Update package not found in release.');
  return {
    currentVersion,
    latestVersion,
    hasUpdate: isNewer(latestVersion, currentVersion),
    downloadUrl: asarAsset.browser_download_url,
  };
}

async function installUpdate(downloadUrl, onProgress) {
  const tmpPath = path.join(app.getPath('temp'), 'agentcrm-update.tmp');
  const asarPath = path.join(process.resourcesPath, 'app.asar');

  await downloadFile(downloadUrl, tmpPath, onProgress);

  const stat = originalFs.statSync(tmpPath);
  if (stat.size < 500 * 1024) {
    try { originalFs.unlinkSync(tmpPath); } catch (_) {}
    throw new Error(`Downloaded file is only ${Math.round(stat.size / 1024)}KB — expected ~11MB. Update may be unavailable.`);
  }

  originalFs.copyFileSync(tmpPath, asarPath);
  try { originalFs.unlinkSync(tmpPath); } catch (_) {}

  return true;
}

module.exports = { checkForUpdate, installUpdate };
