import type { DeliveryCard, DeliveryCardField } from "./delivery-desk.ts";

export type DeliveryCardIssue = {
  field: DeliveryCardField;
  code:
    | "goalShort"
    | "acceptanceShort"
    | "acceptanceVague"
    | "acceptanceCheck"
    | "style"
    | "layout"
    | "device"
    | "paths"
    | "exceptions"
    | "exceptionsCode"
    | "api"
    | "env"
    | "data"
    | "deps"
    | "perf"
    | "reproShort";
  missing?: string[];
};

/** `full` keeps the historical every-field gate. `global` checks shared baselines. `module` checks a baseline only when that module wrote one. Style and layout are not a requirements gate. */
export type DeliveryCheckScope = "full" | "global" | "module" | "bug";

/** Required on the global card. A feature module leaves these empty unless it has its own rule. */
export const SHARED_BASELINE_FIELDS = [
  "deviceMatrix",
  "criticalPaths",
  "exceptionCases",
  "apiContract",
  "envChecklist",
  "dataPrecheck",
  "externalDeps",
  "perfBudget",
] as const satisfies readonly DeliveryCardField[];

const SHARED_BASELINE_OPT_OUT: Partial<Record<DeliveryCardField, RegExp>> = {
  deviceMatrix: /Chrome 最近两版/,
  criticalPaths: /^打开(?:页面|首页)完成/,
  exceptionCases: /空态[；;].*失败.*权限不足.*超时.*重试/,
  apiContract: /^(?:本模块)?无\s*HTTP\s*API$|无对外接口|不涉及接口|^no\s*http\s*api$/i,
  envChecklist: /无客户联调环境/,
  dataPrecheck: /(?:本模块)?无导入/,
  externalDeps: /(?:本模块)?无外部依赖/,
  perfBudget: /(?:本模块)?无页面性能要求/,
};

/** Canned auto-fix text. It belongs on global, not on a feature module that left the field empty. */
export function isSharedBaselineOptOut(field: DeliveryCardField, text: string): boolean {
  const value = text.trim();
  if (!value || !(SHARED_BASELINE_FIELDS as readonly string[]).includes(field)) return false;
  return SHARED_BASELINE_OPT_OUT[field]?.test(value) === true;
}

const NAMED_TARGETS = [
  /chrome/i,
  /safari/i,
  /firefox/i,
  /\bedge\b/i,
  /\bie\s*11\b|\bie11\b|\binternet explorer\b/i,
  /麒麟|统信|\buos\b|360|qq\s*浏览器|微信|鸿蒙|android|\bios\b|iphone|国产/i,
  /手机/,
];

const UAT_CASES = [
  { id: "empty", re: /空态|空列表|为空|无数据|\bempty\b/i },
  { id: "failure", re: /失败|错误|出错|\bfail|\berror/i },
  { id: "permission", re: /权限|未授权|403|\bforbidden\b|\bpermission\b/i },
  { id: "timeout", re: /超时|\btimeout\b|timed out/i },
  { id: "retry", re: /重试|\bretry\b/i },
];

function namedTargetCount(text: string): number {
  return NAMED_TARGETS.filter((pattern) => pattern.test(text)).length;
}

