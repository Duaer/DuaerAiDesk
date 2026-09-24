/**
 * Where subagent definitions come from, and how a definition's model pin turns
 * into a usable provider binding (ADR 0062).
 *
 * Discovery has two sources, in shadowing order: the user's global
 * `~/.agents/subagents/*.md` documents handed in by Electron main (D202), and
 * the definitions DuaerAiDesk ships. Project workspaces never provide subagents;
 * a repository cannot silently add a delegate to a user's agent catalog.
 *
 * Builtins are inline rather than packaged resource files. There are a handful
 * of them, they must exist in every install for the `Task` tool to be worth
 * offering, and a missing-file fallback path is a worse failure mode than a
 * constant.
 */

import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  JUDGE_SUBAGENT_NAME,
  mergeSubagentDefinitions,
  parseSubagentDefinition,
  subagentModelKey,
  subagentPinnedProviders,
  OAUTH_AUTH_KIND,
  type SubagentDefinition,
  type SubagentModelPin,
} from "@duaer-ai-desk/shared";
import {
  capabilitiesFromModelConfig,
  genericModelConfig,
} from "./model-capabilities.js";
import type { RuntimeProviderConfig } from "./provider-binding.js";
import type { ModelConfig, ThinkingCapabilitySet } from "./thinking-level.js";

/**
 * What a signed-in vendor account says about one of its models. Resolved by
 * Electron main against the authenticated account collection. The account
 * collection supplies availability and wire identity; model configuration is
 * always supplied by the models.dev snapshot or the generic unknown-model
 * shape.
 */
export type VendorModelBinding = ThinkingCapabilitySet & {
  apiStyle: string;
  baseUrl: string;
  modelConfig: ModelConfig;
};

/** Global directory for user-owned definitions; project roots are not consulted. */
export function subagentDefinitionDir(_workspaceRoot: string): string {
  return join(homedir(), ".agents", "subagents");
}

/**
 * Definitions DuaerAiDesk ships. Each one earns its prompt-token cost by being
 * a delegation the main agent would otherwise do inline at full context cost:
 * fast codebase navigation, a second opinion on a diff, running a test
 * command, and — for `fixer` — implementing a multi-file change in its own
 * context (ADR 0089).
 */
