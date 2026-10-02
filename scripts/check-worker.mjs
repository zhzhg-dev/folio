import { Miniflare } from "miniflare";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
const worker = new Miniflare({
  modules: true,
  scriptPath: resolve("dist/server/index.js"),
  compatibilityDate: "2026-08-01",
  host: "127.0.0.1",
  port: 0,
  d1Databases: ["DB"],
  r2Buckets: ["BUCKET"],
  serviceBindings: { ASSETS: () => new Response("static-assets") },
});
try {
  const db = await worker.getD1Database("DB");
  const journal = JSON.parse(
    await readFile("drizzle/meta/_journal.json", "utf8"),
  );
  for (const { tag } of journal.entries) {
    const sql = await readFile(`drizzle/${tag}.sql`, "utf8");
    await db.batch(
      sql
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => db.prepare(s)),
    );
  }
  const url = "https://folio.test";
  assert.equal(await (await worker.dispatchFetch(url)).text(), "static-assets");
  const session = await (
    await worker.dispatchFetch(`${url}/api/cloud/session`)
  ).json();
  assert.equal(session.available, true);
  assert.equal(session.account, null);
  assert.equal(
    (await worker.dispatchFetch(`${url}/api/cloud/backups`)).status,
    401,
  );
  const owner = "worker-fixture";
  const headers = {
    "oai-authenticated-user-id": owner,
    "oai-authenticated-user-email": "worker@example.test",
    "X-Folio-Account": createHash("sha256").update(owner).digest("hex"),
    Origin: url,
  };
  const backup = {
    format: "folio-project",
    schemaVersion: 1,
    project: {
      id: "fixture",
      name: "Worker fixture",
      reportTitle: "Check",
      description: "",
      content: { type: "doc", content: [] },
      sources: [],
      snapshots: [],
      deliveries: [
        {
          id: "edition",
          title: "Fixed result",
          summary: "",
          language: "en",
          origin: "brief",
          createdAt: new Date().toISOString(),
          content: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Read-only delivery" }],
              },
            ],
          },
          references: [],
          checks: { missing: 0, updated: 0, unreviewed: 0 },
        },
      ],
      reviewHistory: [
        {
          id: "edit",
          title: "Previous finding",
          scope: "findings",
          createdAt: new Date().toISOString(),
          before: {
            id: "f",
            questionId: "q",
            value: "An earlier judgment",
            kind: "judgment",
            note: "",
            evidence: [],
          },
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  };
  const save = await worker.dispatchFetch(`${url}/api/cloud/backups`, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json",
      "X-Folio-Upload-Id": randomUUID(),
    },
    body: JSON.stringify(backup),
  });
  assert.equal(save.status, 201, await save.clone().text());
  const { backup: record } = await save.json();
  const get = await worker.dispatchFetch(
    `${url}/api/cloud/backups/${record.id}`,
    { headers },
  );
  assert.equal(get.status, 200);
  assert.deepEqual(await get.json(), backup);
  const malformed = structuredClone(backup);
  malformed.project.deliveries[0].content.content[0].content[0].marks = [{}];
  const invalid = await worker.dispatchFetch(`${url}/api/cloud/backups`, {
    method: "POST",
    headers: {
      ...headers,
      "Content-Type": "application/json",
      "X-Folio-Upload-Id": randomUUID(),
    },
    body: JSON.stringify(malformed),
  });
  assert.equal(invalid.status, 400);
  console.log(
    "Built Worker verified: fetch handler, assets, anonymous rejection, D1/R2 delivery/history round trip and malformed-edition rejection.",
  );
} finally {
  await worker.dispose();
}
