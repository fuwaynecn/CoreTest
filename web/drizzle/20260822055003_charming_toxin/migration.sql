CREATE TABLE `hint_requests` (
	`request_id` text PRIMARY KEY,
	`child_id` text NOT NULL,
	`session_item_id` text NOT NULL,
	`hint_level` integer NOT NULL,
	`requested_at` integer NOT NULL,
	CONSTRAINT `fk_hint_requests_child_id_users_id_fk` FOREIGN KEY (`child_id`) REFERENCES `users`(`id`),
	CONSTRAINT `fk_hint_requests_session_item_id_session_items_id_fk` FOREIGN KEY (`session_item_id`) REFERENCES `session_items`(`id`) ON DELETE CASCADE,
	CONSTRAINT "hint_requests_level_range" CHECK("hint_level" BETWEEN 1 AND 3)
);
--> statement-breakpoint
ALTER TABLE `mastery_evidence` ADD `dosage_track` text;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_mastery_evidence` (
	`id` text PRIMARY KEY,
	`child_id` text NOT NULL,
	`skill_id` text NOT NULL,
	`session_item_id` text NOT NULL,
	`template_id` text NOT NULL,
	`purpose` text NOT NULL,
	`first_attempt_correct` integer NOT NULL,
	`independent` integer NOT NULL,
	`hint_level` integer,
	`dosage_track` text,
	`difficulty` integer NOT NULL,
	`structure_tag` text NOT NULL,
	`occurred_on` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`diagnostic_run_id` text,
	`diagnostic_completed_on` text,
	`diagnostic_completed_at` integer,
	`review_interval_days` integer DEFAULT 0 NOT NULL,
	CONSTRAINT `fk_mastery_evidence_child_id_users_id_fk` FOREIGN KEY (`child_id`) REFERENCES `users`(`id`),
	CONSTRAINT `fk_mastery_evidence_skill_id_skills_id_fk` FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`),
	CONSTRAINT `fk_mastery_evidence_session_item_id_session_items_id_fk` FOREIGN KEY (`session_item_id`) REFERENCES `session_items`(`id`),
	CONSTRAINT `fk_mastery_evidence_template_id_question_templates_id_fk` FOREIGN KEY (`template_id`) REFERENCES `question_templates`(`id`),
	CONSTRAINT `fk_mastery_evidence_diagnostic_run_id_diagnostic_runs_id_fk` FOREIGN KEY (`diagnostic_run_id`) REFERENCES `diagnostic_runs`(`id`),
	CONSTRAINT "mastery_evidence_purpose" CHECK("purpose" IN ('diagnostic', 'learning', 'review', 'assessment')),
	CONSTRAINT "mastery_evidence_first_correct_boolean" CHECK("first_attempt_correct" IN (0, 1)),
	CONSTRAINT "mastery_evidence_independent_boolean" CHECK("independent" IN (0, 1)),
	CONSTRAINT "mastery_evidence_hint_level" CHECK("hint_level" IS NULL OR "hint_level" BETWEEN 0 AND 3),
	CONSTRAINT "mastery_evidence_hint_independence" CHECK("independent" = 0 OR "hint_level" = 0),
	CONSTRAINT "mastery_evidence_dosage_track" CHECK("dosage_track" IS NULL OR "dosage_track" IN ('computation', 'equation')),
	CONSTRAINT "mastery_evidence_difficulty_range" CHECK("difficulty" BETWEEN 1 AND 4),
	CONSTRAINT "mastery_evidence_review_interval" CHECK("review_interval_days" IN (0, 1, 3, 7, 14, 30)),
	CONSTRAINT "mastery_evidence_review_purpose" CHECK(("purpose" = 'review' AND "review_interval_days" IN (1, 3, 7, 14, 30)) OR ("purpose" <> 'review' AND "review_interval_days" = 0)),
	CONSTRAINT "mastery_evidence_diagnostic_group" CHECK((
    "purpose" = 'diagnostic'
    AND (("diagnostic_run_id" IS NULL AND "diagnostic_completed_on" IS NULL AND "diagnostic_completed_at" IS NULL)
      OR ("diagnostic_run_id" IS NOT NULL AND "diagnostic_completed_on" IS NOT NULL AND "diagnostic_completed_at" IS NOT NULL))
  ) OR ("purpose" <> 'diagnostic' AND "diagnostic_run_id" IS NULL AND "diagnostic_completed_on" IS NULL AND "diagnostic_completed_at" IS NULL))
);
--> statement-breakpoint
INSERT INTO `__new_mastery_evidence`(`id`, `child_id`, `skill_id`, `session_item_id`, `template_id`, `purpose`, `first_attempt_correct`, `independent`, `hint_level`, `difficulty`, `structure_tag`, `occurred_on`, `occurred_at`, `diagnostic_run_id`, `diagnostic_completed_on`, `diagnostic_completed_at`, `review_interval_days`) SELECT `id`, `child_id`, `skill_id`, `session_item_id`, `template_id`, `purpose`, `first_attempt_correct`, `independent`, `hint_level`, `difficulty`, `structure_tag`, `occurred_on`, `occurred_at`, `diagnostic_run_id`, `diagnostic_completed_on`, `diagnostic_completed_at`, `review_interval_days` FROM `mastery_evidence`;--> statement-breakpoint
DROP TABLE `mastery_evidence`;--> statement-breakpoint
ALTER TABLE `__new_mastery_evidence` RENAME TO `mastery_evidence`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `mastery_evidence_source_idx` ON `mastery_evidence` (`session_item_id`);