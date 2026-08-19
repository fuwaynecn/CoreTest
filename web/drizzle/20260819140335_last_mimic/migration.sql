CREATE TABLE `attempts` (
	`id` text PRIMARY KEY,
	`session_item_id` text NOT NULL,
	`client_submission_id` text NOT NULL UNIQUE,
	`answer_text` text NOT NULL,
	`is_correct` integer NOT NULL,
	`submitted_at` integer NOT NULL,
	CONSTRAINT `fk_attempts_session_item_id_session_items_id_fk` FOREIGN KEY (`session_item_id`) REFERENCES `session_items`(`id`)
);
--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	CONSTRAINT `fk_auth_sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `mastery_states` (
	`child_id` text NOT NULL,
	`skill_id` text NOT NULL,
	`status` text NOT NULL,
	`evidence_count` integer DEFAULT 0 NOT NULL,
	`correct_count` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `mastery_states_pk` PRIMARY KEY(`child_id`, `skill_id`),
	CONSTRAINT `fk_mastery_states_child_id_users_id_fk` FOREIGN KEY (`child_id`) REFERENCES `users`(`id`),
	CONSTRAINT `fk_mastery_states_skill_id_skills_id_fk` FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`)
);
--> statement-breakpoint
CREATE TABLE `question_templates` (
	`id` text PRIMARY KEY,
	`skill_id` text NOT NULL,
	`stem` text NOT NULL,
	`answer_spec` text NOT NULL,
	`explanation` text NOT NULL,
	`difficulty` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	CONSTRAINT `fk_question_templates_skill_id_skills_id_fk` FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`)
);
--> statement-breakpoint
CREATE TABLE `session_items` (
	`id` text PRIMARY KEY,
	`session_id` text NOT NULL,
	`question_template_id` text NOT NULL,
	`position` integer NOT NULL,
	CONSTRAINT `fk_session_items_session_id_training_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `training_sessions`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_session_items_question_template_id_question_templates_id_fk` FOREIGN KEY (`question_template_id`) REFERENCES `question_templates`(`id`)
);
--> statement-breakpoint
CREATE TABLE `skills` (
	`id` text PRIMARY KEY,
	`code` text NOT NULL UNIQUE,
	`name` text NOT NULL,
	`domain` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `training_sessions` (
	`id` text PRIMARY KEY,
	`child_id` text NOT NULL,
	`session_date` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	CONSTRAINT `fk_training_sessions_child_id_users_id_fk` FOREIGN KEY (`child_id`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY,
	`role` text NOT NULL,
	`display_name` text NOT NULL,
	`credential_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_sessions_token_hash_idx` ON `auth_sessions` (`token_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `one_session_per_child_day` ON `training_sessions` (`child_id`,`session_date`);