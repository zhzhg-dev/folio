// Coalesce pending edits while one write is in flight. Older writes must never
// display "saved" over a newer unsaved draft.
export function createAutosave<T>(
  write: (value: T) => Promise<void>,
  notify: (state: "saving" | "saved" | "error", error?: unknown) => void,
  delay = 450,
) {
  let pending: { value: T; revision: number } | undefined;
  let latest = 0;
  let running = false;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = async () => {
    clearTimeout(timer);
    if (running || disposed || !pending) return;
    running = true;
    try {
      while (pending && !disposed) {
        const job = pending;
        pending = undefined;
        try {
          await write(job.value);
          if (!disposed && job.revision === latest) notify("saved");
        } catch (error) {
          if (!disposed && job.revision === latest) notify("error", error);
        }
      }
    } finally {
      running = false;
    }
  };
  return {
    schedule(value: T) {
      if (disposed) return;
      pending = { value, revision: ++latest };
      notify("saving");
      clearTimeout(timer);
      timer = setTimeout(() => void flush(), delay);
    },
    flush,
    dispose() {
      disposed = true;
      clearTimeout(timer);
      pending = undefined;
    },
  };
}
