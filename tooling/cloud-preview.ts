import type { Plugin } from "vite";
import { Readable } from "node:stream";
import { localCloud } from "../scripts/local-cloud.mjs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

export function cloudPreview(): Plugin {
  const configure = async (
    server: Pick<import("vite").ViteDevServer, "httpServer" | "middlewares">,
    load: () => Promise<(request: Request, env: unknown) => Promise<Response>>,
  ) => {
    const env = await localCloud(true);
    server.httpServer?.once("close", () => {
      void env.dispose();
    });
    server.middlewares.use(async (req, res, next) => {
      if (!req.url?.startsWith("/api/cloud/")) return next();
      try {
        // sites() runs before this middleware and supplies loopback-only mock
        // identity. Never forward an arbitrary host or remote request here.
        const host = req.headers.host || "";
        if (
          !/^(127\.0\.0\.1|localhost):\d+$/.test(host) ||
          !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
            req.socket.remoteAddress || "",
          )
        ) {
          res.statusCode = 403;
          res.end();
          return;
        }
        const headers = new Headers();
        for (const [name, value] of Object.entries(req.headers))
          if (typeof value === "string") headers.set(name, value);
        const handleCloud = await load();
        const request = new Request(`http://${host}${req.url}`, {
          method: req.method,
          headers,
          ...(req.method === "POST"
            ? { body: Readable.toWeb(req), duplex: "half" }
            : {}),
        } as RequestInit);
        const response: Response = await handleCloud(request, env);
        res.statusCode = response.status;
        response.headers.forEach((value, name) => res.setHeader(name, value));
        if (response.body) Readable.fromWeb(response.body as never).pipe(res);
        else res.end();
      } catch {
        res.statusCode = 503;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "unavailable" }));
      }
    });
  };
  return {
    name: "folio-local-cloud",
    apply: "serve",
    configureServer(server) {
      return configure(
        server,
        async () =>
          (await server.ssrLoadModule("/server/cloud.ts")).handleCloud,
      );
    },
    configurePreviewServer(server) {
      return configure(
        server,
        async () =>
          (await import(pathToFileURL(resolve("dist/server/index.js")).href))
            .default.fetch,
      );
    },
  };
}
