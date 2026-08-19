export type SessionQuestion = { id: string; position: number; stem: string; answered: boolean };

export type SessionView = {
  id: string;
  status: "in_progress" | "completed";
  currentPosition: number;
  questions: SessionQuestion[];
};
