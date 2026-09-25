import type { DeliveryIntakeKind } from "@duaer-ai-desk/shared";
import { deliveryCardIssues, SHARED_BASELINE_FIELDS } from "./delivery-card-check.ts";

export type DeliveryIntake = {
  kind: DeliveryIntakeKind;
  reason: string;
};

export type DeliveryStage =
  | "drafting"
  | "confirming"
  | "building"
  | "delivered"
  | "revising";

export type DeliveryCardField =
  | "goal"
  | "outOfScope"
  | "acceptance"
  | "assumptions"
  | "style"
  | "layout"
  | "deviceMatrix"
  | "criticalPaths"
  | "exceptionCases"
  | "apiContract"
  | "envChecklist"
  | "dataPrecheck"
  | "externalDeps"
  | "perfBudget";

export type DeliveryCard = Record<DeliveryCardField, string>;

/** Overall style, layout, and shared baselines. Shown first; stored after feature modules. */
export const GLOBAL_MODULE_ID = "global";

export type DeliveryIteration = {
  at: string;
  summary: string;
};

export type DeliveryModule = {
  id: string;
  title: string;
  status: "draft" | "confirmed";
  card: DeliveryCard;
  dependsOn: string[];
};

export type DeliveryComponent = {
  id: string;
  name: string;
  responsibility: string;
};

export type DeliveryArchitecture = {
  status: "draft" | "confirmed";
  summary: string;
  components: DeliveryComponent[];
  /** Archify HTML key under userData/architecture (tt-a1i Archify pipeline). */
  diagramKey?: string;
};

export type DeliveryBaselineChange = {
  at: string;
  signer: string;
  reason: string;
  fingerprint: string;
};

export type DeliveryBaseline = {
  signedAt: string | null;
  signer: string;
  fingerprint: string;
  changes: DeliveryBaselineChange[];
};

export type DeliveryTaskRunStatus = "waiting" | "running" | "done";

export type DeliveryDispatchTask = {
  id: string;
  title: string;
  role: "implement" | "verify-l3" | "deploy";
  workerId: string;
  moduleId: string | null;
  /** Pass/fail text that closes this atomic task. */
  acceptance: string;
  dependsOn: string[];
  /** Durable ledger. Done stays done if a later split repeats the same id. */
  status: DeliveryTaskRunStatus;
};

/** Task list taken from the chat split turn. The panel does not invent a second list. */
export type DeliveryDispatchPlan = {
  workers: number;
  rationale: string;
  tasks: DeliveryDispatchTask[];
  /** Archify HTML key for the task-execution graph. */
  graphKey?: string;
  /** Ids released in the current wave. The app does not release again until these are done. */
  releasedIds?: string[];
};

/** Where this round is published. Cloud hosts stay hidden until their keys are saved. */
export const DELIVERY_DEPLOY_TARGETS = ["none", "github-pages", "cloudflare", "aliyun", "aws"] as const;
export type DeliveryDeployTarget = (typeof DELIVERY_DEPLOY_TARGETS)[number];

export function normalizeDeliveryDeployTarget(value: unknown): DeliveryDeployTarget {
  return (DELIVERY_DEPLOY_TARGETS as readonly string[]).includes(String(value))
    ? (value as DeliveryDeployTarget)
    : "github-pages";
}

/** One improvement round. The locked confirm cards stay as they are. */
export type DeliveryRevision = {
  scope: "module" | "overall";
  moduleId: string;
  goal: string;
  outOfScope: string;
  acceptance: string;
  assumptions: string;
};

export type DeliveryDesk = {
  stage: DeliveryStage;
  activeModuleId: string;
  modules: DeliveryModule[];
  architecture: DeliveryArchitecture;
  background: string;
  /** Kickoff plus later rounds. Older desks seed one point from background. */
  iterations: DeliveryIteration[];
  /** Folder already had product files at kickoff. Same cards, as-is fill. */
  existingProject: boolean;
  baseline: DeliveryBaseline;
  dispatchPlan: DeliveryDispatchPlan | null;
  deployTarget: DeliveryDeployTarget;
  previewUrl: string;
  revision: DeliveryRevision | null;
  /** Set once from the first new ask. Null until the judge classifies it. */
  intake: DeliveryIntake | null;
};

const STORAGE_KEY = "duaer.desk.delivery.v1";

