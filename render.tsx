import React, { Component } from "react";
import { createRoot } from "react-dom/client";
import Home from "./app/page";
import "@fontsource-variable/geist";
import "@fontsource-variable/noto-sans-sc";
import "./app/globals.css";
import "./app/atelier.css";
import "./app/research.css";
import "./app/comparison.css";
import "./app/notebook.css";
import "./app/cloud.css";
import "./app/organization.css";

class WorkspaceBoundary extends Component<
  { children: React.ReactNode; onFailure: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFailure();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function renderWorkspace(
  root: HTMLElement,
  events: { onReady: () => void; onFailure: () => void },
) {
  const view = createRoot(root);
  view.render(
    <WorkspaceBoundary onFailure={events.onFailure}>
      <Home onReady={events.onReady} onFailure={events.onFailure} />
    </WorkspaceBoundary>,
  );
  return () => view.unmount();
}
