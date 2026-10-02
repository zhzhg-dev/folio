import { integer, sqliteTable, text, index } from "drizzle-orm/sqlite-core";

export const cloudBackups = sqliteTable(
  "cloud_backups",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    name: text("name").notNull(),
    bytes: integer("bytes").notNull(),
    sha256: text("sha256").notNull(),
    state: text("state", {
      enum: ["uploading", "ready", "deleting"],
    }).notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("idx_cloud_backups_owner_created").on(table.ownerId, table.createdAt),
  ],
);
