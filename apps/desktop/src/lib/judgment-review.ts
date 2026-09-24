import type { DeliveryCard } from "./delivery-desk.ts";
import type { DeliveryReviewResult } from "./delivery-review.ts";

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
