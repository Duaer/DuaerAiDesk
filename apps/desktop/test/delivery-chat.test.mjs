import assert from "node:assert/strict";
import test from "node:test";

const { enrichChatOptions } = await import("../src/lib/choice-options.ts");
const {
  applyDeliveryChat,
  applyDeliveryProse,
  setDeliveryAutoFixFields,
  applyDeliveryUtterance,
  fillDeliveryFromMessage,
  parseStreamingDelivery,
  DELIVERY_GATE_NOTE_MARKER,
  isDeliveryGateNote,
  modelContentForDelivery,
  parseDeliveryChat,
  visibleDeliveryText,
} = await import("../src/lib/delivery-chat.ts");
const {
  confirmDeliveryModule,
  ensureDelivery,
  peekDelivery,
  resetDeliveryDeskForTests,
  setDeliveryBackground,
  setDeliveryExistingProject,
  updateDeliveryCard,
  workspaceLooksExisting,
} = await import("../src/lib/delivery-desk.ts");
const { fillEmptyBaseline } = await import("../src/lib/delivery-review.ts");
const { assignDeliveryWorkers, buildDeliveryTasks, recommendDeliveryWorkers } = await import(
  "../src/lib/delivery-dispatch.ts"
);

const PASSING = {
  goal: "Ship live L3 smoke suite for validate gate",
  outOfScope: "No Playwright browser automation",
  acceptance: "npm run test:live passes with mock LLM",
  assumptions: "Mock OpenAI server is enough for CI",
  deviceMatrix: "Chrome latest two, mobile Safari; cloud screenshot in compat/; IE fallback upgrade notice",
  criticalPaths: "open desk / run validate",
  exceptionCases: "empty list; failure can retry; permission denied; timeout",
  apiContract: "本模块无 HTTP API",
  envChecklist: "DNS pass; TLS pass; CORS pass; auth pass; third-party reachable",
  dataPrecheck: "field mapping in mapping.csv; import precheck failure list; export for business cleanup",
  externalDeps: "blocker: vendor API; SLA 2 days; backup mock; parallel path without SSO",
  perfBudget: "LCP 2.5s; INP 200ms; bundle under 200kb; virtual scroll for long lists; weak network 3G; large data load test",
};

test("delivery chat hides the desk instruction and fills the open module", () => {
  const wrapped = modelContentForDelivery(
    { workPanelOpen: true, activeWorkPanelTabKind: "requirements", projectPath: "/tmp/duaer-chat-fill" },
    "做一个登录",
  );
  assert.match(wrapped, /做一个登录/);
  assert.match(wrapped, /<<<DESK>>>/);
  assert.equal(visibleDeliveryText(wrapped, "user"), "做一个登录");
  const autoFix = modelContentForDelivery(
    { workPanelOpen: true, activeWorkPanelTabKind: "requirements", projectPath: "/tmp/duaer-chat-fill" },
    "<<<AUTOFIX>>>\n只改 exceptionCases\n现有：空态\n只补：失败",
  );
  assert.equal(autoFix.includes("<<<DESK>>>"), false);
  assert.equal(autoFix.includes("当前确认卡"), false);
  assert.equal(
    modelContentForDelivery(
      { workPanelOpen: true, activeWorkPanelTabKind: "review", projectPath: "/tmp/duaer-chat-fill" },
      "做一个登录",
    ),
    "做一个登录",
  );

  const reply = [
    "先确认登录方式。",
    "<<<JSON>>>",
    JSON.stringify({
      activeModuleId: "m1",
      goal: "员工用邮箱登录 DuaerAiDesk",
      acceptance: "打开登录页看到邮箱框",
      options: ["邮箱登录", "扫码登录"],
    }),
  ].join("\n");
  const parsed = parseDeliveryChat(reply);
  assert.equal(visibleDeliveryText(reply, "assistant"), "先确认登录方式。");
  assert.deepEqual(parsed.options, ["邮箱登录", "扫码登录"]);

  resetDeliveryDeskForTests();
  ensureDelivery("/tmp/duaer-chat-fill");
  applyDeliveryChat("/tmp/duaer-chat-fill", parsed);
  const filled = peekDelivery("/tmp/duaer-chat-fill");
  assert.equal(filled.modules[0].card.goal, "员工用邮箱登录 DuaerAiDesk");
  assert.equal(filled.modules[0].status, "draft");
  resetDeliveryDeskForTests();
});

