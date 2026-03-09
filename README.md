# Puppeteer Server

A lightweight server that renders HTML content to images using Puppeteer and uploads them to Cloudflare R2 storage.

**Live endpoint:** `https://puppeteer.wmtech.cc`

## Features

- Convert HTML to PNG images
- Customizable image dimensions
- API key authentication
- Rate limiting protection
- Optional image upload to Cloudflare R2
- Deployed on Cloudflare Containers (global edge, scale-to-zero)

## Architecture

```
Client -> Cloudflare Worker (auth + routing) -> Container (Express + Chromium)
                                                     |
                                                     v
                                               Cloudflare R2
```

The Worker validates API keys and routes requests. Invalid requests are rejected without waking the container. The container runs the Express app with Chromium for HTML-to-PNG rendering. Containers sleep after 30 seconds of inactivity (scale-to-zero).

## Deployment

### Cloudflare Containers (primary)

**Prerequisites:**
- [Cloudflare Workers Paid plan](https://developers.cloudflare.com/workers/platform/pricing/)
- Docker (running locally for builds)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)

**Setup:**

```bash
# Install dependencies
npm install

# Set the API secret (Worker secret — not stored in source code)
npx wrangler secret put API_SECRET

# Configure R2 credentials in src/index.ts (envVars on PuppeteerContainer)
# Then deploy:
npx wrangler deploy
```

First deployment takes several minutes for container provisioning. Subsequent deploys are faster due to cached image layers.

**Instance:** `standard-1` (1/2 vCPU, 4 GiB RAM, 8 GB disk). Adjust `instance_type` in `wrangler.jsonc` for heavier workloads (`standard-2`: 1 vCPU, 6 GiB RAM).

**Cold starts:** Containers sleep after 30 seconds of inactivity. Cold starts take 2-3 seconds plus Chromium initialization. Adjust `sleepAfter` in `src/index.ts` to trade cost for latency.

### Docker (local / fallback)

```bash
cp .env.example .env
# Edit .env with your secrets
docker compose up -d
```

## Usage

### Rendering HTML to Image

```bash
curl -X POST https://puppeteer.wmtech.cc/render \
  -H "Content-Type: text/html" \
  -H "X-API-Key: your-secret-key" \
  -d "<html><body><h1>Hello World!</h1></body></html>" \
  --output image.png
```

### Customizing Image Dimensions

By default, width is dynamically calculated to fit the content and height captures the full page.

```bash
# Fixed width, full page height
curl -X POST "https://puppeteer.wmtech.cc/render?width=800" \
  -H "Content-Type: text/html" \
  -H "X-API-Key: your-secret-key" \
  -d "<html><body><h1>Hello</h1></body></html>" \
  --output image.png

# Fixed width and height
curl -X POST "https://puppeteer.wmtech.cc/render?width=800&height=600" \
  -H "Content-Type: text/html" \
  -H "X-API-Key: your-secret-key" \
  -d "<html><body><h1>Fixed Size</h1></body></html>" \
  --output image.png
```

### Saving to Cloudflare R2

```bash
curl -X POST "https://puppeteer.wmtech.cc/render?save=true" \
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

Health check endpoint. Returns `OK`.

## Environment Variables

| Variable | Description | Where to set |
|----------|-------------|--------------|
| `API_SECRET` | API key for authentication | `wrangler secret put` (CF) / `.env` (Docker) |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 access key | `src/index.ts` envVars (CF) / `.env` (Docker) |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 secret key | `src/index.ts` envVars (CF) / `.env` (Docker) |
| `R2_ENDPOINT` | Cloudflare R2 endpoint URL | `src/index.ts` envVars (CF) / `.env` (Docker) |
| `R2_BUCKET_NAME` | Cloudflare R2 bucket name | `src/index.ts` envVars (CF) / `.env` (Docker) |
| `PUPPETEER_EXECUTABLE_PATH` | Custom Chromium binary path | Optional |

## License

[MIT](LICENSE)
