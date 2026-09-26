import { retrieve } from "../lib/folio/retrieval.ts";
import { evidenceExists } from "../lib/folio/research.ts";
import { cases, fixtureProject } from "../evals/retrieval-fixtures.mjs";
const project = fixtureProject();
const results = cases.map((c) => {
  const evidence = retrieve(
    project,
    c.query,
    c.scope ?? project.sources.map((s) => s.id),
  );
  const intact = evidence.every((e) => evidenceExists(e, project));
  const pass =
    intact &&
    (c.expected.length
      ? c.expected.every(([source, page, quote]) =>
          evidence.some(
            (e) =>
              e.sourceId === source &&
              e.page === page &&
              e.quote.includes(quote),
          ),
        )
      : evidence.length === 0);
  return {
    id: c.id,
    category: c.category,
    pass,
    query: c.query,
    found: evidence.map((e) => `${e.sourceId}:${e.page}`),
    intact,
  };
});
const summary = {
  cases: results.length,
  passed: results.filter((r) => r.pass).length,
  exactQuotes: results.every((r) => r.intact),
  results,
};
if (process.argv.includes("--json"))
  console.log(JSON.stringify(summary, null, 2));
else {
  console.log(
    `Retrieval development set: ${summary.passed}/${summary.cases}. Exact quote integrity: ${summary.exactQuotes}.`,
  );
  for (const r of results.filter((r) => !r.pass))
    console.log(
      `FAIL ${r.id}: ${r.query} → ${r.found.join(", ") || "no passages"}`,
    );
  console.log(
    "Fictional development fixtures; measures retrieval, not AI answer accuracy.",
  );
}
if (summary.passed !== summary.cases) process.exitCode = 1;
