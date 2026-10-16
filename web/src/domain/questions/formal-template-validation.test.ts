import { describe, expect, test } from "vitest";
import type { AnswerSpec } from "./answer-spec";
import { renderedQuestionErrors } from "./formal-template-validation";
import { phase2Catalog } from "@/content/phase2-catalog";
import { instantiateTemplateAtIndex } from "./instantiate-template";

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

  // fix round 1：纯加括号、操作数次序未变（结合律形态）不得锚定乘法交换律。
  // 25×17×4 = 25×(17×4) = 425×4，三步均 1700；当前分支若误判交换律则 A 被放过。
  test("num-law-06 纯加括号同序（结合律形态）不锚定乘法交换律，A 报 incorrect_choice_answer", () => {
    const stem = "25 × 17 × 4 = 25 × (17 × 4) = 425 × 4 运用了哪一种运算律或性质？"
      + "A. 乘法交换律  B. 乘法结合律  C. 加法交换律  D. 乘法分配律";
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("A") }))
      .toEqual(["incorrect_choice_answer"]);
  });
});

describe("price-model / distance-model 新增锚定规则（P2-10b）", () => {
  // 规则 price-box-unit-price：整盒总价 ÷ 本数求每本单价。三个变体的物品名
  // 由 surfaceVariants 归一到 canonical「笔记本」，故归一缺失时会红。
  test.each([
    ["笔记本一盒有 4 本，整盒售价 36 元。每本多少元？", 9],
    ["图画本一盒有 6 本，整盒售价 48 元。每本多少元？", 8],
    ["练习本一盒有 5 本，整盒售价 65 元。每本多少元？", 13],
  ])("app-price-04 变体（单价 %s 元）正确答案无错误，错误答案报 incorrect_number_answer", (stem, answer) => {
    expect(validateWritten(stem, answer, "元")).toEqual([]);
    expect(validateWritten(stem, answer + 1, "元")).toEqual(["incorrect_number_answer"]);
  });

  // 规则 price-two-kinds-total：两种文具分别算总价再相加，四个捕获全部参与计算。
  test.each([
    ["圆珠笔每支 3 元，买 4 支；笔记本每本 5 元，买 2 本。一共要付多少元？", 22],
    ["钢笔每支 8 元，买 3 支；草稿本每本 4 元，买 5 本。一共要付多少元？", 44],
    ["铅笔每支 2 元，买 6 支；图画本每本 7 元，买 4 本。一共要付多少元？", 40],
  ])("app-price-05 变体（总价 %s 元）正确答案无错误，错误答案报 incorrect_number_answer", (stem, answer) => {
    expect(validateWritten(stem, answer, "元")).toEqual([]);
    expect(validateWritten(stem, answer + 1, "元")).toEqual(["incorrect_number_answer"]);
  });

  // 选择题分支 price-buy-three-get-one：每 4 件付 3 件的钱，3 × 件数 ÷ 4。
  test.each([
    ["文具店促销：铅笔买 3 件送 1 件。要买够 8 件，实际只需付多少件的钱？"
      + "A. 7 件  B. 6 件  C. 8 件  D. 5 件", 6],
    ["文具店促销：橡皮买 3 件送 1 件。要买够 12 件，实际只需付多少件的钱？"
      + "A. 11 件  B. 9 件  C. 12 件  D. 8 件", 9],
    ["文具店促销：尺子买 3 件送 1 件。要买够 16 件，实际只需付多少件的钱？"
      + "A. 15 件  B. 12 件  C. 16 件  D. 10 件", 12],
  ])("app-price-06 变体（付 %s 件）B 命中，错误选项报 incorrect_choice_answer", (stem) => {
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("B") }))
      .toEqual([]);
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("A") }))
      .toEqual(["incorrect_choice_answer"]);
  });

  // 件数不是 4 的倍数时本形态不成立（当前规则只锚定整组形态），分支安全落空。
  test("app-price-06 买够件数不是 4 的倍数时分支安全落空", () => {
    const stem = "文具店促销：铅笔买 3 件送 1 件。要买够 9 件，实际只需付多少件的钱？"
      + "A. 7 件  B. 6 件  C. 8 件  D. 5 件";
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("B") }))
      .toEqual(["incorrect_choice_answer"]);
  });

  // 规则 distance-find-time：路程 ÷ 速度求时间。
  test.each([
    ["客车行驶 240 千米，每小时行 60 千米，需要多少小时？", 4],
    ["货车行驶 350 千米，每小时行 70 千米，需要多少小时？", 5],
    ["小轿车行驶 480 千米，每小时行 60 千米，需要多少小时？", 8],
  ])("app-distance-04 变体（时间 %s 小时）正确答案无错误，错误答案报 incorrect_number_answer", (stem, answer) => {
    expect(validateWritten(stem, answer, "小时")).toEqual([]);
    expect(validateWritten(stem, answer + 1, "小时")).toEqual(["incorrect_number_answer"]);
  });

  // 规则 distance-find-speed：路程 ÷ 时间求速度（捕获顺序为时间、路程）。
  test.each([
    ["大巴 3 小时行驶 180 千米，每小时行多少千米？", 60],
    ["中巴 4 小时行驶 260 千米，每小时行多少千米？", 65],
    ["客车 5 小时行驶 400 千米，每小时行多少千米？", 80],
  ])("app-distance-05 变体（速度 %s 千米/时）正确答案无错误，错误答案报 incorrect_number_answer", (stem, answer) => {
    expect(validateWritten(stem, answer, "千米")).toEqual([]);
    expect(validateWritten(stem, answer + 1, "千米")).toEqual(["incorrect_number_answer"]);
  });

  // 规则 distance-round-trip-return-time：去程速度×时间得路程，路程 ÷ 返回速度。
  test.each([
    ["小车从甲地到乙地，去时每小时行 60 千米，行了 3 小时；原路返回时每小时行 45 千米，返回需要多少小时？", 4],
    ["客车从甲地到乙地，去时每小时行 70 千米，行了 4 小时；原路返回时每小时行 56 千米，返回需要多少小时？", 5],
    ["货车从甲地到乙地，去时每小时行 54 千米，行了 5 小时；原路返回时每小时行 90 千米，返回需要多少小时？", 3],
  ])("app-distance-06 变体（返回 %s 小时）正确答案无错误，错误答案报 incorrect_number_answer", (stem, answer) => {
    expect(validateWritten(stem, answer, "小时")).toEqual([]);
    expect(validateWritten(stem, answer + 1, "小时")).toEqual(["incorrect_number_answer"]);
  });
});

describe("angle 补齐新增锚定规则（P2-10c）", () => {
  // 规则 angle-right-split：直角被分成两角，90 - 已知角。三个变体的引导语
  // （想一想/看一看/做一做）由 surfaceVariants 归一为空。
  test.each([
    ["想一想：一个直角被分成两个角，其中一个角是 35 度，另一个角是多少度？", 55],
    ["看一看：一个直角被分成两个角，其中一个角是 58 度，另一个角是多少度？", 32],
    ["做一做：一个直角被分成两个角，其中一个角是 46 度，另一个角是多少度？", 44],
  ])("geo-angle-04 变体（%s 度）正确答案无错误，错误答案报 incorrect_number_answer", (stem, answer) => {
    expect(validateWritten(stem, answer, "度")).toEqual([]);
    expect(validateWritten(stem, answer + 1, "度")).toEqual(["incorrect_number_answer"]);
  });

  // 守卫：已知角必须 0 < known < 90；越界（如 95 度）时直角分割在几何上不成立，
  // 规则不锚定（安全落空），即使按 90 - 95 = -5 作答也不得通过。
  test("geo-angle-04 已知角越界（95 度）不被锚定", () => {
    const stem = "一个直角被分成两个角，其中一个角是 95 度，另一个角是多少度？";
    expect(validateWritten(stem, -5, "度")).toEqual(["unsupported_number_pattern"]);
  });

  // 规则 angle-triangle-ruler-compose：两个三角尺角顶点重合拼一起，角度相加；
  // 捕获显式钉死为三角尺角度集合 30/45/60/90。
  test.each([
    ["把三角尺上 45 度的角和 30 度的角顶点重合拼在一起，拼成的角是多少度？", 75],
    ["把三角尺上 90 度的角和 60 度的角顶点重合拼在一起，拼成的角是多少度？", 150],
    ["把三角尺上 45 度的角和 60 度的角顶点重合拼在一起，拼成的角是多少度？", 105],
  ])("geo-angle-05 变体（拼成 %s 度）正确答案无错误，错误答案报 incorrect_number_answer", (stem, answer) => {
    expect(validateWritten(stem, answer, "度")).toEqual([]);
    expect(validateWritten(stem, answer + 1, "度")).toEqual(["incorrect_number_answer"]);
  });

  // 非三角尺角度（50/20）即使句式相同也不得被本规则锚定。
  test("geo-angle-05 非三角尺角度不被锚定", () => {
    const stem = "把三角尺上 50 度的角和 20 度的角顶点重合拼在一起，拼成的角是多少度？";
    expect(validateWritten(stem, 70, "度")).toEqual(["unsupported_number_pattern"]);
  });

  // 规则 angle-clock-face：整时两针较小夹角 = 最小间隔大格数 × 30。
  test.each([
    ["想一想：钟面上时针指向 2、分针指向 12，这时两针之间较小的夹角是多少度？", 60],
    ["看一看：钟面上时针指向 5、分针指向 12，这时两针之间较小的夹角是多少度？", 150],
    ["做一做：钟面上时针指向 8、分针指向 12，这时两针之间较小的夹角是多少度？", 120],
  ])("geo-angle-06 变体（夹角 %s 度）正确答案无错误，错误答案报 incorrect_number_answer", (stem, answer) => {
    expect(validateWritten(stem, answer, "度")).toEqual([]);
    expect(validateWritten(stem, answer + 1, "度")).toEqual(["incorrect_number_answer"]);
  });
});

