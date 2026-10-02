import test from "node:test";
import assert from "node:assert/strict";
import { notebookExample } from "../lib/folio/notebook.ts";
import {
  createDelivery,
  deliveryHtml,
  deliveryMarkdown,
  validDelivery,
  validDeliveries,
  headingLevel,
} from "../lib/folio/delivery.ts";
import { citationStatus, countChanges } from "../lib/folio/integrity.ts";
import {
  projectReview,
  citationTargets,
  replaceCitation,
  validReviewHistory,
} from "../lib/folio/review.ts";
import { buildBackupBlob } from "../lib/folio/backup.ts";
import { restoreBackup } from "../lib/folio/backup-restore.ts";

const options = (p, extra = {}) => ({
  title: "Research delivery",
  summary: "A clear decision",
  origin: "findings",
  findingIds: p.notebook.findings.map((f) => f.id),
  includeNotes: false,
  ...extra,
});
const citation = (e) => ({
  type: "citation",
  attrs: {
    sourceId: e.sourceId,
    versionId: e.versionId,
    page: e.page,
    quote: e.quote,
    label: e.label,
  },
});
const brief = (p) => {
  const e = p.notebook.findings[0].evidence[0];
  p.content = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "A supported claim." },
          citation(e),
          citation(e),
        ],
      },
    ],
  };
  return e;
};

test("review spans questions and independent comparison/brief snapshots, without legacy projection duplicates", () => {
  const p = notebookExample("en");
  brief(p);
  const source = p.sources[0];
  source.versions.push({
    ...structuredClone(source.versions[0]),
    id: "revision2",
    text: "Changed completely",
    pages: [{ page: 1, text: "Changed completely" }],
  });
  const queue = projectReview(p);
  const impacted = queue.filter((i) => i.sourceIds.includes(source.id));
  assert.ok(impacted.some((i) => i.scope === "findings"));
  assert.ok(impacted.some((i) => i.scope === "brief"));
  assert.equal(
    new Set(impacted.filter((i) => i.scope === "findings").map((i) => i.title))
      .size,
    3,
  );
  assert.ok(
    queue
      .filter((i) => !i.sourceIds.includes(source.id))
      .every((i) => !["changed", "older"].includes(i.status)),
  );
  delete p.notebook;
  assert.ok(projectReview(p).every((i) => i.scope !== "findings"));
});

test("citation verification uses the exact original page; unchanged moved passages still require review", () => {
  const p = notebookExample("en"),
    e = brief(p),
    source = p.sources[0];
  assert.equal(citationStatus({ ...e, page: 999 }, p), "missing");
  source.versions.push({
    ...source.versions[0],
    id: "v2",
    pages: [{ page: 2, text: e.quote }],
  });
  assert.equal(citationStatus(e, p), "older");
  assert.equal(countChanges(p), 2);
  assert.ok(
    projectReview(p).some((i) => i.scope === "brief" && i.status === "older"),
  );
});

test("replacement selects an exact duplicate occurrence and refuses a changed document", () => {
  const p = notebookExample("en"),
    e = brief(p),
    before = JSON.stringify(p.content);
  const target = citationTargets(p.content)[1];
  const next = replaceCitation(p.content, target, { ...e, versionId: "v2" });
  assert.equal(next.content[0].content[1].attrs.versionId, e.versionId);
  assert.equal(next.content[0].content[2].attrs.versionId, "v2");
  assert.equal(JSON.stringify(p.content), before);
  p.content.content[0].content.unshift({
    type: "text",
    text: "Moved duplicate",
  });
  assert.equal(replaceCitation(p.content, target, e), null);
});

test("delivery freezes selected content and references without raw files, unrelated sources or private notes", () => {
  const p = notebookExample("en");
  p.notebook.findings[0].note = "PRIVATE-NOTE-DO-NOT-SHARE";
  p.sources[2].versions[0].text += "UNRELATED-PRIVATE-SOURCE";
  p.research = {
    question: "PRIVATE-QUESTION",
    turns: [],
    selectedSourceIds: [],
    mode: "passages",
  };
  const d = createDelivery(
    p,
    "en",
    options(p, { findingIds: [p.notebook.findings[0].id] }),
  );
  const html = deliveryHtml(d),
    json = JSON.stringify(d);
  assert.ok(
    !/PRIVATE|originalBase64|original|research/.test(
      json.replaceAll("Research", ""),
    ),
  );
  assert.ok(!html.includes("PRIVATE"));
  assert.equal(d.references.length, 1);
  p.notebook.findings[0].value = "Changed finding";
  p.sources[0].name = "Renamed source";
  p.sources[0].versions[0].pages[0].text = "Changed source";
  assert.equal(deliveryHtml(d), html);
  assert.equal(JSON.stringify(d), json);
  assert.equal(d.checks.unreviewed, 1);
});

test("personal notes appear only after explicit inclusion", () => {
  const p = notebookExample("zh");
  p.notebook.findings[0].note = "PRIVATE-NOTE";
  const opts = options(p, { findingIds: [p.notebook.findings[0].id] });
  assert.ok(
    !deliveryHtml(createDelivery(p, "zh", opts)).includes("PRIVATE-NOTE"),
  );
  const d = createDelivery(p, "zh", { ...opts, includeNotes: true });
  assert.ok(deliveryHtml(d).includes("PRIVATE-NOTE"));
  assert.ok(deliveryMarkdown(d).includes("引用原文"));
});

