import assert from "node:assert/strict";
import test from "node:test";
import { emptyComparison } from "../lib/folio/comparison.ts";
import { createDelivery } from "../lib/folio/delivery.ts";
import { decisionProgress } from "../lib/folio/decision-progress.ts";
import {
  insertLinkedComparison,
  linkedBriefItems,
  updateLinkedBrief,
} from "../lib/folio/linked-brief.ts";
import { makeProject, para } from "../lib/folio/model.ts";
import { notebookExample } from "../lib/folio/notebook.ts";
import { createEvidencePageCache } from "../lib/folio/evidence-cache.ts";
import { citationStatus } from "../lib/folio/integrity.ts";
import {
  applyConclusionChanges,
  connectComparisonFindings,
} from "../lib/folio/conclusions.ts";
import {
  archiveQuestion,
  restoreNotebookItem,
} from "../lib/folio/notebook-actions.ts";

const reviewedAt = "2026-11-17T00:00:00.000Z";
function ready() {
  const project = notebookExample("en");
  const c = project.comparison;
  c.recommendation = "Pilot the option that meets the required workflow.";
  c.cells = c.options.flatMap((option) =>
    c.criteria.map((criterion) => ({
      optionId: option.id,
      criterionId: criterion.id,
      value: "Passes our internal pilot criteria.",
      kind: "judgment",
      evidence: [],
      reviewedAt,
    })),
  );
  return project;
}
function draft() {
  const project = ready();
  project.content = insertLinkedComparison(project, "en").content;
  return project;
}
const delivery = (project, patch = {}) =>
  createDelivery(project, "en", {
    title: "Board packet in a custom title",
    summary: "Summary added only for the recipient.",
    origin: "brief",
    findingIds: [],
    includeNotes: false,
    ...patch,
  });

test("empty comparisons suggest importing, then attach existing material to a specific option", () => {
  const project = makeProject("Decision", "en");
  assert.equal(decisionProgress(project), null);
  project.comparison = emptyComparison("en");
  assert.equal(decisionProgress(project).action.type, "import");
  const source = notebookExample("en").sources[0];
  project.sources.push(source);
  const [first, second] = project.comparison.options;
  first.sourceIds = ["deleted-source"];
  assert.deepEqual(decisionProgress(project).action, {
    type: "attach",
    optionId: first.id,
  });
  first.sourceIds = [source.id];
  assert.deepEqual(decisionProgress(project).action, {
    type: "attach",
    optionId: second.id,
  });
  second.sourceIds = [source.id];
  assert.deepEqual(decisionProgress(project).action, {
    type: "review-cell",
    optionId: first.id,
    criterionId: project.comparison.criteria[0].id,
  });
  assert.equal(decisionProgress(project).state, "fill-gap");
});

test("evidence on an older source version reopens a specific previously reviewed entry ahead of other gaps", () => {
  const project = ready();
  const evidence = project.notebook.findings[0].evidence[0];
  const first = project.comparison.cells[0];
  first.evidence = [evidence];
  first.kind = "fact";
  const source = project.sources.find((s) => s.id === evidence.sourceId);
  const version = source.versions.find((v) => v.id === evidence.versionId);
  source.versions.push({ ...version, id: "signed-v3", createdAt: reviewedAt });
  project.comparison.cells.pop();
  const progress = decisionProgress(project);
  assert.equal(progress.state, "changed");
  assert.deepEqual(progress.action, {
    type: "review-cell",
    optionId: first.optionId,
    criterionId: first.criterionId,
  });
  assert.equal(progress.counts.changed, 1);
});

test("an archived finding returns a restore action, never an edit of a disabled comparison entry", () => {
  const project = ready();
  const finding = project.notebook.findings.shift();
  project.comparison.cells[0].findingId = finding.id;
  project.notebook.archived = [
    {
      id: "archive",
      kind: "finding",
      archivedAt: reviewedAt,
      question: project.notebook.questions.find(
        (q) => q.id === finding.questionId,
      ),
      findings: [finding],
    },
  ];
  assert.deepEqual(decisionProgress(project).action, {
    type: "restore-finding",
    findingId: finding.id,
  });
});

