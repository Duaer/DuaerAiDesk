import i18n from "i18next";
import { useAppStore } from "../stores/app-store";
import { api } from "./api.ts";
import { DELIVERY_START_BUGFIX_ACTION, isDeliveryGateNote, parseDeliveryGateChoices } from "./delivery-chat.ts";
import { deliveryCardIssues } from "./delivery-card-check.ts";
import { appendDeliveryChatNote } from "./delivery-chat-note.ts";
import { assignDeliveryWorkers, deliveryDispatchPrompt, withPublishTask } from "./delivery-dispatch.ts";
import {
  bugfixSplitPrompt,
  dispatchSplitPrompt,
  extractDispatchPlan,
  progressFromToolMessages,
  releaseWave,
  resolveDispatchStatuses,
  taskGraphIr,
} from "./delivery-dispatch-plan.mjs";
import {
  clearDeliveryDispatchPlan,
  normalizeDeliveryDeployTarget,
  noteDispatchRelease,
  noteDispatchTaskDone,
  GLOBAL_MODULE_ID,
  peekDelivery,
  type DeliveryCard,
  setDeliveryDispatchGraph,
  setDeliveryDispatchPlan,
} from "./delivery-desk.ts";
import { toolWorkPanelTab } from "./work-panel-tabs.ts";

const splitSent = new Set<string>();
const offeredBugfix = new Set<string>();

function bugFactsReady(card: DeliveryCard): boolean {
  return deliveryCardIssues(card, "bug").length === 0;
}
const waveSends = new Set<string>();
const graphProgressFp = new Map<string, string>();
const graphProgressPending = new Set<string>();
let graphProgressFlight: Promise<void> | null = null;

function statusLabel(key: string, fallback: string): string {
  const value = i18n.t(key);
  if (!value || value === key) return fallback;
  return value;
}

function statusLabels() {
  return {
    done: statusLabel("panel.dispatch.statusDone", "已完成"),
    running: statusLabel("panel.dispatch.statusRunning", "进行中"),
    waiting: statusLabel("panel.dispatch.statusWaiting", "等待中"),
  };
}

export function clearDispatchSplitMark(projectPath: string): void {
  splitSent.delete(projectPath.trim());
}

/** After architecture confirm: open 派工 and ask the current chat to show the split. */
export async function beginDispatchSplit(projectPath: string): Promise<void> {
  const path = projectPath.trim();
  const desk = path ? peekDelivery(path) : null;
  if (!path || !desk || desk.architecture.status !== "confirmed" || desk.intake?.kind === "bug") return;
  useAppStore.getState().openWorkPanelTab(toolWorkPanelTab("dispatch"));
  if (desk.dispatchPlan?.tasks.length || splitSent.has(path)) return;
  splitSent.add(path);
  const snapshot = JSON.stringify({
    modules: desk.modules
      .filter((module) => module.status === "confirmed")
      .map((module) => ({
        id: module.id,
        title: module.title,
        dependsOn: module.dependsOn,
        goal: module.card.goal,
        acceptance: module.card.acceptance,
      })),
    architecture: {
      summary: desk.architecture.summary,
      components: desk.architecture.components,
    },
  });
  await useAppStore.getState().sendPrompt(
    dispatchSplitPrompt(i18n.t("panel.dispatch.splitNote"), snapshot),
  );
}

/** Bug lane: open 派工 and ask for fix tasks. No architecture. */
export async function beginBugfixSplit(projectPath: string): Promise<void> {
  const path = projectPath.trim();
  const desk = path ? peekDelivery(path) : null;
  if (!path || !desk || desk.intake?.kind !== "bug") return;
  useAppStore.getState().openWorkPanelTab(toolWorkPanelTab("dispatch"));
  if (desk.dispatchPlan?.tasks.length || splitSent.has(path)) return;
  splitSent.add(path);
  const global = desk.modules.find((module) => module.id === GLOBAL_MODULE_ID);
  const snapshot = JSON.stringify({
    goal: global?.card.goal ?? "",
    acceptance: global?.card.acceptance ?? "",
    assumptions: global?.card.assumptions ?? "",
  });
  await useAppStore.getState().sendPrompt(
    bugfixSplitPrompt(i18n.t("panel.requirements.bugfixSplitNote"), snapshot),
  );
}

