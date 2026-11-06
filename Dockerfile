# ใช้ deploy ขึ้น Railway / Render / Fly.io ได้ (ต้องเป็นโฮสต์ที่รัน WebSocket ค้างได้)
FROM node:22-slim

# yt-dlp (+ ตัวช่วยแก้ JS challenge ของ YouTube) ต้องการ python
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-pip ca-certificates \
 && pip3 install --no-cache-dir --break-system-packages "yt-dlp[default]" \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production PORT=3001 CACHE_DIR=/tmp/music-cache
EXPOSE 3001
CMD ["node", "server/index.js"]