test("a removed comparison cell under an archived question targets that question before saving can fail", () => {
  const project = makeProject("Decision", "en");
  project.comparison = emptyComparison("en");
  const optionId = project.comparison.options[0].id;
  const criterionId = project.comparison.criteria[0].id;
  project.comparison.cells = [
    {
      optionId,
      criterionId,
      value: "Need to confirm pricing.",
      kind: "unknown",
      evidence: [],
    },
  ];
  const linked = connectComparisonFindings(project);
  const removed = applyConclusionChanges(linked, {
    comparison: { ...linked.comparison, cells: [] },
  });
  const archived = applyConclusionChanges(removed, {
    notebook: archiveQuestion(removed.notebook, criterionId),
  });
  const frozen = JSON.stringify(archived);
  const progress = decisionProgress(archived);
  assert.equal(progress.state, "restore-question");
  assert.deepEqual(progress.action, {
    type: "restore-question",
    questionId: criterionId,
  });
  assert.equal(JSON.stringify(archived), frozen);
  const restored = applyConclusionChanges(archived, {
    notebook: restoreNotebookItem(
      archived.notebook,
      archived.notebook.archived[0].id,
    ),
  });
  assert.equal(decisionProgress(restored).state, "materials");
  assert.deepEqual(decisionProgress(restored).action, {
    type: "import",
    optionId,
  });
  const independent = {
    ...archived,
    comparison: { ...archived.comparison, findingsLinked: false },
  };
  assert.equal(
    decisionProgress(independent).state,
    "materials",
    "Independent cells do not require a canonical question",
  );
});

test("explicit unknowns can proceed with written limitations; factual claims without evidence remain open", () => {
  const project = ready();
  const first = project.comparison.cells[0];
  first.kind = "fact";
  assert.ok(
    ["fill-gap", "materials"].includes(decisionProgress(project).state),
  );
  first.kind = "unknown";
  first.value = "Pricing for additional users is still unknown.";
  project.comparison.limitations = " ";
  project.comparison.recommendation = " ";
  assert.deepEqual(decisionProgress(project).action, {
    type: "recommend",
    field: "limitations",
  });
  project.comparison.limitations =
    "Confirm volume pricing before expanding beyond the pilot group.";
  assert.equal(decisionProgress(project).notedGaps, 1);
  assert.deepEqual(decisionProgress(project).action, {
    type: "recommend",
    field: "recommendation",
  });
  project.comparison.recommendation = "Pilot only at the current team size.";
  assert.equal(decisionProgress(project).action.type, "insert-brief");
});

test("an authored or legacy brief opens for review without inserting a second comparison; findings editions do not count", () => {
  const project = ready();
  project.content.content.push(para("Independent notes"));
  assert.equal(decisionProgress(project).state, "existing-brief");
  assert.deepEqual(decisionProgress(project).action, { type: "open-brief" });
  project.deliveries = [delivery(project)];
  const preserved = JSON.stringify(project);
  assert.equal(decisionProgress(project).state, "existing-brief");
  assert.equal(JSON.stringify(project), preserved);
  project.content = insertLinkedComparison(project, "en").content;
  project.deliveries = [
    delivery(project, {
      origin: "findings",
      findingIds: [project.notebook.findings[0].id],
    }),
  ];
  assert.equal(decisionProgress(project).state, "first-edition");
});

test("import targets the missing option instead of an already documented first column", () => {
  const project = makeProject("Decision", "en");
  project.comparison = emptyComparison("en");
  const [first, second] = project.comparison.options;
  project.comparison.cells = project.comparison.criteria.map((criterion) => ({
    optionId: first.id,
    criterionId: criterion.id,
    value: "This is still unknown.",
    kind: "unknown",
    evidence: [],
  }));
  assert.deepEqual(decisionProgress(project).action, {
    type: "import",
    optionId: second.id,
  });
});

