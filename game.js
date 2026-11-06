"use strict";

/* ================================================================
   Delay Defence Force — a one-lane tower defence about a delayed train.
   Boredom creatures shuffle down the carriage toward your seat.
   Place defences in the seat spaces. Shush them directly if they get close.
   No assets. Just emoji, numbers going up, and consequences.
   ================================================================ */

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmt = (n) => {
  n = Math.floor(n);
  if (n < 1000) return String(n);
  if (n < 1e6) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
  return (n / 1e6).toFixed(2) + "m";
};
const rnd = (a, b) => a + Math.random() * (b - a);

/* ---------------- content ---------------- */

const SLOTS = 9;

const KINDS = {
  vendor: { emoji: "🥨", name: "Snack Vendor",   cost: 25,  dps: 3,   range: 1.3, slow: 0,    blurb: "Sells crisps. Hits softly." },
  kid:    { emoji: "🧩", name: "Crossword Kid", cost: 60,  dps: 6,   range: 1.7, slow: 0,    blurb: "7-down, and 7 patience down." },
  corn:   { emoji: "🍿", name: "Popcorn Lady",   cost: 100, dps: 1,   range: 1.7, slow: 0.40, blurb: "Sticky floor. Bore slows by 40%." },
  dj:     { emoji: "🎧", name: "Portable DJ",   cost: 140, dps: 11,  range: 2.1, slow: 0,    blurb: "Volume negotiation is not a negotiation." },
  yoga:   { emoji: "🧘", name: "Yoga Aunt",     cost: 220, dps: 2,   range: 2.3, slow: 0.65, blurb: "Golden retriever energy. Slows by 65%." },
};
const MAXLVL = 4;

const dpsFor   = (d) => KINDS[d.kind].dps * (1 + 0.8 * (d.lvl - 1));
const rangeFor = (d) => KINDS[d.kind].range + 0.15 * (d.lvl - 1);
const slowFor  = (d) => { const s = KINDS[d.kind].slow; return s ? Math.min(0.85, s + 0.1 * (d.lvl - 1)) : 0; };
const upCost   = (d) => Math.round(KINDS[d.kind].cost * Math.pow(1.9, d.lvl) * 0.9);

const BORES = {
  commuter: { emoji: "📱", name: "Scroller",      hp: 26,  speed: 1.0,  reward: 8,  mega: false },
  kid:      { emoji: "👶", name: "Screamer",      hp: 16,  speed: 1.5,  reward: 12, mega: false },
  podcast:  { emoji: "📞", name: "Podcast Guy",   hp: 80,  speed: 0.72, reward: 26, mega: false },
  luggage:  { emoji: "🧳", name: "Luggage Bloke", hp: 210, speed: 0.5,  reward: 70, mega: true  },
};
const BASE_SPEED = 0.26;      // slot units per second
const TAP_DMG = 4;
const START_MONEY = 60;
const MAX_SANITY = 10;

/* ---------------- state ---------------- */

const LS_SAVE = "ddf-save-v1";
const LS_BEST = "ddf-best-v1";
const LS_SEEN = "ddf-seen-v1";

const freshState = () => ({
  v: 1,
  money: START_MONEY,
  sanity: MAX_SANITY,
  kills: 0,
  wave: 0,                              // waves cleared
  slots: new Array(SLOTS).fill(null),   // {kind, lvl, spent} | null
  spentTotal: 0,
});

let state = freshState();
let bestWave = +(localStorage.getItem(LS_BEST) || 0);
let phase = "pre";          // pre | intermission | wave | over
let interLeft = 0;
let bores = [];             // {id, kind, pos, hp, max, mul, el, hpEl, faceEl}
let queue = [];             // kinds to spawn, head next
let spawnT = 0;
let tapCd = 0;
let speedMul = 1;
let paused = false;
let selectedKind = null;    // shop selection
let selectedSlot = -1;      // open slot panel
let snapSlot = null;        // slot panel target
let goldenT = rnd(18, 30);
let uid = 0;