function normalizeProjectPath(projectPath?: string | null): string | null {
  const value = projectPath?.trim();
  if (!value) return null;
  let normalized = value.replace(/\\/g, "/");
  if (/^\/\/\?\/[A-Za-z]:\//.test(normalized)) normalized = normalized.slice(4);
  normalized = normalized.replace(/(?<![A-Za-z]:)\/+$/, "");
  return normalized || "/";
}

const listeners = new Set<() => void>();
const desks = new Map<string, DeliveryDesk>();
let hydrated = false;

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeDelivery(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function storage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

function blankCard(): DeliveryCard {
  return {
    goal: "",
    outOfScope: "",
    acceptance: "",
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
}

function createModule(index: number): DeliveryModule {
  return {
    id: `m${index}`,
    title: "",
    status: "draft",
    card: blankCard(),
    dependsOn: [],
  };
}

function createGlobalModule(): DeliveryModule {
  return {
    id: GLOBAL_MODULE_ID,
    title: "",
    status: "draft",
    card: blankCard(),
    dependsOn: [],
  };
}

/** Keep the global card on every desk, after feature modules so existing indexes stay stable. */
export function withGlobalModule(modules: DeliveryModule[]): DeliveryModule[] {
  const found = modules.find((module) => module.id === GLOBAL_MODULE_ID);
  const global = found ?? createGlobalModule();
  return [...modules.filter((module) => module.id !== GLOBAL_MODULE_ID), global];
}

function featureModules(modules: DeliveryModule[]): DeliveryModule[] {
  return modules.filter((module) => module.id !== GLOBAL_MODULE_ID);
}

function blankArchitecture(): DeliveryArchitecture {
  return { status: "draft", summary: "", components: [] };
}

export function emptyBaseline(): DeliveryBaseline {
  return { signedAt: null, signer: "", fingerprint: "", changes: [] };
}

function clipBaseline(raw: unknown): DeliveryBaseline {
  if (!raw || typeof raw !== "object") return emptyBaseline();
  const value = raw as Partial<DeliveryBaseline>;
  const changes = Array.isArray(value.changes)
    ? value.changes.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const change = item as Partial<DeliveryBaselineChange>;
        const reason = asText(change.reason).slice(0, 2000);
        if (!reason) return [];
        return [{
          at: asText(change.at).slice(0, 40),
          signer: asText(change.signer).slice(0, 120),
          reason,
          fingerprint: asText(change.fingerprint).slice(0, 16000),
        }];
      }).slice(0, 40)
    : [];
  return {
    signedAt: value.signedAt ? asText(value.signedAt).slice(0, 40) : null,
    signer: asText(value.signer).trim().slice(0, 120),
    fingerprint: asText(value.fingerprint).slice(0, 16000),
    changes,
  };
}

/** Stable fingerprint of confirmed module cards, including the eight baseline fields. */
export function baselineFingerprint(modules: DeliveryModule[]): string {
  const confirmed = modules
    .filter((module) => module.status === "confirmed")
    .map((module) => ({
      id: module.id,
      goal: module.card.goal.trim(),
      outOfScope: module.card.outOfScope.trim(),
      acceptance: module.card.acceptance.trim(),
      assumptions: module.card.assumptions.trim(),
      deviceMatrix: module.card.deviceMatrix.trim(),
      criticalPaths: module.card.criticalPaths.trim(),
      exceptionCases: module.card.exceptionCases.trim(),
      apiContract: module.card.apiContract.trim(),
      envChecklist: module.card.envChecklist.trim(),
      dataPrecheck: module.card.dataPrecheck.trim(),
      externalDeps: module.card.externalDeps.trim(),
      perfBudget: module.card.perfBudget.trim(),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify(confirmed);
}

export function baselineIsValid(baseline: DeliveryBaseline, modules: DeliveryModule[]): boolean {
  const current = clipBaseline(baseline);
  if (!current.signedAt || !current.signer) return false;
  const fingerprint = baselineFingerprint(modules);
  return fingerprint !== "[]" && current.fingerprint === fingerprint;
}

function clipLine(text: string): string {
  const line = text.trim().split("\n")[0] ?? "";
  return line.length > 42 ? `${line.slice(0, 42)}…` : line;
}

function normalizeArchitecture(value: unknown): DeliveryArchitecture {
  const raw = value && typeof value === "object" ? (value as Partial<DeliveryArchitecture>) : {};
  const components = Array.isArray(raw.components)
    ? raw.components.flatMap((item, index) => {
        if (!item || typeof item !== "object") return [];
        const component = item as Partial<DeliveryComponent>;
        return [{
          id: typeof component.id === "string" && component.id.trim() ? component.id : `c${index + 1}`,
          name: asText(component.name),
          responsibility: asText(component.responsibility),
        }];
      })
    : [];
  return {
    status: raw.status === "confirmed" ? "confirmed" : "draft",
    summary: asText(raw.summary),
    components,
    diagramKey: asText(raw.diagramKey).trim() || undefined,
  };
}

function withSeededArchitecture(desk: DeliveryDesk): DeliveryDesk {
  if (desk.architecture.status === "confirmed" || desk.architecture.components.length > 0) return desk;
  if (!desk.modules.every((module) => module.status === "confirmed")) return desk;
  const confirmed = featureModules(desk.modules);
  return {
    ...desk,
    architecture: {
      ...desk.architecture,
      components: confirmed.map((module, index) => ({
        id: `c${index + 1}`,
        name: module.title.trim() || clipLine(module.card.goal),
        responsibility: module.card.goal.trim(),
      })),
    },
  };
}

export function emptyDeliveryDesk(): DeliveryDesk {
  const first = createModule(1);
  return {
    stage: "drafting",
    activeModuleId: GLOBAL_MODULE_ID,
    modules: withGlobalModule([first]),
    architecture: blankArchitecture(),
    background: "",
    iterations: [],
    existingProject: false,
    baseline: emptyBaseline(),
    dispatchPlan: null,
    deployTarget: "github-pages",
    previewUrl: "",
    revision: null,
    intake: null,
  };
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeDispatchPlan(value: unknown): DeliveryDispatchPlan | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<DeliveryDispatchPlan>;
  const tasks = Array.isArray(raw.tasks)
    ? raw.tasks.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const task = item as Partial<DeliveryDispatchTask>;
        const id = asText(task.id).trim();
        const title = asText(task.title).trim();
        if (!id || !title) return [];
        const role: DeliveryDispatchTask["role"] =
          task.role === "verify-l3" || task.role === "deploy" ? task.role : "implement";
        const worker = asText(task.workerId).trim();
        const moduleId = asText(task.moduleId).trim();
        const row: DeliveryDispatchTask = {
          id: id.slice(0, 16),
          title: title.slice(0, 200),
          role,
          workerId: /^w[1-4]$/.test(worker) ? worker : "w1",
          moduleId: moduleId ? moduleId.slice(0, 40) : null,
          acceptance: asText(task.acceptance).trim().slice(0, 500),
          dependsOn: Array.isArray(task.dependsOn)
            ? task.dependsOn.filter((dep): dep is string => typeof dep === "string").map((dep) => dep.trim()).filter(Boolean).slice(0, 12)
            : [],
          status: task.status === "done" ? "done" : "waiting",
        };
        return [row];
      }).slice(0, 40)
    : [];
  if (!tasks.length) return null;
  const workers = Math.max(1, Math.min(4, Number(raw.workers) || 1));
  const graphKey = asText(raw.graphKey).trim();
  const releasedIds = Array.isArray(raw.releasedIds)
    ? raw.releasedIds.filter((id): id is string => typeof id === "string").map((id) => id.trim()).filter(Boolean).slice(0, 40)
    : [];
  return {
    workers,
    rationale: asText(raw.rationale).trim().slice(0, 500),
    tasks,
    graphKey: graphKey || undefined,
    releasedIds: releasedIds.length ? releasedIds : undefined,
  };
}

function normalizeIterations(value: unknown, background: string): DeliveryIteration[] {
  const rows = Array.isArray(value)
    ? value.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const row = item as Partial<DeliveryIteration>;
        const summary = asText(row.summary).trim().slice(0, 500);
        if (!summary) return [];
        return [{ at: asText(row.at).slice(0, 40), summary }];
      }).slice(-40)
    : [];
  if (rows.length || !background.trim()) return rows;
  return [{ at: "", summary: background.trim().slice(0, 500) }];
}

