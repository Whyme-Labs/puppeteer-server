# Cloudflare Containers Migration Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deploy the existing Puppeteer server to Cloudflare Containers while keeping the Docker Compose deployment option for VPS.

**Architecture:** A Cloudflare Worker handles auth and routing, forwarding valid requests to a Container running the Express + Chromium app. The Worker validates `X-API-Key` and handles `/health` directly, avoiding unnecessary container wake-ups. The container is stateless and load-balanced via `getRandom`.

**Tech Stack:** TypeScript (Worker), Node.js/Express (Container), Cloudflare Workers + `@cloudflare/containers`, Wrangler CLI, Docker

---

### Task 1: Initialize Cloudflare Worker project files

**Files:**
- Create: `src/index.ts`
- Create: `wrangler.jsonc`
- Create: `tsconfig.json`

**Step 1: Create `wrangler.jsonc`**

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "puppeteer-server",
  "main": "src/index.ts",
  "compatibility_date": "2025-04-01",
  "containers": [
    {
      "class_name": "PuppeteerContainer",
      "image": "./Dockerfile",
      "instance_type": "standard-1",
      "max_instances": 5
    }
  ],
  "durable_objects": {
    "bindings": [
      {
        "name": "PUPPETEER_CONTAINER",
        "class_name": "PuppeteerContainer"
      }
    ]
  },
  "migrations": [
    {
      "tag": "v1",
      "new_sqlite_classes": ["PuppeteerContainer"]
    }
  ]
}
```

**Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "es2021",
    "module": "es2022",
    "moduleResolution": "bundler",
    "lib": ["es2021"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"]
}
```

**Step 3: Create `src/index.ts`**

This is the Worker that handles auth and routes to the container:

```typescript
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
```

**Step 4: Install Worker dependencies**

Run: `npm install --save-dev @cloudflare/containers @cloudflare/workers-types wrangler`
Expected: packages installed successfully

**Step 5: Commit**

```bash
git add src/index.ts wrangler.jsonc tsconfig.json package.json package-lock.json
git commit -m "feat: add Cloudflare Containers Worker and config"
```

---

### Task 2: Update Dockerfile for Cloudflare Containers compatibility

**Files:**
- Modify: `Dockerfile`

The existing Dockerfile uses `node:22-alpine` which is `linux/amd64` compatible. We need to:
1. Ensure it builds for `linux/amd64` explicitly
2. Remove the `HEALTHCHECK` directive (Cloudflare manages container health via port readiness)

**Step 1: Update `Dockerfile`**

The Dockerfile should look like this:

```dockerfile
FROM --platform=linux/amd64 node:22-alpine

# Copy installation script
COPY install-chromium.sh /install-chromium.sh
RUN chmod +x /install-chromium.sh

# Run the installation script
RUN sh /install-chromium.sh

# Tell Puppeteer to skip downloading Chrome
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /app

COPY package.json .

RUN npm install --omit=dev

COPY . .

EXPOSE 3000

CMD ["node", "index.js"]
```

Changes from original:
- Add `--platform=linux/amd64` to FROM
- Change `npm install` to `npm install --omit=dev` (skip dev deps like wrangler in container)
- Remove `HEALTHCHECK` (Cloudflare handles this via port readiness check)

**Step 2: Verify Docker still builds locally**

Run: `docker build -t puppeteer-server-test .`
Expected: Build completes successfully

**Step 3: Commit**

```bash
git add Dockerfile
git commit -m "feat: update Dockerfile for Cloudflare Containers compatibility"
```

---

### Task 3: Remove auth from Express app when running in Cloudflare Container

**Files:**
- Modify: `index.js`

Since auth is now handled by the Worker, the Express app should skip auth when running inside a Cloudflare Container (detected via `CLOUDFLARE_DEPLOYMENT_ID` env var). Keep auth for VPS/Docker Compose deployment.

**Step 1: Update auth middleware in `index.js`**

Replace the `authenticateApiKey` middleware and its usage on the `/render` route:

```javascript
// Middleware to verify API secret (skipped when behind Cloudflare Worker)
const isCloudflareContainer = !!process.env.CLOUDFLARE_DEPLOYMENT_ID;
const authenticateApiKey = (req, res, next) => {
    if (isCloudflareContainer) {
        return next(); // Auth handled by Worker
    }
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== API_SECRET) {
        return res.status(401).send('Access denied: Invalid or missing API key');
    }
    next();
};
```

