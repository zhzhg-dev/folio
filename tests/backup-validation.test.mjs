import test from "node:test";
import assert from "node:assert/strict";
import { makeProject } from "../lib/folio/model.ts";
import { buildBackupBlob } from "../lib/folio/backup.ts";
import { restoreBackup } from "../lib/folio/backup-restore.ts";
import { hashBytes } from "../lib/folio/file-hash.ts";

const savedAt = "2026-09-25T10:30:00.000Z";
async function fixture() {
  const project = makeProject("Evidence archive · 原文", "en");
  project.createdAt = savedAt;
  project.updatedAt = "2026-09-26T10:30:00.000Z";
  const text = "Original evidence. 中文内容。";
  const bytes = new TextEncoder().encode(text);
  project.sources = [
    {
      id: "source-1",
      name: "Evidence",
      kind: "txt",
      color: "blue",
      versions: [
        {
          id: "version-1",
          text,
          pages: [{ page: 1, text }],
          createdAt: savedAt,
          hash: await hashBytes(bytes.buffer),
          size: bytes.length,
          original: new Blob([bytes]),
          fileName: "evidence.txt",
          kind: "txt",
        },
      ],
    },
  ];
  project.content = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "A retained claim. " },
          {
            type: "citation",
            attrs: {
              sourceId: "source-1",
              versionId: "version-1",
              page: 1,
              label: "1",
              quote: text,
            },
          },
        ],
      },
    ],
  };
  project.snapshots = [
    {
      id: "snapshot-1",
      title: "First draft",
      reportTitle: project.reportTitle,
      content: structuredClone(project.content),
      createdAt: savedAt,
    },
  ];
  return {
    project,
    payload: JSON.parse(await (await buildBackupBlob(project)).text()),
  };
}
const restore = (payload) =>
  restoreBackup(new File([JSON.stringify(payload)], "validation.folio.json"));
const version = (payload) => payload.project.sources[0].versions[0];

test("modern backups retain originals, snapshots, citation identity and extension data", async () => {
  const { project, payload } = await fixture();
  payload.project.extension = { retained: "Project metadata" };
  payload.project.sources[0].extension = { retained: "Source metadata" };
  version(payload).extension = { retained: "Version metadata" };
  const restored = await restore(payload);
  assert.notEqual(restored.id, project.id);
  assert.deepEqual(restored.content, project.content);
  assert.deepEqual(restored.snapshots, project.snapshots);
  assert.equal(restored.sources[0].id, "source-1");
  assert.equal(restored.sources[0].versions[0].id, "version-1");
  assert.equal(
    await restored.sources[0].versions[0].original.text(),
    project.sources[0].versions[0].text,
  );
  assert.deepEqual(restored.extension, payload.project.extension);
  assert.deepEqual(
    restored.sources[0].extension,
    payload.project.sources[0].extension,
  );
  assert.deepEqual(
    restored.sources[0].versions[0].extension,
    version(payload).extension,
  );
  assert.equal(restored.createdAt, savedAt);
});

test("missing legacy metadata is derived without dropping text, versions or snapshots", async () => {
  const { payload } = await fixture();
  const expectedContent = structuredClone(payload.project.content);
  delete payload.project.reportTitle;
  delete payload.project.description;
  delete payload.project.createdAt;
  delete payload.project.sources[0].kind;
  delete payload.project.sources[0].color;
  const v = version(payload);
  v.fileName = "evidence.MARKDOWN";
  delete v.kind;
  delete v.text;
  delete v.createdAt;
  delete v.size;
  const snapshot = payload.project.snapshots[0];
  delete snapshot.id;
  delete snapshot.title;
  delete snapshot.reportTitle;
  delete snapshot.createdAt;
  const restored = await restore(payload);
  const source = restored.sources[0],
    current = source.versions[0];
  assert.equal(restored.reportTitle, payload.project.name);
  assert.equal(restored.description, "");
  assert.equal(restored.createdAt, payload.project.updatedAt);
  assert.equal(source.kind, "md");
  assert.equal(source.color, "green");
  assert.equal(current.kind, "md");
  assert.equal(current.text, v.pages[0].text);
  assert.equal(current.size, current.original.size);
  assert.equal(current.createdAt, payload.project.updatedAt);
  assert.equal(restored.snapshots.length, 1);
  assert.ok(restored.snapshots[0].id);
  assert.equal(restored.snapshots[0].title, payload.project.name);
  assert.equal(restored.snapshots[0].reportTitle, payload.project.name);
  assert.deepEqual(restored.snapshots[0].content, expectedContent);
  assert.deepEqual(restored.content, expectedContent);
});

