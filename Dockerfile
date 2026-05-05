# Minimal Docker image for bertcryptoSite
FROM node:22-alpine

WORKDIR /app

# Install deps
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# App source
COPY server.js ./
COPY syd ./syd
COPY public ./public

# Data folder (mounted in VPS)
RUN mkdir -p ./data

ENV PORT=5177
EXPOSE 5177

CMD ["node", "server.js"]
