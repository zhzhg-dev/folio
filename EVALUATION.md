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
