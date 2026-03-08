import { Container, getRandom } from "@cloudflare/containers";

interface Env {
  PUPPETEER_CONTAINER: DurableObjectNamespace;
  API_SECRET: string;
}

export class PuppeteerContainer extends Container {
  defaultPort = 3000;
  sleepAfter = "30s";

  override onStart() {
    console.log("Puppeteer container started");
  }

  override onStop() {
    console.log("Puppeteer container stopped");
  }

  override onError(error: unknown) {
    console.error("Puppeteer container error:", error);
    throw error;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Health check — no container needed
    if (url.pathname === "/health") {
      return new Response("OK");
    }

    // Only /render is supported
    if (url.pathname !== "/render") {
      return new Response("Not found", { status: 404 });
    }

    // Only POST allowed
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    // Auth check — reject before waking container
    const apiKey = request.headers.get("x-api-key");
    if (!apiKey || apiKey !== env.API_SECRET) {
      return new Response("Access denied: Invalid or missing API key", {
        status: 401,
      });
    }

    // Route to a random container instance (load balanced across 2)
    const container = await getRandom(env.PUPPETEER_CONTAINER, 2);
    return container.fetch(request);
  },
};