test("source and per-version types are inferred independently for mixed historical originals", async () => {
  const { payload } = await fixture();
  const first = version(payload);
  first.kind = "pdf";
  first.fileName = "original.pdf";
  payload.project.sources[0].versions.push({
    ...structuredClone(first),
    id: "version-2",
    kind: "md",
    fileName: "new.md",
  });
  delete payload.project.sources[0].kind;
  const restored = await restore(payload);
  assert.equal(restored.sources[0].kind, "md");
  assert.deepEqual(
    restored.sources[0].versions.map((v) => v.id),
    ["version-1", "version-2"],
  );
  assert.deepEqual(
    restored.sources[0].versions.map((v) => v.kind),
    ["pdf", "md"],
  );
  assert.deepEqual(
    restored.sources[0].versions.map((v) => v.original.type),
    ["application/pdf", "text/plain"],
  );
  assert.deepEqual(restored.content, payload.project.content);
  const secondRound = await restoreBackup(
    new File([await buildBackupBlob(restored)], "mixed.folio.json"),
  );
  assert.deepEqual(
    secondRound.sources[0].versions.map((v) => v.kind),
    ["pdf", "md"],
  );
  assert.equal(
    await secondRound.sources[0].versions[0].original.text(),
    first.text,
  );
});

test("old versions inherit a known source type; text-only sources remain readable without type metadata", async () => {
  const { payload } = await fixture();
  payload.project.sources[0].kind = "pdf";
  delete version(payload).kind;
  delete version(payload).fileName;
  const inherited = await restore(payload);
  assert.equal(inherited.sources[0].versions[0].kind, "pdf");
  assert.equal(
    inherited.sources[0].versions[0].original.type,
    "application/pdf",
  );

  delete payload.project.sources[0].kind;
  delete version(payload).originalBase64;
  delete version(payload).size;
  delete version(payload).hash;
  const textOnly = await restore(payload);
  assert.equal(textOnly.sources[0].kind.toUpperCase(), "TXT");
  assert.equal(textOnly.sources[0].versions[0].kind.toUpperCase(), "TXT");
  assert.equal(textOnly.sources[0].versions[0].original, undefined);
  assert.equal(
    textOnly.sources[0].versions[0].size,
    new TextEncoder().encode(version(payload).text).length,
  );
  assert.match(textOnly.sources[0].versions[0].hash, /^[a-f0-9]{64}$/);
});

test("explicit invalid types and unknowable original types are rejected before restoration", async () => {
  const { payload } = await fixture();
  for (const invalid of [null, {}, [], 1, "", "docx"]) {
    const badSource = structuredClone(payload);
    badSource.project.sources[0].kind = invalid;
    await assert.rejects(() => restore(badSource), /Invalid source/);
    const badVersion = structuredClone(payload);
    version(badVersion).kind = invalid;
    await assert.rejects(() => restore(badVersion), /Invalid version/);
  }
  delete payload.project.sources[0].kind;
  delete version(payload).kind;
  delete version(payload).fileName;
  await assert.rejects(
    () => restore(payload),
    /Cannot determine original file type/,
  );
  payload.project.sources[0].name = "pdf";
  await assert.rejects(
    () => restore(payload),
    /Cannot determine original file type/,
  );
});

