import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const leads = sqliteTable("leads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  company: text("company"),
  useCase: text("use_case"),
  plan: text("plan").notNull().default("builder"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const paymentAudits = sqliteTable("payment_audits", {
  id: text("id").primaryKey(),
  requestId: text("request_id").notNull().unique(),
  protocol: text("protocol").notNull().default("x402-v2"),
  network: text("network").notNull(),
  asset: text("asset").notNull(),
  amountAtomic: text("amount_atomic").notNull(),
  payTo: text("pay_to").notNull(),
  settlementResponse: text("settlement_response").notNull(),
  status: text("status").notNull().default("settled"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});
