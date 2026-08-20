CREATE TABLE `dosage_states` (
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
	CONSTRAINT "dosage_states_nonnegative_targets" CHECK("weekly_target" >= 0 AND "session_minimum" >= 0 AND "session_target" >= 0 AND "session_maximum" >= 0),
	CONSTRAINT "dosage_states_target_order" CHECK("session_minimum" <= "session_target" AND "session_target" <= "session_maximum")
);
--> statement-breakpoint
CREATE TABLE `error_observations` (
	`id` text PRIMARY KEY,
	`child_id` text NOT NULL,
	`session_item_id` text NOT NULL,
	`attempt_id` text,
	`source` text NOT NULL,
	`system_candidate` text,
	`child_self_report` text,
	`parent_correction` text,
	`previous_value` text,
	`previous_observation_id` text,
	`actor_id` text,
	`observed_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_error_observations_child_id_users_id_fk` FOREIGN KEY (`child_id`) REFERENCES `users`(`id`),
	CONSTRAINT `fk_error_observations_session_item_id_session_items_id_fk` FOREIGN KEY (`session_item_id`) REFERENCES `session_items`(`id`),
	CONSTRAINT `fk_error_observations_attempt_id_attempts_id_fk` FOREIGN KEY (`attempt_id`) REFERENCES `attempts`(`id`),
	CONSTRAINT `fk_error_observations_previous_observation_id_error_observations_id_fk` FOREIGN KEY (`previous_observation_id`) REFERENCES `error_observations`(`id`),
	CONSTRAINT `fk_error_observations_actor_id_users_id_fk` FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`),
	CONSTRAINT "error_observations_source" CHECK("source" IN ('system', 'child', 'parent')),
	CONSTRAINT "error_observations_system_candidate" CHECK("system_candidate" IS NULL OR "system_candidate" IN ('missing_unit', 'copied_number', 'calculation', 'relationship', 'range_check', 'incomplete_reading', 'unknown')),
	CONSTRAINT "error_observations_child_report" CHECK("child_self_report" IS NULL OR "child_self_report" IN ('did_not_read', 'missed_condition_or_unit', 'calculation_slip', 'method_unknown')),
	CONSTRAINT "error_observations_parent_correction" CHECK("parent_correction" IS NULL OR "parent_correction" IN ('missing_unit', 'copied_number', 'calculation', 'relationship', 'range_check', 'incomplete_reading', 'unknown')),
	CONSTRAINT "error_observations_previous_value" CHECK("previous_value" IS NULL OR "previous_value" IN ('missing_unit', 'copied_number', 'calculation', 'relationship', 'range_check', 'incomplete_reading', 'unknown', 'did_not_read', 'missed_condition_or_unit', 'calculation_slip', 'method_unknown')),
	CONSTRAINT "error_observations_event_shape" CHECK((
    ("source" = 'system' AND "system_candidate" IS NOT NULL AND "child_self_report" IS NULL AND "parent_correction" IS NULL AND "previous_value" IS NULL AND "actor_id" IS NULL AND "previous_observation_id" IS NULL)
    OR ("source" = 'child' AND "system_candidate" IS NULL AND "child_self_report" IS NOT NULL AND "parent_correction" IS NULL AND "previous_value" IS NOT NULL AND "actor_id" IS NOT NULL AND "previous_observation_id" IS NOT NULL)
    OR ("source" = 'parent' AND "system_candidate" IS NULL AND "child_self_report" IS NULL AND "parent_correction" IS NOT NULL AND "previous_value" IS NOT NULL AND "actor_id" IS NOT NULL AND "previous_observation_id" IS NOT NULL)
  ))
);
--> statement-breakpoint
CREATE TABLE `hint_events` (
	`id` text PRIMARY KEY,
	`child_id` text NOT NULL,
	`session_item_id` text NOT NULL,
	`hint_level` integer NOT NULL,
	`revealed_at` integer NOT NULL,
	CONSTRAINT `fk_hint_events_child_id_users_id_fk` FOREIGN KEY (`child_id`) REFERENCES `users`(`id`),
	CONSTRAINT `fk_hint_events_session_item_id_session_items_id_fk` FOREIGN KEY (`session_item_id`) REFERENCES `session_items`(`id`) ON DELETE CASCADE,
	CONSTRAINT "hint_events_level_range" CHECK("hint_level" BETWEEN 1 AND 3)
);
--> statement-breakpoint
CREATE TABLE `mastery_evidence` (
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
	CONSTRAINT `fk_mastery_evidence_child_id_users_id_fk` FOREIGN KEY (`child_id`) REFERENCES `users`(`id`),
	CONSTRAINT `fk_mastery_evidence_skill_id_skills_id_fk` FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`),
	CONSTRAINT `fk_mastery_evidence_session_item_id_session_items_id_fk` FOREIGN KEY (`session_item_id`) REFERENCES `session_items`(`id`),
	CONSTRAINT "mastery_evidence_purpose" CHECK("purpose" IN ('diagnostic', 'learning', 'review', 'assessment')),
	CONSTRAINT "mastery_evidence_first_correct_boolean" CHECK("first_attempt_correct" IN (0, 1)),
	CONSTRAINT "mastery_evidence_independent_boolean" CHECK("independent" IN (0, 1)),
	CONSTRAINT "mastery_evidence_difficulty_range" CHECK("difficulty" BETWEEN 1 AND 4)
);
--> statement-breakpoint
CREATE TABLE `review_schedules` (
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
	CONSTRAINT "review_schedules_last_result" CHECK("last_result" IS NULL OR "last_result" IN ('independent_correct', 'hinted_correct', 'incorrect'))
);
--> statement-breakpoint
ALTER TABLE `attempts` ADD `active_duration_ms` integer;--> statement-breakpoint
ALTER TABLE `attempts` ADD `hint_level` integer;--> statement-breakpoint
ALTER TABLE `attempts` ADD `hint_count` integer;--> statement-breakpoint
ALTER TABLE `attempts` ADD `correction_number` integer;--> statement-breakpoint
ALTER TABLE `mastery_states` ADD `reason_code` text DEFAULT 'legacy_snapshot' NOT NULL;--> statement-breakpoint
ALTER TABLE `mastery_states` ADD `evidence_cursor` text;--> statement-breakpoint
ALTER TABLE `mastery_states` ADD `evidence_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_attempts` (
	`id` text PRIMARY KEY,
	`session_item_id` text NOT NULL,
	`client_submission_id` text NOT NULL UNIQUE,
	`answer_text` text NOT NULL,
	`is_correct` integer NOT NULL,
	`normalized_answer` text NOT NULL,
	`explanation` text NOT NULL,
	`session_completed` integer NOT NULL,
	`active_duration_ms` integer,
	`hint_level` integer,
	`hint_count` integer,
	`correction_number` integer,
	`submitted_at` integer NOT NULL,
	CONSTRAINT `fk_attempts_session_item_id_session_items_id_fk` FOREIGN KEY (`session_item_id`) REFERENCES `session_items`(`id`),
	CONSTRAINT "attempts_active_duration_nonnegative" CHECK("active_duration_ms" IS NULL OR "active_duration_ms" >= 0),
	CONSTRAINT "attempts_hint_level_range" CHECK("hint_level" IS NULL OR "hint_level" BETWEEN 0 AND 3),
	CONSTRAINT "attempts_hint_count_range" CHECK("hint_count" IS NULL OR "hint_count" BETWEEN 0 AND 3),
	CONSTRAINT "attempts_correction_number_nonnegative" CHECK("correction_number" IS NULL OR "correction_number" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_attempts`(`id`, `session_item_id`, `client_submission_id`, `answer_text`, `is_correct`, `normalized_answer`, `explanation`, `session_completed`, `submitted_at`) SELECT `id`, `session_item_id`, `client_submission_id`, `answer_text`, `is_correct`, `normalized_answer`, `explanation`, `session_completed`, `submitted_at` FROM `attempts`;--> statement-breakpoint
DROP TABLE `attempts`;--> statement-breakpoint
ALTER TABLE `__new_attempts` RENAME TO `attempts`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_mastery_states` (
	`child_id` text NOT NULL,
	`skill_id` text NOT NULL,
	`status` text NOT NULL,
	`evidence_count` integer DEFAULT 0 NOT NULL,
	`correct_count` integer DEFAULT 0 NOT NULL,
	`reason_code` text DEFAULT 'legacy_snapshot' NOT NULL,
	`evidence_cursor` text,
	`evidence_version` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `mastery_states_pk` PRIMARY KEY(`child_id`, `skill_id`),
	CONSTRAINT `fk_mastery_states_child_id_users_id_fk` FOREIGN KEY (`child_id`) REFERENCES `users`(`id`),
	CONSTRAINT `fk_mastery_states_skill_id_skills_id_fk` FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`),
	CONSTRAINT "mastery_states_status" CHECK("status" IN ('undiagnosed', 'needs_support', 'learning', 'basic', 'stable')),
	CONSTRAINT "mastery_states_counts" CHECK("evidence_count" >= 0 AND "correct_count" >= 0 AND "correct_count" <= "evidence_count"),
	CONSTRAINT "mastery_states_evidence_version" CHECK("evidence_version" >= 0)
);
--> statement-breakpoint
INSERT INTO `__new_mastery_states`(`child_id`, `skill_id`, `status`, `evidence_count`, `correct_count`, `updated_at`) SELECT `child_id`, `skill_id`, `status`, `evidence_count`, `correct_count`, `updated_at` FROM `mastery_states`;--> statement-breakpoint
DROP TABLE `mastery_states`;--> statement-breakpoint
ALTER TABLE `__new_mastery_states` RENAME TO `mastery_states`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `hint_event_item_level_idx` ON `hint_events` (`session_item_id`,`hint_level`);--> statement-breakpoint
CREATE UNIQUE INDEX `mastery_evidence_source_idx` ON `mastery_evidence` (`session_item_id`);