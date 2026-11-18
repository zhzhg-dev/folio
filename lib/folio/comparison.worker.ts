import { searchComparison, searchComparisonCell } from "./comparison-search.ts";
self.onmessage = ({ data }) => {
  try {
    const results = data.cell
      ? [searchComparisonCell(data.project, data.cell.address, data.cell.query)]
      : searchComparison(data.project, (completed, total) =>
          self.postMessage({ completed, total }),
        );
    self.postMessage({ results });
  } catch {
    self.postMessage({ error: true });
  }
};
