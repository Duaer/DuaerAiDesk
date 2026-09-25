import type { DeliveryIntakeKind, DeliveryReviewCard } from "@duaer-ai-desk/shared";
import i18n from "i18next";
import { api } from "./api.ts";
import {
  DELIVERY_AUTO_FIX_MARKER,
  DELIVERY_DESK_MARKER,
  DELIVERY_DISPATCH_MARKER,
  DELIVERY_GATE_NOTE_MARKER,
} from "./delivery-chat.ts";
import {
  peekDelivery,
  setDeliveryIntake,
  type DeliveryDesk,
  type DeliveryIntake,
} from "./delivery-desk.ts";

const BLANK_CARD: DeliveryReviewCard = {
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

const KICKOFF_RE =
  /请开始帮我梳理需求|请先把现在的功能整理出来|Please start clarifying|Please organize the current functions|请先记下怎么复现|请先记下故障|还分不清是修缺陷|Please record how to reproduce|Please record the bug first|cannot tell yet whether/;

const NOTE_KEY: Record<DeliveryIntakeKind, string> = {
  bug: "panel.requirements.intakeBug",
  requirement: "panel.requirements.intakeRequirement",
  both: "panel.requirements.intakeBoth",
  unclear: "panel.requirements.intakeUnclear",
};

export function shouldClassifyIntake(input: {
  text: string;
  tabKind?: string;
  workPanelOpen: boolean;
  desk: DeliveryDesk | null;
}): boolean {
  const text = input.text.trim();
  if (text.length < 2) return false;
  if (!input.workPanelOpen || input.tabKind !== "requirements") return false;
  if (
    text.includes(DELIVERY_DESK_MARKER)
    || text.includes(DELIVERY_AUTO_FIX_MARKER)
    || text.includes(DELIVERY_DISPATCH_MARKER)
    || text.includes(DELIVERY_GATE_NOTE_MARKER)
    || text.startsWith("duaer:")
    || KICKOFF_RE.test(text)
  ) {
    return false;
  }
  const desk = input.desk;
  if (!desk) return false;
  if (desk.stage === "building" || desk.stage === "delivered") return false;
  const kind = desk.intake?.kind;
  if (kind === "bug" || kind === "requirement" || kind === "both") return false;
  if (kind === "unclear") return true;
  if (desk.modules.some((module) => module.status === "confirmed")) return false;
  if (desk.modules.some((module) => module.card.goal.trim() || module.card.acceptance.trim())) {
    return false;
  }
  return true;
}

export function kickoffKeyFor(kind: DeliveryIntakeKind, existing: boolean): string {
  if (kind === "bug") return "project.kickoffBug";
  if (kind === "both") return "project.kickoffBoth";
  if (kind === "unclear") return "project.kickoffUnclear";
  return existing ? "project.kickoffExisting" : "project.kickoff";
}

type JudgeModel = {
  sessionId?: string | null;
  providerId?: string;
  modelId?: string;
};

/** Judge the ask. A failed call stays on the requirement lane so create is not blocked. */
export async function classifyDeliveryAsk(ask: string, model: JudgeModel): Promise<DeliveryIntake> {
  const fallback: DeliveryIntake = { kind: "requirement", reason: "" };
  const text = ask.trim();
  if (text.length < 2) return fallback;
  try {
    const reviewed = await api.reviewDeliveryCard({
      mode: "intake",
      ask: text.slice(0, 2000),
      card: BLANK_CARD,
      sessionId: model.sessionId || undefined,
      providerId: model.providerId,
      modelId: model.modelId,
    });
    const kind = reviewed.intakeKind;
    if (kind !== "bug" && kind !== "requirement" && kind !== "both" && kind !== "unclear") {
      return fallback;
    }
    return {
      kind,
      reason: (reviewed.intakeReason || reviewed.summary || "").trim().slice(0, 200),
    };
  } catch {
    return fallback;
  }
}

function resolveIntake(previous: DeliveryIntakeKind | undefined, next: DeliveryIntake): DeliveryIntake {
  if (previous === "unclear" && next.kind === "unclear") {
    return { kind: "requirement", reason: next.reason || "仍分不清，按需求继续" };
  }
  return next;
}

async function noteIntake(intake: DeliveryIntake): Promise<void> {
  const { appendDeliveryChatNote } = await import("./delivery-chat-note.ts");
  appendDeliveryChatNote(i18n.t(NOTE_KEY[intake.kind]));
}

export async function ensureDeliveryIntake(input: {
  text: string;
  tabKind?: string;
  workPanelOpen: boolean;
  projectPath: string | null | undefined;
  model: JudgeModel;
}): Promise<void> {
  const path = input.projectPath?.trim() || "";
  const desk = path ? peekDelivery(path) : null;
  if (!shouldClassifyIntake({ ...input, desk })) return;
  const next = await classifyDeliveryAsk(input.text, input.model);
  const current = peekDelivery(path);
  if (!current) return;
  const intake = resolveIntake(current.intake?.kind, next);
  setDeliveryIntake(path, intake);
  await noteIntake(intake);
}

export async function classifyProjectKickoff(
  projectPath: string,
  description: string,
  model: JudgeModel,
): Promise<DeliveryIntake> {
  const intake = await classifyDeliveryAsk(description, model);
  setDeliveryIntake(projectPath, intake);
  await noteIntake(intake);
  return intake;
}
