import { Container, getRandom } from "@cloudflare/containers";

interface Env {
  PUPPETEER_CONTAINER: DurableObjectNamespace;
  API_SECRET: string;
}

export class PuppeteerContainer extends Container {
  defaultPort = 3000;
  sleepAfter = "30s";

  // Signal to Express app that auth is handled by the Worker
  // R2 credentials: replace placeholders with your actual values
  envVars = {
    CLOUDFLARE_DEPLOYMENT_ID: "1",
    R2_ACCESS_KEY_ID: "396435a4492d9bea305fadd2f72dbcfc",
    R2_SECRET_ACCESS_KEY: "ce0776f0392f7ff99087ccf829b2e0cd2c4a8751e8cf38ce4c833cc3db1ad59c",
    R2_ENDPOINT: "https://1e0170aaabc90ecf5f466128d1f0466a.r2.cloudflarestorage.com",
    R2_BUCKET_NAME: "daily-news-reportroot",
  };

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
