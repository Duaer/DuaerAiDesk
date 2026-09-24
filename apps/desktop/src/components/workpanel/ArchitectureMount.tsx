import { useEffect, useRef } from "react";

type MountModule = {
  mountArchitectureHtml: (
    host: HTMLElement,
    html: string,
    opts?: { key?: string; stage?: boolean; straighten?: boolean },
  ) => Promise<boolean>;
  clearArchitectureMount: (host: HTMLElement) => void;
};

/**
 * Shadow-DOM host for Archify HTML (same mount path as Duaer live desk).
 * https://tt-a1i.github.io/archify/
 */
export function ArchitectureMount(props: {
  html: string | null;
  diagramKey?: string;
  emptyLabel: string;
  "aria-label"?: string;
  stage?: boolean;
  straighten?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const html = props.html?.trim() ? props.html : null;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    void (async () => {
      const mod = (await import("../../lib/architecture-mount.mjs")) as MountModule;
      if (cancelled || !hostRef.current) return;
      if (!html) {
        mod.clearArchitectureMount(hostRef.current);
        return;
      }
      try {
        // Remount applies the current diagram size (authored units, not panel stretch).
        await mod.mountArchitectureHtml(hostRef.current, html, {
          key: props.diagramKey,
          stage: props.stage,
          straighten: props.straighten,
        });
      } catch {
        mod.clearArchitectureMount(hostRef.current);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [html, props.diagramKey, props.stage, props.straighten]);

  return (
    <div
      ref={hostRef}
      className="architecture-mount"
      aria-label={props["aria-label"]}
      data-empty={!html ? "true" : undefined}
    >
      {!html ? <p className="architecture-mount-empty">{props.emptyLabel}</p> : null}
    </div>
  );
}
