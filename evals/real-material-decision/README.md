# Real-material decision acceptance

This small acceptance case uses two independently sourced NASA primary pages, rather than fictional product specs. It was designed and labeled by the development agent; **it is not an independent external evaluation or a real-user study**.

The decision is deliberately narrow: choose the lead example for a classroom handout about reflecting space telescopes, using primary mirror diameter as the selection rule. Webb and Hubble are the two options. Mirror diameter and spectral coverage have supplied evidence; annual operating cost is deliberately absent. The educational recommendation and its limitations are authored inputs, not model-generated answers.

## Sources, provenance and reuse

- [NASA Science: Webb Fact Sheet](https://science.nasa.gov/mission/webb/fact-sheet/), Key Facts table, mirror diameter and wavelength coverage. Accessed 2026-11-18.
- [NASA Science: About Hubble](https://science.nasa.gov/mission/hubble/overview/about-hubble/), Facts tables, primary mirror diameter and sensitivity to light. Accessed 2026-11-18.
- [NASA media usage guidance](https://www.nasa.gov/nasa-brand-center/images-and-media/) was checked for attribution, informational reuse, third-party restrictions and endorsement limits. Only short factual table excerpts are included; no images, logos or other media are copied. Do not interpret this as NASA endorsement or a blanket CC0 license for everything on those pages.

[`sources.json`](sources.json) preserves two table rows per source, fewer than 25 English words from each page. Table separators become colons and HTML whitespace is normalized. The stored snippets are **not full documents**. Chinese snippets are explicitly marked translations by the evaluation author, not official NASA translations. Their wording was not independently reviewed. The imported file also carries attribution, URL, access date and translation/transcription notices; those are separate paragraphs from the evidence.

[`labels.json`](labels.json) holds the queries, expected source-specific phrases, unknown labels, authored decision and synthetic revision expectations separately. Both files were written and their SHA-256 values recorded before the first evaluator execution. They were not revised in response to results. Hashes use UTF-8 with CRLF normalized to LF so Git line endings do not change the corpus identity:

| File         | SHA-256                                                            |
| ------------ | ------------------------------------------------------------------ |
| sources.json | `690caf7525b75128b582833f92d9344b33575ccf866501fa882663e379f04bb4` |
| labels.json  | `628c081fb529540815e483b05569cbf4ee18054c403e3b4143366f443fb0a9d9` |

The runner rejects any other source/label edit. To expand this case, create a separately versioned corpus and freeze new labels before running it. Do not silently retune these labels until failures disappear.

## Reproduce

From the repository root after installing its locked dependencies, using the supported Node version:

```sh
node --experimental-strip-types scripts/evaluate-real-decision.mjs
node --experimental-strip-types scripts/evaluate-real-decision.mjs --json
```

Execution is offline and does not load a model, open a browser, write a local database, upload data or call NASA. It imports the production functions directly. Only `--write-results` rewrites the checked-in observation artifact:

```sh
node --experimental-strip-types scripts/evaluate-real-decision.mjs --write-results
node --experimental-strip-types scripts/evaluate-real-decision.mjs --strict
```

The default command fails on lifecycle invariants or field-aligned retrieval misses. It **reports but does not fail the process on** diagnostic batch/cross-language misses. `--strict` also fails on those misses; it currently exits 1. This distinction is explicit so a successful default exit is never read as universal retrieval success. `npm run eval` remains the earlier fictional development set; it does not implicitly run this case.

Production project/evidence IDs and creation dates are generated normally, so exported byte sizes may vary slightly. Reproducibility means identical frozen input, labels, case scores and invariants, not identical timestamped backup bytes.

## Observed result

Recorded on 2026-11-18 with Node v24.14.1 in [`results.json`](results.json). Each returned quote, its positive/negative label and case outcome are recorded there. Two initial runner attempts stopped because JavaScript objects with optional `undefined` fields were compared to JSON-restored objects, where those fields are correctly omitted. The harness was corrected to compare persisted JSON semantics; corpus, labels and production code were unchanged.

| Check                                   | Observed                                                                         |
| --------------------------------------- | -------------------------------------------------------------------------------- |
| Source-field-aligned queries, EN and ZH | 12/12 strict cases; positive evidence recalled 8/8; unknowns correctly empty 4/4 |
| Returned passages for those queries     | 8/8 match labels and exact source/version/page; 0 out-of-scope passages          |
| Unmodified comparison-criterion names   | 8/12 strict cases; positive evidence recalled 4/8; unknowns correctly empty 4/4  |
| Astronomy terminology across EN/ZH      | 0/4 positive targets recalled; 0 passages returned                               |
| Complete decision lifecycle             | 2/2 language variants; 9 named invariant groups per variant                      |

The general criterion names “Spectral coverage” and “光谱覆盖” miss the supplied source fields. Specific queries from the independently frozen field labels succeed. Cross-language mirror queries also miss: Folio's finite bilingual aliases do not cover this astronomical terminology. These are failed positive targets, **not successful abstentions**. No production retrieval aliases were added to improve this score.

A positive strict case requires at least one exact target passage, no extra unlabeled passages and no out-of-scope sources. A negative case requires zero returned passages. Positive recall is the fraction of labeled positive cases with their target present. Passage precision is relevant returned passages divided by all returned passages; it is undefined when none are returned. Quote integrity checks the imported excerpt, not automatic verification of the live NASA page.

## What the lifecycle verifies

1. Import the actual frozen text through `sourceFromText`, then create a two-option decision with `buildDecisionProject`.
2. Retrieve scoped evidence through `findPassages`; separately measure `searchComparison` using unchanged criterion names.
3. Record authored factual cells and explicit unknowns through `applyConclusionChanges`; facts begin unreviewed and unknowns stay unresolved.
4. Simulate explicit review actions, add authored limitations/recommendation, and use `decisionProgress` to check each next step.
5. Build the linked brief with `insertLinkedComparison`, then freeze HTML/Markdown delivery with four original citations.
6. Use `buildBackupBlob` and `restoreBackup`; check linked records, citation identities, brief, delivery and original imported bytes.
7. Import a **simulated local revision** that omits Webb's mirror row, clearly labeled as a test transformation rather than a NASA update. Check that the two Webb factual cells need review, old quotes still resolve, and latest-version mirror search is empty.
8. Explicitly update the working brief and verify that the saved delivery HTML/Markdown remain unchanged; back up and restore both source revisions and the review warning.

The `reviewedAt` values exercise an explicit review action in code. They do not certify review by independent human assessors. Source-revision handling is simulated, not observation of a real NASA correction.

## Interpretation limits

This checks traceable data and workflow mechanics on two tiny excerpts and one authored scenario. It does not measure answer accuracy, semantic entailment, recommendation quality, user effort, time saved or demand. There is no LLM inference, PDF/OCR extraction, full-document scale test, browser usability test, cloud account test or local IndexedDB test here. Same-language Chinese success does not establish general cross-language ability. The earlier development tests still provide separate coverage; passing either set cannot substantiate a claim of general research intelligence.
