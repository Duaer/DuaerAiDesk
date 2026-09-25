import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  annotateParallelTasks,
  dispatchSplitPrompt,
  extractDispatchPlan,
  progressFromToolMessages,
  releaseWave,
  resolveDispatchStatuses,
  taskGraphIr,
} from "../src/lib/delivery-dispatch-plan.mjs";
import { visibleDeliveryText } from "../src/lib/delivery-chat.ts";
import { routeTaskEdge, zoomLogicalPoint } from "../src/lib/architecture-mount.mjs";

test("split prompt hides the instruction and keeps the chat note", () => {
  const prompt = dispatchSplitPrompt("架构已确认，开始拆任务。", "{\"modules\":[]}");
  assert.equal(visibleDeliveryText(prompt, "user"), "架构已确认，开始拆任务。");
  assert.match(prompt, /不要调用 Task/);
  assert.match(prompt, /原子任务/);
  assert.match(prompt, /acceptance/);
  assert.match(prompt, /<<<DESK>>>/);
});

test("extracts a task plan from the split reply", () => {
  const plan = extractDispatchPlan(`两个模块没有依赖，可以并行。
- T001 实现日记 · w1
<<<JSON>>>
{"dispatch_type":"tasks","workers":2,"rationale":"两条并行链","tasks":[
  {"id":"T001","title":"实现日记","role":"implement","workerId":"w1","moduleId":"m1","acceptance":"能保存一篇日记","dependsOn":[]},
  {"id":"T002","title":"总验证","role":"verify-l3","workerId":"w2","moduleId":null,"dependsOn":["T001"]}
]}`);
  assert.equal(plan.workers, 2);
  assert.equal(plan.rationale, "两条并行链");
  assert.equal(plan.tasks.length, 2);
  assert.equal(plan.tasks[0].acceptance, "能保存一篇日记");
  assert.equal(plan.tasks[1].role, "verify-l3");
  assert.deepEqual(plan.tasks[1].dependsOn, ["T001"]);
});

test("task graph lanes follow workers and dependencies", () => {
  const tasks = [
    { id: "T001", title: "实现日记", role: "implement", workerId: "w1", dependsOn: [] },
    { id: "T002", title: "实现提醒", role: "implement", workerId: "w2", dependsOn: [] },
    { id: "T003", title: "总验证", role: "verify-l3", workerId: "w2", dependsOn: ["T001", "T002"] },
  ];
  const annotated = annotateParallelTasks(tasks);
  assert.equal(annotated[0].parallel, true);
  assert.equal(annotated[2].parallel, false);
  const ir = taskGraphIr(tasks, { title: "任务执行路径", workerCount: 2 });
  assert.equal(ir.diagram_type, "architecture");
  assert.equal(ir.meta.title, "任务执行路径");
  assert.equal(ir.components.length, 3);
  assert.equal(ir.connections.length, 2);
  assert.ok(ir.components[1].pos[1] > ir.components[0].pos[1]);
  assert.ok(ir.components[2].pos[0] > ir.components[0].pos[0]);
  assert.equal(ir.connections[0].fromSide, "right");
});

test("task graph stacks tasks that share a lane and rank", () => {
  const ir = taskGraphIr([
    { id: "T001", title: "a", workerId: "w1", dependsOn: [] },
    { id: "T002", title: "b", workerId: "w1", dependsOn: [] },
  ]);
  assert.ok(ir.components[1].pos[1] > ir.components[0].pos[1] + 64);
});

test("task graph keeps later ranks to the right", () => {
  const tasks = Array.from({ length: 6 }, (_, index) => ({
    id: `T00${index + 1}`,
    title: "t",
    workerId: "w1",
    dependsOn: index ? [`T00${index}`] : [],
  }));
  const ir = taskGraphIr(tasks);
  const xs = ir.components.map((node) => node.pos[0]);
  for (let index = 1; index < xs.length; index += 1) {
    assert.ok(xs[index] > xs[index - 1]);
  }
});

test("task graph drops transitive edges", () => {
  const ir = taskGraphIr([
    { id: "T001", title: "a", workerId: "w1", dependsOn: [] },
    { id: "T002", title: "b", workerId: "w1", dependsOn: ["T001"] },
    { id: "T003", title: "c", workerId: "w1", dependsOn: ["T001", "T002"] },
  ]);
  assert.deepEqual(
    ir.connections.map((edge) => `${edge.from}->${edge.to}`),
    ["T001->T002", "T002->T003"],
  );
});

