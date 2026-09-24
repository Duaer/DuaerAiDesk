import { z } from "zod";
import { STATUSES } from "./types";

export const TITLE_MAX_LENGTH = 200;

/** 零宽字符：视觉上是空的，一律按空标题处理。 */
const ZERO_WIDTH_CHARACTERS = /[\u200B-\u200D\u2060\uFEFF\u180E]/g;

/** 先剔除零宽字符，再 trim —— 两者结果都为空的输入会被拒绝。 */
export function normalizeTitle(input: string): string {
  return input.replace(ZERO_WIDTH_CHARACTERS, "").trim();
}

export const titleSchema = z
  .string()
  .transform(normalizeTitle)
  .refine((value) => value.length > 0, { message: "标题不能为空" })
  .refine((value) => value.length <= TITLE_MAX_LENGTH, {
    message: `标题不能超过 ${TITLE_MAX_LENGTH} 个字符`,
  });

export const createTaskSchema = z.object({
  title: titleSchema,
  status: z.enum(STATUSES).optional(),
});

export const updateTaskSchema = z.object({
  title: titleSchema,
});

/** position 是 1-based「插入到第 N 位」；0、负数、小数、字符串一律拒绝。 */
export const moveTaskSchema = z.object({
  status: z.enum(STATUSES),
  position: z.number().int().min(1),
});
