# Folio verification

## 0.10 research review and fixed delivery — 2026-10-03

- Type checking, 117 automated tests and production build pass. Eleven new checks cover cross-question source impact without counting a legacy notebook projection twice, page-specific citation verification, exact duplicate replacement and stale-selection refusal, immutable editions, omission of private notes/unrelated sources, explicit unresolved citations, HTML injection, size limits, backup round trips and structured text tables.
- Malformed document marks are rejected before restoration. The ordinary HTML export also clamps heading levels. Review source filters and pending citation replacements clear on project switches; a filter from another project cannot hide all its open work.
- Browser with a fictional sample: Research review showed 14 open items across findings and comparison. Manually checked the annual price calculation and used Save & next; the queue dropped to 13, the next finding opened, and the previous finding remained in review history.
- Prepared and saved an edition containing six findings and five cited passages. The preview exposed five findings still needing manual review. Copy text returned 1,689 characters with reference passages and the manual status, excluding the unchecked personal-note option. A reload retained the saved edition.
- Exported the actual 15,740-character project backup through the copied-text path and restored a separate project. Its saved edition, three sources, notebook review mark and one review-history entry remained available. Production preview loaded the same local state. New delivery drafts group findings by question; switching into preview resets the content scroll to the title.
- English and Chinese controls and 390px review/delivery layouts were inspected. At 390px the document width was 390px; a 1440px viewport also had no document overflow. The inspected application console contained no warnings or errors. Native HTML export produced the visible Save file / Save as controls; completion to disk in this embedded host remains unverified.
- The compiled 16.26 KB Worker passed a D1/R2 round trip containing a saved delivery and review history, and rejected a delivery with malformed marks. The live database overview confirmed the existing cloud_backups table before this release; no schema migration was needed. These checks are not a live multi-person authentication test.
- Delivery copies only the selected content and cited passages. It does not change hosted access, upload on its own, create a public URL, or make exported files revocable. Source checks are not semantic truth verification. Edition/history limits are documented; local/browser long-session behavior and the original freeze cause remain outside this release's claims.

## 0.9 optional account and cloud backups — 2026-10-03

- Type checking, 106 automated tests and the production build pass. Eleven cloud tests use actual local D1/R2 bindings: anonymous rejection, per-owner list/read/delete isolation, account-change and cross-origin checks, byte-identical original/citation restoration, immutable idempotency, upload size and atomic count/byte quotas, corrupted-backup rejection, interrupted writes and recoverable deletion. An offline-worker test excludes API and authentication routes from interception.
- The compiled 13.55 KB Worker was also executed under workerd: its fetch handler delegates assets, rejects anonymous data access and completes a D1/R2 save/download round trip. This is a production-bundle runtime check, not only a test of the source handler.
- Browser: created a separate fictional bilingual text project, opened the account tab, completed the development sign-in flow, saved one cloud version, and restored a new local project retaining its source. English desktop and Chinese 390px layouts were checked; document width remained 390px with no horizontal overflow. No warnings/errors appeared in the inspected app console.
- Local sign-in uses the bundled loopback-only mock account. Production authentication relies on Sites dispatch and its verified user headers. Automated fixtures simulate two verified owners; this does not establish a live two-person OAuth test or a test on a second physical device. No real user documents were uploaded during QA.
- Storage remains local by default. Cloud saves are explicit, immutable and limited to 10 MiB each, 20 versions and 100 MiB per account. Restore creates a new local project. Cloud deletion is permanent after confirmation; local copies remain. Pending failed uploads count against limits and clear on refresh after one hour. Real-time synchronization, automatic merging, collaboration and end-to-end encryption are absent.
- The original freeze investigation is deferred as requested. These changes do not claim its cause or resolution. The existing owner-only Site audience is preserved; publishing GitHub code does not change access to the hosted app.

## 0.8 local reliability and project management — 2026-09-27