describe("spatial 补齐新增锚定规则（P2-10c）", () => {
  // 规则 spatial-count-layered：分层数小正方体，底层每排个数×排数+上层个数。
  test.each([
    ["用相同小正方体摆成两层：底层每排 3 个、摆 2 排，上层摆 2 个。一共用了多少个小正方体？", 8],
    ["用相同小正方体摆成两层：底层每排 4 个、摆 3 排，上层摆 4 个。一共用了多少个小正方体？", 16],
    ["用相同小正方体摆成两层：底层每排 5 个、摆 2 排，上层摆 3 个。一共用了多少个小正方体？", 13],
  ])("geo-spatial-03 变体（共 %s 个）正确答案无错误，错误答案报 incorrect_number_answer", (stem, answer) => {
    expect(validateWritten(stem, answer, "个")).toEqual([]);
    expect(validateWritten(stem, answer + 1, "个")).toEqual(["incorrect_number_answer"]);
  });

  // 守卫：上层个数不得超过底层 footprint（每排个数 × 排数）；超出（如 3×2 底层、
  // 上层 8 个）时几何体不成立，规则不锚定（安全落空），即使按 6 + 8 = 14 作答也不得通过。
  test("geo-spatial-03 上层超出底层 footprint（3×2、upper=8）不被锚定", () => {
    const stem = "用相同小正方体摆成两层：底层每排 3 个、摆 2 排，上层摆 8 个。一共用了多少个小正方体？";
    expect(validateWritten(stem, 14, "个")).toEqual(["unsupported_number_pattern"]);
  });

  // 选择题分支 spatial-top-view-shape：由排数×每排个数重算俯视图，正确项为
  // 「depth 行，每行 width 个正方形」，而非字面钉死。
  test.each([
    [
      "把相同小正方体摆成 2 排，每排 3 个，前后对齐。从上面看，看到的图形是："
        + "A. 一行3个正方形  B. 2行，每行3个正方形  C. 3行，每行2个正方形  D. 一行6个正方形",
    ],
    [
      "把相同小正方体摆成 3 排，每排 4 个，前后对齐。从上面看，看到的图形是："
        + "A. 一行4个正方形  B. 3行，每行4个正方形  C. 4行，每行3个正方形  D. 一行12个正方形",
    ],
    [
      "把相同小正方体摆成 2 排，每排 5 个，前后对齐。从上面看，看到的图形是："
        + "A. 一行5个正方形  B. 2行，每行5个正方形  C. 5行，每行2个正方形  D. 一行10个正方形",
    ],
  ])("geo-spatial-04 变体 B 命中，错误选项报 incorrect_choice_answer", (stem) => {
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("B") }))
      .toEqual([]);
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("C") }))
      .toEqual(["incorrect_choice_answer"]);
  });

  // 选择题分支 spatial-add-one-front-unchanged：从正面看不变，唯一可添处是某列
  // 正后方地上（被原列挡住）；正上方与旁边空地均改变正面形状。
  test.each([
    [
      "用 3 个小正方体排成一行，并在左数第 1 个上方再叠 1 个。再添 1 个小正方体，要使从正面看到的形状不变，应该添在哪里？"
        + "A. 左数第1个的正上方  B. 左数第2个的正上方  C. 左数第3个的正后方地上  D. 几何体左的空地上",
    ],
    [
      "用 4 个小正方体排成一行，并在左数第 2 个上方再叠 1 个。再添 1 个小正方体，要使从正面看到的形状不变，应该添在哪里？"
        + "A. 左数第3个的正上方  B. 左数第4个的正上方  C. 左数第1个的正后方地上  D. 几何体右的空地上",
    ],
    [
      "用 5 个小正方体排成一行，并在左数第 1 个上方再叠 1 个。再添 1 个小正方体，要使从正面看到的形状不变，应该添在哪里？"
        + "A. 左数第4个的正上方  B. 左数第2个的正上方  C. 左数第5个的正后方地上  D. 几何体左的空地上",
    ],
  ])("geo-spatial-05 变体 C 命中，错误选项报 incorrect_choice_answer", (stem) => {
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("C") }))
      .toEqual([]);
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("A") }))
      .toEqual(["incorrect_choice_answer"]);
  });

  // C 选项的「正后方」列号超出列数时，几何体不存在该位置，分支安全落空。
  test("geo-spatial-05 后方列号超出范围时安全落空", () => {
    const stem = "用 3 个小正方体排成一行，并在左数第 1 个上方再叠 1 个。再添 1 个小正方体，要使从正面看到的形状不变，应该添在哪里？"
      + "A. 左数第1个的正上方  B. 左数第2个的正上方  C. 左数第4个的正后方地上  D. 几何体左的空地上";
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("C") }))
      .toEqual(["incorrect_choice_answer"]);
  });

  // 选择题分支 spatial-net-opposite-face：1-4-1 展开图，对面关系为
  // 前↔后、右↔左、上↔下，由展开图布局重算。
  test.each([
    [
      "一个正方体展开图：中间一行从左到右依次写着“前、右、后、左”4个面；“上”在“右”的正上方，“下”在“右”的正下方。“前”面的对面是哪个面？"
        + "A. 前  B. 右  C. 后  D. 左",
    ],
    [
      "一个正方体展开图：中间一行从左到右依次写着“前、右、后、左”4个面；“上”在“右”的正上方，“下”在“右”的正下方。“右”面的对面是哪个面？"
        + "A. 前  B. 后  C. 左  D. 上",
    ],
    [
      "一个正方体展开图：中间一行从左到右依次写着“前、右、后、左”4个面；“上”在“右”的正上方，“下”在“右”的正下方。“上”面的对面是哪个面？"
        + "A. 前  B. 右  C. 下  D. 后",
    ],
  ])("geo-spatial-06 变体 C 命中，错误选项报 incorrect_choice_answer", (stem) => {
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("C") }))
      .toEqual([]);
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("A") }))
      .toEqual(["incorrect_choice_answer"]);
  });
});

describe("data-bar 补齐新增锚定规则（P2-10d）", () => {
  // 规则 bar-three-total：三个班数量相加求总数。
  test.each([
    ["废纸回收记录显示：一班回收 20 千克，二班回收 35 千克，三班回收 28 千克。三个班一共回收多少千克？", 83],
    ["废电池回收记录显示：一班回收 42 千克，二班回收 18 千克，三班回收 36 千克。三个班一共回收多少千克？", 96],
    ["易拉罐回收记录显示：一班回收 55 千克，二班回收 27 千克，三班回收 49 千克。三个班一共回收多少千克？", 131],
  ])("data-bar-04 变体（总数 %s 千克）正确答案无错误，错误答案报 incorrect_number_answer", (stem, answer) => {
    expect(validateWritten(stem, answer, "千克")).toEqual([]);
    expect(validateWritten(stem, answer + 1, "千克")).toEqual(["incorrect_number_answer"]);
  });

  // 规则 bar-pair-difference：只比较指定的一班与二班，三班为多余条件。
  test.each([
    ["塑料瓶回收记录显示：一班回收 38 千克，二班回收 25 千克，三班回收 30 千克。一班和二班相差多少千克？", 13],
    ["旧衣物回收记录显示：一班回收 19 千克，二班回收 44 千克，三班回收 37 千克。一班和二班相差多少千克？", 25],
    ["旧报纸回收记录显示：一班回收 56 千克，二班回收 72 千克，三班回收 60 千克。一班和二班相差多少千克？", 16],
  ])("data-bar-05 变体（相差 %s 千克）正确答案无错误，错误答案报 incorrect_number_answer", (stem, answer) => {
    expect(validateWritten(stem, answer, "千克")).toEqual([]);
    expect(validateWritten(stem, answer + 1, "千克")).toEqual(["incorrect_number_answer"]);
  });

  // 同句式但指定的班级组合不同（二班和三班），不得被 bar-pair-difference 锚定。
  test("data-bar-05 不同班级组合不被锚定", () => {
    const stem = "塑料瓶回收记录显示：一班回收 38 千克，二班回收 25 千克，三班回收 30 千克。二班和三班相差多少千克？";
    expect(validateWritten(stem, 5, "千克")).toEqual(["unsupported_number_pattern"]);
  });

  // 规则 bar-scale-read：纵轴每格 × 格数读出人数再求差。
  test.each([
    ["同学运动爱好记录的条形图中，纵轴每格表示 2 人：喜欢足球的条形高 8 格，喜欢跳绳的条形高 5 格。喜欢足球的比喜欢跳绳的多多少人？", 6],
    ["同学课外活动记录的条形图中，纵轴每格表示 5 人：喜欢篮球的条形高 6 格，喜欢跑步的条形高 3 格。喜欢篮球的比喜欢跑步的多多少人？", 15],
    ["同学周末活动记录的条形图中，纵轴每格表示 4 人：喜欢羽毛球的条形高 9 格，喜欢踢毽的条形高 2 格。喜欢羽毛球的比喜欢踢毽的多多少人？", 28],
  ])("data-bar-06 变体（多 %s 人）正确答案无错误，错误答案报 incorrect_number_answer", (stem, answer) => {
    expect(validateWritten(stem, answer, "人")).toEqual([]);
    expect(validateWritten(stem, answer + 1, "人")).toEqual(["incorrect_number_answer"]);
  });
});

describe("data-average 补齐新增锚定规则（P2-10d）", () => {
  // 规则 average-find-missing：4 次平均×4 减前 3 次总分求第 4 次。
  test.each([
    ["小丽前 3 次数学成绩为 88、92、90 分，4 次的平均分是 90 分。第 4 次成绩是多少分？", 90],
    ["小丽前 3 次语文成绩为 75、80、85 分，4 次的平均分是 82 分。第 4 次成绩是多少分？", 88],
    ["小丽前 3 次英语成绩为 92、88、95 分，4 次的平均分是 91 分。第 4 次成绩是多少分？", 89],
  ])("data-average-04 变体（第4次 %s 分）正确答案无错误，错误答案报 incorrect_number_answer", (stem, answer) => {
    expect(validateWritten(stem, answer, "分")).toEqual([]);
    expect(validateWritten(stem, answer + 1, "分")).toEqual(["incorrect_number_answer"]);
  });

  // 未登记科目（美术）不被 average-find-missing 锚定。
  test("data-average-04 未登记科目不被锚定", () => {
    const stem = "小丽前 3 次美术成绩为 88、92、90 分，4 次的平均分是 90 分。第 4 次成绩是多少分？";
    expect(validateWritten(stem, 90, "分")).toEqual(["unsupported_number_pattern"]);
  });

  // 规则 average-to-total：平均数 × 人数求总数。
  test.each([
    ["同学们折千纸鹤，平均每人折 6 个，一共有 8 人。他们一共折了多少个？", 48],
    ["同学们折纸船，平均每人折 9 个，一共有 7 人。他们一共折了多少个？", 63],
    ["同学们折幸运星，平均每人折 12 个，一共有 9 人。他们一共折了多少个？", 108],
  ])("data-average-05 变体（总数 %s 个）正确答案无错误，错误答案报 incorrect_number_answer", (stem, answer) => {
    expect(validateWritten(stem, answer, "个")).toEqual([]);
    expect(validateWritten(stem, answer + 1, "个")).toEqual(["incorrect_number_answer"]);
  });

  // 规则 average-five-scores：5 次成绩总分 ÷ 5。
  test.each([
    ["五次数学练习得分依次为 80、85、90、95、100 分，平均分是多少分？", 90],
    ["五次科学练习得分依次为 72、78、84、90、96 分，平均分是多少分？", 84],
    ["五次体育练习得分依次为 95、91、87、83、79 分，平均分是多少分？", 87],
  ])("data-average-06 变体（平均 %s 分）正确答案无错误，错误答案报 incorrect_number_answer", (stem, answer) => {
    expect(validateWritten(stem, answer, "分")).toEqual([]);
    expect(validateWritten(stem, answer + 1, "分")).toEqual(["incorrect_number_answer"]);
  });
});

