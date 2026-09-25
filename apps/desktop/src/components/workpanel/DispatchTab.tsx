import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { loadArchitectureHtml } from "../../lib/delivery-architecture";
import { clearVisualDesignMark, offerVisualDecision } from "../../lib/delivery-visual";
import { assignDeliveryWorkers, deliveryDispatchPrompt, isPublishTask, withPublishTask } from "../../lib/delivery-dispatch.ts";
import { loadDeployCredentialFlags } from "../../lib/deploy-credentials";
import { deployHostChoices } from "../../lib/deploy-hosts";
import { toolWorkPanelTab } from "../../lib/work-panel-tabs";
import {
  clearDispatchSplitMark,
  recordDispatchProgress,
  redecomposeDispatch,
  refreshDispatchGraphProgress,
  renderDispatchGraph,
} from "../../lib/delivery-dispatch-chat.ts";
import {
  annotateParallelTasks,
  progressFromToolMessages,
  releaseWave,
  resolveDispatchStatuses,
} from "../../lib/delivery-dispatch-plan.mjs";
import {
  baselineIsValid,
  dispatchExecutionLocked,
  markDeliveryBuilding,
  normalizeDeliveryDeployTarget,
  noteDeliveryPreviewUrl,
  noteDispatchRelease,
  openDeliveryChange,
  setDeliveryDeployTarget,
  setDeliveryDispatchGraph,
  peekDelivery,
  setDeliveryDispatchPlan,
  signDeliveryBaseline,
  type DeliveryDeployTarget,
} from "../../lib/delivery-desk";
import { deliveryProjectPath, useDeliveryDesk } from "../../lib/use-delivery-desk";
import { useAppStore } from "../../stores/app-store";
import { ArchitectureMount } from "./ArchitectureMount";

function hostLabelKey(id: DeliveryDeployTarget): string {
  if (id === "none") return "panel.dispatch.hostNone";
  if (id === "github-pages") return "panel.dispatch.hostPages";
  if (id === "cloudflare") return "settings.deploy.cloudflare";
  if (id === "aliyun") return "settings.deploy.aliyun";
  return "settings.deploy.aws";
}

type ProgressTask = { id: string; title: string; workerId: string };
type RunStatus = "done" | "running" | "waiting";

function taskStatus(statuses: Map<string, RunStatus>, id: string): RunStatus {
  return statuses.get(id.toUpperCase()) ?? "waiting";
}

function DispatchProgress({
  tasks,
  statuses,
}: {
  tasks: ProgressTask[];
  statuses: Map<string, RunStatus>;
}) {
  const { t } = useTranslation();
  const done = tasks.filter((task) => taskStatus(statuses, task.id) === "done").length;
  const total = tasks.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const current = tasks
    .filter((task) => taskStatus(statuses, task.id) === "running")
    .map((task) => task.title)
    .join(" · ");
  const lanes = [...new Set(tasks.map((task) => task.workerId))];
  return (
    <aside className="dispatch-progress" aria-label={t("panel.dispatch.progressTitle")}>
      <p className="architecture-title">{t("panel.dispatch.progressTitle")}</p>
      <p className="dispatch-progress-summary">
        {current
          ? t("panel.dispatch.progressSummary", { done, total, current })
          : t("panel.dispatch.progressCount", { done, total })}
      </p>
      <div
        className="dispatch-progress-meter"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div style={{ width: `${pct}%` }} />
      </div>
      {lanes.length > 1
        ? lanes.map((workerId) => (
            <section key={workerId} className="dispatch-progress-lane">
              <p className="dispatch-progress-lane-title">{t("panel.dispatch.workerLane", { id: workerId })}</p>
              <ProgressList tasks={tasks.filter((task) => task.workerId === workerId)} statuses={statuses} />
            </section>
          ))
        : <ProgressList tasks={tasks} statuses={statuses} />}
    </aside>
  );
}

