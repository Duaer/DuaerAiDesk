import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { fillDeliveryFromMessage } from "../../lib/delivery-chat.ts";
import { beginArchitectureDesign } from "../../lib/delivery-architecture";
import { deliveryCardIssues } from "../../lib/delivery-card-check.ts";
import {
  confirmDeliveryModule,
  ensureDelivery,
  GLOBAL_MODULE_ID,
  moduleCanConfirm,
  noteDeliveryIteration,
  peekDelivery,
  selectDeliveryModule,
  setDeliveryBackground,
  updateDeliveryCard,
  updateDeliveryModuleTitle,
  type DeliveryCardField,
} from "../../lib/delivery-desk";
import { parseReqBlocks, reqEditModel, serializeReqEdit, type ReqBlock } from "../../lib/req-structure.ts";
import { deliveryProjectPath, useDeliveryDesk } from "../../lib/use-delivery-desk";
import { DELIVERY_REVIEW_FIELDS, fillEmptyBaseline } from "../../lib/delivery-review.ts";
import { useDeliveryReview } from "../../lib/use-delivery-review";
import { useAppStore } from "../../stores/app-store";

const FIELDS: Array<{ field: DeliveryCardField; label: string; hint?: string; placeholder?: string }> = [
  { field: "goal", label: "goal" },
  { field: "outOfScope", label: "out" },
  { field: "acceptance", label: "accept", hint: "acceptHint" },
  { field: "assumptions", label: "assume" },
  { field: "deviceMatrix", label: "device", hint: "deviceHint", placeholder: "devicePh" },
  { field: "criticalPaths", label: "paths", hint: "pathsHint", placeholder: "pathsPh" },
  { field: "exceptionCases", label: "exceptions", hint: "exceptionsHint", placeholder: "exceptionsPh" },
  { field: "apiContract", label: "apiContract", hint: "apiContractHint", placeholder: "apiContractPh" },
  { field: "envChecklist", label: "envChecklist", hint: "envChecklistHint", placeholder: "envChecklistPh" },
  { field: "dataPrecheck", label: "dataPrecheck", hint: "dataPrecheckHint", placeholder: "dataPrecheckPh" },
  { field: "externalDeps", label: "externalDeps", hint: "externalDepsHint", placeholder: "externalDepsPh" },
  { field: "perfBudget", label: "perfBudget", hint: "perfBudgetHint", placeholder: "perfBudgetPh" },
];

const CORE_FIELDS = FIELDS.slice(0, 4);
const OVERALL_FIELDS: Array<{ field: DeliveryCardField; label: string; hint: string }> = [
  { field: "style", label: "style", hint: "styleHint" },
  { field: "layout", label: "layout", hint: "layoutHint" },
];
const BASELINE_FIELDS = FIELDS.slice(4);

function ReqBlocks({ blocks }: { blocks: ReqBlock[] }) {
  if (!blocks.length) return null;
  return (
    <>
      {blocks.map((block, index) => {
        if (block.kind === "section") {
          return (
            <section key={`${block.title}-${index}`} className="req-mod">
              <h4 className="req-mod-title">{block.title}</h4>
              <ReqBlocks blocks={block.blocks} />
            </section>
          );
        }
        if (block.kind === "para") {
          return (
            <p key={index} className="req-para">
              {block.items.map((item, itemIndex) => (
                <span key={itemIndex}>{itemIndex > 0 ? <br /> : null}{item}</span>
              ))}
            </p>
          );
        }
        const Tag = block.kind === "ol" ? "ol" : "ul";
        return (
          <Tag key={index} className={`req-list${block.kind === "ol" ? " req-list-num" : ""}`}>
            {block.items.map((item, itemIndex) => <li key={itemIndex} className="req-item">{item}</li>)}
          </Tag>
        );
      })}
    </>
  );
}

