import type { DeliveryDeployTarget } from "./delivery-desk.ts";

/** Secret refs owned by Settings → Deploy. Values never return to the renderer. */
export const DEPLOY_SECRET = {
  cloudflareToken: "secret:deploy:cloudflare:token",
  cloudflareAccount: "secret:deploy:cloudflare:account",
  aliyunId: "secret:deploy:aliyun:id",
  aliyunSecret: "secret:deploy:aliyun:secret",
  awsId: "secret:deploy:aws:id",
  awsSecret: "secret:deploy:aws:secret",
  awsRegion: "secret:deploy:aws:region",
} as const;

export type DeploySecretKey = keyof typeof DEPLOY_SECRET;
export type DeployCredentialFlags = Record<DeploySecretKey, boolean>;

export function emptyDeployCredentialFlags(): DeployCredentialFlags {
  return {
    cloudflareToken: false,
    cloudflareAccount: false,
    aliyunId: false,
    aliyunSecret: false,
    awsId: false,
    awsSecret: false,
    awsRegion: false,
  };
}

/** GitHub Pages is always available. A cloud host appears only when both keys exist. */
export function deployHostChoices(flags: DeployCredentialFlags): DeliveryDeployTarget[] {
  const hosts: DeliveryDeployTarget[] = ["none", "github-pages"];
  if (flags.cloudflareToken && flags.cloudflareAccount) hosts.push("cloudflare");
  if (flags.aliyunId && flags.aliyunSecret) hosts.push("aliyun");
  if (flags.awsId && flags.awsSecret) hosts.push("aws");
  return hosts;
}
