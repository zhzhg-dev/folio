CREATE TABLE `cloud_backups` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`state` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_cloud_backups_owner_created` ON `cloud_backups` (`owner_id`,`created_at`);