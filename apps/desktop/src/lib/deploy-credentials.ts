import { api } from "./api.ts";
import {
  DEPLOY_SECRET,
  emptyDeployCredentialFlags,
  type DeployCredentialFlags,
  type DeploySecretKey,
} from "./deploy-hosts.ts";

export async function loadDeployCredentialFlags(): Promise<DeployCredentialFlags> {
  const flags = emptyDeployCredentialFlags();
  await Promise.all(
    (Object.keys(DEPLOY_SECRET) as DeploySecretKey[]).map(async (key) => {
      const result = await api.hasSecret(DEPLOY_SECRET[key]);
      flags[key] = result.has === true;
    }),
  );
  return flags;
}

/** Empty text keeps a saved secret. A clear deletes it. */
export async function writeDeploySecret(key: DeploySecretKey, value: string, clear = false): Promise<void> {
  const ref = DEPLOY_SECRET[key];
  if (clear) {
    await api.deleteSecret(ref);
    return;
  }
  const next = value.trim();
  if (!next) return;
  await api.setSecret(ref, next);
}
