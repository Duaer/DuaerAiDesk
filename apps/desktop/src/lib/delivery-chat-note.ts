import type { UiMessage } from "@duaer-ai-desk/shared";
import { encodeDeliveryGateNote } from "./delivery-chat.ts";
import { useAppStore } from "../stores/app-store";

/** Append a short assistant note to the active requirements chat (live-desk style). */
export function appendDeliveryChatNote(
  content: string,
  options: { choices?: string[] } = {},
): string | null {
  const text = content.trim();
  if (!text) return null;
  const state = useAppStore.getState();
  const sessionId = state.activeSessionId;
  if (!sessionId) return null;
  const message: UiMessage = {
    id: crypto.randomUUID(),
    role: "assistant",
    content: encodeDeliveryGateNote(text, options.choices ?? []),
    createdAt: new Date().toISOString(),
    status: "complete",
  };
  // UI-only: do not replaceSessionMessages here. That disposes the live agent
  // and re-runs the requirements fill effect over the whole transcript.
  useAppStore.setState({ messages: [...state.messages, message] });
  return message.id;
}

/** Rewrite one gate note in place so a finished review does not leave the start line. */
export function replaceDeliveryChatNote(
  id: string,
  content: string,
  options: { choices?: string[] } = {},
): boolean {
  const text = content.trim();
  if (!id || !text) return false;
  const state = useAppStore.getState();
  const index = state.messages.findIndex((message) => message.id === id);
  if (index < 0) return false;
  const next = state.messages.slice();
  const current = next[index];
  if (!current) return false;
  next[index] = {
    ...current,
    content: encodeDeliveryGateNote(text, options.choices ?? []),
  };
  useAppStore.setState({ messages: next });
  return true;
}

export function retractDeliveryChatNote(id: string): void {
  if (!id) return;
  const state = useAppStore.getState();
  if (!state.messages.some((message) => message.id === id)) return;
  useAppStore.setState({
    messages: state.messages.filter((message) => message.id !== id),
  });
}
