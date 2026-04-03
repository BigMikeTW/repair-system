FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache postgresql-client wget ca-certificates

# ── 字型：直接從 repo 內建，不依賴外部網路 ───────────────────
RUN mkdir -p /app/fonts
COPY fonts/NotoSansTC.ttf /app/fonts/NotoSansTC.ttf

COPY package*.json ./
RUN npm ci --only=production

COPY . .

RUN mkdir -p uploads backups

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:5000/api/health || exit 1

CMD ["node", "src/index.js"]
