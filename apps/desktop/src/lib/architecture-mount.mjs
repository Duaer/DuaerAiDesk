/**
 * Mount Archify architecture HTML into a page host (no iframe).
 * Full styles + viewer runtime (motion overlays) via Shadow DOM and a
 * document proxy scoped to `.archify-root`. Desk clicks open fullscreen
 * present view; embed node zoom is disabled.
 *
 * Must include the full <body> chrome (toolbar buttons etc.) — Archify's
 * viewer script null-derefs if #btn-preset / #btn-theme are missing.
 */

function architectureKeyFromUrl(url) {
  const raw = String(url || "");
  const m = raw.match(/\/api\/architecture\/([a-f0-9]+)\.html/i);
  return m ? m[1].toLowerCase() : "";
}

/**
 * Retarget document-level Archify selectors to the in-shadow root.
 * Avoid data-embed mode — it strips motion overlays / passport.
 */
function scopeArchifyCss(css) {
  let out = String(css || "")
    .replace(/:root\b/g, ".archify-root")
    .replace(/html\[/g, ".archify-root[")
    .replace(/\bhtml\b/g, ".archify-root")
    .replace(/\bbody\b/g, ".archify-root");
  for (let i = 0; i < 3; i += 1) {
    out = out.replace(
      /\.archify-root((?:\[[^\]]*\])*)\s+\.archify-root\b/g,
      ".archify-root$1",
    );
  }
  return out;
}

function hostChromeCss() {
  return `
:host {
  display: block;
  position: relative;
  width: 100%;
  height: auto !important;
  min-height: 0 !important;
  max-height: none !important;
  background: transparent;
  color: #e8eef7;
  overflow: visible !important;
}
:host([hidden]) { display: none !important; }
.archify-root {
  position: relative;
  display: block;
  width: 100%;
  /* Kill Archify reader viewport lock (body/html min-height:100vh, container 100dvh). */
  height: auto !important;
  min-height: 0 !important;
  max-height: none !important;
  margin: 0 !important;
  padding: 0 !important;
  background: transparent;
  color: var(--text, #e8eef7);
  overflow: visible !important;
  box-sizing: border-box;
  font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
/* Desk: hide Archify chrome; keep diagram FX.
   DOM nodes stay present so the viewer script can bind them.
   focus-chip stays hidden — click opens fullscreen, not node passport. */
.archify-root .toolbar,
.archify-root .header,
.archify-root .cards,
.archify-root .diagram-nav,
.archify-root .overview-map,
.archify-root .route-probe,
.archify-root .semantic-lens,
.archify-root .diagram-guide,
.archify-root .node-finder,
.archify-root .guided-views,
.archify-root .share-chapter-cue,
.archify-root .export-wrap,
.archify-root .preset-wrap,
.archify-root .present-wrap {
  display: none !important;
}
.archify-root .container {
  display: block !important;
  width: 100% !important;
  max-width: none !important;
  height: auto !important;
  min-height: 0 !important;
  max-height: none !important;
  margin: 0 !important;
  padding: 0 !important;
}
.archify-root .diagram-container {
  display: block !important;
  width: 100% !important;
  height: auto !important;
  min-height: 0 !important;
  max-height: none !important;
  overflow: visible !important;
  position: relative !important;
  margin: 0 !important;
  padding: 20px 12px 12px !important;
  box-sizing: border-box !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
}
.archify-root .diagram-container svg {
  display: block !important;
  /* Authored size. A single node must not stretch to the panel width. */
  width: auto !important;
  max-width: 100% !important;
  height: auto !important;
  max-height: none !important;
  margin: 0 auto !important;
  overflow: visible !important;
}
.archify-root .focus-chip {
  display: none !important;
}
`;
}

