type QuestionCardProps = {
  stem: string;
};

export function QuestionCard({ stem }: QuestionCardProps) {
  return (
    <section className="questionCard" aria-labelledby="question-heading">
      <p className="eyebrow">仔细读题</p>
      <h1 id="question-heading">{stem}</h1>
    </section>
  );
}
