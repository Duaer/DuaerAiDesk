import assert from "node:assert/strict";
import test from "node:test";

const { deliveryCardIssues } = await import("../src/lib/delivery-card-check.ts");
const {
  addDeliveryModule,
  architectureCanConfirm,
  baselineIsValid,
  confirmArchitecture,
  confirmDeliveryModule,
  updateArchitectureSummary,
  deriveStage,
  emptyDeliveryDesk,
  ensureDelivery,
  dispatchExecutionLocked,
  markDeliveryBuilding,
  moduleCanConfirm,
  noteDeliveryIteration,
  openDeliveryChange,
  signDeliveryBaseline,
  peekDelivery,
  setDeliveryBackground,
  resetDeliveryDeskForTests,
  updateDeliveryCard,
  writeGlobalVisual,
} = await import("../src/lib/delivery-desk.ts");

const PASSING_CARD = {
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

const GLOBAL_CARD = {
  ...PASSING_CARD,
  goal: "全站白底深色字，单栏页面",
  acceptance: "打开任意页面能看到白底、深色字和顶部导航",
  style: "白底、深色字、正文 16px、间距 8px",
  layout: "单栏居中，顶部导航",
};

function fillCard(path, moduleId, card) {
  for (const [field, value] of Object.entries(card)) {
    updateDeliveryCard(path, moduleId, field, value);
  }
}

function confirmGlobal(path) {
  fillCard(path, "global", GLOBAL_CARD);
  confirmDeliveryModule(path, "global");
}

test("delivery desk confirms a module only when the live-desk card checks pass", () => {
  resetDeliveryDeskForTests();
  const path = "/tmp/duaer-desk-sample";
  const created = ensureDelivery(path);
  assert.equal(created?.stage, "drafting");
  assert.equal(peekDelivery(path)?.stage, "drafting");
  assert.equal(moduleCanConfirm(created.modules[0]), false);

  updateDeliveryCard(path, created.modules[0].id, "goal", "Show the desk");
  updateDeliveryCard(path, created.modules[0].id, "acceptance", "The requirements tab lists the goal");
  const draft = peekDelivery(path);
  assert.equal(draft?.stage, "confirming");
  assert.equal(moduleCanConfirm(draft.modules[0]), false);
  assert.ok(deliveryCardIssues(draft.modules[0].card).length > 0);

  fillCard(path, created.modules[0].id, PASSING_CARD);
  const ready = peekDelivery(path);
  assert.deepEqual(deliveryCardIssues(ready.modules[0].card), []);
  assert.equal(moduleCanConfirm(ready.modules[0]), true);

  confirmDeliveryModule(path, created.modules[0].id);
  const locked = peekDelivery(path);
  assert.equal(locked.modules[0].status, "confirmed");
  updateDeliveryCard(path, created.modules[0].id, "goal", "changed");
  assert.equal(peekDelivery(path).modules[0].card.goal, PASSING_CARD.goal);
  confirmGlobal(path);
  writeGlobalVisual(path, "深色底、浅色字、正文 16px、间距 8px", "双栏，左侧导航");
  const visual = peekDelivery(path).modules.find((module) => module.id === "global");
  assert.equal(visual.status, "confirmed");
  assert.equal(visual.card.style, "深色底、浅色字、正文 16px、间距 8px");
  assert.equal(visual.card.layout, "双栏，左侧导航");

  addDeliveryModule(path);
  const added = peekDelivery(path);
  assert.equal(added.modules.length, 3);
  assert.equal(added.modules.at(-1).id, "global");
  assert.equal(added.activeModuleId, "m2");
  assert.equal(deriveStage(emptyDeliveryDesk()), "drafting");
  resetDeliveryDeskForTests();
});

test("architecture waits until every module is confirmed", () => {
  resetDeliveryDeskForTests();
  const path = "/tmp/duaer-desk-all-modules";
  ensureDelivery(path);
  addDeliveryModule(path);
  const both = peekDelivery(path);
  const features = both.modules.filter((module) => module.id !== "global");
  fillCard(path, features[0].id, PASSING_CARD);
  fillCard(path, features[1].id, { ...PASSING_CARD, goal: "Second module keeps its own goal" });
  confirmDeliveryModule(path, features[0].id);
  const halfway = peekDelivery(path);
  assert.equal(halfway.architecture.components.length, 0);
  assert.equal(architectureCanConfirm(halfway), false);
  confirmDeliveryModule(path, features[1].id);
  assert.equal(peekDelivery(path).architecture.components.length, 0);
  confirmGlobal(path);
  const seeded = peekDelivery(path);
  assert.equal(seeded.architecture.components.length, 2);
  assert.equal(seeded.architecture.components[1].responsibility, "Second module keeps its own goal");
  resetDeliveryDeskForTests();
});

test("confirmed modules seed architecture boxes that lock after confirm", () => {
  resetDeliveryDeskForTests();
  const path = "/tmp/duaer-desk-architecture";
  const created = ensureDelivery(path);
  fillCard(path, created.modules[0].id, PASSING_CARD);
  confirmDeliveryModule(path, created.modules[0].id);
  confirmGlobal(path);
  const seeded = peekDelivery(path);
  assert.equal(seeded.architecture.components.length, 1);
  assert.equal(seeded.architecture.components[0].responsibility, PASSING_CARD.goal);
  assert.equal(architectureCanConfirm(seeded), false);
  updateArchitectureSummary(path, "The desk keeps one confirm card");
  assert.equal(architectureCanConfirm(peekDelivery(path)), true);
  confirmArchitecture(path);
  updateArchitectureSummary(path, "changed");
  assert.equal(peekDelivery(path).architecture.summary, "The desk keeps one confirm card");
  assert.equal(peekDelivery(path).architecture.status, "confirmed");
  resetDeliveryDeskForTests();
});

test("delivery desk keeps a later stage and ignores a corrupt record", () => {
  const memory = new Map();
  globalThis.localStorage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
    removeItem: (key) => memory.delete(key),
  };
  resetDeliveryDeskForTests();
  memory.set("duaer.desk.delivery.v1", "{");
  assert.equal(peekDelivery("/tmp/corrupt"), null);

  resetDeliveryDeskForTests();
  memory.set("duaer.desk.delivery.v1", JSON.stringify({
    "/tmp/building": {
      stage: "building",
      activeModuleId: "m1",
      modules: [{
        id: "m1",
        title: "",
        status: "confirmed",
        card: { goal: "Ship", outOfScope: "", acceptance: "Visible", assumptions: "" },
      }],
    },
  }));
  const restored = peekDelivery("/tmp/building");
  assert.equal(restored?.stage, "building");
  assert.equal(deriveStage(restored), "building");
  resetDeliveryDeskForTests();
  delete globalThis.localStorage;
});