/** Task graph: full width, natural height, scroll, click-to-zoom. */
function graphChromeCss() {
  return `
:host {
  display: block;
  position: relative;
  width: 100%;
  height: 100% !important;
  min-height: 0 !important;
  max-height: none !important;
  background: transparent;
  color: #e8eef7;
  overflow: hidden !important;
}
:host([hidden]) { display: none !important; }
.archify-root {
  position: relative;
  display: block;
  width: 100%;
  height: 100% !important;
  min-height: 0 !important;
  max-height: none !important;
  margin: 0 !important;
  padding: 0 !important;
  background: transparent;
  color: var(--text, #e8eef7);
  overflow: hidden !important;
  box-sizing: border-box;
}
.archify-root .toolbar,
.archify-root .header,
.archify-root .cards,
.archify-root .diagram-nav,
.archify-root .overview-map,
.archify-root .route-probe,
.archify-root .semantic-lens,
.archify-root .diagram-guide,
.archify-root .node-finder,
.archify-root .guided-views,
.archify-root .share-chapter-cue,
.archify-root .export-wrap,
.archify-root .preset-wrap,
.archify-root .present-wrap,
.archify-root .focus-chip {
  display: none !important;
}
.archify-root .container {
  display: block !important;
  width: 100% !important;
  max-width: none !important;
  height: 100% !important;
  min-height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
}
.archify-root .diagram-container {
  display: block !important;
  width: 100% !important;
  height: 100% !important;
  min-height: 0 !important;
  overflow: hidden !important;
  position: relative !important;
  margin: 0 !important;
  padding: 0 !important;
  box-sizing: border-box !important;
  border: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
}
.archify-root .diagram-container svg {
  display: block !important;
  width: 100% !important;
  max-width: none !important;
  height: 100% !important;
  max-height: none !important;
  margin: 0 !important;
}
.archify-root .diagram-container [data-node-id] {
  cursor: pointer;
}
`;
}

/** Dispatch-center stage: fill the page; passport stays in place. */
function stageChromeCss() {
  return `
:host {
  display: block;
  position: relative;
  width: 100%;
  height: 100% !important;
  min-height: 0 !important;
  max-height: none !important;
  background: #020617;
  color: #e8eef7;
  overflow: hidden !important;
}
:host([hidden]) { display: none !important; }
.archify-root {
  position: relative;
  width: 100%;
  height: 100% !important;
  min-height: 0 !important;
  max-height: none !important;
  margin: 0 !important;
  padding: 0 !important;
  background: var(--bg, #020617);
  color: var(--text, #e8eef7);
  overflow: hidden !important;
  box-sizing: border-box;
}
.archify-root .toolbar,
.archify-root .header,
.archify-root .cards,
.archify-root .diagram-nav,
.archify-root .overview-map,
.archify-root .route-probe,
.archify-root .semantic-lens,
.archify-root .diagram-guide,
.archify-root .node-finder,
.archify-root .guided-views,
.archify-root .share-chapter-cue,
.archify-root .export-wrap,
.archify-root .preset-wrap,
.archify-root .present-wrap {
  display: none !important;
}
.archify-root .container {
  display: block !important;
  width: 100% !important;
  max-width: none !important;
  height: 100% !important;
  min-height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
}
.archify-root .diagram-container {
  display: block !important;
  width: 100% !important;
  height: 100% !important;
  min-height: 0 !important;
  overflow: auto !important;
  position: relative !important;
  padding: 12px !important;
  box-sizing: border-box !important;
  border: 0 !important;
  border-radius: 0 !important;
  box-shadow: none !important;
}
.archify-root .diagram-container svg {
  display: block !important;
  width: 100% !important;
  height: auto !important;
  max-height: none !important;
}
`;
}

function isJsonScript(el) {
  const type = String(el.getAttribute("type") || "").toLowerCase();
  if (type === "application/json") return true;
  const id = el.id || "";
  return (
    id === "archify-i18n-data" ||
    id === "archify-guided-views-data" ||
    id === "archify-source-evidence-data"
  );
}

function isViewerMainScript(el) {
  if (el.id === "duaer-embed-node-zoom") return false;
  const type = String(el.getAttribute("type") || "").toLowerCase();
  if (type && type !== "text/javascript" && type !== "module") return false;
  const body = el.textContent || "";
  return body.includes("var Archify") || /Archify\s*=\s*\{\}/.test(body);
}

