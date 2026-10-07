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
  test.each([
    ["3.58 + 2.6"], ["12.7 + 5.84"], ["0.96 + 4.3"],
  ])("num-decimal-05 三个变体（%s）均 A 命中，错误选项报 incorrect_choice_answer", (expression) => {
    const stem = `用竖式计算 ${expression} 时，下面哪种做法正确？`
      + "A. 小数点对齐  B. 末位对齐  C. 左边对齐  D. 随意对齐";
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("A") }))
      .toEqual([]);
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("B") }))
      .toEqual(["incorrect_choice_answer"]);
  });

  // 收紧后，同句式但非「数字 + 数字」加法的题干不再被该分支锚定。
  test("同句式乘法竖式与无操作数题干不被该分支匹配", () => {
    const multiplication = "用竖式计算 36 × 28 时，下面哪种做法正确？"
      + "A. 末位对齐  B. 小数点对齐  C. 左边对齐  D. 随意对齐";
    const noOperands = "用竖式计算下面各题时，下面哪种做法正确？"
      + "A. 小数点对齐  B. 末位对齐  C. 左边对齐  D. 随意对齐";
    expect(renderedQuestionErrors({ answerMode: "choice", stem: multiplication, answerSpec: choiceSpec("A") }))
      .toEqual(["unsupported_choice_pattern"]);
    expect(renderedQuestionErrors({ answerMode: "choice", stem: noOperands, answerSpec: choiceSpec("A") }))
      .toEqual(["unsupported_choice_pattern"]);
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

describe("mixed-operations 新增锚定规则（P2-10a）", () => {
  // 选择题分支 merge-step-formulas：从两个分步算式推导唯一综合算式选项。
  test.each([
    [
      "把两个分步算式 3 × 4 = 12、12 + 8 = 20 合并成综合算式，得数不变，哪一个正确？"
        + "A. 3 × 4 - 8  B. 3 × 4 + 8  C. 3 × (4 + 8)  D. 3 + 4 × 8",
      20,
    ],
    [
      "把两个分步算式 30 ÷ 6 = 5、5 × 9 = 45 合并成综合算式，得数不变，哪一个正确？"
        + "A. 30 × 6 ÷ 9  B. 30 ÷ 6 × 9  C. 30 ÷ 6 + 9  D. (30 - 6) × 9",
      45,
    ],
    [
      "把两个分步算式 15 + 9 = 24、24 ÷ 4 = 6 合并成综合算式，得数不变，哪一个正确？"
        + "A. 15 + 9 ÷ 4  B. (15 + 9) ÷ 4  C. 15 - 9 ÷ 4  D. (15 - 9) ÷ 4",
      6,
    ],
  ])("num-mixed-04 变体（得数 %s）B 命中，错误选项报 incorrect_choice_answer", (stem) => {
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("B") }))
      .toEqual([]);
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("A") }))
      .toEqual(["incorrect_choice_answer"]);
  });

  // 规则 shopping-change-context：付出的钱减总价求找零。
  test.each([
    ["妈妈买 3 千克苹果，每千克 8 元，付出 50 元，应找回多少元？", 26],
    ["妈妈买 4 千克苹果，每千克 12 元，付出 100 元，应找回多少元？", 52],
    ["妈妈买 2 千克苹果，每千克 15 元，付出 50 元，应找回多少元？", 20],
  ])("num-mixed-05 变体（找零 %s 元）正确答案无错误，错误答案报 incorrect_number_answer", (stem, answer) => {
    expect(validateWritten(stem, answer, "元")).toEqual([]);
    expect(validateWritten(stem, answer + 1, "元")).toEqual(["incorrect_number_answer"]);
  });

  // 选择题分支 mixed-compare-size：两个混合算式得数比大小。
  test.each([
    ["比较 6 × 7 - 15 和 6 × (7 - 2) 的得数，○ 里应填什么？", 27, 30],
    ["比较 5 × 4 + 6 和 5 × (4 + 6) 的得数，○ 里应填什么？", 26, 50],
    ["比较 (20 - 8) ÷ 4 和 20 - 8 ÷ 4 的得数，○ 里应填什么？", 3, 18],
  ])("num-mixed-06 变体（%s < %s）B 命中，错误选项报 incorrect_choice_answer", (stem, left, right) => {
    const full = `${stem}A. >  B. <  C. =  D. 无法确定`;
    expect(left).toBeLessThan(right);
    expect(renderedQuestionErrors({ answerMode: "choice", stem: full, answerSpec: choiceSpec("B") }))
      .toEqual([]);
    expect(renderedQuestionErrors({ answerMode: "choice", stem: full, answerSpec: choiceSpec("C") }))
      .toEqual(["incorrect_choice_answer"]);
  });
});

describe("operation-law 新增锚定规则（P2-10a）", () => {
  // 规则 subtraction-property：a - b - c 直接经算术求值证明。
  test.each([
    ["用减法的性质简算：235 - 68 - 32。", 135],
    ["用减法的性质简算：417 - 53 - 47。", 317],
    ["用减法的性质简算：528 - 128 - 72。", 328],
  ])("num-law-04 变体（%s）正确答案无错误，错误答案报 incorrect_number_answer", (stem, answer) => {
    expect(validateWritten(stem, answer)).toEqual([]);
    expect(validateWritten(stem, answer + 1)).toEqual(["incorrect_number_answer"]);
  });

  // 规则 distributive-near-hundred：接近整百乘法直接经算术求值证明。
  test.each([
    ["用乘法分配律简算 99 × 36。", 3564],
    ["用乘法分配律简算 102 × 25。", 2550],
    ["用乘法分配律简算 45 × 98。", 4410],
  ])("num-law-05 变体（%s）正确答案无错误，错误答案报 incorrect_number_answer", (stem, answer) => {
    expect(validateWritten(stem, answer)).toEqual([]);
    expect(validateWritten(stem, answer + 1)).toEqual(["incorrect_number_answer"]);
  });

  // 选择题分支 name-the-law：按三步简算过程的结构变换判定运算律/性质。
  test.each([
    [
      "25 × 17 × 4 = 25 × 4 × 17 = 100 × 17 运用了哪一种运算律或性质？"
        + "A. 加法交换律  B. 乘法交换律  C. 乘法结合律  D. 乘法分配律",
    ],
    [
      "36 × 99 = 36 × (100 - 1) = 3600 - 36 运用了哪一种运算律或性质？"
        + "A. 乘法交换律  B. 乘法分配律  C. 乘法结合律  D. 加法结合律",
    ],
    [
      "417 - 53 - 47 = 417 - (53 + 47) = 417 - 100 运用了哪一种运算律或性质？"
        + "A. 乘法分配律  B. 减法的性质  C. 加法交换律  D. 乘法结合律",
    ],
  ])("num-law-06 变体 B 命中，错误选项报 incorrect_choice_answer", (stem) => {
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("B") }))
      .toEqual([]);
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("D") }))
      .toEqual(["incorrect_choice_answer"]);
  });

  // 三步得数不一致时不得被 name-the-law 分支锚定（防止过程造假被放过后误判）。
  test("num-law-06 三步得数不一致时分支安全落空", () => {
    const stem = "25 × 17 × 4 = 25 × 4 × 17 = 100 + 17 运用了哪一种运算律或性质？"
      + "A. 加法交换律  B. 乘法交换律  C. 乘法结合律  D. 乘法分配律";
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("B") }))
      .toEqual(["incorrect_choice_answer"]);
  });
});
