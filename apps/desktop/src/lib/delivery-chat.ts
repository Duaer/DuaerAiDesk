import {
  commitDeliveryChatModules,
  ensureDelivery,
  GLOBAL_MODULE_ID,
  peekDelivery,
  replaceDeliveryArchitecture,
  setDeliveryRevision,
  updateDeliveryCard,
  type DeliveryCard,
  type DeliveryCardField,
  type DeliveryModule,
  type DeliveryRevision,
} from "./delivery-desk.ts";
import { isSharedBaselineOptOut } from "./delivery-card-check.ts";
import { enrichChatOptions } from "./choice-options.ts";

export const DELIVERY_DESK_MARKER = "<<<DESK>>>";
export const DELIVERY_JSON_MARKER = "<<<JSON>>>";
/** Gate narration (validate / auto-fix status). Hidden from card fill. */
export const DELIVERY_GATE_NOTE_MARKER = "<<<GATE>>>";
/** Choice chips attached to a GATE note (one id per line after this marker). */
export const DELIVERY_CHOICES_MARKER = "<<<CHOICES>>>";
/** Stable choice id for Auto-fix — rendered as a localized chip label. */
export const DELIVERY_AUTO_HANDLE_ACTION = "duaer:auto-handle";
export const DELIVERY_CONFIRM_ARCHITECTURE_ACTION = "duaer:confirm-architecture";
export const DELIVERY_REVISE_ARCHITECTURE_ACTION = "duaer:revise-architecture";
export const DELIVERY_START_DISPATCH_ACTION = "duaer:start-dispatch";
export const DELIVERY_REVISE_VISUAL_ACTION = "duaer:revise-visual";
export const DELIVERY_START_BUGFIX_ACTION = "duaer:start-bugfix";
/** User turn that asks the model to rewrite a failed confirm card. */
export const DELIVERY_AUTO_FIX_MARKER = "<<<AUTOFIX>>>";
/** App-owned dispatch wave. Not a requirements or architecture card fill. */
export const DELIVERY_DISPATCH_MARKER = "<<<DISPATCH>>>";

/** Fields the in-flight auto-fix reply is allowed to rewrite. Null outside that turn. */
let autoFixWriteFields: ReadonlySet<DeliveryCardField> | null = null;

export function setDeliveryAutoFixFields(fields: readonly DeliveryCardField[] | null): void {
  // null clears the lock. An empty list still locks, so a module auto-fix cannot invent global baselines.
  autoFixWriteFields = fields ? new Set(fields) : null;
}

/** Drop confirm-card keys the auto-fix turn did not ask the model to change. */
export function blankUnlistedCardFields<T extends Partial<Record<DeliveryCardField, string>> & {
  modules?: Array<Partial<Record<DeliveryCardField, string>>>;
}>(payload: T, allowed: ReadonlySet<DeliveryCardField>): T {
  const next = { ...payload };
  for (const field of CARD_FIELDS) {
    if (!allowed.has(field)) next[field] = "";
  }
  if (next.modules) {
    next.modules = next.modules.map((module) => {
      const copy = { ...module };
      for (const field of CARD_FIELDS) {
        if (!allowed.has(field)) copy[field] = "";
      }
      return copy;
    });
  }
  return next;
}

const CARD_FIELDS: DeliveryCardField[] = [
  "goal",
  "outOfScope",
  "acceptance",
  "assumptions",
  "style",
  "layout",
  "deviceMatrix",
  "criticalPaths",
  "exceptionCases",
  "apiContract",
  "envChecklist",
  "dataPrecheck",
  "externalDeps",
  "perfBudget",
];

export type DeliveryChatModule = {
  id: string;
  title: string;
  goal: string;
  outOfScope: string;
  acceptance: string;
  assumptions: string;
  style: string;
  layout: string;
  deviceMatrix: string;
  criticalPaths: string;
  exceptionCases: string;
  apiContract: string;
  envChecklist: string;
  dataPrecheck: string;
  externalDeps: string;
  perfBudget: string;
  dependsOn: string[];
};

export type DeliveryChatPayload = {
  reply: string;
  options: string[];
  activeModuleId?: string;
  modules?: DeliveryChatModule[];
  summary?: string;
  components?: Array<{ name: string; responsibility: string }>;
  revision?: DeliveryRevision;
} & DeliveryCard;

function flat(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function parseModelJson(content: string): Record<string, unknown> {
  let text = content.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) text = text.slice(start, end + 1);
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("delivery json is not an object");
  }
  return parsed as Record<string, unknown>;
}

function cardFrom(raw: Record<string, unknown>, nested?: Record<string, unknown>): DeliveryCard {
  const read = (field: DeliveryCardField) => flat(raw[field] ?? nested?.[field]);
  return {
    goal: read("goal"),
    outOfScope: read("outOfScope"),
    acceptance: read("acceptance"),
    assumptions: read("assumptions"),
    style: read("style"),
    layout: read("layout"),
    deviceMatrix: read("deviceMatrix"),
    criticalPaths: read("criticalPaths"),
    exceptionCases: read("exceptionCases"),
    apiContract: read("apiContract"),
    envChecklist: read("envChecklist"),
    dataPrecheck: read("dataPrecheck"),
    externalDeps: read("externalDeps"),
    perfBudget: read("perfBudget"),
  };
}

function looksLikeDelivery(obj: Record<string, unknown>): boolean {
  if (Array.isArray(obj.modules) && obj.modules.length > 0) return true;
  if (Array.isArray(obj.components) && obj.components.length > 0) return true;
  if (flat(obj.summary)) return true;
  if (revisionFrom(obj.revise)) return true;
  if (CARD_FIELDS.some((field) => flat(obj[field]))) return true;
  return Array.isArray(obj.options) && obj.options.length > 0;
}

