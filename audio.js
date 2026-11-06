/* Delay Defence Force — synthesized sound (no external files) */

const Audio = (() => {
  let ctx;
  let muted = false;

  function ensureCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    }
    return ctx;
  }

  function play(freq, type = "square", dur = 0.1, vol = 0.12, when = 0) {
    const c = ensureCtx();
    if (!c || muted) return;
    const t = c.currentTime + when;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(c.destination);
    o.start(t);
    o.stop(t + dur);
  }

  return {
    init: () => { ensureCtx(); return true; },
    toggle: () => { muted = !muted; return muted; },
    uiClick: () => play(600, "square", 0.05, 0.08),
    place: () => play(520, "triangle", 0.12, 0.1),
    upgrade: () => play(780, "triangle", 0.15, 0.1),
    sell: () => play(400, "sawtooth", 0.15, 0.08),
    shush: () => play(900, "square", 0.06, 0.1),
    kill: () => { play(800, "square", 0.08, 0.12); play(1000, "square", 0.08, 0.1, 0.1); },
    waveClear: () => { play(650, "triangle", 0.15, 0.12); play(980, "triangle", 0.25, 0.14, 0.18); },
    gameOver: () => { play(220, "sawtooth", 0.6, 0.15); play(180, "sawtooth", 0.6, 0.15, 0.3); },
    goldenSnack: () => play(1100, "sine", 0.25, 0.1),
  };
})();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => Audio.init());
} else {
  Audio.init();
}
