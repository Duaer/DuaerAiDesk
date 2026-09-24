import { useSyncExternalStore } from "react";
import { normalizeProjectPath } from "./sidebar-preferences";
import { peekDelivery, subscribeDelivery, type DeliveryDesk } from "./delivery-desk";

export function deliveryProjectPath(state: {
  activeSessionId?: string;
  activeProjectPath?: string | null;
  sessions: ReadonlyArray<{ id: string; projectPath?: string | null }>;
}): string | null {
  const session = state.sessions.find((item) => item.id === state.activeSessionId);
  return normalizeProjectPath(session?.projectPath || state.activeProjectPath);
}

export function useDeliveryDesk(projectPath?: string | null): DeliveryDesk | null {
  return useSyncExternalStore(
    subscribeDelivery,
    () => peekDelivery(projectPath),
    () => null,
  );
}