describe("data-compare 补齐新增锚定规则（P2-10d）", () => {
  // 规则 compare-totals：两组分别求和，总数相差多少。
  test.each([
    ["甲组一周做好事件数为 8、12、10，乙组一周做好事件数为 6、9、7。两组总数相差多少件？", 8],
    ["甲组一周收集废电池数为 15、9、14，乙组一周收集废电池数为 11、16、8。两组总数相差多少件？", 3],
    ["甲组一周捡拾垃圾袋数为 20、18、24，乙组一周捡拾垃圾袋数为 17、22、19。两组总数相差多少件？", 4],
  ])("data-compare-03 变体（相差 %s 件）正确答案无错误，错误答案报 incorrect_number_answer", (stem, answer) => {
    expect(validateWritten(stem, answer, "件")).toEqual([]);
    expect(validateWritten(stem, answer + 1, "件")).toEqual(["incorrect_number_answer"]);
  });

  // 选择题分支 compare-range-stability：极差更小的一组更稳定，B 命中。
  test.each([
    ["甲组跳绳个数为 10、20、30，乙组跳绳个数为 18、20、22。哪组数据更稳定（最大值与最小值的差更小）？"
      + "A. 甲组  B. 乙组  C. 两组一样稳定  D. 无法判断"],
    ["甲组口算题数为 5、15、25、35，乙组口算题数为 40、42、44、46。哪组数据更稳定（最大值与最小值的差更小）？"
      + "A. 甲组  B. 乙组  C. 两组一样稳定  D. 无法判断"],
    ["甲组拍球个数为 60、80、100，乙组拍球个数为 75、78、81。哪组数据更稳定（最大值与最小值的差更小）？"
      + "A. 甲组  B. 乙组  C. 两组一样稳定  D. 无法判断"],
  ])("data-compare-04 变体 B 命中，错误选项报 incorrect_choice_answer", (stem) => {
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("B") }))
      .toEqual([]);
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("A") }))
      .toEqual(["incorrect_choice_answer"]);
  });

  // 选择题分支 compare-mean-level：总体水平看平均数，乙组平均更高，B 命中。
  test.each([
    ["甲组数学成绩为 70、80、90，乙组数学成绩为 75、85、95。不考虑波动，哪组的总体水平更高？"
      + "A. 甲组平均更高  B. 乙组平均更高  C. 两组一样高  D. 无法判断"],
    ["甲组科学成绩为 60、70、80、90，乙组科学成绩为 72、78、84、90。不考虑波动，哪组的总体水平更高？"
      + "A. 甲组平均更高  B. 乙组平均更高  C. 两组一样高  D. 无法判断"],
    ["甲组语文成绩为 85、88、91，乙组语文成绩为 90、92、94。不考虑波动，哪组的总体水平更高？"
      + "A. 甲组平均更高  B. 乙组平均更高  C. 两组一样高  D. 无法判断"],
  ])("data-compare-05 变体 B 命中，错误选项报 incorrect_choice_answer", (stem) => {
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("B") }))
      .toEqual([]);
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("C") }))
      .toEqual(["incorrect_choice_answer"]);
  });

  // compare-mean-level 相等子分支：两组平均数相等（甲 70、80、90 均 80；
  // 乙 75、80、85 均 80）时对应 C「两组一样高」，错误项被拒。
  test("data-compare-05 两组平均数相等 → C 两组一样高", () => {
    const stem = "甲组数学成绩为 70、80、90，乙组数学成绩为 75、80、85。不考虑波动，哪组的总体水平更高？"
      + "A. 甲组平均更高  B. 乙组平均更高  C. 两组一样高  D. 无法判断";
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("C") }))
      .toEqual([]);
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("B") }))
      .toEqual(["incorrect_choice_answer"]);
  });

  // 选择题分支 compare-after-change：被改数增大则平均数升高，A 命中。
  test.each([
    ["甲组 4 个数据为 10、20、30、40，把其中的 20 改成 24（20 在原数据中）。改变后甲组的平均数会怎样？"
      + "A. 平均数升高  B. 平均数降低  C. 平均数不变  D. 无法判断"],
    ["甲组 4 个数据为 8、12、16、20，把其中的 12 改成 18（12 在原数据中）。改变后甲组的平均数会怎样？"
      + "A. 平均数升高  B. 平均数降低  C. 平均数不变  D. 无法判断"],
    ["甲组 4 个数据为 25、30、35、40，把其中的 40 改成 48（40 在原数据中）。改变后甲组的平均数会怎样？"
      + "A. 平均数升高  B. 平均数降低  C. 平均数不变  D. 无法判断"],
  ])("data-compare-06 变体 A 命中，错误选项报 incorrect_choice_answer", (stem) => {
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("A") }))
      .toEqual([]);
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("B") }))
      .toEqual(["incorrect_choice_answer"]);
  });

  // 被改的原数不在数据列表中（陈述造假）时分支安全落空。
  test("data-compare-06 原数不在列表中时安全落空", () => {
    const stem = "甲组 4 个数据为 10、20、30、40，把其中的 25 改成 24（25 在原数据中）。改变后甲组的平均数会怎样？"
      + "A. 平均数升高  B. 平均数降低  C. 平均数不变  D. 无法判断";
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("A") }))
      .toEqual(["incorrect_choice_answer"]);
  });
});

describe("「喜欢X」归一化边界回归（P2-10d fix round 1）", () => {
  const pieDiff = phase2Catalog.find((template) => template.id === "data-pie-diff")!;
  const barScale = phase2Catalog.find((template) => template.id === "data-bar-06")!;

  // 负向回归：pie-chart 旧形态含「喜欢篮球/羽毛球」但上下文是「的占」，归一化
  // 不得改写它。逐字钉死两个渲染变体，并要求仍命中 pie-percent-diff 规则；
  // 一旦后人放宽归一，下列 correct-answer [] 断言会变成 unsupported_number_pattern。
  test.each([
    [0, "全年级 400 人中，喜欢篮球的占 35%，喜欢羽毛球的占 20%，两类人数相差多少人？", 60],
    [1, "全年级 500 人中，喜欢篮球的占 30%，喜欢羽毛球的占 12%，两类人数相差多少人？", 90],
  ])("data-pie-diff 变体 %# 题干逐字不变且规则命中，错误答案被拒", (index, expectedStem, answer) => {
    const instance = instantiateTemplateAtIndex(pieDiff, index, `fix:pie-diff:${index}`);
    expect(instance.stem).toBe(expectedStem);
    expect(instance.stem).toContain("喜欢篮球的占");
    expect(instance.stem).toContain("喜欢羽毛球的占");
    expect(renderedQuestionErrors({
      answerMode: "written", stem: instance.stem, answerSpec: numberSpec(answer, "人"),
    })).toEqual([]);
    expect(renderedQuestionErrors({
      answerMode: "written", stem: instance.stem, answerSpec: numberSpec(answer + 1, "人"),
    })).toEqual(["incorrect_number_answer"]);
  });

  // 正向回归：bar-06 的非 canonical 项目措辞（篮球/跑步）必须确实被归一到
  // canonical（足球/跳绳）；连同 v0 canonical 原文一起钉死双向行为。
  test("data-bar-06 变体表面措辞确实被归一接受", () => {
    const v0 = instantiateTemplateAtIndex(barScale, 0, "fix:bar06:0");
    const v1 = instantiateTemplateAtIndex(barScale, 1, "fix:bar06:1");
    expect(v0.stem).toContain("喜欢足球的条形高");
    expect(v0.stem).toContain("喜欢跳绳的条形高");
    expect(v1.stem).toContain("喜欢篮球的条形高");
    expect(v1.stem).toContain("喜欢跑步的条形高");
    expect(renderedQuestionErrors({
      answerMode: "written", stem: v0.stem, answerSpec: numberSpec(6, "人"),
    })).toEqual([]);
    expect(renderedQuestionErrors({
      answerMode: "written", stem: v1.stem, answerSpec: numberSpec(15, "人"),
    })).toEqual([]);
  });
});

describe("data-compare choice proof 未覆盖子分支补测（P2-10d fix round 1）", () => {
  // 比较极差 tie 子分支：两组极差相等时对应「两组一样稳定」(C)。
  test("compare-range-stability 极差相等 → C 两组一样稳定", () => {
    const stem = "甲组跳绳个数为 10、20、30，乙组跳绳个数为 5、15、25。哪组数据更稳定（最大值与最小值的差更小）？"
      + "A. 甲组  B. 乙组  C. 两组一样稳定  D. 无法判断";
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("C") }))
      .toEqual([]);
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("A") }))
      .toEqual(["incorrect_choice_answer"]);
  });

  // 变化后比较「降低」子分支：被改数减小 → B 平均数降低。
  test("compare-after-change 数值减小 → B 平均数降低", () => {
    const stem = "甲组 4 个数据为 10、20、30、40，把其中的 40 改成 36（40 在原数据中）。改变后甲组的平均数会怎样？"
      + "A. 平均数升高  B. 平均数降低  C. 平均数不变  D. 无法判断";
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("B") }))
      .toEqual([]);
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("A") }))
      .toEqual(["incorrect_choice_answer"]);
  });

  // 变化后比较「不变」子分支：新旧两数相等 → C 平均数不变。
  test("compare-after-change 数值相等 → C 平均数不变", () => {
    const stem = "甲组 4 个数据为 10、20、30、40，把其中的 20 改成 20（20 在原数据中）。改变后甲组的平均数会怎样？"
      + "A. 平均数升高  B. 平均数降低  C. 平均数不变  D. 无法判断";
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("C") }))
      .toEqual([]);
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("A") }))
      .toEqual(["incorrect_choice_answer"]);
  });
});