function parseArchifyHtml(html) {
  const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
  const theme =
    doc.documentElement.getAttribute("data-theme") ||
    doc.body?.getAttribute("data-theme") ||
    "dark";
  const preset =
    doc.documentElement.getAttribute("data-preset") ||
    doc.body?.getAttribute("data-preset") ||
    "classic";
  const lang = doc.documentElement.getAttribute("lang") || "en";

  /** @type {{ id: string, css: string }[]} */
  const styles = [];
  for (const el of doc.querySelectorAll("style")) {
    if (el.id === "duaer-embed-fit") continue;
    const css = String(el.textContent || "").trim();
    if (!css) continue;
    styles.push({ id: el.id || "", css });
  }

  if (!doc.querySelector(".container svg, .diagram-container svg, svg[viewBox]")) {
    throw new Error("architecture svg missing");
  }

  // Full body markup — toolbar + container + focus-chip + overlays.
  // Strip executable scripts (we re-run the viewer via new Function).
  const bodyClone = doc.body.cloneNode(true);
  for (const el of [...bodyClone.querySelectorAll("script")]) {
    if (isJsonScript(el)) continue;
    el.remove();
  }
  const bodyHtml = bodyClone.innerHTML;

  let main = "";
  for (const el of doc.querySelectorAll("script")) {
    if (isViewerMainScript(el)) {
      main = el.textContent || "";
      break;
    }
  }

  return { theme, preset, lang, styles, bodyHtml, main };
}

