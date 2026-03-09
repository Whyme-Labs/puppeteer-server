FROM --platform=linux/amd64 node:22-alpine

# Copy installation script
COPY install-chromium.sh /install-chromium.sh
RUN chmod +x /install-chromium.sh

# Run the installation script
RUN sh /install-chromium.sh

# Tell Puppeteer to skip downloading Chrome
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --omit=dev

COPY . .

EXPOSE 3000
CMD ["node", "index.js"]