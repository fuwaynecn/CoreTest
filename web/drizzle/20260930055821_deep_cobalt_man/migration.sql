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
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text PRIMARY KEY,
	`role` text NOT NULL,
	`display_name` text NOT NULL,
	`credential_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`login_name` text UNIQUE,
	`parent_id` text,
	`grade` integer,
	`edition` text DEFAULT 'pep' NOT NULL,
	`is_admin` integer DEFAULT false NOT NULL,
	CONSTRAINT `fk_users_parent_id_users_id_fk` FOREIGN KEY (`parent_id`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
INSERT INTO `__new_users`(`id`, `role`, `display_name`, `credential_hash`, `created_at`) SELECT `id`, `role`, `display_name`, `credential_hash`, `created_at` FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;