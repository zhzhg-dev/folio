import { buildBackupBlob } from "./backup";
import type { Project } from "./model";
self.onmessage = async (event: MessageEvent<Project>) => {
  try {
    const blob = await buildBackupBlob(event.data, {
      onProgress: (completed, total) =>
        self.postMessage({ type: "progress", completed, total }),
    });
    self.postMessage({ type: "done", blob });
  } catch {
    self.postMessage({ type: "error" });
  }
};
