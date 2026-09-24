import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { app } from "electron";

export type ArchitectureRenderResult = {
  key: string;
  summary: string;
  html: string;
};

type LiveArchifyModule = {
  renderArchitectureHtml: (
    liveRoot: string,
    ir: unknown,
  ) => { key: string; htmlPath: string; summary: string };
  sanitizeArchitectureIr: (raw: unknown) => unknown;
};

function architectureRoot(): string {
  const base = app.isReady()
    ? path.join(app.getPath("userData"), "architecture")
    : path.join(os.homedir(), ".duaer", "aidesk-architecture");
  fs.mkdirSync(base, { recursive: true });
  return base;
}

function liveArchifyCandidates(): string[] {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return [
    path.resolve(here, "../../../../node_modules/duaer-spec/bin/live-archify.mjs"),
    path.resolve(process.cwd(), "node_modules/duaer-spec/bin/live-archify.mjs"),
    path.resolve(process.cwd(), "../../node_modules/duaer-spec/bin/live-archify.mjs"),
    path.resolve(app.getAppPath(), "../../node_modules/duaer-spec/bin/live-archify.mjs"),
    path.resolve(app.getAppPath(), "node_modules/duaer-spec/bin/live-archify.mjs"),
  ];
}

async function loadLiveArchify(): Promise<LiveArchifyModule> {
  for (const candidate of liveArchifyCandidates()) {
    if (!fs.existsSync(candidate)) continue;
    return import(pathToFileURL(candidate).href) as Promise<LiveArchifyModule>;
  }
  throw Object.assign(new Error("duaer-spec live-archify.mjs not found"), {
    errorCode: "ARCHIFY_MISSING",
  });
}

/** Render Archify IR to self-contained HTML (same pipeline as Duaer live desk). */
export async function renderDeliveryArchitecture(
  irInput: unknown,
): Promise<ArchitectureRenderResult> {
  const { renderArchitectureHtml, sanitizeArchitectureIr } = await loadLiveArchify();
  const ir = sanitizeArchitectureIr(irInput);
  if (!ir) {
    throw Object.assign(new Error("architecture IR invalid"), {
      errorCode: "INVALID_ARGUMENT",
    });
  }
  // live-archify spawns process.execPath. Inside Electron that binary is the
  // app, not Node, so Archify never exits and the diagram never appears.
  // Children must run as Node; the already-running main process stays Electron.
  const previousRunAsNode = process.env.ELECTRON_RUN_AS_NODE;
  process.env.ELECTRON_RUN_AS_NODE = "1";
  let rendered: ReturnType<LiveArchifyModule["renderArchitectureHtml"]>;
  try {
    rendered = renderArchitectureHtml(architectureRoot(), ir);
  } finally {
    if (previousRunAsNode === undefined) delete process.env.ELECTRON_RUN_AS_NODE;
    else process.env.ELECTRON_RUN_AS_NODE = previousRunAsNode;
  }
  const html = fs.readFileSync(rendered.htmlPath, "utf8");
  return {
    key: rendered.key,
    summary: rendered.summary || "",
    html,
  };
}

export async function readDeliveryArchitectureHtml(key: string): Promise<string | null> {
  const id = String(key || "").trim().toLowerCase();
  if (!/^[a-f0-9]{8,64}$/.test(id)) return null;
  // live-archify writes under liveRoot/architecture/, and architectureRoot()
  // is already that liveRoot.
  const htmlPath = path.join(architectureRoot(), "architecture", `${id}.html`);
  if (!fs.existsSync(htmlPath)) return null;
  return fs.readFileSync(htmlPath, "utf8");
}
