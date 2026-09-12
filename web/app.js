const COLS = 10;
const ROWS = 20;
const PIECES = {
  I: { cells: [[0, 1], [1, 1], [2, 1], [3, 1]], color: "#67e8f9" },
  O: { cells: [[1, 0], [2, 0], [1, 1], [2, 1]], color: "#fde047" },
  T: { cells: [[1, 0], [0, 1], [1, 1], [2, 1]], color: "#c084fc" },
  S: { cells: [[1, 0], [2, 0], [0, 1], [1, 1]], color: "#4ade80" },
  Z: { cells: [[0, 0], [1, 0], [1, 1], [2, 1]], color: "#fb7185" },
  J: { cells: [[0, 0], [0, 1], [1, 1], [2, 1]], color: "#60a5fa" },
  L: { cells: [[2, 0], [0, 1], [1, 1], [2, 1]], color: "#fb923c" },
};
const BAG = Object.keys(PIECES);
const REGION_COLOR = {
  optic: "#c084fc",
  central: "#4ade80",
  descending: "#fbbf24",
  vnc: "#38bdf8",
};
const ROLE_LABEL = {
  photoreceptor: "фоторецепторы",
  lamina: "ламина",
  lamina_feedback: "ламина feedback",
  medulla: "медулла",
  medulla_inhibit: "торможение медуллы",
  motion: "детектор движения",
  object: "объектные LC",
  frontal_vpn: "фронтальный VPN",
  vpn: "VPN",
  relay: "релей",
  inhibit_steer: "торможение руления",
  integrate: "центральный интегратор",
  steer_left: "DN → влево",
  steer_right: "DN → вправо",
  rotate: "DN → поворот",
  steer_mod: "модуляция руления",
  leg_inter: "интернейрон ног",
  drop: "моторный дроп",
};
const RASTER_COLS = 64;
const PIPELINE = [
  { id: "photo", label: "фото", full: "R1–R6", color: "#e9d5ff", x: 0.05, hint: "фоторецепторы: пиксели доски → R1–R6" },
  { id: "lamina", label: "lam", full: "ламина", color: "#d8b4fe", x: 0.1, hint: "ламина L1–L3: локальный контраст по колонкам" },
  { id: "medulla", label: "med", full: "медулла", color: "#c084fc", x: 0.16, hint: "медулла Mi/Tm: движение и ориентация фигуры" },
  { id: "lobula", label: "lob", full: "lobula/LP", color: "#a78bfa", x: 0.23, hint: "lobula / LP: объект стека и текущей фигуры" },
  { id: "vpn", label: "VPN", full: "VPN", color: "#818cf8", x: 0.3, hint: "VPN (LoVP92…): проекция из optic lobe в центр" },
  { id: "central", label: "центр", full: "AOTU/LAL/VES", color: "#4ade80", x: 0.5, hint: "центр AOTU/LAL/VES: интеграция L/R, руление" },
  { id: "dn", label: "DN", full: "descending", color: "#fbbf24", x: 0.5, hint: "DN (DNg13, DNa02…): решение сдвиг / поворот" },
  { id: "vnc", label: "VNC", full: "VNC", color: "#38bdf8", x: 0.5, hint: "VNC: моторные интернейроны (дроп и т.п.)" },
  { id: "action", label: "act", full: "действие", color: "#fb923c", x: 0.5, hint: "act: видимый ход на доске" },
];
const PIPE_HINT_DEFAULT = "клик по стадии — фильтр узлов / связей / растра · «?» ниже — что делает каждая стадия";

const boardCanvas = document.getElementById("board");
const nextCanvas = document.getElementById("next");
const holdCanvas = document.getElementById("hold");
const brainCanvas = document.getElementById("brain");
const neuropilCanvas = document.getElementById("neuropil3d");
const rasterCanvas = document.getElementById("raster");
const brainTip = document.getElementById("brain-tip");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlay-title");
const pipelineEl = document.getElementById("pipeline");
const processEl = document.getElementById("process");
const eventLogEl = document.getElementById("event-log");
const waveBadge = document.getElementById("wave-badge");
const filterBadge = document.getElementById("filter-badge");
const trailBadge = document.getElementById("trail-badge");
const pipeHint = document.getElementById("pipe-hint");
const btnPause = document.getElementById("btn-pause");
const btnActiveOnly = document.getElementById("btn-active-only");
const speedInput = document.getElementById("speed");
const speedVal = document.getElementById("speed-val");
const brainWrap = document.querySelector(".brain-wrap");
const ACTIVE_THRESHOLD = 0.32;
const TRAIL_LIFE_MS = 1600;

const EXPLORER_BASE = "https://reiserlab.github.io/celltype-explorer-drosophila-male-cns/";
const CODEX_BASE = "https://codex.flywire.ai/";
const NT_RGB = {
  ACh: "74,222,128",
  GABA: "251,113,133",
  Glu: "244,114,182",
  His: "167,139,250",
  OA: "251,191,36",
  DA: "56,189,248",
  "5HT": "249,168,212",
  unk: "148,163,184",
  unc: "148,163,184",
};

const state = {
  grid: emptyGrid(),
  bag: [],
  current: null,
  next: null,
  hold: null,
  canHold: true,
  score: 0,
  lines: 0,
  level: 1,
  dropMs: 780,
  baseDropMs: 780,
  speed: 1,
  brainAcc: 0,
  acc: 0,
  last: 0,
  paused: false,
  over: false,
  started: false,
  brainMode: true,
  brainCooldown: 0,
  circuit: null,
  activity: {},
  spikes: {},
  raster: [],
  thought: "ждёт зрительный вход…",
  lastAction: "",
  hoverId: null,
  edgeIndex: {},
  particles: [],
  decisionMarks: [],
  popAvg: { optic: 0, central: 0, descending: 0, vnc: 0 },
  stageAct: Object.fromEntries(PIPELINE.map((s) => [s.id, { mean: 0, left: 0, right: 0, peakAt: 0 }])),
  stageNodes: {},
  stageFilter: null,
  activeOnly: false,
  decisionTrail: null,
  viewMode: "3d",
  view3d: {
    yaw: 0.45,
    pitch: 0.55,
    zoom: 1,
    dragging: false,
    lastX: 0,
    lastY: 0,
    moved: false,
  },
  wavePos: 0,
  waveStage: "photo",
  waveKick: 0,
  eventLog: [],
  processInfo: null,
  synBurstCooldown: 0,
  lastPeakStage: null,
  tipPinned: false,
  dataset: "male-cns",
  circuits: {},
  sexPlay: "male",
  pathwayId: null,
  pathwayNodeSet: null,
  showColumns: false,
  ntColor: true,
  rateMode: false,
  rateWorker: null,
  rateSynOps: 0,
  compareData: null,
  ntPalette: null,
};

function emptyGrid() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function effectiveDropMs() {
  return Math.max(40, Math.round(state.baseDropMs / Math.max(0.2, state.speed)));
}

function brainStepMs() {
  return Math.max(8, 16 / Math.max(0.25, state.speed));
}

function codexDataset() {
  return state.circuit?.source?.codex_dataset || state.dataset || "male-cns";
}

function catalogUrls(node) {
  const type = node?.type || "";
  if (!type) return null;
  const src = state.circuit?.source || {};
  const ds = encodeURIComponent(codexDataset());
  const explorerRoot = (src.explorer || EXPLORER_BASE).replace(/\/?$/, "/");
  const typePath = encodeURIComponent(type);
  const explorer = `${explorerRoot}types/${typePath}.html`;
  const sideType = node.side && node.side !== "B" ? `${type}_${node.side}` : null;
  const explorerSide = sideType ? `${explorerRoot}types/${encodeURIComponent(sideType)}.html` : null;
  const q = encodeURIComponent(type);
  const codexApp = `${CODEX_BASE}app/search?dataset=${ds}&filter_string=${q}`;
  const flywire = `${CODEX_BASE}app/search?dataset=${ds}&filter_string=${encodeURIComponent(`type:${type}`)}`;
  const ng = src.neuroglancer || null;
  const body = (node.body_ids && node.body_ids[0]) || null;
  const neuroglancer = body && ng
    ? `${String(ng)}${String(ng).includes("?") ? "&" : "?"}body=${encodeURIComponent(body)}`
    : ng;
  return { explorer, explorerSide, codex: codexApp, flywire, neuroglancer, type, dataset: ds };
}

function edgeRgb(e) {
  if (state.ntColor && e?.nt && NT_RGB[e.nt]) return NT_RGB[e.nt];
  return e?.sign < 0 ? "251,113,133" : "125,211,252";
}

function effectiveEdges() {
  const c = state.circuit;
  if (!c?.edges) return [];
  const female = state.circuits.fafb;
  if (state.sexPlay === "male" || !female?.edges) return c.edges;
  const fMap = Object.fromEntries(female.edges.map((e) => [`${e.pre}|${e.post}`, e]));
  return c.edges.map((e) => {
    const fe = fMap[`${e.pre}|${e.post}`];
    if (!fe) return e;
    if (state.sexPlay === "female") return { ...e, weight: fe.weight, nt: fe.nt || e.nt, sign: fe.sign ?? e.sign };
    return { ...e, weight: Math.round((e.weight + fe.weight) / 2) };
  });
}

function inPathway(node) {
  if (!state.pathwayNodeSet) return true;
  return state.pathwayNodeSet.has(node.id);
}

function matchesStageFilter(node) {
  if (!state.stageFilter) return true;
  if (state.stageFilter === "action") {
    return node.region === "descending" || node.region === "vnc" || node.role === "drop" || node.role === "rotate";
  }
  return stageOf(node) === state.stageFilter;
}

function edgeMatchesFilter(edge) {
  if (!state.stageFilter) return true;
  const c = state.circuit;
  if (!c) return true;
  if (!state._nodeById) {
    state._nodeById = Object.fromEntries((c.nodes || []).map((n) => [n.id, n]));
  }
  const pre = state._nodeById[edge.pre];
  const post = state._nodeById[edge.post];
  return (pre && matchesStageFilter(pre)) || (post && matchesStageFilter(post));
}

function isTrailNode(id) {
  return !!(state.decisionTrail?.nodeSet && state.decisionTrail.nodeSet.has(id));
}

function isNodeHot(node) {
  if (!node) return false;
  if (state.hoverId === node.id || state.spikes[node.id] || isTrailNode(node.id)) return true;
  return (state.activity[node.id] || 0) >= ACTIVE_THRESHOLD;
}

/** full | ghost | hide — stage filter + «только активные» + pathway */
function nodeVizMode(node) {
  if (!inPathway(node)) return state.pathwayNodeSet ? "ghost" : "full";
  const inStage = matchesStageFilter(node);
  if (state.stageFilter && !inStage) return "ghost";
  if (state.activeOnly && !isNodeHot(node)) return state.stageFilter ? "hide" : "ghost";
  return "full";
}

function edgeVizMode(preNode, postNode, flow) {
  const inStage =
    !state.stageFilter ||
    (preNode && matchesStageFilter(preNode)) ||
    (postNode && matchesStageFilter(postNode));
  if (state.stageFilter && !inStage) return "ghost";
  if (state.activeOnly) {
    const hot =
      flow >= ACTIVE_THRESHOLD * 0.55 ||
      (preNode && isNodeHot(preNode)) ||
      (postNode && isNodeHot(postNode)) ||
      isTrailNode(preNode?.id) ||
      isTrailNode(postNode?.id);
    if (!hot) return state.stageFilter ? "hide" : "ghost";
  }
  return "full";
}

function getDecisionTrail(t) {
  const tr = state.decisionTrail;
  if (!tr) return null;
  // rAF `t` is the frame timestamp; trail.t0 uses performance.now() set mid-frame
  // during stepBrain, so t can briefly lag t0. Clamp so age never goes negative
  // (negative Math.floor indices crash drawDecisionTrail* and kill the game loop).
  const now = Number.isFinite(t) ? t : performance.now();
  const age = Math.max(0, (now - tr.t0) / tr.life);
  if (age >= 1) {
    if (state.decisionTrail === tr) clearDecisionTrailUi();
    state.decisionTrail = null;
    return null;
  }
  return { ...tr, age, glow: 1 - age };
}

function clearDecisionTrailUi() {
  if (trailBadge) trailBadge.classList.add("hidden");
  if (pipelineEl) {
    for (const el of pipelineEl.querySelectorAll(".pipe-stage.on-trail")) {
      el.classList.remove("on-trail");
    }
  }
}

function startDecisionTrail(action) {
  const c = state.circuit;
  if (!c || !action || action.includes("рестарт")) return;

  let kind = "left";
  let side = "L";
  let color = "#4ade80";
  if (/поворот/.test(action)) {
    kind = "rotate";
    side = "B";
    color = "#fbbf24";
  } else if (/дроп/.test(action)) {
    kind = "drop";
    side = "B";
    color = "#38bdf8";
  } else if (/\(R\)|вправо/.test(action)) {
    kind = "right";
    side = "R";
    color = "#c084fc";
  }

  const byId = state._nodeById || Object.fromEntries((c.nodes || []).map((n) => [n.id, n]));
  const pick = (ids) => ids.filter((id) => byId[id]);

  let nodeIds;
  if (kind === "left") {
    nodeIds = pick([
      "R1-R6_L", "L1_L", "Mi1_L", "T4a_L", "LC10a_L", "LoVP92_L", "AOTU019_L", "DNg13_L", "IN17A025_L",
    ]);
  } else if (kind === "right") {
    nodeIds = pick([
      "R1-R6_R", "L1_R", "Mi1_R", "T4a_R", "LC10a_R", "LoVP92_R", "AOTU019_R", "DNg13_R", "IN17A025_R",
    ]);
  } else if (kind === "rotate") {
    nodeIds = pick([
      "R1-R6_L", "L1_L", "Mi1_L", "T4a_L", "LoVP92_L", "AOTU019_L",
      "R1-R6_R", "L1_R", "Mi1_R", "T4b_R", "LoVP92_R", "AOTU019_R",
      "DNa02",
    ]);
  } else {
    nodeIds = pick([
      "R1-R6_L", "L1_L", "Mi1_L", "LoVP92_L", "AOTU019_L", "DNg13_L",
      "R1-R6_R", "L1_R", "Mi1_R", "LoVP92_R", "AOTU019_R", "DNg13_R",
      "IN17A025_L", "IN17A025_R",
    ]);
  }

  const stageIds =
    kind === "drop"
      ? ["photo", "lamina", "medulla", "lobula", "vpn", "central", "dn", "vnc", "action"]
      : ["photo", "lamina", "medulla", "lobula", "vpn", "central", "dn", "action"];

  state.decisionTrail = {
    t0: performance.now(),
    life: TRAIL_LIFE_MS,
    label: action.split("→")[0].trim(),
    full: action,
    kind,
    side,
    color,
    nodeIds,
    nodeSet: new Set(nodeIds),
    stageIds,
  };

  if (trailBadge) {
    trailBadge.textContent = `след: ${action}`;
    trailBadge.classList.remove("hidden");
  }
  if (pipelineEl) {
    for (const el of pipelineEl.querySelectorAll(".pipe-stage")) {
      el.classList.toggle("on-trail", stageIds.includes(el.dataset.stage));
    }
  }
}

