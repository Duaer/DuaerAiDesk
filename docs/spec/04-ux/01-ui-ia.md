# 01. UI Information Architecture

> Language: English (per ADR 0009). This describes the shipped Codex-aligned
> shell (D034+). Component detail: [08-component-spec](08-component-spec.md);
> visual tokens: [07-ui-design-system](07-ui-design-system.md); behavior:
> [09-interaction-patterns](09-interaction-patterns.md).

## 1. Goal

A clear, restrained, developer-first workbench: one window, one active
destination, chat as the home surface, tools and permissions inline.

## 2. Shell regions

```text
+----------------------------------------------------------------------+
| Platform titlebar: macOS traffic lights / Windows/Linux actions     |
+------------------+--------------------------------+------------------+
| Sidebar (275px) | Main pane (active destination) | Work panel       |
|                  |  chat home / transcript        |  (optional,      |
|                  |  or Extensions page            |   resizable      |
|                  |                                |   ≥244px, dynamic|
|  Projects   ↕ + |                                | surface          |
|   Project A      |                                | ◫ | App.tsx  ⌄ × |
|   Project B      |                                | > |              |
|                  |                                | ◎ | Active       |
| Footer [⚙][plug][☾][bell] |  Floating composer (chat) |   | resource     |
+------------------+--------------------------------+------------------+
```

- **Sidebar**: primary navigation — retained open-project groups under
  **Projects**, with sort before the new-project action, and the
  WorkBuddy-inspired footer. Path-less conversations are not listed. The footer keeps compact Settings,
  Extensions, Scheduled (clock), and notification icon actions; Pull requests
  remains omitted from the home sidebar. Each retained project is a
  path-keyed tab/group that can be
  collapsed independently. Project and conversation rows expose
  non-destructive pin/archive actions, an independent conversation-branch
  command, and sortable views. Projects not retained in the sidebar remain
  discoverable through Settings → Project archive.
  Collapsible to an icon rail (Cmd/Ctrl+B). Its expanded column is user-resizable
  from 240px to 520px (default 275px); dragging below 160px collapses it.
- **Product identity**: runtime shell copy uses `DuaerAiDesk`; the home hero and
  sidebar reuse the derived `src/assets/brand/logo-*.png` marks, while composer prompt
  rows have no leading brand icon and session-creation controls use a dedicated
  message-plus icon. On
  Windows/Linux, the expanded sidebar begins with a keyboard-accessible Home
  brand and Collapse sidebar at the right; activating the
  brand returns the main pane to chat. The macOS expanded sidebar omits the
  logo/title brand and places only Collapse sidebar at the right of
  the traffic-light row. `Codex` remains only an external import source or a
  design-reference term.
- **Main pane**: exactly one destination at a time; destinations replace the
  pane (they are pages, not modals). Once Settings or Extensions is selected,
  bootstrap completion and background refreshes must not replace that
  destination with the chat home; only an explicit navigation action may do so.
  The outer pane stays fluid while the sidebar is collapsed. The centered chat
  content band defaults to 760px and is user-resizable (D439); it compresses
  with `min(available pane, preferred)` instead of tightening to a 640px ceiling.
