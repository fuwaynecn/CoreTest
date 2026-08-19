ALTER TABLE `attempts` ADD `normalized_answer` text NOT NULL;--> statement-breakpoint
ALTER TABLE `attempts` ADD `explanation` text NOT NULL;--> statement-breakpoint
ALTER TABLE `attempts` ADD `session_completed` integer NOT NULL;