function setStageFilter(stageId) {
  if (stageId && state.stageFilter === stageId) state.stageFilter = null;
  else state.stageFilter = stageId || null;
  applyStageFilterUi();
}

function setActiveOnly(on) {
  state.activeOnly = !!on;
  applyStageFilterUi();
}

function toggleActiveOnly() {
  setActiveOnly(!state.activeOnly);
}

function applyStageFilterUi() {
  const f = state.stageFilter;
  const ao = state.activeOnly;
  if (pipelineEl) {
    pipelineEl.classList.toggle("is-filtering", !!f);
    for (const el of pipelineEl.querySelectorAll(".pipe-stage")) {
      const id = el.dataset.stage;
      el.classList.toggle("filtered", f === id);
      el.classList.toggle("dimmed", !!f && f !== id);
    }
  }
  const allBtn = document.getElementById("btn-filter-all");
  if (allBtn) allBtn.classList.toggle("on", !f);
  btnActiveOnly?.classList.toggle("on", ao);
  if (filterBadge) {
    if (f || ao) {
      const parts = [];
      if (f) {
        const st = PIPELINE.find((s) => s.id === f);
        parts.push(st?.full || f);
      }
      if (ao) parts.push("только активные");
      filterBadge.textContent = `фильтр: ${parts.join(" · ")}`;
      filterBadge.classList.toggle("has-active", ao);
      filterBadge.classList.remove("hidden");
    } else {
      filterBadge.classList.add("hidden");
      filterBadge.classList.remove("has-active");
    }
  }
  if (pipeHint) {
    pipeHint.classList.toggle("is-filtered", !!f || ao);
    if (f && ao) {
      pipeHint.textContent = `фильтр «${PIPELINE.find((s) => s.id === f)?.full || f}» + только активные`;
    } else if (f) {
      pipeHint.textContent = `фильтр «${PIPELINE.find((s) => s.id === f)?.full || f}» — клик ещё раз или «Все»`;
    } else if (ao) {
      pipeHint.textContent = "только активные — тихие узлы и связи приглушены";
    } else {
      pipeHint.textContent = PIPE_HINT_DEFAULT;
    }
  }
  if (brainWrap) {
    brainWrap.classList.toggle("is-filtered", !!f);
    brainWrap.classList.toggle("is-active-only", ao);
  }
}

function setPaused(paused) {
  if (state.over) return;
  if (!state.started) {
    startGame();
    return;
  }
  state.paused = !!paused;
  overlayTitle.textContent = state.paused ? "пауза" : "";
  overlay.classList.toggle("hidden", !state.paused);
  if (btnPause) {
    btnPause.textContent = state.paused ? "Продолжить" : "Пауза";
    btnPause.classList.toggle("is-paused", state.paused);
  }
}

function togglePause() {
  if (!state.started) {
    startGame();
    return;
  }
  if (state.over) return;
  setPaused(!state.paused);
}

function setViewMode(mode) {
  state.viewMode = mode === "2d" ? "2d" : "3d";
  const is3d = state.viewMode === "3d";
  if (brainCanvas) brainCanvas.classList.toggle("hidden", is3d);
  if (neuropilCanvas) neuropilCanvas.classList.toggle("hidden", !is3d);
  document.getElementById("btn-view-3d")?.classList.toggle("on", is3d);
  document.getElementById("btn-view-2d")?.classList.toggle("on", !is3d);
}

function setSpeed(v) {
  state.speed = Math.max(0.25, Math.min(2.5, Number(v) || 1));
  state.dropMs = effectiveDropMs();
  if (speedVal) speedVal.textContent = `${state.speed.toFixed(2)}×`;
  if (speedInput && Math.abs(Number(speedInput.value) - state.speed) > 0.001) {
    speedInput.value = String(state.speed);
  }
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function takePiece() {
  if (state.bag.length === 0) state.bag = shuffle(BAG);
  const type = state.bag.pop();
  return { type, rot: 0, x: 3, y: 0 };
}

function rotateCells(cells, times) {
  let out = cells.map(([x, y]) => [x, y]);
  for (let t = 0; t < ((times % 4) + 4) % 4; t++) {
    const maxX = Math.max(...out.map((c) => c[0]));
    out = out.map(([x, y]) => [y, maxX - x]);
  }
  return out;
}

function pieceCells(p) {
  return rotateCells(PIECES[p.type].cells, p.rot).map(([x, y]) => [p.x + x, p.y + y]);
}

function valid(p, grid = state.grid) {
  return pieceCells(p).every(([x, y]) => x >= 0 && x < COLS && y < ROWS && (y < 0 || !grid[y][x]));
}

function merge(p) {
  for (const [x, y] of pieceCells(p)) {
    if (y >= 0) state.grid[y][x] = p.type;
  }
}

function clearLines() {
  let n = 0;
  state.grid = state.grid.filter((row) => {
    const full = row.every(Boolean);
    if (full) n += 1;
    return !full;
  });
  while (state.grid.length < ROWS) state.grid.unshift(Array(COLS).fill(null));
  if (n) {
    const pts = [0, 100, 300, 500, 800][n] * state.level;
    state.score += pts;
    state.lines += n;
    state.level = 1 + Math.floor(state.lines / 10);
    state.baseDropMs = Math.max(90, 780 - (state.level - 1) * 55);
    state.dropMs = effectiveDropMs();
  }
}

function spawn() {
  state.current = state.next || takePiece();
  state.next = takePiece();
  state.canHold = true;
  if (!valid(state.current)) {
    state.over = true;
    state.paused = true;
    overlayTitle.textContent = "конец игры";
    overlay.classList.remove("hidden");
  }
}

function hardDrop() {
  if (!state.current) return;
  while (valid({ ...state.current, y: state.current.y + 1 })) state.current.y += 1;
  lockPiece();
}

function lockPiece() {
  merge(state.current);
  clearLines();
  spawn();
  updateHud();
}

function hold() {
  if (!state.canHold || !state.current) return;
  const cur = state.current.type;
  if (state.hold) {
    state.current = { type: state.hold, rot: 0, x: 3, y: 0 };
    state.hold = cur;
  } else {
    state.hold = cur;
    spawn();
    return;
  }
  state.canHold = false;
  if (!valid(state.current)) state.current.x = 2;
}

function move(dx, dy) {
  if (!state.current) return false;
  const n = { ...state.current, x: state.current.x + dx, y: state.current.y + dy };
  if (valid(n)) {
    state.current = n;
    return true;
  }
  return false;
}

function rotate(dir = 1) {
  if (!state.current) return false;
  const n = { ...state.current, rot: state.current.rot + dir };
  const kicks = [0, -1, 1, -2, 2];
  for (const k of kicks) {
    const t = { ...n, x: n.x + k };
    if (valid(t)) {
      state.current = t;
      return true;
    }
  }
  return false;
}

function ghostY() {
  if (!state.current) return 0;
  const g = { ...state.current };
  while (valid({ ...g, y: g.y + 1 })) g.y += 1;
  return g.y;
}

function drawMini(canvas, type) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!type) return;
  const cells = PIECES[type].cells;
  const color = PIECES[type].color;
  const s = 22;
  const xs = cells.map((c) => c[0]);
  const ys = cells.map((c) => c[1]);
  const ox = (canvas.width - (Math.max(...xs) + 1) * s) / 2;
  const oy = (canvas.height - (Math.max(...ys) + 1) * s) / 2;
  for (const [x, y] of cells) {
    roundCell(ctx, ox + x * s, oy + y * s, s - 2, color, 1);
  }
}

function roundCell(ctx, x, y, s, color, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  const r = 5;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + s, y, x + s, y + s, r);
  ctx.arcTo(x + s, y + s, x, y + s, r);
  ctx.arcTo(x, y + s, x, y, r);
  ctx.arcTo(x, y, x + s, y, r);
  ctx.fill();
  ctx.restore();
}

function drawBoard() {
  const ctx = boardCanvas.getContext("2d");
  const w = boardCanvas.width;
  const h = boardCanvas.height;
  const cw = w / COLS;
  const ch = h / ROWS;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#070a12";
  ctx.fillRect(0, 0, w, h);
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      ctx.fillStyle = (x + y) % 2 ? "#0c111c" : "#0a0e18";
      ctx.fillRect(x * cw + 1, y * ch + 1, cw - 2, ch - 2);
    }
  }
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const t = state.grid[y][x];
      if (t) roundCell(ctx, x * cw + 2, y * ch + 2, cw - 4, PIECES[t].color, 0.92);
    }
  }
  if (state.current) {
    const gy = ghostY();
    for (const [x, y] of pieceCells({ ...state.current, y: gy })) {
      if (y >= 0) roundCell(ctx, x * cw + 2, y * ch + 2, cw - 4, PIECES[state.current.type].color, 0.16);
    }
    for (const [x, y] of pieceCells(state.current)) {
      if (y >= 0) roundCell(ctx, x * cw + 2, y * ch + 2, cw - 4, PIECES[state.current.type].color, 1);
    }
  }
}

function updateHud() {
  document.getElementById("score").textContent = String(state.score);
  document.getElementById("lines").textContent = String(state.lines);
  document.getElementById("level").textContent = String(state.level);
  drawMini(nextCanvas, state.next?.type);
  drawMini(holdCanvas, state.hold);
}

function columnHeights(grid) {
  const h = Array(COLS).fill(0);
  for (let x = 0; x < COLS; x++) {
    for (let y = 0; y < ROWS; y++) {
      if (grid[y][x]) {
        h[x] = ROWS - y;
        break;
      }
    }
  }
  return h;
}

function evaluateGrid(grid) {
  const heights = columnHeights(grid);
  let holes = 0;
  let bump = 0;
  let lines = 0;
  for (let x = 0; x < COLS; x++) {
    let seen = false;
    for (let y = 0; y < ROWS; y++) {
      if (grid[y][x]) seen = true;
      else if (seen) holes += 1;
    }
    if (x) bump += Math.abs(heights[x] - heights[x - 1]);
  }
  for (const row of grid) if (row.every(Boolean)) lines += 1;
  const agg = heights.reduce((a, b) => a + b, 0);
  return lines * 760 - holes * 380 - agg * 18 - bump * 22;
}

function cloneGrid(grid) {
  return grid.map((r) => r.slice());
}

function bestPlacement() {
  if (!state.current) return null;
  let best = null;
  for (let rot = 0; rot < 4; rot++) {
    for (let x = -2; x < COLS; x++) {
      const p = { type: state.current.type, rot, x, y: 0 };
      if (!valid(p)) continue;
      const drop = { ...p };
      while (valid({ ...drop, y: drop.y + 1 })) drop.y += 1;
      const g = cloneGrid(state.grid);
      for (const [cx, cy] of pieceCells(drop)) if (cy >= 0) g[cy][cx] = drop.type;
      const score = evaluateGrid(g);
      if (!best || score > best.score) best = { rot, x, score };
    }
  }
  return best;
}

function sensoryDrive() {
  const drive = {
    visualL: 0.12,
    visualR: 0.12,
    steerLeft: 0.05,
    steerRight: 0.05,
    needRotate: 0.05,
    needDrop: 0.08,
  };
  const heights = columnHeights(state.grid);
  // Visual field = stack silhouette + falling piece position (NOT steer intent).
  // Steer intent is injected into excitatory DN/integrator paths separately so
  // VES200m ipsilateral inhibition does not invert left/right decisions.
  const leftStack = heights.slice(0, 5).reduce((a, b) => a + b, 0) / (5 * ROWS);
  const rightStack = heights.slice(5).reduce((a, b) => a + b, 0) / (5 * ROWS);
  let pieceL = 0.12;
  let pieceR = 0.12;
  if (state.current) {
    const cells = pieceCells(state.current);
    pieceL = cells.filter(([x]) => x < 5).length / 4;
    pieceR = cells.filter(([x]) => x >= 5).length / 4;
    const best = bestPlacement();
    if (best) {
      const dx = best.x - state.current.x;
      if (dx < 0) drive.steerLeft = Math.min(1, 0.35 + (-dx / COLS) * 2.8);
      else if (dx > 0) drive.steerRight = Math.min(1, 0.35 + (dx / COLS) * 2.8);
      else {
        drive.steerLeft = 0.08;
        drive.steerRight = 0.08;
      }
      const curRot = ((state.current.rot % 4) + 4) % 4;
      if (best.rot !== curRot) drive.needRotate = 0.9;
      else drive.needRotate = 0.05;
      if (best.x === state.current.x && best.rot === curRot) drive.needDrop = 0.85;
      else drive.needDrop = 0.08;
    }
  }
  drive.visualL = Math.min(1, 0.1 + leftStack * 0.85 + pieceL * 0.7);
  drive.visualR = Math.min(1, 0.1 + rightStack * 0.85 + pieceR * 0.7);
  return drive;
}

function inboundSynapses(nodeId) {
  return state.edgeIndex.in[nodeId] || [];
}

function outboundSynapses(nodeId) {
  return state.edgeIndex.out[nodeId] || [];
}

function indexEdges(circuit) {
  const edgeIndex = { in: {}, out: {} };
  for (const e of circuit.edges || []) {
    (edgeIndex.out[e.pre] ||= []).push(e);
    (edgeIndex.in[e.post] ||= []).push(e);
  }
  state.edgeIndex = edgeIndex;
  state._nodeById = Object.fromEntries((circuit.nodes || []).map((n) => [n.id, n]));
}

function stageOf(node) {
  if (node.role === "photoreceptor") return "photo";
  if (node.layer === "lamina") return "lamina";
  if (node.layer === "medulla") return "medulla";
  if (node.role === "vpn" || node.role === "frontal_vpn") return "vpn";
  if (node.layer === "lobula" || node.layer === "lobula_plate") return "lobula";
  if (node.region === "central") return "central";
  if (node.region === "descending") return "dn";
  if (node.region === "vnc") return "vnc";
  return null;
}

function indexStages(circuit) {
  const map = Object.fromEntries(PIPELINE.map((s) => [s.id, []]));
  for (const n of circuit.nodes || []) {
    const s = stageOf(n);
    if (s && map[s]) map[s].push(n);
  }
  state.stageNodes = map;
}

function pushEvent(kind, text) {
  const now = performance.now();
  const last = state.eventLog[0];
  if (last && last.kind === kind && last.text === text && now - last.t < 420) return;
  state.eventLog.unshift({ t: now, kind, text });
  if (state.eventLog.length > 14) state.eventLog.pop();
  renderEventLog();
}

function renderEventLog() {
  if (!eventLogEl) return;
  if (!state.eventLog.length) {
    eventLogEl.innerHTML = `<div class="empty">сигналы появятся после старта…</div>`;
    return;
  }
  const t0 = state.eventLog[0].t;
  eventLogEl.innerHTML = state.eventLog
    .slice(0, 10)
    .map((ev) => {
      const sec = ((ev.t - t0) / 1000).toFixed(1);
      return `<div class="ev"><span class="t">${sec}s</span><span class="kind ${ev.kind}">${ev.kind === "inhibit" ? "inh" : ev.kind === "synapse" ? "exc" : ev.kind === "decision" ? "act" : "wave"}</span><span>${ev.text}</span></div>`;
    })
    .join("");
}