describe("multi-step-model / reverse-check 补齐新增锚定（P2-10e）", () => {
  // 规则 chain-multiplication：每箱盒数 × 每盒支数 × 箱数。
  test.each([
    ["每箱有 6 盒，每盒有 12 支笔，一共 4 箱。一共有多少支笔？", 288],
    ["每箱有 8 盒，每盒有 15 支笔，一共 5 箱。一共有多少支笔？", 600],
    ["每箱有 9 盒，每盒有 20 支笔，一共 6 箱。一共有多少支笔？", 1080],
  ])("app-multi-step-05 变体（共 %s 支）正确答案无错误，错误答案报 incorrect_number_answer", (stem, answer) => {
    expect(validateWritten(stem, answer, "支")).toEqual([]);
    expect(validateWritten(stem, answer + 1, "支")).toEqual(["incorrect_number_answer"]);
  });

  // 规则 plan-actual-days：计划总量 = 实际每天量 × 实际天数。
  test.each([
    ["工厂计划每天做 40 个零件，9 天完成。实际每天多做 5 个，实际多少天完成？", 8],
    ["工厂计划每天做 45 个零件，8 天完成。实际每天多做 15 个，实际多少天完成？", 6],
    ["工厂计划每天做 60 个零件，7 天完成。实际每天多做 24 个，实际多少天完成？", 5],
  ])("app-multi-step-06 变体（实际 %s 天）正确答案无错误，错误答案报 incorrect_number_answer", (stem, answer) => {
    expect(validateWritten(stem, answer, "天")).toEqual([]);
    expect(validateWritten(stem, answer + 1, "天")).toEqual(["incorrect_number_answer"]);
  });

  // 规则 compute-and-verify：验算式必须是原式的真正逆运算，答案为验算得数。
  test.each([
    ["计算 356 + 278 = 634，再用减法验算：634 - 278 = （ ）。括号里应填多少？", 356],
    ["计算 427 + 385 = 812，再用减法验算：812 - 385 = （ ）。括号里应填多少？", 427],
    ["计算 703 - 256 = 447，再用加法验算：447 + 256 = （ ）。括号里应填多少？", 703],
  ])("num-reverse-check-04 变体（验算得 %s）正确答案无错误，错误答案报 incorrect_number_answer", (stem, answer) => {
    expect(validateWritten(stem, answer)).toEqual([]);
    expect(validateWritten(stem, answer + 1)).toEqual(["incorrect_number_answer"]);
  });

  // 验算式不是原式的逆运算（减数被偷换）时不被锚定。
  test("num-reverse-check-04 验算式非逆运算时报 invalid_number_pattern", () => {
    const stem = "计算 356 + 278 = 634，再用减法验算：634 - 200 = （ ）。括号里应填多少？";
    expect(validateWritten(stem, 434)).toEqual(["invalid_number_pattern"]);
  });

  // 原得数本身错误时，整条陈述不成立，不被锚定。
  test("num-reverse-check-04 原得数错误时报 invalid_number_pattern", () => {
    const stem = "计算 356 + 278 = 635，再用减法验算：635 - 278 = （ ）。括号里应填多少？";
    expect(validateWritten(stem, 357)).toEqual(["invalid_number_pattern"]);
  });

  // 选择题分支 verify-method-choice：选项为「检查式陈述」，真正逆运算检查唯一命中 B。
  test.each([
    [
      "计算 500 - 267 得到 233。下面哪种验算方法最有说服力？"
        + "A. 把原式交换顺序再算一遍  B. 233 + 267 是否等于 500  "
        + "C. 500 + 267 是否等于 233  D. 233 - 267 是否等于 500",
    ],
    [
      "计算 804 - 358 得到 446。下面哪种验算方法最有说服力？"
        + "A. 把原式交换顺序再算一遍  B. 446 + 358 是否等于 804  "
        + "C. 804 + 358 是否等于 446  D. 446 - 358 是否等于 804",
    ],
    [
      "计算 620 - 145 得到 475。下面哪种验算方法最有说服力？"
        + "A. 把原式交换顺序再算一遍  B. 475 + 145 是否等于 620  "
        + "C. 620 + 145 是否等于 475  D. 475 - 145 是否等于 620",
    ],
  ])("num-reverse-check-05 变体 B 命中，错误选项报 incorrect_choice_answer", (stem) => {
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("B") }))
      .toEqual([]);
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("A") }))
      .toEqual(["incorrect_choice_answer"]);
  });

  // 同一题出现两个合法逆运算检查项时答案不唯一，任何单一字母都应被拒。
  test("num-reverse-check-05 两个逆运算检查项并存时不唯一 → incorrect_choice_answer", () => {
    const stem = "计算 500 - 267 得到 233。下面哪种验算方法最有说服力？"
      + "A. 把原式交换顺序再算一遍  B. 233 + 267 是否等于 500  "
      + "C. 500 - 233 是否等于 267  D. 233 - 267 是否等于 500";
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("B") }))
      .toEqual(["incorrect_choice_answer"]);
  });

  // 规则 mul-div-inverse-fill：除法式必须由乘法式的积与因数构成，商为另一因数。
  test.each([
    ["不计算，根据 36 × 14 = 504，直接写出 504 ÷ 14 的商。", 36],
    ["不计算，根据 25 × 18 = 450，直接写出 450 ÷ 18 的商。", 25],
    ["不计算，根据 48 × 15 = 720，直接写出 720 ÷ 15 的商。", 48],
  ])("num-reverse-check-06 变体（商 %s）正确答案无错误，错误答案报 incorrect_number_answer", (stem, answer) => {
    expect(validateWritten(stem, answer)).toEqual([]);
    expect(validateWritten(stem, answer + 1)).toEqual(["incorrect_number_answer"]);
  });

  // 除数不是乘法式中的因数时，陈述不成立，不被锚定。
  test("num-reverse-check-06 除数非原乘法因数时报 invalid_number_pattern", () => {
    const stem = "不计算，根据 36 × 14 = 504，直接写出 504 ÷ 13 的商。";
    expect(validateWritten(stem, 38)).toEqual(["invalid_number_pattern"]);
  });
});

describe("coordinate-pairs 数对锚定规则（P2-13a）", () => {
  type ChoiceLetter = "A" | "B" | "C" | "D";

  // 规则 C2-1 coord-read：第 c 列第 r 行用数对表示，先列后行，期望 (c,r)。
  test.each([
    ["方格图中第 3 列第 5 行的位置，用数对表示是哪一个？"
      + "A. (5,3)  B. (3,5)  C. (3,4)  D. (4,5)", "B", "D"],
    ["方格图中第 6 列第 2 行的位置，用数对表示是哪一个？"
      + "A. (2,6)  B. (6,1)  C. (6,2)  D. (7,2)", "C", "A"],
    ["方格图中第 8 列第 7 行的位置，用数对表示是哪一个？"
      + "A. (8,7)  B. (7,8)  C. (8,6)  D. (9,7)", "A", "B"],
  ])("geo-coord-01 读图写数对（%s）正确字母无错误，错误字母报 incorrect_choice_answer", (stem, correct, wrong) => {
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec(correct as ChoiceLetter) }))
      .toEqual([]);
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec(wrong as ChoiceLetter) }))
      .toEqual(["incorrect_choice_answer"]);
  });

  // 规则 C2-2 coord-locate：数对 (c,r) 表示第 c 列第 r 行的点，按固定措辞锚定。
  test.each([
    ["数对 (3,5) 表示方格图中的哪个点？"
      + "A. 第 5 列第 3 行的点  B. 第 3 列第 4 行的点  C. 第 3 列第 5 行的点  D. 第 4 列第 5 行的点", "C", "B"],
    ["数对 (6,2) 表示方格图中的哪个点？"
      + "A. 第 6 列第 2 行的点  B. 第 2 列第 6 行的点  C. 第 6 列第 3 行的点  D. 第 7 列第 2 行的点", "A", "C"],
    ["数对 (8,7) 表示方格图中的哪个点？"
      + "A. 第 7 列第 8 行的点  B. 第 8 列第 6 行的点  C. 第 9 列第 7 行的点  D. 第 8 列第 7 行的点", "D", "A"],
  ])("geo-coord-02 按数对找点（%s）正确字母无错误，错误字母报 incorrect_choice_answer", (stem, correct, wrong) => {
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec(correct as ChoiceLetter) }))
      .toEqual([]);
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec(wrong as ChoiceLetter) }))
      .toEqual(["incorrect_choice_answer"]);
  });

  // 规则 C1 coord-translate-right：向右平移列加，行不变。
  test.each([
    ["方格图中一个点的位置用数对表示是 (3,4)，把这个点向右平移 2 格。平移后的点用数对表示是："
      + "A. (5,4)  B. (4,3)  C. (3,6)  D. (5,5)", "A", "D"],
    ["方格图中一个点的位置用数对表示是 (5,7)，把这个点向右平移 4 格。平移后的点用数对表示是："
      + "A. (7,5)  B. (9,7)  C. (5,8)  D. (6,7)", "B", "C"],
    ["方格图中一个点的位置用数对表示是 (2,6)，把这个点向右平移 3 格。平移后的点用数对表示是："
      + "A. (2,9)  B. (3,6)  C. (5,6)  D. (5,5)", "C", "A"],
  ])("geo-coord-03 向右平移（%s）正确字母无错误，错误字母报 incorrect_choice_answer", (stem, correct, wrong) => {
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec(correct as ChoiceLetter) }))
      .toEqual([]);
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec(wrong as ChoiceLetter) }))
      .toEqual(["incorrect_choice_answer"]);
  });

  // 规则 C1 coord-translate-up：行从下往上编号，向上平移行加，列不变。
  test.each([
    ["方格图的行从下往上编号。一个点在 (4,2) 的位置，把这个点向上平移 3 格，平移后的点用数对表示是："
      + "A. (7,2)  B. (4,5)  C. (2,4)  D. (5,4)", "B", "A"],
    ["方格图的行从下往上编号。一个点在 (6,5) 的位置，把这个点向上平移 2 格，平移后的点用数对表示是："
      + "A. (8,5)  B. (5,6)  C. (6,7)  D. (6,4)", "C", "B"],
    ["一个点在方格图中的位置用数对表示是 (8,1)，把这个点向上平移 4 格（方格图的行从下往上编号，向上行号增大）。平移后的点用数对表示是："
      + "A. (8,5)  B. (5,8)  C. (7,1)  D. (8,4)", "A", "C"],
  ])("geo-coord-04 向上平移（%s）正确字母无错误，错误字母报 incorrect_choice_answer", (stem, correct, wrong) => {
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec(correct as ChoiceLetter) }))
      .toEqual([]);
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec(wrong as ChoiceLetter) }))
      .toEqual(["incorrect_choice_answer"]);
  });

  // 规则 C1 复合 coord-translate-two-axis：两次不同轴方向的平移分步算。
  test.each([
    ["方格图中一个点的位置用数对表示是 (2,3)，把这个点先向右平移 3 格，再向上平移 2 格。平移后的点用数对表示是："
      + "A. (4,6)  B. (5,3)  C. (2,4)  D. (5,5)", "D", "C"],
    ["方格图中一个点的位置用数对表示是 (8,2)，把这个点先向上平移 4 格，再向左平移 3 格。平移后的点用数对表示是："
      + "A. (12,5)  B. (5,6)  C. (8,5)  D. (5,2)", "B", "D"],
    ["方格图中一个点的位置用数对表示是 (4,8)，把这个点先向右平移 5 格，再向下平移 3 格（方格图的行从下往上编号）。平移后的点用数对表示是："
      + "A. (9,5)  B. (5,9)  C. (4,4)  D. (9,8)", "A", "B"],
  ])("geo-coord-05 两次平移（%s）正确字母无错误，错误字母报 incorrect_choice_answer", (stem, correct, wrong) => {
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec(correct as ChoiceLetter) }))
      .toEqual([]);
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec(wrong as ChoiceLetter) }))
      .toEqual(["incorrect_choice_answer"]);
  });

  // 规则 06 coord-column-row-rule：数对中第一个数表示列，第二个数表示行。
  test.each([
    ["数对 (3,4) 中，3 表示什么？"
      + "A. 第 3 行  B. 3 个格子  C. 第 3 列  D. 第 4 列", "C", "B"],
    ["数对 (6,2) 中，6 表示什么？"
      + "A. 第 6 列  B. 第 6 行  C. 2 个格子  D. 第 2 列", "A", "C"],
    ["数对 (8,7) 中，8 表示什么？"
      + "A. 第 7 列  B. 第 8 行  C. 第 8 列  D. 8 个格子", "C", "A"],
  ])("geo-coord-06 数对第一个数表示列（%s）正确字母无错误，错误字母报 incorrect_choice_answer", (stem, correct, wrong) => {
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec(correct as ChoiceLetter) }))
      .toEqual([]);
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec(wrong as ChoiceLetter) }))
      .toEqual(["incorrect_choice_answer"]);
  });

  // 规则 07 coord-same-column-row：第一个数相同→同一列，第二个数相同→同一行，按捕获重算。
  test.each([
    ["数对 (3,4) 和 (3,7) 表示的两个点，它们的位置关系是："
      + "A. 在同一列  B. 在同一行  C. 是同一个点  D. 既不同列也不同行", "A"],
    ["数对 (5,2) 和 (8,2) 表示的两个点，它们的位置关系是："
      + "A. 在同一行  B. 在同一列  C. 是同一个点  D. 既不同列也不同行", "A"],
    ["数对 (6,4) 和 (2,4) 表示的两个点，它们的位置关系是："
      + "A. 在同一行  B. 在同一列  C. 是同一个点  D. 既不同列也不同行", "A"],
  ])("geo-coord-07 同列/同行判定（%s）A 命中，错误字母报 incorrect_choice_answer", (stem) => {
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("A") }))
      .toEqual([]);
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("B") }))
      .toEqual(["incorrect_choice_answer"]);
  });

  // 负向：行列词序说反（第 3 行第 5 列）不满足 C2-1 的窄固定词序「第 c 列第 r 行」，
  // 也不被其它分支接受 → unsupported_choice_pattern；关键是错误形态绝不返回 []。
  test("geo-coord-01 行列词序说反时不被任何分支锚定 → unsupported_choice_pattern", () => {
    const stem = "方格图中第 3 行第 5 列的位置，用数对表示是哪一个？"
      + "A. (3,5)  B. (5,3)  C. (3,4)  D. (4,5)";
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("A") }))
      .toEqual(["unsupported_choice_pattern"]);
  });

  // 负向：只沿题干未声明的方向平移（题干说向右，起点第 1 列时结果列 < 1 不成立；
  // 这里用「向左」但答案按向右算）不被任何分支锚定为正确。
  test("geo-coord-03 题干声明向右、按向上作答报 incorrect_choice_answer", () => {
    const stem = "方格图中一个点的位置用数对表示是 (3,4)，把这个点向右平移 2 格。平移后的点用数对表示是："
      + "A. (5,4)  B. (4,3)  C. (3,6)  D. (5,5)";
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("C") }))
      .toEqual(["incorrect_choice_answer"]);
  });

  // 负向：第 1 列向左平移 2 格，结果列 < 1，单平移分支形态匹配但安全落空（[]），
  // 任何单一字母都被判 incorrect_choice_answer，绝不返回 []。
  test("geo-coord-03 平移后列小于 1 时安全落空 → incorrect_choice_answer", () => {
    const stem = "方格图中一个点的位置用数对表示是 (1,4)，把这个点向左平移 2 格。平移后的点用数对表示是："
      + "A. (3,4)  B. (4,1)  C. (1,6)  D. (3,3)";
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("A") }))
      .toEqual(["incorrect_choice_answer"]);
  });

  // 负向：第 1 行向下平移 2 格，结果行 < 1，单平移分支形态匹配但安全落空。
  test("geo-coord-04 平移后行小于 1 时安全落空 → incorrect_choice_answer", () => {
    const stem = "方格图的行从下往上编号。一个点在 (4,1) 的位置，把这个点向下平移 2 格，平移后的点用数对表示是："
      + "A. (6,1)  B. (4,3)  C. (2,4)  D. (4,2)";
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("B") }))
      .toEqual(["incorrect_choice_answer"]);
  });

  // 负向：两次平移都在同一轴（先右再左），不是两轴复合平移，形态匹配但轴检查
  // 安全落空，任何单一字母都报 incorrect_choice_answer。
  test("geo-coord-05 两次同方向轴平移被复合分支安全落空 → incorrect_choice_answer", () => {
    const stem = "方格图中一个点的位置用数对表示是 (5,3)，把这个点先向右平移 3 格，再向左平移 1 格。平移后的点用数对表示是："
      + "A. (8,3)  B. (7,3)  C. (5,6)  D. (4,3)";
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("B") }))
      .toEqual(["incorrect_choice_answer"]);
  });

  // 负向：复合平移结果列 < 1（第 2 列向左 5 格），形态匹配但 translatedPair
  // 安全落空，任何单一字母都报 incorrect_choice_answer。
  test("geo-coord-05 复合平移后列小于 1 时安全落空 → incorrect_choice_answer", () => {
    const stem = "方格图中一个点的位置用数对表示是 (2,3)，把这个点先向上平移 2 格，再向左平移 5 格。平移后的点用数对表示是："
      + "A. (7,5)  B. (4,1)  C. (2,5)  D. (3,3)";
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("A") }))
      .toEqual(["incorrect_choice_answer"]);
  });

  // 负向：geo-coord-06 题干的数字与被问数字不一致（问 4 而数对里没有 4），
  // 反向引用不匹配，分支不接受该形态。
  test("geo-coord-06 被问数字不在数对中时不被锚定 → unsupported_choice_pattern", () => {
    const stem = "数对 (3,5) 中，4 表示什么？"
      + "A. 第 4 行  B. 4 个格子  C. 第 4 列  D. 第 5 列";
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("C") }))
      .toEqual(["unsupported_choice_pattern"]);
  });

  // 负向：geo-coord-07 两个数对完全相同时「同一列」与「同一行」都成立，没有单一
  // 结论可锚定，分支安全落空（返回 []），任何单一字母（含「是同一个点」）都被判
  // incorrect_choice_answer，绝不返回 []。
  test("geo-coord-07 两个相同数对时无单一结论 → incorrect_choice_answer", () => {
    const stem = "数对 (3,4) 和 (3,4) 表示的两个点，它们的位置关系是："
      + "A. 在同一列  B. 在同一行  C. 是同一个点  D. 既不同列也不同行";
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("C") }))
      .toEqual(["incorrect_choice_answer"]);
  });

  // 负向：与数对无关的选择题形态不被任何新分支误锚。
  test("无关选择题不被数对分支误锚 → unsupported_choice_pattern", () => {
    const stem = "下面哪一个图形是三角形？"
      + "A. 圆  B. 三角形  C. 正方形  D. 长方形";
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("B") }))
      .toEqual(["unsupported_choice_pattern"]);
  });
});