test("delivery chat keeps a confirmed module and dispatch waits for architecture", () => {
  resetDeliveryDeskForTests();
  const path = "/tmp/duaer-chat-lock";
  const created = ensureDelivery(path);
  for (const [field, value] of Object.entries(PASSING)) {
    updateDeliveryCard(path, created.modules[0].id, field, value);
  }
  confirmDeliveryModule(path, created.modules[0].id);
  applyDeliveryChat(path, {
    reply: "",
    options: [],
    goal: "changed",
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
    modules: [{
      id: "m1",
      title: "登录",
      goal: "changed",
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
      dependsOn: [],
    }],
  });
  assert.equal(peekDelivery(path).modules[0].card.goal, PASSING.goal);
  assert.equal(peekDelivery(path).modules[0].title, "登录");

  const tasks = buildDeliveryTasks(peekDelivery(path).modules);
  assert.match(tasks[0].title, /Implement/);
  assert.ok(tasks.some((task) => task.role === "verify-l3"));
  const assigned = assignDeliveryWorkers(tasks, recommendDeliveryWorkers(tasks));
  assert.ok(assigned.every((task) => task.workerId.startsWith("w")));
  resetDeliveryDeskForTests();
});

test("delivery chat fills from a fenced card when the marker is missing", () => {
  const reply = [
    "先确认登录方式。",
    "```json",
    JSON.stringify({
      activeModuleId: "m1",
      goal: "员工用邮箱登录 DuaerAiDesk",
      options: ["邮箱登录", "扫码登录"],
    }),
    "```",
  ].join("\n");
  assert.equal(visibleDeliveryText(reply, "assistant"), "先确认登录方式。");
  const parsed = parseDeliveryChat(reply);
  assert.equal(parsed.goal, "员工用邮箱登录 DuaerAiDesk");
  resetDeliveryDeskForTests();
  ensureDelivery("/tmp/duaer-chat-fence");
  applyDeliveryChat("/tmp/duaer-chat-fence", parsed);
  assert.equal(peekDelivery("/tmp/duaer-chat-fence").modules[0].card.goal, "员工用邮箱登录 DuaerAiDesk");
  assert.equal(parseDeliveryChat("普通编码回复，没有确认卡。"), null);
  resetDeliveryDeskForTests();
});

test("delivery chat fills from a fenced card without the marker", () => {
  const reply = [
    "先确认登录方式。",
    "```json",
    JSON.stringify({
      activeModuleId: "m1",
      goal: "员工用邮箱登录 DuaerAiDesk",
      options: ["邮箱登录", "扫码登录"],
    }),
    "```",
  ].join("\n");
  const parsed = parseDeliveryChat(reply);
  assert.equal(visibleDeliveryText(reply, "assistant"), "先确认登录方式。");
  assert.equal(parsed.goal, "员工用邮箱登录 DuaerAiDesk");
  assert.deepEqual(parsed.options, ["邮箱登录", "扫码登录"]);
  assert.equal(parseDeliveryChat("普通编码回复，没有确认卡。"), null);

  resetDeliveryDeskForTests();
  ensureDelivery("/tmp/duaer-chat-fence");
  applyDeliveryChat("/tmp/duaer-chat-fence", parsed);
  assert.equal(peekDelivery("/tmp/duaer-chat-fence").modules[0].card.goal, "员工用邮箱登录 DuaerAiDesk");
  resetDeliveryDeskForTests();
});

