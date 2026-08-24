CREATE TABLE `learning_plans` (
	`id` text PRIMARY KEY,
	`child_id` text NOT NULL,
	`diagnosis_run_id` text NOT NULL,
	`version` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`status` text NOT NULL,
	`starts_on` text NOT NULL,
	`ends_on` text NOT NULL,
	`reason_snapshot` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_learning_plans_child_id_users_id_fk` FOREIGN KEY (`child_id`) REFERENCES `users`(`id`),
	CONSTRAINT `fk_learning_plans_diagnosis_run_id_diagnostic_runs_id_fk` FOREIGN KEY (`diagnosis_run_id`) REFERENCES `diagnostic_runs`(`id`)
);
--> statement-breakpoint
CREATE TABLE `parent_preferences` (
	`child_id` text PRIMARY KEY,
	`training_weekdays` text NOT NULL,
	`target_minutes` integer DEFAULT 30 NOT NULL,
	`specialist_focus` text NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_parent_preferences_child_id_users_id_fk` FOREIGN KEY (`child_id`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE TABLE `plan_targets` (
	`plan_id` text NOT NULL,
	`week_number` integer NOT NULL,
	`target_key` text NOT NULL,
	`skill_id` text,
	`track` text,
	`category` text NOT NULL,
	`minimum` integer NOT NULL,
	`target` integer NOT NULL,
	`maximum` integer NOT NULL,
	`reason_code` text NOT NULL,
	CONSTRAINT `plan_targets_pk` PRIMARY KEY(`plan_id`, `week_number`, `target_key`),
	CONSTRAINT `fk_plan_targets_plan_id_learning_plans_id_fk` FOREIGN KEY (`plan_id`) REFERENCES `learning_plans`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_plan_targets_skill_id_skills_id_fk` FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`)
);
--> statement-breakpoint
ALTER TABLE `attempts` ADD `reading_card_response` text;--> statement-breakpoint
ALTER TABLE `training_sessions` ADD `learning_plan_id` text REFERENCES learning_plans(id);--> statement-breakpoint
ALTER TABLE `training_sessions` ADD `plan_revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `learning_plan_child_version_idx` ON `learning_plans` (`child_id`,`version`,`revision`);