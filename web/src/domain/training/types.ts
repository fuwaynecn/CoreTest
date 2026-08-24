export type SessionQuestion = { id: string; position: number; stem: string; answered: boolean };

export type SessionView = {
  id: string;
  status: "in_progress" | "completed" | "completed_early";
  currentPosition: number;
  questions: SessionQuestion[];
};