function createScopedDocument(rootEl, shadow) {
  const real = document;
  const scoped = {
    documentElement: rootEl,
    body: rootEl,
    head: shadow,
    getElementById: (id) => shadow.getElementById(id),
    querySelector: (sel) => {
      const s = String(sel || "");
      if (s === "html" || s === ":root" || s === "body") return rootEl;
      if (s.startsWith("html")) {
        try {
          return rootEl.matches(s.replace(/^html/, "*")) ? rootEl : null;
        } catch {
          return null;
        }
      }
      try {
        if (rootEl.matches?.(s)) return rootEl;
      } catch {
        /* invalid for Element.matches */
      }
      return shadow.querySelector(s);
    },
    querySelectorAll: (sel) => {
      const s = String(sel || "");
      if (s === "html" || s === ":root" || s === "body") return [rootEl];
      return shadow.querySelectorAll(s);
    },
    getElementsByClassName: (name) =>
      shadow.querySelectorAll(`.${CSS.escape(String(name))}`),
    getElementsByTagName: (tag) => {
      const t = String(tag || "*").toLowerCase();
      if (t === "html" || t === "body") return [rootEl];
      return shadow.querySelectorAll(t);
    },
    createElement: (...a) => real.createElement(...a),
    createElementNS: (...a) => real.createElementNS(...a),
    createTextNode: (...a) => real.createTextNode(...a),
    createComment: (...a) => real.createComment(...a),
    createDocumentFragment: () => real.createDocumentFragment(),
    createTreeWalker: (root, ...rest) =>
      real.createTreeWalker(root || rootEl, ...rest),
    createRange: () => real.createRange(),
    adoptNode: (n) => real.adoptNode(n),
    importNode: (n, deep) => real.importNode(n, deep),
    addEventListener: (...a) => rootEl.addEventListener(...a),
    removeEventListener: (...a) => rootEl.removeEventListener(...a),
    dispatchEvent: (...a) => rootEl.dispatchEvent(...a),
    hasFocus: () => shadow.activeElement != null,
    get activeElement() {
      return shadow.activeElement || rootEl;
    },
    get defaultView() {
      return window;
    },
    get location() {
      return real.location;
    },
    get visibilityState() {
      return real.visibilityState;
    },
    get hidden() {
      return real.hidden;
    },
  };

  return new Proxy(scoped, {
    get(target, prop) {
      if (prop in target) return target[prop];
      const v = real[prop];
      return typeof v === "function" ? v.bind(real) : v;
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  });
}

/**
 * Desk mounts open fullscreen on click; do not zoom/enlarge nodes in-embed.
 * Keep Archify.view.reveal as a no-op so residual handlers cannot frame zoom.
 */
function disableEmbedNodeZoom(Archify) {
  if (!Archify?.view || typeof Archify.view.reveal !== "function") return;
  if (Archify.view.__duaerEmbedNoZoom) return;
  Archify.view.reveal = function duaerNoZoomReveal() {
    /* desk: click opens present fullscreen instead */
  };
  Archify.view.__duaerEmbedNoZoom = true;
}

/**
 * One elbow through the gutter between two node boxes.
 * Same-column nodes stay a vertical segment.
 * @param {{ x: number, y: number, width: number, height: number }} from
 * @param {{ x: number, y: number, width: number, height: number }} to
 * @param {number} gutterX
 */
export function routeTaskEdge(from, to, gutterX) {
  const fromCy = from.y + from.height / 2;
  const toCy = to.y + to.height / 2;
  const fromCx = from.x + from.width / 2;
  const toCx = to.x + to.width / 2;
  const gx = Math.round(gutterX);
  /** @type {number[][]} */
  let points;
  if (Math.abs(fromCx - toCx) < 48) {
    const downward = from.y + from.height <= to.y + 4;
    points = [
      [Math.round(fromCx), Math.round(downward ? from.y + from.height : from.y)],
      [Math.round(toCx), Math.round(downward ? to.y : to.y + to.height)],
    ];
  } else if (to.x >= from.x + from.width - 4) {
    points = [
      [Math.round(from.x + from.width), Math.round(fromCy)],
      [gx, Math.round(fromCy)],
      [gx, Math.round(toCy)],
      [Math.round(to.x), Math.round(toCy)],
    ];
  } else {
    points = [
      [Math.round(from.x), Math.round(fromCy)],
      [gx, Math.round(fromCy)],
      [gx, Math.round(toCy)],
      [Math.round(to.x + to.width), Math.round(toCy)],
    ];
  }
  return {
    d: points.map((point, index) => `${index ? "L" : "M"} ${point[0]} ${point[1]}`).join(" "),
    points: points.map((point) => `${point[0]},${point[1]}`).join(";"),
  };
}

/** Shift a logical point so a screen delta lands on the visible center. */
export function zoomLogicalPoint(cx, cy, deltaX, deltaY, denom) {
  if (!Number.isFinite(denom) || denom === 0) return { x: cx, y: cy };
  return { x: cx - deltaX / denom, y: cy - deltaY / denom };
}

function nodeBox(el) {
  const rect = el.querySelector("rect[width]");
  if (!rect) {
    const box = el.getBBox();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  }
  return {
    x: Number(rect.getAttribute("x")) || 0,
    y: Number(rect.getAttribute("y")) || 0,
    width: Number(rect.getAttribute("width")) || 0,
    height: Number(rect.getAttribute("height")) || 0,
  };
}

/** Replace outer detours with one shared gutter elbow per column pair. */
function straightenTaskEdges(svg) {
  if (!svg) return;
  const boxes = new Map();
  for (const el of svg.querySelectorAll("[data-node-id]")) {
    const id = el.getAttribute("data-node-id");
    if (id) boxes.set(id, nodeBox(el));
  }
  const gutters = new Map();
  const gutterFor = (from, to) => {
    const fromCol = Math.round((from.x + from.width / 2) / 80);
    const toCol = Math.round((to.x + to.width / 2) / 80);
    const key = `${fromCol}>${toCol}`;
    if (gutters.has(key)) return gutters.get(key);
    const gap = to.x >= from.x + from.width - 4
      ? (from.x + from.width + to.x) / 2
      : (to.x + to.width + from.x) / 2;
    gutters.set(key, gap);
    return gap;
  };
  for (const edge of svg.querySelectorAll("[data-edge-from][data-edge-to]")) {
    const from = boxes.get(edge.getAttribute("data-edge-from"));
    const to = boxes.get(edge.getAttribute("data-edge-to"));
    if (!from || !to) continue;
    const route = routeTaskEdge(from, to, gutterFor(from, to));
    edge.setAttribute("d", route.d);
    edge.setAttribute("data-composition-points", route.points);
  }
}

function alignGraphToScrollport(host) {
  const graph = host.closest(".dispatch-graph");
  if (!graph) return;
  let scroller = graph.parentElement;
  while (scroller) {
    const style = getComputedStyle(scroller);
    if (scroller.scrollHeight > scroller.clientHeight + 8 && /(auto|scroll)/.test(style.overflowY)) break;
    scroller = scroller.parentElement;
  }
  if (!scroller || scroller === document.body) return;
  const delta = graph.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
  scroller.scrollTop += delta - 8;
}

function centerRevealedNode(Archify, host, ids) {
  const id = String((Array.isArray(ids) ? ids[0] : ids) || "");
  if (!id || !host?.shadowRoot || !Archify?.view?.centerAt) return;
  const node = host.shadowRoot.querySelector(`[data-node-id="${CSS.escape(id)}"]`);
  const svg = node?.ownerSVGElement;
  if (!node || !svg) return;
  alignGraphToScrollport(host);
  const box = nodeBox(node);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const container = host.shadowRoot.querySelector(".diagram-container");
  svg.style.transition = "none";
  Archify.view.centerAt(cx, cy, { scale: 2.2, minimumScale: 2.2 });
  container?.classList.remove("is-camera-moving");
  svg.style.transition = "none";
  const rect = node.getBoundingClientRect();
  const bounds = container?.getBoundingClientRect();
  if (!bounds) return;
  const viewTop = Math.max(bounds.top, 0);
  const viewBottom = Math.min(bounds.bottom, window.innerHeight);
  const viewLeft = Math.max(bounds.left, 0);
  const viewRight = Math.min(bounds.right, window.innerWidth);
  if (viewBottom - viewTop < 80 || viewRight - viewLeft < 80) return;
  const deltaX = (viewLeft + viewRight) / 2 - (rect.left + rect.width / 2);
  const deltaY = (viewTop + viewBottom) / 2 - (rect.top + rect.height / 2);
  if (Math.abs(deltaX) < 4 && Math.abs(deltaY) < 4) return;
  const state = Archify.view.state?.() || { scale: 2.2, x: 0, y: 0 };
  const vb = svg.viewBox?.baseVal;
  if (!vb?.width || !vb?.height || !state.scale) return;
  const metricsScale = Math.min((svg.clientWidth || 1) / vb.width, (svg.clientHeight || 1) / vb.height);
  const width = svg.clientWidth || 1;
  const height = svg.clientHeight || 1;
  const offsetX = (width - vb.width * metricsScale) / 2;
  const offsetY = (height - vb.height * metricsScale) / 2;
  const contentX = (width / 2 - state.x) / state.scale;
  const contentY = (height / 2 - state.y) / state.scale;
  const logicalX = vb.x + (contentX - offsetX) / metricsScale;
  const logicalY = vb.y + (contentY - offsetY) / metricsScale;
  const shifted = zoomLogicalPoint(logicalX, logicalY, deltaX, deltaY, state.scale * metricsScale);
  svg.style.transition = "none";
  Archify.view.centerAt(shifted.x, shifted.y, { scale: state.scale, minimumScale: state.scale });
  container?.classList.remove("is-camera-moving");
  svg.style.transition = "none";
}

/**
 * Dispatch-center stage is already full page. Clicking a node should still
 * enlarge that node (Archify reveal), including hubs that would stay at scale 1,
 * and land that node in the middle of the visible graph.
 */
function enableStageNodeZoom(Archify, host) {
  if (!Archify?.view || typeof Archify.view.reveal !== "function") return;
  if (Archify.view.__duaerStageZoom) return;
  const original = Archify.view.reveal;
  Archify.view.reveal = function duaerStageZoomReveal(ids, options) {
    const svg = host?.shadowRoot?.querySelector(".archify-root svg");
    straightenTaskEdges(svg);
    const opts = Object.assign({}, options || {}, {
      includeNeighbors: false,
      maxScale: 2.2,
      padding: 64,
      instant: true,
    });
    const result = original.call(this, ids, opts);
    centerRevealedNode(Archify, host, ids);
    return result;
  };
  Archify.view.__duaerStageZoom = true;
}

function runViewerScript(code, scopedDocument, opts = {}) {
  if (!code) return null;
  const runner = new Function(
    "document",
    "window",
    `"use strict";\n${code}\n;return typeof Archify !== "undefined" ? Archify : null;`,
  );
  const Archify = runner(scopedDocument, window);
  if (opts.zoom) enableStageNodeZoom(Archify, opts.host);
  else disableEmbedNodeZoom(Archify);
  return Archify;
}

/**
 * @param {HTMLElement} host
 * @param {{ url: string, ir?: object|null, stage?: boolean }} opts
 */
export async function mountArchitectureDiagram(host, opts = {}) {
  if (!host) return false;
  const url = String(opts.url || host.dataset.archUrl || "").trim();
  if (!url) {
    clearArchitectureMount(host);
    return false;
  }
  const key = architectureKeyFromUrl(url);
  if (!key) {
    host.hidden = true;
    return false;
  }

  if (
    host.dataset.archKey === key &&
    host.shadowRoot?.querySelector(".archify-root svg") &&
    host._archify
  ) {
    host.hidden = false;
    return true;
  }

  host.hidden = false;
  host.dataset.archUrl = url;
  host.dataset.archKey = key;
  host.classList.add("architecture-mount");

  const htmlRes = await fetch(`/api/architecture/${key}.html`, {
    cache: "no-store",
  });
  if (!htmlRes.ok) throw new Error(`architecture ${key} not found`);
  const parsed = parseArchifyHtml(await htmlRes.text());

  const styleHtml = [
    ...parsed.styles.map((s) => {
      const idAttr = s.id ? ` id="${s.id}"` : "";
      return `<style${idAttr}>${scopeArchifyCss(s.css)}</style>`;
    }),
    // Host overrides last so they beat Archify 100vh / 100dvh reader layout.
    `<style id="duaer-arch-host-chrome">${opts.stage ? stageChromeCss() : hostChromeCss()}</style>`,
  ].join("\n");

  const shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
  host._archify = null;

  shadow.innerHTML = `
    ${styleHtml}
    <div
      class="archify-root"
      data-theme="${parsed.theme}"
      data-preset="${parsed.preset}"
      data-motion-capable="true"
      data-ambient-motion="running"
      lang="${parsed.lang}"
    >${parsed.bodyHtml}</div>
  `;

  const rootEl = shadow.querySelector(".archify-root");
  if (!rootEl) throw new Error("architecture root missing");
  if (!rootEl.querySelector("svg")) throw new Error("architecture svg missing");

  const scopedDocument = createScopedDocument(rootEl, shadow);
  try {
    host._archify = runViewerScript(parsed.main, scopedDocument, {
      zoom: Boolean(opts.stage),
      host,
    });
  } catch (err) {
    console.warn("archify viewer init failed", err);
    host._archify = null;
  }

  host.style.removeProperty("height");
  return true;
}

export function clearArchitectureMount(host) {
  if (!host) return;
  host._archify = null;
  if (host.shadowRoot) host.shadowRoot.innerHTML = "";
  host.removeAttribute("data-arch-url");
  host.removeAttribute("data-arch-key");
  host.style.removeProperty("height");
  host.hidden = true;
}

export function architectureKeyFromArchitectureUrl(url) {
  return architectureKeyFromUrl(url);
}

/** Test helpers (Node / unit). */
export const __test = {
  scopeArchifyCss,
  architectureKeyFromUrl,
  routeTaskEdge,
  zoomLogicalPoint,
  applySvgIntrinsicSize,
};


/**
 * Mount Archify HTML already in memory (Electron IPC path — no /api fetch).
 * @param {HTMLElement} host
 * @param {string} html
 * @param {{ key?: string, stage?: boolean, straighten?: boolean }} [opts]
 */
export async function mountArchitectureHtml(host, html, opts = {}) {
  if (!host) return false;
  const raw = String(html || "");
  if (!raw.trim()) {
    clearArchitectureMount(host);
    return false;
  }
  const key = String(opts.key || "").trim() || "inline";
  const stage = opts.stage ? "frame" : opts.straighten ? "flow" : "0";
  if (
    host.dataset.archKey === key &&
    host.dataset.archStage === stage &&
    host.shadowRoot?.querySelector(".archify-root svg") &&
    host._archify
  ) {
    host.hidden = false;
    const chrome = host.shadowRoot?.querySelector("#duaer-arch-host-chrome");
    if (chrome) chrome.textContent = opts.stage ? graphChromeCss() : hostChromeCss();
    fitSvgViewBox(host.shadowRoot.querySelector(".archify-root svg"), {
      intrinsic: !opts.stage,
    });
    return true;
  }
  host.hidden = false;
  host.dataset.archUrl = key;
  host.dataset.archKey = key;
  host.dataset.archStage = stage;
  host.classList.add("architecture-mount");
  const parsed = parseArchifyHtml(raw);
  const styleHtml = [
    ...parsed.styles.map((st) => {
      const idAttr = st.id ? ` id="${st.id}"` : "";
      return `<style${idAttr}>${scopeArchifyCss(st.css)}</style>`;
    }),
    `<style id="duaer-arch-host-chrome">${opts.stage ? graphChromeCss() : hostChromeCss()}</style>`,
  ].join("\n");
  const shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
  host._archify = null;
  shadow.innerHTML = `
    ${styleHtml}
    <div
      class="archify-root"
      data-theme="${parsed.theme}"
      data-preset="${parsed.preset}"
      data-motion-capable="true"
      data-ambient-motion="running"
      lang="${parsed.lang}"
    >${parsed.bodyHtml}</div>
  `;
  const rootEl = shadow.querySelector(".archify-root");
  if (!rootEl) throw new Error("architecture root missing");
  const svg = rootEl.querySelector("svg");
  if (!svg) throw new Error("architecture svg missing");
  if (opts.stage || opts.straighten) straightenTaskEdges(svg);
  fitSvgViewBox(svg, { intrinsic: !opts.stage });
  const scopedDocument = createScopedDocument(rootEl, shadow);
  try {
    host._archify = runViewerScript(parsed.main, scopedDocument, {
      zoom: Boolean(opts.stage),
      host,
    });
  } catch (err) {
    console.warn("archify viewer init failed", err);
    host._archify = null;
  }
  // Viewer init can restore the authored viewBox and clip the title band.
  if (opts.stage || opts.straighten) straightenTaskEdges(svg);
  fitSvgViewBox(svg, { intrinsic: !opts.stage });
  const refit = () => {
    if (!svg.isConnected) return;
    fitSvgViewBox(svg, { intrinsic: !opts.stage });
  };
  setTimeout(refit, 60);
  if (opts.stage) holdGraphOverview(host._archify);
  host.style.removeProperty("height");
  return true;
}

/** Keep one user unit as one pixel so node count does not resize the cards. */
export function applySvgIntrinsicSize(svg) {
  const raw = String(svg.getAttribute("viewBox") || "").trim();
  const parts = raw.split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || !(parts[2] > 0) || !(parts[3] > 0)) return false;
  svg.setAttribute("width", String(Math.ceil(parts[2])));
  svg.setAttribute("height", String(Math.ceil(parts[3])));
  return true;
}

