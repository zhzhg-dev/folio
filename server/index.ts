import { handleCloud, type CloudEnv } from "./cloud.ts";
export default {
  async fetch(
    request: Request,
    env: CloudEnv & { ASSETS: { fetch(request: Request): Promise<Response> } },
  ) {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/api/")) return handleCloud(request, env);
    // Authentication routes are owned by Sites dispatch, never the application.
    if (
      ["/signin-with-chatgpt", "/signout-with-chatgpt", "/callback"].includes(
        path,
      )
    )
      return new Response("Authentication is provided by Sites", {
        status: 404,
      });
    return env.ASSETS.fetch(request);
  },
};