test("spoken requirement lands on the card before model json", () => {
  resetDeliveryDeskForTests();
  const path = "/tmp/duaer-chat-utterance";
  setDeliveryBackground(path, "给自己用的人生记录");
  applyDeliveryUtterance(path, "项目「人生」已选好。背景：给自己用。请开始帮我梳理需求：用大白话问清楚要做什么、验收标准。");
  const open = () => peekDelivery(path).modules.find((module) => module.id === "global");
  assert.equal(open().card.assumptions, "给自己用的人生记录");
  assert.equal(open().card.goal, "");
  applyDeliveryUtterance(path, "我想记录每天的决定和结果");
  assert.equal(open().card.goal, "我想记录每天的决定和结果");
  applyDeliveryProse(path, "验收：打开首页能看到今天的一条记录");
  assert.equal(open().card.acceptance, "打开首页能看到今天的一条记录");
  assert.equal(open().card.goal, "我想记录每天的决定和结果");
  resetDeliveryDeskForTests();
});

test("chat inventory splits modules and drops the blank seed", () => {
  resetDeliveryDeskForTests();
  const path = "/tmp/duaer-chat-split";
  setDeliveryBackground(path, "给自己用的人生记录");
  applyDeliveryUtterance(path, "我想记录每天的决定，周末再回看");
  const empty = {
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
    dependsOn: [],
  };
  applyDeliveryChat(path, {
    reply: "先拆成记录和回顾。",
    options: [],
    goal: "周末回看这一周",
    ...empty,
    modules: [
      { id: "record", title: "记录", goal: "记下每天的决定", ...empty },
      { id: "review", title: "回顾", goal: "周末回看这一周", ...empty, dependsOn: ["record"] },
    ],
    activeModuleId: "review",
  });
  const split = peekDelivery(path);
  assert.deepEqual(split.modules.map((module) => module.id), ["record", "review", "global"]);
  assert.equal(split.activeModuleId, "review");
  assert.equal(split.modules[1].card.goal, "周末回看这一周");
  resetDeliveryDeskForTests();
});

test("a look complaint on a confirmed module is a revision, not a card rewrite", () => {
  resetDeliveryDeskForTests();
  const path = "/tmp/duaer-revision";
  ensureDelivery(path);
  const card = fillEmptyBaseline({
    goal: "页面只显示 Hello World",
    outOfScope: "不做样式特效",
    acceptance: "打开 HTML 看到 Hello World",
    assumptions: "双击 HTML 即开",
    deviceMatrix: "",
    criticalPaths: "",
    exceptionCases: "",
    apiContract: "",
    envChecklist: "",
    dataPrecheck: "",
    externalDeps: "",
    perfBudget: "",
  });
  for (const [field, value] of Object.entries(card)) {
    updateDeliveryCard(path, "m1", field, value);
  }
  confirmDeliveryModule(path, "m1");
  const wrapped = modelContentForDelivery(
    { workPanelOpen: true, activeWorkPanelTabKind: "requirements", projectPath: path },
    "不够美观，美化一下",
  );
  assert.match(wrapped, /写进 revise/);
  assert.match(wrapped, /不要让用户从几种风格里选/);
  applyDeliveryChat(path, {
    reply: "这一轮只改外观。",
    options: [],
    goal: "不要写进确认卡",
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
    revision: {
      scope: "module",
      moduleId: "m1",
      goal: "把 Hello World 的字号和留白改得更容易读",
      outOfScope: "不改文案，也不做点击",
      acceptance: "打开 HTML 能看到更大的 Hello World",
      assumptions: "用户觉得现在不够美观",
    },
  });
  const desk = peekDelivery(path);
  assert.equal(desk.modules[0].status, "confirmed");
  assert.equal(desk.modules[0].card.goal, "页面只显示 Hello World");
  assert.equal(desk.modules[0].card.outOfScope, "不做样式特效");
  assert.equal(desk.revision.scope, "module");
  assert.equal(desk.revision.moduleId, "m1");
  assert.match(desk.revision.acceptance, /更大的 Hello World/);
  resetDeliveryDeskForTests();
});

test("choice chips fall back to short bullet lines", () => {
  assert.deepEqual(enrichChatOptions("请选：\n- 邮箱登录\n- 扫码登录", []), ["邮箱登录", "扫码登录"]);
});

