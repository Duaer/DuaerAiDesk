declare module "*.mjs" {
  const mod: Record<string, unknown>;
  export default mod;
  export function extractArchitectureIr(text: string): Record<string, unknown> | null;
  export function relaxArchitectureIr(ir: Record<string, unknown>): Record<string, unknown> | null;
  export function dispatchSplitPrompt(note: string, snapshot: string): string;
  export function annotateParallelTasks<T extends { id: string; dependsOn?: string[] }>(
    tasks: T[],
  ): Array<T & { wave: number; parallel: boolean }>;
  export function releaseWave<T extends {
    id: string;
    status?: string;
    workerId?: string;
    moduleId?: string | null;
    role?: string;
    dependsOn?: string[];
  }>(
    tasks: T[],
    modules?: Array<{ id?: string; dependsOn?: string[] }>,
  ): T[];
  export function resolveDispatchStatuses(
    tasks: Array<{ id: string; workerId?: string; moduleId?: string | null; role?: string; dependsOn?: string[] }>,
    progress?: { doneIds?: string[]; runningIds?: string[] },
    modules?: Array<{ id?: string; dependsOn?: string[] }>,
  ): Map<string, "done" | "running" | "waiting">;
  export function progressFromToolMessages(
    messages: Array<{ toolName?: string; toolStatus?: string; toolArgs?: unknown }>,
    taskIds: string[],
  ): { doneIds: string[]; runningIds: string[] };
  export function taskGraphIr(
    tasks: Array<{ id: string; title?: string; role?: string; workerId?: string; dependsOn?: string[] }>,
    opts?: {
      title?: string;
      workerCount?: number;
      progress?: {
        live?: boolean;
        color?: boolean;
        label?: boolean;
        doneIds?: string[];
        runningIds?: string[];
      };
      statusLabels?: { done?: string; running?: string; waiting?: string };
      modules?: Array<{ id?: string; dependsOn?: string[] }>;
      sides?: boolean;
    },
  ): Record<string, unknown> | null;
  export function extractDispatchPlan(reply: string): {
    workers: number;
    rationale: string;
    tasks: Array<{
      id: string;
      title: string;
      role: "implement" | "verify-l3" | "deploy";
      workerId: string;
      moduleId: string | null;
      acceptance: string;
      dependsOn: string[];
    }>;
  } | null;
  export function sanitizeArchitectureIr(raw: unknown): Record<string, unknown> | null;
  export function clearArchitectureMount(host: HTMLElement): void;
  export function mountArchitectureHtml(
    host: HTMLElement,
    html: string,
    opts?: { key?: string; stage?: boolean },
  ): Promise<boolean>;
  export function mountArchitectureDiagram(
    host: HTMLElement,
    opts?: { url?: string; ir?: unknown; stage?: boolean },
  ): Promise<boolean>;
}