function appendIteration(iterations: DeliveryIteration[], summary: string): DeliveryIteration[] {
  const text = summary.trim().slice(0, 500);
  if (!text) return iterations;
  const last = iterations[iterations.length - 1];
  if (!last) return [{ at: new Date().toISOString(), summary: text }];
  if (last.summary === text) return iterations;
  const lastAt = Date.parse(last.at);
  const recent = Number.isFinite(lastAt) && Date.now() - lastAt < 60_000;
  if (recent && (text.startsWith(last.summary) || last.summary.startsWith(text))) {
    return [...iterations.slice(0, -1), {
      at: last.at || new Date().toISOString(),
      summary: text.length >= last.summary.length ? text : last.summary,
    }];
  }
  return [...iterations, { at: new Date().toISOString(), summary: text }].slice(-40);
}

function normalizeDesk(value: unknown): DeliveryDesk {
  const raw = value && typeof value === "object" ? (value as Partial<DeliveryDesk>) : {};
  const modules = Array.isArray(raw.modules)
    ? raw.modules.flatMap((item, index) => {
        if (!item || typeof item !== "object") return [];
        const module = item as Partial<DeliveryModule>;
        const card = module.card && typeof module.card === "object" ? module.card : {};
        return [{
          id: typeof module.id === "string" && module.id.trim() ? module.id : `m${index + 1}`,
          title: asText(module.title),
          status: module.status === "confirmed" ? "confirmed" as const : "draft" as const,
          dependsOn: Array.isArray(module.dependsOn)
            ? module.dependsOn.filter((item): item is string => typeof item === "string").slice(0, 20)
            : [],
          card: {
            ...blankCard(),
            goal: asText((card as DeliveryCard).goal),
            outOfScope: asText((card as DeliveryCard).outOfScope),
            acceptance: asText((card as DeliveryCard).acceptance),
            assumptions: asText((card as DeliveryCard).assumptions),
            style: asText((card as DeliveryCard).style),
            layout: asText((card as DeliveryCard).layout),
            deviceMatrix: asText((card as DeliveryCard).deviceMatrix),
            criticalPaths: asText((card as DeliveryCard).criticalPaths),
            exceptionCases: asText((card as DeliveryCard).exceptionCases),
            apiContract: asText((card as DeliveryCard).apiContract),
            envChecklist: asText((card as DeliveryCard).envChecklist),
            dataPrecheck: asText((card as DeliveryCard).dataPrecheck),
            externalDeps: asText((card as DeliveryCard).externalDeps),
            perfBudget: asText((card as DeliveryCard).perfBudget),
          },
        }];
      })
    : [];
  const seeded = withGlobalModule(modules.length > 0 ? modules : emptyDeliveryDesk().modules);
  const background = asText(raw.background);
  const active = seeded.some((module) => module.id === raw.activeModuleId)
    ? String(raw.activeModuleId)
    : seeded[0].id;
  const stage = raw.stage;
  const kept: DeliveryStage | null =
    stage === "building" || stage === "delivered" || stage === "revising" ? stage : null;
  const next: Omit<DeliveryDesk, "stage"> & { stage: DeliveryStage } = {
    stage: kept ?? "drafting",
    activeModuleId: active,
    modules: seeded,
    architecture: normalizeArchitecture(raw.architecture),
    background,
    iterations: normalizeIterations(raw.iterations, background),
    existingProject: raw.existingProject === true,
    baseline: clipBaseline(raw.baseline),
    dispatchPlan: normalizeDispatchPlan(raw.dispatchPlan),
    deployTarget: normalizeDeliveryDeployTarget(raw.deployTarget),
    previewUrl: /^https?:\/\//.test(asText(raw.previewUrl).trim())
      ? asText(raw.previewUrl).trim().slice(0, 300)
      : "",
    revision: normalizeRevision(raw.revision),
    intake: normalizeIntake(raw.intake),
  };
  return { ...next, stage: kept ?? deriveStage(next) };
}

