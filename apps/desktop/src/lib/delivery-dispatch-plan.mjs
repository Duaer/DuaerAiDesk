/** Parse the chat split turn. Visible prose stays in the transcript; JSON fills the desk. */

const JSON_MARKER = "<<<JSON>>>";
const DESK_MARKER = "<<<DESK>>>";

const SPLIT_INSTRUCTION = `你是 DuaerAiDesk 的拆任务助手。架构已经确认。在这条对话里写出拆分思考，不要调用 Task，不要改仓库，不要开工。
规则：
- 确认卡上的每一条验收是一个原子任务，角色 implement。title 写要做的一件事，acceptance 写这一条怎样算通过。一条任务只闭环自己的验收。
- dependsOn 只写必须先验收通过的任务 id。同一模块里互不依赖的原子任务可以并行。
- 模块只做分组。模块之间没有 dependsOn 就并行，各占一个数字员工（w1、w2…）。有 dependsOn 的模块，组内任务要等上游模块的全部原子任务验收通过后再开工。不要再拆整模块核对任务。
- 全部模块的原子任务通过后，再接总验证（verify-l3）、更新 README（deploy）、交付盖章（deploy）。收尾任务 moduleId 为空，交给最后一名数字员工。
- 人数按能同时开工的宽度定，1 到 4。正文先写依据和推荐人数，再写任务表（编号、做什么、验收、依赖、数字员工）。
输出：先写给用户看的纯文本，然后单独一行 <<<JSON>>>，再输出 JSON（不要 markdown 围栏）：
{"dispatch_type":"tasks","workers":2,"rationale":"一句话依据","tasks":[{"id":"T001","title":"实现日记保存","role":"implement","workerId":"w1","moduleId":"m1","acceptance":"本地双击打开后能写下并保存一篇日记","dependsOn":[]}]}`;

function clip(value, max) {
  const text = String(value || "").trim();
  return text.length <= max ? text : text.slice(0, max);
}

/**
 * User bubble shows only `note`. The model still receives the split rules after the desk marker.
 */
const BUGFIX_INSTRUCTION = `你是 DuaerAiDesk 的拆任务助手。这是修缺陷，没有新架构，不要叫 UI 设计师，不要 deploy。
规则：
- 一条 implement 修复任务，title 写要改的那一处，acceptance 写期望结果怎样算通过。
- 一条 verify-l3，验收是同一条期望结果。dependsOn 写修复任务 id。
- 不要编新功能，不要派工，不要改仓库。
输出：先写给用户看的纯文本，然后单独一行 <<<JSON>>>，再输出 JSON（不要 markdown 围栏）：
{"dispatch_type":"tasks","workers":1,"rationale":"一句话依据","tasks":[{"id":"T001","title":"修登录失败","role":"implement","workerId":"w1","moduleId":"global","acceptance":"用原账号打开后能进入首页","dependsOn":[]}]}`;

export function bugfixSplitPrompt(note, snapshot) {
  const visible = String(note || "").trim() || "开始拆修复任务。";
  const body = String(snapshot || "").trim();
  return `${visible}\n\n${DESK_MARKER}\n${BUGFIX_INSTRUCTION}\n故障：${body}`;
}

export function dispatchSplitPrompt(note, snapshot) {
  const visible = String(note || "").trim() || "架构已确认，开始拆任务。";
  const body = String(snapshot || "").trim();
  return `${visible}\n\n${DESK_MARKER}\n${SPLIT_INSTRUCTION}\n已确认模块与架构：${body}`;
}

