# Folio

## New in 0.8

- **Manage projects:** search, favorites, recent ordering, rename, archive and Trash in a separate dialog. Restore retains sources, findings and history. Trash is local, never automatically emptied, and has no permanent-delete control in this release.
- **Incremental local saves:** separate project and source records. Editing a note no longer rewrites unchanged sources or other projects. Legacy data migrates atomically; a failed migration leaves the old schema and data intact. Concurrent windows cannot silently overwrite a newer revision.
- **Recovery and diagnostics:** safe-start recovery reads both schemas. Backups from Trash restore into a new active project. Settings show site storage usage, an optional browser persistence request, save write counts and bounded session-only long-task counters. None are uploaded.
- **Task cleanup:** closing a backup dialog cancels its worker. Closed import dialogs cannot apply late results to another project. Project switching preserves the saved page.

Keep an independent backup before upgrading or changing browsers. After migration, 0.7 and earlier cannot open the new schema; use the current recovery tools rather than downgrading. All projects still load into memory at startup; source updates still rewrite that source's complete history. Native downloads in the embedded browser and the original host-freeze root cause remain unresolved. See [verification](QA.md).


**Keep the source. Own the writing.**

A local-first research workspace for comparing options and writing evidence-backed decision briefs. Keep original passages close to your findings, distinguish facts from judgments, and revisit conclusions as sources change.

[简体中文](README.zh-CN.md) · [Verification](QA.md) · [MIT license](LICENSE)

Folio opens in English. Switch between **English / 中文** in the top bar on desktop and mobile; your preference is remembered. Changing the interface language never translates or overwrites your writing.

> **0.8 working preview.** Questions, findings, source evidence and briefs now share one research workflow. On-device AI is experimental; cloud sync, collaboration, and OCR are not implemented.

## New in 0.7

- **A research notebook:** start with your own objective, add questions, and keep up to 200 findings across 30 questions. New installations start blank; the optional, clearly labeled fictional sample demonstrates the complete workflow.
- **Evidence within reach:** one expanded finding at a time, exact source revision/page, your own note, and separate source counts and review states. Open the reader without leaving the question; closing it restores keyboard focus and keeps scroll position.
- **From research to a brief:** selected passages can be kept as findings. Add an individual finding with its citations, note and review status to the editable brief. A pre-insertion snapshot and Undo insertion preserve the earlier draft. Inserting does not claim that a finding was verified.
- **Review stays honest:** editing a note or claim clears its manual review. New source revisions flag affected findings. Missing evidence can remain a draft; an invalid citation cannot be inserted. Backups validate and preserve the entire notebook.
- **A lighter interface:** pale lime accents, a white working surface, Research / Sources / Brief navigation, contextual tools, and a single sans-serif system with 24/16/14/12px type roles. Compare options, revision history and source review remain under More tools.

Existing saved projects, content and source revisions are preserved. A legacy comparison can be read as findings; editing this notebook creates a separate snapshot rather than updating the comparison matrix. Briefs are also snapshots, so later note or evidence edits do not silently rewrite them. The optional model and PDF canvas still require explicit activation.

## New in 0.6

- **Find evidence for all:** search every option's linked sources in one cancellable task. Each column reuses its source index; each cell gets up to three original candidate passages. Customize **Search terms** under a criterion when its name is too broad.
- **Review queue:** filter source updates, unchecked findings, gaps or reviewed items. **Start review → Save & next** takes you through the selected unfinished findings without reopening the table each time.
- **Review revisions:** see the saved quote beside a preview of the current page. An unchanged quote can be explicitly moved to the current revision; changed passages require choosing replacement evidence. Review marks always require a separate manual check.
- **Safer restoration:** backup parsing, document validation and original-file checksums run in a cancellable worker. Canceling or closing the dialog cannot add a partially restored project. Long original pages expand in 20,000-character steps.

Batch candidates are temporary and are cleared when leaving the comparison or changing its search inputs. They never overwrite findings, become reviewed automatically, or enter a brief without being attached. Search uses the latest source revisions, an 8-million-character batch limit and a 60-second deadline; backup restore has a 120-second deadline. Core workflows need no paid API or hosted database.

## New in 0.5