function normalizeRevision(value: unknown): DeliveryRevision | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<DeliveryRevision>;
  const moduleId = asText(raw.moduleId).trim().slice(0, 80);
  const scope = raw.scope === "module" || moduleId ? "module" as const : "overall" as const;
  const revision: DeliveryRevision = {
    scope: raw.scope === "overall" ? "overall" : scope,
    moduleId: raw.scope === "overall" ? "" : moduleId,
    goal: asText(raw.goal).trim().slice(0, 2000),
    outOfScope: asText(raw.outOfScope).trim().slice(0, 2000),
    acceptance: asText(raw.acceptance).trim().slice(0, 2000),
    assumptions: asText(raw.assumptions).trim().slice(0, 2000),
  };
  if (!revision.goal && !revision.outOfScope && !revision.acceptance && !revision.assumptions) {
    return null;
  }
  return revision;
}

export function deriveStage(desk: DeliveryDesk): DeliveryStage {
  if (desk.stage === "building" || desk.stage === "delivered" || desk.stage === "revising") {
    return desk.stage;
  }
  const started = desk.modules.some((module) =>
    module.status === "confirmed" ||
    Object.values(module.card).some((value) => value.trim()),
  );
  return started ? "confirming" : "drafting";
}

const INTAKE_KINDS = new Set<DeliveryIntakeKind>(["bug", "requirement", "both", "unclear"]);

function normalizeIntake(value: unknown): DeliveryIntake | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<DeliveryIntake>;
  if (!INTAKE_KINDS.has(raw.kind as DeliveryIntakeKind)) return null;
  return {
    kind: raw.kind as DeliveryIntakeKind,
    reason: asText(raw.reason).trim().slice(0, 200),
  };
}

export function moduleCanConfirm(
  module: DeliveryModule,
  kind?: DeliveryIntakeKind | null,
): boolean {
  const scope = kind === "bug"
    ? "bug"
    : module.id === GLOBAL_MODULE_ID
      ? "global"
      : "module";
  return module.status === "draft" && deliveryCardIssues(module.card, scope).length === 0;
}

export function setDeliveryIntake(projectPath: string, intake: DeliveryIntake): void {
  const key = normalizeProjectPath(projectPath);
  const desk = key ? peekDelivery(key) : null;
  if (!key || !desk) return;
  persist(key, { ...desk, intake });
}

export function updateDeliveryModuleTitle(projectPath: string, moduleId: string, title: string): void {
  const key = normalizeProjectPath(projectPath);
  const desk = key ? peekDelivery(key) : null;
  if (!key || !desk) return;
  persist(key, {
    ...desk,
    modules: desk.modules.map((module) => {
      if (module.id !== moduleId || module.status === "confirmed") return module;
      return { ...module, title };
    }),
  });
}

export function architectureCanConfirm(desk: DeliveryDesk): boolean {
  if (desk.architecture.status !== "draft") return false;
  if (!desk.modules.every((module) => module.status === "confirmed")) return false;
  if (desk.architecture.diagramKey?.trim()) {
    return Boolean(
      desk.architecture.summary.trim() ||
        desk.architecture.components.some((component) => component.name.trim()),
    );
  }
  if (!desk.architecture.summary.trim()) return false;
  return desk.architecture.components.some((component) =>
    component.name.trim() !== "" && component.responsibility.trim() !== "",
  );
}

function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  const raw = storage()?.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const [path, value] of Object.entries(parsed)) {
      const key = normalizeProjectPath(path);
      if (key) desks.set(key, normalizeDesk(value));
    }
  } catch {
    // Ignore a corrupt local record and start empty.
  }
}