This keeps the existing auth for Docker Compose / VPS deployments and skips it when running inside Cloudflare Containers.

**Step 2: Verify Express app still works locally**

Run: `node index.js` (with `API_SECRET` set)
Test: `curl -X POST http://localhost:3000/render -H "Content-Type: text/html" -H "X-API-Key: test" -d "<h1>Test</h1>" --output /dev/null -w "%{http_code}"`
Expected: 200 (or 500 if no Chromium locally, which is fine)

**Step 3: Commit**

```bash
git add index.js
git commit -m "feat: skip auth in Express when running behind Cloudflare Worker"
```

---

### Task 4: Add `.env.example` entries and update `wrangler.jsonc` with secrets reference

**Files:**
- Modify: `.env.example`

**Step 1: Update `.env.example` with Cloudflare-specific notes**

```
# Common
API_SECRET=

# Cloudflare R2 (used by container directly)
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_ENDPOINT=
R2_BUCKET_NAME=

# Cloudflare Containers (set via `wrangler secret put`)
# API_SECRET — set as Worker secret: wrangler secret put API_SECRET
```

**Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: update .env.example with Cloudflare Containers notes"
```

---

### Task 5: Add a `.dockerignore` to keep the container image small

**Files:**
- Create: `.dockerignore`

**Step 1: Create `.dockerignore`**

```
node_modules
.git
.env
*.md
docs/
test.js
test-report*.png
scp.sh
src/
wrangler.jsonc
tsconfig.json
```

This prevents Worker source, docs, test files, and node_modules from bloating the container image.

**Step 2: Commit**

```bash
git add .dockerignore
git commit -m "feat: add .dockerignore for smaller container images"
```

---

### Task 6: Update README.md with both deployment methods

**Files:**
- Modify: `README.md`

**Step 1: Rewrite README.md**

Add a "Deployment" section covering both methods. Keep existing API docs. Add Cloudflare Containers section with:
- Prerequisites (Workers Paid plan, Docker, Wrangler CLI)
- Configuration steps (`wrangler secret put API_SECRET`, container env vars)
- Deploy command (`wrangler deploy`)
- Architecture diagram (text-based)
- Note about cold starts and `sleepAfter`

The full README content:

````markdown
# Puppeteer Server

A lightweight server that renders HTML content to images using Puppeteer and optionally uploads them to Cloudflare R2 storage.

## Features

- Convert HTML to PNG images
- Customizable image dimensions
- API key authentication
- Rate limiting protection
- Optional image upload to Cloudflare R2
- Two deployment options: Docker (VPS) or Cloudflare Containers

## Architecture

### Cloudflare Containers

```
Client -> Cloudflare Worker (auth + routing) -> Container (Express + Chromium)
                                                     |
                                                     v
                                               Cloudflare R2
```

The Worker validates API keys and routes requests. Invalid requests are rejected without waking the container. The container runs the Express app with Chromium for HTML-to-PNG rendering.

### Docker / VPS

```
Client -> Caddy (reverse proxy) -> Docker Container (Express + Chromium)
                                        |
                                        v
                                  Cloudflare R2
```

Traditional deployment with Docker Compose and a Caddy reverse proxy.

## Deployment

### Option 1: Cloudflare Containers

**Prerequisites:**
- [Cloudflare Workers Paid plan](https://developers.cloudflare.com/workers/platform/pricing/)
- Docker (running locally for builds)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)

**Setup:**

```bash
# Install dependencies
npm install

# Set the API secret (used by the Worker for auth)
npx wrangler secret put API_SECRET

# Set R2 credentials (used by the container for uploads)
# These are passed as env vars to the container via wrangler.jsonc
```

**Configure R2 environment variables:**

Edit `wrangler.jsonc` and add your R2 credentials to the container's `envVars` in `src/index.ts`, or use `wrangler secret put` and reference them in the container class.

For quick setup, update the `PuppeteerContainer` class in `src/index.ts`:

```typescript
envVars = {
  R2_ACCESS_KEY_ID: "your-key",
  R2_SECRET_ACCESS_KEY: "your-secret",
  R2_ENDPOINT: "https://your-account.r2.cloudflarestorage.com",
  R2_BUCKET_NAME: "your-bucket",
};
```

**Deploy:**

```bash
npx wrangler deploy
```

> Note: First deployment takes several minutes for container provisioning. Subsequent deploys are faster due to cached image layers.

**Instance configuration:**

The default setup uses `standard-1` instances (1/2 vCPU, 4 GiB RAM, 8 GB disk). Adjust in `wrangler.jsonc`:

```jsonc
"instance_type": "standard-2"  // 1 vCPU, 6 GiB RAM for heavier workloads
```

**Cold starts:** Containers sleep after 30 seconds of inactivity. Cold starts take 2-3 seconds plus Chromium initialization. Adjust `sleepAfter` in `src/index.ts` to balance cost vs latency.

### Option 2: Docker (VPS)

**Prerequisites:**
- Docker and Docker Compose
- A reverse proxy (e.g., Caddy)

**Setup:**

```bash
# Clone and configure
cp .env.example .env
# Edit .env with your secrets

