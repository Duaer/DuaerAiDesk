/**
 * Extract Archify architecture JSON from assistant reply text (browser).
 * Must strip chat/Brief extras — Archify rejects additionalProperties.
 */

const COMPONENT_TYPES = new Set([
  "frontend",
  "backend",
  "database",
  "cloud",
  "security",
  "messagebus",
  "external",
]);
const CONNECTION_VARIANTS = new Set([
  "default",
  "emphasis",
  "security",
  "dashed",
]);
const BOUNDARY_KINDS = new Set(["region", "security-group"]);
const CARD_DOTS = new Set([
  "cyan",
  "emerald",
  "violet",
  "amber",
  "rose",
  "orange",
  "slate",
]);

function pickKeys(obj, allowed) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
  const out = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) out[key] = obj[key];
  }
  return out;
}

export function sanitizeArchitectureIr(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (!Array.isArray(raw.components)) return null;

  const metaIn = raw.meta && typeof raw.meta === "object" ? raw.meta : {};
  const meta = pickKeys(metaIn, [
    "title",
    "locale",
    "subtitle",
    "output",
    "animation",
    "visual_preset",
    "quality_profile",
    "engineering_profile",
    "repository",
    "views",
    "legend",
    "viewBox",
  ]);
  if (!meta.title) {
    meta.title =
      (typeof raw.title === "string" && raw.title.trim()) || "Architecture";
  }
  if (!meta.quality_profile) meta.quality_profile = "standard";

  const components = raw.components
    .filter((c) => c && typeof c === "object")
    .map((c) =>
      pickKeys(c, [
        "id",
        "type",
        "label",
        "sublabel",
        "tag",
        "brand",
        "sources",
        "row",
        "col",
        "pos",
        "size",
      ]),
    )
    .filter((c) => c.id && c.type && c.label && COMPONENT_TYPES.has(c.type));

  const connections = (Array.isArray(raw.connections) ? raw.connections : [])
    .filter((e) => e && typeof e === "object")
    .map((e) => {
      const row = pickKeys(e, [
        "id",
        "from",
        "to",
        "label",
        "variant",
        "fromSide",
        "toSide",
        "route",
        "via",
        "labelAt",
        "labelDx",
        "labelDy",
        "labelSegment",
        "width",
      ]);
      if (row.variant && !CONNECTION_VARIANTS.has(row.variant)) {
        delete row.variant;
      }
      return row;
    })
    .filter((e) => e.from && e.to);

  const boundaries = (Array.isArray(raw.boundaries) ? raw.boundaries : [])
    .filter((b) => b && typeof b === "object")
    .map((b) => pickKeys(b, ["kind", "label", "wraps", "pad"]))
    .filter(
      (b) =>
        BOUNDARY_KINDS.has(b.kind) &&
        b.label &&
        Array.isArray(b.wraps) &&
        b.wraps.length,
    );

  const cards = (Array.isArray(raw.cards) ? raw.cards : [])
    .filter((c) => c && typeof c === "object")
    .map((c) => {
      const row = pickKeys(c, ["dot", "title", "items"]);
      if (!CARD_DOTS.has(row.dot)) row.dot = "cyan";
      if (!Array.isArray(row.items)) row.items = [];
      return row;
    })
    .filter((c) => c.title);

  dropUnpinnedRepositoryEvidence(meta, components);

  return {
    schema_version: 1,
    diagram_type: "architecture",
    meta,
    components,
    connections,
    boundaries,
    cards,
  };
}

function dropUnpinnedRepositoryEvidence(meta, components) {
  const repo = meta.repository;
  const pinned =
    repo &&
    typeof repo === "object" &&
    /^[a-f0-9]{40}$/i.test(String(repo.revision || "")) &&
    typeof repo.url === "string" &&
    repo.url.trim().length > 0;
  if (pinned) return;
  delete meta.repository;
  for (const c of components) delete c.sources;
}

export function extractArchitectureIr(text) {
  const s = String(text || "").slice(0, 400_000);
  const candidates = [];
  const marker = s.lastIndexOf("<<<JSON>>>");
  if (marker >= 0) {
    const after = s.slice(marker + "<<<JSON>>>".length).trim().slice(0, 350_000);
    const start = after.indexOf("{");
    const end = after.lastIndexOf("}");
    if (start >= 0 && end > start) candidates.push(after.slice(start, end + 1));
  }
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) candidates.push(fence[1].slice(0, 350_000));
  // Prefer marker/fence; avoid nested [\s\S]* scans on huge blobs (ReDoS risk).
  if (!candidates.length) {
    const dt = s.indexOf('"diagram_type"');
    const ready = s.indexOf('"ready"');
    const anchor = dt >= 0 ? dt : ready;
    if (anchor >= 0) {
      const windowStart = Math.max(0, s.lastIndexOf("{", anchor));
      const window = s.slice(windowStart, windowStart + 350_000);
      const end = window.lastIndexOf("}");
      if (end > 0) candidates.push(window.slice(0, end + 1));
    }
  }
  for (const chunk of candidates) {
    try {
      const obj = JSON.parse(chunk.trim());
      const ir = sanitizeArchitectureIr(obj);
      if (ir?.components?.length) return ir;
    } catch {
      /* try next */
    }
  }
  return null;
}