- **Titlebar**: platform-native desktop chrome (D118). macOS uses
  `hiddenInset` traffic lights and the system application menu. The expanded
  sidebar keeps Collapse sidebar in the same 46px row, aligned to
  the right outside the traffic-light safety area; no logo/title is rendered
  there, including in fullscreen. When the work panel is open, native window
  controls stay viewport-fixed at the window's right edge and the panel header
  reserves that band plus the work-panel toggle. The panel header is a
  horizontally scrollable tab strip followed by a fixed `+` add trigger; tab
  close actions stay in the tabs, so the Windows native close control is not
  visually duplicated by a second header `×`.
  Windows/Linux use a menu-free frameless 46px row with sidebar actions on the
  left and accessible minimize / maximize-or-restore / close controls at the
  right edge of the conversation pane when the panel is closed (D129). When
  the work panel is open, those controls stay viewport-fixed over the panel
  header rather than travelling with MainPane. One window-level control band
  stays outside pane stacking contexts across panel open, preview, restore,
  and Settings transitions. Its background follows the adjacent titlebar surface
  (dock header when open, conversation surface when closed) in both themes.
  Boot splash, search, and toasts stay above that band.
  Preview navigation must also remain above the panel;
  macOS keeps native traffic lights and its existing fullscreen insets.
  Destination history is
  shortcut-first (`Cmd/Ctrl+[` and `Cmd/Ctrl+]`) with no dedicated back/forward
  chrome; while Extensions is active, the footer Plugins button performs one
  Back step as the only pointer affordance. The main titlebar has no
  notification action; the durable local inbox opens from the sidebar footer
  bell instead (D130/D117). In work-panel preview mode, MainChat is unmounted
  and a window-level 46px chrome row keeps New Task, sidebar, and native window
  controls available without owning a drag or no-drag rectangle across the
  panel. The panel header alone owns dragging in the preview pane; its actual
  border box starts after the shell action lane plus an 8px gap, including the
  expanded-sidebar New Task button, on every platform. The left inset is 8px,
  or 88px for collapsed-sidebar windowed macOS. Its right native-control
  exclusion is unchanged. Header paint fills the excluded lane without an
  opaque overlay hiding tabs or panel actions. The macOS inset uses the shared
  `--ds-window-lead-inset` token — the cluster's 76px right edge (from
  `@duaer-ai-desk/shared`) plus a 12px gap — and the main process positions the
  buttons from that same shared geometry.
