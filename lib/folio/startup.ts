// This module must stay independent of the workspace, storage database and AI.
export const STARTUP_KEY = "folio-startup-session";
const ACK_KEY = "folio-startup-protection-v1";
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function startupSession(
  storage: StorageLike,
  id: string,
  requested = false,
) {
  let failed = false;
  let needsRecovery = requested;
  let firstVisit = false;
  try {
    const interrupted = !!storage.getItem(STARTUP_KEY);
    firstVisit = !requested && !interrupted && storage.getItem(ACK_KEY) !== "1";
    needsRecovery ||= interrupted || firstVisit;
  } catch {
    needsRecovery = true;
  }
  return {
    needsRecovery,
    firstVisit,
    start() {
      failed = false;
      try {
        storage.setItem(STARTUP_KEY, id);
        storage.setItem(ACK_KEY, "1");
      } catch {
        /* Private browsing may disable localStorage. */
      }
    },
    failed() {
      failed = true;
    },
    finish() {
      if (failed) return;
      try {
        if (storage.getItem(STARTUP_KEY) === id)
          storage.removeItem(STARTUP_KEY);
      } catch {
        /* Never block closing the page. */
      }
    },
  };
}