const TYPE_HINTS = [
  [/front|web|ui|react|vue|page|客户端|前端/i, "frontend"],
  [/api|gateway|service|server|后端|接口/i, "backend"],
  [/db|sql|redis|mongo|数据|库/i, "database"],
  [/auth|oauth|secure|安全|鉴权/i, "security"],
  [/queue|mq|kafka|bus|消息/i, "messagebus"],
  [/cdn|s3|oss|cloud|云/i, "cloud"],
  [/external|third|支付|短信|外部/i, "external"],
];

const TYPE_RANK = {
  external: 0,
  frontend: 1,
  security: 2,
  backend: 3,
  messagebus: 4,
  database: 5,
  cloud: 6,
};

const SERVICE_TYPES = new Set(["backend", "database", "cloud", "messagebus"]);

function clipText(value, max) {
  const text = String(value || "").trim();
  return text.length <= max ? text : text.slice(0, max);
}

function guessComponentType(name, responsibility) {
  const hay = `${name} ${responsibility}`;
  for (const [re, type] of TYPE_HINTS) {
    if (re.test(hay)) return type;
  }
  return "backend";
}

/** Fallback Archify IR when chat only returned named boxes. */
export function architectureIrFromComponents(summary, components) {
  const nodes = (Array.isArray(components) ? components : [])
    .filter((component) => component && String(component.name || "").trim())
    .slice(0, 12)
    .map((component, index) => ({
      id: String(component.id || `c${index + 1}`),
      type: guessComponentType(component.name, component.responsibility),
      label: clipText(component.name, 12),
      sublabel: clipText(component.responsibility, 12),
      order: index,
    }))
    .sort((left, right) => (TYPE_RANK[left.type] ?? 3) - (TYPE_RANK[right.type] ?? 3) || left.order - right.order)
    .map((node) => {
      const next = {
        id: node.id,
        type: node.type,
        label: node.label,
      };
      if (node.sublabel) next.sublabel = node.sublabel;
      return next;
    });
  if (!nodes.length) return null;
  const connections = nodes.slice(0, -1).map((node, index) => {
    const next = nodes[index + 1];
    const label = clipText(next.sublabel || next.label, 8);
    const edge = { id: `e${index + 1}`, from: node.id, to: next.id };
    if (index === 0) edge.variant = "emphasis";
    if (label) edge.label = label;
    return edge;
  });
  const serviceIds = nodes.filter((node) => SERVICE_TYPES.has(node.type)).map((node) => node.id);
  const boundaries = serviceIds.length >= 2
    ? [{ kind: "region", label: "服务", wraps: serviceIds }]
    : [];
  const items = nodes.slice(0, 4).map((node) => node.label).filter(Boolean);
  return {
    schema_version: 1,
    diagram_type: "architecture",
    meta: {
      title: clipText(summary, 40) || "Architecture",
      quality_profile: "standard",
    },
    components: nodes,
    connections,
    boundaries,
    cards: items.length ? [{ dot: "cyan", title: "概览", items }] : [],
  };
}

/** Drop hand-placed geometry so Archify can route a diagram that failed layout checks. */
export function relaxArchitectureIr(ir) {
  if (!ir || typeof ir !== "object" || !Array.isArray(ir.components)) return null;
  const clip = (value, max) => {
    const text = String(value || "").trim();
    if (text.length <= max) return text;
    return text.slice(0, max);
  };
  const metaIn = ir.meta && typeof ir.meta === "object" ? ir.meta : {};
  const boundaries = (Array.isArray(ir.boundaries) ? ir.boundaries : [])
    .filter((boundary) => boundary && BOUNDARY_KINDS.has(boundary.kind) && Array.isArray(boundary.wraps))
    .map((boundary) => ({
      kind: boundary.kind,
      label: clip(boundary.label, 8),
      wraps: boundary.wraps,
    }))
    .filter((boundary) => boundary.label && boundary.wraps.length);
  const cards = (Array.isArray(ir.cards) ? ir.cards : [])
    .filter((card) => card && card.title)
    .map((card) => ({
      dot: CARD_DOTS.has(card.dot) ? card.dot : "cyan",
      title: clip(card.title, 12),
      items: (Array.isArray(card.items) ? card.items : []).slice(0, 4).map((item) => clip(item, 12)).filter(Boolean),
    }));
  return {
    schema_version: 1,
    diagram_type: "architecture",
    meta: {
      title: clip(metaIn.title || ir.title || "Architecture", 40),
      quality_profile: "standard",
    },
    components: ir.components.map((component) => {
      const row = {
        id: component.id,
        type: component.type,
        label: clip(component.label, 10),
      };
      const sublabel = clip(component.sublabel, 12);
      if (sublabel) row.sublabel = sublabel;
      return row;
    }),
    connections: (Array.isArray(ir.connections) ? ir.connections : []).map((edge) => {
      const row = { id: edge.id, from: edge.from, to: edge.to };
      const label = clip(edge.label, 8);
      if (label) row.label = label;
      if (edge.variant && CONNECTION_VARIANTS.has(edge.variant)) row.variant = edge.variant;
      return row;
    }),
    boundaries,
    cards,
  };
}
