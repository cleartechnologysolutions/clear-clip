import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const clips = sqliteTable("clips", {
  slug: text("slug").primaryKey(),
  content: text("content").notNull().default(""),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