- Type checking, 94 automated tests and production build pass. Nine new fake-indexeddb tests exercise legacy migration with original bytes and repeated source IDs across projects, selective writes, transaction rollback after an injected commit failure, stale-window refusal, failed migration rollback, normalized recovery reads, last-project Trash recovery, backup restoration from Trash and rejection of missing source records.
- Editing a note writes one project and zero sources in the storage test; failed transactions can retry the same draft. This verifies write scope, not browser latency.
- Actual browser: existing v1 projects migrated and remained accessible. Created a fictional bilingual source, searched/favorited its project, archived it, moved it to Trash and restored it; the source remained present.
- Exported the actual test project as 1,400 characters through Copy backup text, restored that exact text and reloaded. Saved the copied text as a local fixture, then restored it through the production build's file-chooser flow. This verifies text and file restore, not native download completion.
- The embedded browser's Save file action and download helper timed out. Save as completion remains unverified. Text backup fallback is limited to 2 MiB; file preparation must not be described as a completed disk save.
- Checked desktop at 1440px and Chinese project management at 390px: document width 390px, dialog width 358px, no horizontal overflow. Restored English. Production loaded the built asset bundle; the inspected production console had no warnings/errors.
- Development hot updates exposed a revision-baseline reset and correctly refused a stale save. The store now survives development hot replacement; storage implementation changes require a full reload for testing. Production checks used a fresh page at the same origin with saved records retained.
- Storage usage includes cached offline/model resources. Persistence does not replace backup. Diagnostics retain only session counters and upload nothing. The original host freeze did not recur in these controlled checks; its root cause, longer-session behavior and browser download interoperability remain unresolved.
- All projects/sources still load at startup; a changed source rewrites its complete revision history. Trash is retained indefinitely with no permanent-purge control. Old app versions cannot open the new database schema.


## 0.7 research notebook and light interface — 2026-09-27

- Type checking and 85 automated tests pass. Seven notebook tests cover blank English first use, traceable bilingual samples, non-mutating legacy comparison access, review reset/staleness, exact brief citations and notes, selected-passage adoption, backup round trips and malformed notebook rejection.
- Local browser at 1440px: created a separate test project, set an objective, imported fictional text, searched it, kept a selected passage as a finding, edited it, added a note and appended it to the brief. The brief contained the exact citation, note and Not reviewed status. Undo insertion restored the empty draft. Existing projects remained accessible.
- Marking a finding reviewed and then editing its note reset the checkbox. Opening the exact source and closing its dialog restored focus to the source button and retained the research scroll position (246px in the narrow-screen check).
- At 390px, the Chinese research page and source reader each had a 390px document width with no horizontal overflow. The mobile sidebar, language switch, finding editor and focus mode were exercised. Desktop focus mode reclaimed the sidebar space (1416px main surface in a 1440px viewport). Refresh retained the question, finding, note, source and Chinese preference. Returned to English afterward.
- A natural-language query missed a relevant passage, while the specific keywords CSV export returned it. The empty-state wording now distinguishes a retrieval miss from proof that a source lacks the answer. The lexical engine is unchanged; semantic question understanding remains a quality gate.
- No application warnings or errors appeared in the inspected console. No model was downloaded and no new automatic PDF rendering was introduced. These controlled checks do not establish the cause or resolution of the original host freeze, download interoperability, AI answer quality or long-session performance.
- Notebook edits made from a legacy comparison create a separate snapshot. The matrix and notebook do not continuously synchronize. Brief insertion similarly preserves a dated working snapshot and existing document history.

## 0.6 batch candidates and continuous review — 2026-09-26

