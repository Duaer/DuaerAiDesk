import assert from "node:assert/strict";
import test from "node:test";
import { deployHostChoices, emptyDeployCredentialFlags } from "../src/lib/deploy-hosts.ts";

test("cloud hosts stay hidden until both keys are saved", () => {
  const flags = emptyDeployCredentialFlags();
  assert.deepEqual(deployHostChoices(flags), ["none", "github-pages"]);
  flags.aliyunId = true;
  assert.deepEqual(deployHostChoices(flags), ["none", "github-pages"]);
  flags.aliyunSecret = true;
  flags.awsId = true;
  flags.awsSecret = true;
  flags.cloudflareToken = true;
  assert.deepEqual(deployHostChoices(flags), ["none", "github-pages", "aliyun", "aws"]);
  flags.cloudflareAccount = true;
  assert.deepEqual(deployHostChoices(flags), ["none", "github-pages", "cloudflare", "aliyun", "aws"]);
});
