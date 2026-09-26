import { findPassages } from "./research.ts";
self.onmessage = ({ data }) => {
  try {
    self.postMessage({
      turn: findPassages(
        data.project,
        data.question,
        data.ids,
        data.previousQuestion,
      ),
    });
  } catch {
    self.postMessage({ error: true });
  }
};
