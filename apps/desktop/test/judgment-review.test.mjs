import assert from "node:assert/strict";
import test from "node:test";

const {
  deliveryReviewFromJudgment,
  isJudgmentModelId,
  judgmentErrorMessage,
  judgmentReviewUrl,
  requestJudgmentReview,
} = await import("../src/lib/judgment-review.ts");

const card = {
  goal: "打开首页能看到 Hello",
  acceptance: "打开 index.html，能看到 Hello",
  outOfScope: "",
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
};

test("jev model ids use the judgments endpoint under /v1", () => {
  assert.equal(isJudgmentModelId("jev-latest"), true);
  assert.equal(isJudgmentModelId("deepseek-v4-flash"), false);
  assert.equal(
    judgmentReviewUrl("https://api.duaer.com/v1"),
    "https://api.duaer.com/v1/judgments",
  );
  assert.equal(
    judgmentReviewUrl("https://api.example.com"),
    "https://api.example.com/v1/judgments",
  );
});

test("a pass choice locks the same card", () => {
  const result = deliveryReviewFromJudgment({
    answers: {
      passed: { type: "noul", noul: 0.87 },
      gap: { type: "choice", choice: "pass" },
    },
  }, card);
  assert.equal(result.passed, true);
  assert.deepEqual(result.issues, []);
  assert.equal(result.card, card);
});

test("a vague choice fails without rewriting the card", () => {
  const result = deliveryReviewFromJudgment({
    answers: { gap: { type: "choice", choice: "vague" } },
  }, card);
  assert.equal(result.passed, false);
  assert.deepEqual(result.issues, ["验收或目标还不能核对"]);
  assert.equal(result.card.goal, card.goal);
});

test("gateway message is read from the JSON body", () => {
  assert.equal(
    judgmentErrorMessage(400, '{"code":400,"message":"Use POST /v1/judgments for this judgment model"}'),
    "Use POST /v1/judgments for this judgment model",
  );
});

test("review posts the card to judgments and returns the lock decision", async () => {
  const calls = [];
  const result = await requestJudgmentReview({
    baseUrl: "https://api.duaer.com/v1/",
    apiKey: "test-key",
    modelId: "jev-latest",
    card,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            answers: { gap: { type: "choice", choice: "pass" } },
          });
        },
      };
    },
  });
  assert.equal(calls[0].url, "https://api.duaer.com/v1/judgments");
  assert.equal(calls[0].init.headers.authorization, "Bearer test-key");
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, "jev-latest");
  assert.equal(body.state.goal, card.goal);
  assert.equal(body.questions.gap.type, "choice");
  assert.equal(result.passed, true);
});

const { intakeFromJudgment, intakeFromText } = await import("../src/lib/judgment-review.ts");

test("intake judgment reads kind and leaves the card alone", () => {
  const intake = intakeFromJudgment({
    answers: {
      kind: { type: "choice", choice: "bug" },
      reason: { type: "noul", text: "登录已经坏了" },
    },
  });
  assert.equal(intake?.kind, "bug");
  assert.equal(intake?.reason, "登录已经坏了");
  assert.equal(intakeFromJudgment({ answers: { kind: { choice: "maybe" } } }), null);
});

test("intake text falls back only when the kind is one of the four lanes", () => {
  assert.equal(intakeFromText('{"kind":"both","reason":"又修又加"}')?.kind, "both");
  assert.equal(intakeFromText('{"kind":"feature"}'), null);
});
