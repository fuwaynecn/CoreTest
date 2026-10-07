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
