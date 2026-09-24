import { mkdtempSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app";
import { openDatabase } from "../src/db";
import { STATUSES, type Status, type Task } from "../src/types";

export type TestServer = {
  /** 形如 http://127.0.0.1:54321 */
  url: string;
  dbPath: string;
  request: (path: string, init?: RequestInit) => Promise<Response>;
  listBoard: () => Promise<Task[]>;
  createTask: (title: string, status?: Status) => Promise<Response>;
  close: () => Promise<void>;
};

/** 起一个用临时 SQLite 文件的真实 HTTP 服务（`listen(0)` 拿随机端口）。 */
export async function startTestServer(): Promise<TestServer> {
  const dir = mkdtempSync(join(tmpdir(), "kanban-test-"));
  const dbPath = join(dir, "test.db");
  const db = openDatabase(dbPath);
  const app = createApp({ db, dbPath });

  const server = await new Promise<Server>((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const { port } = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}`;

  const request = (path: string, init?: RequestInit): Promise<Response> =>
    fetch(`${url}${path}`, init);

  const jsonRequest = (path: string, method: string, body: unknown): Promise<Response> =>
    request(path, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  return {
    url,
    dbPath,
    request,
    listBoard: async () => {
      const response = await request("/api/tasks");
      const payload = (await response.json()) as { tasks: Task[] };
      return payload.tasks;
    },
    createTask: (title: string, status?: Status) =>
      jsonRequest("/api/tasks", "POST", status === undefined ? { title } : { title, status }),
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      db.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

export function jsonRequest(
  server: TestServer,
  path: string,
  method: string,
  body: unknown,
): Promise<Response> {
  return server.request(path, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** 只要 id，按列分组，顺序即 position 顺序。 */
export function columnOf(tasks: Task[], status: Status): Task[] {
  return tasks.filter((task) => task.status === status).sort((a, b) => a.position - b.position);
}

export function idsOf(tasks: Task[], status: Status): string[] {
  return columnOf(tasks, status).map((task) => task.id);
}

export function titlesOf(tasks: Task[], status: Status): string[] {
  return columnOf(tasks, status).map((task) => task.title);
}

/** AC9：每一列的 position 必须恰好是 1..N（无重复、无空洞）。 */
export function expectPositionsAreContiguous(tasks: Task[]): void {
  for (const status of STATUSES) {
    const positions = columnOf(tasks, status).map((task) => task.position);
    const expected = Array.from({ length: positions.length }, (_, index) => index + 1);
    expect(positions).toEqual(expected);
  }
  expect(new Set(tasks.map((task) => task.id)).size).toBe(tasks.length);
}

export async function readError(
  response: Response,
): Promise<{ code: string; message: string; details?: unknown }> {
  const payload = (await response.json()) as { error: { code: string; message: string } };
  return payload.error;
}
