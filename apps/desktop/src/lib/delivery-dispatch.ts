import { DELIVERY_DISPATCH_MARKER } from "./delivery-chat.ts";
import type { DeliveryEmployeeModels } from "./delivery-employees.ts";
import { employeeModelDirective } from "./delivery-employees.ts";
import {
  GLOBAL_MODULE_ID,
  normalizeDeliveryDeployTarget,
  type DeliveryDeployTarget,
  type DeliveryDesk,
  type DeliveryModule,
} from "./delivery-desk.ts";

export type DeliveryTaskRole = "implement" | "verify-l3" | "deploy";

export type DeliveryTask = {
  id: string;
  moduleId: string | null;
  title: string;
  acceptance: string;
  dependsOn: string[];
  workerId: string;
  role: DeliveryTaskRole;
  /** Copied from the dispatch ledger when the plan is reassigned. */
  status?: "waiting" | "running" | "done";
};

function splitAcceptanceLines(acceptance: string): string[] {
  const raw = acceptance.trim();
  if (!raw) return [];
  const lines: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const cleaned = line.trim().replace(/^[-*•]\s+/, "").replace(/^\d+[.)、]\s+/, "").trim();
    if (cleaned && !/^\(?none\)?$/i.test(cleaned)) lines.push(cleaned);
  }
  if (lines.length > 1) return lines;
  const parts = raw
    .split(/[;；]/)
    .map((part) => part.replace(/^[-*•]\s+/, "").replace(/^\d+[.)、]\s+/, "").trim())
    .filter((part) => part && !/^\(?none\)?$/i.test(part));
  return parts.length > 1 ? parts : lines;
}

