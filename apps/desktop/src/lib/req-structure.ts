export type ReqBlock =
  | { kind: "ul" | "ol" | "para"; items: string[] }
  | { kind: "section"; title: string; blocks: ReqBlock[] };

export type ReqEditModel = {
  mode: "ul" | "ol" | "para";
  items: string[];
};

const BULLET_RE = /^\s*[-*•]\s+(.*)$/;
const NUMBERED_RE = /^\s*(?:\d+[.)、]|[（(]\d+[）)]|[一二三四五六七八九十]+[、.）)])\s*(.*)$/;

function splitModuleSections(text: string): { title: string; body: string }[] | null {
  const source = text.replace(/\r\n/g, "\n").trim();
  if (!source) return null;
  let matches = [...source.matchAll(/(?:^|\n)\s*\[([^\[\]\n]{1,48})\]\s*/g)];
  if (matches.length < 2) {
    const inline = [...source.matchAll(/\[([^\[\]\n]{1,48})\]\s*/g)];
    if (inline.length >= 2 && inline[0].index === 0) matches = inline;
    else return null;
  }
  const sections = [];
  for (let i = 0; i < matches.length; i += 1) {
    const title = String(matches[i][1] || "").trim();
    if (!title) continue;
    const bodyStart = (matches[i].index ?? 0) + matches[i][0].length;
    const bodyEnd = i + 1 < matches.length ? (matches[i + 1].index ?? source.length) : source.length;
    sections.push({ title, body: source.slice(bodyStart, bodyEnd).trim() });
  }
  return sections.length >= 2 ? sections : null;
}

function expandInlineLine(line: string): string {
  const source = line.trim();
  if (!source) return "";
  const numberedMarker = /(?:^|[；;\s])(?:\d+[.)、]|[（(]\d+[）)])\s*\S/;
  if (numberedMarker.test(source) && (source.match(/(?:^|[；;\s])(?:\d+[.)、]|[（(]\d+[）)])\s*\S/g) || []).length >= 2) {
    return source
      .replace(/[；;]\s*((?:\d+[.)、]|[（(]\d+[）)]))\s*/g, "\n$1 ")
      .replace(/(?:^|\s)((?:\d+[.)、]|[（(]\d+[）)]))\s*/g, "\n$1 ")
      .trim();
  }
  if (/[;；]/.test(source)) {
    const parts = source.split(/[;；]/).map((part) => part.trim().replace(/^[-*•]\s+/, "")).filter(Boolean);
    if (parts.length >= 2) return parts.map((part) => `- ${part}`).join("\n");
  }
  if (!/。/.test(source) && !/：/.test(source)) {
    const parts = source.split(/[、,，]/).map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 3 && parts.every((part) => part.length <= 40) && source.length <= 280) {
      return parts.map((part) => `- ${part}`).join("\n");
    }
  }
  if ((source.match(/。/g) || []).length >= 2) {
    const parts = source.split(/。/).map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2 && parts.every((part) => part.length <= 80)) {
      return parts.map((part) => `- ${part}`).join("\n");
    }
  }
  return source;
}

export function normalizeReqText(text: string): string {
  const source = text.replace(/\r\n/g, "\n").trim();
  if (!source) return "";
  return source.split("\n").map((line) => expandInlineLine(line)).join("\n");
}

function parseFlat(text: string): ReqBlock[] {
  const raw = normalizeReqText(text);
  if (!raw.trim()) return [];
  const lines = raw.split("\n");
  const blocks: ReqBlock[] = [];
  let index = 0;
  while (index < lines.length) {
    if (BULLET_RE.test(lines[index])) {
      const items: string[] = [];
      while (index < lines.length) {
        const match = lines[index].match(BULLET_RE);
        if (!match) break;
        items.push(match[1]);
        index += 1;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }
    if (NUMBERED_RE.test(lines[index])) {
      const items: string[] = [];
      while (index < lines.length) {
        const match = lines[index].match(NUMBERED_RE);
        if (!match) break;
        items.push(match[1]);
        index += 1;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }
    if (!lines[index].trim()) {
      index += 1;
      continue;
    }
    const parts: string[] = [];
    while (index < lines.length) {
      const line = lines[index];
      if (!line.trim() || BULLET_RE.test(line) || NUMBERED_RE.test(line)) break;
      parts.push(line.trim());
      index += 1;
    }
    if (parts.length) blocks.push({ kind: "para", items: parts });
  }
  return blocks;
}

export function parseReqBlocks(text: string): ReqBlock[] {
  const sections = splitModuleSections(text);
  if (sections) {
    return sections.map((section) => ({
      kind: "section" as const,
      title: section.title,
      blocks: parseFlat(section.body),
    }));
  }
  return parseFlat(text);
}

export function reqEditModel(text: string): ReqEditModel {
  const sections = splitModuleSections(text);
  if (sections) {
    return {
      mode: "ul",
      items: sections.map((section) => {
        const inner = normalizeReqText(section.body).trim();
        return inner ? `[${section.title}] ${inner.replace(/\n/g, " ")}` : `[${section.title}]`;
      }),
    };
  }
  const blocks = parseFlat(text);
  if (!blocks.length) return { mode: "ul", items: [""] };
  const kinds = new Set(blocks.map((block) => block.kind));
  if (kinds.size === 1 && kinds.has("ol")) {
    return { mode: "ol", items: blocks.flatMap((block) => block.kind === "ol" ? block.items : []) };
  }
  if (kinds.size === 1 && kinds.has("ul")) {
    return { mode: "ul", items: blocks.flatMap((block) => block.kind === "ul" ? block.items : []) };
  }
  if (kinds.size === 1 && kinds.has("para")) {
    const items = blocks.flatMap((block) => block.kind === "para" ? block.items : []);
    if (items.length === 1) return { mode: "para", items };
    return { mode: "ul", items };
  }
  return { mode: "ul", items: blocks.flatMap((block) => "items" in block ? block.items : []) };
}

export function serializeReqEdit(mode: ReqEditModel["mode"], items: string[]): string {
  const cleaned = items.map((item) => item.trim()).filter(Boolean);
  if (!cleaned.length) return "";
  if (cleaned.length >= 2 && cleaned.every((item) => /^\[[^\[\]]+\]/.test(item))) {
    return cleaned.join("\n");
  }
  if (mode === "ol") return cleaned.map((item, index) => `${index + 1}. ${item}`).join("\n");
  if (mode === "para" && cleaned.length === 1) return cleaned[0];
  return cleaned.map((item) => `- ${item}`).join("\n");
}