- **Compare & decide:** define an objective and constraints, compare up to 6 options across 12 criteria, and link each option to its sources.
- Record facts, personal judgments or unanswered questions. Attach exact passages by searching linked sources or selecting text from the latest original. Review marks are manual and reset after editing a finding or its meaning.
- New source revisions flag affected findings conservatively, including unchanged quotes; users choose when to replace their evidence. The comparison never silently rewrites conclusions.
- Build an editable decision brief with a comparison table, versioned citations, recommendation and open questions. It appends to the document and saves a pre-insertion snapshot. The brief is a snapshot, not a live-synced document.
- Backups retain the comparison and review marks. Markdown tables and reference appendices preserve all distinct quoted passages. Pending autosaves coalesce instead of accumulating stale writes.
- Downloads offer a **Save file** link and, where supported, **Save as…**. JSON backups up to 2 MiB also support **Copy backup text**; paste it into Preferences & backups → Restore from backup text. Copying is not a durable backup until you save the text elsewhere.
- In 0.5–0.6, new installations opened the comparison sample. Version 0.7 starts with an empty notebook. Use **New project → Explore a complete research sample** for the optional demo.

The comparison workflow is human-led: it does not automatically extract all cells, verify semantic truth, rank options or conduct web research. The browser download manager remains unverified in the embedded host; the original freeze incident is still open. See [QA](QA.md).

## New in 0.4

- An evidence ledger groups passages by source and retains your own review checkmarks in backups.
- A compact project guide connects collecting, asking, reviewing, writing and backup.
- Search runs in a cancellable worker with a 15-second deadline. Long histories render 12 recent questions, with earlier questions available on demand.
- Bilingual retrieval uses concept coverage to decline weak matches. See the [development evaluation](EVALUATION.md) and [bilingual walkthrough](WALKTHROUGH.md).
- Exports now offer an explicit **Save file** link after preparation; creating a file is not confirmation that the browser saved it.

## Start locally