export function extractDispatchPlan(reply) {
  const raw = String(reply || "");
  const marker = raw.lastIndexOf(JSON_MARKER);
  const slice = marker >= 0 ? raw.slice(marker + JSON_MARKER.length) : raw;
  const start = slice.indexOf("{");
  const end = slice.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let obj;
  try {
    obj = JSON.parse(slice.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object" || obj.dispatch_type !== "tasks") return null;
  if (!Array.isArray(obj.tasks) || obj.tasks.length === 0) return null;
  const tasks = [];
  for (const item of obj.tasks) {
    if (!item || typeof item !== "object") continue;
    const id = clip(item.id, 16);
    const title = clip(item.title, 200);
    if (!id || !title) continue;
    const role = item.role === "verify-l3" || item.role === "deploy" ? item.role : "implement";
    const worker = clip(item.workerId, 8);
    const moduleId = clip(item.moduleId, 40);
    const dependsOn = Array.isArray(item.dependsOn)
      ? item.dependsOn.map((dep) => clip(dep, 16)).filter(Boolean).slice(0, 12)
      : [];
    tasks.push({
      id,
      title,
      role,
      workerId: /^w[1-4]$/.test(worker) ? worker : "w1",
      moduleId: moduleId || null,
      acceptance: clip(item.acceptance, 500),
      dependsOn,
    });
    if (tasks.length >= 40) break;
  }
  if (!tasks.length) return null;
  const workers = Math.max(1, Math.min(4, Number(obj.workers) || 1));
  return {
    workers,
    rationale: clip(obj.rationale, 500),
    tasks,
  };
}

function dependencyRanks(tasks) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const ranks = new Map();
  const visit = (id, stack) => {
    if (ranks.has(id)) return ranks.get(id);
    if (stack.has(id)) return 0;
    stack.add(id);
    const deps = byId.get(id)?.dependsOn || [];
    const rank = deps.length === 0 ? 0 : Math.max(...deps.map((dep) => visit(dep, stack))) + 1;
    stack.delete(id);
    ranks.set(id, rank);
    return rank;
  };
  for (const task of tasks) visit(task.id, new Set());
  return ranks;
}

/** Mark tasks that share a dependency wave, same as the live desk pool. */
export function annotateParallelTasks(tasks) {
  const list = (Array.isArray(tasks) ? tasks : []).map((task) => ({ ...task }));
  const ranks = dependencyRanks(list);
  const width = new Map();
  for (const task of list) {
    const wave = ranks.get(task.id) || 0;
    task.wave = wave;
    width.set(wave, (width.get(wave) || 0) + 1);
  }
  for (const task of list) {
    task.parallel = (width.get(task.wave) || 0) > 1;
  }
  return list;
}

function normTaskId(id) {
  return String(id || "").trim().toUpperCase();
}

function isTaskReady(task, doneSet, list, modules) {
  const deps = Array.isArray(task?.dependsOn) ? task.dependsOn : [];
  if (!deps.every((dep) => doneSet.has(normTaskId(dep)))) return false;
  const moduleId = String(task?.moduleId || "");
  const upstream = new Set(
    (modules || []).find((mod) => mod && mod.id === moduleId)?.dependsOn || [],
  );
  const closesModules = !moduleId && (task?.role === "verify-l3" || task?.role === "deploy");
  for (const other of list || []) {
    if (!other?.moduleId || other.id === task?.id) continue;
    const blocks =
      closesModules || (moduleId && upstream.has(other.moduleId));
    if (blocks && !doneSet.has(normTaskId(other.id))) return false;
  }
  return true;
}

const STATUS_TYPES = {
  done: "database",
  running: "backend",
  waiting: "external",
};

/**
 * done | running | waiting. Running is only a live Task call. A ready task stays
 * waiting until this app releases it; the model does not paint the next one as running.
 * Ledger status "done" counts even when the tool row is gone.
 * @param {Array<object>} tasks
 * @param {{ doneIds?: string[], runningIds?: string[] } | null | undefined} progress
 * @param {Array<{ id?: string, dependsOn?: string[] }> | null | undefined} modules
 */
export function resolveDispatchStatuses(tasks, progress, modules) {
  void modules;
  const list = Array.isArray(tasks) ? tasks : [];
  const doneSet = new Set((progress?.doneIds || []).map(normTaskId).filter(Boolean));
  for (const task of list) {
    if (task?.status === "done") doneSet.add(normTaskId(task.id));
  }
  const explicit = new Set(
    (progress?.runningIds || []).map(normTaskId).filter((id) => id && !doneSet.has(id)),
  );
  /** @type {Map<string, "done"|"running"|"waiting">} */
  const out = new Map();
  for (const task of list) {
    const id = normTaskId(task?.id);
    if (!id) continue;
    if (doneSet.has(id)) out.set(id, "done");
    else if (explicit.has(id)) out.set(id, "running");
    else out.set(id, "waiting");
  }
  return out;
}

/** One ready, not-done task per worker. The app releases this wave; the model does not pick the next. */
export function releaseWave(tasks, modules) {
  const list = Array.isArray(tasks) ? tasks : [];
  const doneSet = new Set(
    list.filter((task) => task?.status === "done").map((task) => normTaskId(task.id)),
  );
  const seen = new Set();
  const wave = [];
  for (const task of list) {
    const id = normTaskId(task?.id);
    if (!id || doneSet.has(id) || !isTaskReady(task, doneSet, list, modules)) continue;
    const workerId = String(task.workerId || "w1");
    if (seen.has(workerId)) continue;
    seen.add(workerId);
    wave.push(task);
  }
  return wave;
}

function taskIdsIn(text) {
  return [...String(text || "").matchAll(/\bT\d{3}\b/gi)].map((match) => match[0].toUpperCase());
}

function primaryTaskId(message, known) {
  const args = message?.toolArgs;
  const fields = [];
  if (args && typeof args === "object") {
    fields.push(args.description, args.title, args.name, args.task);
    const prompt = String(args.prompt || "").split("\n")[0];
    fields.push(prompt);
  }
  for (const field of fields) {
    const hit = taskIdsIn(field).find((id) => known.has(id));
    if (hit) return hit;
  }
  return taskIdsIn(typeof args === "string" ? args : "").find((id) => known.has(id)) || "";
}

/** Task tool rows whose description names a plan id. Success is done; a live call is running. */
export function progressFromToolMessages(messages, taskIds) {
  const known = new Set((taskIds || []).map(normTaskId).filter(Boolean));
  const done = new Set();
  const running = new Set();
  for (const message of messages || []) {
    const name = String(message?.toolName || "").toLowerCase();
    if (name !== "task") continue;
    const id = primaryTaskId(message, known);
    if (!id) continue;
    if (message.toolStatus === "success") {
      done.add(id);
      running.delete(id);
    } else if (message.toolStatus === "running" && !done.has(id)) {
      running.add(id);
    }
  }
  return { doneIds: [...done], runningIds: [...running] };
}

/** Row inside a rank column. Later ranks stay to the right; workers stay grouped. */
function assignGraphRows(list, ranks) {
  const row = new Map();
  const byRank = new Map();
  for (const task of list) {
    const rank = ranks.get(task.id) || 0;
    if (!byRank.has(rank)) byRank.set(rank, []);
    byRank.get(rank).push(task);
  }
  const order = [...byRank.keys()].sort((a, b) => a - b);
  for (const rank of order) {
    const group = byRank.get(rank);
    const openers = group.every((task) => !(task.dependsOn || []).some((id) => row.has(id)));
    if (openers) {
      const ordered = [...group].sort(
        (a, b) => workerLane(a) - workerLane(b) || a.id.localeCompare(b.id),
      );
      ordered.forEach((task, index) => row.set(task.id, index));
      continue;
    }
    const preferred = group.map((task) => {
      const preds = (task.dependsOn || [])
        .map((id) => row.get(id))
        .filter((value) => Number.isFinite(value));
      if (!preds.length) return workerLane(task);
      return preds.reduce((sum, value) => sum + value, 0) / preds.length;
    });
    const used = new Set();
    const placed = group
      .map((task, index) => ({ task, score: preferred[index] }))
      .sort((a, b) => a.score - b.score || a.task.id.localeCompare(b.task.id));
    for (const item of placed) {
      let slot = Math.max(0, Math.round(item.score));
      while (used.has(slot)) slot += 1;
      used.add(slot);
      row.set(item.task.id, slot);
    }
  }
  return row;
}

/** Drop A→C when A reaches C through another task. Display only. */
function transitiveReduce(edges) {
  const outs = new Map();
  for (const edge of edges) {
    if (!outs.has(edge.from)) outs.set(edge.from, new Set());
    outs.get(edge.from).add(edge.to);
  }
  const reaches = (from, target) => {
    const stack = [...(outs.get(from) || [])].filter((id) => id !== target);
    const seen = new Set();
    while (stack.length) {
      const id = stack.pop();
      if (id === target) return true;
      if (seen.has(id)) continue;
      seen.add(id);
      for (const next of outs.get(id) || []) {
        if (!seen.has(next)) stack.push(next);
      }
    }
    return false;
  };
  return edges.filter((edge) => !reaches(edge.from, edge.to));
}

function workerLane(task) {
  return Math.max(0, Number(String(task?.workerId || "w1").replace(/^w/i, "")) - 1 || 0);
}

/**
 * Archify IR for the dispatch graph. Columns follow dependency rank, left to right.
 * Rows in a column follow predecessor alignment, then worker. Edge sides leave the
 * facing side so the mount can draw one gutter elbow instead of an outer detour.
 * With progress.live, node type/tag/sublabel follow done | running | waiting.
 */
export function taskGraphIr(tasks, opts = {}) {
  const list = Array.isArray(tasks) ? tasks : [];
  const title = clip(opts.title || "任务执行路径", 80) || "任务执行路径";
  const ranks = dependencyRanks(list);
  const statuses = opts.progress?.live
    ? resolveDispatchStatuses(list, opts.progress, opts.modules)
    : null;
  const labels = {
    done: "已完成",
    running: "进行中",
    waiting: "等待中",
    ...(opts.statusLabels || {}),
  };
  const colW = 320;
  const rowH = 96;
  const originX = 48;
  const originY = 96;
  const size = [200, 64];
  const shown = list.slice(0, 40);
  const rows = assignGraphRows(shown, ranks);
  const components = shown.map((task) => {
    const rank = ranks.get(task.id) || 0;
    const role = task.role === "verify-l3" ? "security" : task.role === "deploy" ? "cloud" : "backend";
    const status = statuses?.get(normTaskId(task.id));
    const statusLabel = status ? labels[status] : "";
    const tint = Boolean(status) && opts.progress?.color !== false;
    const showStatus = Boolean(status) && opts.progress?.label !== false;
    return {
      id: task.id,
      type: tint ? STATUS_TYPES[status] : role,
      label: clip(task.id, 16),
      sublabel: showStatus
        ? clip(`${statusLabel} · ${task.title || ""}`, 36)
        : clip(`${task.workerId || "w1"} · ${task.title || ""}`, 36),
      ...(status ? { tag: statusLabel } : {}),
      pos: [originX + rank * colW, originY + (rows.get(task.id) || 0) * rowH],
      size: [...size],
    };
  }).filter((node) => node.id && node.label);
  if (!components.length) return null;
  const ids = new Set(components.map((node) => node.id));
  const posById = new Map(components.map((node) => [node.id, node.pos]));
  const rawEdges = [];
  for (const task of list) {
    if (!ids.has(task.id)) continue;
    for (const dep of task.dependsOn || []) {
      if (!ids.has(dep)) continue;
      rawEdges.push({ from: dep, to: task.id });
    }
  }
  const connections = transitiveReduce(rawEdges).map((edge, index) => {
    const row = { id: `e${index + 1}`, from: edge.from, to: edge.to };
    const from = posById.get(edge.from);
    const to = posById.get(edge.to);
    if (opts.sides === false || !from || !to) return row;
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    if (Math.abs(dx) >= 40) {
      row.fromSide = dx > 0 ? "right" : "left";
      row.toSide = dx > 0 ? "left" : "right";
    } else {
      row.fromSide = dy >= 0 ? "bottom" : "top";
      row.toSide = dy >= 0 ? "top" : "bottom";
    }
    return row;
  });
  return {
    schema_version: 1,
    diagram_type: "architecture",
    meta: { title, quality_profile: "standard" },
    components,
    connections,
    boundaries: [],
    cards: [],
  };
}
