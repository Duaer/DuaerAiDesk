import assert from "node:assert/strict";
import { register } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readMainSource } from "./helpers/source-contracts.mjs";

register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const { deliveryCardIssues, deliveryCardStillGathering } = await import("../src/lib/delivery-card-check.ts");
const {
  deliveryCardFingerprint,
  fillEmptyBaseline,
  localDeliveryFix,
  parseDeliveryReview,
} = await import("../src/lib/delivery-review.ts");

const blank = {
  goal: "",
  outOfScope: "",
  acceptance: "",
  assumptions: "",
  deviceMatrix: "",
  criticalPaths: "",
  exceptionCases: "",
  apiContract: "",
  envChecklist: "",
  dataPrecheck: "",
  externalDeps: "",
  perfBudget: "",
};

test("later modules skip empty shared baselines and still check a written device matrix", () => {
  const card = {
    ...blank,
    goal: "这个模块只交付导出按钮",
    acceptance: "打开汇总页能看到导出按钮",
  };
  assert.equal(deliveryCardIssues(card, "module").some((issue) => issue.field === "deviceMatrix"), false);
  assert.equal(deliveryCardIssues(card, "full").some((issue) => issue.field === "deviceMatrix"), true);
  const unique = { ...card, deviceMatrix: "桌面为主" };
  assert.equal(deliveryCardIssues(unique, "module").some((issue) => issue.code === "device"), true);
});

test("requirements confirm does not gate style or layout", async () => {
  const { globalVisualReady } = await import("../src/lib/delivery-card-check.ts");
  const card = {
    ...blank,
    goal: "全站沿用同一套页面外观",
    acceptance: "打开任意页面能看到同一套白底和顶部导航",
    deviceMatrix: "Chrome latest two, mobile Safari; cloud screenshot in compat/; IE fallback upgrade notice",
    criticalPaths: "open any page",
    exceptionCases: "empty list; failure can retry; permission denied; timeout",
    apiContract: "本模块无 HTTP API",
    envChecklist: "DNS pass; TLS pass; CORS pass; auth pass; third-party reachable",
    dataPrecheck: "本模块无导入",
    externalDeps: "本模块无外部依赖",
    perfBudget: "本模块无页面性能要求",
    style: "好看",
    layout: "居中",
  };
  const codes = deliveryCardIssues(card, "global").map((issue) => issue.code);
  assert.equal(codes.includes("style"), false);
  assert.equal(codes.includes("layout"), false);
  assert.equal(globalVisualReady("好看", "居中"), false);
  assert.equal(
    globalVisualReady("白底、深色字、正文 16px、间距 8px", "单栏居中，顶部导航"),
    true,
  );
  assert.deepEqual(deliveryCardIssues(card, "global"), []);
});

test("a visual JSON reply stores style and layout only when both are concrete", async () => {
  const { extractVisualDesign } = await import("../src/lib/delivery-visual.ts");
  const ready = extractVisualDesign(`done
<<<JSON>>>
{"design_type":"visual","style":"白底、深色字、正文 16px、间距 8px","layout":"单栏居中，顶部导航"}`);
  assert.equal(ready?.style, "白底、深色字、正文 16px、间距 8px");
  assert.equal(ready?.layout, "单栏居中，顶部导航");
  assert.equal(
    extractVisualDesign(`<<<JSON>>>
{"diagram_type":"architecture","summary":"web","components":[]}`),
    null,
  );
  assert.equal(
    extractVisualDesign(`<<<JSON>>>
{"design_type":"visual","style":"好看","layout":"居中"}`),
    null,
  );
});

test("a static page opt-out passes without the compat-lab checklist", () => {
  const card = {
    ...blank,
    goal: "网页居中显示一行「你好，World」",
    outOfScope: "不做输入框、按钮和标题",
    acceptance: "打开页面能看到「你好，World」，且只有这一行",
    assumptions: "双击 HTML 即开",
    deviceMatrix: "任意现代浏览器",
    criticalPaths: "双击 HTML 文件，看到这一行字",
    exceptionCases: "无输入无交互，异常分支极少。主要关注 UTF-8 编码，避免中文乱码",
    apiContract: "无后端，无接口",
    envChecklist: "任意现代浏览器。交付物为一个 HTML 文件，无需安装任何依赖",
    dataPrecheck: "无数据依赖",
    externalDeps: "无外部依赖。不引 CDN。保证离线可用",
    perfBudget: "页面立即显示，无性能要求",
  };
  assert.deepEqual(deliveryCardIssues(card), []);
  const app = {
    ...card,
    assumptions: "有客户联调环境",
    apiContract: "POST /api/orders",
    envChecklist: "生产环境",
    deviceMatrix: "任意现代浏览器",
    exceptionCases: "提交失败可重试",
    externalDeps: "调用支付",
  };
  const codes = deliveryCardIssues(app).map((issue) => issue.code);
  assert.ok(codes.includes("device"));
  assert.ok(codes.includes("env"));
  assert.ok(codes.includes("deps"));
});

