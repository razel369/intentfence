CREATE TABLE `payment_audits` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`protocol` text DEFAULT 'x402-v2' NOT NULL,
	`network` text NOT NULL,
	`asset` text NOT NULL,
	`amount_atomic` text NOT NULL,
	`pay_to` text NOT NULL,
	`settlement_response` text NOT NULL,
	`status` text DEFAULT 'settled' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payment_audits_request_id_unique` ON `payment_audits` (`request_id`);