describe("factors-multiples 因数与倍数锚定规则（P2-13b）", () => {
  type ChoiceLetter = "A" | "B" | "C" | "D";

  // 规则 F1 factor-count：枚举 1..n 中能整除 n 的正因数并计数。
  test.each([
    ["30 的因数个数是多少？", 8],
    ["36 的因数个数是多少？", 9],
    ["28 的因数个数是多少？", 6],
  ])("num-fm-01 因数计数（%s）正确答案无错误，错误答案报 incorrect_number_answer", (stem, answer) => {
    expect(validateWritten(stem, answer)).toEqual([]);
    expect(validateWritten(stem, answer + 1)).toEqual(["incorrect_number_answer"]);
  });

  // 守卫：F1 只枚举 n ≤ 100 的正整数；n=101 越界不锚定。
  test("num-fm-01 n=101 越界不被锚定 → unsupported_number_pattern", () => {
    const stem = "101 的因数个数是多少？";
    expect(validateWritten(stem, 2)).toEqual(["unsupported_number_pattern"]);
  });

  // 同形错误栽法：把「倍数个数」当因数个数（30 以内 2 的倍数有 15 个）不是
  // 因数个数（8 个），锚定后按枚举重算判错。
  test("num-fm-01 把倍数个数当作因数个数作答报 incorrect_number_answer", () => {
    const stem = "30 的因数个数是多少？";
    expect(validateWritten(stem, 15)).toEqual(["incorrect_number_answer"]);
  });

  // 规则 F2 multiples-count：m 以内 k 的倍数个数 = floor(m/k)，「以内」含端点。
  test.each([
    ["50 以内 7 的倍数个数是多少？", 7],
    ["50 以内 8 的倍数个数是多少？", 6],
    ["50 以内 9 的倍数个数是多少？", 5],
  ])("num-fm-03 范围内倍数计数（%s）正确答案无错误，错误答案报 incorrect_number_answer", (stem, answer) => {
    expect(validateWritten(stem, answer)).toEqual([]);
    expect(validateWritten(stem, answer + 1)).toEqual(["incorrect_number_answer"]);
  });

  // 守卫：F2 只支持 m ≤ 100；m=101 越界不锚定。
  test("num-fm-03 m=101 越界不被锚定 → unsupported_number_pattern", () => {
    const stem = "101 以内 7 的倍数个数是多少？";
    expect(validateWritten(stem, 14)).toEqual(["unsupported_number_pattern"]);
  });

  // 规则 F4 lcm-lower-bound：先求 lcm(a,b)，再找 ≥100 的第一个倍数。
  test.each([
    ["同时是 2、3 的倍数的最小三位数是多少？", 102],
    ["同时是 2、5 的倍数的最小三位数是多少？", 100],
    ["同时是 3、5 的倍数的最小三位数是多少？", 105],
  ])("num-fm-07 最小公倍数下界（%s）正确答案无错误，错误答案报 incorrect_number_answer", (stem, answer) => {
    expect(validateWritten(stem, answer)).toEqual([]);
    expect(validateWritten(stem, answer + 1)).toEqual(["incorrect_number_answer"]);
  });

  // 负向：a、b 钉死在 {2,3,5} 集合中，其它值不锚定。
  test("num-fm-07 a、b 不在 {2,3,5}（4、6）不被锚定 → unsupported_number_pattern", () => {
    const stem = "同时是 4、6 的倍数的最小三位数是多少？";
    expect(validateWritten(stem, 108)).toEqual(["unsupported_number_pattern"]);
  });

  // 分支 num-fm-02 factor-extremes：最小因数是 1、最大因数是它本身；n 仅用于
  // 把题干形态钉死，结论固定。三个实例都问最小因数，正确项 A。
  test.each([
    ["一个非零自然数 12 的最小因数是哪一个？"
      + "A. 1  B. 它本身  C. 0  D. 不存在"],
    ["一个非零自然数 24 的最小因数是哪一个？"
      + "A. 1  B. 它本身  C. 0  D. 不存在"],
    ["一个非零自然数 36 的最小因数是哪一个？"
      + "A. 1  B. 它本身  C. 0  D. 不存在"],
  ])("num-fm-02 最小因数（%s）A 命中，错误字母报 incorrect_choice_answer", (stem) => {
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("A") }))
      .toEqual([]);
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("B") }))
      .toEqual(["incorrect_choice_answer"]);
  });

  // 分支 num-fm-04 divisibility-2-5：同时是 2 和 5 的倍数，个位上是 0。
  // 题干给出的公倍数 n 必须确实个位为 0，否则陈述造假、安全落空。
  test.each([
    ["10 是 2 和 5 的公倍数。它符合下面哪一个特征？"
      + "A. 个位上是 5  B. 个位上是偶数  C. 各位上的数字和是 3 的倍数  D. 个位上是 0"],
    ["30 是 2 和 5 的公倍数。它符合下面哪一个特征？"
      + "A. 个位上是 5  B. 个位上是偶数  C. 各位上的数字和是 3 的倍数  D. 个位上是 0"],
    ["100 是 2 和 5 的公倍数。它符合下面哪一个特征？"
      + "A. 个位上是 5  B. 个位上是偶数  C. 各位上的数字和是 3 的倍数  D. 个位上是 0"],
  ])("num-fm-04 2 和 5 倍数特征（%s）D 命中，错误字母报 incorrect_choice_answer", (stem) => {
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("D") }))
      .toEqual([]);
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("A") }))
      .toEqual(["incorrect_choice_answer"]);
  });

  // 分支 num-fm-05 divisibility-3：从 4 个选项按各位数字和重算，恰好 1 个能被
  // 3 整除时命中该选项；三个实例正确项都是 B。
  test.each([
    ["下面各数中，是 3 的倍数的是哪一个？"
      + "A. 26  B. 45  C. 52  D. 80", "B"],
    ["下面各数中，是 3 的倍数的是哪一个？"
      + "A. 17  B. 51  C. 38  D. 64", "B"],
    ["下面各数中，是 3 的倍数的是哪一个？"
      + "A. 70  B. 24  C. 49  D. 86", "B"],
  ])("num-fm-05 按数字和重算选 3 的倍数（%s）正确字母命中，错误字母报 incorrect_choice_answer", (stem, correct) => {
    const wrong: ChoiceLetter = correct === "B" ? "C" : "B";
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec(correct as ChoiceLetter) }))
      .toEqual([]);
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec(wrong) }))
      .toEqual(["incorrect_choice_answer"]);
  });

  // 重算安全落空：两个选项都是 3 的倍数（12、15）时没有唯一答案。
  test("num-fm-05 两个选项都是 3 的倍数时不唯一 → incorrect_choice_answer", () => {
    const stem = "下面各数中，是 3 的倍数的是哪一个？"
      + "A. 12  B. 15  C. 20  D. 22";
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("A") }))
      .toEqual(["incorrect_choice_answer"]);
  });

  // 重算安全落空：没有一个选项是 3 的倍数（16、25、34、43）时任何字母都被拒。
  test("num-fm-05 没有选项是 3 的倍数时安全落空 → incorrect_choice_answer", () => {
    const stem = "下面各数中，是 3 的倍数的是哪一个？"
      + "A. 16  B. 25  C. 34  D. 43";
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("B") }))
      .toEqual(["incorrect_choice_answer"]);
  });

  // 分支 num-fm-06 prime-composite：三种问法（找质数/找合数/1 的归类），候选数
  // ≤30，按 2..sqrt(n) 试除重算，三个实例正确项都是 B。
  test.each([
    ["下面各数中，哪一个是质数？"
      + "A. 21  B. 23  C. 27  D. 1", "B"],
    ["下面各数中，哪一个是合数？"
      + "A. 13  B. 15  C. 19  D. 7", "B"],
    ["关于自然数 1，下面说法正确的是哪一个？"
      + "A. 1 是质数  B. 1 既不是质数也不是合数  C. 1 是合数  D. 1 既是质数也是合数", "B"],
  ])("num-fm-06 质数/合数/1 归类（%s）正确字母命中，错误字母报 incorrect_choice_answer", (stem, correct) => {
    const wrong: ChoiceLetter = correct === "B" ? "C" : "B";
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec(correct as ChoiceLetter) }))
      .toEqual([]);
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec(wrong) }))
      .toEqual(["incorrect_choice_answer"]);
  });

  // 重算安全落空：找质数但多个选项是质数（11、13、17）时没有唯一答案。
  test("num-fm-06 多个选项是质数时不唯一 → incorrect_choice_answer", () => {
    const stem = "下面各数中，哪一个是质数？"
      + "A. 11  B. 13  C. 15  D. 17";
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("B") }))
      .toEqual(["incorrect_choice_answer"]);
  });

  // 重算安全落空：找合数但没有一个选项是合数（2、3、5、7 全是质数）。
  test("num-fm-06 没有选项是合数时安全落空 → incorrect_choice_answer", () => {
    const stem = "下面各数中，哪一个是合数？"
      + "A. 2  B. 3  C. 5  D. 7";
    expect(renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec("A") }))
      .toEqual(["incorrect_choice_answer"]);
  });
});

