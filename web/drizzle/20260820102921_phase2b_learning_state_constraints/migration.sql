ALTER TABLE `mastery_evidence` ADD `review_interval_days` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_dosage_states` (
	`child_id` text NOT NULL,
	`track` text NOT NULL,
	`level` integer NOT NULL,
	`weekly_target` integer NOT NULL,
	`session_minimum` integer NOT NULL,
	`session_target` integer NOT NULL,
	`session_maximum` integer NOT NULL,
	`reason_json` text NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `dosage_states_pk` PRIMARY KEY(`child_id`, `track`),
	CONSTRAINT `fk_dosage_states_child_id_users_id_fk` FOREIGN KEY (`child_id`) REFERENCES `users`(`id`),
	CONSTRAINT "dosage_states_track" CHECK("track" IN ('computation', 'equation')),
	CONSTRAINT "dosage_states_level_range" CHECK(("track" = 'computation' AND "level" BETWEEN 1 AND 7) OR ("track" = 'equation' AND "level" BETWEEN 1 AND 6)),
	CONSTRAINT "dosage_states_track_targets" CHECK((
    "track" = 'computation'
    AND "weekly_target" BETWEEN 60 AND 95
    AND "session_minimum" BETWEEN 12 AND 19
    AND "session_target" BETWEEN 12 AND 19
    AND "session_maximum" BETWEEN 12 AND 19
  ) OR (
    "track" = 'equation'
    AND "weekly_target" BETWEEN 15 AND 20
    AND "session_minimum" BETWEEN 4 AND 6
    AND "session_target" BETWEEN 4 AND 6
    AND "session_maximum" BETWEEN 4 AND 6
  )),
	CONSTRAINT "dosage_states_target_order" CHECK("session_minimum" <= "session_target" AND "session_target" <= "session_maximum")
);
--> statement-breakpoint
INSERT INTO `__new_dosage_states`(`child_id`, `track`, `level`, `weekly_target`, `session_minimum`, `session_target`, `session_maximum`, `reason_json`, `updated_at`) SELECT `child_id`, `track`, `level`, `weekly_target`, `session_minimum`, `session_target`, `session_maximum`, `reason_json`, `updated_at` FROM `dosage_states`;--> statement-breakpoint
DROP TABLE `dosage_states`;--> statement-breakpoint
ALTER TABLE `__new_dosage_states` RENAME TO `dosage_states`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_mastery_evidence` (
	`id` text PRIMARY KEY,
	`child_id` text NOT NULL,
	`skill_id` text NOT NULL,
	`session_item_id` text NOT NULL,
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
	CONSTRAINT "mastery_evidence_purpose" CHECK("purpose" IN ('diagnostic', 'learning', 'review', 'assessment')),
	CONSTRAINT "mastery_evidence_first_correct_boolean" CHECK("first_attempt_correct" IN (0, 1)),
	CONSTRAINT "mastery_evidence_independent_boolean" CHECK("independent" IN (0, 1)),
	CONSTRAINT "mastery_evidence_difficulty_range" CHECK("difficulty" BETWEEN 1 AND 4),
	CONSTRAINT "mastery_evidence_review_interval" CHECK("review_interval_days" IN (0, 1, 3, 7, 14, 30)),
	CONSTRAINT "mastery_evidence_review_purpose" CHECK(("purpose" = 'review' AND "review_interval_days" IN (1, 3, 7, 14, 30)) OR ("purpose" <> 'review' AND "review_interval_days" = 0))
);
--> statement-breakpoint
INSERT INTO `__new_mastery_evidence`(`id`, `child_id`, `skill_id`, `session_item_id`, `purpose`, `first_attempt_correct`, `independent`, `difficulty`, `structure_tag`, `occurred_on`, `occurred_at`) SELECT `id`, `child_id`, `skill_id`, `session_item_id`, `purpose`, `first_attempt_correct`, `independent`, `difficulty`, `structure_tag`, `occurred_on`, `occurred_at` FROM `mastery_evidence`;--> statement-breakpoint
DROP TABLE `mastery_evidence`;--> statement-breakpoint
ALTER TABLE `__new_mastery_evidence` RENAME TO `mastery_evidence`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_review_schedules` (
	`child_id` text NOT NULL,
	`skill_id` text NOT NULL,
	`level` integer NOT NULL,
	`due_on` text NOT NULL,
	`last_result` text,
	`updated_at` integer NOT NULL,
	CONSTRAINT `review_schedules_pk` PRIMARY KEY(`child_id`, `skill_id`),
	CONSTRAINT `fk_review_schedules_child_id_users_id_fk` FOREIGN KEY (`child_id`) REFERENCES `users`(`id`),
	CONSTRAINT `fk_review_schedules_skill_id_skills_id_fk` FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`),
	CONSTRAINT "review_schedules_level_range" CHECK("level" BETWEEN 0 AND 4),
	CONSTRAINT "review_schedules_last_result" CHECK("last_result" IS NULL OR "last_result" IN ('independent_correct', 'hinted_correct', 'corrected', 'incorrect'))
);
--> statement-breakpoint
INSERT INTO `__new_review_schedules`(`child_id`, `skill_id`, `level`, `due_on`, `last_result`, `updated_at`) SELECT `child_id`, `skill_id`, `level`, `due_on`, `last_result`, `updated_at` FROM `review_schedules`;--> statement-breakpoint
DROP TABLE `review_schedules`;--> statement-breakpoint
ALTER TABLE `__new_review_schedules` RENAME TO `review_schedules`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `mastery_evidence_source_idx` ON `mastery_evidence` (`session_item_id`);