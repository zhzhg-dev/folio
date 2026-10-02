import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { sites } from "./tooling/sites-vite-plugin";
import { cloudPreview } from "./tooling/cloud-preview";
const platform = sites();
const platformWithPreview: Plugin = {
  ...platform,
  configurePreviewServer(server) {
    if (typeof platform.configureServer === "function")
      return platform.configureServer.call(
        this,
        server as unknown as ViteDevServer,
      );
  },
};
export default defineConfig({
  plugins: [platformWithPreview, cloudPreview(), react()],
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  server: { host: "127.0.0.1", port: 5174, strictPort: true },
  build: { target: "es2022", manifest: true, outDir: "dist/client" },
});
