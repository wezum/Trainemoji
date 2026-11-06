/* Delay Defence Force — synthesized audio. Zero files, works offline.
   All sounds + BGM generated with the Web Audio API on first user gesture.
   iOS Safari requires AudioContext to be started by a tap.
   Volumes are persisted in localStorage. */

const STORAGE_KEY = "ddf-audio-v1";
const DEFAULTS = { master: 1, music: 1, sfx: 1, muted: false };

const Audio = (() => {
  let ctx;
  let state = { ...DEFAULTS };

  // load persisted prefs
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && typeof saved === "object") {
      state = { ...DEFAULTS, ...saved };
    }
  } catch {}
  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    return ctx;
  }

  let bgmOsc = null;
  let bgmGain = null;
  let bgmNoteIdx = 0;
  let bgmTimer = null;

  const BGMELODY = [261.63, 329.63, 392.00, 440.00, 392.00, 329.63, 261.63, 329.63]; // C E G A G E C E

  function play(freq, type = "square", dur = 0.1, vol = 0.12, when = 0) {
    const c = ensure();
    if (!c || state.muted) return;
    const t = c.currentTime + when;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    const finalVol = state.sfx * vol * state.master;
    g.gain.setValueAtTime(finalVol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(c.destination);
    o.start(t);
    o.stop(t + dur);
  }

  function bgmNote() {
    if (!ctx || state.muted) return;
    const freq = BGMELODY[bgmNoteIdx % BGMELODY.length];
    bgmNoteIdx++;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    const finalVol = state.music * 0.05 * state.master;
    g.gain.setValueAtTime(finalVol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(ctx.currentTime);
    o.stop(ctx.currentTime + 0.5);
  }

  function bgmLoop() {
    if (!ctx || state.muted) return;
    bgmNote();
    bgmTimer = setTimeout(bgmLoop, 600);
  }

  return {
    get master() { return state.master; },
    get music() { return state.music; },
    get sfx() { return state.sfx; },
    get muted() { return state.muted; },
    init: () => { ensure(); return true; },
    toggle: () => { state.muted = !state.muted; persist(); return state.muted; },
    uiClick: () => play(600, "square", 0.05, 0.08),
    place: () => play(520, "triangle", 0.12, 0.1),
    upgrade: () => play(780, "triangle", 0.15, 0.1),
    sell: () => play(400, "sawtooth", 0.15, 0.08),
    shush: () => play(900, "square", 0.06, 0.1),
    kill: () => { play(800, "square", 0.08, 0.12); play(1000, "square", 0.08, 0.1, 0.1); },
    waveClear: () => { play(650, "triangle", 0.15, 0.12); play(980, "triangle", 0.25, 0.14, 0.18); },
    waveStart: () => { play(440, "square", 0.1, 0.1); play(554.37, "square", 0.1, 0.1, 0.1); },
    bgmStart: () => {
      if (bgmTimer) clearTimeout(bgmTimer);
      if (!ctx) ensure();
      bgmNoteIdx = 0;
      bgmLoop();
    },
    bgmStop: () => {
      if (bgmTimer) { clearTimeout(bgmTimer); bgmTimer = null; }
      if (bgmOsc) { bgmOsc.stop(); bgmOsc = null; }
      if (bgmGain) { bgmGain.gain.cancelScheduledValues(0); bgmGain = null; }
    },
    setMaster: (v) => { state.master = v; persist(); },
    setMusic: (v) => { state.music = v; persist(); },
    setSfx: (v) => { state.sfx = v; persist(); },
    gameOver: () => { bgmStop(); play(220, "sawtooth", 0.6, 0.15); play(180, "sawtooth", 0.6, 0.15, 0.3); },
    goldenSnack: () => play(1100, "sine", 0.25, 0.1),
  };
})();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => Audio.init());
} else {
  Audio.init();
}