test("capacity directs only a genuinely blocked next linked cell to research organization", () => {
  const project = makeProject("Decision", "en");
  project.comparison = { ...emptyComparison("en"), findingsLinked: true };
  project.notebook = {
    objective: "",
    questions: Array.from({ length: 30 }, (_, i) => ({
      id: `q${i}`,
      title: `Question ${i}`,
    })),
    findings: [],
  };
  assert.equal(decisionProgress(project).state, "capacity");
  assert.deepEqual(decisionProgress(project).action, { type: "organize" });
  const criterionId = project.comparison.criteria[0].id;
  project.notebook.questions[0].id = criterionId;
  assert.equal(
    decisionProgress(project).state,
    "materials",
    "An existing question needs no new question slot",
  );
  project.notebook.findings = Array.from({ length: 200 }, (_, i) => ({
    id: `f${i}`,
    questionId: criterionId,
    value: `Finding ${i}`,
    kind: "unknown",
    evidence: [],
    note: "",
  }));
  assert.equal(decisionProgress(project).state, "capacity");
  project.notebook.findings.pop();
  assert.equal(
    decisionProgress(project).state,
    "materials",
    "Do not reserve capacity for hypothetical future cells",
  );
  project.comparison.cells = [
    {
      optionId: project.comparison.options[0].id,
      criterionId,
      findingId: "f0",
      value: "",
      kind: "unknown",
      evidence: [],
    },
  ];
  project.notebook.findings.push({
    id: "extra",
    questionId: criterionId,
    value: "Keep",
    kind: "unknown",
    evidence: [],
    note: "",
  });
  assert.equal(
    decisionProgress(project).state,
    "materials",
    "Editing an already linked empty entry creates no new finding",
  );
  project.comparison.findingsLinked = false;
  project.comparison.cells = [];
  assert.equal(
    decisionProgress(project).state,
    "materials",
    "Independent legacy comparison cells do not consume notebook slots",
  );
});

test("exact page caches invalidate in-place text edits and remain bounded", () => {
  const limits = {
    pages: 3,
    pageCharacters: 90,
    quotes: 4,
    quoteCharacters: 20,
  };
  const cache = createEvidencePageCache(limits);
  const page = { text: "The price is 18." };
  assert.equal(cache.contains(page, "18"), true);
  assert.equal(cache.contains(page, "24"), false);
  page.text = "The price is 24.";
  assert.equal(cache.contains(page, "18"), false);
  assert.equal(cache.contains(page, "24"), true);
  for (let i = 0; i < 80; i++) {
    const current = { text: `text ${i} supports an exact quote` };
    assert.equal(cache.contains(current, "exact"), true);
    assert.equal(cache.contains(current, `absent-${i}`), false);
    const size = cache.size();
    assert.ok(size.pages <= limits.pages);
    assert.ok(size.pageCharacters <= limits.pageCharacters);
    assert.ok(size.quotes <= limits.quotes);
    assert.ok(size.quoteCharacters <= limits.quoteCharacters);
  }
  assert.equal(cache.contains({ text: "x".repeat(200) }, "xxx"), true);
  assert.ok(
    cache.size().pageCharacters <= limits.pageCharacters,
    "Oversized pages bypass retention",
  );
  cache.clear();
  assert.deepEqual(cache.size(), {
    pages: 0,
    pageCharacters: 0,
    quotes: 0,
    quoteCharacters: 0,
  });
});

test("cached citation checks still find quotes moved to another page and honor page/version/text changes", () => {
  const project = makeProject("Source revision", "en");
  const old = {
    id: "old",
    text: "Original passage.",
    pages: [{ page: 1, text: "Original passage." }],
    createdAt: reviewedAt,
    hash: "old",
    size: 17,
  };
  const latest = {
    ...old,
    id: "new",
    pages: [
      { page: 1, text: "New introduction." },
      { page: 2, text: "Original passage." },
    ],
  };
  project.sources = [
    {
      id: "source",
      name: "Terms",
      kind: "txt",
      color: "green",
      versions: [old, latest],
    },
  ];
  const attrs = {
    sourceId: "source",
    versionId: "old",
    page: 1,
    quote: "Original passage.",
  };
  assert.equal(citationStatus(attrs, project), "older");
  latest.pages[1].text = "The passage has changed.";
  assert.equal(citationStatus(attrs, project), "changed");
  latest.pages[0].text = "Original passage.";
  assert.equal(citationStatus(attrs, project), "older");
  old.pages[0].text = "Original is no longer here.";
  assert.equal(citationStatus(attrs, project), "missing");
  old.pages[0].text = "Original passage.";
  assert.equal(citationStatus({ ...attrs, page: 2 }, project), "missing");
  assert.equal(
    citationStatus({ ...attrs, versionId: "new" }, project),
    "current",
  );
});

