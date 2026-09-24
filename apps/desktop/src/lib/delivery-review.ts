import { deliveryCardIssues, type DeliveryCardIssue, type DeliveryCheckScope } from "./delivery-card-check.ts";
import { DELIVERY_AUTO_FIX_MARKER } from "./delivery-chat.ts";
import type { DeliveryCard, DeliveryCardField } from "./delivery-desk.ts";

/** Same field order the Duaer-spec live desk fingerprints before confirm. */
export const DELIVERY_REVIEW_FIELDS = [
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
] as const satisfies readonly DeliveryCardField[];

/** Explicit opt-outs from the live-desk fix prompt. Auto-fix writes these only into failing fields. */
export const DELIVERY_FIX_DEFAULTS = {
  deviceMatrix: "Chrome 最近两版、手机 Safari；云测截图放 compat/；旧壳降级提示升级",
  exceptionCases: "空态；失败可重试；权限不足；超时；重试",
  apiContract: "本模块无 HTTP API",
  envChecklist: "无客户联调环境",
  dataPrecheck: "本模块无导入",
  externalDeps: "本模块无外部依赖",
  perfBudget: "本模块无页面性能要求",
  style: "沿用现有样式：白底、深色字、正文 16px、间距 8px",
  layout: "沿用现有布局：单栏，顶部导航",
} as const;

const BASELINE_NOTE = "未写明的基线按模块默认补全。";

const ACCEPT_PROMPT = `你是「Duaer」需求验收官。用户即将锁定某一个模块的确认卡（尚未整系统开工）。目标是：规范该模块需求，使数字员工日后能交付可核对成品。

检查：
1. goal 是否单一、可执行（一件事，不要堆多个无关功能）
2. acceptance 是否可客观检查：必须写清「打开/看到/点击/返回/命令通过/接口返回」等可核对结果；禁止仅「更好用 / 更好看 / nicer / looks better」这类空话
3. outOfScope 是否划清边界（可简短）
4. assumptions 是否合理、不偷换目标
5. deviceMatrix / criticalPaths / exceptionCases 是否已填且具体（禁止空；deviceMatrix 至少两个具体浏览器或国产终端，并写截图/云测证据和降级或 Polyfill，禁止只写「主流浏览器」；exceptionCases 必须覆盖空态、失败、权限不足、超时、重试；有接口时还要错误码或 HTTP status）
6. apiContract 是否已填：OpenAPI/类型等路径，或明确「本模块无 HTTP API」（禁止空）
7. envChecklist 是否已填：DNS、TLS、CORS、鉴权、第三方可达全部通过，或明确「无客户联调环境」；存在未通过项则 passed=false
8. dataPrecheck 是否已填：字段映射、导入预检失败清单、可导出，或明确「本模块无导入」
9. externalDeps 是否已填：阻塞项、SLA、备用 Mock、并行路径，或明确「本模块无外部依赖」
10. perfBudget 是否已填：LCP、INP、包体、长列表虚拟滚动、弱网、大数据压测，或明确「本模块无页面性能要求」；禁止只写「挺快的」
11. 按该验收标准做完后，用户是否有理由满意（成品可核对，而非过程叙事）

规则：
- 共用基线（deviceMatrix 到 perfBudget）以及 style、layout 如果是空的，不要因此判失败。非空时仍须可核对，禁止只写「桌面为主」或「更好看」
- 若小改即可通过：修订确认卡字段（尤其把 acceptance 改成可检查句子，并补全基线与契约），passed=true
- 若缺关键信息：passed=false，issues 列出缺什么（中文，短句）
- 不要写代码。不要假设仓库路径。不要催派工。
- 只输出一个 JSON，不要 markdown 围栏：
{"passed":false,"summary":"一句话结论","issues":["问题1"],"goal":"...","outOfScope":"...","acceptance":"...","assumptions":"...","deviceMatrix":"...","criticalPaths":"...","exceptionCases":"...","apiContract":"...","envChecklist":"...","dataPrecheck":"...","externalDeps":"...","perfBudget":"..."}`;

const FIX_ACCEPT_PROMPT = `你是「Duaer」需求修正助手。自动验收未通过，请根据 issues 修订确认卡。优先把 acceptance 改成可客观检查的句子（打开何处、看到什么、哪条命令通过），并补全 deviceMatrix / criticalPaths / exceptionCases / apiContract / envChecklist / dataPrecheck / externalDeps / perfBudget；不要编造用户没提过的大功能。

规则：
1. 针对每条 issue 修改 goal / outOfScope / acceptance / assumptions / deviceMatrix / criticalPaths / exceptionCases / apiContract / envChecklist / dataPrecheck / externalDeps / perfBudget
2. 保持用户原意；缺信息时写合理、可检查的默认（如 Chrome 最近两版、手机 Safari，云测截图放 compat/，旧壳降级提示升级；主路径对齐 goal；异常态须同时写上空态、失败、权限不足、超时、重试，有接口则补错误码；无接口则写「本模块无 HTTP API」；无客户联调则 envChecklist 写「无客户联调环境」，否则 DNS、TLS、CORS、鉴权、第三方可达全部写通过；无导入则 dataPrecheck 写「本模块无导入」，否则写字段映射、导入预检失败清单、可导出；无外部依赖则 externalDeps 写「本模块无外部依赖」，否则写阻塞项、SLA、备用 Mock、并行路径；无页面则 perfBudget 写「本模块无页面性能要求」，否则写 LCP、INP、包体、长列表虚拟滚动、弱网、大数据压测，禁止只写「挺快的」），并写进 assumptions
3. 不要写代码。不要假设仓库路径。
4. 只输出一个 JSON，不要 markdown 围栏：
{"summary":"一句话说明改了什么","goal":"...","outOfScope":"...","acceptance":"...","assumptions":"...","deviceMatrix":"...","criticalPaths":"...","exceptionCases":"...","apiContract":"...","envChecklist":"...","dataPrecheck":"...","externalDeps":"...","perfBudget":"..."}`;

