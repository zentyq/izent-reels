# Izent Reels — Coolify / Docker production image
# Stack: TanStack Start (Vite + Nitro node-server) + Prisma + Postgres
FROM node:22-slim

# System deps for yt-dlp audio/video extract + fluent-ffmpeg merges
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    ffmpeg \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy lockfile first for better layer caching when possible
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY setup-ytdlp.js ./

# Install deps (runs postinstall: prisma generate + yt-dlp download)
RUN npm ci

# App source
COPY . .

# Production build (TanStack Start → .output)
ENV NODE_ENV=production
RUN npm run build

# Runtime
ENV PORT=8080
ENV HOST=0.0.0.0
ENV NITRO_HOST=0.0.0.0
ENV NITRO_PORT=8080
EXPOSE 8080

# Persist generated media between restarts (mount a volume at /app/uploads in Coolify)
RUN mkdir -p /app/uploads

# prisma db push then Nitro node server
CMD ["npm", "run", "start"]
