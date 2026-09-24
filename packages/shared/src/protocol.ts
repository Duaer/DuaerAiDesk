export const PROTOCOL_VERSION = 11 as const;
export const SCHEMA_VERSION = 16 as const;
export const APP_ID = "net.aiuo.duaer-ai-desk";
export const APP_NAME = "DuaerAiDesk";
export const APP_VERSION = "0.15.6";

export const APP_MENU_COMMANDS = [
  "newTask",
  "openProject",
  "openSettings",
  "openSearch",
  "openCommandPalette",
  "toggleSidebar",
  "openHelp",
  "openLogs",
  "checkForUpdates",
] as const;

export type AppMenuCommand = (typeof APP_MENU_COMMANDS)[number];

export const NATIVE_MENU_ACTIONS = [
  "undo",
  "redo",
  "cut",
  "copy",
  "paste",
  "selectAll",
  "reload",
  "zoomIn",
  "zoomOut",
  "resetZoom",
  "toggleFullScreen",
  "minimize",
  "toggleMaximize",
  "close",
  "restoreMainWindow",
  "toggleMainWindow",
] as const;

export type NativeMenuAction = (typeof NATIVE_MENU_ACTIONS)[number];

export const WINDOW_CONTROL_ACTIONS = [
  "getState",
  "minimize",
  "toggleMaximize",
  "close",
] as const;

export type WindowControlAction = (typeof WINDOW_CONTROL_ACTIONS)[number];