export async function startBugfixFromChat(): Promise<void> {
  const path = useAppStore.getState().sessions
    .find((session) => session.id === useAppStore.getState().activeSessionId)
    ?.projectPath
    || useAppStore.getState().activeProjectPath
    || "";
  const key = path.trim();
  if (!key) return;
  splitSent.delete(key);
  await beginBugfixSplit(key);
}

export function offerBugfixDecision(projectPath: string): void {
  const path = projectPath.trim();
  const state = useAppStore.getState();
  if (!path || state.isRunning) return;
  const desk = peekDelivery(path);
  if (!desk || desk.intake?.kind !== "bug" || desk.dispatchPlan?.tasks.length) return;
  const global = desk.modules.find((module) => module.id === GLOBAL_MODULE_ID);
  if (!global || !bugFactsReady(global.card)) return;
  const key = `${path}\0${global.card.goal}\0${global.card.acceptance}\0${global.card.assumptions}`;
  if (offeredBugfix.has(key)) return;
  const last = state.messages.at(-1);
  if (last && parseDeliveryGateChoices(last.content || "").includes(DELIVERY_START_BUGFIX_ACTION)) {
    offeredBugfix.add(key);
    return;
  }
  offeredBugfix.add(key);
  appendDeliveryChatNote(i18n.t("panel.requirements.bugfixDecideNote"), {
    choices: [DELIVERY_START_BUGFIX_ACTION],
  });
}

/** Store the task list from the split reply. Thinking stays in the transcript. */
export function maybeApplyDispatchSplitFromReply(projectPath: string, reply: string): boolean {
  const path = projectPath.trim();
  if (!path || isDeliveryGateNote(reply)) return false;
  const desk = peekDelivery(path);
  if (!desk || (desk.architecture.status !== "confirmed" && desk.intake?.kind !== "bug")) return false;
  const plan = extractDispatchPlan(reply);
  if (!plan) return false;
  setDeliveryDispatchPlan(path, {
    ...plan,
    tasks: plan.tasks.map((task) => ({ ...task, status: "waiting" as const })),
  });
  return true;
}

/** Ask the current chat to split again. Clears the desk list and the派工图. */
export async function redecomposeDispatch(projectPath: string): Promise<void> {
  const path = projectPath.trim();
  if (!path) return;
  clearDispatchSplitMark(path);
  clearDispatchGraphProgress(path);
  clearDeliveryDispatchPlan(path);
  await beginDispatchSplit(path);
}

/** Drop the last painted status so the next run recolors the graph. */
export function clearDispatchGraphProgress(projectPath: string): void {
  graphProgressFp.delete(projectPath.trim());
}

/** Confirm the worker count and render the task graph the way the live desk does. */
export async function renderDispatchGraph(projectPath: string, workerCount: number): Promise<boolean> {
  clearDispatchGraphProgress(projectPath);
  const path = projectPath.trim();
  const desk = path ? peekDelivery(path) : null;
  const plan = desk?.dispatchPlan;
  if (!path || !desk || !plan?.tasks.length) return false;
  const count = Math.max(1, Math.min(4, workerCount || plan.workers || 1));
  const tasks = assignDeliveryWorkers(
    withPublishTask(plan.tasks, normalizeDeliveryDeployTarget(desk.deployTarget)),
    count,
  );
  setDeliveryDispatchPlan(path, {
    workers: count,
    rationale: plan.rationale,
    tasks: tasks.map((task) => ({
      ...task,
      status: task.status === "done" ? "done" as const : "waiting" as const,
    })),
  });
  const ir = taskGraphIr(tasks, {
    title: i18n.t("panel.dispatch.graphTitle"),
    workerCount: count,
  });
  if (!ir) return false;
  let rendered;
  try {
    rendered = await api.renderDeliveryArchitecture({ ir });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/layout validation/i.test(message)) throw error;
    const plain = taskGraphIr(tasks, {
      title: i18n.t("panel.dispatch.graphTitle"),
      workerCount: count,
      sides: false,
    });
    if (!plain) throw error;
    rendered = await api.renderDeliveryArchitecture({ ir: plain });
  }
  setDeliveryDispatchGraph(path, rendered.key);
  return true;
}