test("confirm-card bullets are not choice chips and drop emphasis marks", () => {
  const reply = [
    "确认卡保持终版不变：",
    "- **页面内容**：只有这一行字；名字写死为 World",
    "- **不做的事**：无点击交互、无样式特效、不接后端",
    "- **默认基线**：交付一个 HTML 文件，双击即开",
  ].join("\n");
  assert.deepEqual(enrichChatOptions(reply, []), []);
  assert.deepEqual(
    enrichChatOptions(reply, ["**页面内容**：只有这一行", "**不做的事**：无点击"]),
    [],
  );
  assert.deepEqual(
    enrichChatOptions("请选：\n- **邮箱登录**\n- **扫码登录**", []),
    ["邮箱登录", "扫码登录"],
  );
});

test("gate narration does not fill the confirm card", () => {
  resetDeliveryDeskForTests();
  const path = "/tmp/duaer-gate-note";
  ensureDelivery(path);
  const note = `${DELIVERY_GATE_NOTE_MARKER}\n正在检测本模块的确认卡…`;
  assert.equal(isDeliveryGateNote(note), true);
  assert.equal(visibleDeliveryText(note, "assistant"), "正在检测本模块的确认卡…");
  applyDeliveryProse(path, note);
  assert.equal(peekDelivery(path).modules[0].card.goal, "");
  resetDeliveryDeskForTests();
});

test("gate notes can carry an Auto-fix choice chip", async () => {
  const {
    DELIVERY_AUTO_HANDLE_ACTION,
    DELIVERY_CHOICES_MARKER,
    encodeDeliveryGateNote,
    isDeliveryAutoHandleChoice,
    parseDeliveryGateChoices,
  } = await import("../src/lib/delivery-chat.ts");
  const note = encodeDeliveryGateNote("检测未通过：缺验收", [DELIVERY_AUTO_HANDLE_ACTION]);
  assert.match(note, new RegExp(DELIVERY_CHOICES_MARKER));
  assert.deepEqual(parseDeliveryGateChoices(note), [DELIVERY_AUTO_HANDLE_ACTION]);
  assert.equal(visibleDeliveryText(note, "assistant"), "检测未通过：缺验收");
  assert.equal(isDeliveryAutoHandleChoice(DELIVERY_AUTO_HANDLE_ACTION), true);
});

test("requirements tab only fills from newly arrived chat messages", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../src/components/workpanel/RequirementsTab.tsx", import.meta.url), "utf8");
  assert.match(source, /fillCursorRef/);
  assert.match(source, /messages\[messages\.length - 1\]/);
  assert.match(source, /requestAnimationFrame/);
  assert.match(source, /fillDeliveryFromMessage/);
  assert.match(source, /fillEmptyBaseline/);
  assert.equal(/for \(const message of messages\)/.test(source), false);
});

test("an unfinished JSON tail writes the open card as fields grow", () => {
  resetDeliveryDeskForTests();
  const path = "/tmp/duaer-chat-stream";
  ensureDelivery(path);
  const partial = [
    "一个模块就够了。",
    "<<<JSON>>>",
    '{"modules":[{"id":"page","title":"网页展示","goal":"交付一个 HTML 文件","outOfScope":"不做输入框',
  ].join("\n");
  const streamed = parseStreamingDelivery(partial);
  assert.equal(streamed.complete, false);
  assert.equal(streamed.payload.modules[0].id, "page");
  assert.equal(streamed.payload.modules[0].title, "网页展示");
  assert.equal(streamed.payload.modules[0].goal, "交付一个 HTML 文件");
  assert.equal(streamed.payload.modules[0].outOfScope, "不做输入框");
  fillDeliveryFromMessage(path, "assistant", partial);
  assert.equal(peekDelivery(path).modules[0].id, "page");
  assert.equal(peekDelivery(path).modules[0].card.outOfScope, "不做输入框");
  const grown = partial + "、不做按钮";
  fillDeliveryFromMessage(path, "assistant", grown);
  assert.equal(peekDelivery(path).modules[0].card.outOfScope, "不做输入框、不做按钮");
  assert.equal(peekDelivery(path).modules[0].card.goal, "交付一个 HTML 文件");
  resetDeliveryDeskForTests();
});

