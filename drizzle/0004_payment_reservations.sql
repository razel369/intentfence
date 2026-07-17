CREATE TABLE `payment_reservations` (
	`authorization_hash` text PRIMARY KEY NOT NULL,
	`product` text NOT NULL,
	`status` text DEFAULT 'reserved' NOT NULL,
	`reserved_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `payment_reservations_expires_at_idx` ON `payment_reservations` (`expires_at`);
