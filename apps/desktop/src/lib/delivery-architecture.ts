import i18n from "i18next";
import { api } from "./api.ts";
import { extractArchitectureIr, relaxArchitectureIr } from "./architecture-ir.mjs";
import {
  DELIVERY_CONFIRM_ARCHITECTURE_ACTION,
  DELIVERY_REVISE_ARCHITECTURE_ACTION,
  isDeliveryGateNote,
  parseDeliveryGateChoices,
} from "./delivery-chat.ts";
import { appendDeliveryChatNote } from "./delivery-chat-note.ts";
import { clearDispatchSplitMark } from "./delivery-dispatch-chat.ts";
import { beginVisualDesign, clearVisualDesignMark } from "./delivery-visual.ts";
import {
  architectureCanConfirm,
  confirmArchitecture,
  peekDelivery,
  setDeliveryArchitectureDiagram,
  withArchitectureDesignReset,
  type DeliveryComponent,
  type DeliveryDesk,
} from "./delivery-desk.ts";
import { deliveryProjectPath } from "./use-delivery-desk.ts";
import { toolWorkPanelTab } from "./work-panel-tabs.ts";
import { useAppStore } from "../stores/app-store";

const kickoffsSent = new Set<string>();
const htmlByKey = new Map<string, string>();
const renderInFlight = new Map<string, Promise<boolean>>();
const lastArchitectureFp = new Map<string, string>();
/** One fail chat note per project until a successful render or redesign. */
const renderFailNoted = new Set<string>();

export function architectureDesignReady(desk: DeliveryDesk): boolean {
  return desk.modules.length > 0 && desk.modules.every((module) => module.status === "confirmed");
}

export function cachedArchitectureHtml(diagramKey: string | undefined): string | null {
  const key = String(diagramKey || "").trim();
  if (!key) return null;
  return htmlByKey.get(key) ?? null;
}

export function rememberArchitectureHtml(diagramKey: string, html: string): void {
  const key = diagramKey.trim();
  if (!key || !html.trim()) return;
  htmlByKey.set(key, html);
}

const TYPE_HINTS: Array<{ re: RegExp; type: string }> = [
  { re: /front|web|ui|react|vue|page|客户端|前端/i, type: "frontend" },
  { re: /api|gateway|service|server|后端|接口/i, type: "backend" },
  { re: /db|sql|redis|mongo|数据|库/i, type: "database" },
  { re: /auth|oauth|secure|安全|鉴权/i, type: "security" },
  { re: /queue|mq|kafka|bus|消息/i, type: "messagebus" },
  { re: /cdn|s3|oss|cloud|云/i, type: "cloud" },
  { re: /external|third|支付|短信|外部/i, type: "external" },
];

function guessComponentType(name: string, responsibility: string): string {
  const hay = `${name} ${responsibility}`;
  for (const hint of TYPE_HINTS) {
    if (hint.re.test(hay)) return hint.type;
  }
  return "backend";
}

/** Fallback Archify IR when chat only returned summary/components boxes. */
export function architectureIrFromComponents(
  summary: string,
  components: DeliveryComponent[],
): Record<string, unknown> | null {
  const nodes = components
    .filter((component) => component.name.trim())
    .slice(0, 12)
    .map((component, index) => ({
      id: component.id || `c${index + 1}`,
      type: guessComponentType(component.name, component.responsibility),
      label: component.name.trim().slice(0, 40),
      sublabel: component.responsibility.trim().slice(0, 80),
      row: Math.floor(index / 3) + 1,
      col: (index % 3) + 1,
    }));
  if (!nodes.length) return null;
  const connections = nodes.slice(0, -1).map((node, index) => ({
    id: `e${index + 1}`,
    from: node.id,
    to: nodes[index + 1]!.id,
  }));
  return {
    schema_version: 1,
    diagram_type: "architecture",
    meta: {
      title: summary.trim().slice(0, 80) || "Architecture",
      quality_profile: "standard",
    },
    components: nodes,
    connections,
    boundaries: [],
    cards: [],
  };
}

function componentsFromIr(ir: Record<string, unknown>): Array<{ name: string; responsibility: string }> {
  const list = Array.isArray(ir.components) ? ir.components : [];
  return list.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const name = String(row.label || row.name || "").trim();
    if (!name) return [];
    return [{
      name: name.slice(0, 80),
      responsibility: String(row.sublabel || row.tag || "").trim().slice(0, 200),
    }];
  });
}

export async function loadArchitectureHtml(diagramKey: string): Promise<string | null> {
  const key = diagramKey.trim();
  if (!key) return null;
  const cached = htmlByKey.get(key);
  if (cached) return cached;
  try {
    const result = await api.getDeliveryArchitectureHtml({ key });
    if (result.html) rememberArchitectureHtml(key, result.html);
    return result.html;
  } catch {
    return null;
  }
}

