import { useEffect, useRef, useState } from "react";
import i18n from "i18next";
import { api } from "./api";
import { deliveryCardIssues, deliveryCardStillGathering, type DeliveryCheckScope } from "./delivery-card-check.ts";
import {
  appendDeliveryChatNote,
  replaceDeliveryChatNote,
  retractDeliveryChatNote,
} from "./delivery-chat-note.ts";
import {
  bumpDeliveryReviewEpoch,
  deliveryReviewEpoch,
  offerDeliveryAutoHandleInChat,
  retractDeliveryAutoHandleNote,
  runDeliveryAutoHandle,
  setDeliveryAutoHandleReviewContext,
} from "./delivery-auto-handle.ts";
import {
  DELIVERY_AUTO_HANDLE_ACTION,
  isDeliveryGateNote,
  shouldOfferDeliveryAutoHandle,
  withoutStaleValidateStarts,
} from "./delivery-chat.ts";
import {
  deliveryCardFingerprint,
  type DeliveryReviewState,
} from "./delivery-review.ts";
import {
  GLOBAL_MODULE_ID,
  peekDelivery,
  replaceDeliveryCard,
  type DeliveryCard,
  type DeliveryModule,
} from "./delivery-desk.ts";
import { useAppStore } from "../stores/app-store";

const IDLE: DeliveryReviewState = { status: "idle", fingerprint: "", summary: "", issues: [] };

function reviewScope(path: string, moduleId: string): DeliveryCheckScope {
  if (peekDelivery(path)?.intake?.kind === "bug") return "bug";
  return moduleId === GLOBAL_MODULE_ID ? "global" : "module";
}

/**
 * Survives RequirementsTab remounts (HMR / Strict Mode) so the same card is not
 * re-validated forever, which previously left the UI stuck on “checking…” and
 * spammed GATE notes into the requirements chat.
 */
const settledReviews = new Map<string, DeliveryReviewState>();
const narratedStarts = new Set<string>();
const narratedStartIds = new Map<string, string>();
const autoHandleOffers = new Set<string>();
const offeredTail = new Map<string, string>();

function settleKey(path: string, moduleId: string, fingerprint: string): string {
  return `${path}\0${moduleId}\0${fingerprint}`;
}

function rememberSettled(path: string, moduleId: string, state: DeliveryReviewState): void {
  if (state.status !== "passed" && state.status !== "failed") return;
  if (!state.fingerprint) return;
  settledReviews.set(settleKey(path, moduleId, state.fingerprint), state);
}

function composerModel(): { sessionId?: string | null; providerId?: string; modelId?: string } {
  const state = useAppStore.getState();
  const session = state.sessions.find((item) => item.id === state.activeSessionId);
  const judgment = state.settings?.judgmentModel;
  return {
    sessionId: state.activeSessionId,
    providerId: judgment?.providerId
      || session?.providerId
      || state.draftConfiguration?.providerId
      || state.settings?.defaultProviderId,
    modelId: judgment?.modelId
      || session?.modelId
      || state.draftConfiguration?.modelId
      || state.settings?.defaultModelId,
  };
}

function liveCard(path: string, moduleId: string): DeliveryCard | null {
  const module = peekDelivery(path)?.modules.find((item) => item.id === moduleId);
  return module && module.status !== "confirmed" ? module.card : null;
}

function noteIssues(issues: string[]): string {
  const lines = issues.map((issue) => issue.trim()).filter(Boolean).slice(0, 8);
  return lines.length ? `\n${lines.map((issue) => `- ${issue}`).join("\n")}` : "";
}

function dropStartNote(key: string): void {
  const id = narratedStartIds.get(key);
  narratedStartIds.delete(key);
  narratedStarts.delete(key);
  if (id) retractDeliveryChatNote(id);
}

function dropModuleStartNotes(path: string, moduleId: string): void {
  const prefix = `${path}\0${moduleId}\0`;
  for (const key of [...narratedStartIds.keys()]) {
    if (key.startsWith(prefix)) dropStartNote(key);
  }
}

function passPrefix(): string {
  return i18n.t("panel.requirements.chatValidatePassed", { summary: "\u0000" }).split("\u0000")[0] ?? "";
}

/** Remove a checking line that already has a pass note under it. */
function clearStaleValidateStarts(): void {
  const state = useAppStore.getState();
  const next = withoutStaleValidateStarts(
    state.messages,
    i18n.t("panel.requirements.chatValidateStart"),
    passPrefix(),
  );
  if (next.length === state.messages.length) return;
  const live = new Set(next.map((message) => message.id));
  for (const [key, id] of narratedStartIds) {
    if (!live.has(id)) narratedStartIds.delete(key);
  }
  useAppStore.setState({ messages: next });
}

function narrateOutcome(key: string, message: string): void {
  const id = narratedStartIds.get(key) ?? "";
  if (id && replaceDeliveryChatNote(id, message)) return;
  if (id) dropStartNote(key);
  const created = appendDeliveryChatNote(message);
  if (created) narratedStartIds.set(key, created);
}

