import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { localCloud } from "../scripts/local-cloud.mjs";
import { handleCloud } from "../server/cloud.ts";
import { makeProject } from "../lib/folio/model.ts";
import { sourceFromText } from "../lib/folio/files.ts";
import { buildBackupBlob } from "../lib/folio/backup.ts";
import { restoreBackup } from "../lib/folio/backup-restore.ts";
import { CLOUD_LIMITS } from "../lib/folio/cloud-contract.ts";
let env;
test.before(async () => {
  env = await localCloud();
});
test.after(async () => {
  await env?.dispose();
});
const key = (user) => createHash("sha256").update(user).digest("hex");
function request(path, user, method = "GET", body, extra = {}) {
  return new Request(`https://folio.test/api/cloud/${path}`, {
    method,
    headers: {
      ...(user
        ? {
            "oai-authenticated-user-id": user,
            "oai-authenticated-user-email": `${user}@example.test`,
            "X-Folio-Account": key(user),
          }
        : {}),
      ...(body
        ? {
            "Content-Type": "application/json",
            "X-Folio-Upload-Id": randomUUID(),
          }
        : {}),
      Origin: "https://folio.test",
      ...extra,
    },
    body,
  });
}
const run = (path, user, method, body, headers, override = env) =>
  handleCloud(request(path, user, method, body, headers), override);
