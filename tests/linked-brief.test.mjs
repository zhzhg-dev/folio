import test from "node:test";
import assert from "node:assert/strict";
import { unzipSync, strFromU8 } from "fflate";
import { notebookExample } from "../lib/folio/notebook.ts";
import {
  insertLinkedFinding,
  insertLinkedComparison,
  linkedBriefItems,
  updateLinkedBrief,
  unlinkBriefBlock,
} from "../lib/folio/linked-brief.ts";
import {
  validateDocument,
  containsConclusionLinks,
} from "../lib/folio/integrity.ts";
import { markdown, exportHtml, exportWord } from "../lib/folio/files.ts";
import {
  createDelivery,
  deliveryHtml,
  deliveryMarkdown,
  validDelivery,
} from "../lib/folio/delivery.ts";
import { buildBackupBlob } from "../lib/folio/backup.ts";
import { restoreBackup } from "../lib/folio/backup-restore.ts";
import {
  connectComparisonFindings,
  applyConclusionChanges,
} from "../lib/folio/conclusions.ts";
import { archiveFinding } from "../lib/folio/notebook-actions.ts";

function fixture() {
  const project = notebookExample("en");
  const id = project.notebook.findings[0].id;
  const insertion = insertLinkedFinding(project, id, "en");
  project.content = insertion.content;
  return { project, id, blockId: insertion.blockId };
}
const lastBlock = (project) =>
  project.content.content
    .filter((node) => node.type === "conclusionBlock")
    .at(-1);
const deliveryOptions = (project) => ({
  title: "A fixed decision",
  summary: "",
  origin: "brief",
  findingIds: [],
  includeNotes: false,
});

test("finding insertion links a stable origin and repeat insertion preserves existing writing", () => {
  const { project, id, blockId } = fixture();
  assert.equal(validateDocument(project.content), true);
  assert.equal(project.content.content.at(-1).type, "paragraph");
  const [item] = linkedBriefItems(project);
  assert.equal(item.status, "current");
  assert.equal(item.edited, false);
  assert.equal(item.findingId, id);
  assert.equal(item.id, blockId);
  lastBlock(project).content[1].content[0].text += " My qualification.";
  const repeated = insertLinkedFinding(project, id, "zh");
  assert.equal(repeated.inserted, false);
  assert.equal(repeated.blockId, blockId);
  assert.equal(repeated.content, project.content);
  assert.match(JSON.stringify(repeated.content), /My qualification/);
});

test("changed reasoning and notes are detected even when original evidence stays identical", () => {
  const { project } = fixture();
  const original = JSON.stringify(project.content);
  const quote = project.notebook.findings[0].evidence[0].quote;
  project.notebook.findings[0].value =
    "The annual plan now needs a billing check.";
  project.notebook.findings[0].note =
    "Ask whether annual prepayment is acceptable.";
  const [item] = linkedBriefItems(project);
  assert.equal(item.status, "updated");
  assert.equal(item.edited, false);
  assert.equal(project.notebook.findings[0].evidence[0].quote, quote);
  assert.equal(JSON.stringify(project.content), original);
  const next = updateLinkedBrief(project, item);
  assert.equal(lastBlock({ content: next }).attrs.id, item.id);
  assert.match(markdown(next), /annual prepayment/);
  assert.equal(JSON.stringify(project.content), original);
  assert.equal(
    linkedBriefItems({ ...project, content: next })[0].status,
    "current",
  );
});

test("manual writing is preserved until replacement is explicitly confirmed, and unlink keeps text", () => {
  const { project } = fixture();
  lastBlock(project).content[1].content[0].text =
    "My own client-specific recommendation.";
  const [item] = linkedBriefItems(project);
  assert.equal(item.edited, true);
  assert.throws(() => updateLinkedBrief(project, item), /Confirm replacement/);
  const independent = unlinkBriefBlock(project.content, item);
  assert.match(markdown(independent), /client-specific recommendation/);
  assert.equal(containsConclusionLinks(independent), false);
  const updated = updateLinkedBrief(project, item, { replaceEdited: true });
  assert.doesNotMatch(markdown(updated), /client-specific recommendation/);
  assert.equal(
    lastBlock(project).content[1].content[0].text,
    "My own client-specific recommendation.",
  );
});

test("preview actions reject changed documents and changed upstream conclusions", () => {
  const { project } = fixture();
  project.notebook.findings[0].value = "First revised recommendation";
  const [target] = linkedBriefItems(project);
  project.notebook.findings[0].value = "A newer recommendation after preview";
  assert.throws(() => updateLinkedBrief(project, target), /changed again/);
  const [fresh] = linkedBriefItems(project);
  project.content.content.unshift({
    type: "paragraph",
    content: [{ type: "text", text: "Unrelated authored introduction" }],
  });
  assert.throws(() => updateLinkedBrief(project, fresh), /brief changed/);
  assert.throws(
    () => unlinkBriefBlock(project.content, fresh),
    /brief changed/,
  );
});

