import assert from "node:assert/strict";
import test from "node:test";

const { normalizeReqText, parseReqBlocks, reqEditModel, serializeReqEdit } = await import(
  "../src/lib/req-structure.ts"
);

test("requirement text splits semicolon, numbered, and chip lists", () => {
  const semicolons = normalizeReqText("empty list; failure can retry");
  assert.match(semicolons, /^- empty list\n- failure can retry$/);

  const numbered = parseReqBlocks("1. open the desk\n2. see the goal");
  assert.equal(numbered[0].kind, "ol");
  assert.deepEqual(numbered[0].items, ["open the desk", "see the goal"]);

  const chips = parseReqBlocks("Chrome, Safari, 统信");
  assert.equal(chips[0].kind, "ul");
  assert.deepEqual(chips[0].items, ["Chrome", "Safari", "统信"]);
});

test("requirement edit round-trips lists and module sections", () => {
  const model = reqEditModel("- keep chat\n- expand the card");
  assert.equal(model.mode, "ul");
  assert.equal(serializeReqEdit(model.mode, model.items), "- keep chat\n- expand the card");

  const sections = reqEditModel("[登录] 打开首页\n[提交] 看到结果");
  assert.equal(sections.items.length, 2);
  const saved = serializeReqEdit(sections.mode, sections.items);
  assert.match(saved, /^\[登录\]/);
  assert.match(saved, /\n\[提交\]/);
});
