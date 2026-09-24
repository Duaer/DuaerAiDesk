import { useTranslation } from "react-i18next";
import {
  modelIdsMatch,
  type AppSettings,
  type ImageGenerationBinding,
  type ProviderPublic,
} from "@duaer-ai-desk/shared";
import { imageGenerationBindingAvailable } from "./image-generation-default";

function judgmentModelOptionId(binding: ImageGenerationBinding): string {
  return `${binding.providerId}\u0000${binding.modelId}`;
}

/**
 * Defaults-panel row for the judgment model. Same show and hide rules as the
 * image-generation row: nothing marked, or nothing that can actually run,
 * leaves the row out.
 */
export function JudgmentModelRow({
  settings,
  providers,
}: {
  settings: AppSettings;
  providers: ProviderPublic[];
}) {
  const { t } = useTranslation();
  const binding = settings.judgmentModel ?? null;
  const candidates = binding?.providerId && binding.modelId ? [binding] : [];
  if (candidates.length === 0) return null;

  const activeCandidate = binding
    ? candidates.find((candidate) =>
      candidate.providerId === binding.providerId &&
      modelIdsMatch(candidate.modelId, binding.modelId),
    )
    : undefined;
  const provider = binding
    ? providers.find((entry) => entry.id === binding.providerId)
    : undefined;
  const valid = !!activeCandidate &&
    imageGenerationBindingAvailable(provider, activeCandidate.modelId);
  const options = candidates.map((candidate) => {
    const candidateProvider = providers.find((entry) => entry.id === candidate.providerId);
    return {
      id: judgmentModelOptionId(candidate),
      disabled: !imageGenerationBindingAvailable(candidateProvider, candidate.modelId),
    };
  });
  if (!options.some((option) => !option.disabled)) return null;

  return (
    <div className="settings-row model-default-row model-image-row">
      <div className="settings-row-copy model-default-copy">
        <div className="settings-row-title model-default-label">{t("settings.judgmentModel")}</div>
        <div className="settings-row-detail model-default-value">
          {valid && provider && binding ? (
            <>
              <span className="model-default-provider">{provider.name}</span>
              <span className="model-default-sep" aria-hidden>·</span>
              <span className="model-default-model font-mono">{binding.modelId}</span>
            </>
          ) : (
            <span className="model-default-empty" role="status">
              {t(activeCandidate ? "settings.judgmentModelUnavailable" : "settings.judgmentModelUnset")}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