function offerAutoHandle(path: string, moduleId: string, fingerprint: string, message: string): void {
  const state = useAppStore.getState();
  const last = state.messages.at(-1);
  if (!shouldOfferDeliveryAutoHandle(last?.content, state.isRunning)) return;
  const key = settleKey(path, moduleId, fingerprint);
  if (autoHandleOffers.has(key) && last?.id === offeredTail.get(key)) return;
  autoHandleOffers.add(key);
  offerDeliveryAutoHandleInChat(message);
  offeredTail.set(key, useAppStore.getState().messages.at(-1)?.id ?? "");
}

function narrateFailure(path: string, moduleId: string, fingerprint: string, message: string): void {
  const key = settleKey(path, moduleId, fingerprint);
  const id = narratedStartIds.get(key) ?? "";
  const lastId = useAppStore.getState().messages.at(-1)?.id ?? "";
  if (
    id
    && id === lastId
    && replaceDeliveryChatNote(id, message, { choices: [DELIVERY_AUTO_HANDLE_ACTION] })
  ) {
    autoHandleOffers.add(key);
    offeredTail.set(key, id);
    return;
  }
  if (id) dropStartNote(key);
  offerAutoHandle(path, moduleId, fingerprint, message);
}

/**
 * Debounced model review for one requirements module.
 * Confirm stays off until this review passes for the current card fingerprint.
 * Auto-fix is offered as a dialog chip (not a right-panel button).
 */
