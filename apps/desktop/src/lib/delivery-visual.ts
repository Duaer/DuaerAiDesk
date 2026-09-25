import i18n from "i18next";
import { globalVisualReady } from "./delivery-card-check.ts";
import {
  DELIVERY_REVISE_VISUAL_ACTION,
  DELIVERY_START_DISPATCH_ACTION,
  isDeliveryGateNote,
  parseDeliveryGateChoices,
} from "./delivery-chat.ts";
import { appendDeliveryChatNote } from "./delivery-chat-note.ts";
import { beginDispatchSplit, clearDispatchSplitMark } from "./delivery-dispatch-chat.ts";
import {
  clearGlobalVisual,
  GLOBAL_MODULE_ID,
  peekDelivery,
  writeGlobalVisual,
  type DeliveryDesk,
} from "./delivery-desk.ts";
import { deliveryProjectPath } from "./use-delivery-desk.ts";
import { useAppStore } from "../stores/app-store";

const JSON_MARKER = "<<<JSON>>>";
const designSent = new Set<string>();
const offeredVisual = new Set<string>();

export function clearVisualDesignMark(projectPath: string): void {
  designSent.delete(projectPath.trim());
}

function clip(value: unknown, max: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length <= max ? text : text.slice(0, max);
}

/** Pull the designer's style and layout out of a desk JSON reply. */
export function extractVisualDesign(reply: string): { style: string; layout: string } | null {
  const raw = String(reply || "");
  const marker = raw.lastIndexOf(JSON_MARKER);
  const slice = marker >= 0 ? raw.slice(marker + JSON_MARKER.length) : raw;
  const start = slice.indexOf("{");
  const end = slice.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(slice.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  const record = obj as { design_type?: unknown; style?: unknown; layout?: unknown };
  if (record.design_type !== "visual") return null;
  const style = clip(record.style, 2000);
  const layout = clip(record.layout, 2000);
  if (!globalVisualReady(style, layout)) return null;
  return { style, layout };
}

/** Parent prose that means the designer turn is finished and the next step should appear. */
export function visualHandoffClaim(reply: string): boolean {
  return /已整理进全局卡|全局设计与版式|视觉契约|design_type"\s*:\s*"visual"/.test(String(reply || ""));
}

/** The designer summary often stays prose. Split it into style and layout. */
export function extractVisualProse(reply: string): { style: string; layout: string } | null {
  const raw = String(reply || "");
  const marker = raw.lastIndexOf("视觉契约");
  if (marker < 0) return null;
  const after = raw.slice(marker).split(/我已把|<<<JSON>>>/)[0] ?? "";
  const body = after.replace(/^视觉契约[:：]\s*/, "").replace(/[。.\s]+$/, "").trim();
  if (body.length < 16) return null;
  const layoutAt = body.search(/单栏|双栏|三栏|吸顶|导航|侧栏|页眉|全宽|栅格/);
  if (layoutAt >= 8) {
    const style = body.slice(0, layoutAt).replace(/[，,、\s]+$/, "").trim();
    const layout = body.slice(layoutAt).replace(/^[，,、\s]+/, "").trim();
    if (globalVisualReady(style, layout)) return { style, layout };
  }
  if (globalVisualReady(body, body)) return { style: body, layout: body };
  return null;
}

function visualDesignPrompt(desk: DeliveryDesk): string {
  const architecture = {
    summary: desk.architecture.summary,
    components: desk.architecture.components,
  };
  return [
    "架构已确认。这一轮只补全局卡的网站风格和布局。不要拆任务，不要改仓库，不要写业务代码。",
    "调用一次 Task，agent 填 ui-designer。把下面的架构交给他，只要两段文字：style（颜色、字体、间距）和 layout（栏、导航、主区域）。不要让他改文件。",
    "他交回之后，单独一行 <<<JSON>>>，再输出 JSON（不要 markdown 围栏）：",
    "{\"design_type\":\"visual\",\"style\":\"白底、深色字、正文 16px、间距 8px\",\"layout\":\"单栏居中，顶部导航\"}",
    "不要派工。",
    `架构：${JSON.stringify(architecture)}`,
  ].join("\n");
}

/**
 * After architecture locks, ask the UI designer for style and layout.
 * Implementation starts only once that design is concrete.
 */
export async function beginVisualDesign(projectPath: string): Promise<void> {
  const path = projectPath.trim();
  const desk = path ? peekDelivery(path) : null;
  if (!path || !desk || desk.architecture.status !== "confirmed") return;
  const global = desk.modules.find((module) => module.id === GLOBAL_MODULE_ID);
  if (!global || globalVisualReady(global.card.style, global.card.layout)) return;
  if (designSent.has(path)) return;
  designSent.add(path);
  await useAppStore.getState().sendPrompt(visualDesignPrompt(desk));
}

/** Store a concrete visual design. The next step is a chat choice, not an automatic split. */
export function maybeApplyVisualDesignFromReply(projectPath: string, reply: string): boolean {
  const path = projectPath.trim();
  if (!path || isDeliveryGateNote(reply)) return false;
  const desk = peekDelivery(path);
  if (!desk || desk.architecture.status !== "confirmed") return false;
  const design = extractVisualDesign(reply) ?? extractVisualProse(reply);
  if (design) writeGlobalVisual(path, design.style, design.layout);
  if (!useAppStore.getState().isRunning && (design || visualHandoffClaim(reply))) {
    offerVisualDecision(path, reply);
  }
  return Boolean(design);
}

function visualDecisionKey(path: string, style: string, layout: string): string {
  return `${path}\0${style.trim()}\0${layout.trim()}`;
}

/** After style and layout are on the global card, offer split or another design pass. */
export function offerVisualDecision(projectPath: string, reply = ""): void {
  const path = projectPath.trim();
  const state = useAppStore.getState();
  if (!path || state.isRunning) return;
  const desk = peekDelivery(path);
  if (!desk || desk.architecture.status !== "confirmed") return;
  if (desk.dispatchPlan?.tasks.length) return;
  const global = desk.modules.find((module) => module.id === GLOBAL_MODULE_ID);
  const ready = Boolean(global && globalVisualReady(global.card.style, global.card.layout));
  const claimed = visualHandoffClaim(reply)
    || state.messages.slice(-6).some((message) => visualHandoffClaim(message.content || ""));
  if (!ready && !claimed) return;
  const key = ready && global
    ? visualDecisionKey(path, global.card.style, global.card.layout)
    : `${path}\0handoff`;
  if (offeredVisual.has(key)) return;
  const last = state.messages.at(-1);
  if (last && parseDeliveryGateChoices(last.content || "").includes(DELIVERY_START_DISPATCH_ACTION)) {
    offeredVisual.add(key);
    return;
  }
  offeredVisual.add(key);
  appendDeliveryChatNote(i18n.t("panel.architecture.visualDecideNote"), {
    choices: [DELIVERY_START_DISPATCH_ACTION, DELIVERY_REVISE_VISUAL_ACTION],
  });
}

/** Start the task split from the chat chip. */
export async function startDispatchFromChat(): Promise<void> {
  const path = deliveryProjectPath(useAppStore.getState());
  if (!path) return;
  clearDispatchSplitMark(path);
  await beginDispatchSplit(path);
}

/** Clear the visual contract and ask the designer again. */
export async function reviseVisualFromChat(): Promise<void> {
  const state = useAppStore.getState();
  const path = deliveryProjectPath(state);
  if (!path) return;
  const desk = peekDelivery(path);
  const global = desk?.modules.find((module) => module.id === GLOBAL_MODULE_ID);
  if (global) offeredVisual.delete(visualDecisionKey(path, global.card.style, global.card.layout));
  if (state.isRunning) {
    appendDeliveryChatNote(i18n.t("panel.requirements.chatAutoFixBusy"));
    return;
  }
  clearVisualDesignMark(path);
  clearGlobalVisual(path);
  clearDispatchSplitMark(path);
  await beginVisualDesign(path);
}
