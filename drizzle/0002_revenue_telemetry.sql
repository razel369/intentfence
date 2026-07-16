ALTER TABLE `payment_audits` ADD `payer_address` text;
--> statement-breakpoint
ALTER TABLE `payment_audits` ADD `transaction_hash` text;
--> statement-breakpoint
ALTER TABLE `payment_audits` ADD `facilitator` text;
--> statement-breakpoint
ALTER TABLE `payment_audits` ADD `decision_status` text;
--> statement-breakpoint
ALTER TABLE `payment_audits` ADD `receipt_id` text;
--> statement-breakpoint
CREATE INDEX `payment_audits_status_created_at_idx` ON `payment_audits` (`status`,`created_at`);
--> statement-breakpoint
CREATE INDEX `payment_audits_transaction_hash_idx` ON `payment_audits` (`transaction_hash`);
--> statement-breakpoint
CREATE TABLE `usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`event_name` text NOT NULL,
	`funnel_stage` text NOT NULL,
	`request_id` text,
	`subject` text,
	`source` text,
	`medium` text,
	`campaign` text,
	`referrer` text,
	`path` text,
	`metadata_json` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `usage_events_event_created_at_idx` ON `usage_events` (`event_name`,`created_at`);
--> statement-breakpoint
CREATE INDEX `usage_events_stage_created_at_idx` ON `usage_events` (`funnel_stage`,`created_at`);
--> statement-breakpoint
CREATE INDEX `usage_events_request_id_idx` ON `usage_events` (`request_id`);