# Start the service
docker compose up -d
```

The `docker-compose.yaml` connects to a `caddy` network for reverse proxying.

## Usage

### Rendering HTML to Image

```bash
curl -X POST https://your-domain/render \
  -H "Content-Type: text/html" \
  -H "X-API-Key: your-secret-key" \
  -d "<html><body><h1>Hello World!</h1></body></html>" \
  --output image.png
```

### Customizing Image Dimensions

```bash
# Specify width only (full page height)
curl -X POST "https://your-domain/render?width=800" \
  -H "Content-Type: text/html" \
  -H "X-API-Key: your-secret-key" \
  -d "<html><body><h1>Hello</h1></body></html>" \
  --output image.png

# Specify both width and height
curl -X POST "https://your-domain/render?width=800&height=600" \
  -H "Content-Type: text/html" \
  -H "X-API-Key: your-secret-key" \
  -d "<html><body><h1>Fixed Size</h1></body></html>" \
  --output image.png
```

### Saving to Cloudflare R2

```bash
curl -X POST "https://your-domain/render?save=true" \
  -H "Content-Type: text/html" \
  -H "X-API-Key: your-secret-key" \
  -d "<html><body><h1>Hello World!</h1></body></html>"
```

Response:
```json
{
  "success": true,
  "message": "Image rendered and uploaded to R2",
  "url": "https://bucket.puppeteer.wmtech.cc/report-1234567890.png",
  "filename": "report-1234567890.png"
}
```

## API Reference

### POST /render

Renders HTML content to a PNG image.

**Headers:**
- `Content-Type: text/html` - Required
- `X-API-Key` - Required, your API secret
- `X-Width` - Optional, image width in pixels
- `X-Height` - Optional, image height in pixels
- `X-Filename` - Optional, custom filename when saving to R2
- `X-Save-To-R2` - Optional, set to "true" to save to R2

**Query Parameters:**
- `width` - Optional, image width in pixels
- `height` - Optional, image height in pixels
- `filename` - Optional, custom filename when saving to R2
- `save` - Optional, set to "true" to save to R2

**Response:**
- PNG image (when not saving to R2)
- JSON object with URL (when saving to R2)

### GET /health

Health check endpoint. Returns "OK".

## Environment Variables

| Variable | Description | Used By |
|----------|-------------|---------|
| `API_SECRET` | Secret key for API authentication | Worker (CF) / Express (VPS) |
| `R2_ENDPOINT` | Cloudflare R2 endpoint | Container / Express |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 access key ID | Container / Express |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 secret access key | Container / Express |
| `R2_BUCKET_NAME` | Cloudflare R2 bucket name | Container / Express |
| `PUPPETEER_EXECUTABLE_PATH` | Custom path to Chromium executable | Container / Express |

## License

[MIT](LICENSE)
````

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: update README with Cloudflare Containers deployment guide"
```

---

### Task 7: Test the full deployment

**Step 1: Verify Docker Compose still works**

Run: `docker compose build`
Expected: Builds successfully

**Step 2: Deploy to Cloudflare**

Run: `npx wrangler deploy`
Expected: Worker and container image deployed. Wait a few minutes for provisioning.

**Step 3: Test the deployed endpoint**

Run: `curl -X POST https://puppeteer-server.<your-subdomain>.workers.dev/render -H "Content-Type: text/html" -H "X-API-Key: your-secret" -d "<h1>Test</h1>" --output test-cf.png`
Expected: PNG image returned

**Step 4: Test auth rejection**

Run: `curl -X POST https://puppeteer-server.<your-subdomain>.workers.dev/render -H "Content-Type: text/html" -d "<h1>Test</h1>" -w "%{http_code}"`
Expected: 401

**Step 5: Test health endpoint**

Run: `curl https://puppeteer-server.<your-subdomain>.workers.dev/health`
Expected: "OK"
