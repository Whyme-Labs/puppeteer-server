# AWS SDK v3 Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace end-of-life `aws-sdk` v2 with `@aws-sdk/client-s3` v3 and make the R2 public URL configurable via environment variable.

**Architecture:** Single-file change to `index.js` swapping the S3 client API. The v3 SDK uses a modular `S3Client` + `PutObjectCommand` pattern instead of v2's chained `.upload().promise()`. `R2_PUBLIC_URL` env var replaces the hardcoded domain.

**Tech Stack:** `@aws-sdk/client-s3` v3, Node.js/Express, Cloudflare R2

---

### Task 1: Swap aws-sdk v2 for @aws-sdk/client-s3 v3

**Files:**
- Modify: `index.js` (lines 1-116)
- Modify: `package.json`

**Step 1: Uninstall v2, install v3**

```bash
npm uninstall aws-sdk
npm install @aws-sdk/client-s3
```

Expected: `package.json` dependencies updated, `aws-sdk` removed, `@aws-sdk/client-s3` added.

**Step 2: Update `index.js` — replace the S3 setup block**

Replace lines 1-18 (the require and S3 client setup):

```js
const express = require('express');
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const { execSync } = require('child_process');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const app = express();
const port = 3000;

// Configure S3 client for Cloudflare R2
const s3 = new S3Client({
    endpoint: process.env.R2_ENDPOINT || 'https://your-account.r2.cloudflarestorage.com',
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    },
    region: 'auto',
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'your-bucket-name';
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || '';
```

**Step 3: Update `uploadToR2` function**

Replace the existing `uploadToR2` function (lines 90-116) with:

```js
// Function to upload to Cloudflare R2
async function uploadToR2(buffer, filename) {
    const actualFilename = filename || `report-${Date.now()}.png`;

    const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: actualFilename,
        Body: buffer,
        ContentType: 'image/png',
    });

    try {
        await s3.send(command);
        const url = R2_PUBLIC_URL
            ? `${R2_PUBLIC_URL}/${actualFilename}`
            : actualFilename;
        console.log(`File uploaded successfully: ${url}`);
        return { success: true, url, key: actualFilename };
    } catch (error) {
        console.error('Error uploading to R2:', error);
        return { success: false, error: error.message };
    }
}
```

**Step 4: Verify the app starts without errors**

Run: `node -e "require('./index.js')" 2>&1 | head -5`
Expected: Server starts, no `require` errors (may show "Looking for Chrome executable...")
Stop with Ctrl+C after confirming startup.

**Step 5: Commit**

```bash
git add index.js package.json package-lock.json
git commit -m "feat: migrate from aws-sdk v2 to @aws-sdk/client-s3 v3"
```

---

### Task 2: Add R2_PUBLIC_URL to all config locations

**Files:**
- Modify: `src/index.ts` (envVars block, lines 14-20)
- Modify: `.env.example`
- Modify: `docker-compose.yaml`
- Modify: `README.md`

**Step 1: Add `R2_PUBLIC_URL` to `src/index.ts` envVars**

In the `PuppeteerContainer` class, add `R2_PUBLIC_URL` to the `envVars` object:

```typescript
  envVars = {
    CLOUDFLARE_DEPLOYMENT_ID: "1",
    R2_ACCESS_KEY_ID: "396435a4492d9bea305fadd2f72dbcfc",
    R2_SECRET_ACCESS_KEY: "ce0776f0392f7ff99087ccf829b2e0cd2c4a8751e8cf38ce4c833cc3db1ad59c",
    R2_ENDPOINT: "https://1e0170aaabc90ecf5f466128d1f0466a.r2.cloudflarestorage.com",
    R2_BUCKET_NAME: "daily-news-reportroot",
    R2_PUBLIC_URL: "https://bucket.puppeteer.wmtech.cc",
  };
```

**Step 2: Add `R2_PUBLIC_URL` to `.env.example`**

Add after `R2_BUCKET_NAME=`:

```
R2_PUBLIC_URL=https://your-public-bucket-domain.com
```

**Step 3: Add `R2_PUBLIC_URL` to `docker-compose.yaml`**

In the `environment` block, add:

```yaml
      - R2_PUBLIC_URL=${R2_PUBLIC_URL}
```

**Step 4: Update `README.md` env var table**

Add row to the environment variables table:

```markdown
| `R2_PUBLIC_URL` | Public base URL for R2 bucket (e.g. `https://bucket.example.com`) | `src/index.ts` envVars (CF) / `.env` (Docker) |
```

**Step 5: Commit**

```bash
git add src/index.ts .env.example docker-compose.yaml README.md
git commit -m "feat: add R2_PUBLIC_URL env var to replace hardcoded bucket domain"
```

---

### Task 3: Deploy and verify

**Step 1: Deploy to Cloudflare**

```bash
npx wrangler deploy
```

Expected: Build uses cached layers (fast), deploys successfully, prints worker URL.

**Step 2: Test R2 upload via live endpoint**

```bash
curl -s -X POST "https://puppeteer.wmtech.cc/render?save=true" \
  -H "Content-Type: text/html" \
  -H "X-API-Key: 930563354be63fa09de5f30fed7d1ec3d4aed58f7dcef0bb577c7224a8987d7b" \
  -d "<html><body><h1>SDK v3 test</h1></body></html>"
```

Expected: JSON response with `success: true` and a URL starting with `https://bucket.puppeteer.wmtech.cc/`

**Step 3: Test direct render still works**

```bash
curl -s -o /tmp/v3-test.png -w "%{http_code}" -X POST "https://puppeteer.wmtech.cc/render" \
  -H "Content-Type: text/html" \
  -H "X-API-Key: 930563354be63fa09de5f30fed7d1ec3d4aed58f7dcef0bb577c7224a8987d7b" \
  -d "<html><body><h1>Direct render test</h1></body></html>"
```

Expected: `200`, `/tmp/v3-test.png` is a valid PNG.

**Step 4: Push**

```bash
git push
```
