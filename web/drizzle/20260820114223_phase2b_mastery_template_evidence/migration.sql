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
	`difficulty` integer NOT NULL,
	`structure_tag` text NOT NULL,
	`occurred_on` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`review_interval_days` integer DEFAULT 0 NOT NULL,
	CONSTRAINT `fk_mastery_evidence_child_id_users_id_fk` FOREIGN KEY (`child_id`) REFERENCES `users`(`id`),
	CONSTRAINT `fk_mastery_evidence_skill_id_skills_id_fk` FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`),
	CONSTRAINT `fk_mastery_evidence_session_item_id_session_items_id_fk` FOREIGN KEY (`session_item_id`) REFERENCES `session_items`(`id`),
	CONSTRAINT `fk_mastery_evidence_template_id_question_templates_id_fk` FOREIGN KEY (`template_id`) REFERENCES `question_templates`(`id`),
	CONSTRAINT "mastery_evidence_purpose" CHECK("purpose" IN ('diagnostic', 'learning', 'review', 'assessment')),
	CONSTRAINT "mastery_evidence_first_correct_boolean" CHECK("first_attempt_correct" IN (0, 1)),
	CONSTRAINT "mastery_evidence_independent_boolean" CHECK("independent" IN (0, 1)),
	CONSTRAINT "mastery_evidence_difficulty_range" CHECK("difficulty" BETWEEN 1 AND 4),
	CONSTRAINT "mastery_evidence_review_interval" CHECK("review_interval_days" IN (0, 1, 3, 7, 14, 30)),
	CONSTRAINT "mastery_evidence_review_purpose" CHECK(("purpose" = 'review' AND "review_interval_days" IN (1, 3, 7, 14, 30)) OR ("purpose" <> 'review' AND "review_interval_days" = 0))
);--> statement-breakpoint
INSERT INTO `__new_mastery_evidence` (
	`id`, `child_id`, `skill_id`, `session_item_id`, `template_id`, `purpose`,
	`first_attempt_correct`, `independent`, `difficulty`, `structure_tag`,
	`occurred_on`, `occurred_at`, `review_interval_days`
)
SELECT evidence.`id`, evidence.`child_id`, evidence.`skill_id`, evidence.`session_item_id`,
	items.`question_template_id`, evidence.`purpose`, evidence.`first_attempt_correct`,
	evidence.`independent`, evidence.`difficulty`, evidence.`structure_tag`,
	evidence.`occurred_on`, evidence.`occurred_at`, evidence.`review_interval_days`
FROM `mastery_evidence` evidence
INNER JOIN `session_items` items ON items.`id` = evidence.`session_item_id`;--> statement-breakpoint
DROP TABLE `mastery_evidence`;--> statement-breakpoint
ALTER TABLE `__new_mastery_evidence` RENAME TO `mastery_evidence`;--> statement-breakpoint
CREATE UNIQUE INDEX `mastery_evidence_source_idx` ON `mastery_evidence` (`session_item_id`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
