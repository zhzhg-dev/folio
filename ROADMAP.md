# Folio product priorities

The near-term goal is a dependable individual research workspace: keep sources, ask questions, verify evidence and write a document. English remains the default with Chinese available. Preserve local storage and optional on-device AI; no paid backend is required. Public-user recruitment is deferred at the owner's request.

## 1. Reliability and recovery — 0.3.2

Deliver a lightweight entry that can recover from ordinary startup failures, and let people export saved projects without mounting the editor, PDF reader or AI. Make model setup and generation cancellable, release workers on leaving/hidden pages and inactivity, reject stale async results, and put bounded deadlines on tasks. Move backup encoding into a worker and process originals sequentially.

Acceptance: targeted cancellation/race/timeout tests; existing backup round trips remain valid; recovery uses read-only storage; production entry/recovery bundles do not statically import the workspace. Keep the embedded browser closed during this phase following the reported hang.

The 0.3 client freeze is still an unresolved incident. Guards and tests are mitigation, not proof of its cause or resolution. A controlled browser performance investigation is a separate gate before calling the app broadly stable.

## 2. Research quality

Build a small, checked bilingual evidence set spanning factual questions, no-answer cases, explicit revisions, contradictory claims and paraphrases. Measure retrieval misses separately from model errors. Prioritize fewer irrelevant passages and reliable page/version references before adding semantic search or larger models. Make source scope and unsupported claims clearer in the existing research view.

Acceptance: reproducible results with case-level failure reports; a revision is not mislabeled as a contradiction; quoted evidence never silently moves to a newer version; weak matches can be declined.

## 3. First use and distribution

Guide someone through one complete project: import a source, find a passage, check it, write with a citation, export and restore. Improve empty/error/loading states and keyboard accessibility within the existing visual design. Prepare an accurate English/Chinese README and concise walkthrough, plus a verified self-hosting path.

Acceptance: a documented clean-start walkthrough; explicit local-storage and model-device requirements; no simulated capability described as working; restore and export verified on the same release. Cloud accounts, collaboration, OCR and billing remain outside this phase.