export async function renderArchitectureIrForProject(
  projectPath: string,
  ir: Record<string, unknown>,
  options: { force?: boolean } = {},
): Promise<boolean> {
  const path = projectPath.trim();
  if (!path || !ir) return false;
  const desk = peekDelivery(path);
  if (!desk || desk.architecture.status === "confirmed") return false;
  // Auto-extract paths must not re-invoke IPC on every transcript effect once
  // a diagram exists — that also re-appended fail notes when preload was stale.
  if (!options.force && desk.architecture.diagramKey?.trim()) return true;
  const paint = async (source: Record<string, unknown>) => {
    const rendered = await api.renderDeliveryArchitecture({ ir: source });
    rememberArchitectureHtml(rendered.key, rendered.html);
    setDeliveryArchitectureDiagram(path, {
      diagramKey: rendered.key,
      summary: rendered.summary || String((source.meta as { title?: string } | undefined)?.title || ""),
      components: componentsFromIr(source),
    });
    renderFailNoted.delete(path);
  };
  try {
    await paint(ir);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/layout validation/i.test(message)) {
      const relaxed = relaxArchitectureIr(ir);
      if (relaxed) {
        try {
          await paint(relaxed);
          return true;
        } catch (retryError) {
          noteArchitectureRenderFail(path, retryError);
          return false;
        }
      }
    }
    noteArchitectureRenderFail(path, error);
    return false;
  }
}

function noteArchitectureRenderFail(path: string, error: unknown): void {
  if (renderFailNoted.has(path)) return;
  renderFailNoted.add(path);
  appendDeliveryChatNote(
    i18n.t("panel.architecture.renderFail", {
      msg: error instanceof Error ? error.message : String(error),
    }),
  );
}

/**
 * Extract Archify IR from assistant text (or fall back to desk components) and render.
 */
export async function maybeRenderArchitectureFromReply(
  projectPath: string,
  reply: string,
): Promise<boolean> {
  const path = projectPath.trim();
  if (!path) return false;
  // GATE notes (including prior renderFail) must not re-enter the render loop.
  if (isDeliveryGateNote(reply)) return false;
  const desk = peekDelivery(path);
  if (!desk || !architectureDesignReady(desk) || desk.architecture.status === "confirmed") {
    return false;
  }
  const replyIr = extractArchitectureIr(reply) as Record<string, unknown> | null;
  const replyFp = replyIr ? JSON.stringify(replyIr) : "";
  if (replyFp && lastArchitectureFp.get(path) === replyFp && desk.architecture.diagramKey?.trim()) {
    return true;
  }
  const pending = renderInFlight.get(path);
  if (pending && !replyIr) return pending;

  const work = (async () => {
    let ir = replyIr;
    if (ir) {
      lastArchitectureFp.set(path, replyFp);
      const rendered = await renderArchitectureIrForProject(path, ir, { force: true });
      if (!rendered) lastArchitectureFp.delete(path);
      return rendered;
    }
    if (desk.architecture.diagramKey?.trim()) return true;
    if (!ir) {
      // Prefer Archify IR from the reply JSON; only then fall back to simple boxes.
      try {
        const marker = reply.lastIndexOf("<<<JSON>>>");
        const slice = marker >= 0 ? reply.slice(marker + "<<<JSON>>>".length) : reply;
        const start = slice.indexOf("{");
        const end = slice.lastIndexOf("}");
        if (start >= 0 && end > start) {
          const obj = JSON.parse(slice.slice(start, end + 1)) as {
            summary?: string;
            components?: Array<{ name?: string; responsibility?: string }>;
          };
          const components = Array.isArray(obj.components)
            ? obj.components.map((component, index) => ({
                id: `c${index + 1}`,
                name: String(component?.name || "").trim(),
                responsibility: String(component?.responsibility || "").trim(),
              }))
            : [];
          ir = architectureIrFromComponents(String(obj.summary || desk.architecture.summary), components);
        }
      } catch {
        /* ignore */
      }
    }
    if (!ir) {
      ir = architectureIrFromComponents(desk.architecture.summary, desk.architecture.components);
    }
    if (!ir) return false;
    return renderArchitectureIrForProject(path, ir);
  })();

  renderInFlight.set(path, work);
  try {
    return await work;
  } finally {
    renderInFlight.delete(path);
  }
}

/** Rebuild diagram from current desk components (Regenerate without new chat). */
export async function renderArchitectureFromDesk(projectPath: string): Promise<boolean> {
  const path = projectPath.trim();
  const desk = peekDelivery(path);
  if (!desk || !architectureDesignReady(desk)) return false;
  const ir = architectureIrFromComponents(desk.architecture.summary, desk.architecture.components);
  if (!ir) {
    appendDeliveryChatNote(i18n.t("panel.architecture.renderMissing"));
    return false;
  }
  return renderArchitectureIrForProject(path, ir, { force: true });
}