export type DeliveryReviewStatus = "idle" | "checking" | "passed" | "failed";

export type DeliveryReviewState = {
  status: DeliveryReviewStatus;
  fingerprint: string;
  summary: string;
  issues: string[];
};

export type DeliveryReviewResult = {
  passed: boolean;
  summary: string;
  issues: string[];
  card: DeliveryCard;
};

export function deliveryCardFingerprint(card: DeliveryCard): string {
  return JSON.stringify(DELIVERY_REVIEW_FIELDS.map((field) => (card[field] ?? "").trim()));
}

export function clipDeliveryReviewCard(value: unknown): DeliveryCard {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const card = {} as DeliveryCard;
  for (const field of DELIVERY_REVIEW_FIELDS) {
    const text = typeof raw[field] === "string" ? raw[field].trim() : "";
    card[field] = text.slice(0, 4000);
  }
  return card;
}

/** Fill the same explicit defaults the live-desk fix prompt uses. A short goal is left for the model. */
export function localDeliveryFix(card: DeliveryCard, scope: DeliveryCheckScope = "full"): DeliveryCard {
  const next: DeliveryCard = { ...card };
  const issues = deliveryCardIssues(card, scope);
  const fields = new Set(issues.map((issue) => issue.field));
  const codes = new Set(issues.map((issue) => issue.code));
  if (fields.has("acceptance")) {
    const basis = card.goal.trim() || card.acceptance.trim() || "该模块结果";
    next.acceptance = `打开页面能看到：${basis}`;
  }
  if (fields.has("deviceMatrix")) next.deviceMatrix = DELIVERY_FIX_DEFAULTS.deviceMatrix;
  if (fields.has("criticalPaths")) {
    const goal = card.goal.trim();
    next.criticalPaths = goal.length >= 4 ? `打开页面完成：${goal}` : "打开首页完成该模块目标";
  }
  if (codes.has("exceptions")) next.exceptionCases = DELIVERY_FIX_DEFAULTS.exceptionCases;
  if (fields.has("apiContract")) next.apiContract = DELIVERY_FIX_DEFAULTS.apiContract;
  if (fields.has("envChecklist")) next.envChecklist = DELIVERY_FIX_DEFAULTS.envChecklist;
  if (fields.has("dataPrecheck")) next.dataPrecheck = DELIVERY_FIX_DEFAULTS.dataPrecheck;
  if (fields.has("externalDeps")) next.externalDeps = DELIVERY_FIX_DEFAULTS.externalDeps;
  if (fields.has("perfBudget")) next.perfBudget = DELIVERY_FIX_DEFAULTS.perfBudget;
  const declaresApi = next.apiContract.trim().length >= 4
    && !/本模块无\s*HTTP\s*API|无\s*HTTP\s*API|无对外接口|不涉及接口|no\s*http\s*api/i.test(next.apiContract);
  if (declaresApi && !/错误码|error\s*code|status\s*\d{3}|\b[45]\d{2}\b/i.test(next.exceptionCases)) {
    const base = next.exceptionCases.trim();
    next.exceptionCases = base ? `${base}；错误码 400` : "空态；失败可重试；权限不足；超时；重试；错误码 400";
  }
  const changedBaseline = DELIVERY_REVIEW_FIELDS.some((field) => (
    field !== "goal" && field !== "outOfScope" && field !== "acceptance" && field !== "assumptions"
    && next[field] !== card[field]
  ));
  if (changedBaseline && !next.assumptions.includes(BASELINE_NOTE)) {
    next.assumptions = [next.assumptions.trim(), BASELINE_NOTE].filter(Boolean).join(" ");
  }
  return next;
}

/**
 * Write opt-out defaults into baseline fields the user left empty, once goal
 * and acceptance already pass. Non-empty text is left alone.
 */