export function useDeliveryReview(path: string | null, module: DeliveryModule | undefined) {
  const [review, setReview] = useState<DeliveryReviewState>(IDLE);
  const reviewRef = useRef(review);
  const seqRef = useRef(0);
  const pendingRef = useRef(false);
  reviewRef.current = review;

  const moduleId = module?.id;
  const locked = module?.status === "confirmed";
  const fingerprint = module ? deliveryCardFingerprint(module.card) : "";
  const tailId = useAppStore((state) => {
    for (let index = state.messages.length - 1; index >= 0; index -= 1) {
      const message = state.messages[index];
      if (!message || isDeliveryGateNote(message.content || "")) continue;
      return message.id;
    }
    return "";
  });
  const isRunning = useAppStore((state) => state.isRunning);

  function publish(next: DeliveryReviewState) {
    reviewRef.current = next;
    setReview(next);
    setDeliveryAutoHandleReviewContext({
      issues: next.status === "failed" ? next.issues : [],
      summary: next.status === "failed" ? next.summary : "",
    });
  }

  function abandonChecking(seq: number, expectedFp: string): "skipped" {
    if (seq !== seqRef.current) return "skipped";
    if (path && moduleId) dropStartNote(settleKey(path, moduleId, expectedFp));
    if (
      reviewRef.current.status === "checking"
      && reviewRef.current.fingerprint === expectedFp
    ) {
      publish(IDLE);
    }
    return "skipped";
  }

  async function runValidate(
    seq: number,
    expectedFp: string,
    options: { narrate?: boolean } = {},
  ): Promise<"passed" | "failed" | "skipped"> {
    const narrate = options.narrate !== false;
    if (!path || !moduleId) return abandonChecking(seq, expectedFp);
    if (seq !== seqRef.current) return "skipped";
    const card = liveCard(path, moduleId);
    if (!card || deliveryCardFingerprint(card) !== expectedFp || deliveryCardIssues(card, reviewScope(path, moduleId)).length > 0) {
      return abandonChecking(seq, expectedFp);
    }
    const startKey = settleKey(path, moduleId, expectedFp);
    if (narrate && !narratedStartIds.has(startKey)) {
      const id = appendDeliveryChatNote(i18n.t("panel.requirements.chatValidateStart"));
      if (id) {
        narratedStarts.add(startKey);
        narratedStartIds.set(startKey, id);
      }
    }
    const epoch = deliveryReviewEpoch();
    try {
      const result = await api.reviewDeliveryCard({
        mode: "validate",
        card,
        ...composerModel(),
      });
      if (seq !== seqRef.current || epoch !== deliveryReviewEpoch()) return "skipped";
      const again = liveCard(path, moduleId);
      if (!again || deliveryCardFingerprint(again) !== expectedFp) {
        return abandonChecking(seq, expectedFp);
      }
      const rewritten = result.card;
      const passed = result.passed && deliveryCardIssues(rewritten, reviewScope(path, moduleId)).length === 0;
      if (!passed) {
        const failed: DeliveryReviewState = {
          status: "failed",
          fingerprint: expectedFp,
          summary: result.summary,
          issues: result.issues,
        };
        publish(failed);
        rememberSettled(path, moduleId, failed);
        if (narrate) {
          narrateFailure(
            path,
            moduleId,
            expectedFp,
            i18n.t("panel.requirements.chatValidateFailed", {
              summary: result.summary || i18n.t("panel.requirements.lockHintFailed"),
            }) + noteIssues(result.issues),
          );
        }
        return "failed";
      }
      const nextFp = deliveryCardFingerprint(rewritten);
      const ok: DeliveryReviewState = {
        status: "passed",
        fingerprint: nextFp,
        summary: result.summary,
        issues: [],
      };
      publish(ok);
      rememberSettled(path, moduleId, ok);
      if (nextFp !== expectedFp) {
        rememberSettled(path, moduleId, { ...ok, fingerprint: expectedFp });
        replaceDeliveryCard(path, moduleId, rewritten);
      }
      if (narrate) {
        narrateOutcome(
          startKey,
          i18n.t("panel.requirements.chatValidatePassed", {
            summary: result.summary || i18n.t("panel.requirements.lockHintReady"),
          }),
        );
      }
      return "passed";
    } catch (error) {
      if (seq !== seqRef.current) return "skipped";
      const summary = error instanceof Error ? error.message : "Review failed";
      const failed: DeliveryReviewState = {
        status: "failed",
        fingerprint: expectedFp,
        summary,
        issues: [],
      };
      publish(failed);
      rememberSettled(path, moduleId, failed);
      if (narrate) {
        narrateFailure(
          path,
          moduleId,
          expectedFp,
          i18n.t("panel.requirements.chatValidateFailed", { summary }),
        );
      }
      return "failed";
    }
  }

  useEffect(() => {
    clearStaleValidateStarts();
    if (!path || !moduleId || locked) {
      if (path && moduleId) dropModuleStartNotes(path, moduleId);
      seqRef.current += 1;
      pendingRef.current = false;
      publish(IDLE);
      return;
    }
    const card = liveCard(path, moduleId);
    if (!card) return;
    const localIssues = deliveryCardIssues(card, reviewScope(path, moduleId));
    if (localIssues.length > 0) {
      seqRef.current += 1;
      pendingRef.current = false;
      dropModuleStartNotes(path, moduleId);
      if (reviewRef.current.status !== "idle") publish(IDLE);
      // Goal and acceptance are still being asked. Keep that question;
      // do not cover it with Auto-fix.
      if (deliveryCardStillGathering(localIssues)) {
        retractDeliveryAutoHandleNote();
        return;
      }
      // One offer per draft module while local checks fail — not per keystroke fingerprint.
      const lines = localIssues.map((issue) => {
        const missing = (issue.missing ?? [])
          .map((id) => i18n.t(`panel.requirements.gap.${id}`))
          .join(", ");
        return i18n.t(`panel.requirements.issue.${issue.code}`, { missing });
      });
      offerAutoHandle(
        path,
        moduleId,
        "local",
        [i18n.t("panel.requirements.chatNeedAutoHandle"), ...lines].join("\n"),
      );
      return;
    }
    autoHandleOffers.delete(settleKey(path, moduleId, "local"));


    const cached = settledReviews.get(settleKey(path, moduleId, fingerprint));
    if (cached && (cached.status === "passed" || cached.status === "failed")) {
      if (
        reviewRef.current.fingerprint !== cached.fingerprint
        || reviewRef.current.status !== cached.status
      ) {
        publish(cached);
      }
      if (cached.status === "failed") {
        offerAutoHandle(
          path,
          moduleId,
          fingerprint,
          i18n.t("panel.requirements.chatValidateFailed", {
            summary: cached.summary || i18n.t("panel.requirements.lockHintFailed"),
          }) + noteIssues(cached.issues),
        );
      }
      return;
    }

    const current = reviewRef.current;
    if (
      current.fingerprint === fingerprint
      && (current.status === "passed" || current.status === "failed")
    ) {
      rememberSettled(path, moduleId, current);
      return;
    }
    if (current.fingerprint === fingerprint && current.status === "checking" && pendingRef.current) {
      return;
    }

    const seq = ++seqRef.current;
    pendingRef.current = true;
    publish({ status: "checking", fingerprint, summary: "", issues: [] });
    const timer = window.setTimeout(() => {
      void runValidate(seq, fingerprint).finally(() => {
        if (seq === seqRef.current) pendingRef.current = false;
      });
    }, 550);
    return () => {
      window.clearTimeout(timer);
      if (seq === seqRef.current) {
        seqRef.current += 1;
        pendingRef.current = false;
        if (
          reviewRef.current.status === "checking"
          && reviewRef.current.fingerprint === fingerprint
        ) {
          publish(IDLE);
        }
      }
    };
  }, [fingerprint, isRunning, locked, moduleId, path, tailId]);

  async function autoHandle() {
    if (!path || !moduleId || locked) return;
    seqRef.current += 1;
    pendingRef.current = false;
    bumpDeliveryReviewEpoch();
    if (reviewRef.current.status === "checking") publish(IDLE);
    settledReviews.delete(settleKey(path, moduleId, fingerprint));
    dropStartNote(settleKey(path, moduleId, fingerprint));
    autoHandleOffers.delete(settleKey(path, moduleId, fingerprint));
    autoHandleOffers.delete(settleKey(path, moduleId, "local"));
    await runDeliveryAutoHandle();
  }

  return { review, fingerprint, autoHandle };
}
