import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

/** `kanban/` 项目根（本文件位于 `kanban/server/src/`）。 */
const projectRoot = fileURLToPath(new URL("../../", import.meta.url));

export const DEFAULT_DB_PATH = resolve(projectRoot, "data", "kanban.db");

/** 数据库路径优先级：显式入参 > 环境变量 `DB_PATH` > 默认 `data/kanban.db`。 */
export function resolveDbPath(explicit?: string): string {
  const chosen = explicit ?? process.env.DB_PATH ?? DEFAULT_DB_PATH;
  return resolve(chosen);
}

/**
 * 打开（必要时创建）数据库，并幂等建表 / 建索引。
 * 目录不存在时自动递归创建，不要求用户手工建库。
 */
export function openDatabase(dbPath: string): DatabaseSync {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id         TEXT    PRIMARY KEY,
      title      TEXT    NOT NULL,
      status     TEXT    NOT NULL CHECK (status IN ('todo', 'doing', 'done')),
      position   INTEGER NOT NULL CHECK (position >= 1),
      created_at TEXT    NOT NULL,
      updated_at TEXT    NOT NULL
    );
  `);

  // 排序用索引（列出看板时按 status + position）。
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_status_position
      ON tasks (status, position);
  `);

  // 唯一约束：让「列内 position 恰好是 1..N」这条不变式在数据库层面也成立，
  // 而不只依赖应用层逻辑。事务内的重排靠 rewritePositions 的两段式写法避开瞬时冲突。
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_tasks_status_position
      ON tasks (status, position);
  `);
}
