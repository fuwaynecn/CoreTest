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
  "data-table": { grade: 3, semester: 2, expectedWeek: 7 },
  "data-bar": { grade: 4, semester: 1, expectedWeek: 14 },
  "data-line": { grade: 5, semester: 2, expectedWeek: 15 },
  "data-average": { grade: 4, semester: 2, expectedWeek: 15 },
  "data-compare": { grade: 4, semester: 2, expectedWeek: 17 },
  possibility: { grade: 5, semester: 1, expectedWeek: 9 },
  "price-model": { grade: 4, semester: 1, expectedWeek: 8 },
  "distance-model": { grade: 4, semester: 1, expectedWeek: 9 },
  "work-model": { grade: 6, semester: 1, expectedWeek: 9 },
  "ratio-model": { grade: 6, semester: 1, expectedWeek: 11 },
  "percent-model": { grade: 6, semester: 1, expectedWeek: 16 },
  "multi-step-model": { grade: 4, semester: 2, expectedWeek: 12 },
  "extra-information": { grade: 3, semester: 2, expectedWeek: 12 },
  "read-question": { grade: 2, semester: 1, expectedWeek: 8 },
  "find-condition": { grade: 2, semester: 2, expectedWeek: 8 },
  "unit-awareness": { grade: 2, semester: 2, expectedWeek: 8 },
  "estimate-check": { grade: 3, semester: 2, expectedWeek: 6 },
  "check-strategy": { grade: 3, semester: 2, expectedWeek: 8 },
  reading: { grade: 3, semester: 1, expectedWeek: 10 },
  equation: { grade: 5, semester: 1, expectedWeek: 12 },
};
