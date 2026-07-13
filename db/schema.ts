import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const leads = sqliteTable("leads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  company: text("company"),
  useCase: text("use_case"),
  plan: text("plan").notNull().default("builder"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});
