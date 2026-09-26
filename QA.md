# Folio 0.3 verification

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
