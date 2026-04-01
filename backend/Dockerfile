FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache postgresql-client wget ca-certificates

RUN mkdir -p /app/fonts && \
    wget -q "https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/notosanstc/NotoSansTC-Regular.ttf" \
         -O /app/fonts/NotoSansTC.ttf && \
    echo "[FONT] OK: $(wc -c < /app/fonts/NotoSansTC.ttf) bytes"

COPY package*.json ./
RUN npm ci --only=production

COPY . .

RUN mkdir -p uploads backups

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:5000/api/health || exit 1

CMD ["node", "src/index.js"]