function persist(path: string, desk: DeliveryDesk): void {
  const next = { ...desk, stage: deriveStage(desk) };
  desks.set(path, next);
  const store = storage();
  if (store) {
    const saved: Record<string, DeliveryDesk> = {};
    for (const [key, value] of desks) saved[key] = value;
    try {
      store.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch {
      // best-effort persistence
    }
  }
  emit();
}

export function peekDelivery(projectPath?: string | null): DeliveryDesk | null {
  hydrate();
  const key = normalizeProjectPath(projectPath);
  if (!key) return null;
  return desks.get(key) ?? null;
}

export function ensureDelivery(projectPath: string): DeliveryDesk | null {
  hydrate();
  const key = normalizeProjectPath(projectPath);
  if (!key) return null;
  const existing = desks.get(key);
  if (existing) return existing;
  const created = emptyDeliveryDesk();
  persist(key, created);
  return desks.get(key) ?? created;
}

export function selectDeliveryModule(projectPath: string, moduleId: string): void {
  const key = normalizeProjectPath(projectPath);
  const desk = key ? peekDelivery(key) : null;
  if (!key || !desk || !desk.modules.some((module) => module.id === moduleId)) return;
  persist(key, { ...desk, activeModuleId: moduleId });
}

export function replaceDeliveryCard(
  projectPath: string,
  moduleId: string,
  card: DeliveryCard,
): void {
  const key = normalizeProjectPath(projectPath);
  const desk = key ? peekDelivery(key) : null;
  if (!key || !desk) return;
  const next = { ...blankCard(), ...card };
  persist(key, {
    ...desk,
    modules: desk.modules.map((module) => {
      if (module.id !== moduleId || module.status === "confirmed") return module;
      const keepBlankBaseline = (field: DeliveryCardField, incoming: string) => {
        if (
          module.id !== GLOBAL_MODULE_ID
          && (SHARED_BASELINE_FIELDS as readonly string[]).includes(field)
          && !module.card[field].trim()
        ) return "";
        return incoming.trim();
      };
      return {
        ...module,
        card: {
          ...blankCard(),
          goal: next.goal.trim(),
          outOfScope: next.outOfScope.trim(),
          acceptance: next.acceptance.trim(),
          assumptions: next.assumptions.trim(),
          style: next.style.trim(),
          layout: next.layout.trim(),
          deviceMatrix: keepBlankBaseline("deviceMatrix", next.deviceMatrix),
          criticalPaths: keepBlankBaseline("criticalPaths", next.criticalPaths),
          exceptionCases: keepBlankBaseline("exceptionCases", next.exceptionCases),
          apiContract: keepBlankBaseline("apiContract", next.apiContract),
          envChecklist: keepBlankBaseline("envChecklist", next.envChecklist),
          dataPrecheck: keepBlankBaseline("dataPrecheck", next.dataPrecheck),
          externalDeps: keepBlankBaseline("externalDeps", next.externalDeps),
          perfBudget: keepBlankBaseline("perfBudget", next.perfBudget),
        },
      };
    }),
  });
}

export function updateDeliveryCard(
  projectPath: string,
  moduleId: string,
  field: DeliveryCardField,
  value: string,
): void {
  const key = normalizeProjectPath(projectPath);
  const desk = key ? peekDelivery(key) : null;
  if (!key || !desk) return;
  persist(key, {
    ...desk,
    modules: desk.modules.map((module) => {
      if (module.id !== moduleId || module.status === "confirmed") return module;
      return { ...module, card: { ...module.card, [field]: value } };
    }),
  });
}

/** Write the designer's style and layout onto the global card after it is confirmed. */
export function writeGlobalVisual(projectPath: string, style: string, layout: string): void {
  const key = normalizeProjectPath(projectPath);
  const desk = key ? peekDelivery(key) : null;
  if (!key || !desk) return;
  const nextStyle = style.trim().slice(0, 2000);
  const nextLayout = layout.trim().slice(0, 2000);
  if (!nextStyle || !nextLayout) return;
  persist(key, {
    ...desk,
    modules: desk.modules.map((module) => {
      if (module.id !== GLOBAL_MODULE_ID) return module;
      return { ...module, card: { ...module.card, style: nextStyle, layout: nextLayout } };
    }),
  });
}

/** Drop style and layout so the designer can write them again. */
export function clearGlobalVisual(projectPath: string): void {
  const key = normalizeProjectPath(projectPath);
  const desk = key ? peekDelivery(key) : null;
  if (!key || !desk) return;
  persist(key, {
    ...desk,
    modules: desk.modules.map((module) => {
      if (module.id !== GLOBAL_MODULE_ID) return module;
      if (!module.card.style && !module.card.layout) return module;
      return { ...module, card: { ...module.card, style: "", layout: "" } };
    }),
  });
}

export function confirmDeliveryModule(projectPath: string, moduleId: string): void {
  const key = normalizeProjectPath(projectPath);
  const desk = key ? peekDelivery(key) : null;
  if (!key || !desk) return;
  const modules = desk.modules.map((module) => {
    if (module.id !== moduleId || !moduleCanConfirm(module, desk.intake?.kind)) return module;
    return { ...module, status: "confirmed" as const };
  });
  const next = modules.find((module) => module.status !== "confirmed");
  persist(key, withSeededArchitecture({
    ...desk,
    activeModuleId: next?.id ?? moduleId,
    modules,
  }));
}

/** Clear confirmation and component text so a redesign kickoff can refill the board. */
export function withArchitectureDesignReset(projectPath: string): void {
  const key = normalizeProjectPath(projectPath);
  const desk = key ? peekDelivery(key) : null;
  if (!key || !desk) return;
  persist(key, withSeededArchitecture({
    ...desk,
    architecture: {
      status: "draft",
      summary: "",
      components: [],
      diagramKey: undefined,
    },
    dispatchPlan: null,
  }));
}

export function updateArchitectureSummary(projectPath: string, value: string): void {
  const key = normalizeProjectPath(projectPath);
  const desk = key ? peekDelivery(key) : null;
  if (!key || !desk || desk.architecture.status === "confirmed") return;
  persist(key, { ...desk, architecture: { ...desk.architecture, summary: value } });
}

export function updateArchitectureComponent(
  projectPath: string,
  componentId: string,
  field: "name" | "responsibility",
  value: string,
): void {
  const key = normalizeProjectPath(projectPath);
  const desk = key ? peekDelivery(key) : null;
  if (!key || !desk || desk.architecture.status === "confirmed") return;
  persist(key, {
    ...desk,
    architecture: {
      ...desk.architecture,
      components: desk.architecture.components.map((component) =>
        component.id === componentId ? { ...component, [field]: value } : component,
      ),
    },
  });
}

export function addArchitectureComponent(projectPath: string): void {
  const key = normalizeProjectPath(projectPath);
  const desk = key ? peekDelivery(key) : null;
  if (!key || !desk || desk.architecture.status === "confirmed") return;
  if (!desk.modules.every((module) => module.status === "confirmed")) return;
  const nextIndex = desk.architecture.components.reduce((max, component) => {
    const parsed = Number(component.id.replace(/^c/, ""));
    return Number.isFinite(parsed) ? Math.max(max, parsed) : max;
  }, 0) + 1;
  persist(key, {
    ...desk,
    architecture: {
      ...desk.architecture,
      components: [
        ...desk.architecture.components,
        { id: `c${nextIndex}`, name: "", responsibility: "" },
      ],
    },
  });
}

export function confirmArchitecture(projectPath: string): void {
  const key = normalizeProjectPath(projectPath);
  const desk = key ? peekDelivery(key) : null;
  if (!key || !desk || !architectureCanConfirm(desk)) return;
  persist(key, {
    ...desk,
    architecture: { ...desk.architecture, status: "confirmed" },
    dispatchPlan: null,
  });
}

export function setDeliveryDeployTarget(projectPath: string, target: DeliveryDeployTarget): void {
  const key = normalizeProjectPath(projectPath);
  const desk = key ? peekDelivery(key) : null;
  if (!key || !desk || desk.deployTarget === target) return;
  const plan = desk.dispatchPlan;
  persist(key, {
    ...desk,
    deployTarget: target,
    dispatchPlan: plan ? { ...plan, graphKey: undefined } : null,
  });
}

export function noteDeliveryPreviewUrl(projectPath: string, url: string): void {
  const key = normalizeProjectPath(projectPath);
  const desk = key ? peekDelivery(key) : null;
  const clean = url.trim().replace(/[)\].,，。]+$/u, "").slice(0, 300);
  if (!key || !desk || !/^https?:\/\//.test(clean) || desk.previewUrl === clean) return;
  persist(key, { ...desk, previewUrl: clean });
}

