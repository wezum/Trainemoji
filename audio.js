/* Delay Defence Force — synthesized audio. Zero files, works offline.
   All sounds + BGM generated with the Web Audio API on first user gesture.
   iOS Safari requires AudioContext to be started by a tap.
   Volumes are persisted in localStorage. */

const STORAGE_KEY = "ddf-audio-v1";
const DEFAULTS = { master: 1, music: 1, sfx: 1, muted: false };

const Audio = (() => {
  let ctx;
  let state = { ...DEFAULTS };

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && typeof saved === "object") {
      state = { ...DEFAULTS, ...saved };
    }
  } catch {}
  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }
  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  /* ---------------- one-shot SFX ---------------- */

  function tone({ freq, type = "square", dur = 0.12, vol = 0.12, when }) {
    const c = ensure();
    if (!c || state.muted) return;
    const t = when !== undefined ? when : c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    const g = vol * state.sfx * state.master;
    gain.gain.setValueAtTime(g, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t);
    osc.stop(t + dur);
  }

  function chord(notes, { dur = 0.25, vol = 0.09, when, type = "triangle" }) {
    const c = ensure();
    if (!c || state.muted) return;
    const t = when !== undefined ? when : c.currentTime;
    notes.forEach((f) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f, t);
      const g = vol * state.sfx * state.master;
      gain.gain.setValueAtTime(g, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(t);
      osc.stop(t + dur);
    });
  }

  function noiseBurst({ dur = 0.08, vol = 0.06 }) {
    const c = ensure();
    if (!c || state.muted) return;
    const t = c.currentTime;
    const bufferSize = Math.max(1, c.sampleRate * dur);
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * vol * state.sfx * state.master;
    const src = c.createBufferSource();
    src.buffer = buffer;
    src.connect(c.destination);
    src.start(t);
  }

  /* ---------------- BGM loop ---------------- */

  let bgmPlaying = false;
  let bgmT = 0;

  const MELODY = [
    { f: 523, d: 0.22 }, { f: 523, d: 0.22 }, { f: 587, d: 0.22 }, { f: 659, d: 0.44 },
    { f: 659, d: 0.22 }, { f: 587, d: 0.22 }, { f: 523, d: 0.44 }, { f: 494, d: 0.44 },
    { f: 440, d: 0.66 }, { f: 523, d: 0.22 }, { f: 587, d: 0.22 }, { f: 659, d: 0.44 },
    { f: 698, d: 0.22 }, { f: 784, d: 0.44 }, { f: 784, d: 0.22 }, { f: 698, d: 0.22 },
    { f: 659, d: 0.44 }, { f: 587, d: 0.44 }, { f: 523, d: 0.88 },
  ];

  function bgmTick() {
    if (!bgmPlaying || state.muted) return;
    const c = ensure();
    if (!c) return;
    const now = c.currentTime;
    if (bgmT > now) { setTimeout(bgmTick, 50); return; }
    const entry = MELODY[Math.floor(((bgmT - now) * 1000) / (2100 / MELODY.length)) % MELODY.length];
    if (!entry) return;
    const dur = Math.min(entry.d, 0.5);
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(entry.f, bgmT);
    const g = 0.05 * state.music * state.master;
    gain.gain.setValueAtTime(g, bgmT);
    gain.gain.exponentialRampToValueAtTime(0.001, bgmT + dur);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(bgmT);
    osc.stop(bgmT + dur);
    bgmT += entry.d;
    setTimeout(bgmTick, Math.max(40, entry.d * 900));
  }

  function bgmStart() {
    if (bgmPlaying || state.muted) return;
    bgmPlaying = true;
    bgmT = (ensure() || { currentTime: 0 }).currentTime;
    bgmTick();
  }

  function bgmStop() { bgmPlaying = false; }

  /* ---------------- jingles ---------------- */

  // Wave start: descending minor arpeggio — challenging, urgent.
  function waveStart() {
    const c = ensure();
    if (!c || state.muted) return;
    const t = c.currentTime;
    [440, 349, 294, 262].forEach((f, i) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(f, t + i * 0.09);
      const g = 0.1 * state.sfx * state.master;
      gain.gain.setValueAtTime(g, t + i * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.09 + 0.18);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(t + i * 0.09);
      osc.stop(t + i * 0.09 + 0.18);
    });
  }

  // Wave clear: cheerful ascending "tududud" major arpeggio.
  function waveClear() {
    const c = ensure();
    if (!c || state.muted) return;
    const t = c.currentTime;
    [523, 587, 659, 784, 1047].forEach((f, i) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(f, t + i * 0.07);
      const g = 0.09 * state.sfx * state.master;
      gain.gain.setValueAtTime(g, t + i * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.14);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(t + i * 0.07);
      osc.stop(t + i * 0.07 + 0.14);
    });
  }

  function gameOver() {
    const c = ensure();
    if (!c || state.muted) return;
    const t = c.currentTime;
    [220, 185, 147, 110].forEach((f, i) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(f, t + i * 0.15);
      const g = 0.1 * state.sfx * state.master;
      gain.gain.setValueAtTime(g, t + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.15 + 0.3);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(t + i * 0.15);
      osc.stop(t + i * 0.15 + 0.3);
    });
    bgmStop();
  }

  return {
    init: ensure,
    get muted() { return state.muted; },
    get master() { return state.master; },
    get music() { return state.music; },
    get sfx() { return state.sfx; },
    toggle() {
      state.muted = !state.muted;
      if (state.muted) bgmStop();
      persist();
      return state.muted;
    },
    setMaster(v) { state.master = clamp01(v); persist(); },
    setMusic(v) { state.music = clamp01(v); persist(); },
    setSfx(v) { state.sfx = clamp01(v); persist(); },
    /* one-shots — all sfx */
    place() { tone({ freq: 440, type: "square", dur: 0.09, vol: 0.1 }); },
    upgrade() { tone({ freq: 660, type: "square", dur: 0.1, vol: 0.1 }); },
    sell() { tone({ freq: 220, type: "sawtooth", dur: 0.14, vol: 0.08 }); },
    kill() { tone({ freq: 880, type: "square", dur: 0.06, vol: 0.07 }); },
    shush() { noiseBurst({ dur: 0.05, vol: 0.05 }); },
    goldenSnack() { chord([880, 1109, 1320, 1568], { dur: 0.25, vol: 0.1 }); },
    uiClick() { tone({ freq: 900, type: "sine", dur: 0.04, vol: 0.05 }); },
    /* jingles */
    waveStart,
    waveClear,
    gameOver,
    /* bgm */
    bgmStart,
    bgmStop,
  };
})();

window.DDFAudio = Audio;
