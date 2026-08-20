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
INSERT INTO `__new_mastery_evidence`(
	`id`, `child_id`, `skill_id`, `session_item_id`, `template_id`, `purpose`,
	`first_attempt_correct`, `independent`, `hint_level`, `difficulty`, `structure_tag`,
	`occurred_on`, `occurred_at`, `diagnostic_run_id`, `diagnostic_completed_on`,
	`diagnostic_completed_at`, `review_interval_days`
)
SELECT evidence.`id`, evidence.`child_id`, evidence.`skill_id`, evidence.`session_item_id`,
	evidence.`template_id`, evidence.`purpose`, evidence.`first_attempt_correct`,
	CASE WHEN (
		SELECT attempt.`hint_level` FROM `attempts` attempt
		WHERE attempt.`session_item_id` = evidence.`session_item_id`
		ORDER BY attempt.`submitted_at`, attempt.`id` LIMIT 1
	) = 0 THEN evidence.`independent` ELSE 0 END,
	(
		SELECT attempt.`hint_level` FROM `attempts` attempt
		WHERE attempt.`session_item_id` = evidence.`session_item_id`
		ORDER BY attempt.`submitted_at`, attempt.`id` LIMIT 1
	),
	evidence.`difficulty`, evidence.`structure_tag`, evidence.`occurred_on`, evidence.`occurred_at`,
	CASE WHEN evidence.`purpose` = 'diagnostic' AND run.`completed_at` IS NOT NULL
		THEN session.`diagnostic_run_id` END,
	CASE WHEN evidence.`purpose` = 'diagnostic' AND run.`completed_at` IS NOT NULL
		THEN date(run.`completed_at` / 1000, 'unixepoch', '+8 hours') END,
	CASE WHEN evidence.`purpose` = 'diagnostic' AND run.`completed_at` IS NOT NULL
		THEN run.`completed_at` END,
	evidence.`review_interval_days`
FROM `mastery_evidence` evidence
INNER JOIN `session_items` item ON item.`id` = evidence.`session_item_id`
INNER JOIN `training_sessions` session ON session.`id` = item.`session_id`
LEFT JOIN `diagnostic_runs` run ON run.`id` = session.`diagnostic_run_id`;--> statement-breakpoint
DROP TABLE `mastery_evidence`;--> statement-breakpoint
ALTER TABLE `__new_mastery_evidence` RENAME TO `mastery_evidence`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `mastery_evidence_source_idx` ON `mastery_evidence` (`session_item_id`);
