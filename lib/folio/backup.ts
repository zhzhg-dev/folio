import type { Project, SourceVersion } from "./model.ts";
export type BackupOptions = {
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number) => void;
};

// Shared recovery format: sequential, bounded reads instead of loading every
// original file into memory at once. The UI performs this work in a worker.
export async function buildBackupBlob(
  project: Project,
  options: BackupOptions = {},
) {
  const total = project.sources.reduce(
    (sum, source) =>
      sum +
      source.versions.reduce(
        (n, version) => n + (version.original?.size || 0),
        0,
      ),
    0,
  );
  let completed = 0;
  const sources = [];
  for (const source of project.sources) {
    const versions: (Omit<SourceVersion, "original"> & {
      originalBase64?: string;
    })[] = [];
    for (const version of source.versions) {
      options.signal?.throwIfAborted();
      const { original, ...rest } = version;
      const chunks: string[] = [];
      if (original) {
        // Every non-final chunk is divisible by three, so base64 concatenates.
        for (let offset = 0; offset < original.size; offset += 196608) {
          options.signal?.throwIfAborted();
          const bytes = new Uint8Array(
            await original.slice(offset, offset + 196608).arrayBuffer(),
          );
          let binary = "";
          for (let i = 0; i < bytes.length; i += 8192)
            binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
          chunks.push(btoa(binary));
          completed += bytes.length;
          options.onProgress?.(completed, total);
        }
      }
      versions.push({
        ...rest,
        originalBase64: original ? chunks.join("") : undefined,
      });
    }
    sources.push({ ...source, versions });
  }
  options.signal?.throwIfAborted();
  return new Blob(
    [
      JSON.stringify({
        format: "folio-project",
        schemaVersion: 1,
        project: { ...project, sources },
      }),
    ],
    { type: "application/json" },
  );
}