function ProgressList({
  tasks,
  statuses,
}: {
  tasks: ProgressTask[];
  statuses: Map<string, RunStatus>;
}) {
  const { t } = useTranslation();
  return (
    <ul className="dispatch-progress-tasks">
      {tasks.map((task) => {
        const status = taskStatus(statuses, task.id);
        const label =
          status === "done"
            ? t("panel.dispatch.statusDone")
            : status === "running"
              ? t("panel.dispatch.statusRunning")
              : t("panel.dispatch.statusWaiting");
        return (
          <li key={task.id} data-status={status}>
            <span className="mark">{status === "done" ? "✓" : "·"}</span>
            <span className="dispatch-progress-text">{task.id} {task.title}</span>
            <span className="dispatch-progress-state">{label}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function DispatchTab() {
  const { t } = useTranslation();
  const sendPrompt = useAppStore((state) => state.sendPrompt);
  const messages = useAppStore((state) => state.messages);
  const path = useAppStore(deliveryProjectPath);
  const shown = useDeliveryDesk(path);
  const plan = shown?.dispatchPlan ?? null;
  const [workers, setWorkers] = useState<number | null>(null);
  const [signer, setSigner] = useState("");
  const [changeReason, setChangeReason] = useState("");
  const [buildingGraph, setBuildingGraph] = useState(false);
  const [graphError, setGraphError] = useState("");
  const [graphHtml, setGraphHtml] = useState<string | null>(null);
  const recommended = plan?.workers ?? 1;
  const count = Math.max(1, Math.min(4, workers ?? recommended));
  const target = normalizeDeliveryDeployTarget(shown?.deployTarget);
  const [hosts, setHosts] = useState<DeliveryDeployTarget[]>(["none", "github-pages"]);
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void loadDeployCredentialFlags()
        .then((flags) => {
          if (!cancelled) setHosts(deployHostChoices(flags));
        })
        .catch(() => undefined);
    };
    load();
    window.addEventListener("duaer-deploy", load);
    return () => {
      cancelled = true;
      window.removeEventListener("duaer-deploy", load);
    };
  }, []);
  const building = shown?.stage === "building";
  const executionLocked = dispatchExecutionLocked(shown);
  const tasks = useMemo(() => {
    const base = plan?.tasks ?? [];
    const source = building ? base : withPublishTask(base, target);
    return assignDeliveryWorkers(source, count);
  }, [building, count, plan, target]);
  const annotated = useMemo(() => annotateParallelTasks(tasks), [tasks]);
  const signed = shown ? baselineIsValid(shown.baseline, shown.modules) : false;
  const publishMissing = !building && target !== "none" && !(plan?.tasks ?? []).some(isPublishTask);
  const graphKey = workers == null && !publishMissing ? plan?.graphKey : undefined;
  useEffect(() => {
    if (!path || !building) return;
    const hit = [...messages].reverse().find((message) => /预览地址：\s*https?:\/\//.test(message.content ?? ""));
    const url = hit?.content?.match(/预览地址：\s*(https?:\/\/\S+)/)?.[1];
    if (url) noteDeliveryPreviewUrl(path, url);
  }, [building, messages, path]);
  const progress = useMemo(() => {
    if (!building) return null;
    const tool = progressFromToolMessages(messages, tasks.map((task) => task.id));
    const doneIds = [...new Set([
      ...tool.doneIds,
      ...(plan?.tasks ?? []).filter((task) => task.status === "done").map((task) => task.id),
    ])];
    return { live: true, doneIds, runningIds: tool.runningIds };
  }, [building, messages, plan?.tasks, tasks]);
  const statuses = useMemo(
    () => (progress ? resolveDispatchStatuses(tasks, progress, shown?.modules) : new Map<string, "done" | "running" | "waiting">()),
    [progress, shown?.modules, tasks],
  );

  useEffect(() => {
    if (!building || !path || !graphKey) return;
    recordDispatchProgress(path);
    void refreshDispatchGraphProgress(path);
  }, [building, graphKey, messages, path]);

  const turnRunning = useAppStore((state) => state.isRunning);
  useEffect(() => {
    if (!path || shown?.architecture.status !== "confirmed" || plan || turnRunning) return;
    offerVisualDecision(path);
  }, [path, plan, shown, turnRunning]);

  useEffect(() => {
    if (!graphKey) {
      setGraphHtml(null);
      return;
    }
    let cancelled = false;
    void loadArchitectureHtml(graphKey).then((html) => {
      if (!cancelled) setGraphHtml(html);
    });
    return () => {
      cancelled = true;
    };
  }, [graphKey]);

  if (!path) return <p className="requirements-empty">{t("panel.requirements.empty")}</p>;
  if (!shown || (shown.architecture.status !== "confirmed" && shown.intake?.kind !== "bug")) {
    return <p className="requirements-empty">{t("panel.dispatch.needArchitecture")}</p>;
  }

  const signedAt = shown.baseline.signedAt?.replace("T", " ").slice(0, 19) ?? "";
  const graphLocked = Boolean(graphKey) && !buildingGraph;

  const pickWorkers = (next: number) => {
    if (next === count) return;
    setWorkers(next);
    setGraphError("");
    setDeliveryDispatchGraph(path, "");
  };

  const onDrawGraph = async () => {
    if (buildingGraph || graphLocked) return;
    setBuildingGraph(true);
    setGraphError("");
    try {
      const ok = await renderDispatchGraph(path, count);
      if (!ok) setGraphError(t("panel.dispatch.graphFail", { msg: "" }));
      else setWorkers(null);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setGraphError(t("panel.dispatch.graphFail", { msg }));
    } finally {
      setBuildingGraph(false);
    }
  };

  return (
    <div className={building ? "requirements-panel dispatch-with-progress" : "requirements-panel"}>
      <div className="dispatch-main">
      <div className="dispatch-decompose-head">
        <p className="architecture-title">{t("panel.dispatch.decomposeTitle")}</p>
        <button
          type="button"
          className="architecture-btn"
          onClick={() => void redecomposeDispatch(path)}
        >
          {t("panel.dispatch.redecompose")}
        </button>
      </div>
      <p className="requirements-hint">{t("panel.dispatch.hint")}</p>
      {plan?.rationale ? <p className="requirements-hint">{plan.rationale}</p> : null}
      {plan ? (
        <p className="requirements-hint">{t("panel.dispatch.recommend", { n: recommended })}</p>
      ) : (
        <p className="requirements-hint">{t("panel.dispatch.splitting")}</p>
      )}
      {plan ? (
        <>
          <ul className="dispatch-task-list">
            {annotated.map((task) => (
              <li key={task.id}>
                <span className="dispatch-task-id">{task.id}</span>
                <span className="dispatch-task-title">
                  {task.title}
                  {task.acceptance ? <span className="dispatch-task-acceptance">{task.acceptance}</span> : null}
                </span>
                {task.parallel ? <span className="dispatch-task-chip">{t("panel.dispatch.parallel")}</span> : null}
                {task.dependsOn.length ? (
                  <span className="dispatch-task-deps">← {task.dependsOn.join(", ")}</span>
                ) : null}
                <span className="dispatch-task-deps">{task.workerId}</span>
              </li>
            ))}
          </ul>
          <div className="dispatch-host-row">
            <span className="dispatch-host-label">{t("panel.dispatch.host")}</span>
            <div className="dispatch-worker-list" role="radiogroup" aria-label={t("panel.dispatch.host")}>
              {hosts.map((id) => (
                <button
                  key={id}
                  type="button"
                  className="dispatch-worker-chip dispatch-host-chip"
                  aria-pressed={id === target}
                  disabled={building}
                  onClick={() => path && setDeliveryDeployTarget(path, id)}
                >
                  {t(hostLabelKey(id))}
                </button>
              ))}
            </div>
            {shown?.previewUrl ? (
              <a className="dispatch-preview" href={shown.previewUrl} target="_blank" rel="noreferrer">
                {shown.previewUrl}
              </a>
            ) : null}
          </div>
          <div className="dispatch-worker-list" role="radiogroup" aria-label={t("panel.dispatch.workers")}>
            {[1, 2, 3, 4].map((n) => {
              const label = n === 1 ? t("panel.dispatch.workerSerial") : t("panel.dispatch.workerParallel");
              const marked = n === recommended ? `${label} · ★` : label;
              return (
                <button
                  key={n}
                  type="button"
                  className="dispatch-worker-chip"
                  aria-pressed={n === count}
                  disabled={buildingGraph || graphLocked}
                  onClick={() => pickWorkers(n)}
                >
                  <span>{n}</span>
                  <span>{marked}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="requirements-confirm"
            disabled={buildingGraph || graphLocked}
            onClick={() => void onDrawGraph()}
          >
            {buildingGraph
              ? t("panel.dispatch.graphBuilding")
              : graphLocked
                ? t("panel.dispatch.graphReady")
                : t("panel.dispatch.confirmGraph")}
          </button>
          {graphError ? <p className="requirements-hint">{graphError}</p> : null}
          {graphKey ? (
            <div className="dispatch-graph">
              <ArchitectureMount
                key={`${graphKey}-frame`}
                html={graphHtml}
                diagramKey={graphKey}
                straighten
                emptyLabel={t("panel.dispatch.graphBuilding")}
                aria-label={t("panel.dispatch.graphTitle")}
              />
            </div>
          ) : null}
        </>
      ) : null}

      <p className="requirements-hint">{t("panel.baseline.mark")}</p>
      <p className="requirements-hint">{t("panel.baseline.hint")}</p>
      {signed ? (
        <>
          <p className="requirements-hint">
            {t("panel.baseline.signedLine", { signer: shown.baseline.signer, at: signedAt })}
          </p>
          <label className="requirements-field">
            <span>{t("panel.baseline.changeReason")}</span>
            <textarea
              rows={2}
              value={changeReason}
              placeholder={t("panel.baseline.changePh")}
              onChange={(event) => setChangeReason(event.target.value)}
            />
          </label>
          <div className="dispatch-action-row">
            <button
              type="button"
              className="requirements-add"
              disabled={!changeReason.trim()}
              onClick={() => {
                if (openDeliveryChange(path, changeReason)) {
                  clearDispatchSplitMark(path);
                  clearVisualDesignMark(path);
                  setChangeReason("");
                }
              }}
            >
              {t("panel.baseline.change")}
            </button>
            {plan ? (
              <button
                type="button"
                className="requirements-confirm"
                disabled={!graphKey || tasks.length === 0 || executionLocked}
                onClick={() => {
                  if (dispatchExecutionLocked(peekDelivery(path))) return;
                  const outbound = assignDeliveryWorkers(
                    withPublishTask(plan.tasks, target),
                    count,
                  );
                  setDeliveryDispatchPlan(path, {
                    workers: count,
                    rationale: plan.rationale,
                    graphKey: plan.graphKey,
                    releasedIds: plan.releasedIds,
                    tasks: outbound.map((task) => ({
                      ...task,
                      status: task.status === "done" ? "done" as const : "waiting" as const,
                    })),
                  });
                  const wave = releaseWave(outbound, shown.modules);
                  if (!wave.length) return;
                  noteDispatchRelease(path, wave.map((task) => task.id));
                  markDeliveryBuilding(path);
                  const stayOnDispatch = () => {
                    useAppStore.getState().openWorkPanelTab(toolWorkPanelTab("dispatch"));
                  };
                  void sendPrompt(
                    deliveryDispatchPrompt(shown, wave, count),
                  ).then(stayOnDispatch, stayOnDispatch);
                }}
              >
                {t("panel.dispatch.start")}
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <p className="requirements-hint">{t("panel.baseline.needSign")}</p>
          <label className="requirements-field">
            <span>{t("panel.baseline.signer")}</span>
            <input
              value={signer}
              placeholder={t("panel.baseline.signerPh")}
              onChange={(event) => setSigner(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="requirements-confirm"
            disabled={!signer.trim()}
            onClick={() => signDeliveryBaseline(path, signer)}
          >
            {t("panel.baseline.sign")}
          </button>
        </>
      )}
      {!signed && plan ? (
        <button
          type="button"
          className="requirements-confirm"
          disabled
        >
          {t("panel.dispatch.start")}
        </button>
      ) : null}
      </div>
      {building && plan ? <DispatchProgress tasks={annotated} statuses={statuses} /> : null}
    </div>
  );
}