describe("tree-planting 植树问题锚定规则（P2-13c）", () => {
  type ChoiceLetter = "A" | "B" | "C" | "D";

  const validateChoice = (stem: string, letter: ChoiceLetter) => (
    renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec(letter) })
  );

  // 规则 A 四种栽法各 1 个正例：正确棵数 []、错误棵数 incorrect_number_answer，
  // 答案单位必须是「棵」。
  test.each([
    ["在一条长 30 米的小路一侧栽树，每隔 5 米栽一棵，两端都栽。一共要栽多少棵？", 7],
    ["在一条长 20 米的小路一侧栽树，每隔 5 米栽一棵，一端栽，另一端不栽。一共要栽多少棵？", 4],
    ["两栋楼之间有一条长 24 米的小路，在小路一侧每隔 4 米栽一棵，两端都不栽。一共要栽多少棵？", 5],
    ["一个圆形池塘周长 40 米，沿池边每隔 5 米栽一棵。一共要栽多少棵？", 8],
  ])("规则 A 四种栽法（%s）正确答案无错误，错误答案报 incorrect_number_answer", (stem, answer) => {
    expect(validateWritten(stem, answer, "棵")).toEqual([]);
    expect(validateWritten(stem, answer + 1, "棵")).toEqual(["incorrect_number_answer"]);
  });

  // 单位负向：不带单位报 missing_unit，错配「米」报 unit_mismatch（规则 A 静态单位为「棵」）。
  test("规则 A 两端都栽：缺单位报 missing_unit，错单位报 unit_mismatch", () => {
    const stem = "在一条长 30 米的小路一侧栽树，每隔 5 米栽一棵，两端都栽。一共要栽多少棵？";
    expect(validateWritten(stem, 7)).toEqual(["missing_unit"]);
    expect(validateWritten(stem, 7, "米")).toEqual(["unit_mismatch"]);
  });

  // 计划硬性负向：同一组 L、d，用错误栽法的棵数作答必须被拒——证明情境关键词
  // （两端都栽/一端栽/两端都不栽/封闭图形）真的参与分支判定，而非只靠数字锚定。
  test.each([
    // T1 两端都栽（段 6、棵 7）：T2 的「段数」6 与 T3 的「段−1」5 都不能通过。
    ["在一条长 30 米的小路一侧栽树，每隔 5 米栽一棵，两端都栽。一共要栽多少棵？", 6],
    ["在一条长 30 米的小路一侧栽树，每隔 5 米栽一棵，两端都栽。一共要栽多少棵？", 5],
    // T2 一端栽（段 4、棵 4）：T1 的「段+1」5 不能通过。
    ["在一条长 20 米的小路一侧栽树，每隔 5 米栽一棵，一端栽，另一端不栽。一共要栽多少棵？", 5],
    // T3 两端都不栽（段 6、棵 5）：T2 的「段数」6 不能通过。
    ["两栋楼之间有一条长 24 米的小路，在小路一侧每隔 4 米栽一棵，两端都不栽。一共要栽多少棵？", 6],
    // T4 封闭图形（段 8、棵 8，首尾重合）：T1 的「段+1」9 不能通过。
    ["一个圆形池塘周长 40 米，沿池边每隔 5 米栽一棵。一共要栽多少棵？", 9],
  ])("规则 A 错误栽法答案（%s 答 %d）报 incorrect_number_answer", (stem, wrongAnswer) => {
    expect(validateWritten(stem, wrongAnswer, "棵")).toEqual(["incorrect_number_answer"]);
  });

  // 规则 A 守卫：间距 d 必须 2–10、段数 L/d 必须 4–20 且整除；越界不锚定。
  test.each([
    "在一条长 20 米的小路一侧栽树，每隔 1 米栽一棵，两端都栽。一共要栽多少棵？",
    "在一条长 44 米的小路一侧栽树，每隔 11 米栽一棵，两端都栽。一共要栽多少棵？",
    "在一条长 15 米的小路一侧栽树，每隔 5 米栽一棵，两端都栽。一共要栽多少棵？",
    "在一条长 42 米的小路一侧栽树，每隔 2 米栽一棵，两端都栽。一共要栽多少棵？",
    "在一条长 25 米的小路一侧栽树，每隔 4 米栽一棵，两端都栽。一共要栽多少棵？",
  ])("规则 A 守卫越界/不整除（%s）不锚定 → unsupported_number_pattern", (stem) => {
    expect(validateWritten(stem, 10, "棵")).toEqual(["unsupported_number_pattern"]);
  });

  // 规则 B 锯木两向正例：5 段→4 次（n−1）、3 次→4 段（m+1），答案为纯数（unit null）。
  test.each([
    ["一根木头锯成 5 段，需要锯（ ）次。", 4],
    ["一根木头锯了 3 次，锯成了（ ）段。", 4],
  ])("规则 B 锯木双向（%s）正确答案无错误，错误答案报 incorrect_number_answer", (stem, answer) => {
    expect(validateWritten(stem, answer)).toEqual([]);
    expect(validateWritten(stem, answer + 1)).toEqual(["incorrect_number_answer"]);
  });

  // 规则 B 守卫：锯成 1 段需要 0 锯，n=1 越界（n≥2）不锚定。
  test("规则 B 锯成 1 段（n=1）不锚定 → unsupported_number_pattern", () => {
    const stem = "一根木头锯成 1 段，需要锯（ ）次。";
    expect(validateWritten(stem, 0)).toEqual(["unsupported_number_pattern"]);
  });

  // T6 stairs-floors：从 a 楼到 b 楼走 b−a 层楼梯；选项为纯数字，正确项均为 B。
  test.each([
    ["小明从 1 楼走到 4 楼，一共要走几层楼梯？A. 4  B. 3  C. 2  D. 5", "B"],
    ["小明从 2 楼走到 6 楼，一共要走几层楼梯？A. 5  B. 4  C. 3  D. 6", "B"],
    ["小明从 3 楼走到 8 楼，一共要走几层楼梯？A. 6  B. 5  C. 4  D. 7", "B"],
  ])("app-tp-06 楼层差（%s）正确字母命中，错误字母报 incorrect_choice_answer", (stem, correct) => {
    const wrong: ChoiceLetter = "C";
    expect(validateChoice(stem, correct as ChoiceLetter)).toEqual([]);
    expect(validateChoice(stem, wrong)).toEqual(["incorrect_choice_answer"]);
  });

  // T7 plant-mode-choose：三个实例分别是 T1/T2/T3 三种栽法，分支必须从题干 L/d
  // 与情境词重算棵数，再在「N 棵」选项中找唯一命中；正确项均为 B。
  test.each([
    ["在一条长 40 米的小路一侧栽树，每隔 4 米栽一棵，两端都栽。下面哪一个是正确的棵数？"
      + "A. 10 棵  B. 11 棵  C. 9 棵  D. 12 棵", "B"],
    ["在一条长 36 米的小路一侧栽树，每隔 3 米栽一棵，一端栽，另一端不栽。下面哪一个是正确的棵数？"
      + "A. 11 棵  B. 12 棵  C. 13 棵  D. 10 棵", "B"],
    ["在一条长 32 米的小路一侧栽树，每隔 4 米栽一棵，两端都不栽。下面哪一个是正确的棵数？"
      + "A. 8 棵  B. 7 棵  C. 6 棵  D. 9 棵", "B"],
  ])("app-tp-07 按情境词重算棵数（%s）正确字母命中，错误字母报 incorrect_choice_answer", (stem, correct) => {
    expect(validateChoice(stem, correct as ChoiceLetter)).toEqual([]);
    expect(validateChoice(stem, "A")).toEqual(["incorrect_choice_answer"]);
  });

  // T7 重算落空负向：四个选项（10、9、12、13 棵）里都没有重算棵数 11，任何字母都不 []。
  test("app-tp-07 选项中没有重算棵数时安全落空 → incorrect_choice_answer", () => {
    const stem = "在一条长 40 米的小路一侧栽树，每隔 4 米栽一棵，两端都栽。下面哪一个是正确的棵数？"
      + "A. 10 棵  B. 9 棵  C. 12 棵  D. 13 棵";
    expect(validateChoice(stem, "B")).toEqual(["incorrect_choice_answer"]);
  });
});

