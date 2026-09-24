import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("architecture uses Archify mount and live-archify IPC", async () => {
  const arch = await read("../src/lib/delivery-architecture.ts");
  const tab = await read("../src/components/workpanel/ArchitectureTab.tsx");
  const mount = await read("../src/components/workpanel/ArchitectureMount.tsx");
  const main = await read("../electron/main/architecture-render.ts");
  const protocol = await read("../../../packages/shared/src/protocol.ts");
  const chat = await read("../src/lib/delivery-chat.ts");
  const desk = await read("../src/lib/delivery-desk.ts");
  const req = await read("../src/components/workpanel/RequirementsTab.tsx");

  assert.match(desk, /withArchitectureDesignReset/);
  assert.match(desk, /diagramKey/);
  assert.match(arch, /export async function beginArchitectureDesign/);
  assert.match(arch, /export async function regenerateArchitectureDesign/);
  assert.match(arch, /export async function maybeRenderArchitectureFromReply/);
  assert.match(arch, /extractArchitectureIr/);
  assert.match(arch, /panel\.architecture\.kickoffPrompt/);
  assert.match(arch, /panel\.architecture\.enterDesign/);
  assert.match(req, /beginArchitectureDesign\(path/);
  assert.match(tab, /ArchitectureMount/);
  assert.match(tab, /architecture-title/);
  assert.match(tab, /offerArchitectureDecision/);
  assert.doesNotMatch(tab, /architecture-btn/);
  assert.match(tab, /hintDesigning|hintPreview|hintConfirmed/);
  assert.match(tab, /renderArchitectureFromDesk\(path\)/);
  assert.match(arch, /confirmArchitectureFromChat/);
  assert.match(arch, /reviseArchitectureFromChat/);
  assert.match(arch, /DELIVERY_CONFIRM_ARCHITECTURE_ACTION/);
  assert.match(arch, /beginVisualDesign\(path\)/);
  const visual = await read("../src/lib/delivery-visual.ts");
  assert.match(visual, /beginDispatchSplit\(path\)/);
  assert.match(visual, /design_type !== "visual"/);
  assert.match(visual, /agent 填 ui-designer/);
  assert.doesNotMatch(tab, /panel\.architecture\.renderDiagram/);
  assert.match(mount, /architecture-mount\.mjs/);
  const chrome = await read("../src/lib/architecture-mount.mjs");
  const panelCss = await read("../src/styles/work-panel.css");
  assert.match(chrome, /padding: 0 !important/);
  assert.doesNotMatch(chrome, /padding: 100px/);
  assert.doesNotMatch(panelCss, /#0b1220/);
  assert.match(mount, /mountArchitectureHtml/);
  assert.match(main, /live-archify\.mjs/);
  assert.match(main, /renderArchitectureHtml/);
  assert.match(main, /ELECTRON_RUN_AS_NODE/);
  assert.match(main, /architecture", `\$\{id\}\.html`/);
  assert.match(arch, /isDeliveryGateNote/);
  assert.match(arch, /renderFailNoted/);
  assert.match(arch, /force:\s*true/);
  assert.match(arch, /lastArchitectureFp/);
  assert.match(arch, /relaxArchitectureIr/);
  assert.match(protocol, /deliveryArchitectureRender/);
  assert.match(protocol, /deliveryArchitectureGet/);
  assert.match(protocol, /IPC_WHITELIST/);
  assert.match(chat, /diagram_type/);
  assert.match(chat, /全部需求模块已确认|系统架构/);
});

test("architecture IR extractor accepts Archify diagram_type", async () => {
  const { extractArchitectureIr } = await import("../src/lib/architecture-ir.mjs");
  const ir = extractArchitectureIr(`ok
<<<JSON>>>
{"diagram_type":"architecture","meta":{"title":"Demo","quality_profile":"standard"},"components":[{"id":"web","type":"frontend","label":"Web"},{"id":"api","type":"backend","label":"API"}],"connections":[{"id":"e1","from":"web","to":"api"}]}`);
  assert.equal(ir?.diagram_type, "architecture");
  assert.equal(ir?.components?.length, 2);
});

test("relaxed architecture IR drops hand-placed geometry", async () => {
  const { relaxArchitectureIr } = await import("../src/lib/architecture-ir.mjs");
  const relaxed = relaxArchitectureIr({
    components: [{ id: "bar", label: "sticky 顶部通栏提示条今天还没写", size: [171, 64], pos: [1, 2] }],
    connections: [{ id: "e7", from: "bar", to: "web", fromSide: "bottom", labelDx: 12, label: "托管访问与双击打开" }],
  });
  assert.equal(relaxed.components[0].size, undefined);
  assert.equal(relaxed.components[0].pos, undefined);
  assert.equal(relaxed.connections[0].fromSide, undefined);
  assert.equal(relaxed.connections[0].label, undefined);
  assert.ok(relaxed.components[0].label.length <= 10);
});

test("architecture svg keeps authored size instead of stretching to the panel", async () => {
  const { applySvgIntrinsicSize } = await import("../src/lib/architecture-mount.mjs");
  const chrome = await read("../src/lib/architecture-mount.mjs");
  assert.match(chrome, /A single node must not stretch/);
  const one = fakeSvg("0 0 248 160");
  const two = fakeSvg("0 0 496 160");
  assert.equal(applySvgIntrinsicSize(one), true);
  assert.equal(applySvgIntrinsicSize(two), true);
  assert.equal(one.getAttribute("width"), "248");
  assert.equal(two.getAttribute("width"), "496");
  assert.equal(one.getAttribute("height"), two.getAttribute("height"));
});

function fakeSvg(viewBox) {
  const attrs = new Map([["viewBox", viewBox]]);
  return {
    getAttribute: (key) => attrs.get(key) ?? null,
    setAttribute: (key, value) => attrs.set(key, value),
  };
}
