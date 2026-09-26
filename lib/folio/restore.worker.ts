import { restoreBackup } from "./backup-restore.ts";
self.onmessage = async ({ data }) => {
  try {
    self.postMessage({ project: await restoreBackup(data.file) });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : "Invalid backup",
    });
  }
};