function missingCompat(text: string): string[] {
  const missing: string[] = [];
  const vagueOnly = /^(主流浏览器|现代浏览器|主流终端|modern browsers|all browsers)[.。!！\s]*$/i.test(text);
  if (vagueOnly || namedTargetCount(text) < 2) missing.push("browsers");
  if (!/截图|录屏|云测|真机|证据|screenshot|recording|browserstack|compat\//i.test(text)) missing.push("evidence");
  if (!/降级|polyfill|不支持|fallback|垫片|提示升级|upgrade notice/i.test(text)) missing.push("fallback");
  return missing;
}

function acceptanceLooksCheckable(text: string): boolean {
  return /打开|看到|显示|点击|返回|为空|出现|通过|等于|包含|列表|页面|接口|按钮|标题|颜色|导航|首页|登录|公告|截图|对照|#[0-9a-fA-F]{3,8}|npm\s|test:|http|curl|\.html|\.json|passes?\b|shows?\b|returns?\b|opens?\b|click\b|empty\b|status\s*\d{3}|assert\b|expect\b/i.test(text);
}

function acceptanceLooksVague(text: string): boolean {
  return /更好用|更好看|更美观|更漂亮|更流畅|优化体验|提升体验|用户满意|看起来不错|(?:^|[\s,.;:，。；])(better|nicer|prettier|more beautiful|improved ux|looks?\s+better|polish(?:ed)?|more polished)(?:$|[\s,.;:])/i.test(text);
}

function apiDeclaresNoHttp(text: string): boolean {
  return /本模块无\s*HTTP\s*API|无\s*HTTP\s*API|无对外接口|不涉及接口|无后端|不接后端|无接口|no\s*http\s*api|no\s*api|none|n\/a/i.test(text);
}

function isLocalStaticCard(card: DeliveryCard): boolean {
  const text = [
    card.goal,
    card.outOfScope,
    card.assumptions,
    card.apiContract,
    card.envChecklist,
    card.externalDeps,
    card.deviceMatrix,
  ].join("\n");
  return /纯静态|本地静态|双击|HTML\s*文件|无后端|不接后端|无接口|零依赖|不引\s*CDN|不引外部/i.test(text);
}

function exceptionsDoNotApply(text: string): boolean {
  return /无输入|无交互|异常分支极少|无异常|不涉及异常|纯展示|无点击/.test(text);
}

function missingEnv(text: string): string[] {
  if (/无客户联调|無客戶聯調|无客户环境|無客戶環境|无后端|不接后端|纯静态|本地静态|双击|HTML\s*文件|无需安装|无联调|no customer environment/i.test(text)) return [];
  const missing: string[] = [];
  if (!/\bdns\b|域名解析/i.test(text)) missing.push("dns");
  if (!/\btls\b|证书|憑證|\bhttps\b/i.test(text)) missing.push("tls");
  if (!/\bcors\b/i.test(text)) missing.push("cors");
  if (!/鉴权|鑑權|认证|認證|\bauth(?:entication|n|z)?\b|\bsso\b|登录态|登入態/i.test(text)) missing.push("auth");
  if (!/第三方|third[- ]party/i.test(text)) missing.push("thirdParty");
  if (/失败|失敗|不通|未通过|未通過|不可达|不可達|blocked|\bfail(?:ed|ure)?\b/i.test(text)) missing.push("probeFailed");
  else if (!/通过|通過|已探测|已探測|全绿|全綠|\bpass(?:ed)?\b|reachable/i.test(text)) missing.push("probePass");
  return missing;
}

function missingData(text: string): string[] {
  if (/本模块无导入|本模組無導入|无数据导入|無資料匯入|無數據導入|无数据依赖|无导入|没有导入|不导入|不涉及导入|no import/i.test(text)) return [];
  const missing: string[] = [];
  if (!/字段映射|欄位映射|映射表|field mapping/i.test(text)) missing.push("mapping");
  if (!/预检|預檢|precheck|失败清单|失敗清單|failure list/i.test(text)) missing.push("failureList");
  if (!/导出|導出|匯出|\bexport\b/i.test(text)) missing.push("exportable");
  return missing;
}

function missingDeps(text: string): string[] {
  if (/无外部依赖|無外部依賴|无第三方|無第三方|不引\s*CDN|不引外部|零依赖|离线可用|no external dependency/i.test(text)) return [];
  const missing: string[] = [];
  if (!/阻塞|blocker/i.test(text)) missing.push("blocker");
  if (!/\bsla\b/i.test(text)) missing.push("sla");
  if (!/\bmock\b|备用|備用/i.test(text)) missing.push("mock");
  if (!/并行|並行|parallel/i.test(text)) missing.push("parallel");
  return missing;
}

function concretePerfBudget(text: string): boolean {
  return /\blcp\b|\binp\b|\d+(?:\.\d+)?\s*(?:ms|s|kb|mb|fps)\b/i.test(text);
}

function missingPerf(text: string, localStatic: boolean): string[] {
  if (/无页面性能要求|無頁面性能要求|无性能要求|没有性能要求|无性能预算|no page performance/i.test(text)) return [];
  // A local file page that already states a measured limit does not also need
  // the app lab list (INP, virtual scroll, weak network, large-data load).
  if ((localStatic || /file:\/\//i.test(text)) && concretePerfBudget(text)) return [];
  const missing: string[] = [];
  if (!/\blcp\b/i.test(text)) missing.push("lcp");
  if (!/\binp\b/i.test(text)) missing.push("inp");
  if (!/包体|包大小|\bbundle\b|\d+(?:\.\d+)?\s*(?:kb|mb)\b/i.test(text)) missing.push("bundle");
  if (!/虚拟滚动|virtual scroll|长列表|長列表/i.test(text)) missing.push("longList");
  if (!/弱网|弱網|weak network|\b3g\b/i.test(text)) missing.push("weakNet");
  if (!/大数据|大數據|large data/i.test(text)) missing.push("largeData");
  return missing;
}

function needsConcreteStyle(text: string): boolean {
  const value = text.trim();
  if (/沿用现有|不改样式|不改風格|无单独样式|無單獨樣式|keep the current (?:style|look)/i.test(value)) return false;
  if (value.length < 8) return true;
  return !/色|字体|字型|字号|字號|间距|間距|圆角|圓角|#[0-9a-fA-F]{3,8}|\b(?:px|rem)\b|font|color|spacing/i.test(value);
}

function needsConcreteLayout(text: string): boolean {
  const value = text.trim();
  if (/沿用现有布局|沿用現有佈局|不改布局|不改佈局|keep the current layout/i.test(value)) return false;
  if (value.length < 8) return true;
  return !/栏|欄|导航|導航|页眉|頁首|页脚|頁尾|居中|列表|栅格|柵格|侧栏|側欄|header|sidebar|footer|grid|column/i.test(value);
}

/** Style and layout are ready for implementation when both are concrete. */
export function globalVisualReady(style: string, layout: string): boolean {
  return !needsConcreteStyle(style) && !needsConcreteLayout(layout);
}

function pushGap(
  issues: DeliveryCardIssue[],
  field: DeliveryCardField,
  code: DeliveryCardIssue["code"],
  text: string,
  missing: string[],
): void {
  if (text.length >= 4 && missing.length === 0) return;
  issues.push({ field, code, missing });
}

const GATHERING_ISSUE_CODES = new Set<DeliveryCardIssue["code"]>([
  "goalShort",
  "acceptanceShort",
]);

/**
 * The opening interview has not written a checkable goal and acceptance yet.
 * Auto-fix must not cover the guiding question in that case.
 */
export function deliveryCardStillGathering(issues: DeliveryCardIssue[]): boolean {
  return issues.length > 0 && issues.every((issue) => GATHERING_ISSUE_CODES.has(issue.code));
}

/** Same local gate as the Duaer-spec live desk confirm card, before any model review. */
export function deliveryCardIssues(
  card: DeliveryCard,
  scope: DeliveryCheckScope = "full",
): DeliveryCardIssue[] {
  const issues: DeliveryCardIssue[] = [];
  const goal = card.goal.trim();
  const acceptance = card.acceptance.trim();
  if (scope === "bug") {
    if (goal.length < 8) issues.push({ field: "goal", code: "goalShort" });
    if (acceptance.length < 12) issues.push({ field: "acceptance", code: "acceptanceShort" });
    else if (acceptanceLooksVague(acceptance) && !acceptanceLooksCheckable(acceptance)) {
      issues.push({ field: "acceptance", code: "acceptanceVague" });
    }
    if (card.assumptions.trim().length < 8) {
      issues.push({ field: "assumptions", code: "reproShort" });
    }
    return issues;
  }
  if (goal.length < 8) issues.push({ field: "goal", code: "goalShort" });
  if (acceptance.length < 12) issues.push({ field: "acceptance", code: "acceptanceShort" });
  else if (acceptanceLooksVague(acceptance) && !acceptanceLooksCheckable(acceptance)) {
    issues.push({ field: "acceptance", code: "acceptanceVague" });
  }   else if (!acceptanceLooksCheckable(acceptance) && acceptance.length < 40) {
    issues.push({ field: "acceptance", code: "acceptanceCheck" });
  }

  const shared = (text: string) => scope !== "module" || text.trim().length > 0;
  const localStatic = isLocalStaticCard(card);
  const device = card.deviceMatrix.trim();
  if (shared(device)) {
    const deviceMissing = localStatic && /浏览器|chrome|safari|firefox|edge/i.test(device)
      ? []
      : missingCompat(device);
    if (device.length < 4 || deviceMissing.length) {
      issues.push({ field: "deviceMatrix", code: "device", missing: deviceMissing });
    }
  }
  if (shared(card.criticalPaths) && card.criticalPaths.trim().length < 4) {
    issues.push({ field: "criticalPaths", code: "paths" });
  }

  const exceptions = card.exceptionCases.trim();
  if (shared(exceptions)) {
    const exceptionsWaived = exceptionsDoNotApply(exceptions);
    const exceptionMissing = UAT_CASES.filter((item) => !item.re.test(exceptions)).map((item) => item.id);
    if (!exceptionsWaived && (exceptions.length < 4 || exceptionMissing.length)) {
      issues.push({ field: "exceptionCases", code: "exceptions", missing: exceptionMissing });
    } else if (
      !exceptionsWaived
      && card.apiContract.trim().length >= 4
      && !apiDeclaresNoHttp(card.apiContract)
      && !/错误码|error\s*code|status\s*\d{3}|\b[45]\d{2}\b/i.test(exceptions)
    ) {
      issues.push({ field: "exceptionCases", code: "exceptionsCode" });
    }
  }

  const api = card.apiContract.trim();
  if (shared(api) && api.length < 4) issues.push({ field: "apiContract", code: "api" });
  if (shared(card.envChecklist)) {
    pushGap(issues, "envChecklist", "env", card.envChecklist.trim(), missingEnv(card.envChecklist));
  }
  if (shared(card.dataPrecheck)) {
    pushGap(issues, "dataPrecheck", "data", card.dataPrecheck.trim(), missingData(card.dataPrecheck));
  }
  if (shared(card.externalDeps)) {
    pushGap(issues, "externalDeps", "deps", card.externalDeps.trim(), missingDeps(card.externalDeps));
  }
  if (shared(card.perfBudget)) {
    pushGap(issues, "perfBudget", "perf", card.perfBudget.trim(), missingPerf(card.perfBudget, localStatic));
  }
  return issues;
}