let waveStats = null;       // snapshot taken at wave start for mid-wave reload safety

/* ---------------- DOM ---------------- */

const lane = $("lane");
const rowSlots = $("slots");
const rowBores = $("bores");
const seat = $("seat");
const shopEl = $("shop");
const statMoney = $("stat-money").querySelector("b");
const statWave = $("stat-wave").querySelector("b");
const statSanity = $("stat-sanity").querySelector("b");
const waveMsg = $("wave-msg");
const waveBtn = $("btn-wave");
const modal = $("modal");
const slotpanel = $("slotpanel");
const slotpanelInfo = $("slotpanel-info");
const snackEl = $("snack");

let laneW = 0;
const pxPerUnit = () => laneW / SLOTS;

const slotEls = [];
for (let i = 0; i < SLOTS; i++) {
  const el = document.createElement("div");
  el.className = "slot";
  el.addEventListener("click", () => onSlotClick(i));
  rowSlots.appendChild(el);
  slotEls.push(el);
}

function measure() {
  laneW = lane.clientWidth;
}
addEventListener("resize", () => {
  measure();
  layoutBores();
});

/* ---------------- persistence ---------------- */

function saveNow() {
  localStorage.setItem(LS_SAVE, JSON.stringify(state));
}
function loadSave() {
  const raw = localStorage.getItem(LS_SAVE);
  if (!raw) return false;
  try {
    const s = JSON.parse(raw);
    if (s && s.v === 1 && Array.isArray(s.slots) && s.slots.length === SLOTS) {
      state = s;
      return true;
    }
  } catch {}
  return false;
}

/* ---------------- wave composition ---------------- */

function waveComp(n) {
  const q = [];
  const count = 5 + Math.floor(n * 1.35);
  for (let i = 0; i < count; i++) {
    const r = Math.random();
    if (n >= 4 && r < 0.22) q.push("kid");
    else if (n >= 4 && r < 0.44) q.push("podcast");
    else q.push("commuter");
  }
  if (n % 5 === 0) {
    q.push("luggage");
    if (n >= 15) q.push("luggage");
    if (n >= 30) q.push("luggage");
  }
  return q;
}
const hpMul     = (n) => 1 + 0.22 * (n - 1) + 0.02 * (n - 1) * (n - 1);
const rewardMul = (n) => 1 + 0.08 * (n - 1);
const speedMulWave = (n) => Math.min(1.7, 1 + 0.035 * (n - 1));

/* ---------------- shop UI ---------------- */

function buildShop() {
  shopEl.innerHTML = "";
  for (const key of Object.keys(KINDS)) {
    const k = KINDS[key];
    const b = document.createElement("button");
    b.className = "shop-item";
    b.dataset.kind = key;
    b.innerHTML = `<span class="face">${k.emoji}</span><span class="nm">${k.name}</span><span class="pr">💰 ${k.cost}</span>`;
    b.addEventListener("click", () => {
      selectedSlotClose();
      selectedKind = key;
      renderShop();
      renderSlots();
    });
    shopEl.appendChild(b);
  }
}

function renderShop() {
  for (const b of shopEl.children) {
    const key = b.dataset.kind;
    b.disabled = state.money < KINDS[key].cost && selectedKind !== key;
    b.classList.toggle("selected", selectedKind === key);
    b.querySelector(".pr").textContent = "💰 " + fmt(KINDS[key].cost);
  }
}

/* ---------------- slots ---------------- */

function renderSlots() {
  for (let i = 0; i < SLOTS; i++) {
    const el = slotEls[i];
    const d = state.slots[i];
    el.classList.toggle("occupied", !!d);
    el.classList.toggle("selected", selectedSlot === i || (selectedKind && !d));
    if (d) {
      const k = KINDS[d.kind];
      el.innerHTML = `<span class="def">${k.emoji}</span>` + (d.lvl > 1 ? `<i class="lvl">${d.lvl}</i>` : "");
      el.title = `${k.name} · lv ${d.lvl}`;
    } else {
      const shown = selectedKind ? KINDS[selectedKind] : null;
      el.innerHTML = `<span class="placeholder">${shown ? shown.emoji : "+"}</span>`;
      el.title = "Empty seat space";
    }
  }
}