export function setDeliveryDispatchPlan(projectPath: string, plan: DeliveryDispatchPlan): void {
  const key = normalizeProjectPath(projectPath);
  const desk = key ? peekDelivery(key) : null;
  if (!key || !desk || desk.architecture.status !== "confirmed") return;
  const next = normalizeDispatchPlan(plan);
  if (!next) return;
  const current = desk.dispatchPlan;
  const prior = new Map((current?.tasks ?? []).map((task) => [task.id.toUpperCase(), task]));
  const tasks = next.tasks.map((task) => (
    prior.get(task.id.toUpperCase())?.status === "done" ? { ...task, status: "done" as const } : task
  ));
  const sameIds = Boolean(
    current && current.tasks.map((task) => task.id.toUpperCase()).join("\0") === tasks.map((task) => task.id.toUpperCase()).join("\0"),
  );
  const stored = {
    ...next,
    tasks,
    graphKey: next.graphKey ?? current?.graphKey,
    releasedIds: sameIds ? (current?.releasedIds ?? next.releasedIds) : next.releasedIds,
  };
  if (
    current &&
    current.workers === stored.workers &&
    current.rationale === stored.rationale &&
    (current.graphKey || "") === (stored.graphKey || "") &&
    JSON.stringify(current.tasks) === JSON.stringify(stored.tasks) &&
    JSON.stringify(current.releasedIds ?? []) === JSON.stringify(stored.releasedIds ?? [])
  ) {
    return;
  }
  persist(key, { ...desk, dispatchPlan: stored });
}

