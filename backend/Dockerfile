FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache postgresql-client wget ca-certificates curl

# ── 字型下載：依序嘗試多個來源，任一成功即可 ──────────────────
RUN mkdir -p /app/fonts && \
    echo "[FONT] Trying jsDelivr..." && \
    curl -fsSL "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notosanstc/NotoSansTC-Regular.ttf" \
         -o /app/fonts/NotoSansTC.ttf 2>/dev/null && \
    echo "[FONT] jsDelivr OK" || \
    ( echo "[FONT] Trying statically.io..." && \
      curl -fsSL "https://cdn.statically.io/gh/google/fonts/main/ofl/notosanstc/NotoSansTC-Regular.ttf" \
           -o /app/fonts/NotoSansTC.ttf 2>/dev/null && \
      echo "[FONT] statically.io OK" ) || \
    ( echo "[FONT] Trying raw.githack.com..." && \
      curl -fsSL "https://rawcdn.githack.com/google/fonts/main/ofl/notosanstc/NotoSansTC-Regular.ttf" \
           -o /app/fonts/NotoSansTC.ttf 2>/dev/null && \
      echo "[FONT] githack OK" ) || \
    ( echo "[FONT] All CDNs failed!" && exit 1 ) && \
    echo "[FONT] Final size: $(wc -c < /app/fonts/NotoSansTC.ttf) bytes" && \
    ls -lh /app/fonts/

COPY package*.json ./
RUN npm ci --only=production

COPY . .

RUN mkdir -p uploads backups

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:5000/api/health || exit 1

CMD ["node", "src/index.js"]