describe("rotation 旋转锚定规则（P2-13d）", () => {
  type ChoiceLetter = "A" | "B" | "C" | "D";

  const validateChoice = (stem: string, letter: ChoiceLetter) => (
    renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec(letter) })
  );

  // R2 geo-rot-06 钟面指针旋转角度：从 a 时走到 b 时，(b−a) × 30 度。
  test.each([
    ["钟面上时针从 3 时走到 6 时，时针旋转了多少度？", 90],
    ["钟面上时针从 2 时走到 6 时，时针旋转了多少度？", 120],
    ["钟面上时针从 6 时走到 12 时，时针旋转了多少度？", 180],
  ])("R2 钟面旋转角（%s）正确答案无错误，错误答案报 incorrect_number_answer", (stem, answer) => {
    expect(validateWritten(stem, answer, "度")).toEqual([]);
    expect(validateWritten(stem, answer + 30, "度")).toEqual(["incorrect_number_answer"]);
  });

  // R2 单位负向：无单位报 missing_unit，错配「米」报 unit_mismatch。
  test("R2 缺单位报 missing_unit，错单位报 unit_mismatch", () => {
    const stem = "钟面上时针从 3 时走到 6 时，时针旋转了多少度？";
    expect(validateWritten(stem, 90)).toEqual(["missing_unit"]);
    expect(validateWritten(stem, 90, "米")).toEqual(["unit_mismatch"]);
  });

  // R2 守卫负向：跨 7 大格（3→10）越过 n≤6 守卫，b≤a（6→3）不成立，均不锚定。
  test.each([
    "钟面上时针从 3 时走到 10 时，时针旋转了多少度？",
    "钟面上时针从 6 时走到 3 时，时针旋转了多少度？",
  ])("R2 越界/倒序（%s）不锚定 → unsupported_number_pattern", (stem) => {
    expect(validateWritten(stem, 210, "度")).toEqual(["unsupported_number_pattern"]);
  });

  // geo-rot-03 顺转 90°：分支必须从捕获的端点坐标与方向词重算目标数对。
  test.each([
    [
      // u=3,v=0：顺转 (2,2)=B；逆转 (2,8)=C；A 平移 (8,5)；D 180° (-1,5)
      "方格图（行从下往上编号）中，线段 AB 的两个端点用数对表示分别是 A(2,5) 和 B(5,5)。把线段 AB 绕点 A 顺时针旋转 90°，旋转后端点 B 的对应位置用数对表示是哪一个？"
        + "A. (8,5)  B. (2,2)  C. (2,8)  D. (-1,5)",
      "C",
    ],
    [
      // u=3,v=0：顺转 (5,3)=B；逆转 (5,9)=C；A 平移 (11,6)；D 180° (2,6)
      "方格图（行从下往上编号）中，线段 AB 的两个端点用数对表示分别是 A(5,6) 和 B(8,6)。把线段 AB 绕点 A 顺时针旋转 90°，旋转后端点 B 的对应位置用数对表示是哪一个？"
        + "A. (11,6)  B. (5,3)  C. (5,9)  D. (2,6)",
      "C",
    ],
    [
      // u=0,v=4：顺转 (7,4)=B；逆转 (-1,4)=C；A 平移 (4,8)（只改列）；D 180° (3,0)
      "方格图（行从下往上编号）中，线段 AB 的两个端点用数对表示分别是 A(3,4) 和 B(3,8)。把线段 AB 绕点 A 顺时针旋转 90°，旋转后端点 B 的对应位置用数对表示是哪一个？"
        + "A. (4,8)  B. (7,4)  C. (-1,4)  D. (3,0)",
      "C",
    ],
  ])("geo-rot-03 顺转 90°（%s）正确字母命中，逆转/平移/180° 干扰项被拒", (stem, wrongLetter) => {
    expect(validateChoice(stem, "B")).toEqual([]);
    expect(validateChoice(stem, wrongLetter as ChoiceLetter)).toEqual(["incorrect_choice_answer"]);
  });

  // 方向词缺失/被改的形态不被 geo-rot-03 分支锚定。
  test("geo-rot-03 方向词被改时不被锚定 → unsupported_choice_pattern", () => {
    const stem = "方格图（行从下往上编号）中，线段 AB 的两个端点用数对表示分别是 A(2,5) 和 B(5,5)。把线段 AB 绕点 A 旋转 90°，旋转后端点 B 的对应位置用数对表示是哪一个？"
      + "A. (8,5)  B. (2,2)  C. (4,5)  D. (-1,5)";
    expect(validateChoice(stem, "B")).toEqual(["unsupported_choice_pattern"]);
  });

  // geo-rot-04 反解中心：由 P、P′ 反解 O=(a,b)。
  test.each([
    [
      "方格图（行从下往上编号）中，点 P(3,6) 绕某个点顺时针旋转 90° 后的对应点是 P′(6,3)。这个旋转中心点 O 用数对表示是哪一个？"
        + "A. O(6,6)  B. O(3,3)  C. O(6,3)  D. O(4,4)",
      "C",
    ],
    [
      "方格图（行从下往上编号）中，点 P(4,5) 绕某个点顺时针旋转 90° 后的对应点是 P′(7,2)。这个旋转中心点 O 用数对表示是哪一个？"
        + "A. O(4,5)  B. O(4,2)  C. O(5,4)  D. O(5,3)",
      "A",
    ],
    [
      "方格图（行从下往上编号）中，点 P(5,4) 绕某个点顺时针旋转 90° 后的对应点是 P′(2,1)。这个旋转中心点 O 用数对表示是哪一个？"
        + "A. O(2,1)  B. O(2,4)  C. O(4,3)  D. O(3,3)",
      "C",
    ],
  ])("geo-rot-04 反解旋转中心（%s）正确字母命中，错误中心干扰项被拒", (stem, wrongLetter) => {
    expect(validateChoice(stem, "B")).toEqual([]);
    expect(validateChoice(stem, wrongLetter as ChoiceLetter)).toEqual(["incorrect_choice_answer"]);
  });

  // geo-rot-04 半整数中心：P(1,1)→P′(2,1) 反解 2b=1、b=0.5，中心不是正整数，任何字母都不 []。
  test("geo-rot-04 半整数中心安全落空 → incorrect_choice_answer", () => {
    const stem = "方格图（行从下往上编号）中，点 P(1,1) 绕某个点顺时针旋转 90° 后的对应点是 P′(2,1)。这个旋转中心点 O 用数对表示是哪一个？"
      + "A. O(1,1)  B. O(1,0)  C. O(2,1)  D. O(0,1)";
    for (const letter of ["A", "B", "C", "D"] as const) {
      expect(validateChoice(stem, letter)).toEqual(["incorrect_choice_answer"]);
    }
  });

  // geo-rot-01 缺三要素：每例恰好给出 2 类要素，分支返回缺失那一类的标签（统一放 B）。
  test.each([
    [
      "把三角形绕点 O 顺时针旋转，缺少哪个旋转要素？"
        + "A. 旋转中心  B. 旋转角度  C. 旋转方向  D. 图形的颜色",
    ],
    [
      "把三角形绕点 O 旋转 90°，缺少哪个旋转要素？"
        + "A. 旋转角度  B. 旋转方向  C. 旋转中心  D. 图形的颜色",
    ],
    [
      "把三角形顺时针旋转 90°，缺少哪个旋转要素？"
        + "A. 旋转方向  B. 旋转中心  C. 旋转角度  D. 图形的颜色",
    ],
  ])("geo-rot-01 缺一个要素（%s）正确字母命中，错误字母报 incorrect_choice_answer", (stem) => {
    expect(validateChoice(stem, "B")).toEqual([]);
    expect(validateChoice(stem, "A")).toEqual(["incorrect_choice_answer"]);
  });

  // geo-rot-01 三要素都齐：没有缺失要素，分支安全落空，任何字母都不 []。
  test("geo-rot-01 三要素都齐时安全落空 → incorrect_choice_answer", () => {
    const stem = "把三角形绕点 O 顺时针旋转 90°，缺少哪个旋转要素？"
      + "A. 旋转中心  B. 旋转角度  C. 旋转方向  D. 图形的颜色";
    for (const letter of ["A", "B", "C", "D"] as const) {
      expect(validateChoice(stem, letter)).toEqual(["incorrect_choice_answer"]);
    }
  });

  // geo-rot-02 方向辨认：3 个顺时针情境统一锚定「顺时针」（放 A）。
  // 实例 1 时针正常走动、实例 2 拧紧瓶盖（righty-tighty）、实例 3 分针正常走动。
  test.each([
    "钟表上的指针正常走动，是往哪个方向转动？A. 顺时针  B. 逆时针  C. 平移  D. 翻转",
    "拧紧饮料瓶瓶盖时，是往哪个方向转动？A. 顺时针  B. 逆时针  C. 平移  D. 翻转",
    "钟表上的分针正常走动，是往哪个方向转动？A. 顺时针  B. 逆时针  C. 平移  D. 翻转",
  ])("geo-rot-02 顺时针情境（%s）A 命中，逆时针被拒", (stem) => {
    expect(validateChoice(stem, "A")).toEqual([]);
    expect(validateChoice(stem, "B")).toEqual(["incorrect_choice_answer"]);
  });

  // 逆时针对逆方向的重算用构造 stem 覆盖：指针倒着走 → 逆时针（该负向已被本测试直接覆盖）。
  test("geo-rot-02 钟表指针倒着走锚定逆时针，顺时针被拒", () => {
    const stem = "钟表上的指针倒着走，是往哪个方向转动？"
      + "A. 顺时针  B. 逆时针  C. 平移  D. 翻转";
    expect(validateChoice(stem, "B")).toEqual([]);
    expect(validateChoice(stem, "A")).toEqual(["incorrect_choice_answer"]);
  });

  // geo-rot-05 旋转/翻转辨别：分支按捕获的 shape 用映射表重算顺转 90° 后的符号。
  test.each([
    [
      "把图形「↑」绕中心顺时针旋转 90°，得到的图形是哪一个？"
        + "A. 「→」  B. 「↓」  C. 「↑」  D. 「⇒」",
    ],
    [
      "把图形「→」绕中心顺时针旋转 90°，得到的图形是哪一个？"
        + "A. 「↓」  B. 「←」  C. 「→」  D. 「⇒」",
    ],
    [
      "把图形「↓」绕中心顺时针旋转 90°，得到的图形是哪一个？"
        + "A. 「←」  B. 「↑」  C. 「↓」  D. 「⇒」",
    ],
  ])("geo-rot-05 符号映射（%s）A 命中，翻转/平移/缩放干扰项被拒", (stem) => {
    expect(validateChoice(stem, "A")).toEqual([]);
    expect(validateChoice(stem, "B")).toEqual(["incorrect_choice_answer"]);
  });

  // geo-rot-07 旋转性质：固定结论选择。题干允许三种旋转物体前缀（电风扇叶片/风车叶片/
  // 飞机螺旋桨）使 3 个 lockstep 实例题干互异，也兼容无前缀的原固定结论问法。
  test.each([
    "电风扇的叶片在旋转。一个图形经过旋转后，下面哪个说法正确？",
    "风车的叶片在旋转。一个图形经过旋转后，下面哪个说法正确？",
    "飞机的螺旋桨在旋转。一个图形经过旋转后，下面哪个说法正确？",
    "一个图形经过旋转后，下面哪个说法正确？",
  ])("geo-rot-07 旋转不改变形状和大小（%s）正确项 []，错误字母 incorrect_choice_answer", (prefixStem) => {
    const stem = prefixStem
      + "A. 形状和大小都不变，位置和方向改变  B. 形状发生改变  C. 大小发生改变  D. 只有位置改变，方向不变";
    expect(validateChoice(stem, "A")).toEqual([]);
    expect(validateChoice(stem, "B")).toEqual(["incorrect_choice_answer"]);
  });
});