export function fillEmptyBaseline(card: DeliveryCard, scope: DeliveryCheckScope = "full"): DeliveryCard {
  const issues = deliveryCardIssues(card, scope);
  if (!issues.length) return card;
  if (issues.some((issue) => issue.field === "goal" || issue.field === "acceptance")) return card;
  const next: DeliveryCard = { ...card };
  let changed = false;
  for (const issue of issues) {
    const field = issue.field;
    if ((next[field] ?? "").trim()) continue;
    if (field === "criticalPaths") {
      const goal = card.goal.trim();
      next.criticalPaths = goal.length >= 4 ? `打开页面完成：${goal}` : "打开首页完成该模块目标";
    } else if (field in DELIVERY_FIX_DEFAULTS) {
      next[field] = DELIVERY_FIX_DEFAULTS[field as keyof typeof DELIVERY_FIX_DEFAULTS];
    } else {
      continue;
    }
    changed = true;
  }
  if (!changed) return card;
  if (!next.assumptions.includes(BASELINE_NOTE)) {
    next.assumptions = [next.assumptions.trim(), BASELINE_NOTE].filter(Boolean).join(" ");
  }
  return next;
}

export function deliveryReviewPrompt(
  mode: "validate" | "fix",
  card: DeliveryCard,
  issues: string[] = [],
): { systemPrompt: string; user: string } {
  const body = JSON.stringify(card, null, 2);
  if (mode === "fix") {
    return {
      systemPrompt: FIX_ACCEPT_PROMPT,
      user: `确认卡：\n${body}\n\n未通过原因 issues：\n${JSON.stringify(issues, null, 2)}\n\n请修订。`,
    };
  }
  return {
    systemPrompt: ACCEPT_PROMPT,
    user: `请验收以下确认卡：\n${body}`,
  };
}

export type DeliveryAutoFixSlice = {
  /** Confirm-card key the model may rewrite. */
  field: DeliveryCardField;
  /** Text already on that field. */
  current: string;
  /** Localized gaps still missing, already joined for the prompt. */
  missing: string;
};

/**
 * Fields an auto-fix turn may rewrite, plus read-only context those fields need.
 * Other card fields stay out of the prompt.
 */
export function selectDeliveryAutoFixFields(
  card: DeliveryCard,
  issues: DeliveryCardIssue[],
): { write: DeliveryCardField[]; context: DeliveryCardField[] } {
  const write = [...new Set(issues.map((issue) => issue.field))];
  const writing = new Set(write);
  const context: DeliveryCardField[] = [];
  if (
    issues.some((issue) => issue.code === "exceptionsCode")
    && !writing.has("apiContract")
    && card.apiContract.trim()
  ) {
    context.push("apiContract");
  }
  if (
    issues.some((issue) => issue.field === "acceptance" || issue.field === "criticalPaths")
    && !writing.has("goal")
    && card.goal.trim()
  ) {
    context.push("goal");
  }
  return { write, context };
}

/**
 * User-visible auto-fix prompt sent into the requirements chat so the
 * desktop model rewrites only the failing fields (not a silent one-shot,
 * and not the rest of the card).
 */
export function deliveryAutoFixPrompt(input: {
  moduleId: string;
  moduleTitle: string;
  fields: DeliveryAutoFixSlice[];
  context?: DeliveryAutoFixSlice[];
  /** Used only when no field slice is known, so a review failure still has a target. */
  notes?: string[];
}): string {
  const title = input.moduleTitle.trim() || input.moduleId;
  const writable = input.fields.filter((field) => field.field);
  const keys = writable.map((field) => field.field);
  const fieldLines = writable.flatMap((field) => {
    const lines = [field.field, `现有：${field.current.trim() || "（空）"}`];
    if (field.missing.trim()) lines.push(`只补：${field.missing.trim()}`);
    return lines;
  });
  const contextLines = (input.context ?? [])
    .filter((field) => field.current.trim())
    .flatMap((field) => [`对照 ${field.field}（不要改）：${field.current.trim()}`]);
  const notes = keys.length
    ? []
    : (input.notes ?? []).map((note) => note.trim()).filter(Boolean).slice(0, 8);
  return [
    DELIVERY_AUTO_FIX_MARKER,
    `只改「${title}」的这些字段：${keys.join("、") || "（无）"}。保留已有内容，只补缺项。`,
    "先一句话说明改了什么，再单独一行 <<<JSON>>>，只输出这些字段。",
    ...fieldLines,
    ...contextLines,
    ...notes,
  ].join("\n");
}

export function parseModelJson(text: string): Record<string, unknown> {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return {};
  try {
    const value = JSON.parse(trimmed.slice(start, end + 1)) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export function parseDeliveryReview(
  text: string,
  fallback: DeliveryCard,
  mode: "validate" | "fix",
): DeliveryReviewResult {
  const obj = parseModelJson(text);
  const card = clipDeliveryReviewCard({
    ...fallback,
    ...Object.fromEntries(DELIVERY_REVIEW_FIELDS.flatMap((field) => {
      const value = obj[field];
      return typeof value === "string" && value.trim() ? [[field, value]] : [];
    })),
  });
  const issues = Array.isArray(obj.issues)
    ? obj.issues.map((item) => String(item).trim()).filter(Boolean).slice(0, 8)
    : [];
  return {
    passed: mode === "validate" && obj.passed === true,
    summary: typeof obj.summary === "string" ? obj.summary.trim().slice(0, 500) : "",
    issues,
    card,
  };
}