test("a file page with a measured budget skips the app perf lab list", () => {
  const card = {
    ...blank,
    goal: "网页居中显示一行「你好，World」",
    acceptance: "打开页面能看到「你好，World」，且只有这一行",
    perfBudget: [
      "LCP(首屏最大内容绘制)< 1.5s",
      "页面自身资源(HTML/CSS/JS)合计 < 200KB",
      "图片资源以懒加载方式展示,首次视口外图片不阻塞加载",
      "file:// 直接打开无控制台报错",
      "滚动无可见卡顿(60fps 流畅感)",
    ].join("\n"),
  };
  const perf = deliveryCardIssues(card).find((issue) => issue.code === "perf");
  assert.equal(perf, undefined);
  const app = {
    ...card,
    assumptions: "有客户联调环境",
    apiContract: "POST /api/orders",
    perfBudget: "LCP 1.5s，包体 200KB",
  };
  const appPerf = deliveryCardIssues(app).find((issue) => issue.code === "perf");
  assert.ok(appPerf?.missing?.includes("inp"));
  assert.equal(appPerf?.missing?.includes("bundle"), false);
  assert.equal(appPerf?.missing?.includes("lcp"), false);
});

test("empty baseline is filled once goal and acceptance already pass", () => {
  const card = {
    ...blank,
    goal: "网页居中显示一行「你好，World」",
    outOfScope: "不做输入框、按钮和标题",
    acceptance: "打开页面能看到「你好，World」，且只有这一行",
    assumptions: "双击 HTML 即开，零依赖",
  };
  const filled = fillEmptyBaseline(card);
  assert.equal(deliveryCardIssues(filled).length, 0);
  assert.equal(filled.goal, card.goal);
  assert.equal(filled.acceptance, card.acceptance);
  assert.match(filled.apiContract, /无 HTTP API/);
  assert.match(filled.assumptions, /未写明的基线/);
  const early = fillEmptyBaseline({ ...blank, goal: "你好" });
  assert.equal(early.apiContract, "");
  const custom = fillEmptyBaseline({ ...card, deviceMatrix: "只写了 Chrome" });
  assert.equal(custom.deviceMatrix, "只写了 Chrome");
});

test("auto-fix fills baseline defaults and a checkable acceptance", () => {
  const fixed = localDeliveryFix({
    ...blank,
    goal: "记下每天的决定和原因",
    outOfScope: "不做周报",
    acceptance: "更好用",
    assumptions: "只有本人使用",
  });
  assert.equal(deliveryCardIssues(fixed).length, 0);
  assert.equal(fixed.goal, "记下每天的决定和原因");
  assert.match(fixed.acceptance, /打开页面能看到/);
  assert.match(fixed.deviceMatrix, /Chrome/);
  assert.match(fixed.deviceMatrix, /Safari/);
  assert.match(fixed.exceptionCases, /空态/);
  assert.match(fixed.exceptionCases, /重试/);
  assert.match(fixed.apiContract, /无 HTTP API/);
  assert.match(fixed.envChecklist, /无客户联调环境/);
  assert.match(fixed.dataPrecheck, /无导入/);
  assert.match(fixed.externalDeps, /无外部依赖/);
  assert.match(fixed.perfBudget, /无页面性能要求/);
  assert.match(fixed.assumptions, /默认补全/);
});

test("auto-fix leaves a short goal for the model and adds an API error code", () => {
  const fixed = localDeliveryFix({
    ...blank,
    goal: "记一下",
    acceptance: "打开首页能看到今天的记录",
    apiContract: "openapi/openapi.yaml",
    exceptionCases: "空态；失败；权限不足；超时；重试",
    deviceMatrix: "Chrome 最近两版、手机 Safari；云测截图放 compat/；旧壳降级提示升级",
    criticalPaths: "打开首页记下一条",
    envChecklist: "无客户联调环境",
    dataPrecheck: "本模块无导入",
    externalDeps: "本模块无外部依赖",
    perfBudget: "本模块无页面性能要求",
  });
  assert.equal(fixed.goal, "记一下");
  assert.ok(deliveryCardIssues(fixed).some((issue) => issue.code === "goalShort"));
  assert.match(fixed.exceptionCases, /错误码 400/);
  assert.equal(fixed.apiContract, "openapi/openapi.yaml");
});