export const IPC = {
  invoke: {
    appGetVersion: "duaer-ai-desk/app/getVersion",
    appOpenFeedback: "duaer-ai-desk/app/openFeedback",
    appHealth: "duaer-ai-desk/app/health",
    appGetOnboarding: "duaer-ai-desk/app/getOnboarding",
    appDismissOnboarding: "duaer-ai-desk/app/dismissOnboarding",
    /**
     * Quit the whole application through the ordered shutdown. Exposed for the
     * surfaces that own the window while the shell has no data yet — a stuck
     * startup must always be able to exit the app (issue #831).
     */
    appQuit: "duaer-ai-desk/app/quit",
    /** Installed system font families, resolved by Electron main. */
    systemFontsList: "duaer-ai-desk/app/systemFonts",
    updatesGetState: "duaer-ai-desk/updates/getState",
    updatesCheck: "duaer-ai-desk/updates/check",
    updatesDownload: "duaer-ai-desk/updates/download",
    updatesInstall: "duaer-ai-desk/updates/install",
    updatesOpenReleases: "duaer-ai-desk/updates/openReleases",
    notificationList: "duaer-ai-desk/notification/list",
    notificationMarkRead: "duaer-ai-desk/notification/markRead",
    notificationMarkAllRead: "duaer-ai-desk/notification/markAllRead",
    notificationClear: "duaer-ai-desk/notification/clear",
    notificationShowNative: "duaer-ai-desk/notification/showNative",
    notificationSetViewingSession: "duaer-ai-desk/notification/setViewingSession",
    agentPrompt: "duaer-ai-desk/agent/prompt",
    agentSteer: "duaer-ai-desk/agent/steer",
    promptEnhance: "duaer-ai-desk/prompt/enhance",
    deliveryReview: "duaer-ai-desk/delivery/review",
    deliveryArchitectureRender: "duaer-ai-desk/delivery/architecture/render",
    deliveryArchitectureGet: "duaer-ai-desk/delivery/architecture/get",
    speechTranscribe: "duaer-ai-desk/speech/transcribe",
    speechSynthesize: "duaer-ai-desk/speech/synthesize",
    speechGetStatus: "duaer-ai-desk/speech/getStatus",
    agentCompact: "duaer-ai-desk/agent/compact",
    agentAbort: "duaer-ai-desk/agent/abort",
    agentStop: "duaer-ai-desk/agent/stop",
    agentQueuePush: "duaer-ai-desk/agent/queue/push",
    agentQueueList: "duaer-ai-desk/agent/queue/list",
    agentQueueRemove: "duaer-ai-desk/agent/queue/remove",
    agentQueuePrioritize: "duaer-ai-desk/agent/queue/prioritize",
    agentQueueReorder: "duaer-ai-desk/agent/queue/reorder",
    agentGetStatus: "duaer-ai-desk/agent/getStatus",
    agentInstructionsGet: "duaer-ai-desk/agent/instructions/get",
    agentInstructionsSave: "duaer-ai-desk/agent/instructions/save",
    sessionList: "duaer-ai-desk/session/list",
    sessionCreate: "duaer-ai-desk/session/create",
    sessionFork: "duaer-ai-desk/session/fork",
    sessionMoveProject: "duaer-ai-desk/session/moveProject",
    sessionSearch: "duaer-ai-desk/session/search",
    sessionSearchContext: "duaer-ai-desk/session/searchContext",
    sessionGet: "duaer-ai-desk/session/get",
    sessionCollaboration: "duaer-ai-desk/session/collaboration",
    /** Validate and select a durable session from a reviewed host operation. */
    sessionOpen: "duaer-ai-desk/session/open",
    sessionDelete: "duaer-ai-desk/session/delete",
    sessionRename: "duaer-ai-desk/session/rename",
    sessionSummarizeTitle: "duaer-ai-desk/session/summarizeTitle",
    sessionConfigure: "duaer-ai-desk/session/configure",
    sessionImportScan: "duaer-ai-desk/session/importScan",
    sessionImportRun: "duaer-ai-desk/session/importRun",
    modelConfigImportScan: "duaer-ai-desk/modelConfig/importScan",
    modelConfigImportRun: "duaer-ai-desk/modelConfig/importRun",
    sessionReplaceMessages: "duaer-ai-desk/session/replaceMessages",
    sessionSaveRevision: "duaer-ai-desk/session/saveRevision",
    sessionListRevisions: "duaer-ai-desk/session/listRevisions",
    sessionActivateRevision: "duaer-ai-desk/session/activateRevision",
    sessionGetScratchPath: "duaer-ai-desk/session/getScratchPath",
    sessionOpenScratchPath: "duaer-ai-desk/session/openScratchPath",
    projectOpenFolder: "duaer-ai-desk/project/openFolder",
    settingsGet: "duaer-ai-desk/settings/get",
    settingsSet: "duaer-ai-desk/settings/set",
    configSyncGetState: "duaer-ai-desk/configSync/getState",
    configSyncConfigure: "duaer-ai-desk/configSync/configure",
    configSyncTest: "duaer-ai-desk/configSync/test",
    configSyncSyncNow: "duaer-ai-desk/configSync/syncNow",
    configSyncPause: "duaer-ai-desk/configSync/pause",
    configSyncUnlock: "duaer-ai-desk/configSync/unlock",
    configSyncApprove: "duaer-ai-desk/configSync/approve",
    configSyncReject: "duaer-ai-desk/configSync/reject",
    configSyncMapProject: "duaer-ai-desk/configSync/mapProject",
    configSyncListHistory: "duaer-ai-desk/configSync/listHistory",
    configSyncRestore: "duaer-ai-desk/configSync/restore",
    configSyncChangePassword: "duaer-ai-desk/configSync/changePassword",
    configSyncDisconnect: "duaer-ai-desk/configSync/disconnect",
    networkProxyTest: "duaer-ai-desk/network/testProxy",
    commandShellList: "duaer-ai-desk/commandShell/list",
    secretsSet: "duaer-ai-desk/secrets/set",
    secretsDelete: "duaer-ai-desk/secrets/delete",
    secretsHas: "duaer-ai-desk/secrets/has",
    projectOpen: "duaer-ai-desk/project/open",
    projectPickFolders: "duaer-ai-desk/project/pickFolders",
    projectMemoryGet: "duaer-ai-desk/project/memory/get",
    projectMemorySave: "duaer-ai-desk/project/memory/save",
    projectGroupList: "duaer-ai-desk/project-group/list",
    projectGroupCreate: "duaer-ai-desk/project-group/create",
    projectGroupRename: "duaer-ai-desk/project-group/rename",
    projectGroupUpdate: "duaer-ai-desk/project-group/update",
    projectGroupMemoryGet: "duaer-ai-desk/project-group/memory/get",
    projectGroupMemorySave: "duaer-ai-desk/project-group/memory/save",
    projectGroupInstructionsGet: "duaer-ai-desk/project-group/instructions/get",
    projectGroupInstructionsSave: "duaer-ai-desk/project-group/instructions/save",
    projectClone: "duaer-ai-desk/project/clone",
    projectCloneCheckout: "duaer-ai-desk/project/cloneCheckout",
    projectGet: "duaer-ai-desk/project/get",
    projectList: "duaer-ai-desk/project/list",
    projectSet: "duaer-ai-desk/project/set",
    projectClear: "duaer-ai-desk/project/clear",
    projectRemove: "duaer-ai-desk/project/remove",
    pullsList: "duaer-ai-desk/pulls/list",
    scheduledList: "duaer-ai-desk/scheduled/list",
    scheduledCreate: "duaer-ai-desk/scheduled/create",
    scheduledUpdate: "duaer-ai-desk/scheduled/update",
    scheduledDelete: "duaer-ai-desk/scheduled/delete",
    scheduledRun: "duaer-ai-desk/scheduled/run",
    scheduledExecute: "duaer-ai-desk/scheduled/execute",
    scheduledListRuns: "duaer-ai-desk/scheduled/listRuns",
    toolResolvePermission: "duaer-ai-desk/tool/resolvePermission",
    askToolResolve: "duaer-ai-desk/agent/askTool/resolve",
    plansPending: "duaer-ai-desk/plans/pending",
    plansResolve: "duaer-ai-desk/plans/resolve",
    /**
     * List every paired remote `duaer-ai-desk-host` this desktop knows, redacted so no
     * device token reaches the renderer. See ADR 0286 (R2b pairing UX).
     */
    remoteHostList: "duaer-ai-desk/remoteHost/list",
    /**
     * Pair with a `duaer-ai-desk-host` at `url` using a single-use `pairingToken`, mint
     * a device token, persist it encrypted, and open the live connection.
     */
    remoteHostPair: "duaer-ai-desk/remoteHost/pair",
    /** Close the live connection for `hostKey` and drop its persisted record. */
    remoteHostRemove: "duaer-ai-desk/remoteHost/remove",
    /**
     * Install and pair a `duaer-ai-desk-host` on a machine the user reaches over SSH:
     * upload the bootstrap script, download and verify the published bundle
     * there, start the host, forward its loopback port, and exchange the
     * pairing token (spec §5.2). Uses the user's own SSH keys; no credential
     * crosses this channel.
     */
    remoteHostBootstrap: "duaer-ai-desk/remoteHost/bootstrap",
    providersList: "duaer-ai-desk/providers/list",
    providersReorder: "duaer-ai-desk/providers/reorder",
    providersCreate: "duaer-ai-desk/providers/create",
    providersUpdate: "duaer-ai-desk/providers/update",
    providersDelete: "duaer-ai-desk/providers/delete",
    /**
     * Set or clear one provider's API key. Separate from `providersUpdate`
     * because a plugin-declared row refuses a generic update while still
     * needing the credential its declaration asks for.
     */
    providersSetSecret: "duaer-ai-desk/providers/setSecret",
    providersTest: "duaer-ai-desk/providers/testConnection",
    providersListModels: "duaer-ai-desk/providers/listModels",
    /**
     * Look one model id up in the local models.dev snapshot.
     *
     * `providersListModels` cannot answer this: it describes a saved or
     * reached provider's catalogue, and a hand-typed custom id exists nowhere
     * yet when the settings picker needs its published limits. This is a
     * snapshot read — no provider network access and no host call — so the
     * picker can seed a custom row without probing an endpoint that does not
     * know the id.
     */
    providersLookupModel: "duaer-ai-desk/providers/lookupModel",
    providersRefreshModelCatalog: "duaer-ai-desk/providers/refreshModelCatalog",
    providersModelCatalogStatus: "duaer-ai-desk/providers/modelCatalogStatus",
    providersOauthVendors: "duaer-ai-desk/providers/oauth/vendors",
    providersOauthStart: "duaer-ai-desk/providers/oauth/start",
    providersOauthRespond: "duaer-ai-desk/providers/oauth/respond",
    providersOauthCancel: "duaer-ai-desk/providers/oauth/cancel",
    providersOauthDelete: "duaer-ai-desk/providers/oauth/delete",
    pluginList: "duaer-ai-desk/plugin/list",
    /** Plugin-contributed agent extensions (D387/D388, ADR 0214). */
    pluginImportExtension: "duaer-ai-desk/plugin/importExtension",
    extensionsCommandRun: "duaer-ai-desk/extensions/commands/run",
    extensionsUiRespond: "duaer-ai-desk/extensions/ui/respond",
    pluginLoadDev: "duaer-ai-desk/plugin/loadDev",
    /**
     * The answer to a development plugin's permission review. Loading a folder
     * is a two-step: `pluginLoadDev` returns the declaration, and this commits
     * the permissions the user accepted.
     */
    pluginLoadDevConfirm: "duaer-ai-desk/plugin/loadDevConfirm",
    pluginReload: "duaer-ai-desk/plugin/reload",
    /** Commits a reviewed widening for an already-loaded development plugin. */
    pluginReloadConfirm: "duaer-ai-desk/plugin/reloadConfirm",
    pluginCreateFromTemplate: "duaer-ai-desk/plugin/createFromTemplate",
    pluginInstallFromPath: "duaer-ai-desk/plugin/installFromPath",
    pluginInstallFromPackage: "duaer-ai-desk/plugin/installFromPackage",
    pluginEnable: "duaer-ai-desk/plugin/enable",
    pluginDisable: "duaer-ai-desk/plugin/disable",
    pluginSetScope: "duaer-ai-desk/plugin/setScope",
    pluginUninstall: "duaer-ai-desk/plugin/uninstall",
    pluginSetAutoUpdate: "duaer-ai-desk/plugin/setAutoUpdate",
    pluginSettingsGet: "duaer-ai-desk/plugin/settings/get",
    pluginSettingsSet: "duaer-ai-desk/plugin/settings/set",
    pluginOpenPanel: "duaer-ai-desk/plugin/openPanel",
    pluginLauncherToggle: "duaer-ai-desk/pluginLauncher/toggle",
    pluginLauncherDismiss: "duaer-ai-desk/pluginLauncher/dismiss",
    pluginThemes: "duaer-ai-desk/plugin/themes",
    pluginScenicThemesDestinations: "duaer-ai-desk/plugin/scenicThemes/destinations",
    pluginScenicThemesSetBlur: "duaer-ai-desk/plugin/scenicThemes/setBlur",
    pluginServices: "duaer-ai-desk/plugin/services",
    pluginViews: "duaer-ai-desk/plugin/views",
    pluginViewOpen: "duaer-ai-desk/plugin/view/open",
    pluginViewClose: "duaer-ai-desk/plugin/view/close",
    pluginViewSetBounds: "duaer-ai-desk/plugin/view/setBounds",
    pluginViewSetVisible: "duaer-ai-desk/plugin/view/setVisible",
    mcpList: "duaer-ai-desk/mcp/list",
    mcpUpsert: "duaer-ai-desk/mcp/upsert",
    mcpRemove: "duaer-ai-desk/mcp/remove",
    mcpSetEnabled: "duaer-ai-desk/mcp/setEnabled",
    mcpSetScope: "duaer-ai-desk/mcp/setScope",
    mcpTransfer: "duaer-ai-desk/mcp/transfer",
    mcpTest: "duaer-ai-desk/mcp/test",
    mcpOauthStart: "duaer-ai-desk/mcp/oauth/start",
    mcpOauthCancel: "duaer-ai-desk/mcp/oauth/cancel",
    mcpImport: "duaer-ai-desk/mcp/import",
    mcpImportScan: "duaer-ai-desk/mcp/importScan",
    mcpImportRun: "duaer-ai-desk/mcp/importRun",
    mcpMarketSearch: "duaer-ai-desk/mcp/market/search",
    skillList: "duaer-ai-desk/skill/list",
    skillCreate: "duaer-ai-desk/skill/create",
    skillImport: "duaer-ai-desk/skill/import",
    skillImportScan: "duaer-ai-desk/skill/importScan",
    skillImportRun: "duaer-ai-desk/skill/importRun",
    skillMarketSearch: "duaer-ai-desk/skill/market/search",
    skillMarketFetch: "duaer-ai-desk/skill/market/fetch",
    skillUpdate: "duaer-ai-desk/skill/update",
    skillRemove: "duaer-ai-desk/skill/remove",
    skillSetEnabled: "duaer-ai-desk/skill/setEnabled",
    skillSetScope: "duaer-ai-desk/skill/setScope",
    skillTransfer: "duaer-ai-desk/skill/transfer",
    skillRead: "duaer-ai-desk/skill/read",
    skillReveal: "duaer-ai-desk/skill/reveal",
    subagentList: "duaer-ai-desk/subagent/list",
    subagentCatalog: "duaer-ai-desk/subagent/catalog",
    subagentCreate: "duaer-ai-desk/subagent/create",
    subagentUpdate: "duaer-ai-desk/subagent/update",
    subagentRead: "duaer-ai-desk/subagent/read",
    subagentRemove: "duaer-ai-desk/subagent/remove",
    subagentSetEnabled: "duaer-ai-desk/subagent/setEnabled",
    subagentSetScope: "duaer-ai-desk/subagent/setScope",
    subagentSetBuiltinEnabled: "duaer-ai-desk/subagent/setBuiltinEnabled",
    subagentSetBuiltinModel: "duaer-ai-desk/subagent/setBuiltinModel",
    subagentReveal: "duaer-ai-desk/subagent/reveal",
    marketRefresh: "duaer-ai-desk/market/refresh",
    marketSearch: "duaer-ai-desk/market/search",
    marketGetDetail: "duaer-ai-desk/market/getDetail",
    marketInstall: "duaer-ai-desk/market/install",
    marketCheckUpdates: "duaer-ai-desk/market/checkUpdates",
    marketApplyUpdates: "duaer-ai-desk/market/applyUpdates",
    marketCancelInstall: "duaer-ai-desk/market/cancelInstall",
    commandPaletteSearch: "duaer-ai-desk/commandPalette/search",
    commandPaletteExecute: "duaer-ai-desk/commandPalette/execute",
    logOpenFolder: "duaer-ai-desk/log/openFolder",
    devtoolsToggle: "duaer-ai-desk/devtools/toggle",
    composerPickFiles: "duaer-ai-desk/composer/pickFiles",
    composerPickPhotos: "duaer-ai-desk/composer/pickPhotos",
    composerImportFiles: "duaer-ai-desk/composer/importFiles",
    composerPasteFiles: "duaer-ai-desk/composer/pasteFiles",
    clipboardRecordPaste: "duaer-ai-desk/clipboard/recordPaste",
    composerCommands: "duaer-ai-desk/composer/commands",
    workspaceDiff: "duaer-ai-desk/workspace/diff",
    workspaceReviewRollback: "duaer-ai-desk/workspace/review/rollback",
    browserNavigate: "duaer-ai-desk/browser/navigate",
    browserAction: "duaer-ai-desk/browser/action",
    browserSetBounds: "duaer-ai-desk/browser/setBounds",
    browserSetVisible: "duaer-ai-desk/browser/setVisible",
    browserOpenExternal: "duaer-ai-desk/browser/openExternal",
    browserGetState: "duaer-ai-desk/browser/getState",
    fsList: "duaer-ai-desk/fs/list",
    fsRead: "duaer-ai-desk/fs/read",
    fsReadImageDataUrl: "duaer-ai-desk/fs/readImageDataUrl",
    statsGetTokenUsageHistory: "duaer-ai-desk/stats/getTokenUsageHistory",
    fsReveal: "duaer-ai-desk/fs/reveal",
    fsOpen: "duaer-ai-desk/fs/open",
    fsIndex: "duaer-ai-desk/fs/index",
    fsResolveRef: "duaer-ai-desk/fs/resolveRef",
    windowSetWorkPanelReservation:
      "duaer-ai-desk/window/setWorkPanelReservation",
    windowSetWorkPanelChatWidth: "duaer-ai-desk/window/setWorkPanelChatWidth",
    windowSetBackgroundColor: "duaer-ai-desk/window/setBackgroundColor",
    windowControl: "duaer-ai-desk/window/control",
    closeBehaviorGet: "duaer-ai-desk/window/closeBehavior/get",
    closeBehaviorSet: "duaer-ai-desk/window/closeBehavior/set",
    menuRendererReady: "duaer-ai-desk/menu/rendererReady",
    traySetSessionPreferences: "duaer-ai-desk/tray/setSessionPreferences",
    nativeMenuAction: "duaer-ai-desk/menu/nativeAction",
  },
  event: {
    pluginChanged: "duaer-ai-desk/event/pluginChanged",
    /** Progress of an install or update, while it is still running. */
    pluginInstallProgress: "duaer-ai-desk/plugin/event/installProgress",
    /** Host-originated app settings mutation (e.g. plugin `app.setTheme`). */
    settingsChanged: "duaer-ai-desk/app/event/settingsChanged",
    configSyncChanged: "duaer-ai-desk/configSync/event/changed",
    /** What a running sync is doing, while it is still running. */
    configSyncProgress: "duaer-ai-desk/configSync/event/progress",
    extensionsUiPrompt: "duaer-ai-desk/extensions/event/uiPrompt",
    extensionsStatus: "duaer-ai-desk/extensions/event/status",
    pluginLauncherShown: "duaer-ai-desk/pluginLauncher/event/shown",
    agentMessage: "duaer-ai-desk/agent/event/message",
    agentQueueChanged: "duaer-ai-desk/agent/event/queueChanged",
    hostStatus: "duaer-ai-desk/app/event/hostStatus",
    toast: "duaer-ai-desk/app/event/toast",
    /**
     * The first plaintext hop to an endpoint the user typed, sent once and only
     * until the shell records `networkPolicy.insecureNoticeAcknowledged`. The
     * shell owns the wording, because the address is not a secret and the copy
     * is localized.
     */
    insecureEndpointNotice: "duaer-ai-desk/network/event/insecureEndpointNotice",
    browserState: "duaer-ai-desk/browser/event/state",
    browserPreview: "duaer-ai-desk/browser/event/preview",
    windowMaximized: "duaer-ai-desk/window/event/maximized",
    windowFullScreen: "duaer-ai-desk/window/event/fullscreen",
    windowWorkPanelResize: "duaer-ai-desk/window/event/workPanelResize",
    menuCommand: "duaer-ai-desk/menu/event/command",
    traySessionActivated: "duaer-ai-desk/tray/event/sessionActivated",
    notificationChanged: "duaer-ai-desk/notification/event/changed",
    sessionsChanged: "duaer-ai-desk/session/event/changed",
    notificationActivated: "duaer-ai-desk/notification/event/activated",
    plansChanged: "duaer-ai-desk/plans/event/changed",
    providersOauth: "duaer-ai-desk/providers/oauth/event",
    mcpOauth: "duaer-ai-desk/mcp/oauth/event",
    updatesState: "duaer-ai-desk/updates/event/state",
  },
} as const;

export const IPC_WHITELIST = new Set<string>([
  ...Object.values(IPC.invoke),
  ...Object.values(IPC.event),
]);