test("archived or missing findings leave the brief intact and can be made independent", () => {
  const { project, id } = fixture();
  const before = JSON.stringify(project.content);
  const finding = project.notebook.findings.shift();
  project.notebook.archived = [
    {
      id: "archive",
      kind: "finding",
      archivedAt: new Date().toISOString(),
      question: project.notebook.questions.find(
        (q) => q.id === finding.questionId,
      ),
      findings: [finding],
    },
  ];
  const [archived] = linkedBriefItems(project);
  assert.equal(archived.status, "archived");
  assert.equal(archived.candidate, undefined);
  assert.equal(archived.findingId, id);
  assert.throws(
    () => updateLinkedBrief(project, archived),
    /Restore the finding/,
  );
  delete project.notebook.archived;
  const [missing] = linkedBriefItems(project);
  assert.equal(missing.status, "missing");
  assert.match(
    markdown(unlinkBriefBlock(project.content, missing)),
    /Harbor fits/,
  );
  assert.equal(JSON.stringify(project.content), before);
});

test("unverifiable new evidence cannot silently replace a linked section", () => {
  const { project } = fixture();
  project.notebook.findings[0].evidence[0].page = 999;
  const [item] = linkedBriefItems(project);
  assert.equal(item.status, "missing");
  assert.match(item.error, /Could not verify/);
  assert.throws(() => updateLinkedBrief(project, item), /repair its evidence/);
});

test("source revisions can reopen a linked section without changing its conclusion text", () => {
  const { project } = fixture();
  const source = project.sources[0];
  source.versions.push({
    ...source.versions[0],
    id: "new-source-revision",
    pages: [{ page: 1, text: "New and incompatible terms." }],
    text: "New and incompatible terms.",
  });
  const [item] = linkedBriefItems(project);
  assert.equal(item.status, "updated");
  assert.match(markdown(item.candidate), /Source updated/);
});

test("comparison sections preserve tables and detect recommendation, condition and cell changes", () => {
  const project = notebookExample("en");
  const insertion = insertLinkedComparison(project, "en");
  project.content = insertion.content;
  assert.equal(validateDocument(project.content), true);
  assert.equal(
    lastBlock(project).content.some((n) => n.type === "table"),
    true,
  );
  project.comparison.recommendation =
    "Choose only after confirming the annual commitment.";
  project.comparison.cells[0].value =
    "Annual contract requires further confirmation";
  const [item] = linkedBriefItems(project);
  assert.equal(item.origin, "comparison");
  assert.equal(item.status, "updated");
  const next = updateLinkedBrief(project, item);
  assert.match(markdown(next), /annual commitment/);
  assert.match(markdown(next), /Annual contract requires/);
  assert.match(markdown(next), /\|/);
  assert.equal(
    insertLinkedComparison({ ...project, content: next }, "en").inserted,
    false,
  );
});

test("a comparison edit updates its canonical finding and flags both linked brief sections", () => {
  let project = connectComparisonFindings(notebookExample("en"));
  const cell = project.comparison.cells[0];
  project.content = insertLinkedFinding(project, cell.findingId, "en").content;
  project.content = insertLinkedComparison(project, "en").content;
  const before = JSON.stringify(project.content);
  project = applyConclusionChanges(project, {
    comparison: {
      ...project.comparison,
      cells: project.comparison.cells.map((current) =>
        current === cell
          ? {
              ...current,
              value: "Revised evaluation with the same source passage.",
            }
          : current,
      ),
    },
  });
  assert.equal(
    project.notebook.findings.find((finding) => finding.id === cell.findingId)
      .value,
    "Revised evaluation with the same source passage.",
  );
  assert.equal(JSON.stringify(project.content), before);
  assert.ok(
    linkedBriefItems(project).every((item) => item.status === "updated"),
  );
  for (const origin of ["finding", "comparison"])
    project.content = updateLinkedBrief(
      project,
      linkedBriefItems(project).find((item) => item.origin === origin),
    );
  assert.ok(
    linkedBriefItems(project).every((item) => item.status === "current"),
  );
  project = applyConclusionChanges(project, {
    notebook: archiveFinding(project.notebook, cell.findingId),
  });
  assert.ok(
    linkedBriefItems(project).every((item) => item.status === "archived"),
  );
  assert.equal(
    createDelivery(project, "en", deliveryOptions(project)).checks.outdated,
    2,
  );
});

test("editor-added default attributes do not falsely mark a table section as authored changes", () => {
  const project = notebookExample("en");
  project.content = insertLinkedComparison(project, "en").content;
  const table = lastBlock(project).content.find((n) => n.type === "table");
  for (const row of table.content)
    for (const cell of row.content)
      cell.attrs = { colspan: 1, rowspan: 1, colwidth: null };
  assert.equal(linkedBriefItems(project)[0].edited, false);
  table.content[1].content[1].attrs.colspan = 2;
  assert.equal(linkedBriefItems(project)[0].edited, true);
});

