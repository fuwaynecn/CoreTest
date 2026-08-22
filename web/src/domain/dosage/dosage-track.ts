import type { DosageTrack } from "./derive-dosage";

export function dosageTrackForDomain(domain: unknown): DosageTrack | null {
  if (domain === "number_operations") return "computation";
  if (domain === "equation_algebra") return "equation";
  return null;
}