function onSlotClick(i) {
  const d = state.slots[i];
  if (d) { openSlotPanel(i); return; }
  if (!selectedKind) return;
  const k = KINDS[selectedKind];
  if (state.money < k.cost) return;
  state.money -= k.cost;
  state.spentTotal += k.cost;
  state.slots[i] = { kind: selectedKind, lvl: 1, spent: k.cost };
  const placed = slotEls[i];
  placed.classList.add("place-pop");
  requestAnimationFrame(() => placed.classList.remove("place-pop"));
  Audio.place();
  renderSlots();
  renderShop();
  updateStats();
  save();
}

function openSlotPanel(i) {
  selectedSlot = i;
  snapSlot = state.slots[i];
  renderSlotPanel();
  renderSlots();
}

function selectedSlotClose() {
  selectedSlot = -1;
  snapSlot = null;
  slotpanel.hidden = true;
  renderSlots();
}

function renderSlotPanel() {
  if (selectedSlot < 0 || !state.slots[selectedSlot]) { selectedSlotClose(); return; }
  const d = state.slots[selectedSlot];
  const k = KINDS[d.kind];
  const slow = slowFor(d);
  slotpanelInfo.innerHTML =
    `<b>${k.emoji} ${k.name} · lv ${d.lvl}${d.lvl >= MAXLVL ? " (max)" : ""}</b>` +
    `<span>${dmgText(d)}${slow ? ` · slows ${Math.round(slow * 100)}%` : ""} · range ${rangeFor(d).toFixed(1)}</span>` +
    (d.lvl < MAXLVL ? "" : "");
  const up = $("btn-upgrade");
  up.hidden = d.lvl >= MAXLVL;
  up.textContent = `Upgrade · 💰 ${fmt(upCost(d))}`;
  $("btn-sell").textContent = `Sell · 💰 ${fmt(Math.round((d.spent || k.cost) * 0.5))}`;
  slotpanel.hidden = false;
}
const dmgText = (d) => (KINDS[d.kind].slow && KINDS[d.kind].dps <= 2 && d.kind === "corn")
  ? `${dpsFor(d).toFixed(1)} dps`
  : `${dpsFor(d).toFixed(1).replace(/\.0$/, "")} dps`;

$("btn-upgrade").addEventListener("click", () => {
  if (selectedSlot < 0) return;
  const d = state.slots[selectedSlot];
  if (!d || d.lvl >= MAXLVL) return;
  const c = upCost(d);
  if (state.money < c) return;
  state.money -= c;
  d.spent += c;
  d.lvl++;
  Audio.upgrade();
  renderSlotPanel();
  renderSlots();
  updateStats();
  save();
});
$("btn-sell").addEventListener("click", () => {
  if (selectedSlot < 0) return;
  const d = state.slots[selectedSlot];
  if (!d) return;
  state.money += Math.round((d.spent || KINDS[d.kind].cost) * 0.5);
  state.slots[selectedSlot] = null;
  Audio.sell();
  selectedSlotClose();
  updateStats();
  save();
});
$("btn-slot-close").addEventListener("click", selectedSlotClose);

/* ---------------- bores ---------------- */

function spawnBore(kind, n) {
  const b = BORES[kind];
  const el = document.createElement("div");
  el.className = "bore" + (b.mega ? " mega" : "");
  el.innerHTML = `<div class="hp"><i></i></div><div class="face">${b.emoji}</div>`;
  const bore = {
    id: uid++,
    kind,
    pos: 0,
    hp: b.hp * hpMul(n),
    max: b.hp * hpMul(n),
    mul: speedMulWave(n) * b.speed,
    slow: 0,
    el,
    hpEl: el.querySelector(".hp i"),
    faceEl: el.querySelector(".face"),
    entrySlide: true,
  };
  bore.row = bore.id % 3;                                  // three pedestrian rows
  el.style.bottom = (8 + bore.row * 26) + "px";
  el.style.animationDelay = (bore.id * 0.5) + "s";
  el.style.transform = "translateX(-120px)";
  el.style.opacity = "0";
  el.classList.add("entry");
  rowBores.appendChild(el);
  bores.push(bore);
  layoutBore(bore);
}