test("brief delivery retains unresolved citations, renumbers duplicates and exposes warnings", () => {
  const p = notebookExample("en");
  brief(p);
  p.content.content[0].content.push({
    type: "citation",
    attrs: {
      sourceId: "absent",
      versionId: "none",
      quote: "Unverified quote",
      page: 999,
      label: "1",
    },
  });
  const d = createDelivery(p, "en", options(p, { origin: "brief" }));
  assert.equal(d.references.length, 2);
  assert.equal(d.checks.missing, 1);
  const html = deliveryHtml(d);
  assert.match(html, /1 unresolved citations/);
  assert.match(html, /Citation could not be verified/);
  assert.equal((html.match(/href="#source-1"/g) || []).length, 2);
  assert.match(html, /Unverified quote/);
});

test("invalid selected evidence is rejected instead of silently excluded", () => {
  const p = notebookExample("en");
  p.notebook.findings[0].evidence[0].page = 999;
  assert.throws(() => createDelivery(p, "en", options(p)), /Could not verify/);
});

test("HTML whitelists headings and marks, escapes all authored fields and disallows remote resources", () => {
  const p = notebookExample("en"),
    e = brief(p);
  p.sources[0].name = '<img src=x onerror="alert(1)">';
  p.content.content.push({
    type: "heading",
    attrs: { level: '2 onclick="alert(1)"' },
    content: [
      {
        type: "text",
        text: "</script><img src=x>",
        marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
      },
    ],
  });
  const d = createDelivery(
    p,
    "en",
    options(p, {
      origin: "brief",
      title: "<script>alert(1)</script>",
      summary: '<iframe src="https://bad.test">',
    }),
  );
  const html = deliveryHtml(d);
  assert.ok(!/<script|<img|<iframe|javascript:|<h2 onclick/.test(html));
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /default-src 'none'/);
  assert.equal(headingLevel('2 onclick="alert(1)"'), 2);
  assert.equal(d.content.content.at(-1).attrs.level, 2);
  assert.ok(!JSON.stringify(d.content).includes("javascript:"));
});

test("size limits and malformed/mismatched snapshot data fail validation", () => {
  const p = notebookExample("en"),
    d = createDelivery(p, "en", options(p));
  assert.equal(validDelivery(d), true);
  assert.equal(
    validDeliveries(
      Array.from({ length: 11 }, (_, i) => ({ ...d, id: String(i) })),
    ),
    false,
  );
  assert.equal(validDeliveries([d, d]), false);
  assert.equal(validDelivery({ ...d, title: "x".repeat(201) }), false);
  const bad = structuredClone(d);
  bad.references[0].quote = "Different passage";
  assert.equal(validDelivery(bad), false);
  assert.equal(
    validDelivery({
      ...d,
      content: {
        type: "doc",
        content: [{ type: "text", text: "x".repeat(1024 * 1024) }],
      },
    }),
    false,
  );
});

test("backups preserve frozen editions and bounded review history; malformed additions are rejected", async () => {
  const p = notebookExample("en");
  p.deliveries = [createDelivery(p, "en", options(p))];
  p.reviewHistory = [
    {
      id: "r1",
      title: "Before review",
      scope: "findings",
      before: structuredClone(p.notebook.findings[0]),
      createdAt: new Date().toISOString(),
    },
  ];
  assert.equal(validReviewHistory(p.reviewHistory), true);
  const blob = await buildBackupBlob(p),
    restored = await restoreBackup(new File([blob], "project.json"));
  assert.deepEqual(restored.deliveries, p.deliveries);
  assert.deepEqual(restored.reviewHistory, p.reviewHistory);
  const bad = JSON.parse(await blob.text());
  bad.project.deliveries[0].checks.missing = 99;
  await assert.rejects(
    () => restoreBackup(new File([JSON.stringify(bad)], "bad.json")),
    /Invalid delivery/,
  );
  assert.equal(
    validReviewHistory([{ ...p.reviewHistory[0], before: { value: 12 } }]),
    false,
  );
  for (const marks of [{}, [null], [{ type: "script" }]]) {
    const malformed = JSON.parse(await blob.text());
    malformed.project.deliveries[0].content.content[0].content[0].marks = marks;
    assert.equal(validDelivery(malformed.project.deliveries[0]), false);
    await assert.rejects(
      () => restoreBackup(new File([JSON.stringify(malformed)], "marks.json")),
      /Invalid delivery/,
    );
  }
});

test("copied delivery keeps table cell boundaries, headings, lists and warning labels", () => {
  const p = notebookExample("en");
  const cell = (type, value) => ({
    type,
    content: [{ type: "paragraph", content: [{ type: "text", text: value }] }],
  });
  p.content = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Comparison" }],
      },
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [cell("tableHeader", "Tool"), cell("tableHeader", "Cost")],
          },
          {
            type: "tableRow",
            content: [cell("tableCell", "Harbor"), cell("tableCell", "$90")],
          },
        ],
      },
    ],
  };
  const markdown = deliveryMarkdown(
    createDelivery(p, "en", options(p, { origin: "brief" })),
  );
  assert.match(markdown, /## Comparison/);
  assert.match(markdown, /\| Tool \| Cost \|/);
  assert.match(markdown, /\| Harbor \| \$90 \|/);
  assert.match(markdown, /At preparation: 0 unresolved citations/);
});