export const BUILTIN_SUBAGENT_DOCUMENTS: readonly string[] = [
  `---
name: explorer
description: Fast codebase search and pattern matching — find files, locate implementations and answer "where is X?" / "how does Y work?". Use when answering needs a sweep over many files and you only want the conclusion.
tools: [Read, Glob, Grep, Bash]
---

You are Explorer — a fast codebase navigation specialist.

- Prefer Grep for text/regex patterns (strings, symbols, comments), Glob for
  file discovery by name or extension, Read for specific files.
- Fire several searches in parallel when the answer needs more than one place.
- Follow definitions and call sites; do not stop at the first hit if the
  question implies more than one place.
- Quote the few lines that answer the question and cite \`path:line\` for each.

Report in this shape:

<files>
- src/app.ts:42 — brief description of what's there
</files>
<answer>
Concise answer to the question. If you could not find it, say what you
searched and where the trail went cold — a precise dead end is more useful
than a guess.
</answer>`,
  `---
name: code-reviewer
description: Review specific code or a specific change for defects. Use for a second opinion on correctness, edge cases and missing tests before you commit.
tools: [Read, Glob, Grep]
---

Review only what the task names, and read enough surrounding code to judge it.

- Prefer defects that change behavior: wrong results, unhandled failures,
  broken invariants, races, resource leaks, missing test coverage.
- Check the code against how its callers and neighbors actually use it, not
  against a style preference.
- Say nothing about formatting, naming or structure unless it causes a defect.

Report: each finding as \`path:line\` plus one sentence on what breaks and under
what input. Order by severity. If the code is sound, say so plainly and name
the cases you checked — an empty review with no evidence is not a review.`,
  `---
name: test-runner
description: Run a specific test or build command and report what failed and why. Use when a command's output is long and only the failures matter.
tools: [Read, Glob, Grep, Bash]
---

Run the command the task names. Do not invent a different one, and do not fix
anything: diagnosis is the deliverable.

- Run the command once. If it fails to start (missing script, wrong directory),
  find the right invocation and say what you changed.
- For each failure, read the failing test and the code under it far enough to
  name the cause.

Report: pass/fail counts, then one entry per failure with the test name, the
assertion or error, and the \`path:line\` you believe is responsible. Keep the
raw output out of the report except for the lines that carry the failure.`,
  `---
name: fixer
description: Implement a complete multi-file change from a spec. Use when a feature or fix spans several files and the work is separable — it can write files inside the workspace while you keep working.
tools: [Read, Glob, Grep, Edit, Write, Bash]
---

You are Fixer — a fast, focused implementation specialist. The main agent
delegates a complete, self-contained spec; implement it. Do not re-plan and do
not research beyond what the task needs.

- Read every file you will change first; never Edit or Write from memory or
  from stale content.
- Keep changes minimal and scoped to the task. Do not touch unrelated code.
- You may write inside the workspace; never write outside it. Prefer the
  workspace-relative paths the main agent gave you.
- Run the relevant validation when it is clearly applicable (test, build or
  lint command the task names); otherwise report it skipped with a reason.
- Do not delegate, do not ask the user, do not search the web. If the spec
  lacks context you truly need, use Grep/Glob/Read yourself.

Report in this shape:

<summary>
2-3 sentences: what was implemented and the outcome.
</summary>
<changes>
- path/file.ts: what changed (function or line level)
</changes>
<verification>
- Tests: [passed / failed / skipped: reason]
- Validation: [passed / failed / skipped: reason]
</verification>`,
  `---
name: ui-designer
description: Write the site style and layout for a confirmed architecture. Use after the desk locks architecture and before implementation. Does not edit files or split tasks.
tools: [Read, Glob, Grep]
---

You are UI designer — the digital employee who writes site style and layout. The parent agent hands you one confirmed architecture. Return a style and a layout a coder can implement. Do not edit files and do not split tasks.

- Style names colors, type, and spacing. Layout names columns, navigation, and the main area.
- When the product already has a look, write a design contract that keeps it and names the concrete tokens. Do not invent a second visual system.
- Do not ask the user to pick from a style menu.

Report in this shape:

<style>
colors, type, and spacing
</style>
<layout>
columns, navigation, and the main area
</layout>`,
  `---
name: coder
description: Write the code for one dispatched implement task so its acceptance holds. Use when a desk task says implement. Does not review, restyle, deploy, or split more tasks.
tools: [Read, Glob, Grep, Edit, Write, Bash]
---

You are the Duaer Coder — the digital employee who writes code for one dispatched task. The parent agent hands you one implement task: its id, title, and acceptance. That acceptance is the bar.

- Read every file you will change before Edit or Write.
- Write the smallest change that makes this acceptance hold. Do not split more tasks, reopen requirements, restyle, or deploy.
- A page task is still this acceptance, not a new visual system.
- Do not judge the desk card. Do not ask the user. Do not delegate.
- Run the check the task names. If it names none, run the nearest project check for the files you touched, or say skipped and why.

Report in this shape:

<summary>
2-3 sentences: what now holds against the acceptance.
</summary>
<changes>
- path: what changed
</changes>
<verification>
- Check: [passed / failed / skipped: reason]
</verification>`,
  `---
name: judge
description: Judge a requirement, a scope call, or whether written acceptance is specific enough. Use for a pass or fail decision. Does not implement or restyle.
tools: [Read, Glob, Grep]
---

You are the Duaer Judge — a read-only digital employee. The main agent delegates one judgment: pass or fail, in or out of scope, or whether a written requirement is specific enough. You do not implement, restyle, or pick a visual style.

- Judge only what the task states. Read files when the task names them; do not search the whole repo for extra work.
- A pass needs a checkable bar: what is opened, what is seen, or which number is met. Looks better is not a pass.
- A local file page that already states a measured limit (time, size, or frame rate) does not also need an app lab list.
- Do not edit files. Do not ask the user to choose among styles.

Report in this shape:

<verdict>
pass or fail
</verdict>
<reasons>
- one checkable reason per line
</reasons>`,
];