function clip(text: string, max: number): string {
  const value = text.replace(/\s+/g, " ").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(1, max - 1))}…`;
}

function roleFor(title: string): DeliveryTaskRole {
  if (/^Verify |^Risk-based|^Regression/.test(title)) return "verify-l3";
  if (/README|Stamp delivery/.test(title)) return "deploy";
  return "implement";
}

export function buildDeliveryTasks(modules: DeliveryModule[]): DeliveryTask[] {
  const list = modules.filter((module) => module.status === "confirmed" && module.id !== GLOBAL_MODULE_ID);
  const tasks: DeliveryTask[] = [];
  let n = 1;
  const push = (partial: { moduleId: string | null; title: string; acceptance?: string; dependsOn: string[] }) => {
    const id = `T${String(n).padStart(3, "0")}`;
    n += 1;
    const task: DeliveryTask = {
      id,
      moduleId: partial.moduleId,
      title: partial.title.slice(0, 200),
      acceptance: (partial.acceptance || "").slice(0, 500),
      dependsOn: partial.dependsOn.filter(Boolean),
      workerId: "w1",
      role: roleFor(partial.title),
    };
    tasks.push(task);
    return task;
  };
  for (const module of list) {
    const title = (module.title || module.id || "module").slice(0, 80);
    const lines = splitAcceptanceLines(module.card.acceptance);
    const atoms = lines.length ? lines : [""];
    for (const line of atoms) {
      push({
        moduleId: module.id,
        title: line ? `Implement «${title}»: ${clip(line, 80)}` : `Implement «${title}»`,
        acceptance: line,
        dependsOn: [],
      });
    }
  }
  if (tasks.length) {
    const verifyAll = push({
      moduleId: null,
      title: "Risk-based verification",
      dependsOn: [],
    });
    const readme = push({
      moduleId: null,
      title: "Update product README",
      dependsOn: [verifyAll.id],
    });
    push({
      moduleId: null,
      title: "Stamp delivery accepted",
      dependsOn: [readme.id],
    });
  }
  return tasks;
}

function waveOf(tasks: DeliveryTask[]): Map<string, number> {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const ranks = new Map<string, number>();
  const visit = (id: string, stack: Set<string>): number => {
    const cached = ranks.get(id);
    if (cached != null) return cached;
    if (stack.has(id)) return 0;
    stack.add(id);
    const task = byId.get(id);
    const deps = task?.dependsOn ?? [];
    const rank = deps.length === 0 ? 0 : Math.max(...deps.map((dep) => visit(dep, stack))) + 1;
    stack.delete(id);
    ranks.set(id, rank);
    return rank;
  };
  for (const task of tasks) visit(task.id, new Set());
  return ranks;
}

export function recommendDeliveryWorkers(tasks: DeliveryTask[]): number {
  const ranks = waveOf(tasks);
  const counts = new Map<number, number>();
  for (const task of tasks) {
    const wave = ranks.get(task.id) ?? 0;
    counts.set(wave, (counts.get(wave) ?? 0) + 1);
  }
  const width = Math.max(1, ...counts.values(), 1);
  const specialty = tasks.some((task) => task.role === "verify-l3" || task.role === "deploy");
  let count = Math.min(4, width);
  if (specialty && width >= 2) count = Math.min(4, width + 1);
  return Math.max(1, count);
}

const PUBLISH_TITLE: Record<Exclude<DeliveryDeployTarget, "none">, string> = {
  "github-pages": "Publish to GitHub Pages",
  cloudflare: "Publish to Cloudflare",
  aliyun: "Publish to Alibaba Cloud",
  aws: "Publish to AWS",
};

export function isPublishTask(task: { role: string; title: string }): boolean {
  return task.role === "deploy" && /^Publish to /i.test(task.title);
}

/** Append the publish step, or drop it when this round does not deploy. */
export function withPublishTask(tasks: DeliveryTask[], target: DeliveryDeployTarget): DeliveryTask[] {
  const rest = tasks.filter((task) => !isPublishTask(task));
  if (target === "none") return rest;
  const ids = new Set(rest.map((task) => task.id));
  let n = rest.length + 1;
  let id = `T${String(n).padStart(3, "0")}`;
  while (ids.has(id)) {
    n += 1;
    id = `T${String(n).padStart(3, "0")}`;
  }
  const dependsOn = rest
    .filter((task) => task.role === "implement" || task.role === "verify-l3")
    .map((task) => task.id)
    .slice(0, 12);
  return [
    ...rest,
    {
      id,
      moduleId: null,
      title: PUBLISH_TITLE[target],
      acceptance: "公网地址可打开，回复里单独一行写预览地址：https://…",
      dependsOn,
      workerId: "w1",
      role: "deploy",
    },
  ];
}

function hostDirective(target: DeliveryDeployTarget): string {
  if (target === "none") {
    return "本轮不部署。不要发布，不要推远程。";
  }
  const close = "成功后在回复里单独一行：预览地址：https://…。密钥不进仓库，也不要写进回复。";
  if (target === "cloudflare") {
    return [
      "本轮托管：Cloudflare。部署任务等全部实现和回归通过后再做，不改功能。",
      "按 Workers 或 Pages 来写：不要依赖本机磁盘保存状态。密钥用设置里已保存的，不要写进仓库。",
      close,
    ].join("\n");
  }
  if (target === "aliyun") {
    return [
      "本轮托管：阿里云。部署任务等全部实现和回归通过后再做，不改功能。",
      "静态站用 OSS，接口用函数计算。密钥用设置里已保存的，不要写进仓库。",
      close,
    ].join("\n");
  }
  if (target === "aws") {
    return [
      "本轮托管：AWS。部署任务等全部实现和回归通过后再做，不改功能。",
      "静态站用 S3 和 CloudFront，接口用 Lambda。密钥用设置里已保存的，不要写进仓库。",
      close,
    ].join("\n");
  }
  return [
    "本轮托管：GitHub Pages。部署任务等全部实现和回归通过后再做，不改功能。",
    "用 gh：先 gh auth status；仓库要有 GitHub 远程；提交 .github/workflows/deploy.yml（有构建就上传构建产物，没有就上传站点目录）；用 gh api 把 Pages 设为 workflow；推到 main 或 gh workflow run；gh run watch 直到成功。",
    "成功后在回复里单独一行：预览地址：https://<owner>.github.io/<repo>/",
    "密钥不进仓库。",
  ].join("\n");
}

export function assignDeliveryWorkers(tasks: DeliveryTask[], workerCount: number): DeliveryTask[] {
  const count = Math.max(1, Math.min(4, workerCount || 1));
  const ranks = waveOf(tasks);
  const cursor = new Map<number, number>();
  return tasks.map((task) => {
    if (count > 1 && (task.role === "verify-l3" || task.role === "deploy")) {
      return { ...task, workerId: `w${count}` };
    }
    const wave = ranks.get(task.id) ?? 0;
    const slot = cursor.get(wave) ?? 0;
    cursor.set(wave, slot + 1);
    return { ...task, workerId: `w${(slot % count) + 1}` };
  });
}

/** Who starts together in this released wave. One task per worker. */
export function parallelKickoff(tasks: DeliveryTask[]): string {
  const lead = new Map<string, string>();
  for (const task of tasks) {
    if (!lead.has(task.workerId)) lead.set(task.workerId, task.id);
  }
  if (lead.size <= 1) {
    return "这一波只有一名数字员工能开工，先派他的第一条 Task。";
  }
  const pairs = [...lead.entries()].map(([worker, id]) => `${worker} 做 ${id}`).join("，");
  return `这一波同时开工：${pairs}。下一条助手消息里只发这些 Task（每人一次），不要夹别的工具，也不要先 TaskWait。做完就停，不要自己派下一波。`;
}

export function deliveryDispatchPrompt(
  desk: DeliveryDesk,
  tasks: DeliveryTask[],
  workerCount: number,
  models?: DeliveryEmployeeModels,
): string {
  const lines = tasks.map((task) => {
    const deps = task.dependsOn.length ? ` depends ${task.dependsOn.join(",")}` : "";
    const acceptance = task.acceptance ? `\n  验收：${task.acceptance}` : "";
    return `- ${task.id} ${task.role} ${task.workerId}${task.moduleId ? ` [${task.moduleId}]` : ""}${deps} ${task.title}${acceptance}`;
  });
  const cards = desk.modules
    .filter((module) => module.status === "confirmed")
    .map((module) => `[${module.id}] ${module.title}\n${module.card.goal}\n验收：${module.card.acceptance}`)
    .join("\n\n");
  const ids = tasks.map((task) => task.id).join("、");
  return [
    DELIVERY_DISPATCH_MARKER,
    "用 DuaerAiDesk 的 Task 子代理执行这一波已经放行的任务。不要重新拆分，不要派下面列表以外的任务。父对话不要自己改仓库。",
    "implement 任务的 Task 把 agent 填 coder（Duaer 编码师），只按这一条验收写代码。verify-l3 的 agent 填 test-runner。deploy 不要交给 coder。",
    `只做这些：${ids}。每个调用一次 Task，description 以任务 id 开头，并带上标题和这一条验收。`,
    "做完就停。没通过也停，不要自己重开，也不要派下一波。下一波由应用再放行。",
    parallelKickoff(tasks),
    employeeModelDirective(models ?? { implementer: "", regression: "", deployer: "" }),
    hostDirective(normalizeDeliveryDeployTarget(desk.deployTarget)),
    `数字员工 ${workerCount} 人。同一 workerId 串行；这一波里不同 workerId 的任务一起开工。`,
    desk.intake?.kind === "both"
      ? "修缺陷的任务 id 必须挡住新需求任务。不要为修缺陷另做架构。"
      : "",
    "",
    ...lines,
    "",
    "已确认模块：",
    cards,
    visualDirective(desk),
  ].filter(Boolean).join("\n");
}

function visualDirective(desk: DeliveryDesk): string {
  const global = desk.modules.find((module) => module.id === GLOBAL_MODULE_ID);
  const style = global?.card.style.trim() ?? "";
  const layout = global?.card.layout.trim() ?? "";
  if (!style && !layout) return "";
  return `全局风格：${style}\n全局布局：${layout}\n编码时按这两段写，不要另起一套视觉。`;
}
