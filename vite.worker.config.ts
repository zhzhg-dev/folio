import { defineConfig } from "vite";
export default defineConfig({
  build: {
    target: "es2022",
    ssr: "server/index.ts",
    outDir: "dist/server",
    emptyOutDir: true,
    minify: true,
    rollupOptions: { output: { entryFileNames: "index.js" } },
  },
});