function layoutBore(b) {
  if (b.entrySlide) {
    b.entrySlide = false;
    requestAnimationFrame(() => {
      b.el.style.transition = "transform .4s ease, opacity .4s ease";
      b.el.style.transform = `translateX(${b.pos * pxPerUnit()}px)`;
      b.el.style.opacity = "1";
      setTimeout(() => b.el.classList.remove("entry"), 450);
    });
    return;
  }
  b.el.style.transform = `translateX(${b.pos * pxPerUnit()}px)`;
}
function layoutBores() {
  for (const b of bores) layoutBore(b);
}

function updateHpBar(b) {
  b.hpEl.style.width = clamp((b.hp / b.max) * 100, 0, 100) + "%";
}

function killBore(b, i) {
  const base = BORES[b.kind].reward * rewardMul(state.wave + 1);
  const cash = Math.round(base);
  state.money += cash;
  state.kills++;
  floatyAt(b.pos, `+💰${fmt(cash)}`, "cash");
  floatyAt(b.pos, "💥", "");
  updateStats();
  b.dead = true;
  b.deadAt = performance.now();
  b.el.style.transition = "transform .14s ease, opacity .14s ease";
  b.el.style.transform = "scale(.55)";
  b.el.style.opacity = "0.5";
  Audio.kill();
}

function sweepDead() {
  const now = performance.now();
  for (let i = bores.length - 1; i >= 0; i--) {
    if (bores[i].dead && now - bores[i].deadAt > 150) {
      bores[i].el.remove();
      bores.splice(i, 1);
    }
  }
}

function slowForBore(b) {
  let s = 0;
  for (let i = 0; i < SLOTS; i++) {
    const d = state.slots[i];
    if (!d) continue;
    const slow = slowFor(d);
    if (!slow) continue;
    const c = i + 0.5;
    if (Math.abs(c - b.pos) <= rangeFor(d)) s = Math.max(s, slow);
  }
  return s;
}

function dpsTick(dt) {
  for (let i = bores.length - 1; i >= 0; i--) {
    const b = bores[i];
    if (b.dead) continue;
    let dmg = 0;
    for (let j = 0; j < SLOTS; j++) {
      const d = state.slots[j];
      if (!d) continue;
      const c = j + 0.5;
      if (Math.abs(c - b.pos) <= rangeFor(d)) dmg += dpsFor(d);
    }
    if (dmg > 0) {
      b.hp -= dmg * dt;
      if (b.hp <= 0) killBore(b, i);
      else {
        updateHpBar(b);
        const d = Math.max(1, Math.round(dmg * dt));
        floatyAt(b.pos, `-${d}`, "dmg");
      }
    }
  }
}

function leak(b) {
  state.sanity--;
  seat.classList.add("leak");
  setTimeout(() => seat.classList.remove("leak"), 400);
  lane.classList.add("lane-shake");
  setTimeout(() => lane.classList.remove("lane-shake"), 200);
  updateStats();
  if (state.sanity <= 0) gameOver();
}

/* ---------------- tap to shush ---------------- */

lane.addEventListener("pointerdown", (e) => {
  if (phase !== "wave" || paused || tapCd > 0) return;
  const rect = lane.getBoundingClientRect();
  const x = (e.clientX - rect.left) / pxPerUnit();
  let best = null, bi = -1;
  for (let i = 0; i < bores.length; i++) {
    const b = bores[i];
    const d = Math.abs(b.pos + 0.2 - x);
    if (d < 0.7 && (best === null || d < best)) { best = d; bi = i; }
  }
  if (bi >= 0) {
    const b = bores[bi];
    b.hp -= TAP_DMG;
    tapCd = 0.25;
    Audio.shush();
    b.el.classList.add("hit");
    const f = b.faceEl;
    setTimeout(() => { f && b.el.classList.remove("hit"); }, 130);
    floatyAt(b.pos, "shush", "");
    if (b.hp <= 0) {
      const i = bores.indexOf(b);
      if (i >= 0) killBore(b, i);
    } else {
      updateHpBar(b);
    }
  }
});

