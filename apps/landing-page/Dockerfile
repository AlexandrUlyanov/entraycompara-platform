FROM node:22-alpine

WORKDIR /app

# Copy compiled production assets (identical to GCS compiled/)
COPY compiled/ ./dist/

# Ensure static assets (locales and images) are present in dist/
# These are served by express.static and must be in the container
COPY public/image/ ./dist/image/
COPY public/locales/ ./dist/locales/

# Copy server files from source.zip
COPY server/package.json ./package.json
COPY server/server.js ./server.js
COPY server/public/ ./public/

# Install server dependencies (express, etc.)
RUN npm install

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
