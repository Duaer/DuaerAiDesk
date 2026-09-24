import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const server = await createServer({
  root: fileURLToPath(new URL("..", import.meta.url)),
  configFile: false,
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: "custom",
  optimizeDeps: { noDiscovery: true, include: [] },
});
const { createWorkPanelSlice } = await server.ssrLoadModule(
  "/src/stores/slices/work-panel-slice.ts",
);
const { toolWorkPanelTab } = await server.ssrLoadModule("/src/lib/work-panel-tabs.ts");
test.after(async () => {
  await server.close();
});

function harness(initial) {
  let state = {
    page: "chat",
    pluginViews: [],
    workPanelContexts: {},
    workPanelOpen: false,
    workPanelTabs: [],
    activeWorkPanelTabId: null,
    workPanelFileRequest: null,
    subagentPanel: null,
    ...initial,
  };
  const access = {
    get: () => state,
    set: (update) => {
      const partial = typeof update === "function" ? update(state) : update;
      state = { ...state, ...partial };
    },
  };
  const slice = createWorkPanelSlice({
    ...access,
    isSessionSelectionPending: () => false,
  });
  state = { ...state, ...slice };
  return {
    slice,
    get state() {
      return state;
    },
  };
}

test("delivery launcher switches the visible tab when no session is selected", () => {
  const box = harness({ activeSessionId: undefined });
  box.slice.openWorkPanelTab(toolWorkPanelTab("architecture"));
  assert.equal(box.state.activeWorkPanelTabId, "architecture");
  assert.equal(box.state.workPanelTabs[0]?.kind, "architecture");
  assert.equal(box.state.workPanelOpen, true);
  assert.deepEqual(box.state.workPanelContexts, {});

  box.slice.openWorkPanelTab(toolWorkPanelTab("requirements"));
  box.slice.activateWorkPanelTab("architecture");
  assert.equal(box.state.activeWorkPanelTabId, "architecture");
});

test("delivery launcher still retains tabs on the active session", () => {
  const box = harness({ activeSessionId: "session-1" });
  box.slice.openWorkPanelTab(toolWorkPanelTab("dispatch"));
  assert.equal(box.state.activeWorkPanelTabId, "dispatch");
  assert.equal(box.state.workPanelContexts["session-1"]?.activeTabId, "dispatch");
});