/* ---------------- floaties ---------------- */

function floatyAt(pos, text, cls) {
  const f = document.createElement("span");
  f.className = "floaty " + cls;
  f.textContent = text;
  const x = pos * pxPerUnit();
  f.style.left = x + "px";
  f.style.bottom = "56px";
  rowBores.appendChild(f);
  setTimeout(() => f.remove(), 820);
}

/* ---------------- wave flow ---------------- */

function startWave() {
  const n = state.wave + 1;
  phase = "wave";
  queue = waveComp(n);
  spawnT = 0;
  waveBtn.disabled = true;
  waveMsg.textContent = `Wave ${n}: ${queue.length} bores inbound. Hold the aisle.`;
  const bar = $("wavebar");
  bar.classList.add("wave-flash");
  requestAnimationFrame(() => bar.classList.remove("wave-flash"));
  Audio.waveStart();
  Audio.bgmStart();
  save();
}

function startNow(bonus) {
  if (bonus > 0) {
    state.money += bonus;
    floatyAt(2, `+💰${bonus} early bonus`, "cash");
  }
  startWave();
  updateStats();
}

function endWave() {
  const n = state.wave;
  const bonus = 20 + 12 * n;
  state.money += bonus;
  state.wave = n + 1;
  phase = "intermission";
  interLeft = 15;
  if (state.wave > bestWave) {
    bestWave = state.wave;
    localStorage.setItem(LS_BEST, String(bestWave));
  }
  Audio.bgmStop();
  Audio.waveClear();
  floatyAt(4, `+💰${bonus} wave clear`, "cash");
  save();
  updateStats();
  updateWaveUI();
}

function gameOver() {
  phase = "over";
  localStorage.removeItem(LS_SAVE);
  lane.classList.remove("paused-view");
  waveMsg.textContent = "Sanity gone. The track went quiet.";
  waveBtn.disabled = true;
  Audio.gameOver();
  showGameOver();
}

function updateWaveUI() {
  statWave.textContent = `Wave ${phase === "pre" ? 1 : state.wave + 1}`;
  if (phase === "pre") {
    waveMsg.textContent = "A calm carriage. For now.";
    waveBtn.textContent = "Start wave 1";
    waveBtn.disabled = false;
  } else if (phase === "intermission") {
    const bonus = Math.ceil(interLeft) * 3;
    waveMsg.textContent = `Wave ${state.wave + 1} in ${Math.ceil(interLeft)}s`;
    waveBtn.textContent = `Start now · +💰${bonus}`;
    waveBtn.disabled = false;
  } else if (phase === "wave") {
    waveBtn.disabled = true;
    const left = queue.length + bores.length;
    waveMsg.textContent = `Wave ${state.wave + 1} — ${left} left${paused ? " (paused)" : ""}`;
  }
}

waveBtn.addEventListener("click", () => {
  if (phase === "pre") startWave();
  else if (phase === "intermission") startNow(Math.ceil(interLeft) * 3);
});

/* ---------------- stats / HUD ---------------- */

function updateStats() {
  statMoney.textContent = fmt(state.money);
  statSanity.textContent = state.sanity;
  statSanity.parentElement.classList.toggle("hurt", state.sanity <= 3);
  seat.classList.toggle("critical", state.sanity <= 3);
  renderShop();                      // affordability follows the money, killer by killer
}

/* ---------------- golden snack ---------------- */

