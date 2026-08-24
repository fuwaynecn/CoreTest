PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_plan_targets` (
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
	CONSTRAINT `fk_plan_targets_skill_id_skills_id_fk` FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`),
	CONSTRAINT "plan_targets_week_number" CHECK("week_number" BETWEEN 1 AND 6),
	CONSTRAINT "plan_targets_target_order" CHECK("minimum" <= "target" AND "target" <= "maximum")
);
--> statement-breakpoint
INSERT INTO `__new_plan_targets`(`plan_id`, `week_number`, `target_key`, `skill_id`, `track`, `category`, `minimum`, `target`, `maximum`, `reason_code`) SELECT `plan_id`, `week_number`, `target_key`, `skill_id`, `track`, `category`, `minimum`, `target`, `maximum`, `reason_code` FROM `plan_targets`;--> statement-breakpoint
DROP TABLE `plan_targets`;--> statement-breakpoint
ALTER TABLE `__new_plan_targets` RENAME TO `plan_targets`;--> statement-breakpoint
PRAGMA foreign_keys=ON;