async function fixture() {
  const project = makeProject("Cloud test · 双语", "en");
  project.sources = [
    await sourceFromText("Original source", "Fictional evidence. 仅供测试。"),
  ];
  const version = project.sources[0].versions[0];
  project.content = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "citation",
            attrs: {
              sourceId: project.sources[0].id,
              versionId: version.id,
              page: 1,
              quote: version.text,
              label: "1",
            },
          },
        ],
      },
    ],
  };
  return { project, blob: await buildBackupBlob(project) };
}
test("anonymous sessions do not create accounts and cannot access cloud data", async () => {
  const session = await (await run("session")).json();
  assert.equal(session.account, null);
  assert.equal(session.available, true);
  for (const method of ["GET", "POST", "DELETE"])
    assert.equal((await run("backups", undefined, method)).status, 401);
  const degraded = await handleCloud(request("session"), {});
  assert.equal((await degraded.json()).available, false);
});
test("uploaded backup survives a new request, retains originals and citations, restores a separate project", async () => {
  const { project, blob } = await fixture();
  const upload = await run("backups", "alice", "POST", blob);
  assert.equal(upload.status, 201, await upload.clone().text());
  const { backup } = await upload.json();
  const listing = await (await run("backups", "alice")).json();
  assert.equal(listing.backups[0].id, backup.id);
  const downloaded = await run(`backups/${backup.id}`, "alice");
  assert.match(downloaded.headers.get("cache-control"), /no-store/);
  const raw = await downloaded.arrayBuffer();
  assert.equal(
    createHash("sha256").update(Buffer.from(raw)).digest("hex"),
    backup.sha256,
  );
  const restored = await restoreBackup(new File([raw], "test.folio.json"));
  assert.notEqual(restored.id, project.id);
  assert.deepEqual(restored.content, project.content);
  assert.equal(
    await restored.sources[0].versions[0].original.text(),
    "Fictional evidence. 仅供测试。",
  );
});
test("another account cannot list, fetch or delete an owner's backup", async () => {
  const { blob } = await fixture();
  const { backup } = await (await run("backups", "owner", "POST", blob)).json();
  const listing = await (await run("backups", "intruder")).json();
  assert.deepEqual(listing.backups, []);
  assert.equal((await run(`backups/${backup.id}`, "intruder")).status, 404);
  assert.equal(
    (await run(`backups/${backup.id}`, "intruder", "DELETE")).status,
    404,
  );
  assert.equal((await run(`backups/${backup.id}`, "owner")).status, 200);
});
test("changed accounts, cross-origin writes and malformed payloads are rejected", async () => {
  const { blob } = await fixture();
  assert.equal(
    (await run("backups", "a", "POST", blob, { "X-Folio-Account": key("b") }))
      .status,
    409,
  );
  assert.equal(
    (await run("backups", "a", "POST", blob, { Origin: "https://evil.test" }))
      .status,
    403,
  );
  assert.equal((await run("backups", "a", "POST", "{}")).status, 400);
  assert.equal(
    (await run("backups", "a", "POST", blob, { "Content-Type": "text/plain" }))
      .status,
    415,
  );
});
test("idempotent replay preserves one immutable backup and rejects different content", async () => {
  const { blob } = await fixture();
  const id = randomUUID();
  const headers = { "X-Folio-Upload-Id": id };
  assert.equal(
    (await run("backups", "retry", "POST", blob, headers)).status,
    201,
  );
  assert.equal(
    (await run("backups", "retry", "POST", blob, headers)).status,
    200,
  );
  const other = await fixture();
  assert.equal(
    (await run("backups", "retry", "POST", other.blob, headers)).status,
    409,
  );
  assert.equal(
    (await (await run("backups", "retry")).json()).backups.length,
    1,
  );
});
test("actual body size is bounded even without Content-Length", async () => {
  assert.equal(
    (
      await run(
        "backups",
        "large",
        "POST",
        new Blob([new Uint8Array(CLOUD_LIMITS.backupBytes + 1)]),
      )
    ).status,
    413,
  );
});
test("unrestorable documents and damaged original files cannot be saved as valid backups", async () => {
  const malformed = JSON.stringify({
    format: "folio-project",
    schemaVersion: 1,
    project: { name: "broken", sources: [] },
  });
  assert.equal(
    (await run("backups", "invalid", "POST", malformed)).status,
    400,
  );
  const { blob } = await fixture();
  const data = JSON.parse(await blob.text());
  data.project.sources[0].versions[0].originalBase64 = btoa("tampered");
  assert.equal(
    (await run("backups", "invalid", "POST", JSON.stringify(data))).status,
    400,
  );
  assert.equal((await (await run("backups", "invalid")).json()).usedCount, 0);
});
test("byte quota includes pending uploads without exceeding the account budget", async () => {
  await env.DB.prepare(
    "INSERT INTO cloud_backups (id,owner_id,name,bytes,sha256,state,created_at) VALUES (?,?,?,?,?,'uploading',?)",
  )
    .bind(
      randomUUID(),
      "byte-quota",
      "pending",
      CLOUD_LIMITS.accountBytes - 1,
      "0".repeat(64),
      Date.now(),
    )
    .run();
  const { blob } = await fixture();
  assert.equal((await run("backups", "byte-quota", "POST", blob)).status, 409);
  assert.equal(
    (await (await run("backups", "byte-quota")).json()).usedCount,
    1,
  );
});
test("concurrent uploads reserve account quota atomically", async () => {
  const { blob } = await fixture();
  const responses = await Promise.all(
    Array.from({ length: CLOUD_LIMITS.count + 3 }, () =>
      run("backups", "quota", "POST", blob),
    ),
  );
  assert.equal(
    responses.filter((r) => r.status === 201).length,
    CLOUD_LIMITS.count,
  );
  assert.equal(responses.filter((r) => r.status === 409).length, 3);
  const list = await (await run("backups", "quota")).json();
  assert.equal(list.usedCount, CLOUD_LIMITS.count);
  assert.equal(list.usedBytes, blob.size * CLOUD_LIMITS.count);
  const id = list.backups[0].id;
  assert.equal((await run(`backups/${id}`, "quota", "DELETE")).status, 200);
  assert.equal((await run(`backups/${id}`, "quota")).status, 404);
  assert.equal(await env.BUCKET.get(`backups/${id}.folio.json`), null);
  assert.equal((await run("backups", "quota", "POST", blob)).status, 201);
});
test("object write failure retains bounded pending metadata and recovers stale reservation", async () => {
  const { blob } = await fixture();
  const id = randomUUID();
  const broken = {
    DB: env.DB,
    BUCKET: {
      put: async () => {
        throw new Error("Injected outage");
      },
    },
  };
  assert.equal(
    (
      await run(
        "backups",
        "outage",
        "POST",
        blob,
        { "X-Folio-Upload-Id": id },
        broken,
      )
    ).status,
    503,
  );
  let list = await (await run("backups", "outage")).json();
  assert.equal(list.backups.length, 0);
  assert.equal(list.usedCount, 1);
  await env.DB.prepare("UPDATE cloud_backups SET created_at = ? WHERE id = ?")
    .bind(Date.now() - 61 * 60 * 1000, id)
    .run();
  list = await (await run("backups", "outage")).json();
  assert.equal(list.usedCount, 0);
  assert.equal((await run("backups", "outage", "POST", blob)).status, 201);
});
test("failed object deletion remains recoverable without exposing a broken backup", async () => {
  const { blob } = await fixture();
  const { backup } = await (
    await run("backups", "delete-failure", "POST", blob)
  ).json();
  const broken = {
    DB: env.DB,
    BUCKET: {
      delete: async () => {
        throw new Error("Injected outage");
      },
    },
  };
  assert.equal(
    (
      await run(
        `backups/${backup.id}`,
        "delete-failure",
        "DELETE",
        undefined,
        {},
        broken,
      )
    ).status,
    503,
  );
  assert.equal(
    (await run(`backups/${backup.id}`, "delete-failure")).status,
    404,
  );
  const library = await (await run("backups", "delete-failure")).json();
  assert.equal(library.usedCount, 0);
  assert.equal(await env.BUCKET.get(`backups/${backup.id}.folio.json`), null);
});
