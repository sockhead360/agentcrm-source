// Global voice-call engine — lives OUTSIDE React so a call survives any navigation.
// Previously the Twilio Device/Call lived inside ChatWindow refs and a cleanup effect
// disconnected the call when the conversation switched or the tab changed ("it just
// hangs up when you try to get out"). This singleton owns the call for the whole app;
// components subscribe for UI state and render whatever controls they need.
// One call at a time (Twilio Device is single-call here by design).
import { Device } from '@twilio/voice-sdk';

let device = null;
let call = null;
let timer = null;
let startedAt = null;

const state = {
  status: null,     // null | 'connecting' | 'active' | 'error'
  convId: null,
  phone: null,
  name: null,
  error: '',
  muted: false,
  duration: 0,      // seconds, ticks while active
};

const listeners = new Set();
function notify() { for (const fn of listeners) { try { fn({ ...state }); } catch (_) {} } }

function resetInternals() {
  clearInterval(timer); timer = null;
  try { call?.disconnect(); } catch (_) {}
  call = null;
  try { device?.destroy(); } catch (_) {}
  device = null;
  startedAt = null;
}

function clearState() {
  state.status = null; state.convId = null; state.phone = null; state.name = null;
  state.error = ''; state.muted = false; state.duration = 0;
  notify();
}

function finishCall(logIt) {
  const dur = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0;
  const convId = state.convId;
  resetInternals();
  if (logIt && convId && dur > 2) {
    try { window.api.logCall({ convId, durationSeconds: dur }); } catch (_) {}
  }
  clearState();
}

export default {
  getState() { return { ...state }; },

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  // Start a call for a conversation. No-op with an error surfaced if one is already live.
  async dial({ convId, phone, name }) {
    if (state.status === 'connecting' || state.status === 'active') return;
    resetInternals();
    state.status = 'connecting'; state.convId = convId; state.phone = phone;
    state.name = name || phone; state.error = ''; state.muted = false; state.duration = 0;
    notify();
    try {
      // macOS native mic permission (no-op after first approval)
      const micGranted = await window.api.requestMicPermission();
      if (!micGranted) throw new Error('Microphone access denied — allow AgentCRM in System Settings → Privacy → Microphone');

      const token = await window.api.getVoiceToken();
      const settings = await window.api.getSettings();
      device = new Device(token, { logLevel: 0, codecPreferences: ['opus', 'pcmu'] });
      device.on('error', (err) => {
        state.status = 'error'; state.error = err.message || 'Device error';
        clearInterval(timer); timer = null;
        notify();
      });

      // Outgoing-only — connect directly, no register() needed
      call = await device.connect({
        params: { To: phone, CallerId: settings.voicePhoneNumber || settings.phoneNumber },
      });
      startedAt = Date.now();
      state.status = 'active'; notify();
      timer = setInterval(() => {
        state.duration = Math.floor((Date.now() - startedAt) / 1000);
        notify();
      }, 1000);
      call.on('disconnect', () => finishCall(true));
      call.on('cancel', () => finishCall(false));
      call.on('error', (err) => {
        state.status = 'error'; state.error = err.message || 'Call error';
        clearInterval(timer); timer = null;
        notify();
      });
    } catch (err) {
      console.error('Call error:', err);
      resetInternals();
      state.status = 'error'; state.error = err.message || String(err);
      notify();
    }
  },

  hangup() { finishCall(false); },

  toggleMute() {
    if (!call) return;
    state.muted = !state.muted;
    try { call.mute(state.muted); } catch (_) {}
    notify();
  },

  dismissError() {
    if (state.status === 'error') { resetInternals(); clearState(); }
  },
};

// UI debug hook (renderer-only, no Twilio involved — cannot dial anything). Lets tests and
// design checks light up the on-call chip without placing a real call:
//   window.__callDebug.mock('Name')  /  window.__callDebug.end()
if (typeof window !== 'undefined') {
  window.__callDebug = {
    mock(name = 'Test Agent') {
      state.status = 'active'; state.name = name; state.phone = name; state.convId = -1;
      startedAt = Date.now();
      timer = setInterval(() => { state.duration = Math.floor((Date.now() - startedAt) / 1000); notify(); }, 1000);
      notify();
    },
    end() { finishCall(false); },
  };
}