test("review parser keeps a passing rewrite and ignores a fence", () => {
  const parsed = parseDeliveryReview(
    "```json\n{\"passed\":true,\"summary\":\"可以锁定\",\"issues\":[],\"goal\":\"记下每天的决定和原因\"}\n```",
    { ...blank, goal: "旧目标", acceptance: "打开首页能看到记录" },
    "validate",
  );
  assert.equal(parsed.passed, true);
  assert.equal(parsed.summary, "可以锁定");
  assert.equal(parsed.card.goal, "记下每天的决定和原因");
  assert.equal(parsed.card.acceptance, "打开首页能看到记录");
  assert.notEqual(deliveryCardFingerprint(parsed.card), deliveryCardFingerprint(blank));
});

test("a fix response does not count as passed", () => {
  const parsed = parseDeliveryReview("{\"passed\":true,\"summary\":\"改了\"}", blank, "fix");
  assert.equal(parsed.passed, false);
  assert.equal(parsed.summary, "改了");
  assert.equal(parsed.card.goal, "");
});

test("delivery review uses the one-shot desktop model", async () => {
  const [protocol, api, main, tab, hook, note, review, row] = await Promise.all([
    read("../../../packages/shared/src/protocol.ts"),
    read("../src/lib/api.ts"),
    readMainSource(),
    read("../src/components/workpanel/RequirementsTab.tsx"),
    read("../src/lib/use-delivery-review.ts"),
    read("../src/lib/delivery-chat-note.ts"),
    read("../src/lib/delivery-review.ts"),
    read("../src/features/chat/transcript/MessageRow.tsx"),
  ]);
  assert.match(protocol, /deliveryReview: "duaer-ai-desk\/delivery\/review"/);
  assert.match(api, /reviewDeliveryCard: \(req: DeliveryReviewRequest\)/);
  assert.match(api, /IPC\.invoke\.deliveryReview/);
  assert.match(main, /handle\(IPC\.invoke\.deliveryReview/);
  assert.match(main, /completeOneShot\(/);
  assert.match(main, /deliveryReviewPrompt\(mode, card, issues\)/);
  assert.match(main, /thinkingLevel: "off"/);
  assert.match(tab, /useDeliveryReview\(path, module\)/);
  assert.match(tab, /!moduleCanConfirm\(module\) \|\| !reviewed/);
  assert.equal(/requirements-auto/.test(tab), false);
  assert.equal(/panel\.requirements\.autoHandle/.test(tab), false);
  assert.match(hook, /appendDeliveryChatNote/);
  assert.match(hook, /replaceDeliveryChatNote/);
  assert.match(hook, /chatValidateStart/);
  assert.match(hook, /clearStaleValidateStarts/);
  assert.match(hook, /settledReviews/);
  assert.match(hook, /judgmentModel/);
  assert.match(hook, /offerDeliveryAutoHandleInChat/);
  assert.match(hook, /runDeliveryAutoHandle/);
  assert.match(row, /runDeliveryAutoHandle/);
  assert.match(row, /parseDeliveryGateChoices/);
  assert.match(row, /panel\.requirements\.autoHandle/);
  assert.match(review, /export function deliveryAutoFixPrompt/);
  assert.match(note, /encodeDeliveryGateNote/);
  assert.match(note, /choices/);
  assert.equal(/api\.replaceSessionMessages/.test(note), false);
});


test("auto-fix prompt lists only the failing fields", async () => {
  const { deliveryAutoFixPrompt } = await import("../src/lib/delivery-review.ts");
  const prompt = deliveryAutoFixPrompt({
    moduleId: "daily",
    moduleTitle: "每日提醒",
    fields: [
      { field: "perfBudget", current: "挺快的", missing: "LCP、INP" },
      { field: "envChecklist", current: "", missing: "DNS" },
    ],
  });
  assert.match(prompt, /<<<AUTOFIX>>>/);
  assert.match(prompt, /每日提醒/);
  assert.match(prompt, /perfBudget、envChecklist/);
  assert.match(prompt, /现有：挺快的/);
  assert.match(prompt, /只补：LCP、INP/);
  assert.match(prompt, /<<<JSON>>>/);
  assert.doesNotMatch(prompt, /"goal"/);
  assert.doesNotMatch(prompt, /未通过项/);
});

test("auto-fix prompt sends only the failing fields", async () => {
  const { deliveryAutoFixPrompt, selectDeliveryAutoFixFields } = await import("../src/lib/delivery-review.ts");
  const { deliveryCardIssues } = await import("../src/lib/delivery-card-check.ts");
  const card = {
    goal: "记下每天的决定和原因",
    outOfScope: "不做周报",
    acceptance: "打开页面能看到今天的记录",
    assumptions: "只有本人使用",
    style: "",
    layout: "",
    deviceMatrix: "Chrome 最近两版、手机 Safari；云测截图放 compat/；旧壳降级提示升级",
    criticalPaths: "打开页面完成：记下每天的决定和原因",
    exceptionCases: "空态",
    apiContract: "本模块无 HTTP API",
    envChecklist: "无客户联调环境",
    dataPrecheck: "有一张导入表",
    externalDeps: "要接厂商接口",
    perfBudget: "本模块无页面性能要求",
  };
  const issues = deliveryCardIssues(card, "module");
  const selected = selectDeliveryAutoFixFields(card, issues);
  assert.deepEqual(selected.write.sort(), ["dataPrecheck", "exceptionCases", "externalDeps"]);
  assert.deepEqual(selected.context, []);
  const prompt = deliveryAutoFixPrompt({
    moduleId: "m1",
    moduleTitle: "记录",
    fields: [
      { field: "exceptionCases", current: card.exceptionCases, missing: "失败、权限不足、超时、重试" },
      { field: "dataPrecheck", current: card.dataPrecheck, missing: "字段映射、导入预检失败清单、可导出" },
      { field: "externalDeps", current: card.externalDeps, missing: "阻塞项、SLA、备用 Mock、并行路径" },
    ],
  });
  assert.match(prompt, /现有：空态/);
  assert.match(prompt, /只补：失败、权限不足、超时、重试/);
  assert.match(prompt, /现有：有一张导入表/);
  assert.match(prompt, /现有：要接厂商接口/);
  assert.doesNotMatch(prompt, /记下每天的决定/);
  assert.doesNotMatch(prompt, /Chrome 最近两版/);
  assert.doesNotMatch(prompt, /不做周报/);
  assert.doesNotMatch(prompt, /"exceptionCases"/);
  assert.doesNotMatch(prompt, /"goal"/);
  assert.doesNotMatch(prompt, /"deviceMatrix"/);
});

test("a short goal and acceptance are still the opening interview", () => {
  const gathering = deliveryCardIssues({
    ...blank,
    goal: "自己的简历",
    acceptance: "能看",
  }, "module");
  assert.equal(deliveryCardStillGathering(gathering), true);
  const drafted = deliveryCardIssues({
    ...blank,
    goal: "做成手机上随时能打开的简历网页",
    acceptance: "打开 index.html 能看到姓名和联系方式",
    deviceMatrix: "桌面为主",
  }, "module");
  assert.equal(drafted.some((issue) => issue.code === "device"), true);
  assert.equal(deliveryCardStillGathering(drafted), false);
});

test("auto-fix chip stays off a busy turn and returns when the checklist is still failing", async () => {
  const {
    DELIVERY_AUTO_HANDLE_ACTION,
    encodeDeliveryGateNote,
    shouldOfferDeliveryAutoHandle,
  } = await import("../src/lib/delivery-chat.ts");
  const note = encodeDeliveryGateNote("是否自动修复？", [DELIVERY_AUTO_HANDLE_ACTION]);
  assert.equal(shouldOfferDeliveryAutoHandle(note, false), false);
  assert.equal(shouldOfferDeliveryAutoHandle("普通回复", true), false);
  assert.equal(shouldOfferDeliveryAutoHandle("普通回复", false), true);
  assert.equal(shouldOfferDeliveryAutoHandle(undefined, false), true);
});

test("a checking note above a pass note is dropped", async () => {
  const { encodeDeliveryGateNote, withoutStaleValidateStarts } = await import("../src/lib/delivery-chat.ts");
  const start = "正在检测本模块的确认卡…";
  const pass = "检测通过：可以锁定";
  const messages = [
    { id: "reply", role: "assistant", content: "核心项齐全。" },
    { id: "start", role: "assistant", content: encodeDeliveryGateNote(start) },
    { id: "pass", role: "assistant", content: encodeDeliveryGateNote(pass) },
    { id: "live", role: "assistant", content: encodeDeliveryGateNote(start) },
  ];
  const next = withoutStaleValidateStarts(messages, start, "检测通过：");
  assert.deepEqual(next.map((message) => message.id), ["reply", "pass", "live"]);
});