test("an existing project inventories current functions into the same cards", () => {
  assert.equal(workspaceLooksExisting(["README.md", ".gitignore"]), false);
  assert.equal(workspaceLooksExisting(["src/main.ts", "README.md"]), true);
  assert.equal(workspaceLooksExisting([]), false);

  resetDeliveryDeskForTests();
  const path = "/tmp/duaer-existing-project";
  ensureDelivery(path);
  setDeliveryBackground(path, "加一个导出");
  setDeliveryExistingProject(path, true);
  applyDeliveryUtterance(path, "项目已选好。请先把现在的功能整理出来，方便后面迭代。");
  applyDeliveryUtterance(path, "我想加一个导出");
  const seeded = peekDelivery(path);
  assert.equal(seeded.existingProject, true);
  assert.equal(seeded.modules[0].card.goal, "");
  assert.equal(seeded.modules[0].card.assumptions, "");

  const requirements = modelContentForDelivery(
    { workPanelOpen: true, activeWorkPanelTabKind: "requirements", projectPath: path },
    "请先整理现在的功能",
  );
  assert.match(requirements, /现在已经提供给用户的功能/);
  assert.match(requirements, /不要修改文件/);
  assert.match(requirements, /<<<JSON>>>/);
  assert.doesNotMatch(requirements, /不要调用工具/);

  const architecture = modelContentForDelivery(
    { workPanelOpen: true, activeWorkPanelTabKind: "architecture", projectPath: path },
    "请整理现在的架构",
  );
  assert.match(architecture, /现在的系统架构/);
  assert.match(architecture, /现在就有的组件/);
  resetDeliveryDeskForTests();
});

test("an auto-fix reply rewrites only the fields that were sent", () => {
  resetDeliveryDeskForTests();
  const path = "/tmp/duaer-chat-autofix-scope";
  ensureDelivery(path);
  updateDeliveryCard(path, "global", "goal", "记下每天的决定");
  updateDeliveryCard(path, "global", "exceptionCases", "空态");
  updateDeliveryCard(path, "global", "deviceMatrix", "Chrome 最近两版、手机 Safari；截图放 compat/；旧壳提示升级");
  setDeliveryAutoFixFields(["exceptionCases"]);
  applyDeliveryChat(path, {
    reply: "补上异常态。",
    options: [],
    goal: "不要覆盖目标",
    outOfScope: "不要覆盖范围",
    acceptance: "不要覆盖验收",
    assumptions: "",
    deviceMatrix: "不要覆盖设备",
    criticalPaths: "",
    exceptionCases: "空态；失败；权限不足；超时；重试",
    apiContract: "",
    envChecklist: "",
    dataPrecheck: "",
    externalDeps: "",
    perfBudget: "",
    activeModuleId: "global",
    modules: [{
      id: "global",
      title: "全局要求",
      goal: "不要覆盖目标",
      outOfScope: "",
      acceptance: "",
      assumptions: "",
      style: "",
      layout: "",
      deviceMatrix: "不要覆盖设备",
      criticalPaths: "",
      exceptionCases: "空态；失败；权限不足；超时；重试",
      apiContract: "",
      envChecklist: "",
      dataPrecheck: "",
      externalDeps: "",
      perfBudget: "",
      dependsOn: [],
    }],
  });
  const card = peekDelivery(path).modules.find((module) => module.id === "global").card;
  assert.equal(card.exceptionCases, "空态；失败；权限不足；超时；重试");
  assert.equal(card.goal, "记下每天的决定");
  assert.match(card.deviceMatrix, /Chrome 最近两版/);
  resetDeliveryDeskForTests();
});

test("labeled prose grows the open field before JSON starts", () => {
  resetDeliveryDeskForTests();
  const path = "/tmp/duaer-chat-prose-stream";
  ensureDelivery(path);
  fillDeliveryFromMessage(path, "assistant", "**不做的事**：不做输入框");
  const open = () => peekDelivery(path).modules.find((module) => module.id === "global");
  assert.equal(open().card.outOfScope, "不做输入框");
  fillDeliveryFromMessage(path, "assistant", "**不做的事**：不做输入框、不做按钮");
  assert.equal(open().card.outOfScope, "不做输入框、不做按钮");
  resetDeliveryDeskForTests();
});