function goldenTick(dt) {
  if (phase !== "wave" && phase !== "intermission") return;
  goldenT -= dt;
  if (goldenT > 0) return;
  goldenT = rnd(20, 34);
  if (!snackEl.hidden) return;
  const n = state.wave + 1;
  const bonus = 6 + 3 * n + Math.floor(rnd(0, 3)) * n;
  snackEl.style.left = rnd(8, 78) + "%";
  snackEl.style.top = rnd(8, 30) + "%";
  snackEl.hidden = false;
  snackEl.classList.remove("opened");
  snackEl.dataset.bonus = String(bonus);
  setTimeout(() => { snackEl.hidden = true; }, 4200);
}
snackEl.addEventListener("pointerdown", () => {
  if (snackEl.hidden) return;
  const bonus = +snackEl.dataset.bonus || 5;
  state.money += bonus;
  snackEl.hidden = true;
  Audio.goldenSnack();
  updateStats();
  floatyAt(SLOTS / 2, `+💰${bonus} unexpected snack`, "cash");
  save();
});

/* ---------------- tick / loop ---------------- */

function waveTick(dt) {
  // spawn
  spawnT -= dt;
  if (queue.length && spawnT <= 0) {
    spawnT = clamp(1.1 - 0.03 * state.wave, 0.55, 1.1);
    spawnBore(queue.shift(), state.wave + 1);
  }
  // move
  for (let i = bores.length - 1; i >= 0; i--) {
    const b = bores[i];
    if (b.dead) continue;
    b.slow = slowForBore(b);
    b.el.classList.toggle("slowed", b.slow > 0);
    b.pos += BASE_SPEED * b.mul * (1 - b.slow) * dt;
    if (b.pos >= SLOTS + 0.3) {
      b.el.remove();
      bores.splice(i, 1);
      leak(b);
      continue;
    }
    layoutBore(b);
  }
  dpsTick(dt);
  if (tapCd > 0) tapCd -= dt;
  sweepDead();
  if (phase === "wave" && !queue.length && !bores.length) endWave();
}

let last = performance.now();
function loop(now) {
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  dt *= speedMul;
  if (!paused && phase !== "over") {
    if (phase === "intermission") {
      interLeft -= dt;
      dpsTick(0); // aura still shows on nothing; harmless
      if (interLeft <= 0) { startWave(); updateWaveUI(); }
      goldenTick(dt);
      updateWaveUI();
    } else if (phase === "wave") {
      waveTick(dt);
      goldenTick(dt);
      updateWaveUI();
    }
  }
  requestAnimationFrame(loop);
}

/* ---------------- controls ---------------- */

$("btn-speed").addEventListener("click", (e) => {
  speedMul = speedMul === 1 ? 2 : 1;
  e.currentTarget.textContent = `×${speedMul}`;
  last = performance.now();
});
$("btn-pause").addEventListener("click", (e) => {
  paused = !paused;
  e.currentTarget.textContent = paused ? "▶" : "⏸";
  lane.classList.toggle("paused-view", paused);
  if (!paused) last = performance.now();
});

$("btn-help").addEventListener("click", showHowTo);
const audioDialog = $("audiosettings");
const audioMuteBtn = $("btn-audio-mute");
const audioCloseBtn = $("btn-audio-close");

function refreshAudioLabels() {
  $("val-master").textContent = Math.round(Audio.master * 100) + "%";
  $("val-music").textContent = Math.round(Audio.music * 100) + "%";
  $("val-sfx").textContent = Math.round(Audio.sfx * 100) + "%";
  audioMuteBtn.textContent = Audio.muted ? "🔇" : "🔊";
  audioMuteBtn.title = Audio.muted ? "Unmute all" : "Mute all";
}

$("btn-mute").addEventListener("click", () => {
  Audio.uiClick();
  refreshAudioLabels();
  audioDialog.showModal();
});

audioCloseBtn.addEventListener("click", () => audioDialog.close());

