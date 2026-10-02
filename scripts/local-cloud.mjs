import { Miniflare } from "miniflare";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// Development/test only. The deployed Worker contains no identity mocks.
export async function localCloud(persist = false) {
  const mf = new Miniflare({
    modules: true,
    script:
      "export default { fetch() { return new Response('Local storage runtime', {status:404}); } };",
    compatibilityDate: "2026-08-01",
    host: "127.0.0.1",
    port: 0,
    d1Databases: ["DB"],
    r2Buckets: ["BUCKET"],
    d1Persist: persist ? resolve(".wrangler/cloud/d1") : false,
    r2Persist: persist ? resolve(".wrangler/cloud/r2") : false,
  });
  try {
    const DB = await mf.getD1Database("DB");
    const BUCKET = await mf.getR2Bucket("BUCKET");
    await DB.prepare(
      "CREATE TABLE IF NOT EXISTS folio_local_migrations (tag TEXT PRIMARY KEY)",
    ).run();
    const journal = JSON.parse(
      await readFile(resolve("drizzle/meta/_journal.json"), "utf8"),
    );
    for (const { tag } of journal.entries) {
      if (
        await DB.prepare("SELECT tag FROM folio_local_migrations WHERE tag = ?")
          .bind(tag)
          .first()
      )
        continue;
      const sql = await readFile(resolve(`drizzle/${tag}.sql`), "utf8");
      const statements = sql
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => DB.prepare(s));
      await DB.batch([
        ...statements,
        DB.prepare("INSERT INTO folio_local_migrations(tag) VALUES (?)").bind(
          tag,
        ),
      ]);
    }
    return { DB, BUCKET, dispose: () => mf.dispose() };
  } catch (error) {
    await mf.dispose();
    throw error;
  }
}