test("a 6 by 12 comparison checks each exact passage once, reuses it through live edition matching, and sees in-place changes", (t) => {
  const project = makeProject("Large decision", "en");
  const quotes = Array.from({ length: 576 }, (_, i) => `Cache proof ${i}.`);
  const page = { page: 1, text: quotes.join("\n") };
  project.sources = [
    {
      id: "source",
      name: "Terms",
      kind: "txt",
      color: "green",
      versions: [
        {
          id: "v1",
          text: page.text,
          pages: [page],
          createdAt: reviewedAt,
          hash: "fixture",
          size: page.text.length,
        },
      ],
    },
  ];
  project.comparison = {
    objective: "Choose",
    constraints: "",
    recommendation: "Run a limited pilot.",
    limitations: "",
    options: Array.from({ length: 6 }, (_, i) => ({
      id: `o${i}`,
      name: `Option ${i}`,
      sourceIds: ["source"],
    })),
    criteria: Array.from({ length: 12 }, (_, i) => ({
      id: `c${i}`,
      name: `Criterion ${i}`,
    })),
    cells: [],
  };
  let quoteIndex = 0;
  project.comparison.cells = project.comparison.options.flatMap((option) =>
    project.comparison.criteria.map((criterion) => ({
      optionId: option.id,
      criterionId: criterion.id,
      value: "A checked claim.",
      kind: "fact",
      reviewedAt,
      evidence: Array.from({ length: 8 }, () => {
        const index = quoteIndex++;
        return {
          id: `e${index}`,
          sourceId: "source",
          versionId: "v1",
          page: 1,
          quote: quotes[index],
          name: "Terms",
          label: "1",
        };
      }),
    })),
  );
  let scans = 0;
  const originalIncludes = String.prototype.includes;
  t.mock.method(String.prototype, "includes", function (needle, ...rest) {
    if (typeof needle === "string" && needle.startsWith("Cache proof "))
      scans += 1;
    return originalIncludes.call(this, needle, ...rest);
  });
  assert.equal(decisionProgress(project).state, "draft");
  assert.equal(scans, 576);
  for (let i = 0; i < 4; i++) {
    project.comparison.recommendation += ".";
    assert.equal(decisionProgress(project).state, "draft");
  }
  assert.equal(scans, 576, "Subsequent keystrokes do not rescan source text");
  project.content = insertLinkedComparison(project, "en").content;
  project.deliveries = [delivery(project)];
  assert.equal(decisionProgress(project).state, "saved-edition");
  assert.equal(
    scans,
    576,
    "Brief checks and edition preparation share exact passage results",
  );
  project.reportTitle =
    "A changed report title, while the edition has its own recipient title";
  assert.equal(decisionProgress(project).state, "saved-edition");
  project.content.content.push(para("A real in-place draft edit."));
  assert.equal(
    decisionProgress(project).state,
    "next-edition",
    "No identity-only cache may hide authored edits",
  );
  page.text = page.text.replace(quotes[0], "Deleted passage.");
  assert.equal(decisionProgress(project).state, "changed");
  assert.ok(scans > 576, "Editing original text invalidates passage results");
});

test("a matching delivery is identified from its content, references and warnings, then reopens after brief edits", () => {
  const project = draft();
  assert.equal(decisionProgress(project).state, "first-edition");
  const edition = delivery(project);
  project.deliveries = [edition];
  assert.deepEqual(decisionProgress(project).action, {
    type: "open-edition",
    deliveryId: edition.id,
  });
  const frozen = JSON.stringify(edition);
  project.content.content.push(
    para("New conditions to share with the recipient."),
  );
  assert.equal(decisionProgress(project).state, "next-edition");
  assert.equal(JSON.stringify(edition), frozen);
  project.deliveries.unshift(delivery(project));
  assert.equal(
    decisionProgress(project).action.deliveryId,
    project.deliveries[0].id,
  );
});

test("a comparison edit requires checking the linked draft before suggesting a new edition", () => {
  const project = draft();
  const old = delivery(project);
  project.deliveries = [old];
  project.comparison.recommendation =
    "Keep both options open until the trial ends.";
  const [link] = linkedBriefItems(project);
  assert.deepEqual(decisionProgress(project).action, {
    type: "update-brief",
    blockId: link.id,
  });
  const saved = JSON.stringify(old);
  project.content = updateLinkedBrief(project, link);
  assert.equal(decisionProgress(project).state, "next-edition");
  assert.equal(JSON.stringify(project.deliveries[0]), saved);
});

test("unlinked citations still need review before a saved edition can be called current", () => {
  const project = draft();
  const e = project.notebook.findings[0].evidence[0];
  project.content.content.push({
    type: "paragraph",
    content: [{ type: "citation", attrs: e }],
  });
  project.deliveries = [delivery(project)];
  assert.equal(decisionProgress(project).state, "saved-edition");
  const source = project.sources.find((s) => s.id === e.sourceId);
  source.versions.push({ ...source.versions.at(-1), id: "amended-terms" });
  assert.equal(decisionProgress(project).action.type, "review-brief");
});
