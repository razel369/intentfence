import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const leads = sqliteTable("leads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  company: text("company"),
  useCase: text("use_case"),
  plan: text("plan").notNull().default("builder"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const paymentAudits = sqliteTable(
  "payment_audits",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id").notNull().unique(),
    protocol: text("protocol").notNull().default("x402-v2"),
    network: text("network").notNull(),
    asset: text("asset").notNull(),
    amountAtomic: text("amount_atomic").notNull(),
    payTo: text("pay_to").notNull(),
    settlementResponse: text("settlement_response").notNull(),
    status: text("status").notNull().default("settled"),
    payerAddress: text("payer_address"),
    transactionHash: text("transaction_hash"),
    facilitator: text("facilitator"),
    sourceKind: text("source_kind").notNull().default("external"),
    decisionStatus: text("decision_status"),
    receiptId: text("receipt_id"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("payment_audits_status_created_at_idx").on(table.status, table.createdAt),
    index("payment_audits_transaction_hash_idx").on(table.transactionHash),
  ],
);

export const paymentReservations = sqliteTable(
  "payment_reservations",
  {
    authorizationHash: text("authorization_hash").primaryKey(),
    product: text("product").notNull(),
    status: text("status").notNull().default("reserved"),
    reservedAt: integer("reserved_at", { mode: "timestamp" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("payment_reservations_expires_at_idx").on(table.expiresAt),
  ],
);

export const usageEvents = sqliteTable(
  "usage_events",
  {
    id: text("id").primaryKey(),
    eventName: text("event_name").notNull(),
    funnelStage: text("funnel_stage").notNull(),
    requestId: text("request_id"),
    subject: text("subject"),
    source: text("source"),
    medium: text("medium"),
    campaign: text("campaign"),
    referrer: text("referrer"),
    path: text("path"),
    metadataJson: text("metadata_json"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("usage_events_event_created_at_idx").on(table.eventName, table.createdAt),
    index("usage_events_stage_created_at_idx").on(table.funnelStage, table.createdAt),
    index("usage_events_request_id_idx").on(table.requestId),
  ],
);
