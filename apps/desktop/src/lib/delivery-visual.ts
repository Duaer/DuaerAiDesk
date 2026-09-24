import { globalVisualReady } from "./delivery-card-check.ts";
import { isDeliveryGateNote } from "./delivery-chat.ts";
import { beginDispatchSplit } from "./delivery-dispatch-chat.ts";
import {
  GLOBAL_MODULE_ID,
  peekDelivery,
  writeGlobalVisual,
  type DeliveryDesk,
} from "./delivery-desk.ts";
import { useAppStore } from "../stores/app-store";

const JSON_MARKER = "<<<JSON>>>";
const designSent = new Set<string>();

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
  if (!global || globalVisualReady(global.card.style, global.card.layout)) {
    await beginDispatchSplit(path);
    return;
  }
  if (designSent.has(path)) return;
  designSent.add(path);
  await useAppStore.getState().sendPrompt(visualDesignPrompt(desk));
}

/** Store a concrete visual design, then release the implementation split. */
export function maybeApplyVisualDesignFromReply(projectPath: string, reply: string): boolean {
  const path = projectPath.trim();
  if (!path || isDeliveryGateNote(reply)) return false;
  const desk = peekDelivery(path);
  if (!desk || desk.architecture.status !== "confirmed") return false;
  const design = extractVisualDesign(reply);
  if (!design) return false;
  writeGlobalVisual(path, design.style, design.layout);
  void beginDispatchSplit(path);
  return true;
}
