import {
  searchWorkspace,
  type SearchDocument,
  type SearchKind,
} from "./workspace-search";
let documents: SearchDocument[] = [];
self.onmessage = (
  event: MessageEvent<{
    documents?: SearchDocument[];
    id?: number;
    query?: string;
    kind?: SearchKind | "all";
  }>,
) => {
  if (event.data.documents) {
    documents = event.data.documents;
    self.postMessage({ ready: true });
    return;
  }
  const { id, query = "", kind = "all" } = event.data;
  self.postMessage({ id, ...searchWorkspace(documents, query, kind) });
};