function RequirementField({
  label,
  hint,
  placeholder,
  value,
  invalid,
  readOnly,
  onChange,
}: {
  label: string;
  hint?: string;
  placeholder: string;
  value: string;
  invalid: boolean;
  readOnly: boolean;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const [mode, setMode] = useState<"ul" | "ol" | "para">("ul");
  const blocks = parseReqBlocks(value);

  const startEdit = () => {
    if (readOnly) return;
    const model = reqEditModel(value);
    setMode(model.mode);
    setDraft(model.items.length ? model.items : [""]);
    setEditing(true);
  };

  const commit = (items: string[]) => {
    onChange(serializeReqEdit(mode, items));
    setEditing(false);
  };

  return (
    <div
      className={`requirements-field${invalid ? " is-invalid" : ""}`}
      onBlur={(event) => {
        if (!editing) return;
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        commit(draft);
      }}
    >
      <span>{label}</span>
      {hint ? <p className="requirements-hint">{hint}</p> : null}
      {editing ? (
        <div className="req-editor">
          {mode === "ol" ? (
            <ol className="req-list req-edit-list req-list-num">
              {draft.map((item, index) => (
                <li key={index} className="req-item req-item-edit">
                  <textarea
                    className="req-item-input"
                    rows={1}
                    value={item}
                    aria-label={placeholder}
                    onChange={(event) => setDraft(draft.map((row, rowIndex) => rowIndex === index ? event.target.value : row))}
                  />
                  <button type="button" className="req-item-remove" aria-label={t("panel.requirements.reqRemove")} onClick={() => setDraft(draft.filter((_, rowIndex) => rowIndex !== index))}>×</button>
                </li>
              ))}
            </ol>
          ) : (
            <ul className="req-list req-edit-list">
              {draft.map((item, index) => (
                <li key={index} className="req-item req-item-edit">
                  <textarea
                    className="req-item-input"
                    rows={1}
                    value={item}
                    aria-label={placeholder}
                    onChange={(event) => setDraft(draft.map((row, rowIndex) => rowIndex === index ? event.target.value : row))}
                  />
                  <button type="button" className="req-item-remove" aria-label={t("panel.requirements.reqRemove")} onClick={() => setDraft(draft.filter((_, rowIndex) => rowIndex !== index))}>×</button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="req-add-item" onClick={() => setDraft([...draft, ""])}>
            {t("panel.requirements.reqAdd")}
          </button>
        </div>
      ) : (
        <div
          className="req-structured"
          role="button"
          tabIndex={readOnly ? -1 : 0}
          onClick={startEdit}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              startEdit();
            }
          }}
        >
          {blocks.length ? <ReqBlocks blocks={blocks} /> : <p className="req-empty">{placeholder}</p>}
        </div>
      )}
    </div>
  );
}

export function RequirementsTab() {
  const { t } = useTranslation();
  const path = useAppStore(deliveryProjectPath);
  const messages = useAppStore((state) => state.messages);
  const activeSessionId = useAppStore((state) => state.activeSessionId);
  const turnRunning = useAppStore((state) => (
    activeSessionId ? state.runningSessions[activeSessionId] === true : false
  ));
  const shown = useDeliveryDesk(path);
  const [backgroundDraft, setBackgroundDraft] = useState<string | null>(null);
  const fillCursorRef = useRef<{ path: string | null; sig: string | null }>({
    path: null,
    sig: null,
  });
  useEffect(() => {
    if (path) ensureDelivery(path);
  }, [path]);
  useEffect(() => {
    if (!path) return;
    // Desk state is already persisted. Only the live tail is applied, and it is
    // applied again as that row grows — replaying the whole transcript resets
    // activeModuleId and snaps the module tab back after the user switches.
    // One paint is enough: token-by-token commits make the card hitch.
    const frame = requestAnimationFrame(() => {
      const last = messages[messages.length - 1];
      const text = last?.content || "";
      const sig = last ? `${last.id}\0${text.length}\0${text.slice(-32)}` : "";
      if (fillCursorRef.current.path !== path) {
        fillCursorRef.current = { path, sig };
        return;
      }
      if (!last || sig === fillCursorRef.current.sig) return;
      fillCursorRef.current.sig = sig;
      fillDeliveryFromMessage(path, last.role, text);
    });
    return () => cancelAnimationFrame(frame);
  }, [messages, path]);
  const module = shown?.modules.find((item) => item.id === shown.activeModuleId) ?? shown?.modules[0];
  useEffect(() => {
    if (!path || !module || module.id !== GLOBAL_MODULE_ID || module.status === "confirmed" || turnRunning) return;
    const next = fillEmptyBaseline(module.card, "global");
    if (next === module.card) return;
    for (const field of DELIVERY_REVIEW_FIELDS) {
      if (next[field] === module.card[field]) continue;
      updateDeliveryCard(path, module.id, field, next[field]);
    }
  }, [module, path, turnRunning]);
  const { review, fingerprint } = useDeliveryReview(path, module);

  if (!path) {
    return <p className="requirements-empty">{t("panel.requirements.empty")}</p>;
  }
  if (!shown || !module) return null;

  const locked = module.status === "confirmed";
  const globalModule = module.id === GLOBAL_MODULE_ID;
  const ordered = [...shown.modules].sort((left, right) => (
    Number(left.id !== GLOBAL_MODULE_ID) - Number(right.id !== GLOBAL_MODULE_ID)
  ));
  const allConfirmed = shown.modules.every((item) => item.status === "confirmed");
  const issues = locked ? [] : deliveryCardIssues(module.card, globalModule ? "global" : "module");
  const invalid = new Set(issues.map((issue) => issue.field));
  const done = shown.modules.filter((item) => item.status === "confirmed").length;
  const reviewForCard = review.fingerprint === fingerprint;
  const reviewed = reviewForCard && review.status === "passed";
  const hint = allConfirmed
    ? t("panel.requirements.lockHintLocked")
    : locked
      ? t("panel.requirements.lockHintModuleDone")
      : issues.length > 0
        ? t(globalModule ? "panel.requirements.lockHintNeed" : "panel.requirements.lockHintNeedModule")
        : reviewForCard && review.status === "checking"
          ? t("panel.requirements.lockHintChecking")
          : reviewForCard && review.status === "failed"
            ? (review.summary || t("panel.requirements.lockHintFailed"))
            : reviewed
              ? t("panel.requirements.lockHintReady")
              : t("panel.requirements.lockHintNeedValidate");

  const featureModules = ordered.filter((item) => item.id !== GLOBAL_MODULE_ID);
  return (
    <div className="requirements-panel">
      <section className="requirements-background" aria-label={t("panel.requirements.background")}>
        <label className="requirements-field">
          <span>{t("panel.requirements.background")}</span>
          <textarea
            rows={3}
            value={backgroundDraft ?? shown.background}
            placeholder={t("panel.requirements.backgroundPh")}
            onChange={(event) => setBackgroundDraft(event.target.value)}
            onBlur={() => {
              const text = (backgroundDraft ?? shown.background).trim();
              setDeliveryBackground(path, text);
              if (text) noteDeliveryIteration(path, text);
              setBackgroundDraft(null);
            }}
          />
        </label>
        {shown.iterations.length ? (
          <ol className="requirements-timeline">
            {shown.iterations.map((item, index) => (
              <li key={`${item.at}-${index}`}>
                {item.at ? <time dateTime={item.at}>{new Date(item.at).toLocaleString()}</time> : null}
                <span>{item.summary}</span>
              </li>
            ))}
          </ol>
        ) : null}
      </section>
      <div className="requirements-modules" role="tablist" aria-label={t("panel.requirements.modules")}>
        {ordered.map((item) => {
          const featureIndex = featureModules.findIndex((feature) => feature.id === item.id);
          const title = item.id === GLOBAL_MODULE_ID
            ? (item.title.trim() || t("panel.requirements.global"))
            : (item.title.trim() || t("panel.requirements.moduleLabel", { n: featureIndex + 1 }));
          const status = item.status === "confirmed"
            ? t("panel.requirements.confirmed")
            : moduleCanConfirm(item)
              ? t("panel.requirements.moduleReady")
              : t("panel.requirements.moduleDraft");
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={item.id === module.id}
              className={`requirements-module${item.id === module.id ? " is-active" : ""}${item.status === "confirmed" ? " is-confirmed" : ""}`}
              onClick={() => selectDeliveryModule(path, item.id)}
            >
              {title} · {status}
            </button>
          );
        })}
      </div>
      <p className="requirements-hint">
        {t("panel.requirements.progress", { done, total: shown.modules.length })}
      </p>
      <label className="requirements-field">
        <span>{t("panel.requirements.moduleName")}</span>
        <input
          readOnly={locked}
          value={module.title}
          placeholder={globalModule
            ? t("panel.requirements.global")
            : t("panel.requirements.moduleLabel", { n: featureModules.findIndex((item) => item.id === module.id) + 1 })}
          onChange={(event) => updateDeliveryModuleTitle(path, module.id, event.target.value)}
        />
      </label>
      {shown.revision ? (
        <section className="requirements-revision" aria-label={t("panel.requirements.reviseTitle")}>
          <p className="architecture-title">{t("panel.requirements.reviseTitle")}</p>
          <p className="requirements-hint">
            {shown.revision.scope === "module"
              ? t("panel.requirements.reviseModule", { id: shown.revision.moduleId || module.id })
              : t("panel.requirements.reviseOverall")}
          </p>
          {shown.revision.goal ? <p className="requirements-hint">{t("panel.requirements.reviseGoal")}: {shown.revision.goal}</p> : null}
          {shown.revision.outOfScope ? <p className="requirements-hint">{t("panel.requirements.reviseKeep")}: {shown.revision.outOfScope}</p> : null}
          {shown.revision.acceptance ? <p className="requirements-hint">{t("panel.requirements.reviseAccept")}: {shown.revision.acceptance}</p> : null}
          {shown.revision.assumptions ? <p className="requirements-hint">{t("panel.requirements.reviseWhy")}: {shown.revision.assumptions}</p> : null}
        </section>
      ) : null}
      {globalModule ? OVERALL_FIELDS.map((item) => (
        <RequirementField
          key={item.field}
          label={t(`panel.requirements.${item.label}`)}
          hint={t(`panel.requirements.${item.hint}`)}
          placeholder={t("panel.requirements.placeholder")}
          value={module.card[item.field]}
          invalid={invalid.has(item.field)}
          readOnly={locked}
          onChange={(value) => updateDeliveryCard(path, module.id, item.field, value)}
        />
      )) : null}
      {CORE_FIELDS.map((item) => (
        <RequirementField
          key={item.field}
          label={t(`panel.requirements.${item.label}`)}
          hint={item.hint ? t(`panel.requirements.${item.hint}`) : undefined}
          placeholder={t(`panel.requirements.${item.placeholder ?? "placeholder"}`)}
          value={module.card[item.field]}
          invalid={invalid.has(item.field)}
          readOnly={locked}
          onChange={(value) => updateDeliveryCard(path, module.id, item.field, value)}
        />
      ))}
      <p className="requirements-hint">
        {globalModule ? t("panel.requirements.baseline") : t("panel.requirements.moduleBaseline")}
      </p>
      {BASELINE_FIELDS.map((item) => (
        <RequirementField
          key={item.field}
          label={t(`panel.requirements.${item.label}`)}
          hint={item.hint ? t(`panel.requirements.${item.hint}`) : undefined}
          placeholder={t(`panel.requirements.${item.placeholder ?? "placeholder"}`)}
          value={module.card[item.field]}
          invalid={invalid.has(item.field)}
          readOnly={locked}
          onChange={(value) => updateDeliveryCard(path, module.id, item.field, value)}
        />
      ))}
      {allConfirmed ? null : <p className="requirements-hint">{hint}</p>}
      {issues.length > 0 ? (
        <ul className="requirements-issues">
          {issues.map((issue) => {
            const missing = (issue.missing ?? [])
              .map((id) => t(`panel.requirements.gap.${id}`))
              .join(", ");
            return (
              <li key={`${issue.field}-${issue.code}`}>{t(`panel.requirements.issue.${issue.code}`, { missing })}</li>
            );
          })}
        </ul>
      ) : null}
      {review.status === "failed" && review.issues.length > 0 ? (
        <ul className="requirements-issues">
          {review.issues.map((issue) => <li key={issue}>{issue}</li>)}
        </ul>
      ) : null}
      <div className={allConfirmed ? "requirements-lock-row" : undefined}>
        {allConfirmed ? <span className="requirements-hint">{hint}</span> : null}
        <button
          type="button"
          className="requirements-confirm"
          disabled={!moduleCanConfirm(module) || !reviewed}
          onClick={() => {
            confirmDeliveryModule(path, module.id);
            const desk = peekDelivery(path);
            if (desk?.modules.every((item) => item.status === "confirmed")) {
              void beginArchitectureDesign(path, { kickoff: true });
            }
          }}
        >
          {allConfirmed ? t("panel.requirements.allConfirmed") : locked ? t("panel.requirements.confirmed") : t("panel.requirements.confirm")}
        </button>
        {allConfirmed ? (
          <button
            type="button"
            className="requirements-add"
            onClick={() => void beginArchitectureDesign(path, { kickoff: true })}
          >
            {t("panel.architecture.open")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