- Type checking, 78 automated tests, the 40-case retrieval development evaluation and production build pass. Ten new fictional tasks cover source creation, scoped evidence, manual review, briefs, Markdown and backup/restoration. These are development acceptance checks, not held-out evaluation or AI accuracy claims.
- Browser: ran batch search on the three-option sample; five of nine cells had candidates and existing findings/review marks were unchanged. Opened the source-updated filter, explicitly moved two unchanged quotes to their current revision, checked their conditions manually, and used Save & next. The queue finished with 3/9 reviewed and no remaining source updates.
- Exported the actual project and restored its 15,701-character backup through the new worker-backed text restore. The separate project retained 3/9 review status, sources and the previous brief. Reloading the production build retained this state and the language choice.
- Production browser: batch search completed through the bundled worker; a newly appended brief showed 3/9 reviewed while the earlier 1/9 snapshot remained intact. No application warning or error appeared in the inspected console.
- Checked English desktop at 1440px and Chinese mobile at 390px. Document width matched the viewport; the matrix scrolls within its own region. Review rows fit a narrow screen and preserve the original English source text when the interface is Chinese.
- Synthetic Node workload: 1,890,000 source characters, 250 pages, six options and twelve criteria (72 cells) returned 216 candidates. Replacing repeated full-array sorting with bounded selection reduced one same-machine run from 23,098ms to 2,942ms. This is a repeated-text development fixture, not browser latency, a memory profile, or a general performance guarantee.
- Batch search has one disposable worker, an 8-million-character guard and a 60-second deadline. Restore runs parsing, document validation and checksums in a disposable worker with a 120-second deadline. Lifecycle tests cover success, cancel, errors, deadline and late replies. Original-page text starts at 20,000 characters and expands on request.
- Still open: the cause of the original full-client freeze; large-workspace persistence cost; successful full-size native downloads in the embedded browser; long-session profiling and independently labeled real documents. Actual browser cancellation under maximum load has not been separately profiled. The verified small text-restore route does not resolve native download interoperability.

## 0.5 comparisons and decision briefs — 2026-09-26

- Type checking, 63 automated tests and the production build pass. Reloading the production build on the same localhost origin retained the restored comparison, the USD 18 finding and its reviewed mark. No warnings or errors appeared in the inspected application console. The startup entry remains 5.15 KB; optional AI is not loaded on entry.

- Automated checks cover comparison shape/limits, immutable version/page citations, explicit unknowns, manual review semantics, changed sources, non-mutating report generation, complete reference appendices, Markdown tables and comparison backup restoration. Autosave tests cover coalescing while writes are in flight, truthful status reporting, errors and disposed queues. A direct-save test confirms that success is reported only after the file writer closes and that failure retains a download fallback.
- In the embedded browser, added the fictional support-software comparison through the UI. It showed three options, three criteria, one missing entry and three findings linked to an older source version. Nothing was initially marked reviewed.
- Searched the Harbor price cell, found the current USD 18 annual-billing passage, removed the USD 15 citation, attached the new passage, edited the finding and marked it manually reviewed. The table showed 1/9 reviewed and two other findings to revisit.
- Built a decision brief through the UI. It contained the editable comparison table, eight versioned citations, the recorded recommendation and explicit open questions. An earlier draft snapshot and Undo insertion were retained.
- Exported the actual edited project to the backup notice, used Copy backup text, and restored that exact clipboard text through Preferences & backups. A separate restored project retained the updated quote, 1/9 manual review status, source revisions and existing brief. This verifies the text backup path, not a disk download round trip. Text fallback is limited to JSON backups of at most 2 MiB.
- Checked English/Chinese controls without translating user content. At 390×844, the document width was 390px; the comparison table scrolls inside its own region. Desktop layout was checked at 1440×1000.
- The embedded browser's Save file activation and download helper did not yield a completed download event; no matching file was found in the normal Downloads folder. Save as is conditional on the browser API and is unit-tested, but its native picker completion is not verified here. Keep download interoperability open.
- The controlled workflow did not reproduce the original reported full-client freeze. The root cause remains unresolved; this release must not be described as a proven fix. No model download or AI inference was started in this session. This feature is a user-led research workflow, not an AI quality benchmark.

## 0.4 research quality and guided workflow — 2026-09-26

