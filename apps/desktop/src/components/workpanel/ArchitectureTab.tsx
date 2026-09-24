import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  loadArchitectureHtml,
  offerArchitectureDecision,
  renderArchitectureFromDesk,
} from "../../lib/delivery-architecture";
import {
  ensureDelivery,
  updateArchitectureSummary,
} from "../../lib/delivery-desk";
import { deliveryProjectPath, useDeliveryDesk } from "../../lib/use-delivery-desk";
import { useAppStore } from "../../stores/app-store";
import { ArchitectureMount } from "./ArchitectureMount";

export function ArchitectureTab() {
  const { t } = useTranslation();
  const path = useAppStore(deliveryProjectPath);
  const shown = useDeliveryDesk(path);
  const isRunning = useAppStore((state) => state.isRunning);
  const [diagramHtml, setDiagramHtml] = useState<string | null>(null);

  useEffect(() => {
    if (path) ensureDelivery(path);
  }, [path]);

  const diagramKey = shown?.architecture.diagramKey?.trim() || "";
  const modulesConfirmed = Boolean(
    shown?.modules.length && shown.modules.every((module) => module.status === "confirmed"),
  );
  const locked = shown?.architecture.status === "confirmed";
  const componentCount = shown?.architecture.components.length ?? 0;
  const autoRenderedFor = useRef("");

  useEffect(() => {
    let cancelled = false;
    if (!diagramKey) {
      setDiagramHtml(null);
      return;
    }
    void loadArchitectureHtml(diagramKey).then((html) => {
      if (!cancelled) setDiagramHtml(html);
    });
    return () => {
      cancelled = true;
    };
  }, [diagramKey]);

  // Live desk renders Archify as soon as architecture data exists. The panel
  // must not wait on a Render button once confirmed modules have components.
  useEffect(() => {
    if (diagramKey) {
      autoRenderedFor.current = "";
      return;
    }
    if (!path || !modulesConfirmed || locked || isRunning || componentCount === 0) return;
    if (autoRenderedFor.current === path) return;
    autoRenderedFor.current = path;
    void renderArchitectureFromDesk(path);
  }, [componentCount, diagramKey, isRunning, locked, modulesConfirmed, path]);

  useEffect(() => {
    if (!path || !shown || locked || isRunning) return;
    if (!modulesConfirmed) return;
    offerArchitectureDecision(path);
  }, [isRunning, locked, modulesConfirmed, path, shown]);

  if (!path) {
    return <p className="requirements-empty">{t("panel.requirements.empty")}</p>;
  }
  if (!shown) return null;

  const confirmed = shown.modules.every((module) => module.status === "confirmed");
  if (!confirmed) {
    return (
      <div className="architecture-panel">
        <p className="architecture-title">{t("panel.architecture.title")}</p>
        <p className="architecture-hint">{t("panel.architecture.needModules")}</p>
      </div>
    );
  }

  const architecture = shown.architecture;
  const hasDiagram = Boolean(diagramKey && diagramHtml);
  const hint = locked
    ? t("panel.architecture.hintConfirmed")
    : hasDiagram
      ? t("panel.architecture.hintPreview")
      : t("panel.architecture.hintDesigning");

  return (
    <div className="architecture-panel" data-testid="architecture-panel">
      <p className="architecture-title">{t("panel.architecture.title")}</p>
      <p className="architecture-hint">{hint}</p>
      {architecture.summary.trim() || !locked ? (
        locked ? (
          <p className="architecture-summary">{architecture.summary}</p>
        ) : (
          <label className="architecture-summary-edit">
            <span className="visually-hidden">{t("panel.architecture.summary")}</span>
            <textarea
              rows={2}
              value={architecture.summary}
              placeholder={t("panel.architecture.summaryPh")}
              onChange={(event) => updateArchitectureSummary(path, event.target.value)}
            />
          </label>
        )
      ) : null}

      <ArchitectureMount
        html={diagramHtml}
        diagramKey={diagramKey || undefined}
        emptyLabel={t("panel.architecture.mountEmpty")}
        aria-label={t("panel.architecture.components")}
      />
    </div>
  );
}