describe("defective-items 找次品锚定规则（P2-13e）", () => {
  type ChoiceLetter = "A" | "B" | "C" | "D";

  const validateChoice = (stem: string, letter: ChoiceLetter) => (
    renderedQuestionErrors({ answerMode: "choice", stem, answerSpec: choiceSpec(letter) })
  );

  // D1 正向：已知次品较（轻|重）时，保证找出次品的最少称量次数。次数严格按教学
  // 映射表 {2:1,3:1,9:2,12:2,27:3} 查表，物品名（零件/乒乓球/糖果）与方向词
  // （较(轻|重)）由正则窄字符类/交替捕获，不改变答案。
  test.each([
    ["有 2 个零件，其中有 1 个是次品，次品较轻。用天平称，至少称几次就能保证找出次品？", 1],
    ["有 3 个乒乓球，其中有 1 个是次品，次品较轻。用天平称，至少称几次就能保证找出次品？", 1],
    ["有 9 个糖果，其中有 1 个是次品，次品较重。用天平称，至少称几次就能保证找出次品？", 2],
    ["有 12 个零件，其中有 1 个是次品，次品较轻。用天平称，至少称几次就能保证找出次品？", 2],
    ["有 27 个乒乓球，其中有 1 个是次品，次品较重。用天平称，至少称几次就能保证找出次品？", 3],
  ])("D1 正向（%s）正确次数无错误，错误次数报 incorrect_number_answer", (stem, answer) => {
    expect(validateWritten(stem, answer, "次")).toEqual([]);
    expect(validateWritten(stem, answer + 1, "次")).toEqual(["incorrect_number_answer"]);
  });

  // 三个独立模板（app-di-01/02/03）靠规模与题干引导语区分：引导语前缀写死在
  // 规则的可选交替中，引导语后仍按同一映射表查表锚定。
  test.each([
    ["先想想 9 里面有几个 3。有 9 个糖果，其中有 1 个是次品，次品较轻。用天平称，至少称几次就能保证找出次品？", 2],
    ["每称一次最多能排除约三分之二的物品。有 27 个零件，其中有 1 个是次品，次品较重。用天平称，至少称几次就能保证找出次品？", 3],
  ])("D1 正向带规模引导语前缀（%s）同样锚定", (stem, answer) => {
    expect(validateWritten(stem, answer, "次")).toEqual([]);
  });

  // 单位负向：缺单位报 missing_unit，错配「个」报 unit_mismatch（规则静态单位为「次」）。
  test("D1 正向缺单位报 missing_unit，错单位报 unit_mismatch", () => {
    const stem = "有 3 个零件，其中有 1 个是次品，次品较轻。用天平称，至少称几次就能保证找出次品？";
    expect(validateWritten(stem, 1)).toEqual(["missing_unit"]);
    expect(validateWritten(stem, 1, "个")).toEqual(["unit_mismatch"]);
  });

  // 表驱动守卫硬性负向：n=8、10 即使 ⌈log₃n⌉ 同为 2/3，n=100 超出教学集合，
  // 都必须安全落空 unsupported_number_pattern，证明不是任意 n 的 log₃ 公式。
  test.each([
    "有 8 个零件，其中有 1 个是次品，次品较轻。用天平称，至少称几次就能保证找出次品？",
    "有 10 个零件，其中有 1 个是次品，次品较重。用天平称，至少称几次就能保证找出次品？",
    "有 100 个乒乓球，其中有 1 个是次品，次品较轻。用天平称，至少称几次就能保证找出次品？",
  ])("D1 正向表外 n（%s）不锚定 → unsupported_number_pattern", (stem) => {
    expect(validateWritten(stem, 4, "次")).toEqual(["unsupported_number_pattern"]);
  });

  // 方向词缺失（没有「较轻/较重」）的同句式题干不被锚定。
  test("D1 正向方向词缺失不被锚定 → unsupported_number_pattern", () => {
    const stem = "有 9 个零件，其中有 1 个是次品。用天平称，至少称几次就能保证找出次品？";
    expect(validateWritten(stem, 2, "次")).toEqual(["unsupported_number_pattern"]);
  });

  // D1 反向：称 k 次最多能从 3^k 个物品里保证找出 1 个较（轻|重）的次品。
  // k 钉死 (1|2|3)，物品名由窄字符类接纳；1→3、2→9、3→27。
  test.each([
    ["用天平称，最多称 1 次就能保证找出 1 个较轻的次品，零件最多有多少个？", 3],
    ["用天平称，最多称 2 次就能保证找出 1 个较轻的次品，乒乓球最多有多少个？", 9],
    ["用天平称，最多称 3 次就能保证找出 1 个较重的次品，糖果最多有多少个？", 27],
  ])("D1 反向（%s）正确个数无错误，错误个数报 incorrect_number_answer", (stem, answer) => {
    expect(validateWritten(stem, answer, "个")).toEqual([]);
    expect(validateWritten(stem, answer + 1, "个")).toEqual(["incorrect_number_answer"]);
  });

  // D1 反向表外 k：k=4 不被正则钉死，安全落空 unsupported_number_pattern。
  test("D1 反向 k=4 表外不锚定 → unsupported_number_pattern", () => {
    const stem = "用天平称，最多称 4 次就能保证找出 1 个较轻的次品，零件最多有多少个？";
    expect(validateWritten(stem, 81, "个")).toEqual(["unsupported_number_pattern"]);
  });

  // D2：第一次称量的三分组。分支必须从捕获的 n 重算 q=floor(n/3)、r=n%3：
  // r=0→(q,q,q)、r=1→(q+1,q,q)、r=2→(q+1,q+1,q)，选项文本半角括号逗号无空格。
  // app-di-04 可均分 n=3/6/9；app-di-05 不平均 n=4/5/8；正确项统一放 B。
  test.each([
    [
      "有 3 个零件，其中 1 个次品较轻。第一次称，应该怎样分组？"
        + "A. (3,0,0)  B. (1,1,1)  C. (2,1,0)  D. (2,0,1)",
    ],
    [
      "有 6 个乒乓球，其中 1 个次品较轻。第一次称，应该怎样分组？"
        + "A. (3,2,1)  B. (2,2,2)  C. (4,2,0)  D. (6,0,0)",
    ],
    [
      "有 9 个糖果，其中 1 个次品较重。第一次称，应该怎样分组？"
        + "A. (4,4,1)  B. (3,3,3)  C. (4,3,2)  D. (8,1,0)",
    ],
    [
      "有 4 个零件，其中 1 个次品较轻。第一次称，应该怎样分组？"
        + "A. (2,2,0)  B. (2,1,1)  C. (4,0,0)  D. (3,1,0)",
    ],
    [
      "有 5 个乒乓球，其中 1 个次品较重。第一次称，应该怎样分组？"
        + "A. (3,2,0)  B. (2,2,1)  C. (5,0,0)  D. (4,1,0)",
    ],
    [
      "有 8 个糖果，其中 1 个次品较轻。第一次称，应该怎样分组？"
        + "A. (4,4,0)  B. (3,3,2)  C. (4,3,1)  D. (8,0,0)",
    ],
  ])("D2 三分组（%s）正确字母 []，错误字母报 incorrect_choice_answer", (stem) => {
    expect(validateChoice(stem, "B")).toEqual([]);
    expect(validateChoice(stem, "A")).toEqual(["incorrect_choice_answer"]);
  });

  // 零个正确分组：四个选项都不等于从 n=9 重算的 (3,3,3)，任何单一字母都被拒。
  // （两个正确分组无法构造：选项文本先做 compactText 去重，两个都等于 (3,3,3)
  // 的选项会先报 duplicate_choice_option，到不了重算分支。）
  test("D2 选项中没有重算分组时安全落空 → incorrect_choice_answer", () => {
    const stem = "有 9 个零件，其中 1 个次品较轻。第一次称，应该怎样分组？"
      + "A. (4,4,1)  B. (4,3,2)  C. (8,1,0)  D. (5,2,2)";
    for (const letter of ["A", "B", "C", "D"] as const) {
      expect(validateChoice(stem, letter)).toEqual(["incorrect_choice_answer"]);
    }
  });

  // n=13 超出 3..12 教学集合，形态不被分支锚定 → unsupported_choice_pattern。
  test("D2 n=13 表外形态不锚定 → unsupported_choice_pattern", () => {
    const stem = "有 13 个零件，其中 1 个次品较轻。第一次称，应该怎样分组？"
      + "A. (5,4,4)  B. (6,4,3)  C. (7,6,0)  D. (13,0,0)";
    expect(validateChoice(stem, "A")).toEqual(["unsupported_choice_pattern"]);
  });

  // app-di-07：没告诉次品是轻还是重时，只锚定定性结论「需要称的次数通常会增加」，
  // n 用 \d+ 捕获但不参与结论（不写精确次数）。两种「不知轻重」语义都识别。
  test.each([
    [
      "有 3 个零件，没有告诉我们次品是轻还是重。要保证找出次品，称的次数会怎样？"
        + "A. 需要称的次数通常会增加  B. 称的次数一定更少  C. 称的次数完全不变  D. 不用称就能找出",
    ],
    [
      "有 9 个乒乓球，不知道次品是轻是重。要保证找出次品，称的次数会怎样？"
        + "A. 需要称的次数通常会增加  B. 称的次数一定更少  C. 称的次数完全不变  D. 不用称就能找出",
    ],
    [
      "有 12 个糖果，没有告诉我们次品是轻还是重。要保证找出次品，称的次数会怎样？"
        + "A. 需要称的次数通常会增加  B. 称的次数一定更少  C. 称的次数完全不变  D. 不用称就能找出",
    ],
  ])("07 不知轻重定性结论（%s）A 命中，错误字母报 incorrect_choice_answer", (stem) => {
    expect(validateChoice(stem, "A")).toEqual([]);
    expect(validateChoice(stem, "B")).toEqual(["incorrect_choice_answer"]);
  });
});
