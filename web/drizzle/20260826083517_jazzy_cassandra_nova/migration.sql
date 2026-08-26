CREATE TABLE `ai_provider_configs` (
	`provider` text PRIMARY KEY NOT NULL,
	`base_url` text NOT NULL,
	`model` text NOT NULL,
	`encrypted_api_key` text,
	`enabled` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "ai_provider_configs_provider" CHECK(`ai_provider_configs`.`provider` IN ('openai', 'deepseek'))
);