export function noteDispatchTaskDone(projectPath: string, ids: string[]): void {
  const key = normalizeProjectPath(projectPath);
  const desk = key ? peekDelivery(key) : null;
  const plan = desk?.dispatchPlan;
  if (!key || !desk || !plan) return;
  const done = new Set(ids.map((id) => id.trim().toUpperCase()).filter(Boolean));
  if (!done.size) return;
  let changed = false;
  const tasks = plan.tasks.map((task) => {
    if (task.status === "done" || !done.has(task.id.toUpperCase())) return task;
    changed = true;
    return { ...task, status: "done" as const };
  });
  if (!changed) return;
  persist(key, { ...desk, dispatchPlan: { ...plan, tasks } });
}

export function noteDispatchRelease(projectPath: string, ids: string[]): void {
  const key = normalizeProjectPath(projectPath);
  const desk = key ? peekDelivery(key) : null;
  const plan = desk?.dispatchPlan;
  if (!key || !desk || !plan) return;
  const releasedIds = ids.map((id) => id.trim()).filter(Boolean).slice(0, 40);
  if (JSON.stringify(plan.releasedIds ?? []) === JSON.stringify(releasedIds)) return;
  persist(key, { ...desk, dispatchPlan: { ...plan, releasedIds } });
}

export function clearDeliveryDispatchPlan(projectPath: string): void {
  const key = normalizeProjectPath(projectPath);
  const desk = key ? peekDelivery(key) : null;
  if (!key || !desk || !desk.dispatchPlan) return;
  persist(key, { ...desk, dispatchPlan: null });
}

export function setDeliveryDispatchGraph(projectPath: string, graphKey: string): void {
  const key = normalizeProjectPath(projectPath);
  const desk = key ? peekDelivery(key) : null;
  const plan = desk?.dispatchPlan;
  if (!key || !desk || !plan) return;
  const next = graphKey.trim();
  if ((plan.graphKey || "") === next) return;
  persist(key, {
    ...desk,
    dispatchPlan: { ...plan, graphKey: next || undefined },
  });
}

export function addDeliveryModule(projectPath: string): void {
  const key = normalizeProjectPath(projectPath);
  const desk = key ? peekDelivery(key) : null;
  if (!key || !desk) return;
  const nextIndex = desk.modules.reduce((max, module) => {
    const parsed = Number(module.id.replace(/^m/, ""));
    return Number.isFinite(parsed) ? Math.max(max, parsed) : max;
  }, 0) + 1;
  const created = createModule(nextIndex);
  persist(key, {
    ...desk,
    activeModuleId: created.id,
    modules: withGlobalModule([...desk.modules, created]),
    architecture: desk.architecture.status === "confirmed"
      ? desk.architecture
      : { ...desk.architecture, components: [] },
  });
}

export function replaceDeliveryArchitecture(
  projectPath: string,
  summary: string,
  components: Array<{ name: string; responsibility: string }>,
  diagramKey?: string | null,
): void {
  const key = normalizeProjectPath(projectPath);
  const desk = key ? peekDelivery(key) : null;
  if (!key || !desk || desk.architecture.status === "confirmed") return;
  const nextKey =
    diagramKey === null
      ? undefined
      : typeof diagramKey === "string" && diagramKey.trim()
        ? diagramKey.trim()
        : desk.architecture.diagramKey;
  persist(key, {
    ...desk,
    architecture: {
      status: "draft",
      summary: summary.trim() || desk.architecture.summary,
      diagramKey: nextKey,
      components: components.length
        ? components
            .map((component, index) => ({
              id: `c${index + 1}`,
              name: component.name.trim(),
              responsibility: component.responsibility.trim(),
            }))
            .filter((component) => component.name || component.responsibility)
            .slice(0, 12)
        : desk.architecture.components,
    },
  });
}

/** Persist Archify diagram key + optional component sync after a successful render. */
export function setDeliveryArchitectureDiagram(
  projectPath: string,
  input: {
    diagramKey: string;
    summary?: string;
    components?: Array<{ name: string; responsibility: string }>;
  },
): void {
  const key = normalizeProjectPath(projectPath);
  const desk = key ? peekDelivery(key) : null;
  if (!key || !desk || desk.architecture.status === "confirmed") return;
  const diagramKey = input.diagramKey.trim();
  if (!diagramKey) return;
  const components = Array.isArray(input.components) && input.components.length
    ? input.components
        .map((component, index) => ({
          id: `c${index + 1}`,
          name: component.name.trim(),
          responsibility: component.responsibility.trim(),
        }))
        .filter((component) => component.name || component.responsibility)
        .slice(0, 12)
    : desk.architecture.components;
  persist(key, {
    ...desk,
    architecture: {
      status: "draft",
      summary: (input.summary ?? "").trim() || desk.architecture.summary,
      diagramKey,
      components,
    },
  });
}

const PROJECT_META_FILE =
  /^(readme|license|licence|copying|changelog|contributing|authors|codeowners)(\.[^.]+)?$/i;

/** True when the workspace has product files, not only a readme or dotfiles. */
export function workspaceLooksExisting(paths: readonly string[]): boolean {
  for (const path of paths) {
    const base = path.replace(/\\/g, "/").split("/").pop() ?? "";
    if (!base || base.startsWith(".")) continue;
    if (PROJECT_META_FILE.test(base)) continue;
    return true;
  }
  return false;
}

