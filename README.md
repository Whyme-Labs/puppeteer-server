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
```

**Configure R2 environment variables:**

Update the `PuppeteerContainer` class in `src/index.ts` to pass R2 credentials to the container:

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

First deployment takes several minutes for container provisioning. Subsequent deploys are faster due to cached image layers.

**Instance configuration:**

The default setup uses `standard-1` instances (1/2 vCPU, 4 GiB RAM, 8 GB disk). Adjust in `wrangler.jsonc`:

```jsonc
"instance_type": "standard-2"  // 1 vCPU, 6 GiB RAM for heavier workloads
```

**Cold starts:** Containers sleep after 30 seconds of inactivity (`sleepAfter` in `src/index.ts`). Cold starts take 2-3 seconds plus Chromium initialization. Increase `sleepAfter` to reduce cold starts at higher cost.

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

By default, the server renders with a width dynamically calculated to fit the content and captures the full page height.

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
