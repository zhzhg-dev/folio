# Folio 0.2 verification

Checked on 2026-09-26 with Node.js 24 and the Codex Chromium-based in-app browser on Windows.

## Automated

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

Cross-device WebGPU reliability, English generation quality, broad factual accuracy, semantic entailment, screen-reader audit, full browser matrix, sustained large-library performance, offline end-to-end behavior and external hosting authentication behavior.

The model test is a functional smoke test, not a quality benchmark. Citation existence does not establish correctness.
