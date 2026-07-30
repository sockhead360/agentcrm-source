#!/usr/bin/env node
// Sets the build-wide AI unlock password. Run locally, on your machine only:
//     node scripts/set-ai-lock.js
// Prompts twice with no echo, derives a salted scrypt hash, and writes ONLY that hash into
// main.js. The password itself is never printed, never stored, never committed and never
// leaves this machine. Anyone reading the repo sees a salted hash and nothing else.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MAIN = path.join(__dirname, '..', 'main.js');
const PARAMS = { n: 16384, r: 8, p: 1, keylen: 64 };

// Read a line from the TTY without echoing it.
function askHidden(prompt) {
  return new Promise((resolve, reject) => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    if (!stdin.isTTY) return reject(new Error('needs an interactive terminal'));
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let buf = '';
    const onData = (ch) => {
      if (ch === '\r' || ch === '\n') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        return resolve(buf);
      }
      if (ch === '') { // ctrl-c
        stdin.setRawMode(false);
        process.stdout.write('\n');
        process.exit(130);
      }
      if (ch === '' || ch === '\b') { buf = buf.slice(0, -1); return; }
      buf += ch;
    };
    stdin.on('data', onData);
  });
}

(async () => {
  const a = await askHidden('New AI unlock password: ');
  if (!a || a.length < 8) {
    console.error('\nRefused: use at least 8 characters. This is the only thing standing');
    console.error('between a shared install and the AI.');
    process.exit(1);
  }
  const b = await askHidden('Confirm: ');
  if (a !== b) {
    console.error('\nPasswords did not match. Nothing was changed.');
    process.exit(1);
  }

  const salt = crypto.randomBytes(32);
  const hash = crypto.scryptSync(a, salt, PARAMS.keylen, { N: PARAMS.n, r: PARAMS.r, p: PARAMS.p });

  const src = fs.readFileSync(MAIN, 'utf8');
  const lineRe = /const AI_LOCK = \{[^}]*\};/;
  if (!lineRe.test(src)) {
    console.error('Could not find the AI_LOCK line in main.js. Aborting without changes.');
    process.exit(1);
  }
  const next = "const AI_LOCK = { salt: '" + salt.toString('hex') + "', hash: '" + hash.toString('hex') +
               "', n: " + PARAMS.n + ", r: " + PARAMS.r + ", p: " + PARAMS.p + ", keylen: " + PARAMS.keylen + " };";
  fs.writeFileSync(MAIN, src.replace(lineRe, next));

  console.log('\nAI lock set. The salted hash is in main.js; the password is stored nowhere.');
  console.log('Next: node deploy.js');
  console.log('That bakes it into your app, the GitHub release, and every install that updates.');
})();