test("malformed runtime metadata cannot enter the restored workspace", async () => {
  const { payload } = await fixture();
  const cases = [
    (p) => {
      p.project.reportTitle = {};
    },
    (p) => {
      p.project.description = [];
    },
    (p) => {
      p.project.createdAt = "not a date";
    },
    (p) => {
      p.project.updatedAt = null;
    },
    (p) => {
      p.project.lastView = {};
    },
    (p) => {
      p.project.favorite = "yes";
    },
    (p) => {
      p.project.sources[0].id = "";
    },
    (p) => {
      p.project.sources[0].name = {};
    },
    (p) => {
      p.project.sources[0].color = {};
    },
    (p) => {
      version(p).id = "";
    },
    (p) => {
      version(p).fileName = {};
    },
    (p) => {
      version(p).size = "20";
    },
    (p) => {
      version(p).size = -1;
    },
    (p) => {
      version(p).size = 1.5;
    },
    (p) => {
      version(p).hash = {};
    },
    (p) => {
      version(p).createdAt = [];
    },
    (p) => {
      p.project.snapshots[0].id = {};
    },
    (p) => {
      p.project.snapshots[0].title = {};
    },
    (p) => {
      p.project.snapshots[0].reportTitle = 42;
    },
    (p) => {
      p.project.snapshots[0].createdAt = "unknown";
    },
    (p) => {
      p.project.snapshots.push(structuredClone(p.project.snapshots[0]));
    },
  ];
  for (const mutate of cases) {
    const bad = structuredClone(payload);
    mutate(bad);
    await assert.rejects(() => restore(bad), undefined, mutate.toString());
  }
});

test("ambiguous page sequences are rejected instead of silently renumbering citations", async () => {
  const { payload } = await fixture();
  for (const pageNumbers of [[1, 1], [1, 3], [2, 1], [0], ["1"]]) {
    const bad = structuredClone(payload);
    version(bad).pages = pageNumbers.map((page) => ({
      page,
      text: "Kept passage",
    }));
    await assert.rejects(() => restore(bad), /Invalid version/);
    assert.deepEqual(
      version(bad).pages.map((page) => page.page),
      pageNumbers,
    );
  }
});

test("original bytes require a checksum, valid base64, and consistent size; raw JSON originals are rejected", async () => {
  const { payload } = await fixture();
  const missingHash = structuredClone(payload);
  delete version(missingHash).hash;
  await assert.rejects(() => restore(missingHash), /checksum/);
  const wrongSize = structuredClone(payload);
  version(wrongSize).size++;
  await assert.rejects(() => restore(wrongSize), /file size/);
  for (const invalid of [null, false, 0, {}, "!invalid!", "A==="]) {
    const bad = structuredClone(payload);
    version(bad).originalBase64 = invalid;
    await assert.rejects(() => restore(bad), /Invalid or oversized original/);
  }
  for (const invalid of [null, false, { size: 20 }]) {
    const bad = structuredClone(payload);
    version(bad).original = invalid;
    await assert.rejects(() => restore(bad), /Invalid version/);
  }
});

test("an explicitly empty original is preserved and checked rather than silently discarded", async () => {
  const { payload } = await fixture();
  version(payload).originalBase64 = "";
  version(payload).hash = await hashBytes(new ArrayBuffer(0));
  version(payload).size = 0;
  const restored = await restore(payload);
  assert.ok(restored.sources[0].versions[0].original instanceof Blob);
  assert.equal(restored.sources[0].versions[0].original.size, 0);
  version(payload).hash = "wrong";
  await assert.rejects(() => restore(payload), /checksum/);
});

test("only absent dates fall back to the restoration time, and missing source type can use a filename", async () => {
  const { payload } = await fixture();
  delete payload.project.createdAt;
  delete payload.project.updatedAt;
  delete payload.project.sources[0].kind;
  payload.project.sources[0].name = "Evidence.pdf";
  delete version(payload).kind;
  delete version(payload).fileName;
  const before = Date.now();
  const restored = await restore(payload);
  assert.ok(Date.parse(restored.createdAt) >= before);
  assert.ok(Date.parse(restored.createdAt) <= Date.now());
  assert.equal(restored.sources[0].kind, "pdf");
  assert.equal(restored.sources[0].versions[0].createdAt, savedAt);
});