export function setDeliveryExistingProject(projectPath: string, existing: boolean): void {
  const key = normalizeProjectPath(projectPath);
  if (!key) return;
  const desk = ensureDelivery(key);
  if (!desk) return;
  const current = peekDelivery(key);
  if (!current || current.existingProject === existing) return;
  persist(key, { ...current, existingProject: existing });
}

export function setDeliveryBackground(projectPath: string, background: string): void {
  const key = normalizeProjectPath(projectPath);
  if (!key) return;
  const desk = ensureDelivery(key);
  if (!desk) return;
  const current = peekDelivery(key);
  if (!current) return;
  persist(key, { ...current, background: background.trim() });
}

export function noteDeliveryIteration(projectPath: string, summary: string): void {
  const key = normalizeProjectPath(projectPath);
  if (!key) return;
  const desk = ensureDelivery(key);
  if (!desk) return;
  const current = peekDelivery(key);
  if (!current) return;
  const iterations = appendIteration(current.iterations, summary);
  if (iterations === current.iterations) return;
  persist(key, { ...current, iterations });
}

export function commitDeliveryChatModules(
  projectPath: string,
  modules: DeliveryModule[],
  activeModuleId: string,
): void {
  const key = normalizeProjectPath(projectPath);
  const desk = key ? peekDelivery(key) : null;
  if (!key || !desk || modules.length === 0) return;
  const pinned = withGlobalModule(modules);
  const active = pinned.some((module) => module.id === activeModuleId)
    ? activeModuleId
    : pinned[0].id;
  persist(key, { ...desk, modules: pinned, activeModuleId: active });
}

export function signDeliveryBaseline(projectPath: string, signer: string): boolean {
  const key = normalizeProjectPath(projectPath);
  const desk = key ? peekDelivery(key) : null;
  const name = signer.trim().slice(0, 120);
  if (!key || !desk || !name) return false;
  if (!desk.modules.every((module) => module.status === "confirmed")) return false;
  if (desk.architecture.status !== "confirmed") return false;
  const fingerprint = baselineFingerprint(desk.modules);
  if (fingerprint === "[]") return false;
  persist(key, {
    ...desk,
    baseline: {
      ...clipBaseline(desk.baseline),
      signedAt: new Date().toISOString(),
      signer: name,
      fingerprint,
    },
  });
  return true;
}

export function setDeliveryRevision(projectPath: string, revision: DeliveryRevision): void {
  const key = normalizeProjectPath(projectPath);
  const desk = key ? peekDelivery(key) : null;
  const next = normalizeRevision(revision);
  if (!key || !desk || !next) return;
  const prior = desk.revision;
  const stored: DeliveryRevision = {
    scope: next.scope,
    moduleId: next.scope === "module" ? next.moduleId || prior?.moduleId || "" : "",
    goal: next.goal || prior?.goal || "",
    outOfScope: next.outOfScope || prior?.outOfScope || "",
    acceptance: next.acceptance || prior?.acceptance || "",
    assumptions: next.assumptions || prior?.assumptions || "",
  };
  if (JSON.stringify(prior) === JSON.stringify(stored)) return;
  persist(key, {
    ...desk,
    revision: stored,
    iterations: appendIteration(desk.iterations, stored.goal),
  });
}

export function openDeliveryChange(projectPath: string, reason: string): boolean {
  const key = normalizeProjectPath(projectPath);
  const desk = key ? peekDelivery(key) : null;
  const text = reason.trim().slice(0, 2000);
  if (!key || !desk || !text || !baselineIsValid(desk.baseline, desk.modules)) return false;
  const previous = clipBaseline(desk.baseline);
  persist(key, {
    ...desk,
    stage: "confirming",
    iterations: appendIteration(desk.iterations, text),
    modules: desk.modules.map((module) => ({ ...module, status: "draft" })),
    architecture: { ...desk.architecture, status: "draft" },
    dispatchPlan: null,
    baseline: {
      signedAt: null,
      signer: "",
      fingerprint: "",
      changes: [
        ...previous.changes,
        {
          at: new Date().toISOString(),
          signer: previous.signer,
          reason: text,
          fingerprint: previous.fingerprint,
        },
      ].slice(-40),
    },
  });
  return true;
}

/** True after「开始执行任务」until a change clears the run. */
export function dispatchExecutionLocked(desk: DeliveryDesk | null | undefined): boolean {
  if (!desk) return false;
  if (desk.stage === "building" || desk.stage === "delivered") return true;
  return (desk.dispatchPlan?.releasedIds?.length ?? 0) > 0;
}

export function markDeliveryBuilding(projectPath: string): void {
  const key = normalizeProjectPath(projectPath);
  const desk = key ? peekDelivery(key) : null;
  if (!key || !desk || desk.architecture.status !== "confirmed") return;
  if (!baselineIsValid(desk.baseline, desk.modules)) return;
  if (desk.stage === "building" || desk.stage === "delivered") return;
  persist(key, { ...desk, stage: "building" });
}

export function resetDeliveryDeskForTests(): void {
  desks.clear();
  hydrated = false;
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  emit();
}
