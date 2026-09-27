import type { Project } from "./model";
import { assembleWorkspace } from "./storage-shape.ts";

// No schema upgrades, migrations, writes or seeded examples on the rescue path.
export function readSavedProjects(
  factory: IDBFactory = indexedDB,
  name = "folio-workspace",
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
      request = factory.open(name);
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
        const stores =
          db.objectStoreNames.contains("projects") &&
          db.objectStoreNames.contains("sources")
            ? ["workspaces", "projects", "sources"]
            : "workspaces";
        const transaction = db.transaction(stores, "readonly");
        const row = transaction.objectStore("workspaces").get("main");
        row.onerror = () => finish(undefined, row.error);
        transaction.onabort = () =>
          finish(
            undefined,
            transaction.error || new Error("Local read interrupted"),
          );
        row.onsuccess = () => {
          if (row.result?.manifest) {
            try {
              const normalized = transaction;
              const projectRows = normalized.objectStore("projects").getAll();
              const sourceRows = normalized.objectStore("sources").getAll();
              normalized.onabort = () =>
                finish(
                  undefined,
                  normalized.error || new Error("Local read interrupted"),
                );
              normalized.onerror = () =>
                finish(
                  undefined,
                  normalized.error || new Error("Local read failed"),
                );
              normalized.oncomplete = () => {
                try {
                  finish(
                    assembleWorkspace(
                      row.result.manifest,
                      projectRows.result,
                      sourceRows.result,
                    ).projects,
                  );
                } catch (error) {
                  finish(undefined, error);
                }
              };
            } catch (error) {
              finish(undefined, error);
            }
            return;
          }
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
