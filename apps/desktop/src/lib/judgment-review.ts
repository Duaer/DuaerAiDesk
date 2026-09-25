import type { DeliveryIntakeKind } from "@duaer-ai-desk/shared";
import type { DeliveryCard, DeliveryIntake } from "./delivery-desk.ts";
import type { DeliveryReviewResult } from "./delivery-review.ts";

export type { DeliveryIntake };

/** Jev-family ids are served by a judgments endpoint, not chat completions. */
export function isJudgmentModelId(modelId: string): boolean {
  return /^jev(?:-|$)/i.test(modelId.trim());
}

/** `https://host/v1` + `/judgments`. Other bases get `/v1/judgments`. */
export function judgmentReviewUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (/\/v1$/i.test(trimmed)) return `${trimmed}/judgments`;
  return `${trimmed}/v1/judgments`;
}

const GAP_ISSUES: Record<string, string> = {
  vague: "验收或目标还不能核对",
  baseline: "已填写的基线太空，不能核对",
};

/**
 * Typed questions for one confirm card. Empty baselines must not fail.
 * The choice is the lock decision; noul is recorded but not the gate.
 */
export function judgmentReviewRequest(modelId: string, card: DeliveryCard): {
  model: string;
  state: DeliveryCard;
  questions: Record<string, unknown>;
} {
  return {
    model: modelId.trim(),
    state: card,
    questions: {
      passed: {
        type: "noul",
        instructions:
          "确认卡可以通过：目标单一、可执行；验收能核对到打开、看到、点击或返回的结果。空着的基线、风格和布局不要判失败。非空但只写「桌面为主」或「更好看」则不能通过。",
      },
      gap: {
        type: "choice",
        instructions: "不能锁定时的主要缺口。能锁定就选 pass。",
        criteria: {
          pass: "可以锁定",
          vague: "验收或目标不能核对",
          baseline: "已填写的基线太空",
        },
      },
    },
  };
}

const INTAKE_KINDS = new Set<DeliveryIntakeKind>(["bug", "requirement", "both", "unclear"]);

/** Separate from the lock review. One choice, one sentence, no card rewrite. */
export function intakeJudgmentRequest(modelId: string, ask: string): {
  model: string;
  state: { ask: string };
  questions: Record<string, unknown>;
} {
  return {
    model: modelId.trim(),
    state: { ask: ask.trim().slice(0, 2000) },
    questions: {
      kind: {
        type: "choice",
        instructions: "用户这句话要走哪条流程。只看这句话。说不清就选 unclear，不要猜。",
        criteria: {
          bug: "现有行为坏了，没有新功能",
          requirement: "要的是新行为，不是在修已有故障",
          both: "既要修已有故障，又要新行为",
          unclear: "信息不够，必须再问一个问题才能分",
        },
      },
      reason: {
        type: "noul",
        instructions: "一句话理由，不要写步骤。",
      },
    },
  };
}

export function intakePrompt(ask: string): { systemPrompt: string; user: string } {
  return {
    systemPrompt: [
      "你是 Duaer 判断师。只判断用户这句话是 bug、需求，还是需求加 bug。",
      "不要改写，不要派工，不要给步骤。说不清就 kind 为 unclear。",
      "只输出一个 JSON，不要 markdown 围栏：",
      "{\"kind\":\"bug\",\"reason\":\"一句话\"}",
    ].join("\n"),
    user: ask.trim().slice(0, 2000),
  };
}

export function intakeFromJudgment(body: unknown): DeliveryIntake | null {
  const record = asRecord(body);
  const answers = asRecord(record?.answers);
  const kindRow = asRecord(answers?.kind);
  const choice = typeof kindRow?.choice === "string" ? kindRow.choice.trim() : "";
  if (!INTAKE_KINDS.has(choice as DeliveryIntakeKind)) return null;
  const reasonRow = asRecord(answers?.reason);
  const reason = typeof reasonRow?.text === "string"
    ? reasonRow.text
    : typeof record?.summary === "string"
      ? record.summary
      : "";
  return { kind: choice as DeliveryIntakeKind, reason: reason.trim().slice(0, 200) };
}

export function intakeFromText(text: string): DeliveryIntake | null {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const value = JSON.parse(trimmed.slice(start, end + 1)) as unknown;
    const record = asRecord(value);
    const kind = typeof record?.kind === "string" ? record.kind.trim() : "";
    if (!INTAKE_KINDS.has(kind as DeliveryIntakeKind)) return null;
    const reason = typeof record?.reason === "string" ? record.reason.trim().slice(0, 200) : "";
    return { kind: kind as DeliveryIntakeKind, reason };
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/** Surface a gateway message. Chat-completions clients hide `{ message }` as "no body". */
export function judgmentErrorMessage(status: number, body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return `${status} status code (no body)`;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const record = asRecord(parsed);
    if (typeof record?.message === "string" && record.message.trim()) {
      return record.message.trim();
    }
    const detail = record?.detail;
    const detailRecord = asRecord(detail);
    if (typeof detailRecord?.message === "string" && detailRecord.message.trim()) {
      return detailRecord.message.trim();
    }
    if (Array.isArray(detail)) {
      const msgs = detail
        .map((item) => {
          const row = asRecord(item);
          return typeof row?.msg === "string" ? row.msg.trim() : "";
        })
        .filter(Boolean);
      if (msgs.length) return msgs.join("; ");
    }
  } catch {
    // Not JSON; keep a short slice of the raw body.
  }
  return trimmed.slice(0, 300);
}

export function deliveryReviewFromJudgment(
  body: unknown,
  card: DeliveryCard,
): DeliveryReviewResult {
  const record = asRecord(body);
  const answers = asRecord(record?.answers);
  const gap = asRecord(answers?.gap);
  const choice = typeof gap?.choice === "string" ? gap.choice.trim() : "";
  if (!choice) {
    throw new Error("Judgment response had no lock decision");
  }
  const passed = choice === "pass";
  const issue = GAP_ISSUES[choice];
  return {
    passed,
    summary: passed ? "可以锁定" : issue || "确认卡还不能锁定",
    issues: passed ? [] : [issue || "确认卡还不能锁定"],
    card,
  };
}

export async function requestJudgmentReview(input: {
  baseUrl: string;
  apiKey: string;
  modelId: string;
  card: DeliveryCard;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<DeliveryReviewResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(judgmentReviewUrl(input.baseUrl), {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(judgmentReviewRequest(input.modelId, input.card)),
    ...(input.signal ? { signal: input.signal } : {}),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(judgmentErrorMessage(response.status, text));
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error("Judgment response was not JSON");
  }
  return deliveryReviewFromJudgment(parsed, input.card);
}

export async function requestIntakeJudgment(input: {
  baseUrl: string;
  apiKey: string;
  modelId: string;
  ask: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<DeliveryIntake | null> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(judgmentReviewUrl(input.baseUrl), {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(intakeJudgmentRequest(input.modelId, input.ask)),
    ...(input.signal ? { signal: input.signal } : {}),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(judgmentErrorMessage(response.status, text));
  }
  try {
    return intakeFromJudgment(JSON.parse(text) as unknown);
  } catch {
    throw new Error("Judgment response was not JSON");
  }
}
