const STORAGE_KEY = "duaer.desk.employees.v1";

export const DELIVERY_EMPLOYEES = [
  { id: "implementer", role: "implement" },
  { id: "regression", role: "verify-l3" },
  { id: "deployer", role: "deploy" },
] as const;

export type DeliveryEmployeeId = (typeof DELIVERY_EMPLOYEES)[number]["id"];

export type DeliveryEmployeeModels = Record<DeliveryEmployeeId, string>;

export function emptyEmployeeModels(): DeliveryEmployeeModels {
  return { implementer: "", regression: "", deployer: "" };
}

export function parseEmployeeModels(raw: string | null): DeliveryEmployeeModels {
  const models = emptyEmployeeModels();
  if (!raw) return models;
  try {
    const parsed = JSON.parse(raw) as Partial<Record<string, unknown>>;
    for (const employee of DELIVERY_EMPLOYEES) {
      const pin = parsed[employee.id];
      if (typeof pin === "string") models[employee.id] = pin.trim();
    }
  } catch {
    return emptyEmployeeModels();
  }
  return models;
}

let cachedModels = emptyEmployeeModels();
let cachedRaw: string | null | undefined;

export function loadEmployeeModels(): DeliveryEmployeeModels {
  if (typeof localStorage === "undefined") return cachedModels;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return cachedModels;
  }
  if (raw === cachedRaw) return cachedModels;
  cachedRaw = raw;
  cachedModels = parseEmployeeModels(raw);
  return cachedModels;
}

export function saveEmployeeModel(id: DeliveryEmployeeId, pin: string): DeliveryEmployeeModels {
  const next = { ...loadEmployeeModels(), [id]: pin.trim() };
  const raw = JSON.stringify(next);
  cachedModels = next;
  cachedRaw = raw;
  localStorage.setItem(STORAGE_KEY, raw);
  window.dispatchEvent(new Event("duaer-employees"));
  return next;
}

/** One line the dispatch prompt can hand to each Task call. */
export function employeeModelDirective(models: DeliveryEmployeeModels): string {
  const parts = DELIVERY_EMPLOYEES.map((employee) => {
    const pin = models[employee.id].trim();
    return `${employee.role}=${pin || "跟当前对话"}`;
  });
  return `角色模型：${parts.join("；")}。调用 Task 时按该任务的 role 传入 model；写着跟当前对话的角色不要传 model。`;
}
