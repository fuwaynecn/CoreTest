CREATE TABLE `__new_attempts` (
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
INSERT INTO `__new_attempts` (
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
	`attempts`.`id`,
	`attempts`.`session_item_id`,
	`attempts`.`client_submission_id`,
	`attempts`.`answer_text`,
	`attempts`.`is_correct`,
	`attempts`.`answer_text`,
	`question_templates`.`explanation`,
	CASE WHEN `training_sessions`.`status` = 'completed' THEN 1 ELSE 0 END,
	`attempts`.`submitted_at`
FROM `attempts`
INNER JOIN `session_items`
	ON `attempts`.`session_item_id` = `session_items`.`id`
INNER JOIN `question_templates`
	ON `session_items`.`question_template_id` = `question_templates`.`id`
INNER JOIN `training_sessions`
	ON `session_items`.`session_id` = `training_sessions`.`id`;
--> statement-breakpoint
DROP TABLE `attempts`;
--> statement-breakpoint
ALTER TABLE `__new_attempts` RENAME TO `attempts`;
