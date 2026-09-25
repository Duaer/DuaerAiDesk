import assert from "node:assert/strict";
import test from "node:test";

const { deliveryCardIssues } = await import("../src/lib/delivery-card-check.ts");
const { emptyDeliveryDesk, moduleCanConfirm } = await import("../src/lib/delivery-desk.ts");
const { shouldClassifyIntake } = await import("../src/lib/delivery-intake.ts");

function ask(desk, text, tabKind = "requirements") {
  return shouldClassifyIntake({
    text,
    tabKind,
    workPanelOpen: true,
    desk,
  });
}

test("intake classifies a new requirements ask and skips follow-ups", () => {
  const desk = emptyDeliveryDesk();
  assert.equal(desk.intake, null);
  assert.equal(ask(desk, "登录打不开了"), true);
  assert.equal(ask(desk, "请开始帮我梳理需求：用大白话"), false);
  assert.equal(ask(desk, "<<<DESK>>> 规则"), false);
  assert.equal(ask(desk, "duaer:start-bugfix"), false);
  assert.equal(ask(desk, "登录打不开了", "architecture"), false);

  desk.intake = { kind: "bug", reason: "" };
  assert.equal(ask(desk, "还有一步"), false);

  desk.intake = { kind: "unclear", reason: "" };
  assert.equal(ask(desk, "是原来的登录坏了"), true);

  desk.intake = null;
  desk.modules[0].card.goal = "已经在问了";
  assert.equal(ask(desk, "再补一句"), false);
});

test("bug scope ignores empty shared baselines", () => {
  const desk = emptyDeliveryDesk();
  const global = desk.modules.find((module) => module.id === "global");
  global.card.goal = "登录按钮点了没有反应";
  global.card.acceptance = "打开登录页，点登录后进入首页";
  global.card.assumptions = "实际停在登录页，没有报错";
  assert.deepEqual(deliveryCardIssues(global.card, "bug"), []);
  assert.ok(deliveryCardIssues(global.card, "global").length > 0);
  assert.equal(moduleCanConfirm(global, "bug"), true);
  assert.equal(moduleCanConfirm(global), false);
});