$("slider-master").addEventListener("input", (e) => {
  Audio.setMaster(e.target.valueAsNumber / 100);
  refreshAudioLabels();
});
$("slider-music").addEventListener("input", (e) => {
  Audio.setMusic(e.target.valueAsNumber / 100);
  refreshAudioLabels();
});
$("slider-sfx").addEventListener("input", (e) => {
  Audio.setSfx(e.target.valueAsNumber / 100);
  refreshAudioLabels();
});
audioMuteBtn.addEventListener("click", () => {
  Audio.toggle();
  refreshAudioLabels();
});

/* unlock audio context on first gesture (iOS requirement) */
let audioUnlocked = false;
document.addEventListener(
  "pointerdown",
  () => {
    if (!audioUnlocked) {
      audioUnlocked = true;
      Audio.init();
    }
  },
  { once: true }
);

/* ---------------- modals ---------------- */

function modalHTML(html) {
  modal.innerHTML = html;
  if (!modal.open) modal.showModal();
  modal.querySelectorAll("[data-close]").forEach((b) =>
    b.addEventListener("click", () => modal.close()));
}

function showHowTo() {
  modalHTML(`
    <h2>The 8:15 is late. Again.</h2>
    <p>Boredom is incoming, one bore at a time, straight down the aisle toward <b>your seat 🧍</b>.
       It touches your seat, you lose 🧠 sanity. Out of sanity and the commute is lost.</p>
    <ul>
      <li>Buy a defence below, then tap an empty seat space to place it.</li>
      <li>Tap a placed defence to upgrade or sell it.</li>
      <li>Tap a bore directly to <b>shush</b> it (tiny damage, works always).</li>
      <li>Survive a wave → cash. Start the next wave early for a bonus.</li>
      <li>🧁 appears once in a while. Eat it. Free money.</li>
    </ul>
    <button class="btn" data-close>Let them come</button>`);
}

function showGameOver() {
  modalHTML(`
    <h2>The commute is lost. 🐑</h2>
    <div class="stats-row">
      <span class="pill">🚂 waves cleared <b>${state.wave}</b></span>
      <span class="pill">📱 bores removed <b>${fmt(state.kills)}</b></span>
      <span class="pill">🏆 best run <b>${bestWave}</b></span>
    </div>
    <p>Sanity reached zero. The track went quiet.</p>
    <button class="btn" id="btn-again">Take the 8:15 again</button>
    <button class="btn ghost" data-close>Close</button>`);
  $("btn-again").addEventListener("click", () => {
    modal.close();
    resetRun();
  });
}

/* ---------------- boot / reset ---------------- */

function resetRun() {
  for (const b of bores) b.el.remove();
  bores = [];
  queue = [];
  state = freshState();
  phase = "pre";
  selectedKind = null;
  selectedSlotClose();
  localStorage.removeItem(LS_SAVE);
  renderSlots();
  renderShop();
  updateStats();
  updateWaveUI();
}

function save() {
  if (phase === "wave") return;             // mid-wave state is never saved
  if (phase === "over") return;
  state.selKind = selectedKind;
  state.selKind = undefined;
  localStorage.setItem(LS_SAVE, JSON.stringify(state));
}

function restore() {
  if (!loadSave()) return false;
  if (state.wave <= 0 && state.kills === 0 && state.money === START_MONEY) return false;
  phase = state.wave > 0 ? "intermission" : "pre";
  interLeft = 12;
  return true;
}

function boot() {
  buildShop();
  measure();
  const restored = restore();
  renderSlots();
  renderShop();
  updateStats();
  updateWaveUI();
  if (!localStorage.getItem(LS_SEEN)) {
    localStorage.setItem(LS_SEEN, "1");
    showHowTo();
  }
  if (restored && !modal.open) showWaveToast();
  requestAnimationFrame(loop);
}

function showWaveToast() {
  waveMsg.textContent = `Resumed at wave ${state.wave + 1}. Take your time.`;
}

/* save on hide too */
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") save();
});
addEventListener("pagehide", save);

/* service worker — silent if not https/localhost */
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

window.DDF = { get state() { return state; }, get bores() { return bores; } };

boot();
