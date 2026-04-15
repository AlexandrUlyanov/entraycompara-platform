FROM node:22-alpine

WORKDIR /app

# Copy compiled production assets (identical to GCS compiled/)
COPY compiled/ ./dist/

# Copy server files from source.zip
COPY server/package.json ./package.json
COPY server/server.js ./server.js
COPY server/public/ ./public/

# Install server dependencies (express, etc.)
RUN npm install

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