- 54 automated tests plus a separate 40-case retrieval evaluation. Baseline 30/40; current 40/40 on development fixtures (not held-out). See EVALUATION.md for scoring and limits. New tests include search worker cancellation/error/deadline/late-result behavior, lean source payloads, topic-specific summary rejection, follow-up topic changes, manual review backup round trips, malformed model objects and download blob cleanup.
- In the Windows embedded browser, created a new test project and imported a two-page fictional PDF plus a text revision. Passage search returned original and revised prices with correct pages. Opened PDF page 2, loaded the actual canvas/highlights, then closed the preview to free resources.
- Marked the first passage reviewed; selected it and added it to the document with its citation. The guide advanced from 0/4 to 4/4. Review marks survived view changes. A separately generated valid backup fixture restored through the normal file picker into a new project with its writing, citation, question and 1/1 reviewed mark. This fixture restore is not a browser-download round trip.
- Manually loaded Qwen3 and asked “Compare the subscription prices. Explain the revision.” It returned one cited sentence: the subscription was revised from 12 dollars per month to 18 dollars per month. The citation points to the revision text. This one successful answer is not a conflict/answer-quality benchmark. Explicitly turned AI off afterwards.
- Chinese UI query “年度预算是多少？” returned the English 4800 and 7200 dollar passages. At 390×844 the document width was exactly 390px; at 1440×1000 evidence groups use side-by-side columns. Keyboard operation was used for the workflow controls.
- The production build was served on the same localhost port and reloaded successfully in normal startup mode. Existing research and manual review marks persisted. A new “What is the Atlas CEO salary?” query returned Not enough evidence through the bundled worker. Entry remains 5.15 KB with no static workspace import; recovery imports only its backup helper.
- No application warning/error appeared in the inspected browser console. Safe startup and the controlled workflow did not reproduce the reported full-client freeze. One 10-second host-process sample showed a highest individual process CPU use of 11.56% of one core, during ongoing interaction; it is not a per-tab performance trace or proof that the original issue is fixed.
- Export preparation completes. The previous detached asynchronous download was replaced with a visible, user-activated Save file link and accurate “file ready” wording. In this embedded browser both the automated download wait and an explicit link activation failed to return a completed download event. No actual saved backup from this session was verified. The ready link and Blob lifecycle are checked, backup serialization/restoration is covered in automated tests; host download interoperability remains open.

## 0.3.2 recovery and task lifecycle

- Model session tests cover single initialization, cancellation before/during setup, hung generation cancellation, concurrent request rejection, old results arriving after replacement, timeout cleanup and idle release.
- Development hot updates explicitly release the previous AI session and remove its page listeners; development GPU behavior itself was not re-run.
- Recovery exports use the same format as normal backup. A binary fixture spanning multiple base64 chunks round-trips with byte-identical originals and retained research/reading state. Cancellation stops further reads, and a mocked worker verifies termination.
- Storage recovery reads the existing `workspaces/main` row in a read-only transaction, aborts attempted creation of a missing database, and refuses malformed project indexes without writing.
- The transpiled startup entry is tested for no eager workspace import, timeout fallback and rejection of a late import after failure. This is a script-level test, not evidence that a blocked host process can be recovered.
- Browser preview, actual GPU/model reloading and the original client-freeze reproduction were deliberately not run in this release. Existing browser verification below belongs to earlier releases.

## 0.3.1 startup incident and mitigation

The user reported repeated desktop-client freezes immediately after the embedded page finished loading, accompanied by sustained fan activity, including after restarting the client. Closing the embedded tab before loading completed prevented the symptom. They had not enabled local AI. A Windows Application Hang event (1002) recorded ChatGPT.exe becoming unresponsive at 2026-09-26 13:58 local time. The prior preview-close tool call timed out; successful closure was not established.

The original freeze has **not** been reproduced or profiled. The in-app page was deliberately not reopened during this mitigation. Its exact cause, and whether the host itself contributes, remain unresolved.

Mitigations: a lightweight startup gate before workspace imports on first use/unclean exit; an explicit safe-start URL; no automatic PDF restoration; manual PDF preview with a release control; border-box resize measurement, stable scrollbar space, bounded canvas pixels, and linear text normalization; sequential core-only offline caching with optional assets cached on demand. Safe sessions skip browser-tool registration and new offline-worker registration. Existing documents and source blobs are preserved.

Eight new automated regression tests cover an actual startup-entry import gate, recovery after abnormal exit, clean exit, multi-tab marker ownership, blocked storage, stable PDF sizing, canvas limits, long/emoji PDF text, and sequential core-only caching. The import-gate test runs transpiled application entry code in an isolated JavaScript context and verifies that the workspace is not imported before a click, and is imported only once after a double click. These tests do not establish that the reported client hang is fixed. Earlier browser checks below describe the 0.3 workflow, not a fresh 0.3.1 browser verification.

