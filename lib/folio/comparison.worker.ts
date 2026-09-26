import { searchComparison } from "./comparison-search.ts";
self.onmessage = ({ data }) => {
  try {
    const results = searchComparison(data.project, (completed, total) =>
      self.postMessage({ completed, total }),
    );
    self.postMessage({ results });
  } catch {
    self.postMessage({ error: true });
  }
};
