export type ReviewEventIdentity = {
  on: string;
  at: number;
  eventId: string;
};

export type ReviewCorrectionIdentity = {
  id: string;
  on: string;
  at: number;
};

type ReviewEvidenceIdentity = {
  id: string;
  purpose: string;
  occurredOn: string;
  occurredAt: number;
  diagnosticRunId: string | null;
  diagnosticCompletedOn: string | null;
  diagnosticCompletedAt: number | null;
};

export function reviewEventIdentity(
  evidence: ReviewEvidenceIdentity,
  correction?: ReviewCorrectionIdentity | null,
): ReviewEventIdentity | null {
  if (evidence.purpose !== "diagnostic") {
    return {
      on: correction?.on ?? evidence.occurredOn,
      at: correction?.at ?? evidence.occurredAt,
      eventId: correction?.id ?? evidence.id,
    };
  }
  if (evidence.diagnosticRunId === null || evidence.diagnosticCompletedOn === null
    || evidence.diagnosticCompletedAt === null) return null;
  return {
    on: evidence.diagnosticCompletedOn,
    at: evidence.diagnosticCompletedAt,
    eventId: evidence.diagnosticRunId,
  };
}

export function compareReviewEvents(left: ReviewEventIdentity, right: ReviewEventIdentity) {
  return left.on.localeCompare(right.on)
    || left.at - right.at
    || left.eventId.localeCompare(right.eventId);
}