- **Work panel**: docked right column (not an overlay) opened by an artifact,
  the viewport-fixed toggle, or `Cmd/Ctrl + J`. File, URL, browser-preview, and
  successful workspace-edit artifacts create their resources atomically. The
  46px content header exposes a tablist and a fixed `+` trigger. Its tokenized
  44px right-side safe lane (the 28px control, its 12px viewport inset, and the
  header's 4px control gap) keeps the `+`, maximize, and viewport-fixed
  work-panel toggle one button group, spaced by that same gap, while the trigger
  keeps a distinct hit target. Clicking `+` creates and activates
  a unique New launcher tab; its body presents the same data-driven Review and
  plugin-view rows as buttons, so the user chooses a destination in the page
  instead of opening a dropdown. Selecting a row replaces that launcher tab with
  the destination or activates an existing singleton. File paths stay distinct
  while plugin views deduplicate by view reference. The viewport-fixed toggle
  and `Cmd/Ctrl + J` both toggle the active session's retained panel context —
  revealing it without creating a resource tab and collapsing it without
  discarding one; the create trigger remains unavailable while the panel is
  closed. Closing the final tab keeps the panel open and shows the New launcher.
  No agent or tool result opens, activates, or resizes the panel: Review is
  reached only through an explicit user action. A project-header control opens
  the host-owned Requirements tab for that project: four fields (goal, out of
  scope, acceptance, assumptions), module tabs, and a confirm lock that requires
  the same local checks as the Duaer-spec live desk: a concrete goal, a
  checkable acceptance, and the eight baseline fields (or an explicit
  opt-out). The Requirements panel leads with the project background and an
  iteration timeline. A kickoff background is the first point for a new project.
  An older project that only stored a background string shows that text as its
  first point. A later background edit, revision, or opened change appends a
  point. The first module is the global card. The shared baseline must pass
  the local checklist. Style and layout stay empty during requirements.
  After architecture is confirmed, the built-in ui-designer writes those two
  fields onto the global card. Implementation dispatch waits until both are
  concrete, and the coder follows that text. Later modules do not
  require those shared fields when they are empty. A unique requirement written
  on a later module, including its own device matrix, still has to pass that
  field's check. A complaint about a confirmed module or the finished product, such
  as a request to make it look better, does not rewrite that confirm card and
  does not ask for a style menu. It is stored as a separate revision: what to
  change, what to leave, a checkable result, and why it was unsatisfactory.
  The revision names one module or the whole product. Each field is a card;
  list items are inset rows with a marker or a
  number, and a click opens those rows for editing. Modules are split from
  the chat `modules` inventory, the same way the Duaer-spec live desk does it.
  Module tabs show draft, ready, or confirmed, plus a confirmed count. When those
  local checks pass, DuaerAiDesk reviews the card with the built-in `judge`
  employee. That employee can use only the judgment model (Model Advanced,
  **Set as judgment model**, one binding such as `jev-latest`). A `jev-*`
  model is reviewed through that provider's judgments endpoint
  (`POST /v1/judgments`):
  the call decides whether the card can lock and does not rewrite the card.
  Other models still use a one-shot chat completion. Task can call
  the same employee wherever a pass or fail judgment is needed. With no
  judgment model set, the review follows the conversation model and Task does
  not offer `judge`, and
  narrates start/pass/fail in the requirements chat (same pattern as the
  Duaer-spec live desk). The checking line is that same note; pass or fail
  replaces it, so a finished review does not leave a checking note above the
  result. Confirm stays off until that review passes for the
  current card. If the local checklist or that review fails, Auto-fix stays a
  choice chip on the latest requirements chat turn (not on the right panel).
  While the only failures are a goal or acceptance that is still too short,
  Auto-fix stays off so the chat can keep asking what to build.
  A later reply does not hide it while the card still fails.   Choosing it sends only the failing fields and the items they still lack
  into that chat as a user turn. That turn does not attach the requirements
  instruction or the other card fields, so the desktop model rewrites those fields
  and leaves the rest of the card alone. The reply fills those fields through the usual `<<<JSON>>>` path, then
  review runs again. Incomplete baseline fields can be filled
  with the same explicit defaults before that review. The sidebar stage chip appears only after
  that card exists. On the chat page the dialog column is at most 460px, and the
  divider cannot drag it wider.   With the sidebar expanded, the sidebar and the
  dialog share that 460px; with the sidebar collapsed, the dialog uses all of it.
  The sidebar starts as a 56px icon rail. Hovering the rail opens the session
  list over the dialog without changing that width. The sidebar shortcut pins
  the list open.
  Switching Requirements, Architecture, Dispatch,
  and Review keeps that same width. The right
  column stays open on the chat page.   After every module is confirmed, Architecture opens
  and DuaerAiDesk starts one architecture-design chat turn (live-desk style). The Architecture
  panel mirrors the live-desk layout: title, hint, summary, a dark diagram mount with
  component nodes at their authored size (the figure shrinks only when it is wider than the panel), then action buttons (confirm / regenerate / redesign). Chat `<<<JSON>>>`
  fills `summary` + `components`. When the diagram can be locked, the chat
  offers two choices: confirm the architecture, or keep revising. Confirm
  locks the board. When style and layout are still empty, one chat turn asks
  the UI designer for them and writes them onto the global card. Implementation
  dispatch and the task split start only after both are concrete. The
  architecture panel shows the diagram and does not carry process buttons.
  Archify HTML diagrams, revise dual-diagram, and bug-desk skip-architecture
  remain follow-ups. Dispatch stays closed
  until someone signs the scope and acceptance baseline. Opening a change
  clears that signature, returns every module to draft, and asks for the
  architecture to be confirmed again.   Creating a project requires a background description; DuaerAiDesk then sends
  the live-desk kickoff into that project's requirements chat. When the folder already
  contains product files, those same confirm cards record the current functions, and the
  architecture turn records the current system, so a later change is an increment on that
  baseline. An empty folder keeps the new-product kickoff. While the Requirements or
  Architecture tab is active, the assistant reply fills the open card while
  the turn is still streaming. Labeled lines and an incomplete `<<<JSON>>>`
  tail update the card on the next paint; the finished `<<<JSON>>>` or a
  trailing JSON card commits it. The fill follows only the live tail message,
  and short options become reply chips. Bullets that restate confirm-card
  fields are not chips, and emphasis markers are stripped from chips and from
  the user message that echoes them. Once the goal and acceptance already
  pass, empty baseline fields are filled with the opt-out defaults so confirm
  can proceed. A local static page can satisfy that baseline in ordinary
  words: no backend, an HTML file, no interaction, no import, no external
  dependency, and no performance budget. Naming a modern browser is enough
  for that page. A `file://` page that already states a measured limit (time,
  size, or frame rate) does not also need INP, virtual scroll, weak-network,
  and large-data tokens. The compat-lab checklist stays for a card that has a
  backend or a customer environment. An app performance budget still needs
  that lab list.
  Dispatch lists the acceptance tasks and starts them with DuaerAiDesk Task
  subagents. An implement task calls the built-in coder (Duaer Coder), who writes
  only the code that meets that task's acceptance. Choosing more than one employee spreads independent tasks across
  those employees. The app releases one ready task per employee. The next wave
  is sent only after the chat is idle and every task in the current wave is
  stored as done. Finished task ids are not dispatched again, and the model
  does not choose the next wave. A wave that does not succeed is left for the
  user; it is not retried on its own. Starting execution stays
  on the Dispatch tab so progress stays visible. Digital employees are configured
  in Settings, on the page named for them; each one stores its own model there,
  and an empty model follows the current chat. Dispatch offers a host choice of none or GitHub Pages.
  Cloudflare, Alibaba Cloud, and AWS appear there only after both keys are saved under Settings → Deploy.
  A chosen host adds a closing publish task and shows the preview URL written back on that
  page. The dispatch graph uses the same flowing canvas as the
  architecture diagram, and each dependency runs through the gutter between
  columns. Ordinary coding
  sessions do not open this tab. A successful workspace
  Write/Edit leaves the panel exactly as the user left it and shows its
  evidence as a transcript card instead. The inner
  divider resizes the panel through the shared three-column budget; moving it
  left takes space until MainChat reaches 450px, at which point the expanded
  sidebar yields immediately, and moving it right gives space back. A manual
  sidebar reopen spends work-panel width first and otherwise targets a 460px
  MainChat width. The sole
  panel-level control is the viewport-fixed toggle; each session retains its own runtime
  open state, tab set, active tab, and Browser resource in renderer memory.
  Selecting another session swaps the visible panel context without deleting
  either session's state; selecting a workspace without an active conversation
  hides the panel rather than reinterpreting relative resources. Background
  artifacts update only their originating session's retained panel context and
  never open, activate, or resize the visible panel. Startup is closed with no
  retained session contexts, and only the preferred panel width persists across
  launches.
  The work panel remains a fixed-width in-flow column beside MainChat inside
  the existing client area (ADR 0033 / ADR 0151). MainChat keeps a hard 450px
  minimum; the work panel's effective maximum is the remaining client width
  after the expanded sidebar and that floor (ADR 0238). When the budget is
  exhausted the sidebar collapses immediately through its existing animation
  (the budget still counts it while `sidebar-out` occupies flex space) and
  returns when the panel closes. Opening and collapsing change only the
  shell's internal flex allocation and never expand or shrink native window
  bounds; no panel action requests a positive native reservation. The
  panel-header preview toggle temporarily unmounts MainChat and expands the
  panel across the client area beside the sidebar; leaving preview restores the
  prior panel width and sidebar state without changing native bounds. The
  renderer-measured panel
  rectangle continues to position the native Browser view. Native window edges
  resize the app window only; they do not change the panel target. The outer
  window remains natively resizable from all OS edges and corners, with a
  minimum supported size of 1040×700. Replaces
  the former context-panel overlay; workspace/model/status info lives in the
  composer chips and Settings instead.
- **Composer**: workspace-agnostic floating pill anchored to the conversation
  destination — centered empty-home content above a bottom-reserved composer
  (D111/D204/D206), bottom-docked in a transcript, with no project / Local / branch
  rail (D095).
  Its left-of-input operating-mode chip is the sole active-session control for
  **Agent**, **Plan**, and **Goal**. Plan shows the same Agent's planning state;
  Goal shows the same approval boundary for an outcome contract. Both keep the
  permission-mode chip and expose their host-written immutable `.pi/plan/*.md`
  or `.pi/goal/*.md` artifact opener after submission. The conversation top bar
  retains only the task title and window actions; the Composer owns model and
  reasoning selection as well as mode control.
- **Backend status capsule**: appears under the titlebar while the backend
  restarts or is fatally degraded (D080), with an Open-logs action.

## 3. Destinations

### 3.1 Chat home (default)
- Empty state: a restrained hero title ("What can I help you build?" — a
  project-bound session turns the project name into a dotted-underline
  switcher that lists the sidebar's open projects, can search them, can
  clone a git repository from a syntactically public remote (ADR 0247 / D416), and can open another local folder), an optional first-run
  checklist, and a bottom-reserved composer. Task entry starts directly in the composer; no
  redundant supporting paragraph, developer starter cards, or contextual
  quick-action row is rendered (D204/D206).
- With transcript: message stream + tool disclosure rows (D071), a contextual
  message-scoped review card immediately after each successful workspace
  Write/Edit row, docked composer, and a session-scoped permission card inline.
  The card reads the message's durable review snapshot rather than the current
  Git diff, so it stays visible after commit. It shows the file status and
  addition/deletion counts, expands the exact message hunks in place, and
  offers guarded rollback; it is not a global transcript entry. A background
  session's message, tool, and permission events never replace or cover the
  visible conversation.

### 3.2 Sidebar project groups

- **Sections**: the sidebar lists retained projects only. Path-less
  conversations are not given a section, a create action, or an empty state.
  The `Projects` heading owns the sort/archive-view menu and the folder-picker
  action. Its toolbar places sorting before new-project creation. The heading
  keeps quiet glyph actions and also accepts a right-click create menu on the
  heading or empty list chrome. Retained project groups use the remaining
  height and scroll independently.
- **Identity**: each project group is keyed by a host-owned logical group id;
  each root path remains canonical and is never inferred from an ambiguous
  folder basename. Legacy single-folder projects are compatibility groups.
- **Header**: project name, current-workspace dot, disclosure, new-task action,
  and an overflow menu. Workspace context is not navigation selection: project
  headers have no persistent selected background, including when no conversation
  is selected. Only the current conversation on the chat page receives selected
  row paint. Project and conversation rows share full-row hover feedback; the
  project title itself stays transparent. The directory title is one full-row disclosure target;
  collapse/expand affects only child visibility, and adjacent groups form one
  dense tree rather than detached cards. Hovering or focusing the project title
  reveals the full project path. Pressing the title and moving 8px reorders
  the group.
- **Project actions**: open folder reveals the primary project directory; Edit
  project changes the host-owned logical group name and adjusts eligible
  non-primary roots (keeping renderer metadata in sync); pin/unpin changes
  presentation priority; archive/restore hides or restores the group in the
  default view; close removes the retained primary tab without deleting or
  archiving group roots, sessions, or memory. Expanded Project archive details
  list every group root.
- **Conversation actions**: rename, pin/unpin, archive/restore, fork, and
  delete remain separate actions. Rename edits the task label only; archive
  never removes the transcript. Open folder is a project action, not a
  conversation action.
- **Temporary-task attachments**: selecting a saved attachment opens its file
  preview even without an open project. Back returns to the no-project browsing
  state. Branches preserve referenced pasted/imported inputs as child-owned
  copies; deleting the source task does not break these previews.
- **Sort**: user-facing modes are Recently updated, Created date, Oldest
  first, and Name. Pinned rows precede unpinned rows. Project groups switch
  to `manual` by dragging a title or using ArrowUp/ArrowDown on that
  title. Session `manual` remains a compatibility value.
- **Conversation list**: each group shows the ten most-recent sessions in the
  active sort order by default; the remainder folds behind a **Load N more…**
  row that expands the full time-grouped list on click. Pinned rows precede
  unpinned rows and are never pushed behind the fold; the expansion state is
  not persisted.
- **Standalone sessions**: path-less sessions remain in the separate Sessions
  section and never inherit the last active project's workspace.
- **Concurrency**: the shell selects one visible project at a time, while
  agent run state remains keyed by session. Switching project tabs does not
  cancel a background turn. Background events update only their originating
  session and never change the active session, page, project, or keyboard
  focus.

### 3.3 Pull requests
Segmented Open/Draft/All filters with counts; rows carry icon plate, number,
title, status badge, branch meta, external link, and "Review with agent"
(creates a chat turn). Requires an active workspace and `gh`.

### 3.4 Scheduled
Tasks and Run history views, with an explicit create/edit form, a cadence dropdown, time,
next occurrence, saved project, per-task permission/model selection, pause/resume and delete confirmation. Hourly
schedules repeat at one-hour intervals without a time selector. Daily schedules
use a themed time-period dropdown: Morning 09:00, Afternoon 14:00, Evening
19:00, Night 22:00. The form does not expose hour/minute editing. AI tools may
set an exact time; a non-preset time displays as Custom with its HH:mm value
and survives other form edits until the user explicitly selects a preset. Weekly schedules select one or more weekdays (Monday = 0) in a
separate dropdown listing Monday through Sunday with selection markers.
Each day toggles independently; there are no preset combinations. An empty
selection disables saving. The menu supports arrows, Home/End, Enter/Space,
Escape/outside dismissal, and exposes selected states. The footer clock and global search open
this route. Run now dispatches in the background and selects Run history; a
conversation link opens the real transcript. The latest 100 runs show running,
completed, failed or interrupted status. Automatic runs never steal foreground
focus. See [desktop automations](../../adr/scheduled-desktop-automations.md).

The application must remain running. The host polls every 30 seconds and skips
occurrences more than 90 seconds late or overlapping a running task. Startup
rearms future occurrences only. Hourly schedules wait a full hour after saving,
enabling, startup or the preceding automatic admission; Run now leaves the
automatic occurrence unchanged. Legacy cadence-only tasks require explicit
schedule configuration. New tasks explicitly save the selected project, Ask
permission mode and the current default provider/model. Each selector writes only
to that task. The prompt is labelled Instruction, and these three selectors sit
inside its bottom toolbar using the same shell, chip and anchored-menu treatment
as the main Composer. Both surfaces render the same controlled permission picker
and searchable, provider-grouped model list with capability badges. The task model
chip displays the model name or alias without a provider prefix. Task selection
callbacks update only the task draft, never the active conversation or app defaults.
The instruction input has its own rounded border and tonal
background above the toolbar, with no native resize handle; longer text scrolls
inside the input. Existing tasks without provider/model fields continue following the
app defaults; unavailable saved models remain visible and are not silently replaced.
Selecting Auto warns that restricted actions may run without asking. The current
project is captured when first configured when no explicit selection exists;
subsequent foreground project changes do not retarget it. This includes Manual
tasks and tasks saved without a project: Run now, renaming, and cadence changes
preserve that binding, including after restart. Only legacy tasks without a saved
binding capture the current project on their first explicit configuration. Legacy automatic
runs without a saved permission mode use Ask and may wait for input in their conversation.
New tasks default to Agent. A migrated Plan or Goal task is allowed to remain
stored, but an unattended run is explicitly rejected before provider, artifact,
or queue work with `PLAN_REQUIRES_INTERACTIVE_SESSION`; it cannot display or
auto-approve a contract.
The user must explicitly switch it to Agent before enabling unattended
execution.

Agent tools can change a Manual task to Hourly by supplying only its id and
`cadence: "hourly"`; no calendar time is required. Preserve existing schedule
fields and paused state. Daily and Weekly still require a valid saved or supplied
schedule. Renaming an Hourly task does not restart its interval.

### 3.5 Extensions

The Extensions destination is a focused plugin surface with a compact header and
only two tabs: **Installed** and **Marketplace**. Installed groups plugin rows
by state — Needs attention / Updates available / Active / Turned off — as soft
tiles stacked under a group label (D296). Marketplace remains the browse/install
card grid. The page draws no dividers: header, toolbar, rows, source settings,
cards and the detail sheet's sections are set apart by tone and spacing, and
hairlines are reserved for floating layers (menus, sheet, dialogs). The
marketplace source settings show the source selector without a redundant
provider explanation or active-source status line. MCP, Skills, and Subagents
are not tabs or sections of Extensions.

### 3.6 Settings (full-page takeover)
### 3.6 Settings (full-page takeover)
Settings replaces the whole shell (D063): back-to-app + search + a grouped
settings rail with concise, parallel destination labels. The Agent group
contains independent Skills, MCP, and Subagents destinations alongside
Instructions and Model configuration; selecting one
changes the page destination rather than a tab inside a shared capability panel.
Appearance lives inside General; global AI behavior (permissions and context
management) lives inside 全局 AI; keyboard shortcuts and global/project
instructions have their own destinations; provider management lives inside
Model configuration. Import scans supported local agent stores for sessions
and, independently, for model configuration, and presents candidates in
collapsible groups. Project path is an alternate grouping for sessions
alongside the default source grouping, and every scan or grouping change starts
with all groups collapsed. Model-configuration import copies stored API keys
and skips subscription logins. Project archive owns the durable D086 Projects index
(search, add, expand, pin, archive/restore, close, and reopen) and always includes
archived records. Opening or switching a project retains a sidebar tab, selects
that project as the active workspace, and returns to chat. Other retained tabs
stay open. Extension management remains solely on the app shell's independent
Extensions destination described in §3.5. Settings > Agent has the following
shared capability contract:

- Each capability destination starts with a quiet localized description and
  scope note, then uses the same neutral elevated Settings surface as the other
  destinations; no capability page has a decorative hero, colored top bar, or
  separate visual theme.
- Skills and MCP use stacked global/project card blocks in one column. Each
  block has a quiet heading row with a scope title, scope description,
  resolved `.agents` path, localized count, and its actions; the project
  block shows a recent-project picker. Project records take precedence over
  global records.
- Skills have one native **Import** action per surface. It accepts exactly one
  file and physically copies it into the selected `.agents/skills` directory.
- MCP has one **Add** action per surface. Add and Edit open the existing
  `McpEditorSheet` as a modal overlay with stdio/HTTP branches, validation,
  duplicate checks, locked edit ids, scope text, and Test connection feedback.
- Subagents use one full-width global surface under `~/.agents/subagents`; they
  have no project picker, project surface, or project-level toggle. Creating or
  editing a subagent picks the pinned model from configured provider models, or
  inherits the session model; it does not require typing a `provider/model` id.
- All three lists flow at natural page height, render a quiet centered empty
  state inside the panel, dim disabled rows, and store enablement in app-local
  state rather than capability files. Loading and project changes render
  skeleton rows with the same anatomy and disable competing controls until the
  host refresh completes.

## 4. Overlays

| Overlay | Trigger | Notes |
|---|---|---|
| Command palette | Cmd/Ctrl+K (also Cmd/Ctrl+Shift+P per D014) | builtin + plugin commands |
| Model menu | Composer-right model × reasoning chip | configured provider/model choices + settings entry (D091) |
| Profile menu | sidebar footer | Settings / Logs / Theme cycle (D041) |
| Notification inbox | sidebar footer bell | All/Unread views, task failure rows only (successful completions are hidden, D295), mark-all-read and clear actions (D130/D117) |
| Toasts | events (plugin toast, backend restored, copy) | top-center; 4s default, 8s for errors |
| Project switcher | empty-home underlined project name | sidebar open projects + search + clone git project + open project |

## 5. Navigation model

- `page` state: `chat | pulls | scheduled | plugins | settings`; `chat` is the
  conversation-surface route, not an operating mode. The project
  archive is the `projects` settings tab rather than a standalone page.
- Destination history is linear; `Cmd/Ctrl+[` and `Cmd/Ctrl+]` traverse it
  without persistent back/forward chrome. While Extensions is active, the
  footer Plugins button reuses one Back step (§2 shell regions); no separate
  back or forward control is added.
- Selecting a project tab reuses `project.set` when its path differs from the
  selected host workspace and keeps the other tabs retained.
- Selecting a project-scoped thread activates its project before switching to
  `chat`. Selecting a temporary thread clears the visible active workspace
  before loading it.
- Empty home has three explicit session states: a project-bound session shows
  the project-underlined welcome; clicking the name opens a searchable
  switcher of the sidebar's open projects instead of the folder picker. A
  temporary session shows dedicated temporary-chat copy with no project
  underline or switcher; and no active session keeps the generic welcome
  title.
- New task resolves the current project or temporary group by its most recent
  session: if that session has `messageCount = 0`, it is selected and reused;
  otherwise a durable empty session is created immediately and appears in the
  sidebar. Repeated clicks therefore keep one empty slot per visible group;
  an empty slot remains persisted until the user deletes or archives it.

## 6. Keyboard map (IA level)

| Keys | Action |
|---|---|
| Cmd/Ctrl+K, Cmd/Ctrl+Shift+P | command palette |
| Cmd/Ctrl+B | toggle sidebar |
| Cmd/Ctrl+[ | previous destination |
| Cmd/Ctrl+] | next destination |
| Cmd/Ctrl+N | new task |
| Cmd/Ctrl+O | open project |
| Cmd/Ctrl+, | settings |
| Cmd/Ctrl+. | abort current run |
| Enter / Shift+Enter / Cmd/Ctrl+Enter | send / newline (Enter-to-send; when off, Cmd/Ctrl+Enter sends) |
| Esc | dismiss overlay/menu |

## 7. State-dependent chrome

- No provider configured → blocking guidance toward Settings before first run
  (`MODEL_NOT_CONFIGURED`).
- No workspace → home hero without project underline; Pull requests shows a
  workspace-required empty state. The composer never renders a workspace rail.
- Background project session → the originating project row retains its
  running/error indicator. Selected shell state can move independently while
  the session tool root remains bound to its durable project; its artifacts are
  retained in that session's work-panel context without opening or activating
  tabs over the currently selected project. Messages, tool events, permission
  requests, and panel resources remain scoped to that session. Explicitly
  opening the conversation restores its retained panel context and reveals any
  pending permission card with its original deadline.
- Completed/failed turn not already visible → host-core appends one durable
  inbox row. A result shown in the visible, focused current chat and every
  `aborted` turn append none. Background sessions and any turn finishing while
  the window is unfocused still append. The sidebar footer bell lists only
  `task.failed` rows and its badge counts only unread failures; successful
  completions stay in the durable record for the sidebar outcome badge and
  native notification but never appear in the inbox (D295). Selecting a row
  marks it read and activates its bound project/session.
  Electron additionally presents a native task notification only when the
  app window is unfocused, and clicking it focuses the window before activating
  the same session (D117). Interactive ask/permission/plan prompts use their
  separate native path and may alert for a focused background session. Receiving
  either durable or native notification events never navigates by itself; only
  explicit activation does.
- Backend degraded → status capsule (restarting) or fatal banner with Open
  logs (D080); composer submits are rejected with readable errors while down.
  - Plan/Goal checkpoint → the originating session shows only the structured title
  and an opener for its immutable `.pi/plan/*.md` artifact. The renderer retains the latest
  proposal/execution snapshot per session only for the current renderer
  lifetime, updated by live Host events; only a live `pending` row forms the
  approval gate. Reload through `plans.pending` while the same Host remains
  alive restores a still-pending row with its original deadline. Rejected,
  expired, approved/completed, and interrupted terminal cards are not
  rehydrated; a terminal card may remain visible and non-actionable only until
  renderer reload. Reject, expiry, or interruption clears the approval gate,
  leaves the session in its contract state and editable, and requires a later turn to
  create a new artifact. While pending, the draft remains visible but
  read-only and only Approve or Reject actions are enabled. Host/app restart
  interrupts prior work before RPC with no replay or stale action; pending
  unapproved work remains Plan, while already-approved interrupted execution
  remains Agent. The UI is not required to present that interrupted terminal
  snapshot after restart.

## 8. i18n

English is the source locale. Shipped translations (zh-CN, zh-TW, Turkish, German, Spanish, French, and
Korean) cover shell chrome; labels are asserted by US-UI e2e scenarios.
Copy rules live in [02-i18n-english-first](02-i18n-english-first.md).
