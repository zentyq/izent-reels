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

# Install deps (postinstall: prisma generate + yt-dlp). yt-dlp download is best-effort.
RUN npm ci \
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
CMD ["npm", "run", "start"]
