"use client";

import { useState } from "react";

export type ReadingCardResponse = { target: string; givens: string; units: string; usefulFacts: string; relationship: string; estimateRange: string };

const fields: Array<[keyof ReadingCardResponse, string]> = [
  ["target", "题目要我求什么"], ["givens", "已知了什么"], ["units", "单位是什么"],
  ["usefulFacts", "哪些信息有用"], ["relationship", "数量之间有什么关系"], ["estimateRange", "答案大约在哪个范围"],
];

export function ReadingCard({ onChange }: { onChange: (response: ReadingCardResponse) => void }) {
  const [response, setResponse] = useState<ReadingCardResponse>({ target: "", givens: "", units: "", usefulFacts: "", relationship: "", estimateRange: "" });
  return <fieldset className="readingCard"><legend>先把题意说清楚</legend>{fields.map(([key, label]) => (
    <label key={key}>{label}<input value={response[key]} onChange={(event) => { const next = { ...response, [key]: event.target.value }; setResponse(next); onChange(next); }} /></label>
  ))}</fieldset>;
}
