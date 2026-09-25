import i18n from "i18next";
import { deliveryCardIssues, SHARED_BASELINE_FIELDS } from "./delivery-card-check.ts";
import { appendDeliveryChatNote } from "./delivery-chat-note.ts";
import {
  DELIVERY_AUTO_HANDLE_ACTION,
  parseDeliveryGateChoices,
  setDeliveryAutoFixFields,
} from "./delivery-chat.ts";
import {
  deliveryAutoFixPrompt,
  selectDeliveryAutoFixFields,
  type DeliveryAutoFixSlice,
} from "./delivery-review.ts";
import {
  GLOBAL_MODULE_ID,
  peekDelivery,
  type DeliveryCard,
  type DeliveryCardField,
} from "./delivery-desk.ts";
import { deliveryProjectPath } from "./use-delivery-desk.ts";
import { useAppStore } from "../stores/app-store";

/** Latest model-review issues for the active module (filled by useDeliveryReview). */
let latestReviewIssues: string[] = [];
let latestReviewSummary = "";
let autoHandleBusy = false;
/** Bumped when Auto-fix starts so an in-flight validate cannot finish after it. */
let reviewEpoch = 0;

export function bumpDeliveryReviewEpoch(): number {
  reviewEpoch += 1;
  return reviewEpoch;
}

export function deliveryReviewEpoch(): number {
  return reviewEpoch;
}

export function setDeliveryAutoHandleReviewContext(input: {
  issues: string[];
  summary: string;
}): void {
  latestReviewIssues = input.issues.map((issue) => issue.trim()).filter(Boolean);
  latestReviewSummary = input.summary.trim();
}

export function isDeliveryAutoHandleBusy(): boolean {
  return autoHandleBusy;
}

function gapText(ids: readonly string[]): string {
  return [...new Set(ids)].map((id) => i18n.t(`panel.requirements.gap.${id}`)).join("、");
}

function slicesFor(
  card: DeliveryCard,
  fields: readonly DeliveryCardField[],
  missingByField: ReadonlyMap<DeliveryCardField, string[]>,
): DeliveryAutoFixSlice[] {
  return fields.map((field) => ({
    field,
    current: card[field] ?? "",
    missing: gapText(missingByField.get(field) ?? []),
  }));
}

function liveCard(path: string, moduleId: string): DeliveryCard | null {
  const module = peekDelivery(path)?.modules.find((item) => item.id === moduleId);
  return module && module.status !== "confirmed" ? module.card : null;
}

/**
 * Start the visible auto-fix chat turn (same path as the former right-panel button).
 * Called when the user picks the Auto-fix chip in the requirements dialog.
 */
export async function runDeliveryAutoHandle(): Promise<boolean> {
  if (autoHandleBusy) return false;
  const state = useAppStore.getState();
  const path = deliveryProjectPath(state);
  if (!path || !state.activeSessionId) {
    appendDeliveryChatNote(i18n.t("panel.requirements.chatAutoFixBusy"));
    return false;
  }
  if (state.isRunning) {
    appendDeliveryChatNote(i18n.t("panel.requirements.chatAutoFixBusy"));
    return false;
  }
  const desk = peekDelivery(path);
  const module = desk?.modules.find((item) => item.id === desk.activeModuleId) ?? desk?.modules[0];
  if (!module || module.status === "confirmed") return false;
  const card = liveCard(path, module.id);
  if (!card) return false;

  autoHandleBusy = true;
  bumpDeliveryReviewEpoch();
  try {
    const scope = module.id === GLOBAL_MODULE_ID ? "global" : "module";
    const sharedBaseline = new Set<DeliveryCardField>(SHARED_BASELINE_FIELDS);
    const localIssues = deliveryCardIssues(card, scope).filter((issue) => (
      scope === "global" || !sharedBaseline.has(issue.field) || Boolean(card[issue.field].trim())
    ));
    const missingByField = new Map<DeliveryCardField, string[]>();
    for (const issue of localIssues) {
      const prior = missingByField.get(issue.field) ?? [];
      missingByField.set(issue.field, [...prior, ...(issue.missing ?? [])]);
    }
    const selected = selectDeliveryAutoFixFields(card, localIssues);
    const prompt = deliveryAutoFixPrompt({
      moduleId: module.id,
      moduleTitle: module.title || module.id,
      fields: slicesFor(card, selected.write, missingByField),
      context: slicesFor(card, selected.context, missingByField),
      notes: selected.write.length
        ? []
        : [...latestReviewIssues, latestReviewSummary].filter(Boolean),
    });
    setDeliveryAutoFixFields(selected.write);
    const accepted = await useAppStore.getState().sendPrompt(prompt);
    if (!accepted) {
      setDeliveryAutoFixFields(null);
      appendDeliveryChatNote(i18n.t("panel.requirements.chatAutoFixBusy"));
      return false;
    }
    return true;
  } catch (error) {
    setDeliveryAutoFixFields(null);
    const summary = error instanceof Error ? error.message : "Review failed";
    appendDeliveryChatNote(i18n.t("panel.requirements.chatAutoFixFail", { msg: summary }));
    return false;
  } finally {
    autoHandleBusy = false;
  }
}

/** Offer Auto-fix as a dialog chip (not a right-panel button). */
export function offerDeliveryAutoHandleInChat(message: string): void {
  appendDeliveryChatNote(message, { choices: [DELIVERY_AUTO_HANDLE_ACTION] });
}

/** Drop a trailing Auto-fix note so a guiding question stays the latest turn. */
export function retractDeliveryAutoHandleNote(): void {
  const state = useAppStore.getState();
  const last = state.messages.at(-1);
  if (!last || !parseDeliveryGateChoices(last.content).includes(DELIVERY_AUTO_HANDLE_ACTION)) return;
  useAppStore.setState({ messages: state.messages.slice(0, -1) });
}
