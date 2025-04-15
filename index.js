const express = require('express');
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const { execSync } = require('child_process');
const app = express();
const port = 3000;
const AWS = require('aws-sdk');

// Configure S3 client for Cloudflare R2
const s3 = new AWS.S3({
    endpoint: process.env.R2_ENDPOINT || 'https://your-account.r2.cloudflarestorage.com',
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    signatureVersion: 'v4',
    region: 'auto' // Cloudflare R2 uses 'auto' as the region
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'your-bucket-name';

// Set trust proxy to specific IPs or subnets that we trust (e.g., our load balancer)
// For Caddy, we can use "loopback" since it's typically on the same host or in the same Docker network
app.set('trust proxy', 'loopback');

app.use(express.text({ type: 'text/html' }));
const rateLimit = require('express-rate-limit');
// Configure rate limiter with trust proxy handling
app.use(rateLimit({ 
    windowMs: 15 * 60 * 1000, 
    max: 1000, 
    standardHeaders: true, 
    legacyHeaders: false,
    // Specify which headers to use for rate limiting
    keyGenerator: (req) => {
        // Use X-Forwarded-For from trusted proxies or fallback to IP
        return req.ip;
    }
}));

// API secret from environment variable (set in Docker Compose)
const API_SECRET = process.env.API_SECRET || 'default-secret-please-change-me';

// Middleware to verify API secret
const authenticateApiKey = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || apiKey !== API_SECRET) {
        return res.status(401).send('Access denied: Invalid or missing API key');
    }
    next();
};

// Find Chromium executable
function findChromiumPath() {
    // Check environment variable first
    if (process.env.PUPPETEER_EXECUTABLE_PATH && fs.existsSync(process.env.PUPPETEER_EXECUTABLE_PATH)) {
        console.log(`Using Chromium from env var: ${process.env.PUPPETEER_EXECUTABLE_PATH}`);
        return process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    // Common locations for Chromium in Alpine
    const possiblePaths = [
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/usr/lib/chromium/chromium'
    ];

    for (const path of possiblePaths) {
        if (fs.existsSync(path)) {
            console.log(`Found Chromium at: ${path}`);
            return path;
        }
    }

    // Last resort: try to find it using find command
    try {
        console.log('Searching for Chromium binaries...');
        const foundPaths = execSync('find / -name "chromium*" -type f 2>/dev/null | grep -v .xml | grep -v .png').toString().trim().split('\n');
        if (foundPaths && foundPaths.length > 0 && foundPaths[0]) {
            console.log(`Found Chromium using find: ${foundPaths[0]}`);
            return foundPaths[0];
        }
    } catch (error) {
        console.log('Error searching for Chromium:', error.message);
    }

    console.error('No Chromium executable found!');
    return null;
}

// Function to upload to Cloudflare R2
async function uploadToR2(buffer, filename) {
    // Generate a unique filename if none is provided
    const actualFilename = filename || `report-${Date.now()}.png`;
    
    const params = {
        Bucket: BUCKET_NAME,
        Key: actualFilename,
        Body: buffer,
        ContentType: 'image/png'
    };
    
    try {
        const result = await s3.upload(params).promise();
        console.log(`File uploaded successfully to ${result.Location}`);
        return {
            success: true,
            url: `https://bucket.puppeteer.wmtech.cc/${actualFilename}`,
            key: actualFilename
        };
    } catch (error) {
        console.error('Error uploading to R2:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// Function to extract HTML from markdown code blocks
function extractHtmlFromMarkdown(text) {
    // Check if the text contains code blocks
    const codeBlockRegex = /```(?:html)?\s*([\s\S]*?)```/;
    const match = text.match(codeBlockRegex);
    
    if (match && match[1]) {
        // Return the content inside the code block
        return match[1].trim();
    }
    
    // If no code block is found, return the original text
    return text;
}

// Render endpoint
app.post('/render', authenticateApiKey, async (req, res) => {
    try {
        let html = req.body;
        if (!html) return res.status(400).send('No HTML content provided');
        
        // Extract HTML from markdown code blocks if present
        html = extractHtmlFromMarkdown(html);
        
        // Get optional filename from query params or headers
        const filename = req.query.filename || req.headers['x-filename'] || null;
        const saveToR2 = req.query.save === 'true' || req.headers['x-save-to-r2'] === 'true';
        
        // Get optional width and height from query params or headers
        const widthParam = req.query.width || req.headers['x-width'];
        const heightParam = req.query.height || req.headers['x-height'];

        let targetWidth = null;
        let targetHeight = null;
        let useFullPage = true; // Default to capturing full page height

        // Validate provided width
        if (widthParam) {
            targetWidth = parseInt(widthParam, 10);
            if (isNaN(targetWidth) || targetWidth <= 0) {
                return res.status(400).send('Invalid width. Must be a positive number.');
            }
        }

        // Validate provided height
        if (heightParam) {
            targetHeight = parseInt(heightParam, 10);
            if (isNaN(targetHeight) || targetHeight <= 0) {
                return res.status(400).send('Invalid height. Must be a positive number.');
            }
            useFullPage = false; // If height is provided, don't use fullPage
        }

        // Get Chromium path
        const chromiumPath = findChromiumPath();
        if (!chromiumPath) {
            return res.status(500).send('Chromium browser not found. Cannot render HTML.');
        }
        
        console.log(`Launching browser with executablePath: ${chromiumPath}`);
        
        // Use the Chromium installed in the container
        const browser = await puppeteer.launch({
            headless: 'new',
            executablePath: chromiumPath,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        });
        
        console.log('Browser launched successfully');
        const page = await browser.newPage();
        
        // Load the content first
        await page.setContent(html, { waitUntil: 'networkidle0' });

        // Determine final width: use param if provided, else calculate dynamically
        if (!targetWidth) {
            const dimensions = await page.evaluate(() => ({
                width: document.body.scrollWidth
            }));
            targetWidth = dimensions.width;
        }

        // Set viewport: Use calculated/provided width. Height is either provided or a minimal default (1) if using fullPage.
        await page.setViewport({ 
            width: targetWidth,
            height: targetHeight || 1 // Use provided height or 1 if capturing full page
        }); 

        // Configure screenshot options
        const screenshotOptions = { 
            type: 'png',
            fullPage: useFullPage
        };

        // If a specific height was provided, don't use fullPage
        if (targetHeight) {
            delete screenshotOptions.fullPage; 
            // Optionally clip to the specified dimensions if needed, though setViewport handles this
            // screenshotOptions.clip = { x: 0, y: 0, width: targetWidth, height: targetHeight };
        }

        // Capture the page based on determined options
        const imageBuffer = await page.screenshot(screenshotOptions);
        await browser.close();

        // Upload to R2 if requested
        if (saveToR2) {
            const uploadResult = await uploadToR2(imageBuffer, filename);
            if (uploadResult.success) {
                return res.json({
                    success: true,
                    message: 'Image rendered and uploaded to R2',
                    url: uploadResult.url,
                    filename: uploadResult.key
                });
            } else {
                return res.status(500).json({
                    success: false,
                    message: 'Failed to upload to R2',
                    error: uploadResult.error
                });
            }
        }

        // Otherwise just return the image
        res.set('Content-Type', 'image/png');
        res.send(imageBuffer);
    } catch (error) {
        console.error('Error rendering image:', error);
        // Log more detailed error
        if (error.stack) {
            console.error(error.stack);
        }
        res.status(500).send(`Internal server error: ${error.message}`);
    }
});

app.get('/health', (req, res) => {
    res.send('OK');
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
    console.log('Looking for Chrome executable...');
    findChromiumPath();
});