CREATE TABLE `request_rate_limits` (
	`scope` text NOT NULL,
	`key_hash` text NOT NULL,
	`window_start` integer NOT NULL,
	`request_count` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY(`scope`, `key_hash`, `window_start`)
);
--> statement-breakpoint
CREATE INDEX `request_rate_limits_window_start_idx` ON `request_rate_limits` (`window_start`);
