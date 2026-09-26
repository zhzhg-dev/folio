# Folio product priorities

## 0.5 delivered: compare, review, deliver

The initial professional use case is an individual comparing products or options and producing a sourced decision brief. This is a positioning hypothesis, not validated demand. Public-user recruitment remains deferred.

The comparison workspace now records the research objective, constraints, options, criteria, typed findings, exact evidence and personal review marks. Linked-source search and original-page text support evidence selection. Source revisions flag related findings for manual review. A brief appends to the editor with a pre-insertion snapshot, citations, recommendation and unresolved items. Comparisons survive project backups. Pending saves are coalesced and do not report older writes as the latest saved work. Small backups have a copied-text recovery route.

Next gates: independent evaluation on complete professional tasks; simpler review of the affected findings after a source revision; more representative mixed-language document/table handling; reliable full-size browser downloads; and a focused investigation of the original freeze. First confirm the whole task works before expanding into batch extraction or model-driven recommendations. Prepare distribution only after these quality gates; accounts, team permissions, billing, native mobile apps and automatic web research remain deferred.

The near-term goal is a dependable individual research workspace: keep sources, ask questions, verify evidence and write a document. English remains the default with Chinese available. Preserve local storage and optional on-device AI; no paid backend is required. Public-user recruitment is deferred at the owner's request.

## 1. Reliability and recovery — 0.3.2

Deliver a lightweight entry that can recover from ordinary startup failures, and let people export saved projects without mounting the editor, PDF reader or AI. Make model setup and generation cancellable, release workers on leaving/hidden pages and inactivity, reject stale async results, and put bounded deadlines on tasks. Move backup encoding into a worker and process originals sequentially.

Acceptance: targeted cancellation/race/timeout tests; existing backup round trips remain valid; recovery uses read-only storage; production entry/recovery bundles do not statically import the workspace. Browser testing was deferred in 0.3.2. The owner reauthorized it for 0.4; controlled results are in QA.md.

The 0.3 client freeze is still an unresolved incident. Guards and tests are mitigation, not proof of its cause or resolution. A controlled browser performance investigation is a separate gate before calling the app broadly stable.

## 2. Research quality

Build a small, checked bilingual evidence set spanning factual questions, no-answer cases, explicit revisions, contradictory claims and paraphrases. Measure retrieval misses separately from model errors. Prioritize fewer irrelevant passages and reliable page/version references before adding semantic search or larger models. Make source scope and unsupported claims clearer in the existing research view.

Acceptance: reproducible results with case-level failure reports; a revision is not mislabeled as a contradiction; quoted evidence never silently moves to a newer version; weak matches can be declined.

## 3. First use and distribution

Guide someone through one complete project: import a source, find a passage, check it, write with a citation, export and restore. Improve empty/error/loading states and keyboard accessibility within the existing visual design. Prepare an accurate English/Chinese README and concise walkthrough, plus a verified self-hosting path.

Acceptance: a documented clean-start walkthrough; explicit local-storage and model-device requirements; no simulated capability described as working; restore and export verified on the same release. Cloud accounts, collaboration, OCR and billing remain outside this phase.

## 0.4 delivery and remaining gates

Delivered: 40-case reproducible retrieval development evaluation; stricter concept coverage; cancellable search workers; per-source evidence ledger with persistent manual review marks; bounded initial history rendering; a bilingual project guide and walkthrough; explicit save links for prepared exports.

Verified: normal project creation/import/search/evidence/PDF/cited insertion, one real AI revision answer, Chinese cross-language search, backup fixture restoration, and 390px/1440px responsive layouts. Automated checks cover backup fidelity and worker lifecycle.

Still open: actual download completion in this embedded browser (the file is prepared, but the automation download event did not complete), diagnosis of the original host freeze, and a held-out corpus with independent relevance/answer scoring. Resolve host download interoperability and profile longer realistic sessions before expanding scope. No user recruitment, cloud accounts, collaboration, OCR or billing in this release.