Requires Node.js 22.13+; Node.js 24 is recommended.

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:5174`. The application needs no account or API key.

```sh
npm run typecheck
npm test
npm run build
npm start
```

`npm start` previews the production build. Deploy `dist/` to an HTTPS static host at the site root. `.openai/hosting.json` belongs to this project's existing Sites deployment; configure your own host when forking. The development server listens on localhost only.

## What you can do

- **Ask your sources.** Use a dedicated research desk with source selection, saved questions and responses, and optional follow-up context. Find exact passages without a model, or enable on-device AI for a cited answer. Empty retrieval and model-declared insufficient evidence produce an explicit no-answer state.
- **Check original PDF pages.** Open a citation at its source revision and page, inspect highlighted text lines, zoom, and navigate pages. The extracted text remains available alongside the original. Resume your last reading page later.
- **Bring selected passages into writing.** Choose individual answer paragraphs and append them with versioned citations. Undo the insertion while the document is unchanged; the automatic snapshot remains available after further editing.

- **Read and write in one place.** Import text PDFs, Markdown, TXT, or pasted text. Organize projects, edit rich text, navigate an outline, and enter focus mode.
- **Keep evidence attached.** Citations retain the exact source revision, quote, and page or paragraph. Open the original evidence from the document.
- **Review changes deliberately.** Updating a source preserves earlier revisions and your writing. Review stale citations and replace their evidence individually.
- **Recover earlier work.** Save and restore snapshots. Folio also saves a snapshot before adopting an AI draft, replacing evidence, or restoring a document.
- **Take your work with you.** Export Word, Markdown, HTML, or print. JSON project backups include original files, source history, and snapshots.
- **Try local AI.** Optionally run Qwen3 through WebLLM in a Web Worker on a compatible WebGPU device. Review and select a generated answer before appending it. If the model identifies conflicting sources, their positions keep separate citations.

The interface uses one primary working surface, contextual evidence, responsive navigation, self-hosted Geist, and Noto Sans SC for Chinese. It supports reduced motion and keyboard navigation. Production builds include an offline app shell and a PWA manifest. Browsers supporting WebMCP can list and open projects without exposing document contents through that interface.

## Try the evidence workflow

1. Create a project and import or paste a source.
2. Write a note, select a passage in the source panel, and insert a citation.
3. Save a document snapshot.
4. Upload a revised version of the same source and open **Source review**.
5. Compare the retained quote, choose new evidence, and verify that your own writing remains intact.
6. Export the document or a project backup. Restoring a backup creates a separate project.

The starter document and its sources are **fictional demonstration material**, not market research or factual evidence.

## Your data and running costs

Documents, original source files, and history stay in IndexedDB in the current browser. Folio has no document backend, telemetry, or cloud upload. Data is separate for each browser and site address. **Export a backup before clearing browser storage, moving to another address, or changing devices.** Local storage is not encrypted storage and does not replace backups.

Core features make no paid API calls. Local AI needs an initial model download and consumes your device's memory, GPU resources, and storage. Model hosts receive ordinary download requests; your source text is not sent to them for inference. Hardware compatibility and download availability vary.

Normal startup caches the small application shell sequentially. Optional PDF, AI and font resources are cached as used, rather than downloaded all at once. Offline use requires the relevant resources to have been cached. Safe startup does not register an offline worker. Private preview authentication and the first visit still require a connection.

### Startup and recovery (0.3.2)

The recovery page can list and export saved projects without importing the workspace, editor, PDF reader or AI. It uses read-only local storage access and the same `.folio.json` format as the normal export. Each export runs in a worker, reads original files sequentially and can be canceled. Nothing is uploaded or removed. Startup requests that do not become ready within 15 seconds, and caught render failures, return to recovery; a late import cannot reopen the failed workspace. This guard needs a responsive JavaScript event loop and cannot recover a frozen browser process.

Local AI now has explicit **Cancel setup** and **Turn off AI** controls. Stopping terminates its worker and rejects the pending task. Leaving the research view, hiding the page, or 2 minutes of idle time releases the model. Setup has a 5-minute limit and answers a 2-minute limit. Your question and previous answers remain saved; downloaded model files are not intentionally cleared. Re-enable AI to use it again.

Development priorities and acceptance gates are recorded in [ROADMAP.md](ROADMAP.md): reliability/recovery, evidence quality, then first-use and distribution. The reported client freeze remains unresolved pending controlled performance investigation.

The first visit after this update, or a visit following an interrupted session, pauses on a lightweight recovery page before importing the workspace. Use `?safe=1` to request that page explicitly. Opening safely pauses optional browser integrations and new offline-worker registration for that session. Saved documents are not removed. An additional tab can also trigger this precautionary screen.

Saved reading positions remain available through Resume reading, but do not open a PDF during startup. Original PDF previews require a click and can be closed to free resources. The renderer uses stable container measurements and bounded canvas allocations.

This release addresses risky startup/rendering paths after a reported desktop-client hang. Automated checks validate the guards; the original host freeze has not been reproduced or confirmed resolved. Do not treat the patch as evidence of a diagnosed root cause.

## Current limits

- 20 MB per file; up to 300 PDF pages and 20 sources per project; original files plus source history are limited to 80 MB per project.
- PDF highlights identify matching text items on a rendered page. Scanned-document OCR and complex-layout/rotated-text accuracy are not established. The reader falls back to extracted text when a quote cannot be located visually.
- Retrieval uses paragraph-aware chunks, BM25-style term ranking, Chinese bigrams, source diversity, and a small bilingual term dictionary. It returns up to six passages within a 2,400-character budget. It is lexical retrieval, not general multilingual semantic search or full-project reasoning.
- Follow-ups can reuse the previous question when it contains a reference such as “it” or “these”. Earlier generated answers are not treated as source evidence.
- Citation checks verify that a revision and quote exist. They do not prove that a claim follows from the evidence. Review generated writing before adopting it.
- AI appends reviewed drafts; it does not automatically replace or publish your document.
- No cloud synchronization, collaborative editing, native mobile app, or scheduled source monitoring.
- Large JSON backups temporarily increase memory usage. Broad device, accessibility, offline, and model-quality testing remain to be done.

## Architecture

```text
app/                       App entry and visual styles
components/folio/          Editor, sources, history, review, assistant
components/ui/             Shared interface primitives
lib/folio/model.ts         Projects, immutable revisions, citations, snapshots
lib/folio/preferences.ts   Safe default-language and demo migration
lib/folio/storage.ts       IndexedDB and save-conflict detection
lib/folio/integrity.ts     Citation and document validation
lib/folio/files.ts         Import, export, and backup validation
lib/folio/ai.ts            Local retrieval and structured generation
lib/folio/retrieval.ts     Bilingual lexical ranking and exact passage slices
lib/folio/research.ts      Research history, answer and citation validation
tests/                     Integrity, export, and migration tests
scripts/create-offline.mjs Offline app-shell generation
```

Built with React 19, TypeScript, Vite, Tiptap, Dexie, PDF.js, WebLLM, and Radix primitives. The static architecture keeps core data on the user's device and avoids an application-server bill.

## Development

Run the checks above before opening a pull request. GitHub Actions runs type checking, tests, and the production build. See [QA.md](QA.md) for the scope of verification and outstanding checks.

The next priorities are broader bilingual retrieval evaluation, reliable AI across real devices, OCR and complex PDF layouts, then installation and browser compatibility. Contributions that improve an existing workflow are welcome.

## License

Folio application code is MIT licensed. Dependencies, fonts, and model weights retain their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
