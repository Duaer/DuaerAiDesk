# kanban — 本地任务看板

一个单用户、纯本机的任务看板：三列（**待办 / 进行中 / 已完成**），支持创建、拖拽跨列与同列重排、就地改名、二次确认删除。数据存在本地 SQLite 单文件里，刷新页面、重启 API 都不丢。

前端 Vite + React + Tailwind，后端 Express + `node:sqlite`（Node 内置，无需原生编译）。

## 快速开始

```bash
cd apps/kanban
pnpm install   # 首次；pnpm workspace 会在仓库根统一装
pnpm dev       # 同时拉起 API 与 Web
```

打开 **http://127.0.0.1:5273** 即可使用。

| 服务 | 地址 |
|---|---|
| Web | `http://127.0.0.1:5273`（strictPort，被占用则直接失败） |
| API | `http://127.0.0.1:8787`（只监听 127.0.0.1） |

`/api` 由 Vite dev server 代理到 API，前端只发相对路径，不存在跨域配置。

## 数据存放

默认数据库文件：**`apps/kanban/data/kanban.db`**（首次启动自动创建目录与建表，不需要手工建库）。

用 `DB_PATH` 环境变量覆盖：

```bash
DB_PATH=/tmp/my-board.db pnpm dev
```

想从零开始，停掉服务后删掉 `data/` 目录即可。该目录已在 `.gitignore` 中忽略。

## 使用

- **新建**：在任意一列底部的输入框敲标题，回车。标题去掉首尾空白后不能为空，且不超过 200 字符。
- **移动**：直接拖拽卡片到别的列，或在同列内上下拖动重排。
- **键盘操作**（不依赖鼠标）：`Tab` 聚焦到卡片 → `空格` 拾起 → 方向键移动 → `空格` 放下（`Esc` 放弃）。也可以直接用卡片上的 **◀ / ▶** 按钮把卡片移到相邻列的末尾。
- **改名**：双击卡片标题进入编辑，`Enter` 保存、`Esc` 取消。
- **删除**：点卡片上的删除按钮，再点「确认删除」。

写操作都是乐观更新：界面先动，请求失败时会回滚到最近一次服务端真值，并显示错误提示——不会出现「看起来成功了其实没存上」的状态。

## 常用命令

在 `apps/kanban` 下执行：

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 并行启动 API 与 Web（`scripts/dev.mjs`） |
| `pnpm dev:server` / `pnpm dev:web` | 只启动其中一侧 |
| `pnpm start` | 只以 `tsx` 运行 API（不带 watch） |
| `pnpm typecheck` | `tsc --noEmit`（前后端两个 tsconfig） |
| `pnpm test` | 全部测试（vitest：后端集成 + 前端逻辑/组件） |
| `pnpm test:server` / `pnpm test:web` | 只跑一侧 |
| `pnpm build` | `typecheck` + 前端打包到 `apps/kanban/dist` |

## API

数据模型 `Task`：`{ id, title, status: "todo"|"doing"|"done", position, createdAt, updatedAt }`，`position` 是列内 1-based 序号，每列恒为 `1..N` 连续无空洞。

| Method | Path | Body | 成功 |
|---|---|---|---|
| GET | `/api/health` | - | 200 `{status:"ok", db}` |
| GET | `/api/tasks` | - | 200 `{tasks}` |
| POST | `/api/tasks` | `{title, status?}` | 201 `{tasks}` |
| PATCH | `/api/tasks/:id` | `{title}` | 200 `{tasks}` |
| POST | `/api/tasks/:id/move` | `{status, position}` | 200 `{tasks}` |
| DELETE | `/api/tasks/:id` | - | 200 `{tasks}` |

**所有写操作都返回全量看板**，客户端整体替换本地状态（单一数据来源）。删除返回 200 而不是 204，是同一个约定的一部分。

失败统一为 `{"error":{"code","message"}}`，`code` 取 `INVALID_BODY`(400) / `NOT_FOUND`(404) / `INTERNAL`(500)。

`position` 采用「插入到第 N 位」语义：`0`、负数、非整数一律 400（不做静默纠正），超过列长度则夹取到列末尾。

## 项目结构

```
apps/kanban
├── server/            # Express API
│   ├── src/           # db / repository / schemas / app / index
│   └── test/          # 真实 HTTP 集成测试 + 不变式测试
├── web/               # Vite + React 前端
│   ├── src/           # App / api / lib（纯逻辑）/ components
│   ├── test/          # vitest + jsdom 组件测试
│   ├── index.html
│   └── vite.config.ts
├── scripts/dev.mjs    # 零依赖开发编排
└── data/kanban.db     # 运行时生成，不入库
```

## 说明

- 单用户、本机使用，无登录、无外联；不做多标签页冲突检测（后写覆盖）。
- Node ≥ 22.19。`node:sqlite` 目前在 Node 上仍会打印一条 `ExperimentalWarning`，不影响功能。
- 开发期的 UI 验收走手工流程（见 `.duaer/specs/001-task-board/`）；未接入 Playwright。