function buildPipelineDom() {
  if (!pipelineEl) return;
  pipelineEl.innerHTML = PIPELINE.map(
    (s, i) => `
    <div class="pipe-stage" data-stage="${s.id}" style="--stage:${s.color}" role="button" tabindex="0" title="${s.hint} · клик — фильтр «${s.full}»">
      <div class="bar-wrap">
        <div class="bar l" id="pipe-${s.id}-l"></div>
        <div class="bar r" id="pipe-${s.id}-r"></div>
      </div>
      <div class="name">${s.label}</div>
      <div class="val" id="pipe-${s.id}-v">0.00</div>
      <div class="lat" id="pipe-${s.id}-lat">—</div>
      ${i < PIPELINE.length - 1 ? '<span class="pipe-arrow">→</span>' : ""}
    </div>`
  ).join("");
  for (const el of pipelineEl.querySelectorAll(".pipe-stage")) {
    el.addEventListener("click", () => setStageFilter(el.dataset.stage));
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setStageFilter(el.dataset.stage);
      }
    });
  }
  applyStageFilterUi();
}

function mean(arr) {
  if (!arr.length) return 0;
  let s = 0;
  for (const v of arr) s += v;
  return s / arr.length;
}

function updateStages(now, actionBoost = 0) {
  const act = state.activity;
  let peakId = "photo";
  let peakVal = -1;
  for (const stage of PIPELINE) {
    if (stage.id === "action") {
      const v = Math.max(actionBoost, state.lastAction ? 0.55 : 0.05);
      state.stageAct.action = { mean: v, left: v * 0.9, right: v * 0.7, peakAt: state.stageAct.action.peakAt };
      if (v > peakVal) {
        peakVal = v;
        peakId = "action";
      }
      continue;
    }
    const nodes = state.stageNodes[stage.id] || [];
    const left = [];
    const right = [];
    const all = [];
    for (const n of nodes) {
      const a = act[n.id] || 0;
      all.push(a);
      if (n.side === "L") left.push(a);
      else if (n.side === "R") right.push(a);
      else {
        left.push(a);
        right.push(a);
      }
    }
    const m = mean(all);
    const prev = state.stageAct[stage.id];
    if (m > (prev?.mean || 0) + 0.08 && m > 0.35) {
      prev.peakAt = now;
    }
    state.stageAct[stage.id] = {
      mean: m,
      left: mean(left),
      right: mean(right),
      peakAt: prev?.peakAt || 0,
    };
    if (m > peakVal) {
      peakVal = m;
      peakId = stage.id;
    }
  }

  if (peakId !== state.lastPeakStage && peakVal > 0.28) {
    const st = PIPELINE.find((s) => s.id === peakId);
    pushEvent("wave", `пик → ${st?.full || peakId}`);
    state.lastPeakStage = peakId;
  }

  const peakIdx = PIPELINE.findIndex((s) => s.id === peakId);
  const target = peakIdx / (PIPELINE.length - 1);
  state.wavePos += (target - state.wavePos) * 0.12;
  state.waveStage = peakId;
  if (waveBadge) waveBadge.textContent = `волна: ${PIPELINE[peakIdx]?.full || peakId}`;

  const firstPeak = Math.min(...PIPELINE.map((s) => state.stageAct[s.id].peakAt || Infinity).filter((t) => t < Infinity && t > 0));
  const peakEl = document.getElementById("stage-peak");
  const latEl = document.getElementById("stage-latency");
  if (peakEl) peakEl.textContent = `пик: ${PIPELINE[peakIdx]?.full || peakId}`;
  if (latEl) {
    const latMs = state.stageAct[peakId].peakAt && firstPeak < Infinity
      ? Math.max(0, Math.round(state.stageAct[peakId].peakAt - firstPeak))
      : 0;
    latEl.textContent = `латентность волны: ${latMs} мс · стадия ${peakIdx + 1}/${PIPELINE.length}`;
  }

  // DOM meters ~30Hz; wave math stays every tick via wavePos above
  if ((state.uiTick || 0) % 2 !== 0) return;

  for (const stage of PIPELINE) {
    const a = state.stageAct[stage.id];
    const el = pipelineEl?.querySelector(`[data-stage="${stage.id}"]`);
    if (el) {
      el.classList.toggle("peak", stage.id === peakId);
      el.classList.toggle("active", a.mean > 0.28);
    }
    const bl = document.getElementById(`pipe-${stage.id}-l`);
    const br = document.getElementById(`pipe-${stage.id}-r`);
    const vv = document.getElementById(`pipe-${stage.id}-v`);
    const lt = document.getElementById(`pipe-${stage.id}-lat`);
    if (bl) bl.style.height = `${Math.min(100, a.left * 70)}%`;
    if (br) br.style.height = `${Math.min(100, a.right * 70)}%`;
    if (vv) vv.textContent = a.mean.toFixed(2);
    if (lt) {
      const age = a.peakAt ? Math.round(now - a.peakAt) : null;
      lt.textContent = age == null ? "—" : age < 1200 ? `Δ${age}мс` : "·";
    }
  }
}

function boardEvalCues() {
  const heights = columnHeights(state.grid);
  let holes = 0;
  let bump = 0;
  for (let x = 0; x < COLS; x++) {
    let seen = false;
    for (let y = 0; y < ROWS; y++) {
      if (state.grid[y][x]) seen = true;
      else if (seen) holes += 1;
    }
    if (x) bump += Math.abs(heights[x] - heights[x - 1]);
  }
  const agg = heights.reduce((a, b) => a + b, 0);
  return { heights, holes, bump, agg };
}

function renderProcess(info) {
  if (!processEl) return;
  if (!info) {
    processEl.innerHTML = `<div class="why">ждёт фигуру и зрительный вход…</div>`;
    return;
  }
  const lPct = Math.min(100, info.left * 70);
  const rPct = Math.min(100, info.right * 70);
  processEl.innerHTML = `
    <div class="row"><span class="k">цель</span><span class="v">кол. ${info.targetX ?? "—"} · сейчас ${info.curX ?? "—"} · Δx ${info.dx ?? 0}</span></div>
    <div class="row"><span class="k">L ↔ R</span>
      <div class="lr">
        <div class="track"><div class="fill" style="width:${lPct}%;background:#4ade80"></div></div>
        <span class="v">Δ${(info.left - info.right).toFixed(2)}</span>
        <div class="track"><div class="fill" style="width:${rPct}%;background:#c084fc"></div></div>
      </div>
    </div>
    <div class="row"><span class="k">намерения</span>
      <div class="intent">
        <span class="tag left ${info.steer === "L" ? "on" : ""}">← влево</span>
        <span class="tag right ${info.steer === "R" ? "on" : ""}">вправо →</span>
        <span class="tag rot ${info.needRot ? "on" : ""}">поворот</span>
        <span class="tag drop ${info.needDrop ? "on" : ""}">дроп</span>
      </div>
    </div>
    <div class="row"><span class="k">доска</span><span class="v">дыры ${info.holes} · рельеф ${info.bump} · высота ${info.agg}</span></div>
    <div class="why">${info.why}</div>
  `;
}

function spawnFlowParticles(edge, intensity, burst = false) {
  const inhibitory = edge.sign < 0;
  const train = burst ? (inhibitory ? 5 : 6) : Math.min(inhibitory ? 4 : 5, 1 + Math.floor(intensity * (inhibitory ? 3.2 : 3.8)));
  const gap = inhibitory ? 48 : 28;
  for (let i = 0; i < train; i++) {
    state.particles.push({
      pre: edge.pre,
      post: edge.post,
      sign: edge.sign,
      t0: performance.now() + i * gap,
      life: (inhibitory ? 640 : 480) + Math.random() * 320,
      speed: 0.001 + intensity * 0.002 + Math.random() * 0.0007,
      size: (inhibitory ? 2.2 : 1.5) + intensity * 2.4,
      pulse: burst,
    });
  }
  if (state.particles.length > 420) state.particles.splice(0, state.particles.length - 420);
}

function stepBrain() {
  const c = state.circuit;
  if (!c) return;
  const drive = sensoryDrive();
  const act = state.activity;
  const next = {};
  const incoming = {};
  const now = performance.now();
  state.synBurstCooldown = Math.max(0, state.synBurstCooldown - 1);

  for (const e of effectiveEdges()) {
    const a = act[e.pre] || 0;
    // Cap log-weight so large explorer bilateral counts cannot flood both DNs equally.
    const gain = e.sign < 0 ? 0.14 : 0.11;
    const wTerm = Math.log1p(Math.min(e.weight || 1, 36));
    incoming[e.post] = (incoming[e.post] || 0) + a * e.sign * wTerm * gain;
    const flow = a * (e.sign > 0 ? 1 : 0.85);
    if (flow > 0.32 && Math.random() < (e.sign < 0 ? 0.42 : 0.38)) {
      const burst = flow > 0.72 && state.spikes[e.pre];
      spawnFlowParticles(e, flow, burst);
      if (burst && state.synBurstCooldown === 0 && Math.random() < 0.22) {
        state.synBurstCooldown = 10;
        pushEvent(
          e.sign < 0 ? "inhibit" : "synapse",
          `${e.pre.replaceAll("_", " ")} → ${e.post.replaceAll("_", " ")} · ${e.sign < 0 ? "торм." : "возб."} ${Math.round(e.weight)}`
        );
      }
    }
  }
  for (const n of c.nodes) {
    let inj = incoming[n.id] || 0;
    const id = n.id;
    // Visual field → optic cascade (symmetric)
    if (id === "R1-R6_L") inj += drive.visualL * 1.05;
    if (id === "R1-R6_R") inj += drive.visualR * 1.05;
    if (id === "L1_L" || id === "L2_L" || id === "L3_L") inj += drive.visualL * 0.22;
    if (id === "L1_R" || id === "L2_R" || id === "L3_R") inj += drive.visualR * 0.22;
    if (id === "LoVP92_L" || id === "LoVP11_L") inj += drive.visualL * 0.9;
    if (id === "LoVP92_R" || id === "LoVP11_R") inj += drive.visualR * 0.9;
    // Steer intent → excitatory DN / integrator path (avoids VES inversion)
    if (id === "CB0244_L" || id === "GNG532_L" || id === "DNg97_L" || id === "DNp13_L") {
      inj += drive.steerLeft * 1.05;
    }
    if (id === "CB0244_R" || id === "GNG532_R" || id === "DNg97_R" || id === "DNp13_R") {
      inj += drive.steerRight * 1.05;
    }
    if (id === "DNg13_L") inj += drive.steerLeft * 1.75;
    if (id === "DNg13_R") inj += drive.steerRight * 1.75;
    if (id === "DNa02") inj += (drive.needRotate || 0) * 1.15;
    if (id === "IN17A025_L" || id === "IN17A025_R") inj += (drive.needDrop || 0) * 0.85;
    const v = Math.max(0, Math.min(1.6, (act[n.id] || 0) * 0.5 + inj));
    next[n.id] = v;
    if (!state.rateMode) {
      state.spikes[n.id] = v > 0.72 && Math.random() < Math.min(0.9, v * 0.55);
    }
  }
  // Rate worker owns bulk rates when ON; local sim only seeds sensory nodes.
  if (!state.rateMode) {
    state.activity = next;
  } else {
    for (const n of c.nodes) {
      const id = n.id;
      if (
        id.startsWith("R1-R6") ||
        id.startsWith("L1_") ||
        id.startsWith("L2_") ||
        id.startsWith("L3_")
      ) {
        state.activity[id] = next[id];
      }
    }
  }

  const pop = { optic: [], central: [], descending: [], vnc: [] };
  const actView = state.rateMode ? state.activity : next;
  for (const n of c.nodes) {
    (pop[n.region] || pop.central).push(actView[n.id] || 0);
  }
  for (const k of Object.keys(state.popAvg)) {
    const arr = pop[k] || [];
    state.popAvg[k] = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const el = document.getElementById(`pop-${k}`);
    if (el) el.style.width = `${Math.min(100, state.popAvg[k] * 70)}%`;
  }

  state.raster.unshift(
    c.nodes.map((n) => {
      const v = actView[n.id] || 0;
      return state.spikes[n.id] ? 1 : v > 0.45 ? 0.4 + v * 0.35 : v > 0.2 ? 0.18 : 0;
    })
  );
  if (state.raster.length > RASTER_COLS) state.raster.pop();

  // Blend explicit steer intent into DN readout. Large bilateral explorer weights
  // otherwise clip L+R to the same max and lateral moves die (rate worker was
  // accidentally "fixing" this by resetting activity every frame).
  const src = state.rateMode ? state.activity : next;
  const l = (src.DNg13_L || 0) + drive.steerLeft * 0.95;
  const r = (src.DNg13_R || 0) + drive.steerRight * 0.95;
  const rot = (src.DNa02 || 0) + (drive.needRotate || 0) * 0.6;
  const drop = Math.max(src.IN17A025_L || 0, src.IN17A025_R || 0) + (drive.needDrop || 0) * 0.5;
  renderDecisions({ left: l, right: r, rotate: rot, drop });

  const best = bestPlacement();
  const cues = boardEvalCues();
  let steer = "";
  let needRot = false;
  let needDrop = false;
  let why = "сканирует поле и оценивает посадку…";
  if (best && state.current) {
    const dx = best.x - state.current.x;
    const curRot = ((state.current.rot % 4) + 4) % 4;
    needRot = best.rot !== curRot;
    needDrop = best.x === state.current.x && !needRot;
    if (dx < 0) steer = "L";
    else if (dx > 0) steer = "R";
    if (needRot) why = `поворот → ориентация ${best.rot} (сейчас ${curRot}); меньше дыр/рельефа`;
    else if (needDrop) why = `колонка ${best.x} совпала — дроп; оценка посадки max`;
    else if (steer === "L") why = `цель кол. ${best.x} левее · DNg13 L доминирует · дыры ${cues.holes}, рельеф ${cues.bump}`;
    else if (steer === "R") why = `цель кол. ${best.x} правее · DNg13 R доминирует · дыры ${cues.holes}, рельеф ${cues.bump}`;
    else why = `на месте · ждёт подтверждения DN/VNC`;
  }
  state.processInfo = {
    targetX: best?.x,
    curX: state.current?.x,
    dx: best && state.current ? best.x - state.current.x : 0,
    left: l,
    right: r,
    steer,
    needRot,
    needDrop,
    holes: cues.holes,
    bump: cues.bump,
    agg: cues.agg,
    why,
  };
  state.uiTick = (state.uiTick || 0) + 1;
  if (state.uiTick % 2 === 0) renderProcess(state.processInfo);

  let actionBoost = 0;
  if (!state.brainMode || state.paused || state.over || !state.current) {
    updateStages(now, actionBoost);
    return;
  }
  state.brainCooldown -= 1;
  if (state.brainCooldown > 0) {
    updateStages(now, actionBoost);
    return;
  }

  let action = "";
  if (best) {
    const needRotMove = ((best.rot - state.current.rot) % 4 + 4) % 4;
    const sum = l + r + 0.2;
    const lShare = l / sum;
    const rShare = r / sum;
    const delta = l - r;
    // Relative DN readout + board evaluation. Absolute L>R alone was broken when
    // the circuit had a chronic right-side excitatory hack.
    if (needRotMove && rot > 0.52) {
      rotate(1);
      action = "DNa02 → поворот";
    } else if (best.x < state.current.x && lShare > 0.48 && l > 0.28) {
      move(-1, 0);
      action = "DNg13(L) → влево";
    } else if (best.x > state.current.x && rShare > 0.48 && r > 0.28) {
      move(1, 0);
      action = "DNg13(R) → вправо";
    } else if (best.x === state.current.x && !needRotMove && drop > 0.65) {
      hardDrop();
      action = "VNC IN17A025 → дроп";
    } else if (delta > 0.22 && lShare > 0.58 && best.x <= state.current.x) {
      move(-1, 0);
      action = "DNg13(L) спонтанный сдвиг";
    } else if (delta < -0.22 && rShare > 0.58 && best.x >= state.current.x) {
      move(1, 0);
      action = "DNg13(R) спонтанный сдвиг";
    }
  }
  if (action) {
    state.lastAction = action;
    state.thought = `${action}. LoVP92 L/R = ${(src.LoVP92_L || 0).toFixed(2)} / ${(src.LoVP92_R || 0).toFixed(2)}; ΔDNg13=${(l - r).toFixed(2)}; цель кол. ${best?.x ?? "—"}; ${why}`;
    document.getElementById("thought").textContent = state.thought;
    state.brainCooldown = Math.max(3, Math.round(7 / Math.max(0.35, state.speed)));
    state.decisionMarks.unshift({ t: performance.now(), label: action.split("→")[0].trim() });
    if (state.decisionMarks.length > 8) state.decisionMarks.pop();
    pushEvent("decision", action);
    startDecisionTrail(action);
    actionBoost = 1.1;
    state.waveKick = performance.now();
    state.stageAct.action.peakAt = performance.now();
  }
  updateStages(now, actionBoost);
}

