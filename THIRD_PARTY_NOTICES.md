# Third-party software

Folio's MIT license does not replace third-party licenses.

- npm dependencies retain their package licenses and authorship notices. The lockfile records exact installed versions.
- `public/pdf.worker.min.mjs` comes from `pdfjs-dist`. PDF.js uses Apache-2.0; its included license notice must be retained.
- UI primitives and `vendor/shadcn-tailwind-4.13.0.css` derive from the starter's Shadcn integration and retain their upstream terms.
- WebLLM / MLC and downloaded Qwen assets have their own software and model licenses. Weights are downloaded only when local AI is enabled, and are not included in the repository.
- Demo prose is fictional content created for this application.
- Geist, Newsreader, and Noto Sans SC are bundled through Fontsource under the SIL Open Font License 1.1. Their license and attribution files are included in `public/licenses/` and copied into production builds.

Include all required upstream notices when redistributing a compiled application or bundling model assets.
