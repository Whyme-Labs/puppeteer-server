FROM node:22-alpine

# Copy installation script
COPY install-chromium.sh /install-chromium.sh
RUN chmod +x /install-chromium.sh

# Run the installation script
RUN sh /install-chromium.sh

# Tell Puppeteer to skip downloading Chrome
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /app

COPY package.json .

RUN npm install

COPY . .

EXPOSE 3000

# Simple health check to ensure chromium is still available
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
  CMD node -e "console.log('Checking chromium file:'); require('fs').existsSync('/usr/bin/chromium') ? process.exit(0) : process.exit(1);"

CMD ["node", "index.js"]