/** Parsed builtins, rebuilt per call so a bad constant surfaces as a
 * diagnostic in exactly the same way a bad project document does. */
function builtinSubagents(): {
  definitions: SubagentDefinition[];
  diagnostics: string[];
} {
  const definitions: SubagentDefinition[] = [];
  const diagnostics: string[] = [];
  for (const raw of BUILTIN_SUBAGENT_DOCUMENTS) {
    const parsed = parseSubagentDefinition(raw, { source: "builtin" });
    if (parsed.ok) definitions.push(parsed.definition);
    else diagnostics.push(`builtin subagent invalid: ${parsed.errors.join("; ")}`);
  }
  return { definitions, diagnostics };
}

async function loadGlobalSubagents(
  dir: string,
): Promise<{ definitions: SubagentDefinition[]; diagnostics: string[] }> {
  const definitions: SubagentDefinition[] = [];
  const diagnostics: string[] = [];
  let names: string[];
  try {
    names = (await readdir(dir)).filter((name) => /\.md$/i.test(name)).sort();
  } catch {
    // No `~/.agents/subagents` directory is the common case, not an error.
    return { definitions, diagnostics };
  }
  for (const name of names) {
    const filePath = join(dir, name);
    let raw: string;
    try {
      raw = await readFile(filePath, "utf8");
    } catch (err) {
      diagnostics.push(
        `${filePath}: unreadable (${err instanceof Error ? err.message : String(err)})`,
      );
      continue;
    }
    const parsed = parseSubagentDefinition(raw, {
      source: "user",
      fallbackName: name,
      filePath,
    });
    for (const warning of parsed.warnings) diagnostics.push(`${filePath}: ${warning}`);
    if (parsed.ok) definitions.push(parsed.definition);
    else diagnostics.push(`${filePath}: ${parsed.errors.join("; ")}`);
  }
  return { definitions, diagnostics };
}

/**
 * One document from the user's registry (D202). Electron main reads the
 * registry — host-core owns it — and hands the documents in, so this module
 * keeps one parser and one merge for all three sources.
 */
export type UserSubagentDocument = {
  /** Registry id, used as the fallback name when the frontmatter omits one. */
  id: string;
  /** Raw document text, frontmatter included. */
  document: string;
  /** Absolute path, so a diagnostic and the UI can point at the same file. */
  filePath?: string;
};

export type LoadSubagentOptions = {
  /** Global directory override, primarily for isolated tests. */
  overrideDir?: string;
  /** Documents already scanned by host-core from `~/.agents/subagents`. */
  userDocuments?: readonly UserSubagentDocument[];
  /**
   * Handles whose shipped definition the user turned off (D202 activation for
   * builtins, which are constants rather than documents). Their definitions
   * stay out of `definitions` but still reach `builtins`.
   */
  disabledBuiltins?: readonly string[];
  /**
   * Model pins the user saved for shipped handles. A present pin replaces the
   * constant; an absent handle keeps following the session.
   */
  builtinModels?: Readonly<Record<string, { model?: string; fallbackModels?: string[] }>>;
  /**
   * The app's judgment-model binding. The built-in `judge` employee runs only
   * on this model. Absent, he stays listed in Settings but is not offered to Task.
   */
  judgmentModel?: { providerId: string; modelId: string } | null;
}

function storedModelPin(value: string | undefined): SubagentModelPin | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const slash = trimmed.indexOf("/");
  if (slash < 1 || slash === trimmed.length - 1) return undefined;
  return {
    providerId: trimmed.slice(0, slash),
    modelId: trimmed.slice(slash + 1),
  };
}

