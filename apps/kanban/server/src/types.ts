/** 三列看板的固定列，顺序即界面从左到右的顺序。 */
export const STATUSES = ["todo", "doing", "done"] as const;

export type Status = (typeof STATUSES)[number];

export function isStatus(value: unknown): value is Status {
  return typeof value === "string" && (STATUSES as readonly string[]).includes(value);
}

/** 列内 position 恒为 1..N 连续序号（1-based，无重复无空洞）。 */
export type Task = {
  id: string;
  title: string;
  status: Status;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type ApiErrorCode = "INVALID_BODY" | "NOT_FOUND" | "INTERNAL";