test("run status paints the graph and follows Task tool rows", () => {
  const tasks = [
    { id: "T001", title: "实现日记", role: "implement", workerId: "w1", dependsOn: [] },
    { id: "T002", title: "实现提醒", role: "implement", workerId: "w2", dependsOn: [] },
    { id: "T003", title: "总验证", role: "verify-l3", workerId: "w1", dependsOn: ["T001"] },
  ];
  const idle = resolveDispatchStatuses(tasks, { doneIds: [], runningIds: [] });
  assert.equal(idle.get("T001"), "waiting");
  assert.equal(idle.get("T002"), "waiting");
  assert.equal(idle.get("T003"), "waiting");
  const messages = [
    { toolName: "Task", toolStatus: "success", toolArgs: { description: "T001 实现日记" } },
    { toolName: "Task", toolStatus: "running", toolArgs: { description: "T002 实现提醒" } },
    { toolName: "Read", toolStatus: "running", toolArgs: { description: "T003 总验证" } },
  ];
  const tool = progressFromToolMessages(messages, tasks.map((task) => task.id));
  assert.deepEqual(tool.doneIds, ["T001"]);
  assert.deepEqual(tool.runningIds, ["T002"]);
  const live = resolveDispatchStatuses(tasks, tool);
  assert.equal(live.get("T001"), "done");
  assert.equal(live.get("T002"), "running");
  assert.equal(live.get("T003"), "waiting");
  const ledger = resolveDispatchStatuses(
    tasks.map((task) => (task.id === "T001" ? { ...task, status: "done" } : task)),
    { doneIds: [], runningIds: [] },
  );
  assert.equal(ledger.get("T001"), "done");
  assert.equal(ledger.get("T003"), "waiting");
  const ir = taskGraphIr(tasks, { progress: { live: true, ...tool } });
  assert.equal(ir.components[0].type, "database");
  assert.equal(ir.components[0].tag, "已完成");
  assert.match(ir.components[0].sublabel, /已完成/);
  assert.equal(ir.components[1].type, "backend");
  assert.equal(ir.components[1].tag, "进行中");
});

test("releaseWave keeps one ready task per worker and skips done or blocked work", () => {
  const tasks = [
    { id: "T001", title: "日记保存", role: "implement", workerId: "w1", moduleId: "m1", dependsOn: [] },
    { id: "T002", title: "提醒出现", role: "implement", workerId: "w2", moduleId: "m2", dependsOn: [] },
    { id: "T003", title: "总验证", role: "verify-l3", workerId: "w1", moduleId: null, dependsOn: [] },
  ];
  const modules = [
    { id: "m1", dependsOn: [] },
    { id: "m2", dependsOn: ["m1"] },
  ];
  assert.deepEqual(releaseWave(tasks, modules).map((task) => task.id), ["T001"]);
  const done = tasks.map((task) => (task.id === "T001" ? { ...task, status: "done" } : task));
  assert.deepEqual(releaseWave(done, modules).map((task) => task.id), ["T002"]);
  const both = done.map((task) => (task.id === "T002" ? { ...task, status: "done" } : task));
  assert.deepEqual(releaseWave(both, modules).map((task) => task.id), ["T003"]);
  const parallel = [
    { id: "T001", workerId: "w1", dependsOn: [] },
    { id: "T002", workerId: "w2", dependsOn: [] },
    { id: "T003", workerId: "w1", dependsOn: ["T001"] },
  ];
  assert.deepEqual(releaseWave(parallel, []).map((task) => task.id), ["T001", "T002"]);
});

test("ignores architecture JSON that is not a task split", () => {
  assert.equal(extractDispatchPlan(`图好了\n<<<JSON>>>\n{"diagram_type":"architecture","summary":"x"}`), null);
});

test("task edges share one gutter and zoom shifts toward the pointer delta", () => {
  const from = { x: 48, y: 96, width: 200, height: 64 };
  const to = { x: 368, y: 192, width: 200, height: 64 };
  const route = routeTaskEdge(from, to, 308);
  assert.match(route.d, /^M 248 128 L 308 128 L 308 224 L 368 224$/);
  const same = routeTaskEdge(from, { x: 48, y: 192, width: 200, height: 64 }, 308);
  assert.match(same.d, /^M 148 160 L 148 192$/);
  assert.deepEqual(zoomLogicalPoint(100, 80, 40, -20, 2), { x: 80, y: 90 });
});

test("queued dispatch waves advance outside the dispatch tab", async () => {
  const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
  const shell = await read("../src/features/app/AppShell.tsx");
  const tab = await read("../src/components/workpanel/DispatchTab.tsx");
  assert.match(shell, /useDispatchWave\(/);
  assert.doesNotMatch(tab, /advanceDispatchWave/);
});
