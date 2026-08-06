FROM node:22-slim

# Install necessary system dependencies for yt-dlp and fluent-ffmpeg
# We need python3 for yt-dlp, ffmpeg for merging, and curl to download yt-dlp
RUN apt-get update && apt-get install -y \
    python3 \
    ffmpeg \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy EVERYTHING first so that package postinstall scripts
# (like Prisma generate and setup-ytdlp.js) have access to the files they need
COPY . .

# Install npm dependencies (this will automatically run postinstall scripts)
RUN npm ci

# Build the TanStack Start application
RUN npm run build

# Expose the port (TanStack Start defaults to 8080 or 3000)
ENV PORT=8080
EXPOSE 8080

# Start the server using the command defined in package.json
CMD ["npm", "run", "start"]
