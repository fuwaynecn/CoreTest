CREATE TABLE `academic_calendar` (
	`school_year` text PRIMARY KEY,
	`semester1_start` text NOT NULL,
	`semester2_start` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `child_skill_settings` (
	`child_id` text NOT NULL,
	`skill_id` text NOT NULL,
	`mode` text DEFAULT 'auto' NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `child_skill_settings_pk` PRIMARY KEY(`child_id`, `skill_id`),
	CONSTRAINT `fk_child_skill_settings_child_id_users_id_fk` FOREIGN KEY (`child_id`) REFERENCES `users`(`id`),
	CONSTRAINT `fk_child_skill_settings_skill_id_skills_id_fk` FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`)
);
--> statement-breakpoint
ALTER TABLE `skills` ADD `grade` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `skills` ADD `semester` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `skills` ADD `expected_week` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `login_name` text;--> statement-breakpoint
ALTER TABLE `users` ADD `parent_id` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `users` ADD `grade` integer;--> statement-breakpoint
ALTER TABLE `users` ADD `edition` text DEFAULT 'pep' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `is_admin` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `users_login_name_idx` ON `users` (`login_name`);