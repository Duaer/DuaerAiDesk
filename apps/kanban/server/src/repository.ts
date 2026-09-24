import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { isStatus, type Status, type Task } from "./types";

type TaskRow = {
  id: string;
  title: string;
  status: string;
  position: number;
  created_at: string;
  updated_at: string;
};

/** 列出看板时的列顺序：待办 → 进行中 → 已完成。 */
const STATUS_ORDER_SQL = `CASE status WHEN 'todo' THEN 0 WHEN 'doing' THEN 1 WHEN 'done' THEN 2 ELSE 3 END`;

/**
 * 重排时先把整列 position 抬到该偏移以上（远超任何真实列长），
 * 再逐个赋 1..N。这样在「唯一索引 (status, position)」下也不会出现瞬时的重复值。
 */
const POSITION_OFFSET = 1_000_000;

function toTask(row: TaskRow): Task {
  if (!isStatus(row.status)) {
    throw new Error(`数据库中出现了非法 status：${row.status}`);
  }
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * 看板数据访问层。所有写操作都在单个事务内完成，
 * 并且每次都返回操作后的全量看板（FR-008：客户端只认服务端真值）。
 */
export class Repository {
  constructor(private readonly db: DatabaseSync) {}

  listBoard(): Task[] {
    const rows = this.db
      .prepare(`SELECT * FROM tasks ORDER BY ${STATUS_ORDER_SQL}, position`)
      .all() as TaskRow[];
    return rows.map(toTask);
  }

  create(title: string, status: Status = "todo"): Task[] {
    return this.transaction(() => {
      const now = new Date().toISOString();
      const position = this.columnIds(status).length + 1;
      this.db
        .prepare(
          `INSERT INTO tasks (id, title, status, position, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(randomUUID(), title, status, position, now, now);
      return this.listBoard();
    });
  }

  /** 返回 null 表示 id 不存在（路由层转成 404）。 */
  updateTitle(id: string, title: string): Task[] | null {
    return this.transaction(() => {
      if (!this.getRow(id)) return null;
      this.db
        .prepare("UPDATE tasks SET title = ?, updated_at = ? WHERE id = ?")
        .run(title, new Date().toISOString(), id);
      return this.listBoard();
    });
  }

  /**
   * 把任务移动到 `status` 列的第 `position` 位（1-based「插入到第 N 位」）。
   * `position` 超过目标列长度时夹取到末尾；结果与当前完全一致时视为幂等，
   * 不写库、也不改 `updatedAt`。返回 null 表示 id 不存在。
   */
  move(id: string, status: Status, position: number): Task[] | null {
    return this.transaction(() => {
      const moving = this.getRow(id);
      if (!moving) return null;

      const sourceStatus = moving.status;
      const targetIds = this.columnIds(status).filter((taskId) => taskId !== id);
      const index = Math.min(Math.max(position, 1), targetIds.length + 1) - 1;
      targetIds.splice(index, 0, id);

      if (sourceStatus === status && sameOrder(this.columnIds(status), targetIds)) {
        return this.listBoard();
      }

      // 先让两列的 position 全部离开最终取值的区间，再赋 1..N。
      this.parkColumn(status);
      if (sourceStatus !== status) this.parkColumn(sourceStatus);

      this.db
        .prepare("UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?")
        .run(status, new Date().toISOString(), id);

      this.assignPositions(targetIds);
      if (sourceStatus !== status) {
        this.assignPositions(this.columnIds(sourceStatus));
      }

      return this.listBoard();
    });
  }

  /** 返回 null 表示 id 不存在。删除后同列 position 立刻保持连续。 */
  delete(id: string): Task[] | null {
    return this.transaction(() => {
      const row = this.getRow(id);
      if (!row) return null;

      this.db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
      this.parkColumn(row.status);
      this.assignPositions(this.columnIds(row.status));

      return this.listBoard();
    });
  }

  private getRow(id: string): TaskRow | null {
    const row = this.db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as
      | TaskRow
      | undefined;
    return row ?? null;
  }

  private columnIds(status: Status): string[] {
    const rows = this.db
      .prepare("SELECT id FROM tasks WHERE status = ? ORDER BY position")
      .all(status) as { id: string }[];
    return rows.map((row) => row.id);
  }

  private parkColumn(status: Status): void {
    this.db
      .prepare("UPDATE tasks SET position = position + ? WHERE status = ?")
      .run(POSITION_OFFSET, status);
  }

  /** 按给定顺序把 position 重写为 1..N；调用前该列必须已经 park 过。 */
  private assignPositions(ids: readonly string[]): void {
    const statement = this.db.prepare("UPDATE tasks SET position = ? WHERE id = ?");
    ids.forEach((id, index) => {
      statement.run(index + 1, id);
    });
  }

  private transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        // 回滚本身失败时，优先抛出原始错误。
      }
      throw error;
    }
  }
}