Checked on 2026-09-26 with Node.js 24 and the Codex Chromium-based in-app browser on Windows.

## 0.3 research workflow

- 26 automated tests, including 12 positive bilingual retrieval fixtures and 6 no-match queries, scope restrictions, long-document slicing, original revision/page integrity, follow-up context, rejection of invented/missing citations, and multi-source comparison validation.
- Project backups retain research history, an unfinished question, and the last reading position; malformed research references are rejected.
- Imported a two-page fictional PDF and a revised text budget through the normal upload UI. A budget question retrieved both values and identified page 2 of the PDF.
- Opened the cited PDF page, visually inspected the rendered original and four highlighted text lines, navigated to page 1, and confirmed that Resume reading returned to page 1.
- Selected a passage, appended it with a versioned citation, inspected the writing view, and used Undo insertion to restore the document.
- Reloaded the application: the research view, history, pending question, response mode, and reading page were retained.
- Real Qwen3 generation on this device compared the two subscription prices and attached the correct source files/pages. A question with no matching evidence returned an explicit insufficient-evidence state.
- An initial model response was malformed. Disabling Qwen3 thinking through the supported generation option resolved the observed format failure. Invalid output is rejected and leaves the question available for retry; it is never appended automatically.
- Real Chinese generation returned both tested prices with the corresponding files/pages. The small model did not consistently distinguish an explicitly revised value from an unexplained disagreement; prompts were tightened, but that distinction still requires human review.
- Mobile research and the PDF evidence dialog were checked at 390 × 844 px. The page had no horizontal overflow and the question composer remained within the viewport. Returned to the normal viewport afterward.
- A targeted regression test checks that asking for an annual budget in a named PDF returns the budget sentence without unrelated price or recovery-code passages. PDF sentence boundaries, filename removal, and phrase weighting address that observed issue.

This is internal functional verification with fictional materials, not a retrieval or model-quality benchmark. Term matching can miss paraphrases and may return irrelevant passages. Model claims, calculations, and conflict classifications still need review against the original evidence.

## Earlier automated coverage

- TypeScript compilation with `tsc --noEmit`.
- Production Vite build, including generated offline shell.
- 11 Node tests: immutable source history; source changes preserve human writing; quote movement; unknown citations; document structure/depth; DOCX text and reference XML; backup round-trip including original bytes and snapshots; corrupt backup rejection; HTML escaping; unsupported/empty files.
- 4 preference tests: valid English starter citations; untouched demo migration; preservation of edited documents, sources and snapshots; persistence of an explicit Chinese preference. Total: 15 tests.

## 0.2 interface checks

- English-default sample and visible English / 中文 controls.
- Chinese selection persists after reload; switching back to English preserves document content.
- Layout checked at 1440, 819, and 390 px; no horizontal page overflow at desktop or mobile widths.
- Mobile navigation and an automatically wrapping document title.
- English document typography remains independent of the interface language.
- Self-hosted font files and licenses included in the build.

## Core browser workflows checked in 0.1

- Create project, edit a document, autosave, reload and retain content.
- Paste a source, insert a citation, save a snapshot, update the source, inspect the stale citation, replace its evidence and restore a snapshot without losing human text.
- Upload a generated one-page PDF and verify its extracted text.
- Invoke Word export and observe success; independently inspect generated DOCX ZIP/XML in automated tests. The embedded browser did not expose a download event, so download-manager behavior is not counted as verified.
- Switch Chinese/English; check 390 px layout for horizontal overflow; open and select through the mobile navigation drawer.
- Load the real Qwen3-1.7B model through WebLLM on this device; generate a Chinese draft using fictional demo sources, append it with citations, verify the automatic pre-adoption snapshot, then restore the original document.
- WebMCP: list projects, open a valid project, reject a nonexistent project.

## Not established by these checks

Cross-device WebGPU reliability, broad bilingual generation quality, factual accuracy, semantic entailment, complex/rotated PDF layouts, screen-reader audit, full browser matrix, sustained large-library performance, offline end-to-end behavior and external hosting authentication behavior.

The model test is a functional smoke test, not a quality benchmark. Citation existence does not establish correctness.
