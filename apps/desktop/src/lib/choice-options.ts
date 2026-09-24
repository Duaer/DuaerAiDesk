/** Confirm-card labels are a restatement, not a choice. */
const CARD_FIELD_LABEL =
  /^(?:要做什么|做什么|目标|页面内容|页面|不做什么|不做的事|验收标准|验收|假设|默认基线|goal|acceptance|out of scope|assumptions)\s*[:：]/i;

export function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

function isCardFieldLine(text: string): boolean {
  return CARD_FIELD_LABEL.test(stripInlineMarkdown(text));
}

export function normalizeOptions(options: unknown): string[] {
  if (!Array.isArray(options)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of options) {
    const text = stripInlineMarkdown(
      String(raw ?? "")
        .replace(/^[\s]*[-*•]\s+/, "")
        .replace(/^\s*(?:\d+[.)、]|[A-Da-d][.)、]|[（(]\d+[）)])\s*/, ""),
    );
    if (isCardFieldLine(text)) continue;
    if (text.length < 1 || text.length > 48) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= 6) break;
  }
  return out;
}

export function enrichChatOptions(reply: string, existing: unknown): string[] {
  const fromJson = normalizeOptions(existing);
  if (fromJson.length >= 2) return fromJson;
  const text = String(reply || "").replace(/\r\n/g, "\n");
  const found: string[] = [];
  const seen = new Set<string>();
  for (const line of text.split("\n")) {
    const match = line.match(
      /^\s*(?:[-*•]|(?:\d+[.)、])|(?:[A-Da-d][.)、])|(?:[（(]\d+[）)]))\s+(.+?)\s*$/,
    );
    if (!match) continue;
    const textLine = stripInlineMarkdown(match[1].replace(/[。.;；]+$/g, ""));
    if (isCardFieldLine(textLine)) continue;
    if (textLine.length < 2 || textLine.length > 48) continue;
    const key = textLine.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(textLine);
  }
  if (found.length >= 2) return found.slice(0, 6);
  const quotedOr = text.match(
    /[「""]([^」""]{1,32})[」""]\s*(?:还是|或|\/|or)\s*[「""]([^」""]{1,32})[」""]/i,
  );
  if (quotedOr) return normalizeOptions([quotedOr[1], quotedOr[2]]);
  return fromJson;
}
