import test from "node:test";
import assert from "node:assert/strict";
import { makeProject } from "../lib/folio/model.ts";
import {
  retrieve,
  chunkPage,
  contextualQuery,
} from "../lib/folio/retrieval.ts";
import {
  findPassages,
  parseAnswer,
  evidenceExists,
  draftNodes,
  validResearch,
} from "../lib/folio/research.ts";
import { matchingPdfItems } from "../lib/folio/pdf-text.ts";

function project() {
  const p = makeProject("Internal evidence set", "en");
  const docs = [
    [
      "budget",
      "Atlas budget",
      [
        "Project Atlas plans a public launch on 15 October 2026.",
        "The subscription price is 12 dollars per month. The annual budget is 4800 dollars.",
      ],
    ],
    [
      "revision",
      "Atlas revised budget",
      [
        "The revised subscription price is 18 dollars per month. This replaces the earlier 12 dollar estimate.",
      ],
    ],
    [
      "privacy",
      "Privacy note",
      [
        "Uploaded files remain on the device. Backup exports are not encrypted. Records are retained for 30 days.",
      ],
    ],
    [
      "cn",
      "中文项目记录",
      [
        "项目面向独立研究者，支持中文和英文资料。",
        "项目成本为每月人民币八十元。正式发布时间是十月十五日。主要风险是网络中断。",
      ],
    ],
    [
      "long",
      "Operations appendix",
      [
        "Routine operating notes. ".repeat(120) +
          "\n\nThe emergency recovery code is SILVER-PINE-72.\n\n" +
          "Routine operating notes. ".repeat(80),
      ],
    ],
  ];
  p.sources = docs.map(([id, name, texts]) => ({
    id,
    name,
    kind: "txt",
    color: "green",
    versions: [
      {
        id: id + "-v1",
        text: texts.join("\n\n"),
        pages: texts.map((text, i) => ({ page: i + 1, text })),
        hash: "fixture",
        size: 500,
        createdAt: p.createdAt,
      },
    ],
  }));
  return p;
}
test("bilingual retrieval fixtures rank exact evidence and retain its page", () => {
  const p = project(),
    ids = p.sources.map((s) => s.id);
  const fixtures = [
    ["What is the subscription price?", "budget", 2, "12 dollars"],
    ["annual budget", "budget", 2, "4800"],
    ["When is the public launch?", "budget", 1, "15 October"],
    ["How long are records retained?", "privacy", 1, "30 days"],
    ["Are backup exports encrypted?", "privacy", 1, "not encrypted"],
    ["revised subscription price", "revision", 1, "18 dollars"],
    ["项目成本是多少？", "cn", 2, "八十元"],
    ["正式发布时间", "cn", 2, "十月十五日"],
    ["主要风险是什么？", "cn", 2, "网络中断"],
    ["项目面向谁？", "cn", 1, "独立研究者"],
    ["支持什么语言？", "cn", 1, "中文和英文"],
    ["emergency recovery code", "long", 1, "SILVER-PINE-72"],
  ];
  for (const [q, source, page, quote] of fixtures) {
    const found = retrieve(p, q, ids);
    assert.ok(
      found.some(
        (e) =>
          e.sourceId === source && e.page === page && e.quote.includes(quote),
      ),
      q,
    );
    assert.ok(
      found.every((e) => evidenceExists(e, p)),
      q,
    );
    assert.ok(found.reduce((n, e) => n + e.quote.length, 0) <= 2400);
  }
});
test("unrelated and stopword-only questions return no manufactured passages", () => {
  const p = project(),
    ids = p.sources.map((s) => s.id);
  for (const q of [
    "What is Jupiter made of?",
    "Who won the marathon?",
    "火星上有多少只猫？",
    "请问什么",
    "the and of",
    "quantum entanglement",
  ])
    assert.deepEqual(retrieve(p, q, ids), [], q);
});

