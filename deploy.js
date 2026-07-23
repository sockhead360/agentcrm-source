#!/usr/bin/env node
// Run after any code change: node deploy.js
// - Auto-bumps patch version
// - Builds correctly (electron-builder --dir, no DMG, skips native rebuild)
// - Replaces installed /Applications/AgentCRM.app in-place (no dragging)
// - Publishes to GitHub so partner's Update Now works
// - Kills old app and relaunches

const { execSync, spawnSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const PKG_PATH      = path.join(__dirname, 'package.json');
const INSTALLED_APP = '/Applications/AgentCRM.app';
const ASAR_DEST     = path.join(INSTALLED_APP, 'Contents/Resources/app.asar');
const ASAR_SRC      = path.join(__dirname, 'dist/mac/AgentCRM.app/Contents/Resources/app.asar');
const ASAR_TMP      = path.join(require('os').tmpdir(), 'app.asar');
const GITHUB_REPO   = 'sockhead360/agentcrm-releases';

// ── 1. Bump patch version ──────────────────────────────────────────────────
const pkg             = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
const [maj, min, pat] = pkg.version.split('.').map(Number);
const newVersion      = `${maj}.${min}.${pat + 1}`;
pkg.version           = newVersion;
fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n');
const displayVer      = newVersion.replace(/\.0$/, '');
console.log(`\n✓ Version → ${displayVer}`);

// ── 2. Build React bundle ──────────────────────────────────────────────────
console.log('Building...');
execSync('node build.js', { stdio: 'inherit', cwd: __dirname });

// ── 3. Package app (dir only — no DMG, skips native rebuild) ──────────────
console.log('Packaging...');
execSync('npx electron-builder --mac dir -c.npmRebuild=false', {
  stdio: 'inherit',
  cwd: __dirname,
});
const sizeMB = (fs.statSync(ASAR_SRC).size / 1024 / 1024).toFixed(1);
console.log(`✓ Packaged app.asar (${sizeMB} MB)`);

// ── 4. Kill running AgentCRM ───────────────────────────────────────────────
spawnSync('pkill', ['-f', 'AgentCRM'], { stdio: 'ignore' });
spawnSync('pkill', ['-f', 'Electron'], { stdio: 'ignore' });

// ── 5. Replace installed app.asar ─────────────────────────────────────────
if (!fs.existsSync(INSTALLED_APP)) {
  console.error(`\n✗ /Applications/AgentCRM.app not found.\n`);
  process.exit(1);
}
fs.copyFileSync(ASAR_SRC, ASAR_DEST);
console.log('✓ Installed to /Applications/AgentCRM.app');

// ── 6. Publish to GitHub ───────────────────────────────────────────────────
console.log(`Publishing v${displayVer} to GitHub...`);
fs.copyFileSync(ASAR_SRC, ASAR_TMP);
try {
  execSync(
    `gh release create v${displayVer} "${ASAR_TMP}" ` +
    `--repo ${GITHUB_REPO} ` +
    `--title "AgentCRM v${displayVer}" ` +
    `--notes "AgentCRM v${displayVer}"`,
    { stdio: 'inherit', cwd: __dirname }
  );
  console.log('✓ GitHub release published');
} catch (e) {
  console.warn('⚠ GitHub publish failed — local install still updated.');
} finally {
  try { fs.unlinkSync(ASAR_TMP); } catch (_) {}
}

// ── 7. Relaunch ───────────────────────────────────────────────────────────
console.log('Relaunching AgentCRM...\n');
spawnSync('open', [INSTALLED_APP], { stdio: 'ignore', detached: true });

console.log(`✅ AgentCRM v${displayVer} live — locally and on GitHub.\n`);

// ── 8. Sync the public Vercel AI sandbox (non-fatal) ───────────────────────
// Re-extracts the AI engine from main.js, re-dumps training data, and deploys
// the standalone demo so it always mirrors the app. A failure here NEVER affects
// the AgentCRM deploy above — it just warns.
const SANDBOX_SYNC = '/Users/seymorecash/agentcrm-ai-demo/scripts/sync-engine.js';
if (fs.existsSync(SANDBOX_SYNC)) {
  console.log('Syncing public AI sandbox (Vercel)...');
  const r = spawnSync('node', [SANDBOX_SYNC], { stdio: 'inherit' });
  if (r.status !== 0) console.warn('⚠ Sandbox sync failed — AgentCRM deploy is fine; run it manually later.\n');
}