test("dispatch stays closed until the baseline is signed", () => {
  resetDeliveryDeskForTests();
  const path = "/tmp/duaer-desk-baseline";
  const created = ensureDelivery(path);
  fillCard(path, created.modules[0].id, PASSING_CARD);
  confirmDeliveryModule(path, created.modules[0].id);
  confirmGlobal(path);
  updateArchitectureSummary(path, "One confirm card");
  confirmArchitecture(path);
  assert.equal(signDeliveryBaseline(path, "   "), false);
  assert.equal(baselineIsValid(peekDelivery(path).baseline, peekDelivery(path).modules), false);
  markDeliveryBuilding(path);
  assert.equal(peekDelivery(path).stage, "confirming");

  assert.equal(signDeliveryBaseline(path, "司马生"), true);
  const signed = peekDelivery(path);
  assert.equal(signed.baseline.signer, "司马生");
  assert.equal(baselineIsValid(signed.baseline, signed.modules), true);
  markDeliveryBuilding(path);
  assert.equal(peekDelivery(path).stage, "building");
  assert.equal(dispatchExecutionLocked(peekDelivery(path)), true);

  assert.equal(openDeliveryChange(path, "验收改成可核对的首页记录"), true);
  const changed = peekDelivery(path);
  assert.equal(changed.baseline.signedAt, null);
  assert.equal(dispatchExecutionLocked(changed), false);
  assert.equal(changed.modules[0].status, "draft");
  assert.equal(changed.architecture.status, "draft");
  assert.equal(changed.modules[0].card.goal, PASSING_CARD.goal);
  assert.equal(changed.baseline.changes[0].reason, "验收改成可核对的首页记录");
  assert.equal(changed.baseline.changes[0].signer, "司马生");
  markDeliveryBuilding(path);
  assert.notEqual(peekDelivery(path).stage, "building");
  resetDeliveryDeskForTests();
});

test("a new project background is stored on the delivery desk", () => {
  resetDeliveryDeskForTests();
  setDeliveryBackground("/tmp/duaer-desk-background", "给财务用的发票汇总");
  noteDeliveryIteration("/tmp/duaer-desk-background", "给财务用的发票汇总");
  const desk = peekDelivery("/tmp/duaer-desk-background");
  assert.equal(desk?.background, "给财务用的发票汇总");
  assert.equal(desk?.iterations.length, 1);
  assert.equal(desk?.iterations[0].summary, "给财务用的发票汇总");
  noteDeliveryIteration("/tmp/duaer-desk-background", "给财务用的发票汇总");
  assert.equal(peekDelivery("/tmp/duaer-desk-background")?.iterations.length, 1);
  noteDeliveryIteration("/tmp/duaer-desk-background", "加上导出");
  assert.equal(peekDelivery("/tmp/duaer-desk-background")?.iterations[1].summary, "加上导出");
  resetDeliveryDeskForTests();
});

test("an older project seeds one timeline point from its background", () => {
  const memory = new Map();
  globalThis.localStorage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
    removeItem: (key) => memory.delete(key),
  };
  resetDeliveryDeskForTests();
  memory.set("duaer.desk.delivery.v1", JSON.stringify({
    "/tmp/older": {
      stage: "confirming",
      activeModuleId: "m1",
      background: "已经上线的发票汇总",
      modules: [{
        id: "m1",
        title: "汇总",
        status: "draft",
        card: { goal: "导出现有发票", acceptance: "打开页面能看到导出按钮" },
      }],
    },
  }));
  const restored = peekDelivery("/tmp/older");
  assert.equal(restored?.iterations.length, 1);
  assert.equal(restored?.iterations[0].summary, "已经上线的发票汇总");
  assert.equal(restored?.iterations[0].at, "");
  assert.equal(restored?.modules.at(-1)?.id, "global");
  resetDeliveryDeskForTests();
  delete globalThis.localStorage;
});
