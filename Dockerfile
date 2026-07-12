# ==========================================
# STAGE 1: Build the React Frontend
# ==========================================
FROM node:22-slim AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ==========================================
# STAGE 2: Setup the Unified Backend Production Container
# ==========================================
FROM node:22-slim

# 1. Install system dependencies (FFmpeg & Python for yt-dlp)
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 2. Install the absolute latest yt-dlp binary globally
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app/backend

# 3. Install backend node packages
COPY backend/package*.json ./
RUN npm install

# 4. Copy backend source code
COPY backend/ ./

# 5. Bring over the compiled static React files from Stage 1 into the backend
COPY --from=frontend-builder /app/frontend/dist ./public

# 6. Render dynamically provisions a port, usually 10000
EXPOSE 10000

CMD ["npm", "start"]
