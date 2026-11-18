# Retrieval development evaluation — 0.4

Run: `npm run eval` (or add `-- --json` for case-level results). The same command runs in GitHub CI.

40 fictional, manually labeled development cases in [evals/retrieval-fixtures.mjs](evals/retrieval-fixtures.mjs), checked on 2026-09-26. Baseline: commit `1f572c0` with this new corpus, 30/40. Current implementation: 40/40. Every returned quote resolves to its exact original source, revision and page.

| Category | Before | After |
| --- | --- | --- |
| factual | 13/13 | 13/13 |
| paraphrase | 2/4 | 4/4 |
| cross-language | 3/6 | 6/6 |
| revision | 2/2 | 2/2 |
| conflict-evidence | 1/1 | 1/1 |
| long-document | 1/1 | 1/1 |
| abstention | 8/13 | 13/13 |

A positive case requires every labeled source/page/substring in the returned evidence; a negative case requires zero passages. This is case pass rate, not precision: additional irrelevant passages are not counted as failures unless the case is negative. Revision and conflict cases check that both accounts reach retrieval, not that an AI model interprets them correctly.

The baseline missed storage/retention paraphrases and Chinese queries for English budgets, retention and encryption. It also returned irrelevant passages for questions about CEO salaries, insurance budgets, Arabic support and biometric authentication. Substring matching expanded “costume” into “cost”.

Changes: complete-word alias activation, limited bilingual concept groups, conservative concept coverage, light English plural normalization, counted-token scoring, and latest-revision retrieval. Follow-up context influences ranking while the current question controls relevance. Generic summaries can sample passages; a topic-specific summary cannot bypass relevance filtering.

## 0.6 task acceptance checks

Ten fictional tasks in `tests/comparison-workflow.test.mjs` run through source creation, scoped batch search, explicitly authored review, brief generation, Markdown, backup and restoration. They include English, Chinese, two cross-language directions, annual/monthly terms, negative features, conditional access, retention, an unsupported topic and conflicting passages. Positive cases preserve a required phrase and exact source; the unsupported topic returns no passages. A later revision reopens review without erasing the prior brief. These are development acceptance tests, not independent evaluations or a measure of recommendation accuracy.

Worker tests additionally verify cancellation, deadline cleanup, pre-aborted requests, late-result rejection and an oversized-text guard before allocation.

## Limits

These cases were used while developing the change; they are not a held-out or external benchmark. The vocabulary covers a small set of project/document concepts, not general bilingual translation. Conservative filtering can miss relevant paraphrases, and summaries are bounded extracts rather than exhaustive coverage. No embedding model is used. This evaluation does not measure generated-answer correctness, semantic entailment, hallucination rate or performance on real users' documents. Separate worker tests verify cancellation, deadlines, disposal and lean payloads.

## 1.0 real-material decision acceptance

On 2026-11-18, a separately sourced case used two real primary pages: [NASA's Webb Fact Sheet](https://science.nasa.gov/mission/webb/fact-sheet/) and [About Hubble](https://science.nasa.gov/mission/hubble/overview/about-hubble/). Minimal English table excerpts and explicitly labeled author translations into Chinese are frozen in [evals/real-material-decision/sources.json](evals/real-material-decision/sources.json). Queries, expected evidence and authored decisions were frozen separately before execution in [labels.json](evals/real-material-decision/labels.json), with SHA-256 checks in the runner. This is an author-designed development acceptance case, not external validation or an independent human/user study.

Run `node --experimental-strip-types scripts/evaluate-real-decision.mjs` (add `--json` for individual outcomes). `npm run eval` still runs only the earlier fictional set. The real-material command runs offline against production import, search, decision, conclusion, linked brief, delivery and backup functions. See the [method, source rights, commands and limits](evals/real-material-decision/README.md) and [recorded results](evals/real-material-decision/results.json).

| Measure                                          | Result                                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| Field-aligned same-language queries, EN/ZH       | 12/12 strict cases; positive recall 8/8; correct unknown abstention 4/4 |
| Exact, relevant returned passages in those cases | 8/8, all scoped to the requested source                                 |
| Unmodified criterion-name batch queries          | 8/12 strict cases; positive recall 4/8; correct unknown abstention 4/4  |
| Cross-language astronomy queries                 | 0/4 positive targets recalled; zero passages returned                   |
| Full decision lifecycle                          | 2/2 language variants; 9 invariant groups each                          |

The educational scenario chooses a classroom example using mirror diameter, records spectral coverage and leaves operating cost explicitly unknown. The workflow preserves linked findings, an authored recommendation and limitations, exact citations, original imported bytes, a frozen delivery and two backup/restore rounds. A clearly labeled synthetic local revision omits one specification row: only that option's two factual cells need review, the old evidence stays resolvable and the old delivery remains fixed. Review timestamps simulate user actions; no independent person reviewed the recommendation.

The batch misses concern spectral-coverage phrasing, and the cross-language misses concern astronomy terms outside the finite alias list. They remain failed positive cases, not successful abstentions. `--strict` includes these diagnostic gaps in the exit status and currently exits 1; the default command reports them while asserting the narrower field-aligned workflow. No retrieval code was tuned to this corpus. Tiny excerpts and field-aligned queries do not establish broad retrieval quality, generated-answer accuracy, scientific decision quality, real-user time savings, PDF extraction or full-document performance.
