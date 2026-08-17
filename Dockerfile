# Izent Reels — Coolify / Docker production image
# Stack: TanStack Start (Vite + Nitro node-server) + Prisma + Postgres
FROM node:22-slim

# System deps: openssl (Prisma), ffmpeg/yt-dlp tooling
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    python3 \
    ffmpeg \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dummy URL so prisma generate never blocks on missing DATABASE_URL
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build"

# Copy lockfile first for better layer caching when possible
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY setup-ytdlp.js ./

# Coolify may inject NODE_ENV=production at build time, which would skip
# vite/typescript (devDependencies). Always install them for the image build.
RUN npm ci --include=dev \
 && if [ ! -x ./yt-dlp ]; then curl -fsSL -o yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp || true; fi \
 && if [ -f ./yt-dlp ]; then chmod +x yt-dlp; fi

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
# Keep the container alive briefly on crash so Coolify logs remain readable.
CMD ["sh", "-c", "npm run start || (echo START_FAILED; sleep 3600)"]
