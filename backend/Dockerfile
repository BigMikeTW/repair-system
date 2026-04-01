FROM node:20-alpine

WORKDIR /app

# 安裝基本工具
RUN apk add --no-cache postgresql-client wget ca-certificates

# 直接下載 Noto Sans TC 繁體中文字型（.ttf 格式，PDFKit 完全支援）
RUN mkdir -p /app/fonts && \
    wget -q "https://github.com/google/fonts/raw/main/ofl/notosanstc/NotoSansTC-Regular.ttf" \
         -O /app/fonts/NotoSansTC.ttf && \
    echo "Font size: $(wc -c < /app/fonts/NotoSansTC.ttf) bytes" && \
    ls -la /app/fonts/

COPY package*.json ./
RUN npm ci --only=production

COPY . .

RUN mkdir -p uploads backups

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:5000/api/health || exit 1

CMD ["node", "src/index.js"]
