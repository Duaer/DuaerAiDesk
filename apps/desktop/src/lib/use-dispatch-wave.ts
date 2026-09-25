import { useEffect } from "react";
import { useAppStore } from "../stores/app-store";
import { advanceDispatchWave } from "./delivery-dispatch-chat.ts";
import { deliveryProjectPath, useDeliveryDesk } from "./use-delivery-desk.ts";

/**
 * Release the next dispatch wave whenever the chat goes idle.
 * The dispatch tab can be closed; queued tasks still start.
 */
export function useDispatchWave(): void {
  const path = useAppStore(deliveryProjectPath);
  const isRunning = useAppStore((state) => state.isRunning);
  const messages = useAppStore((state) => state.messages);
  const stage = useDeliveryDesk(path)?.stage;
  useEffect(() => {
    if (!path || stage !== "building" || isRunning) return;
    void advanceDispatchWave(path);
  }, [isRunning, messages, path, stage]);
}