test("a specific financial question is not diluted by a filename or page heading", () => {
  const p = project();
  p.sources = [
    {
      ...p.sources[0],
      name: "atlas-brief.pdf",
      versions: [
        {
          ...p.sources[0].versions[0],
          pages: [
            {
              page: 2,
              text: "ATLAS / BUDGET\nThe subscription price is 12 dollars per month.\nThe annual budget is 4800 dollars.\nEmergency recovery code: SILVER-PINE-72.",
            },
          ],
        },
      ],
    },
  ];
  const results = retrieve(p, "What is the annual budget in atlas-brief.pdf?", [
    "budget",
  ]);
  assert.equal(results.length, 1);
  assert.equal(results[0].quote, "The annual budget is 4800 dollars.");
});
test("source selection and revisions are enforced without discarding old evidence", () => {
  const p = project();
  const before = findPassages(p, "subscription price", ["budget"]);
  assert.ok(before.evidence.every((e) => e.sourceId === "budget"));
  p.sources[0].versions.push({
    ...p.sources[0].versions[0],
    id: "budget-v2",
    text: "The subscription price is 20 dollars.",
    pages: [{ page: 1, text: "The subscription price is 20 dollars." }],
  });
  const after = retrieve(p, "subscription price", ["budget"]);
  assert.ok(after.every((e) => e.versionId === "budget-v2"));
  assert.ok(before.evidence.every((e) => evidenceExists(e, p)));
  assert.deepEqual(retrieve(p, "subscription price", []), []);
});
test("chunk boundaries keep exact, bounded slices even in long unbroken Chinese text", () => {
  for (const text of [
    "Alpha beta.\n\n" + "long sentence ".repeat(300),
    "这是需要分段的长篇中文材料。".repeat(200),
  ]) {
    const chunks = chunkPage(text);
    assert.ok(chunks.length > 1);
    assert.ok(chunks.every((c) => c.length <= 520 && text.includes(c)));
  }
});
test("follow-up questions reuse the prior question only when a reference is present", () => {
  assert.match(
    contextualQuery("What about its cost?", "When will Atlas launch?"),
    /Atlas/,
  );
  assert.match(
    contextualQuery("它有哪些风险？", "这个项目的成本是多少？"),
    /成本/,
  );
  assert.equal(
    contextualQuery("Who owns the company?", "When will Atlas launch?"),
    "Who owns the company?",
  );
});
test("model output rejects invented evidence IDs, uncited claims and unsupported conflict labels", () => {
  const evidence = retrieve(project(), "subscription price", [
    "budget",
    "revision",
  ]);
  assert.throws(() =>
    parseAnswer(
      JSON.stringify({
        status: "answered",
        paragraphs: [{ text: "Invented.", evidenceIds: ["E99"] }],
      }),
      evidence,
    ),
  );
  assert.throws(() =>
    parseAnswer(
      JSON.stringify({
        status: "answered",
        paragraphs: [{ text: "No citation.", evidenceIds: [] }],
      }),
      evidence,
    ),
  );
  assert.throws(() =>
    parseAnswer(
      JSON.stringify({
        status: "conflicting",
        paragraphs: [{ text: "Conflict.", evidenceIds: [evidence[0].id] }],
      }),
      evidence,
    ),
  );
  assert.deepEqual(
    parseAnswer(
      JSON.stringify({
        status: "insufficient",
        paragraphs: [{ text: "Discard unsupported claim.", evidenceIds: [] }],
      }),
      evidence,
    ),
    { status: "insufficient", paragraphs: [] },
  );
  const supported = parseAnswer(
    JSON.stringify({
      status: "conflicting",
      paragraphs: evidence
        .slice(0, 2)
        .map((e) => ({ text: e.quote, evidenceIds: [e.id] })),
    }),
    evidence,
  );
  assert.equal(supported.status, "conflicting");
});
test("adding selected paragraphs retains exact version and rejects false page evidence", () => {
  const p = project();
  const turn = findPassages(p, "annual budget", ["budget"]);
  const nodes = draftNodes(
    { paragraphs: turn.paragraphs.slice(0, 1), evidence: turn.evidence },
    p,
  );
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].content[1].attrs.page, 2);
  const bad = structuredClone(turn);
  bad.evidence[0].page = 99;
  assert.throws(() => draftNodes(bad, p));
  const old = p.content;
  draftNodes(turn, p);
  assert.strictEqual(p.content, old);
});
test("research history validates shape and preserves untrusted text as data", () => {
  const p = project();
  const state = {
    question: "Unfinished question",
    mode: "passages",
    selectedSourceIds: ["budget"],
    turns: [findPassages(p, "annual budget", ["budget"])],
  };
  assert.ok(validResearch(state));
  assert.ok(
    !validResearch({
      ...state,
      turns: [
        {
          ...state.turns[0],
          paragraphs: [{ text: "bad", evidenceIds: ["unknown"] }],
        },
      ],
    }),
  );
  assert.ok(!validResearch({ ...state, question: { html: "<script>" } }));
});
test("PDF highlighting spans text items and whitespace but never highlights an absent quote", () => {
  const items = [
    { str: "Annual budget", hasEOL: true },
    { str: "4800 dollars", hasEOL: true },
    { str: "Private notes" },
  ];
  assert.deepEqual(
    [...matchingPdfItems(items, "budget\n 4800 dollars")],
    [0, 1],
  );
  assert.equal(matchingPdfItems(items, "9000 dollars").size, 0);
});
