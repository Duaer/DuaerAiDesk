import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button, Input } from "../ui";
import {
  emptyDeployCredentialFlags,
  type DeployCredentialFlags,
  type DeploySecretKey,
} from "../../lib/deploy-hosts";
import { loadDeployCredentialFlags, writeDeploySecret } from "../../lib/deploy-credentials";
import { useAppStore } from "../../stores/app-store";

type Draft = Record<DeploySecretKey, string>;

const EMPTY_DRAFT: Draft = {
  cloudflareToken: "",
  cloudflareAccount: "",
  aliyunId: "",
  aliyunSecret: "",
  awsId: "",
  awsSecret: "",
  awsRegion: "",
};

function pairReady(flags: DeployCredentialFlags, id: DeploySecretKey, secret: DeploySecretKey): boolean {
  return flags[id] && flags[secret];
}

export function DeploySettingsPage() {
  const { t } = useTranslation();
  const showToast = useAppStore((state) => state.showToast);
  const [flags, setFlags] = useState<DeployCredentialFlags>(emptyDeployCredentialFlags);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadDeployCredentialFlags()
      .then((next) => {
        if (!cancelled) setFlags(next);
      })
      .catch(() => {
        if (!cancelled) showToast(t("settings.deploy.saveFailed"), { variant: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [showToast, t]);

  const setField = (key: DeploySecretKey, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const save = async (name: string, keys: DeploySecretKey[]) => {
    setBusy(name);
    try {
      for (const key of keys) await writeDeploySecret(key, draft[key]);
      setDraft((current) => {
        const next = { ...current };
        for (const key of keys) next[key] = "";
        return next;
      });
      setFlags(await loadDeployCredentialFlags());
      window.dispatchEvent(new Event("duaer-deploy"));
      showToast(t("settings.deploy.saved"), { variant: "success" });
    } catch {
      showToast(t("settings.deploy.saveFailed"), { variant: "error" });
    } finally {
      setBusy(null);
    }
  };

  const clear = async (name: string, keys: DeploySecretKey[]) => {
    setBusy(name);
    try {
      for (const key of keys) await writeDeploySecret(key, "", true);
      setDraft((current) => {
        const next = { ...current };
        for (const key of keys) next[key] = "";
        return next;
      });
      setFlags(await loadDeployCredentialFlags());
      window.dispatchEvent(new Event("duaer-deploy"));
    } catch {
      showToast(t("settings.deploy.saveFailed"), { variant: "error" });
    } finally {
      setBusy(null);
    }
  };

  const secretInput = (key: DeploySecretKey, label: string) => (
    <Input
      type="password"
      name={`deploy-${key}`}
      autoComplete="off"
      spellCheck={false}
      aria-label={label}
      value={draft[key]}
      placeholder={flags[key] ? t("settings.deploy.configured") : label}
      onChange={(event) => setField(key, event.target.value)}
    />
  );

  const row = (
    name: string,
    title: string,
    ready: boolean,
    keys: DeploySecretKey[],
    fields: ReactNode,
    wide = false,
  ) => (
    <div className={wide ? "settings-deploy-row is-wide" : "settings-deploy-row"}>
      <span className="settings-deploy-name">
        {title}
        <span className="settings-deploy-state">{ready ? t("settings.deploy.configured") : t("settings.deploy.missing")}</span>
      </span>
      {fields}
      <span className="settings-deploy-actions">
        <Button type="button" size="sm" variant="primary" disabled={busy !== null} onClick={() => void save(name, keys)}>
          {t("settings.deploy.save")}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={busy !== null || !ready} onClick={() => void clear(name, keys)}>
          {t("settings.deploy.clear")}
        </Button>
      </span>
    </div>
  );

  return (
    <div className="settings-deploy">
      <p className="settings-deploy-note">{t("settings.deploy.pagesNote")}</p>
      {row(
        "cloudflare",
        t("settings.deploy.cloudflare"),
        pairReady(flags, "cloudflareToken", "cloudflareAccount"),
        ["cloudflareToken", "cloudflareAccount"],
        <>
          {secretInput("cloudflareToken", t("settings.deploy.token"))}
          {secretInput("cloudflareAccount", t("settings.deploy.account"))}
        </>,
      )}
      {row(
        "aliyun",
        t("settings.deploy.aliyun"),
        pairReady(flags, "aliyunId", "aliyunSecret"),
        ["aliyunId", "aliyunSecret"],
        <>
          {secretInput("aliyunId", t("settings.deploy.accessKeyId"))}
          {secretInput("aliyunSecret", t("settings.deploy.accessKeySecret"))}
        </>,
      )}
      {row(
        "aws",
        t("settings.deploy.aws"),
        pairReady(flags, "awsId", "awsSecret"),
        ["awsId", "awsSecret", "awsRegion"],
        <>
          {secretInput("awsId", t("settings.deploy.awsKeyId"))}
          {secretInput("awsSecret", t("settings.deploy.awsSecret"))}
          <Input
            name="deploy-aws-region"
            autoComplete="off"
            spellCheck={false}
            aria-label={t("settings.deploy.region")}
            value={draft.awsRegion}
            placeholder={flags.awsRegion ? t("settings.deploy.configured") : t("settings.deploy.region")}
            onChange={(event) => setField("awsRegion", event.target.value)}
          />
        </>,
        true,
      )}
    </div>
  );
}
