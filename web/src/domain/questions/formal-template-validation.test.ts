import { describe, expect, test } from "vitest";
import type { AnswerSpec } from "./answer-spec";
import { renderedQuestionErrors } from "./formal-template-validation";

function numberSpec(value: number, unit: string | null = null): AnswerSpec {
  return { kind: "number", value, tolerance: 0, unit };
}

function choiceSpec(value: "A" | "B" | "C" | "D"): AnswerSpec {
  return { kind: "choice", value };
}

function validateWritten(stem: string, answer: number, unit: string | null = null) {
  return renderedQuestionErrors({ answerMode: "written", stem, answerSpec: numberSpec(answer, unit) });
}

describe("decimal 拆分新增锚定规则（P2-9）", () => {
  // 规则 decimal-ribbon-subtract：整数与小数相减的情境。
  test("num-decimal-06 彩带用去情境：正确答案无错误，错误答案报 incorrect_number_answer", () => {
    const stem = "一条彩带长 5 米，用去 2.4 米，还剩多少米？";
    expect(validateWritten(stem, 2.6, "米")).toEqual([]);
    expect(validateWritten(stem, 3.6, "米")).toEqual(["incorrect_number_answer"]);
  });

  // 规则 decimal-stationery-add：元情境的小数加法。
  test("num-decimal-07 钢笔橡皮情境：正确答案无错误，错误答案报 incorrect_number_answer", () => {
    const stem = "一支钢笔 8.5 元，一块橡皮 1.6 元，各买一件一共要付多少元？";
    expect(validateWritten(stem, 10.1, "元")).toEqual([]);
    expect(validateWritten(stem, 9.1, "元")).toEqual(["incorrect_number_answer"]);
  });

  // 规则 decops-glass-area：小数乘小数的面积情境。
  test("num-decops-01 玻璃面积情境：正确答案无错误，错误答案报 incorrect_number_answer", () => {
    const stem = "一块长方形玻璃长 1.2 米，宽 0.8 米，它的面积是多少平方米？";
    expect(validateWritten(stem, 0.96, "平方米")).toEqual([]);
    expect(validateWritten(stem, 0.86, "平方米")).toEqual(["incorrect_number_answer"]);
  });

  // 规则 decops-product-approx：积保留一位小数。
  test("num-decops-02 积的近似数：正确答案无错误，错误答案报 incorrect_number_answer", () => {
    const stem = "2.4 × 0.7 的积保留一位小数，约是多少？";
    expect(validateWritten(stem, 1.7)).toEqual([]);
    expect(validateWritten(stem, 1.6)).toEqual(["incorrect_number_answer"]);
  });

  // 规则 decops-juice-divide：小数除以整数的情境。
  test("num-decops-03 分果汁情境：正确答案无错误，错误答案报 incorrect_number_answer", () => {
    const stem = "把 1.5 升果汁平均分给 6 个小朋友，每人分得多少升？";
    expect(validateWritten(stem, 0.25, "升")).toEqual([]);
    expect(validateWritten(stem, 0.35, "升")).toEqual(["incorrect_number_answer"]);
  });

  // 选择题分支：用竖式计算位数不同的小数加法时怎样做。
  test("num-decimal-05 竖式做法：A 命中，其他选项报 incorrect_choice_answer", () => {
    const stem = "用竖式计算 3.58 + 2.6 时，下面哪种做法正确？"
      + "A. 小数点对齐  B. 末位对齐  C. 左边对齐  D. 随意对齐";
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("A") }))
      .toEqual([]);
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("B") }))
      .toEqual(["incorrect_choice_answer"]);
  });
});

describe("decimal 拆分复用既有锚定（P2-9）", () => {
  test("num-decimal-08 加减混合命中通用「计算」规则", () => {
    const stem = "计算 7.6 + 2.45 - 1.8。";
    expect(validateWritten(stem, 8.25)).toEqual([]);
    expect(validateWritten(stem, 8.15)).toEqual(["incorrect_number_answer"]);
  });

  test("num-decops-04 小数四则混合命中通用「计算」规则", () => {
    expect(validateWritten("计算 2.5 × 4 + 3.6。", 13.6)).toEqual([]);
    expect(validateWritten("计算 0.8 × 7 - 1.5。", 4.1)).toEqual([]);
    expect(validateWritten("计算 12.6 ÷ 3 + 2.4。", 6.6)).toEqual([]);
  });
});