/**
 * Open Architecture and start one design chat turn (live-desk beginArchitectureDesign).
 * Idempotent per project until redesign clears the kickoff mark.
 */
export async function beginArchitectureDesign(
  projectPath: string,
  options: { kickoff?: boolean; force?: boolean } = {},
): Promise<void> {
  const path = projectPath.trim();
  if (!path) return;
  const desk = peekDelivery(path);
  if (!desk || !architectureDesignReady(desk)) return;
  if (desk.architecture.status === "confirmed" && !options.force) {
    useAppStore.getState().openWorkPanelTab(toolWorkPanelTab("architecture"));
    return;
  }

  const store = useAppStore.getState();
  store.openWorkPanelTab(toolWorkPanelTab("architecture"));

  const wantKickoff = options.kickoff !== false;
  if (!wantKickoff) return;
  if (!options.force && kickoffsSent.has(path)) return;
  if (!options.force && (desk.architecture.summary.trim() || desk.architecture.diagramKey)) {
    kickoffsSent.add(path);
    return;
  }
  const existing = desk.existingProject === true;
  const enterKey = existing
    ? "panel.architecture.enterDesignExisting"
    : "panel.architecture.enterDesign";
  const kickoffKey = existing
    ? "panel.architecture.kickoffPromptExisting"
    : "panel.architecture.kickoffPrompt";
  if (store.isRunning) {
    appendDeliveryChatNote(i18n.t(enterKey));
    kickoffsSent.add(path);
    return;
  }

  kickoffsSent.add(path);
  appendDeliveryChatNote(i18n.t(enterKey));
  await store.sendPrompt(i18n.t(kickoffKey));
}

const offeredArchitectureDecisions = new Set<string>();

function architectureDecisionKey(path: string, desk: DeliveryDesk): string {
  const names = desk.architecture.components.map((component) => component.name.trim()).join("|");
  return [path, desk.architecture.summary.trim(), names].join("\0");
}

/** Ask in chat once the draft architecture can be locked. Chips, not panel buttons. */
export function offerArchitectureDecision(projectPath: string): void {
  const path = projectPath.trim();
  const state = useAppStore.getState();
  if (!path || state.isRunning) return;
  const desk = peekDelivery(path);
  if (!desk || desk.architecture.status !== "draft" || !architectureCanConfirm(desk)) return;
  const key = architectureDecisionKey(path, desk);
  if (offeredArchitectureDecisions.has(key)) return;
  const last = state.messages.at(-1);
  if (last && parseDeliveryGateChoices(last.content || "").includes(DELIVERY_CONFIRM_ARCHITECTURE_ACTION)) {
    offeredArchitectureDecisions.add(key);
    return;
  }
  offeredArchitectureDecisions.add(key);
  appendDeliveryChatNote(i18n.t("panel.architecture.decideNote"), {
    choices: [DELIVERY_CONFIRM_ARCHITECTURE_ACTION, DELIVERY_REVISE_ARCHITECTURE_ACTION],
  });
}

/** Lock the diagram from the chat chip, then open dispatch and split tasks. */
export async function confirmArchitectureFromChat(): Promise<void> {
  const path = deliveryProjectPath(useAppStore.getState());
  if (!path) return;
  const desk = peekDelivery(path);
  if (!desk || !architectureCanConfirm(desk)) return;
  confirmArchitecture(path);
  await beginVisualDesign(path);
}

/** Keep the diagram and ask the chat to change it. */
export async function reviseArchitectureFromChat(): Promise<void> {
  const state = useAppStore.getState();
  const path = deliveryProjectPath(state);
  if (!path) return;
  const desk = peekDelivery(path);
  if (desk) offeredArchitectureDecisions.delete(architectureDecisionKey(path, desk));
  if (state.isRunning) {
    appendDeliveryChatNote(i18n.t("panel.requirements.chatAutoFixBusy"));
    return;
  }
  await state.sendPrompt(i18n.t("panel.architecture.revisePrompt"));
}

/** Unlock architecture and kick off a fresh design turn. */
export async function regenerateArchitectureDesign(projectPath: string): Promise<void> {
  const path = projectPath.trim();
  if (!path) return;
  const desk = peekDelivery(path);
  if (!desk || !architectureDesignReady(desk)) return;
  withArchitectureDesignReset(path);
  kickoffsSent.delete(path);
  clearDispatchSplitMark(path);
  clearVisualDesignMark(path);
  renderFailNoted.delete(path);
  await beginArchitectureDesign(path, { kickoff: true, force: true });
}

export function clearArchitectureKickoffMark(projectPath: string): void {
  kickoffsSent.delete(projectPath.trim());
}
