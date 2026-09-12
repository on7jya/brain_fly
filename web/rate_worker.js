/**
 * Rate-network worker: leaky integrator over synapse edges.
 * Runs thousands of synaptic updates off the main thread.
 */
let nodes = [];
let edges = [];
let rates = {};
let dt = 0.02;
let tau = 0.18;
let input = {};

function step() {
  const next = {};
  for (const id of nodes) {
    let drive = input[id] || 0;
    for (const e of edges) {
      if (e.post !== id) continue;
      const pre = rates[e.pre] || 0;
      drive += e.sign * Math.log1p(e.weight) * 0.08 * pre;
    }
    const cur = rates[id] || 0.05;
    const target = 1 / (1 + Math.exp(-drive));
    next[id] = cur + (target - cur) * (dt / tau);
  }
  rates = next;
  const spikes = {};
  for (const id of nodes) {
    spikes[id] = (rates[id] || 0) > 0.72;
  }
  return { rates, spikes };
}

self.onmessage = (ev) => {
  const msg = ev.data || {};
  if (msg.type === "init") {
    nodes = (msg.nodes || []).map((n) => n.id || n);
    edges = (msg.edges || []).map((e) => ({
      pre: e.pre,
      post: e.post,
      weight: e.weight || 1,
      sign: e.sign ?? 1,
    }));
    rates = {};
    for (const id of nodes) rates[id] = 0.05;
    self.postMessage({ type: "ready", nNodes: nodes.length, nEdges: edges.length });
    return;
  }
  if (msg.type === "input") {
    input = msg.input || {};
    return;
  }
  if (msg.type === "tick") {
    const n = Math.max(1, Math.min(40, msg.steps || 1));
    let out = null;
    for (let i = 0; i < n; i++) out = step();
    self.postMessage({ type: "state", ...out, synOps: n * edges.length });
  }
};
