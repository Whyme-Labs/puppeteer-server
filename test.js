const fetch = require('node-fetch');
const fs = require('fs').promises;
require('dotenv').config();

async function testRender() {
    // Configuration
    const url = 'https://puppeteer.wmtech.cc/render'; // Update to your VPS URL if testing remotely
    const apiKey = process.env.API_SECRET; // Get API key from .env file
    const html = `
        <html>
            <body style="font-family: Arial; padding: 20px;">
                <h1>Daily News Report - April 2, 2025</h1>
                <p style="color: #333;">This is a test report generated from HTML.</p>
                <ul>
                    <li>News Item 1: Something happened today.</li>
                    <li>News Item 2: More exciting updates.</li>
                </ul>
            </body>
        </html>
    `;

    // Test both direct image response and R2 storage
    await testDirectImageResponse();
    await testR2Storage();

    async function testDirectImageResponse() {
        try {
            // Send POST request to the server (default behavior, returns image directly)
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'X-API-Key': apiKey,
                    'Content-Type': 'text/html'
                },
                body: html
            });

            // Check response
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Server error: ${response.status} - ${errorText}`);
            }

            // Save the image
            const imageBuffer = await response.buffer(); // Get binary data
            await fs.writeFile('test-report-direct.png', imageBuffer);
            console.log('Image saved as test-report-direct.png');
        } catch (error) {
            console.error('Direct image test failed:', error.message);
        }
    }

    async function testR2Storage() {
        try {
            // Send POST request to the server with R2 storage enabled
            const filename = `test-report-${Date.now()}.png`;
            const response = await fetch(`${url}?save=true&filename=${filename}`, {
                method: 'POST',
                headers: {
                    'X-API-Key': apiKey,
                    'Content-Type': 'text/html'
                },
                body: html
            });

            // Check response
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Server error: ${response.status} - ${errorText}`);
            }

            // Parse JSON response with file URL
            const result = await response.json();
            console.log('R2 Storage Result:', result);
            console.log('Image URL:', result.url);
            console.log('Image filename:', result.filename);
        } catch (error) {
            console.error('R2 storage test failed:', error.message);
        }
    }
}

// Run the test
testRender();