// Bounded, session-only counters. No document text, names or network uploads.
let longTasks = 0;
let longestTask = 0;
let supported = false;
export function startDiagnostics() {
  if (
    typeof PerformanceObserver === "undefined" ||
    !PerformanceObserver.supportedEntryTypes?.includes("longtask")
  )
    return () => {};
  const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      longTasks++;
      longestTask = Math.max(longestTask, Math.round(entry.duration));
    }
  });
  try {
    observer.observe({ type: "longtask", buffered: false });
    supported = true;
  } catch {
    observer.disconnect();
  }
  return () => observer.disconnect();
}
export const sessionDiagnostics = () => ({ supported, longTasks, longestTask });
