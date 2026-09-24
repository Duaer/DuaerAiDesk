import assert from "node:assert/strict";
import test from "node:test";
import { assignDeliveryWorkers, deliveryDispatchPrompt, withPublishTask } from "../src/lib/delivery-dispatch.ts";
import { employeeModelDirective, parseEmployeeModels } from "../src/lib/delivery-employees.ts";

test("each digital employee model is named in the dispatch prompt", () => {
  const models = parseEmployeeModels(JSON.stringify({
    implementer: "anthropic/claude",
    regression: "",
    deployer: "openai/gpt",
  }));
  assert.match(employeeModelDirective(models), /implement=anthropic\/claude/);
  assert.match(employeeModelDirective(models), /verify-l3=跟当前对话/);
  assert.match(employeeModelDirective(models), /deploy=openai\/gpt/);
  const prompt = deliveryDispatchPrompt(
    { modules: [] },
    [],
    2,
    models,
  );
  assert.match(prompt, /implement=anthropic\/claude/);
  assert.match(prompt, /不要传 model/);
  assert.match(prompt, /agent 填 coder/);
  assert.match(prompt, /test-runner/);
});

test("dispatch tells the coder to follow the global visual design", () => {
  const prompt = deliveryDispatchPrompt({
    modules: [{
      id: "global",
      status: "confirmed",
      title: "全局",
      card: {
        goal: "外观",
        acceptance: "同一套页面",
        style: "白底、深色字、正文 16px、间距 8px",
        layout: "单栏居中，顶部导航",
      },
    }],
  }, [], 1);
  assert.match(prompt, /全局风格：白底、深色字、正文 16px、间距 8px/);
  assert.match(prompt, /全局布局：单栏居中，顶部导航/);
  assert.match(prompt, /不要另起一套视觉/);
});

test("a parallel headcount spreads one module across employees", () => {
  const tasks = [1, 2, 3].map((n) => ({
    id: `T00${n}`,
    moduleId: "m1",
    title: "实现",
    acceptance: "能看到结果",
    dependsOn: [],
    workerId: "w1",
    role: "implement",
  }));
  const assigned = assignDeliveryWorkers(tasks, 2);
  assert.deepEqual(assigned.map((task) => task.workerId), ["w1", "w2", "w1"]);
  const prompt = deliveryDispatchPrompt({ modules: [] }, assigned, 2);
  assert.match(prompt, /w1 做 T001，w2 做 T002/);
  assert.match(prompt, /不要先 TaskWait/);
  assert.match(prompt, /做完就停，不要自己派下一波/);
  const later = deliveryDispatchPrompt({ modules: [] }, [
    { id: "T003", moduleId: null, title: "总验证", acceptance: "过", dependsOn: ["T001"], workerId: "w1", role: "verify-l3" },
    { id: "T004", moduleId: "m2", title: "提醒", acceptance: "过", dependsOn: [], workerId: "w2", role: "implement" },
  ], 2);
  assert.match(later, /只做这些：T003、T004/);
  assert.match(later, /w1 做 T003，w2 做 T004/);
});

test("GitHub Pages adds a publish task and none drops it", () => {
  const tasks = [{
    id: "T001",
    moduleId: "m1",
    title: "实现",
    acceptance: "能看到结果",
    dependsOn: [],
    workerId: "w1",
    role: "implement",
  }];
  const published = withPublishTask(tasks, "github-pages");
  assert.equal(published.at(-1)?.role, "deploy");
  assert.match(published.at(-1)?.title ?? "", /Publish to GitHub Pages/);
  assert.deepEqual(published.at(-1)?.dependsOn, ["T001"]);
  assert.equal(withPublishTask(published, "none").length, 1);
  const pages = deliveryDispatchPrompt({ modules: [], deployTarget: "github-pages" }, published, 1);
  assert.match(pages, /预览地址：https:\/\/<owner>\.github\.io\/<repo>\//);
  const quiet = deliveryDispatchPrompt({ modules: [], deployTarget: "none" }, tasks, 1);
  assert.match(quiet, /本轮不部署/);
  const cloud = withPublishTask(tasks, "aliyun");
  assert.match(cloud.at(-1)?.title ?? "", /Publish to Alibaba Cloud/);
  const prompt = deliveryDispatchPrompt({ modules: [], deployTarget: "aliyun" }, cloud, 1);
  assert.match(prompt, /阿里云/);
  assert.match(prompt, /不要写进仓库/);
});