function applyBuiltinModelOverrides(
  definitions: SubagentDefinition[],
  overrides: LoadSubagentOptions["builtinModels"],
): SubagentDefinition[] {
  if (!overrides) return definitions;
  return definitions.map((definition) => {
    const override = overrides[definition.name];
    if (!override) return definition;
    const model = storedModelPin(override.model);
    const fallbackModels = (override.fallbackModels ?? [])
      .map((pin) => storedModelPin(pin))
      .filter((pin): pin is SubagentModelPin => pin !== undefined);
    const next: SubagentDefinition = { ...definition };
    if (model) next.model = model;
    else delete next.model;
    if (fallbackModels.length > 0) next.fallbackModels = fallbackModels;
    else delete next.fallbackModels;
    return next;
  });
}

export function judgmentModelFromSettings(
  settings: unknown,
): { providerId: string; modelId: string } | null {
  if (!settings || typeof settings !== "object") return null;
  const binding = (settings as { judgmentModel?: unknown }).judgmentModel;
  if (!binding || typeof binding !== "object") return null;
  const providerId = (binding as { providerId?: unknown }).providerId;
  const modelId = (binding as { modelId?: unknown }).modelId;
  if (typeof providerId !== "string" || typeof modelId !== "string") return null;
  const provider = providerId.trim();
  const model = modelId.trim();
  if (!provider || !model) return null;
  return { providerId: provider, modelId: model };
}

function applyJudgmentEmployee(
  definitions: SubagentDefinition[],
  judgment: LoadSubagentOptions["judgmentModel"],
): SubagentDefinition[] {
  const providerId = judgment?.providerId?.trim() ?? "";
  const modelId = judgment?.modelId?.trim() ?? "";
  return definitions.map((definition) => {
    if (definition.name !== JUDGE_SUBAGENT_NAME) return definition;
    const next: SubagentDefinition = { ...definition };
    delete next.fallbackModels;
    if (!providerId || !modelId) {
      delete next.model;
      return next;
    }
    next.model = { providerId, modelId };
    return next;
  });
}

function loadUserSubagents(documents: readonly UserSubagentDocument[]): {
  definitions: SubagentDefinition[];
  diagnostics: string[];
} {
  const definitions: SubagentDefinition[] = [];
  const diagnostics: string[] = [];
  for (const entry of documents) {
    const label = entry.filePath ?? `user subagent "${entry.id}"`;
    const parsed = parseSubagentDefinition(entry.document, {
      source: "user",
      fallbackName: entry.id,
      ...(entry.filePath ? { filePath: entry.filePath } : {}),
    });
    for (const warning of parsed.warnings) diagnostics.push(`${label}: ${warning}`);
    if (parsed.ok) definitions.push(parsed.definition);
    else diagnostics.push(`${label}: ${parsed.errors.join("; ")}`);
  }
  return { definitions, diagnostics };
}

/**
 * Definitions offered to a session: the user's global documents and the
 * builtins, minus the builtins the user turned off. Load failures degrade to
 * diagnostics: a malformed document must not cost the session its other
 * delegates, let alone its turn.
 *
 * `builtins` carries every shipped definition that still wins its handle,
 * whether or not it is switched on, so Settings can render an off builtin as a
 * row with its own switch; `definitions` is what `Task` may actually offer.
 */