function splitDeliveryContent(content: string): { reply: string; obj: Record<string, unknown> } | null {
  const raw = String(content || "");
  const marker = raw.indexOf(DELIVERY_JSON_MARKER);
  if (marker >= 0) {
    const reply = raw.slice(0, marker).trim();
    try {
      return { reply, obj: parseModelJson(raw.slice(marker + DELIVERY_JSON_MARKER.length)) };
    } catch {
      return { reply, obj: {} };
    }
  }
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```\s*$/);
  if (fence && fence.index != null) {
    try {
      const obj = parseModelJson(fence[1]);
      if (!looksLikeDelivery(obj)) return null;
      return { reply: raw.slice(0, fence.index).trim() || flat(obj.reply), obj };
    } catch {
      return null;
    }
  }
  try {
    const obj = parseModelJson(raw);
    if (!looksLikeDelivery(obj)) return null;
    const start = raw.indexOf("{");
    return { reply: (start > 0 ? raw.slice(0, start) : flat(obj.reply)).trim(), obj };
  } catch {
    return null;
  }
}

export function visibleDeliveryText(content: string, role: "user" | "assistant" | string): string {
  const source = String(content || "");
  if (role === "user") {
    let text = source;
    const desk = text.indexOf(DELIVERY_DESK_MARKER);
    if (desk >= 0) text = text.slice(0, desk);
    const dispatchWave = text.includes(DELIVERY_DISPATCH_MARKER);
    text = text.replace(DELIVERY_AUTO_FIX_MARKER, "").replaceAll(DELIVERY_DISPATCH_MARKER, "");
    return dispatchWave ? text.trim() : text.trimEnd();
  }
  if (source.includes(DELIVERY_GATE_NOTE_MARKER)) {
    let text = source.replace(DELIVERY_GATE_NOTE_MARKER, "").trim();
    const choices = text.indexOf(DELIVERY_CHOICES_MARKER);
    if (choices >= 0) text = text.slice(0, choices).trim();
    return text;
  }
  const split = splitDeliveryContent(source);
  if (!split) return source.trim();
  return split.reply.trim();
}

export function isDeliveryGateNote(content: string): boolean {
  return String(content || "").includes(DELIVERY_GATE_NOTE_MARKER);
}

/**
 * Drop a "checking…" note once a pass note already follows it.
 * The start line is replaced in place; an older copy must not stay above the result.
 */
export function withoutStaleValidateStarts<T extends { id: string; role: string; content: string }>(
  messages: readonly T[],
  startText: string,
  passPrefix: string,
): T[] {
  const start = startText.trim();
  const prefix = passPrefix.trim();
  if (!start || !prefix) return [...messages];
  const drop = new Set<string>();
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (!message || message.role === "user" || !isDeliveryGateNote(message.content)) continue;
    if (visibleDeliveryText(message.content, message.role).trim() !== start) continue;
    const followedByPass = messages.slice(index + 1).some((item) => {
      if (!item || item.role === "user") return false;
      return visibleDeliveryText(item.content, item.role).trim().startsWith(prefix);
    });
    if (followedByPass) drop.add(message.id);
  }
  if (!drop.size) return [...messages];
  return messages.filter((message) => !drop.has(message.id));
}

/** Choice ids attached to a GATE note (e.g. Auto-fix). */
export function parseDeliveryGateChoices(content: string): string[] {
  if (!isDeliveryGateNote(content)) return [];
  const source = String(content || "");
  const index = source.indexOf(DELIVERY_CHOICES_MARKER);
  if (index < 0) return [];
  const seen = new Set<string>();
  const choices: string[] = [];
  for (const line of source.slice(index + DELIVERY_CHOICES_MARKER.length).split("\n")) {
    const id = line.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    choices.push(id);
    if (choices.length >= 8) break;
  }
  return choices;
}

export function encodeDeliveryGateNote(text: string, choices: string[] = []): string {
  const body = text.trim();
  const unique = [...new Set(choices.map((item) => item.trim()).filter(Boolean))].slice(0, 8);
  if (!unique.length) return `${DELIVERY_GATE_NOTE_MARKER}\n${body}`;
  return `${DELIVERY_GATE_NOTE_MARKER}\n${body}\n${DELIVERY_CHOICES_MARKER}\n${unique.join("\n")}`;
}

export function isDeliveryAutoHandleChoice(choice: string): boolean {
  return choice === DELIVERY_AUTO_HANDLE_ACTION;
}

/** The latest turn should grow an Auto-fix chip when the card still fails. */
export function shouldOfferDeliveryAutoHandle(lastContent: string | undefined, isRunning: boolean): boolean {
  if (isRunning) return false;
  return !parseDeliveryGateChoices(lastContent || "").includes(DELIVERY_AUTO_HANDLE_ACTION);
}

export function isDeliveryConfirmArchitectureChoice(choice: string): boolean {
  return choice === DELIVERY_CONFIRM_ARCHITECTURE_ACTION;
}

export function isDeliveryReviseArchitectureChoice(choice: string): boolean {
  return choice === DELIVERY_REVISE_ARCHITECTURE_ACTION;
}

export function isDeliveryStartDispatchChoice(choice: string): boolean {
  return choice === DELIVERY_START_DISPATCH_ACTION;
}

export function isDeliveryReviseVisualChoice(choice: string): boolean {
  return choice === DELIVERY_REVISE_VISUAL_ACTION;
}

export function isDeliveryStartBugfixChoice(choice: string): boolean {
  return choice === DELIVERY_START_BUGFIX_ACTION;
}

export function parseDeliveryChat(content: string): DeliveryChatPayload | null {
  const split = splitDeliveryContent(content);
  if (!split) return null;
  const { reply, obj } = split;
  if (!looksLikeDelivery(obj) && !reply) return null;
  const modulesRaw = Array.isArray(obj.modules) ? obj.modules : undefined;
  const modules = modulesRaw
    ?.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const rawModule = item as Record<string, unknown>;
      const nested = rawModule.card && typeof rawModule.card === "object"
        ? rawModule.card as Record<string, unknown>
        : undefined;
      const id = flat(rawModule.id) || flat(rawModule.title);
      if (!id) return [];
      return [{
        id: id.slice(0, 80),
        title: (flat(rawModule.title) || id).slice(0, 120),
        ...cardFrom(rawModule, nested),
        dependsOn: Array.isArray(rawModule.dependsOn)
          ? rawModule.dependsOn.map(flat).filter(Boolean).slice(0, 20)
          : [],
      }];
    })
    .slice(0, 40);
  const components = Array.isArray(obj.components)
    ? obj.components.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const component = item as Record<string, unknown>;
        const name = flat(component.name || component.label);
        const responsibility = flat(component.responsibility || component.sublabel);
        if (!name && !responsibility) return [];
        return [{ name, responsibility }];
      }).slice(0, 12)
    : undefined;
  return {
    reply: reply || flat(obj.reply),
    ...cardFrom(obj),
    activeModuleId: flat(obj.activeModuleId) || undefined,
    modules,
    summary: flat(obj.summary) || undefined,
    components,
    revision: revisionFrom(obj.revise),
    options: enrichChatOptions(reply || flat(obj.reply), Array.isArray(obj.options) ? obj.options : []),
  };
}

function revisionFrom(raw: unknown): DeliveryRevision | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const row = raw as Record<string, unknown>;
  const moduleId = flat(row.moduleId).slice(0, 80);
  const named = flat(row.scope);
  const scope = named === "overall" ? "overall" : named === "module" || moduleId ? "module" : "overall";
  const revision: DeliveryRevision = {
    scope,
    moduleId: scope === "module" ? moduleId : "",
    goal: flat(row.goal).slice(0, 2000),
    outOfScope: flat(row.outOfScope).slice(0, 2000),
    acceptance: flat(row.acceptance).slice(0, 2000),
    assumptions: flat(row.assumptions).slice(0, 2000),
  };
  if (!revision.goal && !revision.outOfScope && !revision.acceptance && !revision.assumptions) {
    return undefined;
  }
  return revision;
}

const KICKOFF_RE = /请开始帮我梳理需求|请先把现在的功能整理出来|Please start clarifying|Please organize the current functions|请先记下怎么复现|请先记下故障|还分不清是修缺陷|Please record how to reproduce|Please record the bug first|cannot tell yet whether/;

const PROSE_LABELS: Array<{ field: DeliveryCardField; pattern: RegExp }> = [
  { field: "goal", pattern: /^(?:[•·*-]\s+)?(?:#{1,3}\s*)?(?:\*\*)?(?:要做什么|目标|goal)(?:\*\*)?\s*[:：]\s*(.*)$/i },
  { field: "outOfScope", pattern: /^(?:[•·*-]\s+)?(?:#{1,3}\s*)?(?:\*\*)?(?:不做什么|不做的事|out of scope)(?:\*\*)?\s*[:：]\s*(.*)$/i },
  { field: "acceptance", pattern: /^(?:[•·*-]\s+)?(?:#{1,3}\s*)?(?:\*\*)?(?:验收标准|验收|acceptance)(?:\*\*)?\s*[:：]\s*(.*)$/i },
  { field: "assumptions", pattern: /^(?:[•·*-]\s+)?(?:#{1,3}\s*)?(?:\*\*)?(?:假设|默认基线|assumptions)(?:\*\*)?\s*[:：]\s*(.*)$/i },
];

/** Keep a longer live prefix. A different shorter value stays put until a finished card commits. */
function growText(previous: string, incoming: string): string {
  const next = incoming.trim();
  const prev = previous.trim();
  if (!next) return previous;
  if (!prev || next.startsWith(prev)) return next;
  return previous;
}

function activeDraftModule(projectPath: string) {
  const desk = peekDelivery(projectPath) ?? ensureDelivery(projectPath);
  if (!desk) return null;
  const module = desk.modules.find((item) => item.id === desk.activeModuleId) ?? desk.modules[0];
  if (!module || module.status === "confirmed") return null;
  return { desk, module };
}

/** Write the spoken requirement into the open card before the model returns JSON. */
export function applyDeliveryUtterance(projectPath: string, text: string): void {
  const utterance = text.trim();
  if (
    !utterance
    || utterance.includes(DELIVERY_DESK_MARKER)
    || utterance.includes(DELIVERY_AUTO_FIX_MARKER)
    || utterance.includes(DELIVERY_DISPATCH_MARKER)
  ) {
    return;
  }
  const current = activeDraftModule(projectPath);
  if (!current) return;
  if (current.desk.existingProject) return;
  if (KICKOFF_RE.test(utterance)) {
    const background = current.desk.background.trim();
    if (background && !current.module.card.assumptions.trim()) {
      updateDeliveryCard(projectPath, current.module.id, "assumptions", background);
    }
    return;
  }
  if (utterance.length < 8 || current.module.card.goal.trim()) return;
  updateDeliveryCard(projectPath, current.module.id, "goal", utterance);
}

function matchProseLabel(line: string): { field: DeliveryCardField; value: string } | null {
  const trimmed = line.trim();
  for (const label of PROSE_LABELS) {
    const match = trimmed.match(label.pattern);
    if (!match) continue;
    return { field: label.field, value: match[1].trim() };
  }
  return null;
}

/** Copy labeled lines from an assistant reply into the open card as they grow. */
export function applyDeliveryProse(projectPath: string, text: string): void {
  if (isDeliveryGateNote(text) || text.includes(DELIVERY_GATE_NOTE_MARKER)) return;
  const current = activeDraftModule(projectPath);
  if (!current) return;
  const head = text.split(DELIVERY_JSON_MARKER)[0];
  const found = new Map<DeliveryCardField, string[]>();
  let open: DeliveryCardField | null = null;
  for (const line of head.split(/\r?\n/)) {
    const labeled = matchProseLabel(line);
    if (labeled) {
      open = labeled.field;
      if (!labeled.value) continue;
      const list = found.get(labeled.field) ?? [];
      list.push(labeled.value);
      found.set(labeled.field, list);
      continue;
    }
    const trimmed = line.trim();
    if (!trimmed) {
      open = null;
      continue;
    }
    if (!open) continue;
    const list = found.get(open) ?? [];
    list.push(trimmed);
    found.set(open, list);
  }
  for (const [field, lines] of found) {
    const next = growText(current.module.card[field], lines.join("\n"));
    if (next === current.module.card[field]) continue;
    updateDeliveryCard(projectPath, current.module.id, field, next);
    current.module.card = { ...current.module.card, [field]: next };
  }
}

const ACK_CUT = /那(?:下)?一个问题|再确认|接下来/;

/** Sentences where the model restates what it just understood, before the next question. */
export function deliveryAcknowledgements(text: string): string[] {
  const visible = (text.split(DELIVERY_JSON_MARKER)[0] ?? "").trim();
  const found: string[] = [];
  for (const block of visible.split(/\n{2,}/)) {
    const cut = (block.split(ACK_CUT)[0] ?? "").trim();
    if (!/明白了|明白/.test(cut)) continue;
    const cleaned = cut
      .replace(/^(?:明白了|明白)[，,。.\s]*/u, "")
      .replace(/[，,]?明白了?[。.]?\s*$/u, "")
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned.length >= 8) found.push(cleaned);
  }
  return found;
}

/**
 * A reply that only restates "明白了，是做…" never matches the labeled prose
 * fields, so the open card stays blank. Write that restatement onto the draft.
 */
export function applyDeliveryAcknowledgement(projectPath: string, text: string): void {
  if (isDeliveryGateNote(text) || text.includes(DELIVERY_GATE_NOTE_MARKER)) return;
  const parsed = parseDeliveryChat(text);
  if (parsed && deliveryChatHasCard(parsed)) return;
  const current = activeDraftModule(projectPath);
  if (!current) return;
  for (const ack of deliveryAcknowledgements(text)) {
    const card = current.module.card;
    const device = /手机|电脑|平板|浏览器|chrome|safari|firefox|edge/i.test(ack);
    const purpose = /是做|要做|用来/.test(ack);
    let field: DeliveryCardField | null = null;
    if ((!card.goal.trim() || ack.startsWith(card.goal.trim())) && (!device || purpose || !card.goal.trim())) {
      field = "goal";
    } else if (device && (!card.deviceMatrix.trim() || ack.startsWith(card.deviceMatrix.trim()))) {
      field = "deviceMatrix";
    } else if (ack.length >= 12 && (!card.acceptance.trim() || ack.startsWith(card.acceptance.trim()))) {
      field = "acceptance";
    }
    if (!field) continue;
    const next = growText(card[field], ack).slice(0, 2000);
    if (next === card[field]) continue;
    updateDeliveryCard(projectPath, current.module.id, field, next);
    current.module.card = { ...current.module.card, [field]: next };
  }
}

export function deliveryChatHasCard(payload: DeliveryChatPayload): boolean {
  if (payload.modules?.length) return true;
  if (CARD_FIELDS.some((field) => payload[field])) return true;
  return Boolean(payload.summary || payload.components?.length);
}

function blankMerge(previous: string, incoming: string): string {
  return incoming.trim() ? incoming : previous;
}

/** An untitled draft is the opening placeholder. A chat inventory that omits it replaces it. */
function moduleIsBlankSeed(module: DeliveryModule): boolean {
  if (module.id === GLOBAL_MODULE_ID) return false;
  return module.status !== "confirmed" && !module.title.trim();
}

function blankStreamModule(): DeliveryChatModule {
  return {
    id: "",
    title: "",
    goal: "",
    outOfScope: "",
    acceptance: "",
    assumptions: "",
    style: "",
    layout: "",
    deviceMatrix: "",
    criticalPaths: "",
    exceptionCases: "",
    apiContract: "",
    envChecklist: "",
    dataPrecheck: "",
    externalDeps: "",
    perfBudget: "",
    dependsOn: [],
  };
}

function readJsonString(src: string, start: number): { value: string; next: number; closed: boolean } {
  let value = "";
  let i = start + 1;
  while (i < src.length) {
    const ch = src[i];
    if (ch === "\\") {
      if (i + 1 >= src.length) return { value, next: src.length, closed: false };
      const next = src[i + 1];
      if (next === "u" && /^[0-9a-fA-F]{4}$/.test(src.slice(i + 2, i + 6))) {
        value += String.fromCharCode(Number.parseInt(src.slice(i + 2, i + 6), 16));
        i += 6;
        continue;
      }
      const escaped: Record<string, string> = {
        n: "\n",
        r: "\r",
        t: "\t",
        b: "\b",
        f: "\f",
        '"': '"',
        "\\": "\\",
        "/": "/",
      };
      value += escaped[next] ?? next;
      i += 2;
      continue;
    }
    if (ch === '"') return { value, next: i + 1, closed: true };
    value += ch;
    i += 1;
  }
  return { value, next: src.length, closed: false };
}

type ScanFrame = { kind: "object" | "array"; key: string | null; module: boolean };

/** Pull card fields out of an assistant reply that is still streaming its JSON tail. */
export function parseStreamingDelivery(
  content: string,
): { payload: DeliveryChatPayload; complete: boolean } | null {
  const closed = parseDeliveryChat(content);
  if (closed && deliveryChatHasCard(closed)) return { payload: closed, complete: true };
  const marker = content.indexOf(DELIVERY_JSON_MARKER);
  if (marker < 0) return null;
  const reply = content.slice(0, marker).trim();
  const json = content.slice(marker + DELIVERY_JSON_MARKER.length);
  const partial = scanPartialDeliveryJson(json, reply);
  if (!partial || !deliveryChatHasCard(partial)) return null;
  return { payload: partial, complete: false };
}

function scanPartialDeliveryJson(json: string, reply: string): DeliveryChatPayload | null {
  const src = json;
  let i = src.indexOf("{");
  if (i < 0) return null;
  const modules: DeliveryChatModule[] = [];
  let drafting: DeliveryChatModule | null = null;
  const root = cardFrom({});
  let activeModuleId: string | undefined;
  let summary: string | undefined;
  const stack: ScanFrame[] = [];
  const fieldSet = new Set<string>(CARD_FIELDS);

  const skipWs = () => {
    while (i < src.length && /\s/.test(src[i])) i += 1;
  };
  const assign = (key: string, value: string, closed: boolean) => {
    const obj = [...stack].reverse().find((frame) => frame.kind === "object");
    if (!obj) return;
    if (obj.module && drafting) {
      if (key === "id") {
        if (closed && value.trim()) {
          drafting.id = value.trim().slice(0, 80);
          if (!drafting.title.trim()) drafting.title = drafting.id;
        }
        return;
      }
      if (key === "title" && value.trim()) {
        drafting.title = value.trim().slice(0, 120);
        return;
      }
      if (fieldSet.has(key)) (drafting as unknown as Record<string, string>)[key] = value;
      return;
    }
    if (stack.filter((frame) => frame.kind === "object").length !== 1) return;
    if (key === "activeModuleId") {
      if (closed && value.trim()) activeModuleId = value.trim();
      return;
    }
    if (key === "summary" && value.trim()) {
      summary = value.trim();
      return;
    }
    if (fieldSet.has(key)) (root as unknown as Record<string, string>)[key] = value;
  };
  const commitDraft = () => {
    if (!drafting?.id) {
      drafting = null;
      return;
    }
    const next = { ...drafting, title: drafting.title || drafting.id };
    const index = modules.findIndex((module) => module.id === next.id);
    if (index >= 0) modules[index] = next;
    else modules.push(next);
    drafting = null;
  };
  const readStringArray = (): string[] => {
    const values: string[] = [];
    if (src[i] !== "[") return values;
    i += 1;
    while (i < src.length) {
      skipWs();
      if (src[i] === "]") {
        i += 1;
        break;
      }
      if (src[i] !== '"') break;
      const read = readJsonString(src, i);
      i = read.next;
      if (read.closed && read.value.trim()) values.push(read.value.trim());
      if (!read.closed) break;
      skipWs();
      if (src[i] === ",") {
        i += 1;
        continue;
      }
      if (src[i] === "]") i += 1;
      break;
    }
    return values.slice(0, 20);
  };
  const parseValue = (key: string | null): void => {
    skipWs();
    if (i >= src.length) return;
    const ch = src[i];
    if (ch === '"') {
      const read = readJsonString(src, i);
      i = read.next;
      if (key) assign(key, read.value, read.closed);
      return;
    }
    if (ch === "{") {
      i += 1;
      const parent = stack[stack.length - 1];
      const module = parent?.kind === "array" && parent.key === "modules";
      stack.push({ kind: "object", key, module });
      if (module) drafting = blankStreamModule();
      parseObject();
      const frame = stack.pop();
      if (frame?.module) commitDraft();
      return;
    }
    if (ch === "[") {
      i += 1;
      stack.push({ kind: "array", key, module: false });
      parseArray();
      stack.pop();
      return;
    }
    while (i < src.length && !/[,\]}]/.test(src[i])) i += 1;
  };
  const parseObject = (): void => {
    skipWs();
    if (src[i] === "}") {
      i += 1;
      return;
    }
    while (i < src.length) {
      skipWs();
      if (i >= src.length) return;
      if (src[i] === "}") {
        i += 1;
        return;
      }
      if (src[i] !== '"') return;
      const keyRead = readJsonString(src, i);
      i = keyRead.next;
      if (!keyRead.closed) return;
      skipWs();
      if (src[i] !== ":") return;
      i += 1;
      if (keyRead.value === "dependsOn") {
        skipWs();
        const deps = readStringArray();
        if (drafting && stack[stack.length - 1]?.module) drafting.dependsOn = deps;
        else parseValue(keyRead.value);
      } else {
        parseValue(keyRead.value);
      }
      skipWs();
      if (src[i] === ",") {
        i += 1;
        continue;
      }
      if (src[i] === "}") {
        i += 1;
        return;
      }
      return;
    }
  };
  const parseArray = (): void => {
    skipWs();
    if (src[i] === "]") {
      i += 1;
      return;
    }
    while (i < src.length) {
      skipWs();
      if (i >= src.length) return;
      if (src[i] === "]") {
        i += 1;
        return;
      }
      parseValue(null);
      skipWs();
      if (src[i] === ",") {
        i += 1;
        continue;
      }
      if (src[i] === "]") {
        i += 1;
        return;
      }
      return;
    }
  };

  parseValue(null);
  // Closures assign `drafting`, and tsc then narrows the leftover draft to `never`.
  const pending = drafting as DeliveryChatModule | null;
  if (pending?.id) {
    const next = { ...pending, title: pending.title || pending.id };
    const index = modules.findIndex((module) => module.id === next.id);
    if (index >= 0) modules[index] = next;
    else modules.push(next);
  }
  return {
    reply,
    ...root,
    ...(activeModuleId ? { activeModuleId } : {}),
    ...(modules.length ? { modules: modules.slice(0, 40) } : {}),
    ...(summary ? { summary } : {}),
    options: [],
  };
}

/** Write one chat row into the open requirements card. Streaming rows may repeat as text grows. */
export function fillDeliveryFromMessage(projectPath: string, role: string, content: string): void {
  const text = content || "";
  if (!text.trim()) return;
  if (role === "user") {
    if (!text.includes(DELIVERY_AUTO_FIX_MARKER)) setDeliveryAutoFixFields(null);
    applyDeliveryUtterance(projectPath, text);
    return;
  }
  if (role !== "assistant" || isDeliveryGateNote(text)) return;
  const streamed = parseStreamingDelivery(text);
  if (streamed && deliveryChatHasCard(streamed.payload)) {
    applyDeliveryChat(projectPath, streamed.payload, { extendOnly: !streamed.complete });
    return;
  }
  const desk = peekDelivery(projectPath);
  const module = desk?.modules.find((item) => item.id === desk.activeModuleId) ?? desk?.modules[0];
  if (!module || module.status === "confirmed") return;
  const visible = visibleDeliveryText(text, "assistant");
  applyDeliveryProse(projectPath, visible);
  applyDeliveryAcknowledgement(projectPath, visible);
}

function applyOverallFields(
  modules: DeliveryModule[],
  payload: DeliveryChatPayload,
  extendOnly: boolean,
): DeliveryModule[] {
  if (!payload.style && !payload.layout) return modules;
  return modules.map((module) => {
    if (module.id !== GLOBAL_MODULE_ID || module.status === "confirmed") return module;
    const style = extendOnly ? growText(module.card.style, payload.style || "") : blankMerge(module.card.style, payload.style || "");
    const layout = extendOnly ? growText(module.card.layout, payload.layout || "") : blankMerge(module.card.layout, payload.layout || "");
    if (style === module.card.style && layout === module.card.layout) return module;
    return { ...module, card: { ...module.card, style, layout } };
  });
}

export function applyDeliveryChat(
  projectPath: string,
  payload: DeliveryChatPayload,
  options: { extendOnly?: boolean } = {},
): void {
  const extendOnly = options.extendOnly === true;
  if (autoFixWriteFields) {
    payload = blankUnlistedCardFields(payload, autoFixWriteFields);
    if (!extendOnly) autoFixWriteFields = null;
  }
  const desk = ensureDelivery(projectPath);
  if (!desk) return;
  if (payload.summary || payload.components?.length) {
    replaceDeliveryArchitecture(
      projectPath,
      payload.summary || "",
      payload.components ?? [],
    );
  }
  const current = peekDelivery(projectPath);
  if (!current) return;
  const byId = new Map(current.modules.map((module) => [module.id, module]));
  for (const incoming of payload.modules ?? []) {
    const old = byId.get(incoming.id);
    if (old?.status === "confirmed") {
      byId.set(incoming.id, {
        ...old,
        title: incoming.title || old.title,
      });
      continue;
    }
    const card = { ...(old?.card ?? cardFrom({})) };
    for (const field of CARD_FIELDS) {
      if ((field === "style" || field === "layout") && incoming.id !== GLOBAL_MODULE_ID) continue;
      const incomingText = incoming[field] || "";
      if (
        incoming.id !== GLOBAL_MODULE_ID
        && !card[field].trim()
        && isSharedBaselineOptOut(field, incomingText)
      ) continue;
      card[field] = extendOnly
        ? growText(card[field], incomingText)
        : blankMerge(card[field], incomingText);
    }
    byId.set(incoming.id, {
      id: incoming.id,
      title: extendOnly
        ? growText(old?.title || "", incoming.title) || old?.title || incoming.id
        : incoming.title || old?.title || incoming.id,
      status: "draft",
      dependsOn: incoming.dependsOn.length ? incoming.dependsOn : old?.dependsOn ?? [],
      card,
    });
  }
  let modules = [...byId.values()];
  if (payload.modules?.length) {
    const incomingIds = new Set(payload.modules.map((module) => module.id));
    const kept = modules.filter((module) => incomingIds.has(module.id) || !moduleIsBlankSeed(module));
    if (kept.length) modules = kept;
  }
  if (!modules.length) modules = current.modules;
  let activeModuleId = current.activeModuleId;
  if (payload.activeModuleId && modules.some((module) => module.id === payload.activeModuleId)) {
    activeModuleId = payload.activeModuleId;
  } else if (!modules.some((module) => module.id === activeModuleId)) {
    activeModuleId = modules[0]?.id ?? activeModuleId;
  }
  modules = modules.map((module) => patchActive(module, module.id === activeModuleId, payload, extendOnly));
  modules = applyOverallFields(modules, payload, extendOnly);
  commitDeliveryChatModules(projectPath, modules, activeModuleId);
  if (payload.revision) setDeliveryRevision(projectPath, payload.revision);
}

function patchActive(
  module: DeliveryModule,
  active: boolean,
  payload: DeliveryChatPayload,
  extendOnly: boolean,
): DeliveryModule {
  if (!active || module.status === "confirmed") return module;
  const card = { ...module.card };
  let changed = false;
  for (const field of CARD_FIELDS) {
    if ((field === "style" || field === "layout") && module.id !== GLOBAL_MODULE_ID) continue;
    if (!payload[field]) continue;
    if (
      module.id !== GLOBAL_MODULE_ID
      && !card[field].trim()
      && isSharedBaselineOptOut(field, payload[field])
    ) continue;
    const next = extendOnly ? growText(card[field], payload[field]) : payload[field];
    if (next === card[field]) continue;
    card[field] = next;
    changed = true;
  }
  return changed ? { ...module, card } : module;
}

const REQUIREMENTS_INSTRUCTION = `你是 DuaerAiDesk 的需求助手。把用户随口说的话整理进确认卡。不要调用工具，不要修改文件，不要写代码，不要派工。
每次只问 1 个卡点。让用户做选择时，options 填 2～5 个短选项（每个不超过 20 字），正文不要再列一遍选项。不要用 markdown 星号。确认卡字段（要做什么、页面内容、不做的事、验收、默认基线）不要放进 options，也不要用项目符号再列一遍确认卡。没有需要用户选择时 options 为空数组。
系统可能很大：边聊边发现模块清单 modules（id、title）。对话可以乱跳模块；把内容写进对应模块的确认卡，不要强迫用户按顺序说完。modules 是完整清单，可以新增和改名。小项目可以只有一个功能模块。不要让用户手动新建模块。已确认模块的确认卡保持锁定，JSON 里不要改这些模块的字段。
模块清单必须保留 id 为 global 的全局要求。需求阶段不要填写 style 和 layout，留空；架构锁定后由 UI 设计师写入。全站共用的八项基线也只写在 global，并且要能核对。其它模块不要重复这些整体项，留空即可。某个模块自己的独特要求必须写在该模块上，而且要能核对，例如浏览器矩阵不能只写「桌面为主」。不要删除 global。
用户不满意已定稿或成品（例如不够美观、美化一下、改样式）时：不要改确认卡，不要让用户从几种风格里选一个来代替验收。先判断范围：只涉及某一个模块就 scope 为 module 并填写 moduleId；说的是整体观感，或看不出是哪一块，就 scope 为 overall，moduleId 为空。写进 revise，不要写进 modules。revise.goal 是这一轮要改什么，outOfScope 是不要动什么（含已确认约束），acceptance 必须可核对（打开何处、看到什么），assumptions 是不满意的原因。禁止只写更好看。信息不够时只问 1 个缺口。
未写明的八项基线只填在 global，其它模块留空。验收必须可核对，禁止用更好看代替验收。ready 不要催确认。
输出：先写给用户看的纯文本，然后单独一行 <<<JSON>>>，再输出一个 JSON 对象（不要 markdown 围栏）。正文里的「明白了」不能代替 JSON，刚确认的内容必须写进对应字段：
{"modules":[{"id":"record","title":"记录","goal":"","outOfScope":"","acceptance":"","assumptions":"","deviceMatrix":"","criticalPaths":"","exceptionCases":"","apiContract":"","envChecklist":"","dataPrecheck":"","externalDeps":"","perfBudget":"","dependsOn":[]},{"id":"review","title":"回顾","goal":"","outOfScope":"","acceptance":"","assumptions":"","deviceMatrix":"","criticalPaths":"","exceptionCases":"","apiContract":"","envChecklist":"","dataPrecheck":"","externalDeps":"","perfBudget":"","dependsOn":["record"]}],"activeModuleId":"record","goal":"","outOfScope":"","acceptance":"","assumptions":"","deviceMatrix":"","criticalPaths":"","exceptionCases":"","apiContract":"","envChecklist":"","dataPrecheck":"","externalDeps":"","perfBudget":"","options":["可选A","可选B"],"revise":null}`;

const EXISTING_REQUIREMENTS_INSTRUCTION = `你是 DuaerAiDesk 的需求助手。工作区里已经有产品代码。先只读仓库，把现在已经提供给用户的功能整理进确认卡。可以只读文件来核对现状。不要修改文件，不要写代码，不要派工。
每次只问 1 个卡点。让用户做选择时，options 填 2～5 个短选项（每个不超过 20 字），正文不要再列一遍选项。不要用 markdown 星号。确认卡字段不要放进 options，也不要用项目符号再列一遍确认卡。没有需要用户选择时 options 为空数组。
每个现在能用的功能一个模块（id、title）。modules 必须盖住现状功能，不要只写用户这次想加的那一句。background 是这次迭代的上下文，不是现状的全部。现状模块还是草稿时，不要用新需求覆盖这些卡。现状模块全部确认之后，新需求写成新模块或 revise。已确认模块的确认卡保持锁定。
模块清单必须保留 id 为 global 的全局要求。需求阶段不要填写 style 和 layout，留空；架构锁定后由 UI 设计师写入。全站共用的八项基线也只写在 global，并且要能核对。其它模块不要重复这些整体项，留空即可。某个模块自己的独特要求必须写在该模块上，而且要能核对，例如浏览器矩阵不能只写「桌面为主」。不要删除 global。
用户不满意已定稿或成品（例如不够美观、美化一下、改样式）时：不要改确认卡，不要让用户从几种风格里选一个来代替验收。先判断范围：只涉及某一个模块就 scope 为 module 并填写 moduleId；说的是整体观感，或看不出是哪一块，就 scope 为 overall，moduleId 为空。写进 revise，不要写进 modules。revise.goal 是这一轮要改什么，outOfScope 是不要动什么（含已确认约束），acceptance 必须可核对（打开何处、看到什么），assumptions 是不满意的原因。禁止只写更好看。信息不够时只问 1 个缺口。
现状基线只写在 global。其它模块留空，除非这段功能自己有不同的设备、接口或性能要求。验收写现在打开哪里、能做什么，必须可核对。ready 不要催确认。
输出：先写给用户看的纯文本，然后单独一行 <<<JSON>>>，再输出一个 JSON 对象（不要 markdown 围栏）。正文里的「明白了」不能代替 JSON，刚确认的内容必须写进对应字段。只读核对之后也要带上这张卡：
{"modules":[{"id":"record","title":"记录","goal":"","outOfScope":"","acceptance":"","assumptions":"","deviceMatrix":"","criticalPaths":"","exceptionCases":"","apiContract":"","envChecklist":"","dataPrecheck":"","externalDeps":"","perfBudget":"","dependsOn":[]}],"activeModuleId":"record","goal":"","outOfScope":"","acceptance":"","assumptions":"","deviceMatrix":"","criticalPaths":"","exceptionCases":"","apiContract":"","envChecklist":"","dataPrecheck":"","externalDeps":"","perfBudget":"","options":["可选A","可选B"],"revise":null}`;

const BUG_INSTRUCTION = `你是 DuaerAiDesk 的修缺陷助手。用户要修已经坏掉的行为，不是做新功能。不要调用工具，不要修改文件，不要写代码，不要派工，不要谈架构。
每次只问 1 个卡点，按这个顺序问完：怎么复现、期望看到什么、实际看到什么。
写进全局确认卡：goal 是坏掉的行为，acceptance 是期望结果（必须可核对），assumptions 是实际现象和复现步骤。不要编新功能。八项基线全部留空。style 和 layout 留空。
输出：先写给用户看的纯文本，然后单独一行 <<<JSON>>>，再输出一个 JSON 对象（不要 markdown 围栏）。正文里的「明白了」不能代替 JSON：
{"modules":[{"id":"global","title":"全局要求","goal":"","outOfScope":"","acceptance":"","assumptions":"","deviceMatrix":"","criticalPaths":"","exceptionCases":"","apiContract":"","envChecklist":"","dataPrecheck":"","externalDeps":"","perfBudget":"","dependsOn":[]}],"activeModuleId":"global","options":[]}`;

const BOTH_PREFIX = `判断师：这句话里既有已坏掉的行为，也有新需求。先把故障记进全局确认卡（goal 是坏掉的行为，acceptance 是期望，assumptions 是实际现象和复现），再整理新需求。拆任务时，修缺陷的任务 id 挡住新需求任务。不要为了修这个缺陷去设计新架构。
`;

const UNCLEAR_INSTRUCTION = `你是 DuaerAiDesk。判断师还分不清这是修缺陷还是新需求。只问 1 个能区分的问题，不要猜，不要谈架构，不要派工，不要写确认卡 JSON。`;

const ARCHITECTURE_INSTRUCTION = `你是 DuaerAiDesk 的架构助手。全部需求模块已确认。在左侧对话里一起定系统架构（Archify 架构图）。
规则：每次只问 1 个最关键架构问题；options 给 2～5 个短选项（每个不超过 20 字），正文不要再列一遍选项。不要写业务代码，不要改仓库，不要派工。用户对已确认需求或成品的观感不满（美化、不好看）时，不要改架构图来代替，改写进 revise（scope 为 module 或 overall），已确认模块字段不动。
组件 4～12 个，一条主路径。type 只能是 frontend|backend|database|cloud|security|messagebus|external。label 短，sublabel 不超过 12 字，连线 label 不超过 8 字。用 boundaries 包住同一区域，用 cards 写旁注。不要写 pos/size，也不要只给 name/responsibility 简表。
当架构可画图时，JSON 必须是完整 Archify IR。
输出：先写给用户看的纯文本，然后单独一行 <<<JSON>>>，再输出 JSON（不要 markdown 围栏）：
{"diagram_type":"architecture","schema_version":1,"meta":{"title":"一句话架构","quality_profile":"standard"},"components":[{"id":"web","type":"frontend","label":"Web","sublabel":"页面"},{"id":"api","type":"backend","label":"API","sublabel":"业务"},{"id":"db","type":"database","label":"DB","sublabel":"数据"}],"boundaries":[{"kind":"region","label":"服务","wraps":["api","db"]}],"connections":[{"id":"e1","from":"web","to":"api","label":"请求","variant":"emphasis"},{"id":"e2","from":"api","to":"db","label":"读写"}],"cards":[{"dot":"cyan","title":"概览","items":["页面进 API","API 读写数据"]}],"summary":"一句话架构","options":["选项A","选项B"]}`;

const EXISTING_ARCHITECTURE_INSTRUCTION = `你是 DuaerAiDesk 的架构助手。需求模块写的是现在已有的功能。在左侧对话里整理现在的系统架构（Archify 架构图），作为后面迭代的底图。
规则：每次只问 1 个最关键架构问题；options 给 2～5 个短选项（每个不超过 20 字），正文不要再列一遍选项。可以只读仓库核对组件。不要写业务代码，不要改仓库，不要派工。用户对已确认需求或成品的观感不满（美化、不好看）时，不要改架构图来代替，改写进 revise（scope 为 module 或 overall），已确认模块字段不动。
组件 4～12 个，一条主路径，内容是现在就有的组件，不要画成尚未存在的目标方案。type 只能是 frontend|backend|database|cloud|security|messagebus|external。label 短，sublabel 不超过 12 字，连线 label 不超过 8 字。用 boundaries 包住同一区域，用 cards 写旁注。不要写 pos/size，也不要只给 name/responsibility 简表。
当架构可画图时，JSON 必须是完整 Archify IR。
输出：先写给用户看的纯文本，然后单独一行 <<<JSON>>>，再输出 JSON（不要 markdown 围栏）：
{"diagram_type":"architecture","schema_version":1,"meta":{"title":"现在的系统","quality_profile":"standard"},"components":[{"id":"web","type":"frontend","label":"Web","sublabel":"页面"},{"id":"api","type":"backend","label":"API","sublabel":"业务"},{"id":"db","type":"database","label":"DB","sublabel":"数据"}],"boundaries":[{"kind":"region","label":"服务","wraps":["api","db"]}],"connections":[{"id":"e1","from":"web","to":"api","label":"请求","variant":"emphasis"},{"id":"e2","from":"api","to":"db","label":"读写"}],"cards":[{"dot":"cyan","title":"现状","items":["页面进 API","API 读写数据"]}],"summary":"现在的系统","options":["选项A","选项B"]}`;

export function modelContentForDelivery(
  input: {
    workPanelOpen: boolean;
    activeWorkPanelTabKind?: string;
    projectPath?: string | null;
  },
  content: string,
): string {
  const text = content.trim();
  if (text.includes(DELIVERY_DISPATCH_MARKER)) {
    return content.replaceAll(DELIVERY_DISPATCH_MARKER, "").trim();
  }
  if (!text || text.includes(DELIVERY_DESK_MARKER) || text.includes(DELIVERY_AUTO_FIX_MARKER) || !input.workPanelOpen) return content;
  const kind = input.activeWorkPanelTabKind;
  if (kind !== "requirements" && kind !== "architecture") return content;
  const path = input.projectPath?.trim();
  if (!path) return content;
  const desk = peekDelivery(path) ?? ensureDelivery(path);
  if (!desk) return content;
  const existing = desk.existingProject === true;
  const lane = desk.intake?.kind;
  const requirements = existing ? EXISTING_REQUIREMENTS_INSTRUCTION : REQUIREMENTS_INSTRUCTION;
  const instruction = kind === "architecture"
    ? (existing ? EXISTING_ARCHITECTURE_INSTRUCTION : ARCHITECTURE_INSTRUCTION)
    : lane === "bug"
      ? BUG_INSTRUCTION
      : lane === "unclear"
        ? UNCLEAR_INSTRUCTION
        : lane === "both"
          ? `${BOTH_PREFIX}${requirements}`
          : requirements;
  const snapshot = JSON.stringify({
    activeModuleId: desk.activeModuleId,
    modules: desk.modules.map((module) => ({
      id: module.id,
      title: module.title,
      status: module.status,
      dependsOn: module.dependsOn,
      ...module.card,
    })),
    architecture: desk.architecture,
    background: desk.background,
  });
  return `${content}\n\n${DELIVERY_DESK_MARKER}\n${instruction}\n当前确认卡：${snapshot}`;
}
