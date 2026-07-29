const cache = {};

// Global notification-sound mute (persisted). Toggled from the Conversations tab —
// silences all AIM chrome sounds (imrcv/imsend/buddyin/buddyout/filedone/etc.) so
// incoming-message dings don't interrupt live phone calls with agents.
let muted = false;
try { muted = localStorage.getItem('soundsMuted') === '1'; } catch (_) {}

export function isMuted() { return muted; }

export function setMuted(v) {
  muted = !!v;
  try { localStorage.setItem('soundsMuted', muted ? '1' : '0'); } catch (_) {}
}

export function play(name) {
  if (muted) return;
  try {
    if (!cache[name]) {
      cache[name] = new Audio(`sounds/${name}.wav`);
    }
    const audio = cache[name];
    audio.currentTime = 0;
    audio.play().catch(() => {});
  } catch (_) {}
}