function renderDecisions(d) {
  const box = document.getElementById("decisions");
  const rows = [
    ["DNg13 L", d.left, "#4ade80"],
    ["DNg13 R", d.right, "#c084fc"],
    ["DNa02", d.rotate, "#fbbf24"],
    ["IN17 drop", d.drop, "#38bdf8"],
  ];
  box.innerHTML = rows
    .map(
      ([name, v, color]) => `
      <div class="bar">
        <span>${name}</span>
        <div class="track"><div class="fill" style="width:${Math.min(100, v * 70)}%;background:${color}"></div></div>
        <span>${v.toFixed(2)}</span>
      </div>`
    )
    .join("");
}

function lobeBand(ctx, x, y, rx, ry, color, alpha = 0.08) {
  ctx.save();
  const g = ctx.createRadialGradient(x - rx * 0.2, y - ry * 0.2, ry * 0.1, x, y, rx);
  g.addColorStop(0, color);
  g.addColorStop(1, color);
  ctx.fillStyle = g;
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = Math.min(0.55, alpha * 3.2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();
}

function drawAnatomy(ctx, w, h) {
  // ambient grid
  ctx.save();
  ctx.strokeStyle = "rgba(232,237,245,0.028)";
  ctx.lineWidth = 1;
  for (let x = 28; x < w; x += 28) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 28; y < h; y += 28) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.restore();

  const opticLayers = [
    { label: "lamina", ox: 0.055, rx: 22, ry: 78, a: 0.11 },
    { label: "medulla", ox: 0.11, rx: 28, ry: 86, a: 0.095 },
    { label: "lobula", ox: 0.175, rx: 30, ry: 76, a: 0.085 },
    { label: "LP", ox: 0.225, rx: 24, ry: 62, a: 0.08 },
    { label: "VPN", ox: 0.275, rx: 22, ry: 52, a: 0.075 },
  ];

  for (const side of ["L", "R"]) {
    const mirror = side === "R";
    for (const layer of opticLayers) {
      const x = (mirror ? 1 - layer.ox : layer.ox) * w;
      lobeBand(ctx, x, h * 0.28, layer.rx, layer.ry, REGION_COLOR.optic, layer.a);
    }
    // outer capsule
    lobeBand(ctx, (mirror ? 0.82 : 0.18) * w, h * 0.28, 128, 112, REGION_COLOR.optic, 0.04);
  }

  // central brain compartments (finer)
  lobeBand(ctx, w * 0.5, h * 0.36, 168, 100, REGION_COLOR.central, 0.055);
  lobeBand(ctx, w * 0.36, h * 0.30, 28, 22, REGION_COLOR.central, 0.1); // AOTU L
  lobeBand(ctx, w * 0.64, h * 0.30, 28, 22, REGION_COLOR.central, 0.1); // AOTU R
  lobeBand(ctx, w * 0.38, h * 0.38, 36, 30, REGION_COLOR.central, 0.09); // proto L
  lobeBand(ctx, w * 0.62, h * 0.38, 36, 30, REGION_COLOR.central, 0.09); // proto R
  lobeBand(ctx, w * 0.42, h * 0.32, 30, 24, REGION_COLOR.central, 0.09); // LAL L
  lobeBand(ctx, w * 0.58, h * 0.32, 30, 24, REGION_COLOR.central, 0.09); // LAL R
  lobeBand(ctx, w * 0.46, h * 0.28, 26, 18, REGION_COLOR.central, 0.08); // SMP L
  lobeBand(ctx, w * 0.54, h * 0.28, 26, 18, REGION_COLOR.central, 0.08); // SMP R
  lobeBand(ctx, w * 0.4, h * 0.48, 40, 28, REGION_COLOR.central, 0.1); // VES L
  lobeBand(ctx, w * 0.6, h * 0.48, 40, 28, REGION_COLOR.central, 0.1); // VES R
  lobeBand(ctx, w * 0.44, h * 0.54, 30, 22, REGION_COLOR.central, 0.09); // GNG L
  lobeBand(ctx, w * 0.56, h * 0.54, 30, 22, REGION_COLOR.central, 0.09); // GNG R

  // descending corridor + DN columns
  lobeBand(ctx, w * 0.5, h * 0.63, 98, 46, REGION_COLOR.descending, 0.07);
  lobeBand(ctx, w * 0.4, h * 0.66, 36, 28, REGION_COLOR.descending, 0.08);
  lobeBand(ctx, w * 0.6, h * 0.66, 36, 28, REGION_COLOR.descending, 0.08);

  // VNC neuromeres (finer banding)
  lobeBand(ctx, w * 0.5, h * 0.84, 64, 118, REGION_COLOR.vnc, 0.065);
  for (const [yy, label] of [
    [0.78, "T1"],
    [0.84, "T2"],
    [0.90, "T3"],
    [0.95, "Ab"],
  ]) {
    lobeBand(ctx, w * 0.5, h * yy, 52, 16, REGION_COLOR.vnc, 0.09);
    ctx.fillStyle = "rgba(139,149,168,0.55)";
    ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(label, w * 0.5 + 58, h * yy + 3);
  }

  // neck connective
  ctx.save();
  ctx.strokeStyle = "rgba(251, 191, 36, 0.22)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(w * 0.5, h * 0.68);
  ctx.lineTo(w * 0.5, h * 0.74);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "rgba(139,149,168,0.78)";
  ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText("optic L · lam→med→lob→LP→VPN", 14, 18);
  ctx.fillText("optic R", w - 58, 18);
  ctx.fillText("AOTU · LAL · VES · GNG · SMP", w * 0.5 - 90, 18);
  ctx.fillText("descending DNs", w * 0.5 - 48, h * 0.575);
  ctx.fillText("VNC", w * 0.5 - 14, h - 8);

  // micro layer labels on both optics
  const labels = [
    [0.04, 0.10, "lam"],
    [0.09, 0.10, "med"],
    [0.15, 0.10, "lob"],
    [0.20, 0.10, "LP"],
    [0.25, 0.10, "VPN"],
  ];
  ctx.fillStyle = "rgba(192,132,252,0.55)";
  ctx.font = "9px ui-monospace, SFMono-Regular, Menlo, monospace";
  for (const [x, y, t] of labels) {
    ctx.fillText(t, x * w, y * h);
    ctx.fillText(t, (1 - x) * w - 18, y * h);
  }
  ctx.fillStyle = "rgba(74,222,128,0.5)";
  ctx.fillText("AOTU", w * 0.33, h * 0.235);
  ctx.fillText("VES", w * 0.37, h * 0.455);
  ctx.fillText("LAL", w * 0.40, h * 0.275);

  // live stage heat on anatomy bands
  const heat = [
    ["photo", 0.05, 0.22, 18, 70],
    ["lamina", 0.1, 0.26, 22, 78],
    ["medulla", 0.16, 0.28, 26, 82],
    ["lobula", 0.22, 0.28, 28, 72],
    ["vpn", 0.28, 0.3, 22, 50],
    ["central", 0.5, 0.38, 120, 70],
    ["dn", 0.5, 0.64, 70, 34],
    ["vnc", 0.5, 0.84, 48, 90],
  ];
  for (const [id, x, y, rx, ry] of heat) {
    const a = state.stageAct[id]?.mean || 0;
    if (a < 0.18) continue;
    if (state.stageFilter && state.stageFilter !== id && !(state.stageFilter === "action" && (id === "dn" || id === "vnc"))) {
      continue;
    }
    const stage = PIPELINE.find((s) => s.id === id);
    const boost = state.stageFilter === id ? 1.35 : 1;
    lobeBand(ctx, x * w, y * h, rx * boost, ry * boost, stage?.color || "#fff", (0.04 + a * 0.12) * boost);
    // mirror optic stages
    if (["photo", "lamina", "medulla", "lobula", "vpn"].includes(id)) {
      lobeBand(ctx, (1 - x) * w, y * h, rx * boost, ry * boost, stage?.color || "#fff", (0.03 + a * 0.1) * boost);
    }
  }
}

