CREATE TABLE `diagnostic_parts` (
	`run_id` text NOT NULL,
	`part_number` integer NOT NULL,
	`status` text NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	CONSTRAINT `diagnostic_parts_pk` PRIMARY KEY(`run_id`, `part_number`),
	CONSTRAINT `fk_diagnostic_parts_run_id_diagnostic_runs_id_fk` FOREIGN KEY (`run_id`) REFERENCES `diagnostic_runs`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `diagnostic_runs` (
	`id` text PRIMARY KEY,
	`child_id` text NOT NULL,
	`version` integer NOT NULL,
	`status` text NOT NULL,
	`current_part` integer DEFAULT 1 NOT NULL,
	`seed` text NOT NULL,
	`report_snapshot` text,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	CONSTRAINT `fk_diagnostic_runs_child_id_users_id_fk` FOREIGN KEY (`child_id`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
ALTER TABLE `question_templates` ADD `domain` text DEFAULT 'number_operations' NOT NULL;--> statement-breakpoint
ALTER TABLE `question_templates` ADD `content_tier` text DEFAULT 'core' NOT NULL;--> statement-breakpoint
ALTER TABLE `question_templates` ADD `structure_tag` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE `question_templates` ADD `estimated_seconds` integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE `question_templates` ADD `reading_load` text DEFAULT 'short' NOT NULL;--> statement-breakpoint
ALTER TABLE `question_templates` ADD `answer_mode` text DEFAULT 'written' NOT NULL;--> statement-breakpoint
ALTER TABLE `question_templates` ADD `variant_spec` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `question_templates` ADD `hint_ladder` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `session_items` ADD `difficulty_snapshot` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `session_items` ADD `content_tier_snapshot` text DEFAULT 'core' NOT NULL;--> statement-breakpoint
ALTER TABLE `session_items` ADD `structure_tag_snapshot` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE `session_items` ADD `variant_seed` text DEFAULT 'phase1' NOT NULL;--> statement-breakpoint
ALTER TABLE `session_items` ADD `selection_reason_snapshot` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
UPDATE `session_items`
SET
	`difficulty_snapshot` = (
		SELECT `question_templates`.`difficulty`
		FROM `question_templates`
		WHERE `question_templates`.`id` = `session_items`.`question_template_id`
	),
	`content_tier_snapshot` = (
		SELECT `question_templates`.`content_tier`
		FROM `question_templates`
		WHERE `question_templates`.`id` = `session_items`.`question_template_id`
	),
	`structure_tag_snapshot` = (
		SELECT `question_templates`.`structure_tag`
		FROM `question_templates`
		WHERE `question_templates`.`id` = `session_items`.`question_template_id`
	);--> statement-breakpoint
ALTER TABLE `training_sessions` ADD `kind` text DEFAULT 'daily' NOT NULL;--> statement-breakpoint
ALTER TABLE `training_sessions` ADD `rule_version` text DEFAULT 'phase1' NOT NULL;--> statement-breakpoint
ALTER TABLE `training_sessions` ADD `target_seconds` integer;--> statement-breakpoint
ALTER TABLE `training_sessions` ADD `composition_snapshot` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `training_sessions` ADD `diagnostic_run_id` text REFERENCES diagnostic_runs(id);--> statement-breakpoint
ALTER TABLE `training_sessions` ADD `diagnostic_part_number` integer;--> statement-breakpoint
DROP INDEX IF EXISTS `one_session_per_child_day`;--> statement-breakpoint
CREATE UNIQUE INDEX `diagnostic_run_child_version_idx` ON `diagnostic_runs` (`child_id`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `one_formal_session_per_child_day` ON `training_sessions` (`child_id`,`session_date`) WHERE "training_sessions"."kind" IN ('daily', 'assessment');--> statement-breakpoint
CREATE UNIQUE INDEX `one_session_per_diagnostic_part` ON `training_sessions` (`diagnostic_run_id`,`diagnostic_part_number`) WHERE "training_sessions"."diagnostic_run_id" IS NOT NULL AND "training_sessions"."diagnostic_part_number" IS NOT NULL;
