export type PepSkillScheduleEntry = {
  grade: 1 | 2 | 3 | 4 | 5 | 6;
  semester: 1 | 2;
  expectedWeek: number;
  note?: string;
};

// 依据人教版编排；expectedWeek 为"约第几周学完"。
// decimal/fraction/percent 跨学期，本数据为临时值，Plan 2 拆分时定稿。
export const pepSkillSchedule: Record<string, PepSkillScheduleEntry> = {
  "integer-mental": { grade: 3, semester: 1, expectedWeek: 3 },
  decimal: { grade: 4, semester: 2, expectedWeek: 14, note: "临时值：含五上小数乘除，Plan 2 拆分" },
  fraction: { grade: 5, semester: 2, expectedWeek: 15, note: "临时值：含六上乘除，Plan 2 拆分" },
  // 六上：分数乘除与分数应用题。
  "fraction-ops": { grade: 6, semester: 1, expectedWeek: 7 },
  "mixed-operations": { grade: 4, semester: 1, expectedWeek: 6 },
  "operation-law": { grade: 4, semester: 2, expectedWeek: 10 },
  estimate: { grade: 3, semester: 1, expectedWeek: 12 },
  "reverse-check": { grade: 4, semester: 2, expectedWeek: 12 },
  "equation-l1": { grade: 5, semester: 1, expectedWeek: 10 },
  "equation-l2": { grade: 5, semester: 1, expectedWeek: 11 },
  "equation-l3": { grade: 5, semester: 1, expectedWeek: 12 },
  "equation-l4": { grade: 5, semester: 1, expectedWeek: 13 },
  "equation-l5": { grade: 5, semester: 1, expectedWeek: 14 },
  "equation-l6": { grade: 5, semester: 1, expectedWeek: 15, note: "实际为初一内容" },
  angle: { grade: 4, semester: 1, expectedWeek: 9 },
  perimeter: { grade: 3, semester: 1, expectedWeek: 13 },
  area: { grade: 3, semester: 2, expectedWeek: 10 },
  volume: { grade: 5, semester: 2, expectedWeek: 8 },
  "composite-geometry": { grade: 5, semester: 1, expectedWeek: 15 },
  spatial: { grade: 4, semester: 2, expectedWeek: 3 },
  "length-conversion": { grade: 3, semester: 1, expectedWeek: 5 },
  // 六上：位置与方向（二）。
  "position-direction": { grade: 6, semester: 1, expectedWeek: 4 },
  // 六上：圆。
  circle: { grade: 6, semester: 1, expectedWeek: 9 },
  "data-table": { grade: 3, semester: 2, expectedWeek: 7 },
  "data-bar": { grade: 4, semester: 1, expectedWeek: 14 },
  "data-line": { grade: 5, semester: 2, expectedWeek: 15 },
  "data-average": { grade: 4, semester: 2, expectedWeek: 15 },
  "data-compare": { grade: 4, semester: 2, expectedWeek: 17 },
  possibility: { grade: 5, semester: 1, expectedWeek: 9 },
  // 六上：扇形统计图。
  "pie-chart": { grade: 6, semester: 1, expectedWeek: 16 },
  "price-model": { grade: 4, semester: 1, expectedWeek: 8 },
  "distance-model": { grade: 4, semester: 1, expectedWeek: 9 },
  "work-model": { grade: 6, semester: 1, expectedWeek: 9 },
  "ratio-model": { grade: 6, semester: 1, expectedWeek: 11 },
  "percent-model": { grade: 6, semester: 1, expectedWeek: 15 },
  // 六下：百分数（二）——折扣、成数、税率、利率等应用。
  "percent-apply": { grade: 6, semester: 2, expectedWeek: 3 },
  "multi-step-model": { grade: 4, semester: 2, expectedWeek: 12 },
  "extra-information": { grade: 3, semester: 2, expectedWeek: 12 },
  "read-question": { grade: 2, semester: 1, expectedWeek: 8 },
  "find-condition": { grade: 2, semester: 2, expectedWeek: 8 },
  "unit-awareness": { grade: 2, semester: 2, expectedWeek: 8 },
  "estimate-check": { grade: 3, semester: 2, expectedWeek: 6 },
  "check-strategy": { grade: 3, semester: 2, expectedWeek: 8 },
  // 六上：数学广角——数与形。
  "number-shape": { grade: 6, semester: 1, expectedWeek: 17 },
  reading: { grade: 3, semester: 1, expectedWeek: 10 },
  equation: { grade: 5, semester: 1, expectedWeek: 12 },
  // 六下：负数。
  "negative-numbers": { grade: 6, semester: 2, expectedWeek: 1 },
  // 六下：圆柱与圆锥。
  "cylinder-cone": { grade: 6, semester: 2, expectedWeek: 5 },
  // 六下：比例与比例尺。
  "proportion-scale": { grade: 6, semester: 2, expectedWeek: 10 },
};
