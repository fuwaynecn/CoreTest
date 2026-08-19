CREATE TABLE `__session_snapshot_attempts_backup` AS
SELECT
	`id`,
	`session_item_id`,
	`client_submission_id`,
	`answer_text`,
	`is_correct`,
	`normalized_answer`,
	`explanation`,
	`session_completed`,
	`submitted_at`
FROM `attempts`;
--> statement-breakpoint
DROP TABLE `attempts`;
--> statement-breakpoint
CREATE TABLE `__new_session_items` (
	`id` text PRIMARY KEY,
	`session_id` text NOT NULL,
	`question_template_id` text NOT NULL,
	`position` integer NOT NULL,
	`stem_snapshot` text NOT NULL,
	`answer_spec_snapshot` text NOT NULL,
	`explanation_snapshot` text NOT NULL,
	`skill_id_snapshot` text NOT NULL,
	`skill_name_snapshot` text NOT NULL,
	CONSTRAINT `fk_session_items_session_id_training_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `training_sessions`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_session_items_question_template_id_question_templates_id_fk` FOREIGN KEY (`question_template_id`) REFERENCES `question_templates`(`id`),
	CONSTRAINT `fk_session_items_skill_id_snapshot_skills_id_fk` FOREIGN KEY (`skill_id_snapshot`) REFERENCES `skills`(`id`)
);
--> statement-breakpoint
INSERT INTO `__new_session_items` (
	`id`,
	`session_id`,
	`question_template_id`,
	`position`,
	`stem_snapshot`,
	`answer_spec_snapshot`,
	`explanation_snapshot`,
	`skill_id_snapshot`,
	`skill_name_snapshot`
)
SELECT
	`session_items`.`id`,
	`session_items`.`session_id`,
	`session_items`.`question_template_id`,
	`session_items`.`position`,
	`question_templates`.`stem`,
	`question_templates`.`answer_spec`,
	`question_templates`.`explanation`,
	`question_templates`.`skill_id`,
	`skills`.`name`
FROM `session_items`
INNER JOIN `question_templates`
	ON `session_items`.`question_template_id` = `question_templates`.`id`
INNER JOIN `skills`
	ON `question_templates`.`skill_id` = `skills`.`id`;
--> statement-breakpoint
DROP TABLE `session_items`;
--> statement-breakpoint
ALTER TABLE `__new_session_items` RENAME TO `session_items`;
--> statement-breakpoint
CREATE TABLE `attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`session_item_id` text NOT NULL,
	`client_submission_id` text NOT NULL UNIQUE,
	`answer_text` text NOT NULL,
	`is_correct` integer NOT NULL,
	`normalized_answer` text NOT NULL,
	`explanation` text NOT NULL,
	`session_completed` integer NOT NULL,
	`submitted_at` integer NOT NULL,
	CONSTRAINT `fk_attempts_session_item_id_session_items_id_fk` FOREIGN KEY (`session_item_id`) REFERENCES `session_items`(`id`)
);
--> statement-breakpoint
INSERT INTO `attempts` (
	`id`,
	`session_item_id`,
	`client_submission_id`,
	`answer_text`,
	`is_correct`,
	`normalized_answer`,
	`explanation`,
	`session_completed`,
	`submitted_at`
)
SELECT
	`id`,
	`session_item_id`,
	`client_submission_id`,
	`answer_text`,
	`is_correct`,
	`normalized_answer`,
	`explanation`,
	`session_completed`,
	`submitted_at`
FROM `__session_snapshot_attempts_backup`;
--> statement-breakpoint
DROP TABLE `__session_snapshot_attempts_backup`;
