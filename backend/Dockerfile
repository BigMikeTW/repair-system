FROM node:20-alpine

WORKDIR /app

# 安裝 PostgreSQL client、字型工具及 Noto CJK 字型
RUN apk add --no-cache postgresql-client fontconfig font-noto-cjk

# 找出可用的 CJK 字型並複製到 /tmp/CJK.otf 供 PDFKit 使用
RUN FONT=$(find /usr/share/fonts -name "NotoSansCJK*.otf" -o -name "NotoSansCJK*.ttf" 2>/dev/null | head -1) && \
    if [ -n "$FONT" ]; then cp "$FONT" /tmp/CJK.otf && echo "Font copied: $FONT"; \
    else echo "Noto CJK not found, trying other paths" && \
         find /usr/share/fonts -name "*.otf" | grep -i "cjk\|noto\|han" | head -1 | xargs -I{} cp {} /tmp/CJK.otf || true; fi && \
    ls -la /tmp/CJK.otf 2>/dev/null || echo "WARNING: No CJK font available"

COPY package*.json ./
RUN npm ci --only=production

COPY . .

RUN mkdir -p uploads backups

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:5000/api/health || exit 1

CMD ["node", "src/index.js"]
