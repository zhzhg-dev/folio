import type { Project } from "./model";

// No schema upgrades, migrations, writes or seeded examples on the rescue path.
export function readSavedProjects(
  factory: IDBFactory = indexedDB,
): Promise<Project[]> {
  return new Promise((resolve, reject) => {
    let db: IDBDatabase | undefined;
    let finished = false;
    const finish = (projects?: Project[], error?: unknown) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      db?.close();
      if (error) reject(error);
      else resolve(projects || []);
    };
    const timer = setTimeout(
      () => finish(undefined, new Error("Local storage did not respond")),
      10_000,
    );
    let request: IDBOpenDBRequest;
    try {
      request = factory.open("folio-workspace");
    } catch (error) {
      finish(undefined, error);
      return;
    }
    request.onupgradeneeded = () => {
      request.transaction?.abort();
      finish([]);
    };
    request.onerror = () =>
      finish(
        undefined,
        request.error || new Error("Local storage unavailable"),
      );
    request.onblocked = () =>
      finish(undefined, new Error("Another tab is blocking local storage"));
    request.onsuccess = () => {
      db = request.result;
      if (finished) {
        db.close();
        return;
      }
      if (!db.objectStoreNames.contains("workspaces")) {
        finish([]);
        return;
      }
      try {
        const transaction = db.transaction("workspaces", "readonly");
        const row = transaction.objectStore("workspaces").get("main");
        row.onerror = () => finish(undefined, row.error);
        transaction.onabort = () =>
          finish(
            undefined,
            transaction.error || new Error("Local read interrupted"),
          );
        row.onsuccess = () => {
          const projects = row.result?.data?.projects;
          if (projects === undefined) {
            finish([]);
            return;
          }
          if (
            !Array.isArray(projects) ||
            projects.some(
              (p) =>
                !p ||
                typeof p.id !== "string" ||
                typeof p.name !== "string" ||
                !Array.isArray(p.sources),
            )
          ) {
            finish(
              undefined,
              new Error("Saved project index could not be read"),
            );
            return;
          }
          finish(projects);
        };
      } catch (error) {
        finish(undefined, error);
      }
    };
  });
}
