import type { DatabaseSync } from "node:sqlite";
import express, { type NextFunction, type Request, type Response } from "express";
import type { ZodError } from "zod";
import { Repository } from "./repository";
import { createTaskSchema, moveTaskSchema, updateTaskSchema } from "./schemas";
import type { ApiErrorCode } from "./types";

export type AppOptions = {
  db: DatabaseSync;
  /** 仅用于 `/api/health` 暴露当前数据库位置。 */
  dbPath: string;
};

function sendError(
  res: Response,
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: unknown,
): void {
  const body: { error: { code: ApiErrorCode; message: string; details?: unknown } } = {
    error: { code, message },
  };
  if (details !== undefined) body.error.details = details;
  res.status(status).json(body);
}

function rejectBody(res: Response, error: ZodError): void {
  const details = error.issues.map((issue) => ({
    path: issue.path.map((segment) => String(segment)).join("."),
    message: issue.message,
  }));
  const first = details[0]?.message ?? "请求参数不合法";
  sendError(res, 400, "INVALID_BODY", first, details);
}

function readId(req: Request): string | null {
  const id = req.params.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function readBodyParserErrorType(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "type" in error) {
    const type = (error as { type?: unknown }).type;
    if (typeof type === "string") return type;
  }
  return null;
}

/**
 * 装配 Express 应用。数据库句柄由调用方注入（测试里用临时库），
 * 这里不监听端口 —— 监听只发生在 `index.ts`。
 *
 * 约定：所有写操作都返回全量看板（FR-008），客户端只认服务端真值。
 */
export function createApp(options: AppOptions): express.Express {
  const repo = new Repository(options.db);
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "128kb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", db: options.dbPath });
  });

  app.get("/api/tasks", (_req, res) => {
    res.json({ tasks: repo.listBoard() });
  });

  app.post("/api/tasks", (req, res) => {
    const parsed = createTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      rejectBody(res, parsed.error);
      return;
    }
    const tasks = repo.create(parsed.data.title, parsed.data.status ?? "todo");
    res.status(201).json({ tasks });
  });

  app.patch("/api/tasks/:id", (req, res) => {
    const id = readId(req);
    const parsed = updateTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      rejectBody(res, parsed.error);
      return;
    }
    const tasks = id === null ? null : repo.updateTitle(id, parsed.data.title);
    if (!tasks) {
      sendError(res, 404, "NOT_FOUND", "任务不存在");
      return;
    }
    res.json({ tasks });
  });

  app.post("/api/tasks/:id/move", (req, res) => {
    const id = readId(req);
    const parsed = moveTaskSchema.safeParse(req.body);
    if (!parsed.success) {
      rejectBody(res, parsed.error);
      return;
    }
    const tasks =
      id === null ? null : repo.move(id, parsed.data.status, parsed.data.position);
    if (!tasks) {
      sendError(res, 404, "NOT_FOUND", "任务不存在");
      return;
    }
    res.json({ tasks });
  });

  app.delete("/api/tasks/:id", (req, res) => {
    const id = readId(req);
    const tasks = id === null ? null : repo.delete(id);
    if (!tasks) {
      sendError(res, 404, "NOT_FOUND", "任务不存在");
      return;
    }
    res.json({ tasks });
  });

  app.use((_req, res) => {
    sendError(res, 404, "NOT_FOUND", "接口不存在");
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) return;

    const parserErrorType = readBodyParserErrorType(error);
    if (parserErrorType === "entity.parse.failed") {
      sendError(res, 400, "INVALID_BODY", "请求体不是合法的 JSON");
      return;
    }
    if (parserErrorType === "entity.too.large") {
      sendError(res, 400, "INVALID_BODY", "请求体过大");
      return;
    }

    console.error("[kanban] 未预期的服务端错误：", error);
    sendError(res, 500, "INTERNAL", "服务器内部错误");
  });

  return app;
}