export async function loadSubagentDefinitions(
  workspaceRoot: string | null | undefined,
  options: LoadSubagentOptions = {},
): Promise<{
  definitions: SubagentDefinition[];
  builtins: SubagentDefinition[];
  diagnostics: string[];
}> {
  const builtin = builtinSubagents();
  builtin.definitions = applyJudgmentEmployee(
    applyBuiltinModelOverrides(builtin.definitions, options.builtinModels),
    options.judgmentModel,
  );
  const dir =
    options.overrideDir ??
    (workspaceRoot ? subagentDefinitionDir(workspaceRoot) : undefined);
  const disk =
    options.userDocuments === undefined && dir
      ? await loadGlobalSubagents(dir)
      : { definitions: [], diagnostics: [] };
  const user = loadUserSubagents(options.userDocuments ?? []);
  const merged = mergeSubagentDefinitions([
    ...disk.definitions,
    ...user.definitions,
    ...builtin.definitions,
  ]);
  const diagnostics = [
    ...disk.diagnostics,
    ...user.diagnostics,
    ...builtin.diagnostics,
  ];
  if (merged.dropped.length > 0) {
    diagnostics.push(
      `dropped subagents past the catalog cap: ${merged.dropped.join(", ")}`,
    );
  }
  // A switched-off builtin is excluded from the delegation catalog and from
  // nothing else: a user document of the same name still shadows it, and a
  // handle the user re-enables needs no document of its own to come back.
  const disabled = new Set(options.disabledBuiltins ?? []);
  const builtins = merged.definitions.filter(
    (definition) => definition.source === "builtin",
  );
  return {
    definitions: merged.definitions.filter((definition) => {
      if (definition.source === "builtin" && disabled.has(definition.name)) return false;
      if (definition.name === JUDGE_SUBAGENT_NAME && !definition.model) return false;
      return true;
    }),
    builtins,
    diagnostics,
  };
}

/** The stored-provider fields a pin can be resolved against. */
export type SubagentProviderSource = {
  id: string;
  enabled?: boolean;
  headers?: Record<string, string>;
  name: string;
  vendorKey?: string;
  baseUrl?: string;
  defaultModelId?: string;
  authKind?: string;
  apiStyle?: string;
};