/**
 * Include frame lines drawn outside the authored viewBox.
 * Skip percentage-sized backdrops: their box tracks the viewport and would
 * grow the viewBox on every pass.
 */
function fitSvgViewBox(svg, options = {}) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let counted = 0;
  const take = (box) => {
    if (!box || !(box.width > 0 || box.height > 0)) return;
    counted += 1;
    if (box.x < minX) minX = box.x;
    if (box.y < minY) minY = box.y;
    if (box.x + box.width > maxX) maxX = box.x + box.width;
    if (box.y + box.height > maxY) maxY = box.y + box.height;
  };
  for (const el of svg.querySelectorAll(
    "g[data-node-id], path, line, polyline, polygon, text, rect",
  )) {
    const width = el.getAttribute?.("width") || "";
    const height = el.getAttribute?.("height") || "";
    if (String(width).includes("%") || String(height).includes("%")) continue;
    try {
      take(el.getBBox());
    } catch {
      /* Detached geometry is skipped. */
    }
  }
  if (!counted) {
    try {
      take(svg.getBBox());
    } catch {
      return;
    }
  }
  if (!counted || !(maxX > minX) || !(maxY > minY)) return;
  const pad = 24;
  svg.setAttribute(
    "viewBox",
    `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`,
  );
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  if (options.intrinsic) applySvgIntrinsicSize(svg);
}

/** Keep the task graph on the full diagram until a node is clicked. */
function holdGraphOverview(Archify) {
  if (!Archify?.guidedViews || typeof Archify.guidedViews.showAll !== "function") return;
  const reset = () => {
    try {
      Archify.guidedViews.showAll({ updateUrl: false, resetView: true });
    } catch {
      /* The diagram stays mounted if overview reset fails. */
    }
  };
  reset();
  setTimeout(reset, 300);
}