function drawSignalWave(ctx, w, h, t) {
  const idx = Math.max(0, PIPELINE.findIndex((s) => s.id === state.waveStage));
  const stage = PIPELINE[idx] || PIPELINE[0];
  // optic stages sweep left→center; later stages drop vertically through DN→VNC
  let x;
  let y0 = h * 0.08;
  let y1 = h * 0.55;
  if (idx <= 4) {
    x = stage.x * w + state.wavePos * 8;
    // also a faint mirror on R
  } else if (idx === 5) {
    x = w * 0.5;
    y0 = h * 0.18;
    y1 = h * 0.55;
  } else if (idx === 6) {
    x = w * 0.5;
    y0 = h * 0.52;
    y1 = h * 0.72;
  } else {
    x = w * 0.5;
    y0 = h * 0.7;
    y1 = h * 0.96;
  }
  const pulse = 0.55 + 0.45 * Math.sin(t / 180);
  const kick = state.waveKick ? Math.max(0, 1 - (t - state.waveKick) / 700) : 0;
  const alpha = 0.1 + (state.stageAct[stage.id]?.mean || 0) * 0.28 + kick * 0.25;

  const grad = ctx.createLinearGradient(x - 40, 0, x + 40, 0);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(0.5, stage.color);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.save();
  ctx.globalAlpha = alpha * pulse;
  ctx.fillStyle = grad;
  ctx.fillRect(x - 42, y0, 84, y1 - y0);
  ctx.strokeStyle = stage.color;
  ctx.globalAlpha = alpha * 1.4;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y0);
  ctx.lineTo(x, y1);
  ctx.stroke();
  ctx.restore();

  if (idx <= 4) {
    const xr = (1 - stage.x) * w;
    ctx.save();
    ctx.globalAlpha = alpha * 0.45 * pulse;
    const g2 = ctx.createLinearGradient(xr - 30, 0, xr + 30, 0);
    g2.addColorStop(0, "rgba(0,0,0,0)");
    g2.addColorStop(0.5, stage.color);
    g2.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g2;
    ctx.fillRect(xr - 30, y0, 60, y1 - y0);
    ctx.restore();
  }

  // traveling front ticks for pulse-train readability
  const front = ((t / 320) % 1);
  ctx.save();
  ctx.globalAlpha = 0.35 + kick * 0.4;
  ctx.fillStyle = stage.color;
  for (let i = 0; i < 4; i++) {
    const yy = y0 + ((front + i / 4) % 1) * (y1 - y0);
    ctx.beginPath();
    ctx.arc(x, yy, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function bezierPoint(a, b, mx, my, p) {
  const u = 1 - p;
  return [
    u * u * a[0] + 2 * u * p * mx + p * p * b[0],
    u * u * a[1] + 2 * u * p * my + p * p * b[1],
  ];
}

function nodePos(n, w, h) {
  return [n.x * w, n.y * h];
}

/** Map circuit node into neuropil world space (shared by draw + hit-test). */
function nodeWorld3d(n) {
  let x = (n.x - 0.5) * 2.4;
  let y = (n.y - 0.45) * 2.1;
  let z = n.region === "optic" ? 0.25 : n.region === "vnc" ? -0.2 : n.region === "descending" ? -0.05 : 0;
  if (n.side === "L") x -= 0.08;
  if (n.side === "R") x += 0.08;
  // Spread optic layers in depth for volume readability
  if (n.region === "optic") {
    if (n.layer === "lamina" || n.role === "photoreceptor") z += 0.12;
    else if (n.layer === "medulla") z += 0.04;
    else if (n.layer === "lobula" || n.layer === "lobula_plate") z -= 0.04;
  }
  return [x, y, z];
}

function drawDecisionTrail2d(ctx, pos, w, h, t) {
  const tr = getDecisionTrail(t);
  if (!tr || !tr.nodeIds.length) return;
  const pts = tr.nodeIds.map((id) => pos[id]).filter(Boolean);
  if (pts.length < 2) return;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = tr.color;
  ctx.shadowColor = tr.color;
  ctx.shadowBlur = 18 * tr.glow;
  ctx.globalAlpha = 0.25 + tr.glow * 0.55;
  ctx.lineWidth = 1.1 + tr.glow * 1.75;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();

  // traveling pulse along path
  const head = Math.min(0.98, Math.max(0, tr.age) * 1.15);
  const seg = head * (pts.length - 1);
  const i0 = Math.max(0, Math.min(pts.length - 1, Math.floor(seg)));
  const f = seg - i0;
  const a = pts[i0];
  const b = pts[Math.min(pts.length - 1, i0 + 1)] || a;
  if (!a || !b) {
    ctx.restore();
    return;
  }
  const hx = a[0] + (b[0] - a[0]) * f;
  const hy = a[1] + (b[1] - a[1]) * f;
  ctx.shadowBlur = 22;
  ctx.globalAlpha = 0.55 + tr.glow * 0.45;
  ctx.fillStyle = "#fff7ed";
  ctx.beginPath();
  ctx.arc(hx, hy, 5 + tr.glow * 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = tr.color;
  ctx.beginPath();
  ctx.arc(hx, hy, 2.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.globalAlpha = tr.glow;
  ctx.fillStyle = tr.color;
  ctx.fillText(tr.full, Math.min(w - 220, Math.max(12, hx + 10)), Math.max(18, hy - 12));
  ctx.restore();
}

function drawDecisionTrail3d(ctx, screen, t) {
  const tr = getDecisionTrail(t);
  if (!tr || !tr.nodeIds.length) return;
  const pts = tr.nodeIds.map((id) => screen[id]).filter(Boolean);
  if (pts.length < 2) return;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = tr.color;
  ctx.globalAlpha = 0.3 + tr.glow * 0.55;
  ctx.lineWidth = 1 + tr.glow * 1.5;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();

  const head = Math.min(0.98, Math.max(0, tr.age) * 1.15);
  const seg = head * (pts.length - 1);
  const i0 = Math.max(0, Math.min(pts.length - 1, Math.floor(seg)));
  const f = seg - i0;
  const a = pts[i0];
  const b = pts[Math.min(pts.length - 1, i0 + 1)] || a;
  if (!a || !b) {
    ctx.restore();
    return;
  }
  const hx = a[0] + (b[0] - a[0]) * f;
  const hy = a[1] + (b[1] - a[1]) * f;
  ctx.globalAlpha = 0.65 + tr.glow * 0.35;
  ctx.fillStyle = "#fff7ed";
  ctx.beginPath();
  ctx.arc(hx, hy, 4.5 + tr.glow * 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = tr.color;
  ctx.beginPath();
  ctx.arc(hx, hy, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.globalAlpha = tr.glow;
  ctx.fillText(tr.label, hx + 8, hy - 8);
  ctx.restore();
}

function drawBrain(t) {
  const c = state.circuit;
  const canvas = brainCanvas;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#080b12";
  ctx.fillRect(0, 0, w, h);
  drawAnatomy(ctx, w, h);
  drawSignalWave(ctx, w, h, t);

  if (!c) return;
  const pos = {};
  const byId = {};
  for (const n of c.nodes) {
    pos[n.id] = nodePos(n, w, h);
    byId[n.id] = n;
  }

  // edges
  for (const e of effectiveEdges()) {
    const a = pos[e.pre];
    const b = pos[e.post];
    if (!a || !b) continue;
    const preNode = byId[e.pre];
    const postNode = byId[e.post];
    const preA = state.activity[e.pre] || 0;
    const flow = preA * (e.sign > 0 ? 1 : 0.85);
    const mode = edgeVizMode(preNode, postNode, flow);
    if (mode === "hide") continue;
    if (mode === "ghost") {
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.strokeStyle = "rgba(232,237,245,0.03)";
      ctx.lineWidth = 0.28;
      ctx.stroke();
      continue;
    }
    const onTrail = isTrailNode(e.pre) && isTrailNode(e.post);
    const highlighted =
      state.hoverId === e.pre || state.hoverId === e.post || (!state.hoverId && flow > 0.45) || onTrail;
    const mx = (a[0] + b[0]) / 2 + Math.sin(t / 500 + e.weight * 0.01) * (8 + flow * 6);
    const my = (a[1] + b[1]) / 2 - Math.abs(a[0] - b[0]) * 0.05;

    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.quadraticCurveTo(mx, my, b[0], b[1]);
    const base = edgeRgb(e);
    const boost = (state.stageFilter ? 0.18 : 0) + (onTrail ? 0.28 : 0);
    const alpha = e.sign < 0
      ? 0.16 + flow * 0.48 + (highlighted ? 0.22 : 0) + boost
      : 0.10 + flow * 0.38 + (highlighted ? 0.16 : 0) + boost;
    ctx.strokeStyle = onTrail ? (state.decisionTrail?.color || `rgba(${base},${alpha})`) : `rgba(${base},${alpha})`;
    if (onTrail) ctx.globalAlpha = Math.min(1, alpha + 0.35);
    ctx.lineWidth = 0.28 + Math.log1p(e.weight) * 0.16 + flow * 1.0 + (state.stageFilter ? 0.3 : 0) + (onTrail ? 0.6 : 0);
    if (e.sign < 0) ctx.setLineDash([3, 5]);
    else ctx.setLineDash([]);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);

    // inhibition T-bar marker near postsynaptic end
    if (e.sign < 0 && (flow > 0.2 || highlighted)) {
      const [px, py] = bezierPoint(a, b, mx, my, 0.86);
      const [qx, qy] = bezierPoint(a, b, mx, my, 0.9);
      const ang = Math.atan2(qy - py, qx - px);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(ang);
      ctx.strokeStyle = `rgba(${base},0.9)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -3);
      ctx.lineTo(0, 3);
      ctx.stroke();
      ctx.restore();
    }

    // direction chevron near midpoint
    if (flow > 0.22 || highlighted) {
      const p = 0.62;
      const [px, py] = bezierPoint(a, b, mx, my, p);
      const [qx, qy] = bezierPoint(a, b, mx, my, p + 0.04);
      const ang = Math.atan2(qy - py, qx - px);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(ang);
      ctx.fillStyle = e.sign < 0 ? "rgba(251,113,133,0.85)" : "rgba(125,211,252,0.85)";
      ctx.beginPath();
      ctx.moveTo(3.5, 0);
      ctx.lineTo(-2.5, 2);
      ctx.lineTo(-2.5, -2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  // traveling spike particles
  const now = t;
  if (!state.paused) {
    state.particles = state.particles.filter((p) => now - p.t0 < p.life);
  }
  for (const p of state.particles) {
    const a = pos[p.pre];
    const b = pos[p.post];
    if (!a || !b) continue;
    if (state.stageFilter && !edgeMatchesFilter(p)) continue;
    if (state.activeOnly) {
      const preN = byId[p.pre];
      if (preN && nodeVizMode(preN) !== "full" && !isTrailNode(p.pre)) continue;
    }
    const age = state.paused ? 0.42 + 0.08 * Math.sin(t / 900 + p.size) : (now - p.t0) / p.life;
    if (age < 0 || age > 1) continue;
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    const [px, py] = bezierPoint(a, b, mx, my, Math.min(1, age * (0.7 + p.speed * 200)));
    ctx.beginPath();
    ctx.fillStyle = p.sign < 0 ? "#fb7185" : "#e0f2fe";
    ctx.globalAlpha = 0.25 + (1 - age) * 0.75;
    ctx.shadowColor = p.sign < 0 ? "#fb7185" : "#7dd3fc";
    ctx.shadowBlur = p.pulse ? 14 : 10;
    ctx.arc(px, py, p.size * (1 - age * 0.35) * (p.pulse ? 1.15 : 1), 0, Math.PI * 2);
    ctx.fill();
    if (p.pulse) {
      ctx.beginPath();
      ctx.strokeStyle = p.sign < 0 ? "rgba(251,113,133,0.7)" : "rgba(125,211,252,0.7)";
      ctx.lineWidth = 1;
      ctx.globalAlpha = (1 - age) * 0.7;
      ctx.arc(px, py, p.size * 2.2, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }

  // nodes
  for (const n of c.nodes) {
    const [x, y] = pos[n.id];
    const a = state.activity[n.id] || 0;
    const color = REGION_COLOR[n.region] || "#fff";
    const hover = state.hoverId === n.id;
    const mode = nodeVizMode(n);
    if (mode === "hide") continue;
    if (mode === "ghost") {
      ctx.beginPath();
      ctx.fillStyle = "rgba(232,237,245,0.08)";
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    const onTrail = isTrailNode(n.id);
    const r = 5.5 + a * 9 + (hover ? 3 : 0) + (state.stageFilter ? 2 : 0) + (onTrail ? 3 : 0);

    ctx.beginPath();
    ctx.fillStyle = onTrail ? (state.decisionTrail?.color || color) : color;
    ctx.globalAlpha = 0.14 + a * 0.55 + (hover ? 0.15 : 0) + (state.stageFilter ? 0.12 : 0) + (onTrail ? 0.2 : 0);
    ctx.arc(x, y, r + 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.beginPath();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85;
    ctx.arc(x, y, 3.2 + a * 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.beginPath();
    ctx.fillStyle = "#f8fafc";
    ctx.arc(x, y, 1.7, 0, Math.PI * 2);
    ctx.fill();

    if (state.spikes[n.id] || onTrail) {
      ctx.beginPath();
      ctx.strokeStyle = onTrail ? (state.decisionTrail?.color || color) : color;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = onTrail ? 2 : 1.4;
      ctx.arc(x, y, 12 + ((t % 280) / 280) * 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    if (hover || a > 0.55 || n.region === "descending" || n.role === "frontal_vpn" || state.stageFilter || onTrail) {
      const label = n.id.replaceAll("_", " ");
      ctx.font = `${hover || onTrail ? 12 : 10}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      const tw = ctx.measureText(label).width;
      const lx = Math.min(w - tw - 16, Math.max(4, x + 10));
      const ly = Math.max(16, y - 14);
      ctx.fillStyle = "rgba(8,11,18,0.78)";
      ctx.fillRect(lx - 4, ly - 11, tw + 10, 15);
      ctx.fillStyle = hover || onTrail ? "#fff" : "rgba(232,237,245,0.9)";
      ctx.fillText(label, lx, ly);
    }
  }

  drawDecisionTrail2d(ctx, pos, w, h, t);

  // decision flash markers near DN corridor
  for (const m of state.decisionMarks) {
    const age = (t - m.t) / 900;
    if (age > 1) continue;
    if (state.stageFilter && state.stageFilter !== "action" && state.stageFilter !== "dn" && state.stageFilter !== "vnc") continue;
    ctx.globalAlpha = 1 - age;
    ctx.fillStyle = "#fbbf24";
    ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(m.label, w * 0.72, h * 0.62 + age * 18);
    ctx.globalAlpha = 1;
  }
}

function drawRaster() {
  const ctx = rasterCanvas.getContext("2d");
  const w = rasterCanvas.width;
  const h = rasterCanvas.height;
  ctx.fillStyle = "#080b12";
  ctx.fillRect(0, 0, w, h);
  const rows = state.raster;
  if (!rows.length || !state.circuit) return;
  const nodes = state.circuit.nodes;
  const n = nodes.length;
  const labelW = 78;
  const plotW = w - labelW - 8;
  const cw = plotW / RASTER_COLS;
  const ch = h / n;

  // region banding
  let lastRegion = null;
  for (let i = 0; i < n; i++) {
    const region = nodes[i].region;
    if (region !== lastRegion) {
      ctx.fillStyle = `${REGION_COLOR[region]}14`;
      let end = i;
      while (end < n && nodes[end].region === region) end += 1;
      ctx.fillRect(0, i * ch, w, (end - i) * ch);
      lastRegion = region;
    }
  }

  for (let ti = 0; ti < rows.length; ti++) {
    for (let i = 0; i < n; i++) {
      const node = nodes[i];
      const v = rows[ti][i] || 0;
      if (!v) continue;
      const mode = nodeVizMode(node);
      if (mode === "hide") continue;
      if (mode === "ghost") {
        const x = labelW + plotW - (ti + 1) * cw;
        ctx.fillStyle = "rgba(232,237,245,0.04)";
        ctx.fillRect(x, i * ch + 0.4, Math.max(1, cw - 0.4), Math.max(1, ch - 0.8));
        continue;
      }
      const x = labelW + plotW - (ti + 1) * cw;
      ctx.fillStyle = v >= 1 ? "#f8fafc" : REGION_COLOR[node.region];
      ctx.globalAlpha = (v >= 1 ? 0.95 : 0.25 + v * 0.7) * (state.stageFilter || state.activeOnly ? 1 : 1);
      ctx.fillRect(x, i * ch + 0.4, Math.max(1, cw - 0.4), Math.max(1, ch - 0.8));
    }
  }
  ctx.globalAlpha = 1;

  ctx.font = "9px ui-monospace, SFMono-Regular, Menlo, monospace";
  for (let i = 0; i < n; i++) {
    const node = nodes[i];
    const mode = nodeVizMode(node);
    const active = (state.activity[node.id] || 0) > 0.45 || state.spikes[node.id];
    if (mode === "hide") {
      ctx.fillStyle = "rgba(139,149,168,0.15)";
    } else if (mode === "ghost") {
      ctx.fillStyle = "rgba(139,149,168,0.28)";
    } else {
      ctx.fillStyle = active ? REGION_COLOR[node.region] : "rgba(139,149,168,0.7)";
    }
    const short = node.id.length > 11 ? node.type + (node.side !== "B" ? ` ${node.side}` : "") : node.id.replaceAll("_", " ");
    ctx.fillText(short, 4, i * ch + ch * 0.72);
  }

  // now line
  ctx.strokeStyle = "rgba(251,191,36,0.45)";
  ctx.beginPath();
  ctx.moveTo(labelW + plotW - 1, 0);
  ctx.lineTo(labelW + plotW - 1, h);
  ctx.stroke();
}

function project3d(x, y, z, w, h, _t) {
  const cam = state.view3d;
  const yaw = cam.yaw;
  const pitch = cam.pitch;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  // rotate yaw around Y, then pitch
  const x1 = x * cy + z * sy;
  const z1 = -x * sy + z * cy;
  const y1 = y * cp - z1 * sp;
  const z2 = y * sp + z1 * cp;
  const dist = 3.2;
  const zoom = Math.max(0.55, Math.min(2.2, cam.zoom || 1));
  const scale = (dist / (dist + z2 + 1.6)) * Math.min(w, h) * 0.42 * zoom;
  return [w * 0.5 + x1 * scale, h * 0.52 + y1 * scale, z2, scale];
}

/** Semi-transparent organ shell: filled latitude bands + light wireframe. */
function drawVolumeShell3d(ctx, cx, cy, cz, rx, ry, rz, color, alpha, w, h, t, label, opts = {}) {
  const rings = opts.rings || 6;
  const segs = opts.segs || 14;
  const fill = opts.fill !== false;
  const projected = [];

  for (let i = 0; i < rings; i++) {
    const v = -1 + (2 * i) / (rings - 1);
    const rr = Math.sqrt(Math.max(0, 1 - v * v));
    const ring = [];
    for (let j = 0; j <= segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      const [px, py, pz, sc] = project3d(
        cx + Math.cos(a) * rx * rr,
        cy + v * ry,
        cz + Math.sin(a) * rz * rr,
        w,
        h,
        t
      );
      ring.push([px, py, pz, sc]);
    }
    projected.push({ v, ring });
  }

  ctx.save();
  if (fill) {
    for (let i = 0; i < projected.length - 1; i++) {
      const a = projected[i].ring;
      const b = projected[i + 1].ring;
      const depth = (a[0][2] + b[0][2]) * 0.5;
      const bandAlpha = alpha * (0.22 + 0.28 * (1 - Math.abs(projected[i].v))) * (0.75 + 0.25 * (1 - depth * 0.15));
      ctx.beginPath();
      ctx.moveTo(a[0][0], a[0][1]);
      for (let j = 1; j < a.length; j++) ctx.lineTo(a[j][0], a[j][1]);
      for (let j = b.length - 1; j >= 0; j--) ctx.lineTo(b[j][0], b[j][1]);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.globalAlpha = Math.max(0.02, Math.min(0.42, bandAlpha));
      ctx.fill();
    }
  }

  // wire latitude rings
  ctx.strokeStyle = color;
  for (const { v, ring } of projected) {
    ctx.beginPath();
    ctx.moveTo(ring[0][0], ring[0][1]);
    for (let j = 1; j < ring.length; j++) ctx.lineTo(ring[j][0], ring[j][1]);
    ctx.globalAlpha = alpha * (0.45 + 0.4 * (1 - Math.abs(v)));
    ctx.lineWidth = 1.05;
    ctx.stroke();
  }

  // a few longitude meridians for volume read
  const meridians = opts.meridians || 4;
  for (let m = 0; m < meridians; m++) {
    const ji = Math.round((m / meridians) * segs);
    ctx.beginPath();
    let first = true;
    for (const { ring } of projected) {
      const p = ring[ji];
      if (!p) continue;
      if (first) {
        ctx.moveTo(p[0], p[1]);
        first = false;
      } else ctx.lineTo(p[0], p[1]);
    }
    ctx.globalAlpha = alpha * 0.35;
    ctx.lineWidth = 0.85;
    ctx.stroke();
  }

  // soft core glow
  const [sx, sy, , sc] = project3d(cx, cy, cz, w, h, t);
  const glowR = Math.max(rx, ry, rz) * (sc || 40) * 0.55;
  const g = ctx.createRadialGradient(sx, sy, 2, sx, sy, glowR);
  g.addColorStop(0, color);
  g.addColorStop(0.45, color);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalAlpha = alpha * 0.38;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(sx, sy, rx * (sc || 36) * 0.55, ry * (sc || 36) * 0.48, 0, 0, Math.PI * 2);
  ctx.fill();

  if (label) {
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = "#d5dceb";
    ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(label, sx - 18, sy - ry * (sc || 30) * 0.55);
  }
  ctx.restore();
}

function drawEllipsoid3d(ctx, cx, cy, cz, rx, ry, rz, color, alpha, w, h, t, label) {
  drawVolumeShell3d(ctx, cx, cy, cz, rx, ry, rz, color, alpha, w, h, t, label, { rings: 6, segs: 14 });
}

function drawNeuropil3D(t) {
  if (!neuropilCanvas) return;
  const ctx = neuropilCanvas.getContext("2d");
  const w = neuropilCanvas.width;
  const h = neuropilCanvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#080b12";
  ctx.fillRect(0, 0, w, h);

  // floor grid
  ctx.save();
  for (let i = -4; i <= 4; i++) {
    for (const axis of ["x", "z"]) {
      const a = project3d(axis === "x" ? i * 0.35 : -1.4, 1.15, axis === "x" ? -1.4 : i * 0.35, w, h, t);
      const b = project3d(axis === "x" ? i * 0.35 : 1.4, 1.15, axis === "x" ? 1.4 : i * 0.35, w, h, t);
      ctx.strokeStyle = "rgba(232,237,245,0.04)";
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }
  }
  ctx.restore();

  const pop = state.popAvg;
  const stages = state.stageAct;
  const f = state.stageFilter;

  const regions = [
    { id: "opticL", x: -1.15, y: -0.35, z: 0.15, rx: 0.48, ry: 0.58, rz: 0.38, color: REGION_COLOR.optic, act: (pop.optic || 0) * 0.7 + (stages.medulla?.mean || 0) * 0.4, label: "optic L", stageIds: ["photo", "lamina", "medulla", "lobula", "vpn"] },
    { id: "opticR", x: 1.15, y: -0.35, z: 0.15, rx: 0.48, ry: 0.58, rz: 0.38, color: REGION_COLOR.optic, act: (pop.optic || 0) * 0.7 + (stages.lobula?.mean || 0) * 0.4, label: "optic R", stageIds: ["photo", "lamina", "medulla", "lobula", "vpn"] },
    { id: "central", x: 0, y: -0.15, z: -0.05, rx: 0.68, ry: 0.46, rz: 0.52, color: REGION_COLOR.central, act: pop.central || 0, label: "central", stageIds: ["central", "vpn"] },
    { id: "dn", x: 0, y: 0.38, z: -0.08, rx: 0.42, ry: 0.26, rz: 0.32, color: REGION_COLOR.descending, act: pop.descending || 0, label: "DN", stageIds: ["dn", "action"] },
    { id: "vnc", x: 0, y: 0.98, z: -0.05, rx: 0.3, ry: 0.58, rz: 0.26, color: REGION_COLOR.vnc, act: pop.vnc || 0, label: "VNC", stageIds: ["vnc", "action"] },
  ];

  // nested optic layer shells (substance, not flat discs)
  const opticLayers = [
    { stage: "lamina", ox: 1.38, y: -0.36, z: 0.22, rx: 0.14, ry: 0.5, rz: 0.26, color: "#d8b4fe", label: "lam" },
    { stage: "medulla", ox: 1.14, y: -0.34, z: 0.14, rx: 0.16, ry: 0.54, rz: 0.28, color: "#c084fc", label: "med" },
    { stage: "lobula", ox: 0.9, y: -0.3, z: 0.06, rx: 0.15, ry: 0.48, rz: 0.24, color: "#a78bfa", label: "lob" },
  ];

  const centralParts = [
    { id: "aotuL", x: -0.32, y: -0.28, z: 0.08, rx: 0.14, ry: 0.12, rz: 0.12, color: "#86efac", label: "AOTU", stageIds: ["central", "vpn"] },
    { id: "aotuR", x: 0.32, y: -0.28, z: 0.08, rx: 0.14, ry: 0.12, rz: 0.12, color: "#86efac", label: null, stageIds: ["central", "vpn"] },
    { id: "lal", x: 0, y: -0.22, z: -0.12, rx: 0.22, ry: 0.14, rz: 0.16, color: "#4ade80", label: "LAL", stageIds: ["central"] },
    { id: "ves", x: 0, y: -0.02, z: 0.1, rx: 0.2, ry: 0.12, rz: 0.14, color: "#22c55e", label: "VES", stageIds: ["central"] },
  ];

  const shells = [
    ...regions.map((r) => ({ ...r, kind: "region" })),
    ...opticLayers.flatMap((layer) =>
      [-1, 1].map((side) => ({
        id: `${layer.stage}${side < 0 ? "L" : "R"}`,
        x: layer.ox * side,
        y: layer.y,
        z: layer.z,
        rx: layer.rx,
        ry: layer.ry,
        rz: layer.rz,
        color: layer.color,
        act: stages[layer.stage]?.mean || 0,
        label: side < 0 ? layer.label : null,
        stageIds: [layer.stage, "photo", "vpn"],
        kind: "layer",
        rings: 5,
        segs: 12,
      }))
    ),
    ...centralParts.map((p) => ({
      ...p,
      act: (stages.central?.mean || 0) * 0.8 + (pop.central || 0) * 0.3,
      kind: "part",
      rings: 5,
      segs: 10,
    })),
  ];

  const sorted = shells
    .map((r) => ({ ...r, depth: project3d(r.x, r.y, r.z, w, h, t)[2] }))
    .sort((a, b) => a.depth - b.depth);

  for (const r of sorted) {
    const focused = !f || r.stageIds.includes(f);
    if (!focused && f && r.kind !== "region") continue;
    const baseA = r.kind === "region" ? 0.1 : r.kind === "layer" ? 0.12 : 0.09;
    const alpha = focused ? baseA + r.act * 0.3 : 0.025;
    const pulse = 1 + (focused ? r.act * 0.16 : 0) + (state.paused ? 0.02 * Math.sin(t / 700) : 0);
    drawVolumeShell3d(
      ctx,
      r.x,
      r.y,
      r.z,
      r.rx * pulse,
      r.ry * pulse,
      r.rz * pulse,
      r.color,
      alpha,
      w,
      h,
      t,
      focused ? r.label : null,
      { rings: r.rings || 6, segs: r.segs || 14, meridians: r.kind === "region" ? 4 : 3 }
    );
  }

  // live circuit: edges then nodes, mapped from 2D layout into volume
  const c = state.circuit;
  if (c) {
    const byId = {};
    const screen = {};
    for (const n of c.nodes) {
      byId[n.id] = n;
      const [x, y, z] = nodeWorld3d(n);
      const [px, py, pz] = project3d(x, y, z, w, h, t);
      screen[n.id] = [px, py, pz];
    }

    // synaptic edges (same palette / activity weighting as 2D)
    const edgeDraw = [];
    for (const e of effectiveEdges()) {
      const a = screen[e.pre];
      const b = screen[e.post];
      if (!a || !b) continue;
      const preNode = byId[e.pre];
      const postNode = byId[e.post];
      const preA = state.activity[e.pre] || 0;
      const flow = preA * (e.sign > 0 ? 1 : 0.85);
      const mode = edgeVizMode(preNode, postNode, flow);
      const depth = (a[2] + b[2]) * 0.5;
      edgeDraw.push({ e, a, b, mode, flow, depth });
    }
    edgeDraw.sort((u, v) => u.depth - v.depth);

    for (const item of edgeDraw) {
      const { e, a, b, mode, flow } = item;
      if (mode === "hide") continue;
      if (mode === "ghost") {
        ctx.beginPath();
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
        ctx.strokeStyle = "rgba(232,237,245,0.03)";
        ctx.lineWidth = 0.28;
        ctx.stroke();
        continue;
      }
      const onTrail = isTrailNode(e.pre) && isTrailNode(e.post);
      const highlighted =
        state.hoverId === e.pre || state.hoverId === e.post || (!state.hoverId && flow > 0.45) || onTrail;
      const mx = (a[0] + b[0]) / 2 + Math.sin(t / 500 + e.weight * 0.01) * (4 + flow * 4);
      const my = (a[1] + b[1]) / 2 - Math.abs(a[0] - b[0]) * 0.04;

      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.quadraticCurveTo(mx, my, b[0], b[1]);
      const base = edgeRgb(e);
      const boost = (state.stageFilter ? 0.18 : 0) + (onTrail ? 0.25 : 0);
      const alpha = e.sign < 0
        ? 0.16 + flow * 0.48 + (highlighted ? 0.22 : 0) + boost
        : 0.10 + flow * 0.38 + (highlighted ? 0.16 : 0) + boost;
      ctx.strokeStyle = onTrail ? (state.decisionTrail?.color || `rgba(${base},${alpha})`) : `rgba(${base},${alpha})`;
      if (onTrail) ctx.globalAlpha = Math.min(1, alpha + 0.3);
      ctx.lineWidth = 0.28 + Math.log1p(e.weight) * 0.14 + flow * 0.9 + (state.stageFilter ? 0.25 : 0) + (onTrail ? 0.5 : 0);
      if (e.sign < 0) ctx.setLineDash([3, 5]);
      else ctx.setLineDash([]);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);

      if (e.sign < 0 && (flow > 0.2 || highlighted)) {
        const [px, py] = bezierPoint(a, b, mx, my, 0.86);
        const [qx, qy] = bezierPoint(a, b, mx, my, 0.9);
        const ang = Math.atan2(qy - py, qx - px);
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(ang);
        ctx.strokeStyle = "rgba(251,113,133,0.85)";
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(0, -2.5);
        ctx.lineTo(0, 2.5);
        ctx.stroke();
        ctx.restore();
      }

      if (flow > 0.22 || highlighted) {
        const p = 0.62;
        const [px, py] = bezierPoint(a, b, mx, my, p);
        const [qx, qy] = bezierPoint(a, b, mx, my, p + 0.04);
        const ang = Math.atan2(qy - py, qx - px);
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(ang);
        ctx.fillStyle = e.sign < 0 ? "rgba(251,113,133,0.8)" : "rgba(125,211,252,0.8)";
        ctx.beginPath();
        ctx.moveTo(3, 0);
        ctx.lineTo(-2, 1.8);
        ctx.lineTo(-2, -1.8);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    // traveling spike particles (shared buffer with 2D; no shadow blur for FPS)
    const now = t;
    if (!state.paused) {
      state.particles = state.particles.filter((p) => now - p.t0 < p.life);
    }
    let drawnP = 0;
    const particleCap = 140;
    for (const p of state.particles) {
      if (drawnP >= particleCap) break;
      const a = screen[p.pre];
      const b = screen[p.post];
      if (!a || !b) continue;
      if (state.stageFilter && !edgeMatchesFilter(p)) continue;
      if (state.activeOnly) {
        const preN = byId[p.pre];
        if (preN && nodeVizMode(preN) !== "full" && !isTrailNode(p.pre)) continue;
      }
      const age = state.paused ? 0.42 + 0.08 * Math.sin(t / 900 + p.size) : (now - p.t0) / p.life;
      if (age < 0 || age > 1) continue;
      const mx = (a[0] + b[0]) / 2;
      const my = (a[1] + b[1]) / 2;
      const [px, py] = bezierPoint(a, b, mx, my, Math.min(1, age * (0.7 + p.speed * 200)));
      ctx.beginPath();
      ctx.fillStyle = p.sign < 0 ? "#fb7185" : "#e0f2fe";
      ctx.globalAlpha = 0.3 + (1 - age) * 0.7;
      ctx.arc(px, py, p.size * (1 - age * 0.35) * (p.pulse ? 1.1 : 1) * 0.85, 0, Math.PI * 2);
      ctx.fill();
      drawnP++;
    }
    ctx.globalAlpha = 1;

    const points = [];
    for (const n of c.nodes) {
      const mode = nodeVizMode(n);
      if (mode === "hide") continue;
      const s = screen[n.id];
      if (!s) continue;
      points.push({ n, px: s[0], py: s[1], pz: s[2], a: state.activity[n.id] || 0, mode });
    }
    points.sort((a, b) => a.pz - b.pz);
    for (const p of points) {
      if (p.mode === "ghost") {
        ctx.beginPath();
        ctx.fillStyle = "rgba(232,237,245,0.1)";
        ctx.globalAlpha = 0.35;
        ctx.arc(p.px, p.py, 1.6, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      const color = REGION_COLOR[p.n.region] || "#fff";
      const onTrail = isTrailNode(p.n.id);
      const r = 2.2 + p.a * 5 + (state.hoverId === p.n.id ? 3 : 0) + (onTrail ? 2 : 0);
      ctx.beginPath();
      ctx.fillStyle = onTrail ? (state.decisionTrail?.color || color) : color;
      ctx.globalAlpha = 0.2 + p.a * 0.6 + (onTrail ? 0.2 : 0);
      ctx.arc(p.px, p.py, r + 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.arc(p.px, p.py, 2 + p.a * 2, 0, Math.PI * 2);
      ctx.fill();
      if (state.hoverId === p.n.id || p.a > 0.7 || onTrail) {
        ctx.fillStyle = "#fff";
        ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
        ctx.globalAlpha = 0.9;
        ctx.fillText(p.n.type, p.px + 8, p.py - 6);
      }
    }
    ctx.globalAlpha = 1;

    drawDecisionTrail3d(ctx, screen, t);
  } else {
    getDecisionTrail(t); // expire trail UI even without circuit
  }

  // signal corridor
  const waveIdx = Math.max(0, PIPELINE.findIndex((s) => s.id === state.waveStage));
  const wy = -0.6 + waveIdx * 0.22;
  const [wx, wy2] = project3d(0, wy, 0, w, h, t);
  ctx.save();
  ctx.globalAlpha = 0.35 + (stages[state.waveStage]?.mean || 0) * 0.4;
  ctx.strokeStyle = PIPELINE[waveIdx]?.color || "#fbbf24";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(wx, wy2, 10 + (t % 600) / 60, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "rgba(139,149,168,0.75)";
  ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText("нейропиль · объёмы optic / central / DN / VNC", 14, 20);
  ctx.fillText(state.paused ? "пауза · перетащите для поворота" : "перетащите · повернуть · колесо · зум", 14, 36);
}

function findNodeAt(mx, my) {
  const c = state.circuit;
  if (!c) return null;
  const canvas = state.viewMode === "3d" && neuropilCanvas ? neuropilCanvas : brainCanvas;
  const rect = canvas.getBoundingClientRect();
  const x = ((mx - rect.left) / rect.width) * canvas.width;
  const y = ((my - rect.top) / rect.height) * canvas.height;
  let best = null;
  let bestD = state.viewMode === "3d" ? 22 : 18;

  if (state.viewMode === "3d") {
    const t = performance.now();
    for (const n of c.nodes) {
      if (nodeVizMode(n) !== "full") continue;
      const [nx, ny, nz] = nodeWorld3d(n);
      const [px, py] = project3d(nx, ny, nz, canvas.width, canvas.height, t);
      const d = Math.hypot(px - x, py - y);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best;
  }

  for (const n of c.nodes) {
    if (nodeVizMode(n) !== "full") continue;
    const [nx, ny] = nodePos(n, canvas.width, canvas.height);
    const d = Math.hypot(nx - x, ny - y);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

function showTip(node, clientX, clientY) {
  if (!node) {
    if (!state.tipPinned) brainTip.classList.add("hidden");
    return;
  }
  const act = state.activity[node.id] || 0;
  const inn = inboundSynapses(node.id);
  const out = outboundSynapses(node.id);
  const synIn = inn.reduce((s, e) => s + e.weight, 0);
  const synOut = out.reduce((s, e) => s + e.weight, 0);
  const role = ROLE_LABEL[node.role] || node.role;
  const urls = catalogUrls(node);
  const links = urls
    ? `<div class="links">
        <a href="${urls.explorer}" target="_blank" rel="noreferrer">Explorer</a>
        ${urls.explorerSide ? `<a class="secondary" href="${urls.explorerSide}" target="_blank" rel="noreferrer">${node.side}</a>` : ""}
        <a class="secondary" href="${urls.codex}" target="_blank" rel="noreferrer">Codex</a>
        <a class="secondary" href="${urls.flywire}" target="_blank" rel="noreferrer">FlyWire</a>
        ${urls.neuroglancer ? `<a class="secondary" href="${urls.neuroglancer}" target="_blank" rel="noreferrer">NG</a>` : ""}
      </div>`
    : "";
  brainTip.innerHTML = `
    <strong>${node.id.replaceAll("_", " ")}</strong>
    <div class="meta">${node.type} · ${node.side === "B" ? "bilateral" : node.side} · ${node.region}${node.layer ? ` / ${node.layer}` : ""}</div>
    <div class="row"><span>роль</span><span>${role}</span></div>
    <div class="row"><span>NT</span><span>${node.nt || "—"}</span></div>
    <div class="row"><span>клетки</span><span>${node.n_cells ?? 1}</span></div>
    <div class="row"><span>синапсы in/out</span><span>${synIn} / ${synOut}</span></div>
    <div class="row"><span>активность</span><span class="act">${act.toFixed(2)}${state.spikes[node.id] ? " · spike" : ""}</span></div>
    ${links}
    ${links ? `<div class="meta tip-help">Explorer · Codex · FlyWire · NG — каталоги типа</div>` : ""}
  `;
  brainTip.classList.toggle("has-links", !!urls);
  brainTip.classList.remove("hidden");
  const wrap = brainTip.parentElement.getBoundingClientRect();
  let left = clientX - wrap.left + 14;
  let top = clientY - wrap.top + 14;
  if (left + 220 > wrap.width) left = clientX - wrap.left - 230;
  if (top + 160 > wrap.height) top = clientY - wrap.top - 170;
  brainTip.style.left = `${Math.max(8, left)}px`;
  brainTip.style.top = `${Math.max(8, top)}px`;
}

function bindBrainPointer(canvas) {
  if (!canvas) return;
  canvas.addEventListener("mousemove", (e) => {
    if (state.tipPinned) return;
    if (canvas === neuropilCanvas && state.view3d.dragging) return;
    const node = findNodeAt(e.clientX, e.clientY);
    state.hoverId = node?.id || null;
    showTip(node, e.clientX, e.clientY);
  });
  canvas.addEventListener("mouseleave", () => {
    if (state.tipPinned) return;
    state.hoverId = null;
    brainTip.classList.add("hidden");
  });
  canvas.addEventListener("click", (e) => {
    if (canvas === neuropilCanvas && state.view3d.moved) {
      state.view3d.moved = false;
      return;
    }
    const node = findNodeAt(e.clientX, e.clientY);
    if (!node) {
      state.tipPinned = false;
      brainTip.classList.add("hidden");
      state.hoverId = null;
      return;
    }
    state.tipPinned = true;
    state.hoverId = node.id;
    showTip(node, e.clientX, e.clientY);
    const urls = catalogUrls(node);
    // second click on same while holding modifier opens explorer
    if (e.metaKey || e.ctrlKey) {
      if (urls?.explorer) window.open(urls.explorer, "_blank", "noopener");
    }
  });
}

function bindNeuropilOrbit(canvas) {
  if (!canvas) return;
  const cam = () => state.view3d;

  const endDrag = (e) => {
    const v = cam();
    if (!v.dragging) return;
    v.dragging = false;
    canvas.classList.remove("is-dragging");
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch (_) {
      /* already released */
    }
  };

  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const v = cam();
    v.dragging = true;
    v.moved = false;
    v.lastX = e.clientX;
    v.lastY = e.clientY;
    canvas.classList.add("is-dragging");
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener("pointermove", (e) => {
    const v = cam();
    if (!v.dragging) return;
    const dx = e.clientX - v.lastX;
    const dy = e.clientY - v.lastY;
    if (Math.hypot(dx, dy) > 2) v.moved = true;
    v.lastX = e.clientX;
    v.lastY = e.clientY;
    // drag right → yaw increases (model turns with the hand)
    v.yaw += dx * 0.008;
    v.pitch = Math.max(-1.15, Math.min(1.25, v.pitch + dy * 0.006));
  });

  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const v = cam();
      const factor = e.deltaY > 0 ? 0.92 : 1.08;
      v.zoom = Math.max(0.55, Math.min(2.2, (v.zoom || 1) * factor));
    },
    { passive: false }
  );
}

bindBrainPointer(brainCanvas);
bindBrainPointer(neuropilCanvas);
bindNeuropilOrbit(neuropilCanvas);
brainTip.addEventListener("mouseleave", () => {
  if (!state.tipPinned) return;
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && state.tipPinned) {
    state.tipPinned = false;
    brainTip.classList.add("hidden");
  }
});

function tick(ts) {
  if (!state.last) state.last = ts;
  const dt = ts - state.last;
  state.last = ts;
  if (state.started && !state.paused && !state.over) {
    state.acc += dt;
    const dropEvery = effectiveDropMs();
    if (state.acc >= dropEvery) {
      state.acc = 0;
      if (!move(0, 1)) lockPiece();
    }
    state.brainAcc += dt;
    if (state.brainAcc >= brainStepMs()) {
      state.brainAcc = 0;
      stepBrain();
    }
  }
  // Viz must never kill the gameplay RAF loop.
  try {
    drawBoard();
    if (state.viewMode === "3d") drawNeuropil3D(ts);
    else drawBrain(ts);
    drawRaster();
    if (typeof tickRateWorker === "function") tickRateWorker();
    if (state.showColumns && typeof drawColumnsOverlay === "function") drawColumnsOverlay();
  } catch (err) {
    console.warn("viz tick error", err);
  }
  requestAnimationFrame(tick);
}

function startGame() {
  state.grid = emptyGrid();
  state.bag = [];
  state.score = 0;
  state.lines = 0;
  state.level = 1;
  state.baseDropMs = 780;
  state.dropMs = effectiveDropMs();
  state.over = false;
  state.paused = false;
  state.started = true;
  state.hold = null;
  state.canHold = true;
  state.acc = 0;
  state.brainAcc = 0;
  state.next = takePiece();
  spawn();
  overlay.classList.add("hidden");
  if (btnPause) {
    btnPause.textContent = "Пауза";
    btnPause.classList.remove("is-paused");
  }
  updateHud();
}

function resetBrainViz() {
  if (state.circuit) {
    for (const n of state.circuit.nodes || []) {
      state.activity[n.id] = 0.05;
      state.spikes[n.id] = false;
    }
  } else {
    state.activity = {};
    state.spikes = {};
  }
  state.particles = [];
  state.decisionMarks = [];
  state.decisionTrail = null;
  clearDecisionTrailUi();
  state.raster = [];
  state.brainCooldown = 0;
  state.eventLog = [];
  state.processInfo = null;
  state.lastAction = "";
  state.thought = "ждёт зрительный вход…";
  state.wavePos = 0;
  state.waveStage = "photo";
  state.waveKick = 0;
  state.lastPeakStage = null;
  state.synBurstCooldown = 0;
  state.uiTick = 0;
  state.stageAct = Object.fromEntries(PIPELINE.map((s) => [s.id, { mean: 0, left: 0, right: 0, peakAt: 0 }]));
  state.popAvg = { optic: 0, central: 0, descending: 0, vnc: 0 };
  const thoughtEl = document.getElementById("thought");
  if (thoughtEl) thoughtEl.textContent = state.thought;
  for (const k of Object.keys(state.popAvg)) {
    const el = document.getElementById(`pop-${k}`);
    if (el) el.style.width = "0%";
  }
  if (waveBadge) waveBadge.textContent = "волна: фото";
  const peakEl = document.getElementById("stage-peak");
  const latEl = document.getElementById("stage-latency");
  if (peakEl) peakEl.textContent = "пик: —";
  if (latEl) latEl.textContent = "латентность: —";
  renderEventLog();
  renderProcess(null);
  renderDecisions({ left: 0, right: 0, rotate: 0, drop: 0 });
  if (pipelineEl) {
    for (const stage of PIPELINE) {
      const el = pipelineEl.querySelector(`[data-stage="${stage.id}"]`);
      if (el) {
        el.classList.remove("peak", "active");
      }
      const bl = document.getElementById(`pipe-${stage.id}-l`);
      const br = document.getElementById(`pipe-${stage.id}-r`);
      const vv = document.getElementById(`pipe-${stage.id}-v`);
      const lt = document.getElementById(`pipe-${stage.id}-lat`);
      if (bl) bl.style.height = "0%";
      if (br) br.style.height = "0%";
      if (vv) vv.textContent = "0.00";
      if (lt) lt.textContent = "—";
    }
  }
}

function restartGame() {
  // Keep current brain/human mode; clear board + viz and start immediately.
  resetBrainViz();
  state.current = null;
  startGame();
  pushEvent("decision", "рестарт партии");
}

function setMode(brain) {
  state.brainMode = brain;
  document.getElementById("btn-brain").classList.toggle("on", brain);
  document.getElementById("btn-human").classList.toggle("on", !brain);
}

document.getElementById("btn-brain").onclick = () => setMode(true);
document.getElementById("btn-human").onclick = () => setMode(false);
document.getElementById("btn-restart").onclick = () => restartGame();
btnPause?.addEventListener("click", () => togglePause());
document.getElementById("btn-filter-all")?.addEventListener("click", () => setStageFilter(null));
document.getElementById("btn-view-3d")?.addEventListener("click", () => setViewMode("3d"));
document.getElementById("btn-view-2d")?.addEventListener("click", () => setViewMode("2d"));
btnActiveOnly?.addEventListener("click", () => toggleActiveOnly());
speedInput?.addEventListener("input", () => setSpeed(speedInput.value));

window.addEventListener("keydown", (e) => {
  const k = e.key;
  if (k === "r" || k === "R") {
    e.preventDefault();
    restartGame();
    return;
  }
  if (k === "p" || k === "P") {
    e.preventDefault();
    togglePause();
    return;
  }
  if (k === " " && state.started && !state.over) {
    e.preventDefault();
    togglePause();
    return;
  }
  if (k === "b" || k === "B") {
    setMode(!state.brainMode);
    return;
  }
  if (!state.started || state.over) {
    if (k === " " || k === "Enter") {
      e.preventDefault();
      startGame();
    }
    return;
  }
  if (state.paused) return;
  if (k === "ArrowLeft") move(-1, 0);
  else if (k === "ArrowRight") move(1, 0);
  else if (k === "ArrowDown") {
    if (!move(0, 1)) lockPiece();
    state.score += 1;
    updateHud();
  } else if (k === "ArrowUp" || k === "x" || k === "X") rotate(1);
  else if (k === "Shift" || k === "Enter") {
    e.preventDefault();
    hardDrop();
    updateHud();
  } else if (k === "c" || k === "C") hold();
});

overlay.classList.remove("hidden");
overlayTitle.textContent = "нажми пробел";
overlay.addEventListener("click", () => {
  if (state.over) return;
  if (!state.started) startGame();
  else if (state.paused) setPaused(false);
});

setSpeed(1);
setViewMode("3d");

function updateSourceChrome(circuit) {
  const src = circuit?.source || {};
  const ds = src.dataset || state.dataset;
  const cite = document.getElementById("cite-dataset");
  if (cite) cite.innerHTML = `<code>${src.dataset_id || ds}</code>${src.sex ? ` · ${src.sex === "female" ? "♀" : src.sex === "male" ? "♂" : src.sex}` : ""}`;
  const scale = document.getElementById("cite-scale");
  if (scale) {
    const n = src.neurons ? `${src.neurons.toLocaleString?.() || src.neurons} нейронов` : "размер неизвестен";
    const s = src.synapses ? ` · ~${(src.synapses / 1e6).toFixed?.(0) || src.synapses}M синапсов` : "";
    scale.textContent = n + s + (src.scaffold ? " · scaffold" : "");
  }
  const ws = src.weight_stats;
  const wEl = document.getElementById("weight-stat");
  if (wEl) {
    wEl.textContent = ws
      ? `веса: explorer ${ws.explorer} · heuristic ${ws.heuristic} · mirror ${ws.mirror || 0}`
      : `веса: ${src.scaffold ? "scaffold / scaled" : "из контура"}`;
  }
  const note = document.getElementById("dataset-note");
  if (note) note.textContent = src.limitation || src.auth_blocker || src.note || "";
  const ng = document.getElementById("link-neuroglancer");
  if (ng && src.neuroglancer) ng.href = src.neuroglancer;
  const cx = document.getElementById("link-codex");
  if (cx) cx.href = src.codex || `${CODEX_BASE}?dataset=${encodeURIComponent(ds)}`;
  const brand = document.querySelector(".brand .mark");
  if (brand) brand.textContent = src.sex === "female" ? "♀" : src.sex === "male" ? "♂" : "◈";
  const h2 = document.querySelector(".brain-head h2");
  if (h2) h2.textContent = `живой контур ${src.name || ds}`;
}

function fillPathways(circuit) {
  const sel = document.getElementById("pathway-select");
  if (!sel) return;
  const items = circuit?.pathways || [];
  sel.innerHTML = `<option value="">весь контур</option>` + items.map((p) =>
    `<option value="${p.id}">${p.label || p.id}</option>`
  ).join("");
}

function applyCircuit(circuit, datasetId) {
  state.dataset = datasetId || circuit?.source?.dataset || "male-cns";
  state.circuit = circuit;
  state._nodeById = null;
  state.pathwayId = null;
  state.pathwayNodeSet = null;
  indexEdges(circuit);
  indexStages(circuit);
  buildPipelineDom();
  fillPathways(circuit);
  updateSourceChrome(circuit);
  resetBrainViz();
  for (const n of circuit.nodes || []) state.activity[n.id] = 0.05;
  const nTypes = circuit.source?.types_in_catalog ?? "—";
  const nNodes = circuit.nodes?.length ?? 0;
  const nEdges = circuit.edges?.length ?? 0;
  const cat = document.getElementById("catalog-stat");
  if (cat) cat.textContent = `каталог: ${nTypes} типов · контур: ${nNodes} узлов / ${nEdges} связей`;
  if (state.rateMode) initRateWorker(circuit);
  const dsSel = document.getElementById("dataset");
  if (dsSel && [...dsSel.options].some((o) => o.value === state.dataset)) dsSel.value = state.dataset;
}

async function loadDataset(id) {
  const r = await fetch(`/api/circuit?dataset=${encodeURIComponent(id)}`);
  const circuit = await r.json();
  state.circuits[id] = circuit;
  applyCircuit(circuit, id);
  pushEvent("decision", `датасет: ${id}`);
  if (!state.started) startGame();
  else restartGame();
}

function drawColumnsOverlay() {
  const canvas = document.getElementById("columns");
  if (!canvas) return;
  canvas.classList.toggle("hidden", !state.showColumns);
  if (!state.showColumns) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const colW = w / COLS;
  for (let c = 0; c < COLS; c++) {
    const x = c * colW;
    const side = c < COLS / 2 ? "L" : "R";
    const hue = side === "L" ? 270 : 200;
    ctx.fillStyle = `hsla(${hue}, 70%, 60%, 0.07)`;
    ctx.fillRect(x, 0, colW, h);
    ctx.strokeStyle = `hsla(${hue}, 80%, 70%, 0.35)`;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, h);
    ctx.stroke();
    ctx.fillStyle = `hsla(${hue}, 80%, 75%, 0.55)`;
    ctx.font = "10px ui-monospace, Menlo, monospace";
    ctx.fillText(`${side}${c % 5}`, x + 4, 14);
  }
  ctx.fillStyle = "rgba(232,237,245,0.55)";
  ctx.font = "11px system-ui, sans-serif";
  ctx.fillText("optic columns ← Tetris field", 8, h - 10);
}

function renderCompare() {
  const panel = document.getElementById("compare-panel");
  const chart = document.getElementById("compare-chart");
  const note = document.getElementById("compare-note");
  if (!panel || !chart) return;
  const data = state.compareData;
  if (!data) return;
  if (note) {
    if (data.fafb_scaffold) {
      // Short RU steps only — avoid dumping long English auth walls into the UI.
      const tip = (data.auth_blocker || "").trim();
      note.textContent = tip
        ? tip
        : "FAFB scaffold. Скачай CSV: python3 scripts/fetch_fafb.py (зеркало без логина) или положи файлы в data/raw/fafb/.";
    } else {
      note.textContent = "Реальные агрегаты FAFB (CSV).";
    }
  }
  const rows = data.rows || [];
  const max = Math.max(1, ...rows.map((r) => Math.max(r.male_mcns, r.female_fafb)));
  chart.innerHTML = rows.slice(0, 18).map((r) => `
    <div class="compare-row">
      <code>${r.type}</code>
      <div class="bars">
        <div class="bar male" title="♂ ${r.male_mcns}"><i style="width:${(100 * r.male_mcns / max).toFixed(1)}%"></i></div>
        <div class="bar female" title="♀ ${r.female_fafb}"><i style="width:${(100 * r.female_fafb / max).toFixed(1)}%"></i></div>
      </div>
    </div>`).join("");
  panel.classList.remove("hidden");
}

function initRateWorker(circuit) {
  if (state.rateWorker) {
    state.rateWorker.terminate();
    state.rateWorker = null;
  }
  try {
    const w = new Worker("/web/rate_worker.js");
    state.rateWorker = w;
    w.onmessage = (ev) => {
      const msg = ev.data || {};
      if (msg.type === "state" && state.rateMode) {
        state.rateSynOps = msg.synOps || 0;
        Object.assign(state.activity, msg.rates || {});
        Object.assign(state.spikes, msg.spikes || {});
        const el = document.getElementById("rate-stat");
        if (el) {
          el.classList.remove("hidden");
          el.textContent = `rate: ~${state.rateSynOps} syn-ops / tick · worker`;
        }
      }
    };
    w.postMessage({ type: "init", nodes: circuit.nodes, edges: effectiveEdges() });
  } catch (err) {
    console.warn("rate worker failed", err);
    state.rateMode = false;
  }
}

function tickRateWorker() {
  if (!state.rateMode || !state.rateWorker || !state.circuit) return;
  const drive = sensoryDrive();
  const input = {
    "R1-R6_L": Math.max(state.activity["R1-R6_L"] || 0, drive.visualL),
    "R1-R6_R": Math.max(state.activity["R1-R6_R"] || 0, drive.visualR),
    DNg13_L: drive.steerLeft * 1.45,
    DNg13_R: drive.steerRight * 1.45,
    DNa02: (drive.needRotate || 0) * 1.15,
    IN17A025_L: (drive.needDrop || 0) * 0.95,
    IN17A025_R: (drive.needDrop || 0) * 0.95,
  };
  for (const n of state.circuit.nodes || []) {
    if ((n.type === "R1-R6" || n.role === "photoreceptor") && (state.activity[n.id] || 0) > 0.1) {
      input[n.id] = Math.max(input[n.id] || 0, state.activity[n.id]);
    }
  }
  state.rateWorker.postMessage({ type: "input", input });
  state.rateWorker.postMessage({ type: "tick", steps: 4 });
}

document.getElementById("dataset")?.addEventListener("change", (e) => {
  loadDataset(e.target.value).catch((err) => {
    console.warn(err);
    pushEvent("decision", `не удалось загрузить ${e.target.value}`);
  });
});
document.getElementById("sex-play")?.addEventListener("change", (e) => {
  state.sexPlay = e.target.value;
  pushEvent("decision", `геймплей веса: ${state.sexPlay}`);
  if (state.rateWorker) state.rateWorker.postMessage({ type: "init", nodes: state.circuit.nodes, edges: effectiveEdges() });
});
document.getElementById("pathway-select")?.addEventListener("change", (e) => {
  const id = e.target.value || null;
  state.pathwayId = id;
  if (!id) {
    state.pathwayNodeSet = null;
    return;
  }
  const p = (state.circuit?.pathways || []).find((x) => x.id === id);
  state.pathwayNodeSet = new Set(p?.nodes || []);
  pushEvent("wave", `путь: ${p?.label || id}`);
});
document.getElementById("btn-columns")?.addEventListener("click", (e) => {
  state.showColumns = !state.showColumns;
  e.currentTarget.classList.toggle("on", state.showColumns);
  drawColumnsOverlay();
});
document.getElementById("btn-compare")?.addEventListener("click", () => {
  const panel = document.getElementById("compare-panel");
  if (!panel) return;
  if (!panel.classList.contains("hidden")) {
    panel.classList.add("hidden");
    return;
  }
  if (state.compareData) renderCompare();
  else {
    fetch("/api/compare").then((r) => r.json()).then((d) => {
      state.compareData = d;
      renderCompare();
    });
  }
});
document.getElementById("btn-compare-close")?.addEventListener("click", () => {
  document.getElementById("compare-panel")?.classList.add("hidden");
});
document.getElementById("btn-nt-color")?.addEventListener("click", (e) => {
  state.ntColor = !state.ntColor;
  e.currentTarget.classList.toggle("on", state.ntColor);
});
document.getElementById("btn-rate")?.addEventListener("click", (e) => {
  state.rateMode = !state.rateMode;
  e.currentTarget.classList.toggle("on", state.rateMode);
  const el = document.getElementById("rate-stat");
  if (state.rateMode && state.circuit) {
    initRateWorker(state.circuit);
    if (el) el.classList.remove("hidden");
  } else {
    state.rateWorker?.terminate();
    state.rateWorker = null;
    // Hand gameplay back to local controller from a calm baseline.
    if (state.circuit) {
      for (const n of state.circuit.nodes || []) {
        state.activity[n.id] = 0.05;
        state.spikes[n.id] = false;
      }
    }
    if (el) el.classList.add("hidden");
  }
});

Promise.all([
  fetch("/api/circuit?dataset=male-cns").then((r) => r.json()),
  fetch("/api/circuit?dataset=fafb").then((r) => r.json()).catch(() => null),
  fetch("/api/nt").then((r) => r.json()).catch(() => null),
  fetch("/api/compare").then((r) => r.json()).catch(() => null),
])
  .then(([mcns, fafb, nt, compare]) => {
    state.circuits["male-cns"] = mcns;
    if (fafb) state.circuits.fafb = fafb;
    state.ntPalette = nt;
    state.compareData = compare;
    applyCircuit(mcns, "male-cns");
    startGame();
  })
  .catch(() => {
    document.getElementById("catalog-stat").textContent = "контур не найден — запусти scripts/build_circuit.py";
    buildPipelineDom();
    renderEventLog();
    startGame();
  });

requestAnimationFrame(tick);
updateHud();
buildPipelineDom();
renderEventLog();
renderProcess(null);
initUiTips();

/** Visible pop-out tips for controls (hover / focus / long-press). */
function initUiTips() {
  const tipEl = document.getElementById("ui-tip");
  if (!tipEl) return;

  const TIP_SEL = [
    "button[title], button[data-tip]",
    "a[title], a[data-tip]",
    "select[title], select[data-tip]",
    'input[type="range"][title], input[type="range"][data-tip]',
    "label.ds-switch[title], label.ds-switch[data-tip]",
    "label.speed-ctl[title], label.speed-ctl[data-tip]",
    ".pipe-stage[title], .pipe-stage[data-tip]",
    "summary[title], summary[data-tip]",
  ].join(", ");

  let active = null;
  let hideTimer = 0;
  let longPressTimer = 0;
  let touchLockedUntil = 0;

  function tipText(el) {
    if (!el) return "";
    if (!el.dataset.tip) {
      const t = el.getAttribute("title");
      if (t) {
        el.dataset.tip = t;
        el.removeAttribute("title");
      }
    }
    return el.dataset.tip || "";
  }

  function findTipTarget(node) {
    if (!node || !(node instanceof Element)) return null;
    if (node.closest("#brain-tip, #ui-tip, .brain-wrap canvas")) return null;
    return node.closest(TIP_SEL);
  }

  function placeTip(anchor) {
    const text = tipText(anchor);
    if (!text) {
      hideTip(true);
      return;
    }
    tipEl.hidden = false;
    tipEl.textContent = text;
    tipEl.classList.remove("is-visible");
    // Force layout so size is known before positioning.
    tipEl.style.setProperty("--tip-x", "0px");
    tipEl.style.setProperty("--tip-y", "0px");

    const pad = 8;
    const gap = 10;
    const r = anchor.getBoundingClientRect();
    const tw = tipEl.offsetWidth;
    const th = tipEl.offsetHeight;
    const preferAbove = r.top >= th + gap + pad;
    const place = preferAbove ? "above" : "below";
    let top = place === "above" ? r.top - th - gap : r.bottom + gap;
    let left = r.left + r.width / 2 - tw / 2;
    left = Math.max(pad, Math.min(left, window.innerWidth - tw - pad));
    top = Math.max(pad, Math.min(top, window.innerHeight - th - pad));

    const arrowX = Math.max(12, Math.min(r.left + r.width / 2 - left, tw - 12));
    tipEl.dataset.place = place;
    tipEl.style.setProperty("--tip-x", `${Math.round(left)}px`);
    tipEl.style.setProperty("--tip-y", `${Math.round(top)}px`);
    tipEl.style.setProperty("--tip-arrow-x", `${Math.round(arrowX)}px`);
    tipEl.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => tipEl.classList.add("is-visible"));
  }

  function showTip(anchor) {
    if (!anchor) {
      hideTip(true);
      return;
    }
    clearTimeout(hideTimer);
    active = anchor;
    placeTip(anchor);
  }

  function hideTip(immediate = false) {
    clearTimeout(hideTimer);
    const clear = () => {
      active = null;
      tipEl.classList.remove("is-visible");
      tipEl.setAttribute("aria-hidden", "true");
      const finish = () => {
        if (!tipEl.classList.contains("is-visible")) tipEl.hidden = true;
      };
      if (immediate) finish();
      else setTimeout(finish, 130);
    };
    if (immediate) clear();
    else hideTimer = setTimeout(clear, 40);
  }

  document.addEventListener(
    "pointerover",
    (e) => {
      if (e.pointerType === "touch") return;
      if (Date.now() < touchLockedUntil) return;
      const el = findTipTarget(e.target);
      if (el) showTip(el);
    },
    true
  );

  document.addEventListener(
    "pointerout",
    (e) => {
      if (e.pointerType === "touch") return;
      if (!active) return;
      const next = e.relatedTarget instanceof Element ? e.relatedTarget : null;
      if (next && active.contains(next)) return;
      if (next && findTipTarget(next) === active) return;
      hideTip();
    },
    true
  );

  document.addEventListener(
    "focusin",
    (e) => {
      const el = findTipTarget(e.target);
      if (el) showTip(el);
    },
    true
  );

  document.addEventListener(
    "focusout",
    (e) => {
      if (!active) return;
      const next = e.relatedTarget instanceof Element ? e.relatedTarget : null;
      if (next && findTipTarget(next) === active) return;
      hideTip();
    },
    true
  );

  document.addEventListener(
    "touchstart",
    (e) => {
      const el = findTipTarget(e.target);
      clearTimeout(longPressTimer);
      if (!el) {
        hideTip(true);
        return;
      }
      longPressTimer = setTimeout(() => {
        touchLockedUntil = Date.now() + 900;
        showTip(el);
      }, 420);
    },
    { passive: true, capture: true }
  );

  document.addEventListener(
    "touchend",
    () => {
      clearTimeout(longPressTimer);
      if (active) {
        touchLockedUntil = Date.now() + 900;
        hideTimer = setTimeout(() => hideTip(true), 1100);
      }
    },
    { passive: true, capture: true }
  );

  document.addEventListener(
    "touchmove",
    () => {
      clearTimeout(longPressTimer);
    },
    { passive: true, capture: true }
  );

  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape") hideTip(true);
    },
    true
  );

  window.addEventListener(
    "scroll",
    () => {
      if (active) hideTip(true);
    },
    true
  );

  window.addEventListener("resize", () => {
    if (active) hideTip(true);
  });
}