/** Loose spelling used when matching a pin against a provider name. */
function providerAlias(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/**
 * Match a pin's `providerId` against configured providers.
 *
 * Stored provider ids are UUIDs, so a hand-written definition almost never
 * names one. The vendor key (`anthropic`) and the display name are what a
 * person actually writes, and both are accepted. Vendor or name aliases that
 * match more than one row are not guessed.
 */
export function findSubagentProviderSource<T extends SubagentProviderSource>(
  providerId: string,
  providers: readonly T[],
): T | undefined {
  const alias = providerAlias(providerId);
  const exact = providers.find((provider) => provider.id === providerId);
  if (exact) return exact;
  const vendorMatches = providers.filter(
    (provider) => providerAlias(provider.vendorKey ?? "") === alias,
  );
  if (vendorMatches.length === 1) return vendorMatches[0];
  const nameMatches = providers.filter(
    (provider) => providerAlias(provider.name) === alias,
  );
  return nameMatches.length === 1 ? nameMatches[0] : undefined;
}

/** Why `findSubagentProviderSource` returned nothing: missing vs ambiguous. */
export function subagentProviderLookupError(
  providerId: string,
  providers: readonly Pick<SubagentProviderSource, "id" | "name" | "vendorKey">[],
): string {
  const alias = providerAlias(providerId);
  const vendorMatches = providers.filter(
    (provider) => providerAlias(provider.vendorKey ?? "") === alias,
  );
  const nameMatches = providers.filter(
    (provider) => providerAlias(provider.name) === alias,
  );
  if (vendorMatches.length > 1 || nameMatches.length > 1) {
    return `provider alias "${providerId}" matches multiple accounts; use the exact provider id`;
  }
  return `no provider matches "${providerId}"`;
}

/**
 * Resolve every distinct model pin into a provider binding the sidecar can
 * use, keyed by `subagentModelKey`.
 *
 * A pin that cannot be resolved is deliberately left out of the map instead of
 * falling back to the session provider: a definition that asks for a cheap
 * model must not silently start spending the expensive one. The runtime turns
 * the missing entry into a tool error naming the pin.
 */
export async function resolveSubagentProviders(input: {
  definitions: readonly SubagentDefinition[];
  providers: readonly SubagentProviderSource[];
  getSecret: (providerId: string) => Promise<string | undefined>;
  /** Per-model binding for a vendor-account row, resolved by Electron main. */
  resolveVendorBinding?: (
    provider: SubagentProviderSource,
    modelId: string,
  ) => Promise<VendorModelBinding | undefined>;
  /** Resolve non-OAuth model metadata from Electron's models.dev snapshot. */
  resolveModel?: (
    provider: SubagentProviderSource,
    modelId: string,
  ) => Promise<{ modelConfig: ModelConfig; capabilities: ThinkingCapabilitySet } | undefined>;
}): Promise<{
  providers: Record<string, RuntimeProviderConfig>;
  diagnostics: string[];
}> {
  const resolved: Record<string, RuntimeProviderConfig> = {};
  const diagnostics: string[] = [];
  const allowed = subagentPinnedProviders(input.definitions);
  const secrets = new Map<string, string | undefined>();

  const pins = input.definitions.flatMap((definition) =>
    [definition.model, ...(definition.fallbackModels ?? [])]
      .flatMap((pin) => pin ? [{ name: definition.name, pin }] : []),
  );
  for (const { name, pin } of pins) {
    const key = subagentModelKey(pin);
    if (resolved[key]) continue;
    if (!allowed.includes(pin.providerId)) {
      diagnostics.push(
        `${name}: too many pinned providers, ignoring "${key}"`,
      );
      continue;
    }
    const provider = findSubagentProviderSource(pin.providerId, input.providers);
    if (!provider || provider.enabled === false) {
      diagnostics.push(
        `${name}: no enabled provider matches "${pin.providerId}"`,
      );
      continue;
    }
    const isVendorAccount = provider.authKind === OAUTH_AUTH_KIND;
    if (!isVendorAccount && !secrets.has(provider.id)) {
      try {
        secrets.set(provider.id, await input.getSecret(provider.id));
      } catch {
        secrets.set(provider.id, undefined);
      }
    }
    const apiKey = secrets.get(provider.id) ?? "";
    if (!apiKey && !isVendorAccount && provider.authKind !== "none") {
      diagnostics.push(`${name}: provider "${provider.name}" has no API key`);
      continue;
    }
    // A vendor account resolves the pinned model against the signed-in
    // catalog: one account can span wire APIs, and a gateway's model list
    // does not exist in the builtin one at all.
    let binding: VendorModelBinding | undefined;
    if (isVendorAccount) {
      try {
        binding = await input.resolveVendorBinding?.(provider, pin.modelId);
      } catch {
        binding = undefined;
      }
      if (!binding) {
        diagnostics.push(
          `${name}: vendor account "${provider.name}" does not offer "${pin.modelId}"`,
        );
        continue;
      }
    }
    const resolvedModel = !isVendorAccount
      ? await input.resolveModel?.(provider, pin.modelId)
      : undefined;
    const modelConfig =
      binding?.modelConfig ??
      resolvedModel?.modelConfig ??
      genericModelConfig(pin.modelId, binding?.baseUrl ?? provider.baseUrl ?? "");
    const capabilities = binding ??
      resolvedModel?.capabilities ??
      capabilitiesFromModelConfig(modelConfig);
    const apiStyle = binding?.apiStyle ?? provider.apiStyle;
    resolved[key] = {
      id: provider.id,
      name: provider.name,
      ...(provider.vendorKey ? { vendorKey: provider.vendorKey } : {}),
      ...(provider.headers ? { headers: { ...provider.headers } } : {}),
      ...(binding?.baseUrl ?? provider.baseUrl
        ? { baseUrl: binding?.baseUrl ?? provider.baseUrl }
        : {}),
      modelId: pin.modelId,
      apiKey,
      ...(provider.authKind ? { authKind: provider.authKind } : {}),
      ...(apiStyle ? { apiStyle } : {}),
      supportsReasoning: capabilities.supportsReasoning,
      supportedThinkingLevels: [...capabilities.supportedThinkingLevels],
      ...(modelConfig ? { modelConfig } : {}),
    };
  }
  return { providers: resolved, diagnostics };
}
