CREATE TABLE `question_bank_refreshes` (
	`week_key` text PRIMARY KEY,
	`completed_at` integer NOT NULL,
	`generated_count` integer NOT NULL,
	`errors` text DEFAULT '[]' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `question_instances` (
	`id` text PRIMARY KEY,
	`template_id` text NOT NULL,
	`skill_id` text NOT NULL,
	`variant_seed` text NOT NULL,
	`variables` text NOT NULL,
	`stem` text NOT NULL,
	`answer_spec` text NOT NULL,
	`explanation` text NOT NULL,
	`difficulty` integer NOT NULL,
	`fingerprint` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`generated_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`last_used_at` integer,
	CONSTRAINT `fk_question_instances_template_id_question_templates_id_fk` FOREIGN KEY (`template_id`) REFERENCES `question_templates`(`id`),
	CONSTRAINT `fk_question_instances_skill_id_skills_id_fk` FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`),
	CONSTRAINT "question_instances_difficulty" CHECK("difficulty" BETWEEN 1 AND 4)
);
--> statement-breakpoint
ALTER TABLE `session_items` ADD `question_instance_id` text REFERENCES question_instances(id);--> statement-breakpoint
CREATE UNIQUE INDEX `question_instances_fingerprint_idx` ON `question_instances` (`fingerprint`);