test("linked sections and original source identities survive a complete project backup", async () => {
  const { project } = fixture();
  project.content = insertLinkedComparison(project, "zh").content;
  const backup = await buildBackupBlob(project);
  const restored = await restoreBackup(new File([backup], "linked.folio.json"));
  assert.notEqual(restored.id, project.id);
  assert.deepEqual(
    restored.content,
    JSON.parse(JSON.stringify(project.content)),
  );
  assert.equal(linkedBriefItems(restored).length, 2);
  assert.ok(
    linkedBriefItems(restored).every(
      (item) => item.status === "current" && !item.edited,
    ),
  );
});

test("fixed deliveries flatten internal links and record unresolved conclusion updates", () => {
  const { project, blockId, id } = fixture();
  project.notebook.findings[0].value = "Updated after drafting";
  const delivery = createDelivery(project, "en", deliveryOptions(project));
  assert.equal(validDelivery(delivery), true);
  assert.equal(containsConclusionLinks(delivery.content), false);
  assert.equal(delivery.checks.outdated, 1);
  assert.ok(!JSON.stringify(delivery.content).includes(blockId));
  assert.ok(!JSON.stringify(delivery.content).includes(id));
  assert.doesNotMatch(
    JSON.stringify(delivery.content),
    /sourceSignature|baselineHash|findingId/,
  );
  assert.match(
    deliveryHtml(delivery),
    /linked sections need conclusion review/,
  );
  assert.match(
    deliveryMarkdown(delivery),
    /linked sections need conclusion review/,
  );
  const frozen = JSON.stringify(delivery);
  project.content = updateLinkedBrief(project, linkedBriefItems(project)[0]);
  assert.equal(JSON.stringify(delivery), frozen);
  assert.match(deliveryHtml(delivery), /Harbor fits/);
  assert.equal(validDelivery({ ...delivery, content: project.content }), false);
});

test("malformed link attributes and nested links are rejected at document validation", async () => {
  const { project } = fixture();
  for (const patch of [
    { origin: "anything" },
    { sourceRevision: -1 },
    { sourceSignature: "" },
    { findingId: "" },
    { language: "xx" },
    { internalSecret: "extra metadata" },
  ]) {
    const content = structuredClone(project.content);
    Object.assign(lastBlock({ content }).attrs, patch);
    assert.equal(validateDocument(content), false);
    const backup = JSON.parse(
      await (await buildBackupBlob({ ...project, content })).text(),
    );
    await assert.rejects(
      () =>
        restoreBackup(new File([JSON.stringify(backup)], "invalid.folio.json")),
      /Invalid document/,
    );
  }
  const nested = structuredClone(project.content);
  lastBlock({ content: nested }).content.push(
    structuredClone(lastBlock(project)),
  );
  assert.equal(validateDocument(nested), false);
  const inline = structuredClone(project.content);
  lastBlock({ content: inline }).content = [
    { type: "text", text: "Invalid inline-only section" },
  ];
  assert.equal(validateDocument(inline), false);
  const duplicate = structuredClone(project.content);
  duplicate.content.push(structuredClone(lastBlock(project)));
  assert.equal(validateDocument(duplicate), false);
});

test("Markdown, HTML and Word exports preserve section structure while omitting link metadata", async () => {
  const project = notebookExample("en");
  project.content = insertLinkedFinding(
    project,
    project.notebook.findings[0].id,
    "en",
  ).content;
  project.content = insertLinkedComparison(project, "en").content;
  const md = markdown(project.content);
  assert.match(md, /Harbor fits/);
  assert.match(md, /\n\nStatus:/);
  assert.doesNotMatch(md, /sourceSignature|conclusionBlock|baselineHash/);
  const old = {
    document: globalThis.document,
    window: globalThis.window,
    create: URL.createObjectURL,
  };
  let captured;
  globalThis.document = {
    createElement: () => ({
      append() {},
      remove() {},
      addEventListener() {},
      setAttribute() {},
    }),
    documentElement: { lang: "en" },
    querySelector: () => null,
    body: { append() {} },
  };
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  URL.createObjectURL = (blob) => {
    captured = blob;
    return "blob:linked-brief-test";
  };
  try {
    exportHtml(project, "en");
    const html = await captured.text();
    assert.match(html, /Harbor fits/);
    assert.match(html, /<table>/);
    assert.doesNotMatch(html, /sourceSignature|conclusionBlock|baselineHash/);
    await exportWord(project, "en");
    const zip = unzipSync(new Uint8Array(await captured.arrayBuffer()));
    const xml = strFromU8(zip["word/document.xml"]);
    assert.match(xml, /Harbor fits/);
    assert.match(xml, /<w:tbl>/);
    assert.doesNotMatch(xml, /sourceSignature|conclusionBlock|baselineHash/);
  } finally {
    globalThis.document = old.document;
    globalThis.window = old.window;
    URL.createObjectURL = old.create;
  }
});
