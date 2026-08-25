CREATE TABLE `reward_events` (
	`id` text PRIMARY KEY,
	`child_id` text NOT NULL,
	`source_key` text NOT NULL UNIQUE,
	`kind` text NOT NULL,
	`code` text NOT NULL,
	`points` integer DEFAULT 0 NOT NULL,
	`session_id` text,
	`attempt_id` text,
	`occurred_at` integer NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	CONSTRAINT `fk_reward_events_child_id_users_id_fk` FOREIGN KEY (`child_id`) REFERENCES `users`(`id`),
	CONSTRAINT `fk_reward_events_session_id_training_sessions_id_fk` FOREIGN KEY (`session_id`) REFERENCES `training_sessions`(`id`),
	CONSTRAINT `fk_reward_events_attempt_id_attempts_id_fk` FOREIGN KEY (`attempt_id`) REFERENCES `attempts`(`id`)
);
