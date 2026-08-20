export type ChoiceOption = {
  label: "A" | "B" | "C" | "D";
  text: string;
};

const choicePattern = /A\.\s*([\s\S]*?)\s{2,}B\.\s*([\s\S]*?)\s{2,}C\.\s*([\s\S]*?)\s{2,}D\.\s*([\s\S]+)$/;

export function extractChoiceOptions(stem: string): ChoiceOption[] {
  const match = stem.match(choicePattern);
  if (!match) return [];
  return (["A", "B", "C", "D"] as const).map((label, index) => ({
    label,
    text: match[index + 1].trim(),
  }));
}
