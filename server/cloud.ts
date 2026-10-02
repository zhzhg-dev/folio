import { CLOUD_LIMITS } from "../lib/folio/cloud-contract.ts";
import { restoreBackup } from "../lib/folio/backup-restore.ts";

type Row = {
  id: string;
  owner_id: string;
  name: string;
  bytes: number;
  sha256: string;
  state: string;
  created_at: number;
};
type Statement = {
  bind(...values: unknown[]): Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes?: number } }>;
};
export type CloudEnv = {
  DB?: { prepare(sql: string): Statement };
  BUCKET?: {
    put(key: string, value: ArrayBuffer, options?: unknown): Promise<unknown>;
    get(key: string): Promise<{ body: ReadableStream; size: number } | null>;
    delete(key: string): Promise<void>;
  };
};
class HttpError extends Error {
  status: number;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
  }
}
const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      Vary: "Cookie",
      "X-Content-Type-Options": "nosniff",
    },
  });
const objectKey = (id: string) => `backups/${id}.folio.json`;
const publicRow = (row: Row) => ({
  id: row.id,
  name: row.name,
  bytes: row.bytes,
  sha256: row.sha256,
  createdAt: row.created_at,
});
async function hash(bytes: ArrayBuffer) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
// Sites dispatch verifies identity and strips caller-supplied identity headers.
// Deploy this handler behind that boundary, never as a public standalone Worker.
async function identity(request: Request) {
  const id = request.headers.get("oai-authenticated-user-id");
  const email = request.headers.get("oai-authenticated-user-email");
  if (!id || !email) return null;
  let name = email;
  if (
    request.headers.get("oai-authenticated-user-full-name-encoding") ===
    "percent-encoded-utf-8"
  ) {
    try {
      name =
        decodeURIComponent(
          request.headers.get("oai-authenticated-user-full-name") || "",
        ) || email;
    } catch {
      /* display falls back to email */
    }
  }
  return {
    ownerId: id,
    account: {
      key: await hash(new TextEncoder().encode(id).buffer),
      name,
      email,
    },
  };
}
function bindings(env: CloudEnv) {
  if (!env.DB || !env.BUCKET) throw new HttpError(503, "unavailable");
  return { db: env.DB, bucket: env.BUCKET };
}
async function boundedBody(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json")
    throw new HttpError(415, "invalid_backup");
  const length = Number(request.headers.get("content-length") || 0);
  if (length > CLOUD_LIMITS.backupBytes) throw new HttpError(413, "too_large");
  if (!request.body) throw new HttpError(400, "invalid_backup");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => {});
  }, 30_000);
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (timedOut) throw new HttpError(408, "upload_timeout");
      if (done) break;
      size += value.byteLength;
      if (size > CLOUD_LIMITS.backupBytes) {
        await reader.cancel();
        throw new HttpError(413, "too_large");
      }
      chunks.push(value);
    }
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result.buffer;
}
async function removeRow(env: CloudEnv, owner: string, id: string) {
  const { db, bucket } = bindings(env);
  // Metadata remains until object deletion succeeds, so retries can finish cleanup.
  await bucket.delete(objectKey(id));
  await db
    .prepare("DELETE FROM cloud_backups WHERE id = ? AND owner_id = ?")
    .bind(id, owner)
    .run();
}
async function cleanup(env: CloudEnv, owner: string) {
  const { db } = bindings(env);
  const { results } = await db
    .prepare(
      "SELECT id FROM cloud_backups WHERE owner_id = ? AND (state = 'deleting' OR (state = 'uploading' AND created_at < ?)) LIMIT 20",
    )
    .bind(owner, Date.now() - 60 * 60 * 1000)
    .all<{ id: string }>();
  for (const row of results) await removeRow(env, owner, row.id);
}
export async function handleCloud(
  request: Request,
  env: CloudEnv,
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const user = await identity(request);
    if (url.pathname === "/api/cloud/session" && request.method === "GET") {
      return json({
        account: user?.account || null,
        available: !!(env.DB && env.BUCKET),
        limits: CLOUD_LIMITS,
        signIn: "/signin-with-chatgpt?return_to=%2F%3Faccount%3D1",
        signOut: "/signout-with-chatgpt?return_to=%2F",
      });
    }
    if (!user) throw new HttpError(401, "sign_in");
    if (request.headers.get("X-Folio-Account") !== user.account.key)
      throw new HttpError(409, "account_changed");
    if (
      request.headers.get("sec-fetch-site") === "cross-site" ||
      (request.headers.has("origin") &&
        request.headers.get("origin") !== url.origin)
    )
      throw new HttpError(403, "forbidden");
    const { db, bucket } = bindings(env);
    if (url.pathname === "/api/cloud/backups") {
      if (request.method === "GET") {
        await cleanup(env, user.ownerId);
        const { results } = await db
          .prepare(
            "SELECT * FROM cloud_backups WHERE owner_id = ? ORDER BY created_at DESC, id DESC",
          )
          .bind(user.ownerId)
          .all<Row>();
        return json({
          backups: results.filter((r) => r.state === "ready").map(publicRow),
          usedBytes: results.reduce((n, r) => n + r.bytes, 0),
          usedCount: results.length,
        });
      }
      if (request.method !== "POST")
        throw new HttpError(405, "method_not_allowed");
      const id = request.headers.get("X-Folio-Upload-Id") || "";
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          id,
        )
      )
        throw new HttpError(400, "invalid_request");
      const bytes = await boundedBody(request);
      let backup;
      try {
        backup = JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(bytes),
        );
      } catch {
        throw new HttpError(400, "invalid_backup");
      }
      if (
        backup?.format !== "folio-project" ||
        backup?.schemaVersion !== 1 ||
        typeof backup?.project?.name !== "string" ||
        !Array.isArray(backup.project.sources)
      )
        throw new HttpError(400, "invalid_backup");
      // Apply the same structure and original-file integrity checks as restore.
      // The validated copy is discarded; cloud storage retains the exact bytes.
      try {
        await restoreBackup(new File([bytes], "upload.folio.json"));
      } catch {
        throw new HttpError(400, "invalid_backup");
      }
      const name =
        backup.project.name.trim().slice(0, 120) || "Untitled project";
      const digest = await hash(bytes);
      const existing = await db
        .prepare("SELECT * FROM cloud_backups WHERE id = ? AND owner_id = ?")
        .bind(id, user.ownerId)
        .first<Row>();
      if (existing) {
        if (existing.state === "ready" && existing.sha256 === digest)
          return json({ backup: publicRow(existing) });
        throw new HttpError(409, "upload_in_progress");
      }
      await cleanup(env, user.ownerId);
      const now = Date.now();
      // One SQL statement atomically reserves both count and bytes under concurrent uploads.
      const inserted = await db
        .prepare(
          `INSERT INTO cloud_backups (id, owner_id, name, bytes, sha256, state, created_at)
        SELECT ?, ?, ?, ?, ?, 'uploading', ? WHERE
        (SELECT COUNT(*) FROM cloud_backups WHERE owner_id = ?) < ? AND
        (SELECT COALESCE(SUM(bytes), 0) FROM cloud_backups WHERE owner_id = ?) + ? <= ?
        ON CONFLICT(id) DO NOTHING`,
        )
        .bind(
          id,
          user.ownerId,
          name,
          bytes.byteLength,
          digest,
          now,
          user.ownerId,
          CLOUD_LIMITS.count,
          user.ownerId,
          bytes.byteLength,
          CLOUD_LIMITS.accountBytes,
        )
        .run();
      if (inserted.meta.changes !== 1)
        throw new HttpError(409, "quota_or_duplicate");
      try {
        await bucket.put(objectKey(id), bytes, {
          httpMetadata: { contentType: "application/json" },
          sha256: digest,
        });
        await db
          .prepare(
            "UPDATE cloud_backups SET state = 'ready' WHERE id = ? AND owner_id = ? AND state = 'uploading'",
          )
          .bind(id, user.ownerId)
          .run();
      } catch (error) {
        // Preserve an indeterminate commit. Never remove a possibly completed backup.
        // Pending entries stay counted and become eligible for cleanup after one hour.
        console.error("Cloud backup commit failed", { id });
        throw error;
      }
      return json(
        {
          backup: {
            id,
            name,
            bytes: bytes.byteLength,
            sha256: digest,
            createdAt: now,
          },
        },
        201,
      );
    }
    const match = /^\/api\/cloud\/backups\/([0-9a-f-]{36})$/i.exec(
      url.pathname,
    );
    if (!match) throw new HttpError(404, "not_found");
    const row = await db
      .prepare("SELECT * FROM cloud_backups WHERE id = ? AND owner_id = ?")
      .bind(match[1], user.ownerId)
      .first<Row>();
    if (!row || row.state === "uploading")
      throw new HttpError(404, "not_found");
    if (request.method === "DELETE") {
      await db
        .prepare(
          "UPDATE cloud_backups SET state = 'deleting' WHERE id = ? AND owner_id = ?",
        )
        .bind(row.id, user.ownerId)
        .run();
      await removeRow(env, user.ownerId, row.id);
      return json({ deleted: true });
    }
    if (request.method !== "GET" || row.state !== "ready")
      throw new HttpError(404, "not_found");
    const object = await bucket.get(objectKey(row.id));
    if (!object || object.size !== row.bytes)
      throw new HttpError(503, "backup_unavailable");
    return new Response(object.body, {
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(row.bytes),
        "Cache-Control": "private, no-store",
        Vary: "Cookie",
        "Content-Disposition": `attachment; filename="folio-${row.id}.folio.json"`,
        "X-Folio-SHA256": row.sha256,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof HttpError)
      return json({ error: error.message }, error.status);
    console.error("Cloud storage request failed");
    return json({ error: "unavailable" }, 503);
  }
}
