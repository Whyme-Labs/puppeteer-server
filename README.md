# Puppeteer Server

A lightweight server that renders HTML content to images using Puppeteer and optionally uploads them to Cloudflare R2 storage.

## Features

- 🖼️ Convert HTML to PNG images
- 📏 Customizable image dimensions
- 🔐 API key authentication
- 🛡️ Rate limiting protection
- ☁️ Optional image upload to Cloudflare R2
- 🐳 Docker-ready

## Installation

### Prerequisites

- Node.js 14+
- Chromium/Chrome browser

### Standard Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/puppeteer-server.git
cd puppeteer-server

# Install dependencies
npm install

# Set environment variables (see Environment Variables section)
export API_SECRET=your-secret-key

# Start the server
npm start
```

### Docker Installation

```bash
# Build the Docker image
docker build -t puppeteer-server .

# Run the container
docker run -p 3000:3000 -e API_SECRET=your-secret-key puppeteer-server
```

## Usage

### Rendering HTML to Image

```bash
curl -X POST http://localhost:3000/render \
  -H "Content-Type: text/html" \
  -H "X-API-Key: your-secret-key" \
  -d "<html><body><h1>Hello World!</h1></body></html>" \
  --output image.png
```

### Customizing Image Dimensions

By default, the server will render the image with a width dynamically calculated to fit the content and the full height of the content.

You can override this behavior by providing `width` and/or `height` parameters:

- Provide only `width`: The image will use the specified width and capture the full height.
- Provide only `height`: The image will use the specified height and calculate the width dynamically to fit the content.
- Provide both `width` and `height`: The image will be rendered with the exact dimensions specified.

```bash
# Specify only width (height will be full page)
curl -X POST "http://localhost:3000/render?width=800" \
  -H "Content-Type: text/html" \
  -H "X-API-Key: your-secret-key" \
  -d "<html><body><h1>This width will adjust automatically</h1></body></html>" \
  --output image.png

# Specify only height (width will be dynamic)
curl -X POST "http://localhost:3000/render?height=600" \
  -H "Content-Type: text/html" \
  -H "X-API-Key: your-secret-key" \
  -d "<html><body><h1>This width will adjust automatically</h1></body></html>" \
  --output image.png

# Specify both width and height
curl -X POST "http://localhost:3000/render?width=800&height=600" \
  -H "Content-Type: text/html" \
  -H "X-API-Key: your-secret-key" \
  -d "<html><body><h1>Fixed Size</h1></body></html>" \
  --output image.png

# Let the server determine both width and height dynamically
curl -X POST http://localhost:3000/render \
  -H "Content-Type: text/html" \
  -H "X-API-Key: your-secret-key" \
  -d "<html><body><h1>Hello World!</h1></body></html>" \
  --output image.png
```

### Saving to Cloudflare R2

```bash
curl -X POST "http://localhost:3000/render?save=true" \
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

By default, captures the full height of the content and dynamically determines the required width based on the content. This behavior can be overridden using the optional `width` and `height` parameters.

**Headers:**
- `Content-Type: text/html` - Required
- `X-API-Key` - Required, your API secret
- `X-Width` - Optional, overrides dynamic width calculation.
- `X-Height` - Optional, overrides full page height capture.
- `X-Filename` - Optional, custom filename when saving to R2
- `X-Save-To-R2` - Optional, set to "true" to save to R2

**Query Parameters:**
- `width` - Optional, overrides dynamic width calculation.
- `height` - Optional, overrides full page height capture.
- `filename` - Optional, custom filename when saving to R2
- `save` - Optional, set to "true" to save to R2

**Request Body:**
- HTML content to render

**Response:**
- PNG image (when not saving to R2)
- JSON object (when saving to R2)

### GET /health

Health check endpoint.

**Response:**
- "OK" - Server is healthy

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `API_SECRET` | Secret key for API authentication | default-secret-please-change-me |
| `R2_ENDPOINT` | Cloudflare R2 endpoint | https://your-account.r2.cloudflarestorage.com |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 access key ID | - |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 secret access key | - |
| `R2_BUCKET_NAME` | Cloudflare R2 bucket name | your-bucket-name |
| `PUPPETEER_EXECUTABLE_PATH` | Custom path to Chromium executable | - |

## License

[MIT](LICENSE)
