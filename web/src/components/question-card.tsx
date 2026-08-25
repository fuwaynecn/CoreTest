type QuestionCardProps = {
  stem: string;
};

export function QuestionCard({ stem }: QuestionCardProps) {
  return (
    <section className="questionCard" aria-labelledby="question-cue">
      <p id="question-cue" className="eyebrow">仔细读题</p>
      <h1 id="question-heading">{stem}</h1>
    </section>
  );
}