function dispatchGraphIr(
  tasks: Parameters<typeof taskGraphIr>[0],
  workerCount: number,
  progress: { live: true; doneIds: string[]; runningIds: string[]; color?: boolean; label?: boolean },
  labels: { done: string; running: string; waiting: string },
  modules: Array<{ id: string; dependsOn: string[] }>,
) {
  return taskGraphIr(tasks, {
    title: statusLabel("panel.dispatch.graphTitle", "任务执行路径"),
    workerCount,
    progress,
    statusLabels: labels,
    modules,
  });
}

/** Write Task successes onto the dispatch ledger. Done stays done. */
export function recordDispatchProgress(projectPath: string): void {
  const path = projectPath.trim();
  const desk = path ? peekDelivery(path) : null;
  const plan = desk?.dispatchPlan;
  if (!path || !plan?.tasks.length) return;
  const tool = progressFromToolMessages(
    useAppStore.getState().messages,
    plan.tasks.map((task) => task.id),
  );
  noteDispatchTaskDone(path, tool.doneIds);
}

/**
 * After the chat is idle, release the next ready task per worker.
 * A wave that is still open is not sent again.
 */
export async function advanceDispatchWave(projectPath: string): Promise<void> {
  const path = projectPath.trim();
  const state = useAppStore.getState();
  if (!path || state.isRunning) return;
  recordDispatchProgress(path);
  const desk = peekDelivery(path);
  const plan = desk?.dispatchPlan;
  if (!desk || desk.stage !== "building" || !plan?.tasks.length) return;
  const byId = new Map(plan.tasks.map((task) => [task.id.toUpperCase(), task]));
  const released = plan.releasedIds ?? [];
  const open = released.filter((id) => byId.get(id.toUpperCase())?.status !== "done");
  if (released.length > 0 && open.length > 0) return;
  const wave = releaseWave(plan.tasks, desk.modules);
  if (!wave.length) return;
  const key = `${path}\0${wave.map((task) => task.id).join(",")}`;
  if (waveSends.has(key)) return;
  waveSends.add(key);
  noteDispatchRelease(path, wave.map((task) => task.id));
  const fresh = peekDelivery(path);
  if (!fresh) return;
  await state.sendPrompt(deliveryDispatchPrompt(fresh, wave, plan.workers));
}

/** Recolor the dispatch graph from Task tool rows. Skips an unchanged status fingerprint. */
export async function refreshDispatchGraphProgress(projectPath: string): Promise<void> {
  const path = projectPath.trim();
  const desk = path ? peekDelivery(path) : null;
  const plan = desk?.dispatchPlan;
  if (!path || desk?.stage !== "building" || !plan?.graphKey || !plan.tasks.length) return;
  if (graphProgressFlight) {
    graphProgressPending.add(path);
    return;
  }
  const tool = progressFromToolMessages(
    useAppStore.getState().messages,
    plan.tasks.map((task) => task.id),
  );
  const doneIds = [...new Set([
    ...tool.doneIds,
    ...plan.tasks.filter((task) => task.status === "done").map((task) => task.id),
  ])];
  const progress = { live: true as const, doneIds, runningIds: tool.runningIds };
  const statuses = resolveDispatchStatuses(plan.tasks, progress, desk.modules);
  const labels = statusLabels();
  const fp = `${labels.done}/${labels.running}/${labels.waiting}|${[...statuses.entries()].map(([id, status]) => `${id}:${status}`).join("|")}`;
  if (graphProgressFp.get(path) === fp) return;
  const tinted = dispatchGraphIr(plan.tasks, plan.workers, { ...progress, label: false }, labels, desk.modules);
  if (!tinted) return;
  graphProgressFp.set(path, fp);
  graphProgressFlight = (async () => {
    try {
      let rendered;
      try {
        rendered = await api.renderDeliveryArchitecture({ ir: tinted });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/layout validation/i.test(message)) throw error;
        const tagged = dispatchGraphIr(
          plan.tasks,
          plan.workers,
          { ...progress, color: false, label: false },
          labels,
          desk.modules,
        );
        if (!tagged) throw error;
        rendered = await api.renderDeliveryArchitecture({ ir: tagged });
      }
      setDeliveryDispatchGraph(path, rendered.key);
    } catch {
      // Keep the fingerprint so the same statuses do not spawn Archify again.
    } finally {
      graphProgressFlight = null;
      if (graphProgressPending.delete(path)) void refreshDispatchGraphProgress(path);
    }
  })();
  await graphProgressFlight;
}
